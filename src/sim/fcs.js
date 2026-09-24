// Flight control system: fly-by-wire control laws (Airbus normal law, fighter
// g-command law), yaw damper, autopilot / flight director and autothrust.
//
// Inner loops use model-based dynamic inversion of the aircraft's own
// stability derivatives so the same laws work across every airframe.

import { DEG, KT, FT, G0, clamp, lerp, approach, wrapPi } from "./math.js";
import { AB_GATE } from "./fdm.js";
import { tasFromCas } from "./atmosphere.js";

export class FCS {
  constructor(fm) {
    this.fm = fm;
    const s = fm.spec;
    this.law = s.fbw || "direct"; // airbus | fighter | direct
    this.hasAP = !!s.ap;
    this.hasAT = !!s.at;
    this.ydOn = ["narrow", "wide", "bizjet", "regional-tp", "supersonic"].includes(s.cat) || !!s.fbw;
    this.ap = {
      master: false, fd: this.hasAP, at: false,
      lat: "ROL", vert: "PIT", armLoc: false, armGs: false, altArm: false,
      hdg: 0, alt: 3000 * FT, vs: 0, spd: s.vref ? Math.max(s.vref + 60, 120) : 100, mach: 0.78, useMach: false,
      thrMode: "SPEED", bank: s.cat === "ga" || s.cat === "prop-twin" ? 20 : 25,
    };
    this.cmd = { theta: 0, phi: 0 };
    this.gammaRef = 0;
    this.phiRef = 0;
    this.iq = 0;
    this.ip = 0;
    this.iat = 0;
    this.flare = null;
    this.alphaFloor = false;
    this.airborneT = 10;
    this.lastPilotPitch = 0;
    this.lastPilotRoll = 0;
    this.messages = [];
  }

  // -------------------------------------------------------------- inversion helpers
  /** Elevator command that yields pitch acceleration qdotDes. */
  elevForQdot(qdotDes) {
    const fm = this.fm, d = fm.d, s = fm.spec, c = fm.ctl;
    const V = Math.max(fm.telemetry.tas || 1, 20);
    const qbar = 0.5 * fm.atm.rho * V * V;
    const qh = (fm.w[1] * s.c) / (2 * V);
    const CmRest = d.Cm0 + d.Cma * fm.alpha + d.Cmq * qh - 0.05 * c.flapPos;
    const need = (qdotDes * fm.I[1]) / (qbar * s.S * s.c);
    return (need - CmRest) / d.Cmde;
  }
  ailForPdot(pdotDes) {
    const fm = this.fm, d = fm.d, s = fm.spec, c = fm.ctl;
    const V = Math.max(fm.telemetry.tas || 1, 20);
    const qbar = 0.5 * fm.atm.rho * V * V;
    const ph = (fm.w[0] * s.b) / (2 * V), rh = (fm.w[2] * s.b) / (2 * V);
    const ClRest = d.Clb * fm.beta + d.Clp * ph + d.Clr * rh + d.Cldr * (c.rud + c.rudTrim);
    const need = (pdotDes * fm.I[0]) / (qbar * s.S * s.b);
    return (need - ClRest) / d.Clda;
  }
  rudForRdot(rdotDes) {
    const fm = this.fm, d = fm.d, s = fm.spec;
    const V = Math.max(fm.telemetry.tas || 1, 20);
    const qbar = 0.5 * fm.atm.rho * V * V;
    const ph = (fm.w[0] * s.b) / (2 * V), rh = (fm.w[2] * s.b) / (2 * V);
    const CnRest = d.Cnb * fm.beta + d.Cnr * rh + d.Cnp * ph + d.Cnda * fm.ctl.ail;
    const need = (rdotDes * fm.I[2]) / (qbar * s.S * s.b);
    return (need - CnRest) / d.Cndr;
  }

  /** Pitch-rate command -> elevator (with integrator for unmodelled moments). */
  pitchRate(qDes, dt, gain = 2.5) {
    const fm = this.fm;
    const err = qDes - fm.w[1];
    this.iq = clamp(this.iq + err * dt * 0.8, -0.6, 0.6);
    let e = this.elevForQdot(gain * err) + this.iq;
    return clamp(e, -1, 1);
  }
  rollRate(pDes, dt, gain = 3) {
    const fm = this.fm;
    const err = pDes - fm.w[0];
    this.ip = clamp(this.ip + err * dt * 0.5, -0.3, 0.3);
    return clamp(this.ailForPdot(gain * err) + this.ip, -1, 1);
  }
  /** Pitch attitude command -> body pitch rate. */
  thetaToQ(thetaCmd, maxRate = 3 * DEG) {
    const t = this.fm.telemetry;
    const thetaDot = clamp((thetaCmd - t.theta) * 0.9, -maxRate, maxRate);
    const cphi = Math.cos(t.phi);
    // body q that produces thetaDot while turning
    return (thetaDot + t.r * Math.sin(t.phi)) / Math.max(cphi, 0.3);
  }
  phiToP(phiCmd, maxRate = 5 * DEG) {
    const t = this.fm.telemetry;
    return clamp((phiCmd - t.phi) * 1.2, -maxRate, maxRate);
  }

  // -------------------------------------------------------------- main update
  /**
   * @param pilot { pitch, roll, yaw, thr:[..], collective }
   * @param nav   navigation solution from the navigation module (optional)
   */
  update(dt, pilot, nav) {
    const fm = this.fm;
    const c = fm.ctl;
    const t = fm.telemetry;
    const s = fm.spec;
    if (!t || t.tas == null) {
      c.elev = pilot.pitch; c.ail = pilot.roll; c.rud = pilot.yaw;
      c.thr.fill(pilot.thr);
      return;
    }
    if (fm.heli) return this.updateHeli(dt, pilot);

    const ap = this.ap;
    fm.wow ? (this.airborneT = 0) : (this.airborneT += dt);
    const V = Math.max(t.tas, 1);
    const gamma = Math.asin(clamp(t.vs / V, -1, 1));
    this.gamma = gamma;

    // pilot override disconnects AP (force on stick)
    if (ap.master && (Math.abs(pilot.pitch) > 0.5 || Math.abs(pilot.roll) > 0.5)) {
      this.disconnectAP("AP OFF — 조종간 오버라이드");
    }

    // ---------------- autopilot outer loops -> theta/phi commands
    this.computeFD(dt, nav, gamma);

    // ---------------- pitch/roll surfaces
    const lowSpeed = t.cas < 35 || fm.wow;
    let elev, ail;
    if (ap.master && !lowSpeed) {
      elev = this.pitchRate(this.thetaToQ(this.cmd.theta, ap.vert === "FLARE" ? 4 * DEG : 3 * DEG), dt);
      ail = this.rollRate(this.phiToP(this.cmd.phi, 5 * DEG), dt);
      if (this.law === "direct") {
        // trim servo unloads the elevator so disconnects are smooth
        const off = elev - 0;
        c.trim = clamp(c.trim + off * 0.25 * dt, -1, 1);
        elev -= c.trim;
      } else c.trim = 0;
    } else if (this.law !== "direct" && this.airborneT > 3 && t.cas > 60) {
      [elev, ail] = this.fbwLaw(dt, pilot, gamma);
      c.trim = 0;
    } else {
      // direct law (also FBW on ground / takeoff roll)
      elev = pilot.pitch;
      ail = pilot.roll;
      this.iq = 0;
      this.ip = 0;
      this.gammaRef = gamma;
      this.phiRef = t.phi;
      if (this.law !== "direct") c.trim = lerp(c.trim, 0, dt);
    }
    c.elev = clamp(elev, -1, 1);
    c.ail = clamp(ail, -1, 1);

    // ---------------- yaw damper / turn coordination
    let rud = pilot.yaw;
    if ((this.ydOn || ap.master) && !fm.wow && t.cas > 60) {
      const rCoord = (G0 * Math.sin(t.phi) * Math.cos(t.theta)) / V;
      const rdot = 1.5 * (rCoord - t.r) + 0.8 * fm.beta * (V / 50);
      rud = clamp(pilot.yaw + clamp(this.rudForRdot(rdot), -0.3, 0.3), -1, 1);
    }
    if (ap.master && ap.lat === "ROLLOUT" && nav?.loc) {
      rud = clamp(-nav.loc.dev * 0.8 - t.r * 2, -1, 1);
    }
    c.rud = rud;

    // ---------------- thrust
    this.updateThrust(dt, pilot);
  }

  fbwLaw(dt, pilot, gamma) {
    const fm = this.fm;
    const t = fm.telemetry;
    const V = Math.max(t.tas, 20);
    const fighter = this.law === "fighter";
    const aMax = fm.aStall - (fighter ? 0.02 : 0.03);
    const aProt = aMax - 0.04;

    // ---- pitch: load-factor demand
    let qDes;
    const stickP = pilot.pitch;
    const agl = t.agl / FT;
    const cphi = Math.cos(t.phi);
    if (!fighter && agl < 50 && t.vs < 0 && this.airborneT > 5) {
      // flare law: attitude memorised at 50 ft, then gentle nose-down; stick commands pitch rate
      if (!this.flare) this.flare = { theta: t.theta, time: 0 };
      this.flare.time += dt;
      const thT = this.flare.theta - Math.min(this.flare.time / 8, 1) * 2 * DEG;
      qDes = (thT - t.theta) * 1.0 + stickP * 5 * DEG;
    } else {
      if (agl > 100) this.flare = null;
      let nzCmd;
      if (Math.abs(stickP) > 0.03) {
        nzCmd = fighter
          ? 1 + (stickP > 0 ? stickP * 6.5 : stickP * 4)
          : 1 + (stickP > 0 ? stickP * 1.5 : stickP * 2) + (Math.abs(t.phi) < 33 * DEG ? 1 / Math.max(cphi, 0.4) - 1 : 0);
        this.gammaRef = gamma;
      } else {
        nzCmd = fighter
          ? Math.cos(gamma)
          : (Math.cos(gamma) / Math.max(cphi, 0.4)) * (Math.abs(t.phi) < 33 * DEG ? 1 : cphi) + (this.gammaRef - gamma) * V / G0 * 0.8;
      }
      qDes = (G0 * (nzCmd - Math.cos(gamma) * cphi)) / V;
      if (fighter) {
        // closed-loop g tracking
        const nzErr = nzCmd - fm.nz;
        this.inz = clamp((this.inz || 0) + nzErr * dt * 0.8, -2, 2);
        qDes += (G0 / V) * (nzErr * 0.6 + this.inz);
      }
      // pitch attitude protection
      if (!fighter) {
        if (t.theta > 25 * DEG) qDes = Math.min(qDes, (30 * DEG - t.theta) * 0.8);
        if (t.theta < -10 * DEG) qDes = Math.max(qDes, (-15 * DEG - t.theta) * 0.8);
      }
    }
    // alpha protection / limiting
    if (fm.alpha > aProt) {
      const lim = (aMax - fm.alpha) * 2;
      qDes = Math.min(qDes, lim + (stickP > 0 ? 0 : qDes));
      if (!fighter && fm.alpha > aProt) this.alphaFloor = true;
    }
    // high speed protection
    const vmo = (fm.spec.vne || 350) * KT;
    if (!fighter && t.cas > vmo + 6 * KT) qDes = Math.max(qDes, 1.5 * DEG);
    const elev = this.pitchRate(qDes, dt, fighter ? 4 : 2.5);

    // ---- roll: rate command, bank hold, bank protection
    const stickR = pilot.roll;
    let pDes;
    const maxRate = fighter ? 200 * DEG : 15 * DEG;
    if (Math.abs(stickR) > 0.03) {
      pDes = stickR * maxRate;
      this.phiRef = t.phi;
      if (!fighter && Math.abs(t.phi) > 60 * DEG && Math.sign(stickR) === Math.sign(t.phi)) {
        pDes = Math.sign(t.phi) * Math.min(Math.abs(pDes), (67 * DEG - Math.abs(t.phi)) * 1.0);
      }
    } else {
      if (!fighter && Math.abs(this.phiRef) > 33 * DEG) this.phiRef = approach(this.phiRef, Math.sign(this.phiRef) * 33 * DEG, 5 * DEG, dt);
      pDes = clamp((this.phiRef - t.phi) * 1.5, -10 * DEG, 10 * DEG);
    }
    const ail = this.rollRate(pDes, dt, fighter ? 6 : 3);
    return [elev, ail];
  }

  updateThrust(dt, pilot) {
    const fm = this.fm;
    const c = fm.ctl;
    const t = fm.telemetry;
    const ap = this.ap;
    const s = fm.spec;
    const maxThr = s.eng.ab ? AB_GATE : 1;
    // alpha floor -> TOGA
    if (this.alphaFloor && this.hasAT) {
      c.thr.fill(maxThr);
      if (fm.alpha < fm.aStall - 0.1) this.alphaFloor = false;
      return;
    }
    this.alphaFloor = false;
    if (ap.at && this.hasAT && !fm.wow) {
      let thr;
      if (ap.vert === "FLC" || ap.thrMode === "CLB" || ap.thrMode === "IDLE") {
        const climbing = ap.alt > t.alt + 30;
        ap.thrMode = climbing ? "CLB" : "IDLE";
        thr = climbing ? maxThr * 0.92 : 0;
        if (ap.vert !== "FLC") ap.thrMode = "SPEED";
      } else if (ap.vert === "FLARE" && t.agl < 30 * FT) {
        ap.thrMode = "RETARD";
        thr = 0;
      } else {
        ap.thrMode = "SPEED";
        const target = this.speedTargetCas();
        const err = target - t.cas;
        const accel = fm.nx ?? 0;
        this.iat = clamp(this.iat + err * 0.004 * dt, -0.4, 0.4);
        const base = c.thr[0] ?? 0;
        thr = clamp(base + (err * 0.02 - accel * 0.6) * dt + this.iat * dt, 0, maxThr);
      }
      c.thr.fill(clamp(approach(c.thr[0] ?? 0, thr, 0.15, dt), 0, maxThr));
    } else {
      for (let i = 0; i < c.thr.length; i++) c.thr[i] = Array.isArray(pilot.thr) ? pilot.thr[i] ?? pilot.thr[0] : pilot.thr;
    }
  }

  speedTargetCas() {
    const ap = this.ap;
    const fm = this.fm;
    if (ap.useMach) {
      // convert Mach target to CAS at current altitude
      const tas = ap.mach * fm.atm.a;
      const ratio = fm.telemetry.cas / Math.max(fm.telemetry.tas, 1);
      return tas * ratio;
    }
    return ap.spd * KT;
  }

  computeFD(dt, nav, gamma) {
    const fm = this.fm;
    const t = fm.telemetry;
    const ap = this.ap;
    const V = Math.max(t.tas, 20);
    const bankLim = ap.bank * DEG;

    // ---------- lateral
    if (ap.armLoc && nav?.loc && nav.loc.valid && Math.abs(nav.loc.dev) < 1.5) {
      ap.lat = "LOC";
      ap.armLoc = false;
    }
    let phiCmd = 0;
    switch (ap.lat) {
      case "HDG": {
        const err = wrapPi(ap.hdg - t.psi);
        phiCmd = clamp(err * 2.0, -bankLim, bankLim);
        break;
      }
      case "NAV": {
        if (nav?.leg) {
          const xtk = nav.leg.xtk; // m, right of course +
          const intercept = clamp(-xtk / 40 * DEG * 1, -45 * DEG, 45 * DEG);
          const desTrk = nav.leg.course + intercept;
          const err = wrapPi(desTrk - t.trk);
          phiCmd = clamp(err * 2.2, -bankLim, bankLim);
        } else phiCmd = 0;
        break;
      }
      case "LOC":
      case "ROLLOUT": {
        if (nav?.loc?.valid) {
          const dev = nav.loc.dev; // dots, + = aircraft right of course (fly left)
          const intercept = clamp(-dev * 12 * DEG, -30 * DEG, 30 * DEG);
          const err = wrapPi(nav.loc.course + intercept - t.trk);
          phiCmd = clamp(err * 2.0, -bankLim, bankLim);
          if (t.agl < 30 * FT) phiCmd = 0;
        }
        break;
      }
      default: {
        // ROL: hold bank, level wings if small
        if (this.rolRef == null) this.rolRef = Math.abs(t.phi) < 6 * DEG ? 0 : t.phi;
        phiCmd = this.rolRef;
      }
    }
    if (ap.lat !== "ROL") this.rolRef = null;

    // ---------- vertical
    const alt = t.alt;
    if (ap.armGs && nav?.gs?.valid && ap.lat === "LOC" && nav.gs.dev < 0.3 && nav.gs.dev > -1.5) {
      ap.vert = "GS";
      ap.armGs = false;
    }
    // altitude capture
    if (["VS", "FLC", "PIT"].includes(ap.vert) && ap.altArm) {
      const err = ap.alt - alt;
      const capRange = Math.max(Math.abs(t.vs) * 8, 15);
      if (Math.abs(err) < capRange && Math.sign(err) === Math.sign(t.vs || err)) {
        ap.vert = "ALT";
      }
    }
    let gCmd = gamma;
    switch (ap.vert) {
      case "ALT": {
        const err = ap.alt - alt;
        const vsCmd = clamp(err * 0.12, -12, 12);
        gCmd = Math.asin(clamp(vsCmd / V, -0.3, 0.3));
        break;
      }
      case "VS":
        gCmd = Math.asin(clamp(ap.vs / V, -0.4, 0.4));
        break;
      case "FLC": {
        const target = this.speedTargetCas();
        const err = t.cas - target; // fast -> pitch up
        this.flcG = clamp((this.flcG ?? gamma) + err * 0.0025 * dt * 10, -12 * DEG, 15 * DEG);
        gCmd = this.flcG;
        const climbing = ap.alt > alt;
        gCmd = climbing ? Math.max(gCmd, 0) : Math.min(gCmd, 0);
        break;
      }
      case "GS": {
        if (nav?.gs?.valid) {
          const dev = nav.gs.dev; // dots, + = above glidepath
          gCmd = -nav.gs.angle - clamp(dev * 0.6 * DEG, -1.5 * DEG, 1.5 * DEG);
          if (t.agl < 50 * FT && t.vs < 0 && this.fm.spec.at) ap.vert = "FLARE";
        }
        break;
      }
      case "FLARE": {
        const aglFt = Math.max(t.agl / FT, 0);
        const vsCmd = -Math.max(100, aglFt * 11) * FT / 60;
        gCmd = Math.asin(clamp(vsCmd / V, -0.2, 0.2));
        if (fm.wow) {
          ap.vert = "ROLLOUT";
          ap.lat = "ROLLOUT";
        }
        break;
      }
      case "ROLLOUT":
        gCmd = -1 * DEG;
        if (t.gs < 40 * KT) this.disconnectAP("AUTOLAND 완료 — AP OFF");
        break;
      default: {
        if (this.pitRef == null) this.pitRef = t.theta;
        this.cmd.theta = this.pitRef;
      }
    }
    if (ap.vert !== "PIT") {
      this.pitRef = null;
      this.cmd.theta = t.theta + (gCmd - gamma);
      this.cmd.theta = clamp(this.cmd.theta, -15 * DEG, 25 * DEG);
    }
    if (ap.vert !== "FLC") this.flcG = null;
    this.cmd.phi = phiCmd;
  }

  engageAP() {
    if (!this.hasAP) return this.msg("이 기체에는 오토파일럿이 없습니다");
    const t = this.fm.telemetry;
    if (this.fm.wow) return this.msg("지상에서는 AP를 연결할 수 없습니다");
    this.ap.master = true;
    this.iq = 0;
    this.ip = 0;
    if (this.ap.vert === "PIT") {
      this.ap.vert = "VS";
      this.ap.vs = Math.round(t.vs / FT * 60 / 100) * 100 * FT / 60;
    }
    this.ap.altArm = true;
  }
  disconnectAP(reason) {
    if (!this.ap.master) return;
    this.ap.master = false;
    if (this.ap.lat === "ROLLOUT") this.ap.lat = "ROL";
    if (["ROLLOUT", "FLARE"].includes(this.ap.vert)) this.ap.vert = "PIT";
    this.msg(reason || "AP 해제");
    this.onDisconnect?.();
  }
  msg(text) {
    this.messages.push({ text, t: performance?.now?.() ?? 0 });
  }

  // -------------------------------------------------------------- helicopter
  updateHeli(dt, pilot) {
    const fm = this.fm;
    const c = fm.ctl;
    const t = fm.telemetry;
    // SAS: light attitude-rate augmentation
    c.elev = clamp(pilot.pitch - t.q * 0.15, -1, 1);
    c.ail = clamp(pilot.roll - t.p * 0.1, -1, 1);
    c.rud = clamp(pilot.yaw - t.r * 0.2, -1, 1);
    c.collective = pilot.collective ?? pilot.thr;
    for (const e of fm.engines) {
      /* engines governed automatically */
    }
  }
}

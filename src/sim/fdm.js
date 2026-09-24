// SkyForge flight dynamics model.
//
// A rigid-body 6-DOF model integrated in the local NED frame on a WGS-84
// ellipsoid. Aerodynamics use stability-derivative build-ups with non-linear
// lift (stall / post-stall, autorotation), compressibility and supersonic wave
// drag, ground effect, flap/gear/spoiler increments. Engines are modelled per
// type (piston, turboprop, turbofan, turbojet with afterburner, turboshaft) with
// spool dynamics, altitude/Mach lapse and fuel burn. The undercarriage is a set
// of spring-damper contact points with tyre friction, braking and steering.
// Helicopters use a separate rotor model (momentum theory, ETL, governor,
// torque reaction, autorotation energy balance).

import {
  DEG, KT, FT, G0, clamp, lerp, smoothstep, approach,
  add, scale, cross, len, dot,
  qMul, qNorm, qRot, qRotInv, qFromRotVec, qFromEuler, qToEuler, earthRadii,
} from "./math.js";
import { atmosphere, casFromTas, baroAltitude } from "./atmosphere.js";

const RHO0 = 1.225;

// Stability derivative templates (per rad; control terms per unit command,
// signed so that a positive command produces a positive moment).
const TEMPLATES = {
  ga: { CL0: 0.3, Cm0: 0.02, Cma: -0.9, Cmq: -12, Cmde: 0.55, Clb: -0.09, Clp: -0.47, Clr: 0.1, Clda: 0.075, Cldr: 0.01,
    Cnb: 0.065, Cnr: -0.1, Cnp: -0.03, Cnda: -0.006, Cndr: 0.035, CYb: -0.35, CYdr: -0.06, e: 0.75, rx: 0.2, ry: 0.3, gLim: 3.8 },
  aero: { CL0: 0.0, Cm0: 0.0, Cma: -0.5, Cmq: -10, Cmde: 0.7, Clb: -0.03, Clp: -0.42, Clr: 0.05, Clda: 0.16, Cldr: 0.01,
    Cnb: 0.06, Cnr: -0.12, Cnp: -0.02, Cnda: -0.002, Cndr: 0.05, CYb: -0.4, CYdr: -0.08, e: 0.78, rx: 0.19, ry: 0.28, gLim: 10 },
  warbird: { CL0: 0.15, Cm0: 0.02, Cma: -0.7, Cmq: -12, Cmde: 0.55, Clb: -0.07, Clp: -0.45, Clr: 0.09, Clda: 0.09, Cldr: 0.01,
    Cnb: 0.07, Cnr: -0.12, Cnp: -0.03, Cnda: -0.006, Cndr: 0.045, CYb: -0.4, CYdr: -0.06, e: 0.8, rx: 0.22, ry: 0.3, gLim: 8 },
  "prop-twin": { CL0: 0.25, Cm0: 0.02, Cma: -1.0, Cmq: -15, Cmde: 0.55, Clb: -0.1, Clp: -0.45, Clr: 0.1, Clda: 0.07, Cldr: 0.01,
    Cnb: 0.08, Cnr: -0.12, Cnp: -0.03, Cnda: -0.006, Cndr: 0.045, CYb: -0.45, CYdr: -0.08, e: 0.78, rx: 0.24, ry: 0.32, gLim: 3.8 },
  tp: { CL0: 0.25, Cm0: 0.02, Cma: -1.0, Cmq: -15, Cmde: 0.55, Clb: -0.1, Clp: -0.45, Clr: 0.1, Clda: 0.07, Cldr: 0.01,
    Cnb: 0.08, Cnr: -0.13, Cnp: -0.03, Cnda: -0.006, Cndr: 0.045, CYb: -0.5, CYdr: -0.08, e: 0.78, rx: 0.24, ry: 0.32, gLim: 3.8 },
  "regional-tp": { CL0: 0.25, Cm0: 0.02, Cma: -1.1, Cmq: -18, Cmde: 0.55, Clb: -0.12, Clp: -0.42, Clr: 0.11, Clda: 0.06, Cldr: 0.008,
    Cnb: 0.11, Cnr: -0.18, Cnp: -0.035, Cnda: -0.005, Cndr: 0.055, CYb: -0.7, CYdr: -0.08, e: 0.8, rx: 0.27, ry: 0.34, gLim: 2.5 },
  bizjet: { CL0: 0.2, Cm0: 0.02, Cma: -1.1, Cmq: -18, Cmde: 0.55, Clb: -0.14, Clp: -0.42, Clr: 0.12, Clda: 0.06, Cldr: 0.007,
    Cnb: 0.12, Cnr: -0.2, Cnp: -0.04, Cnda: -0.004, Cndr: 0.055, CYb: -0.7, CYdr: -0.08, e: 0.8, rx: 0.26, ry: 0.34, gLim: 3.0 },
  narrow: { CL0: 0.2, Cm0: 0.02, Cma: -1.2, Cmq: -22, Cmde: 0.55, Clb: -0.18, Clp: -0.4, Clr: 0.12, Clda: 0.055, Cldr: 0.006,
    Cnb: 0.14, Cnr: -0.25, Cnp: -0.04, Cnda: -0.004, Cndr: 0.05, CYb: -0.9, CYdr: -0.08, e: 0.8, rx: 0.3, ry: 0.35, gLim: 2.5 },
  wide: { CL0: 0.2, Cm0: 0.02, Cma: -1.25, Cmq: -22, Cmde: 0.55, Clb: -0.2, Clp: -0.4, Clr: 0.12, Clda: 0.05, Cldr: 0.006,
    Cnb: 0.15, Cnr: -0.28, Cnp: -0.04, Cnda: -0.004, Cndr: 0.045, CYb: -0.9, CYdr: -0.08, e: 0.8, rx: 0.31, ry: 0.355, gLim: 2.5 },
  supersonic: { CL0: 0.0, Cm0: 0.0, Cma: -0.25, Cmq: -1.5, Cmde: 0.2, Clb: -0.1, Clp: -0.18, Clr: 0.05, Clda: 0.05, Cldr: 0.005,
    Cnb: 0.12, Cnr: -0.25, Cnp: -0.02, Cnda: -0.002, Cndr: 0.06, CYb: -0.5, CYdr: -0.08, e: 0.8, rx: 0.2, ry: 0.36, gLim: 2.5 },
  fighter: { CL0: 0.05, Cm0: 0.0, Cma: -0.25, Cmq: -5, Cmde: 0.5, Clb: -0.08, Clp: -0.3, Clr: 0.06, Clda: 0.08, Cldr: 0.01,
    Cnb: 0.12, Cnr: -0.3, Cnp: -0.02, Cnda: -0.003, Cndr: 0.05, CYb: -0.9, CYdr: -0.1, e: 0.72, rx: 0.2, ry: 0.35, gLim: 9 },
  glider: { CL0: 0.35, Cm0: 0.02, Cma: -0.7, Cmq: -15, Cmde: 0.55, Clb: -0.07, Clp: -0.6, Clr: 0.15, Clda: 0.055, Cldr: 0.008,
    Cnb: 0.045, Cnr: -0.07, Cnp: -0.06, Cnda: -0.015, Cndr: 0.03, CYb: -0.3, CYdr: -0.05, e: 0.95, rx: 0.2, ry: 0.28, gLim: 5.3 },
};

// ------------------------------------------------------------------ engines
/** Propeller thrust (N) for shaft power P (W) at airspeed V, blending static and cruise regimes. */
function propThrust(P, V, eta, kStatic) {
  if (P <= 0) return 0;
  const Ts = P * kStatic;
  const Td = (eta * P) / Math.max(V, 1);
  return Math.pow(Ts ** -3 + Td ** -3, -1 / 3);
}

class Engine {
  constructor(spec, index, pos) {
    this.spec = spec;
    this.index = index;
    this.pos = pos; // body-frame thrust point
    this.running = false;
    this.starting = 0; // seconds into start sequence, 0 = not starting
    this.n1 = 0; // % (fan / gas generator / rpm fraction for pistons)
    this.n2 = 0;
    this.egt = 15;
    this.ff = 0; // kg/s
    this.thrust = 0; // N
    this.power = 0; // W (shaft)
    this.rpm = 0;
    this.torque = 0; // % (turboprop / heli)
    this.ab = 0; // afterburner 0..1
    this.failed = false;
    this.oilP = 0;
  }

  get idle() {
    const t = this.spec.type;
    if (t === "piston") return 25;
    if (t === "turboprop" || t === "turboshaft") return 62;
    return this.spec.idle || 22;
  }

  startSeq() {
    if (this.running || this.failed || this.spec.type === "none") return;
    this.starting = 0.0001;
  }
  shutdown() {
    this.running = false;
    this.starting = 0;
  }
  setRunning() {
    this.running = true;
    this.starting = 0;
    this.n1 = this.idle;
    this.n2 = 60;
    this.egt = 400;
  }

  /**
   * @param throttle 0..1 (afterburner region above AB_GATE for turbojets)
   * @returns thrust (N) along body +x
   */
  update(dt, throttle, atm, M, V, mix, reverse, hasFuel) {
    const s = this.spec;
    const t = s.type;
    if (t === "none") return 0;
    if (!hasFuel || this.failed) this.running = false;

    const startTime = t === "piston" ? 3 : t === "turbofan" || t === "turbojet" ? 28 : 20;
    if (this.starting > 0) {
      this.starting += dt;
      this.n1 = approach(this.n1, this.idle * 0.9, (this.idle / startTime) * 1.1, dt);
      if (this.starting >= startTime && hasFuel) this.setRunning();
    }

    const idle = this.idle;
    let target = 0;
    if (this.running) {
      const thr = t === "turbojet" && s.ab ? Math.min(throttle / AB_GATE, 1) : throttle;
      target = idle + thr * (100 - idle);
      if (reverse) target = idle + 0.75 * throttle * (100 - idle);
    } else if (this.starting === 0) {
      // windmilling
      target = t === "piston" ? 0 : clamp(V * 0.12, 0, 18);
    }
    // spool dynamics
    const spoolRate = t === "piston" ? 60 : t === "turboprop" || t === "turboshaft" ? 18 : this.n1 < 50 ? 6 : 10;
    const tau = t === "piston" ? 0.25 : 1.6;
    const dn = (target - this.n1) / tau;
    this.n1 += clamp(dn, -spoolRate * 1.4, spoolRate) * dt;
    this.n2 = this.running ? lerp(60, 100, (this.n1 - idle) / (100 - idle)) : this.n1 * 0.9;
    const pwr = this.running ? clamp((this.n1 - idle) / (100 - idle), 0, 1) : 0;

    let T = 0;
    this.ff = 0;
    if (t === "turbofan" || t === "turbojet") {
      const lapse = t === "turbofan"
        ? Math.pow(atm.sigma, s.lapseX ?? 0.75) * (1 - 0.49 * M + 0.2 * M * M)
        : Math.pow(atm.sigma, 0.8) * (1 + 0.35 * M * M);
      const f = this.running ? 0.045 + 0.955 * Math.pow(pwr, 1.4) : 0;
      T = s.kn * 1000 * f * Math.max(lapse, 0.02);
      // afterburner
      const abCmd = t === "turbojet" && s.ab && this.running && throttle > AB_GATE ? (throttle - AB_GATE) / (1 - AB_GATE) : 0;
      this.ab = approach(this.ab, abCmd, 1.5, dt);
      if (this.ab > 0.01) T += (s.ab - s.kn) * 1000 * this.ab * Math.max(lapse, 0.02);
      const tsfc = t === "turbofan"
        ? 0.0306 * (1 + 1.0 * M) * Math.sqrt(atm.T / 288.15)
        : 0.075 * (1 + 0.5 * M) + this.ab * 0.12;
      this.ff = (tsfc * T) / 3600; // kg/s (tsfc in kg/(N·h))
      if (reverse && this.running) T = -T * 0.45;
      this.egt = approach(this.egt, this.running ? 380 + 520 * Math.pow(this.n1 / 100, 2.2) + this.ab * 250 : this.starting ? 250 : 20, 60, dt);
      this.power = 0;
    } else if (t === "piston") {
      // power: throttle, density (turbo holds sea level power to critical altitude), mixture
      const crit = (s.crit ?? (s.turbo ? 16000 : 0)) * FT;
      const sigmaEff = s.turbo ? Math.min(1, atm.sigma / Math.max(atmosphere(crit).sigma, 0.01)) : atm.sigma;
      const densFactor = Math.pow(sigmaEff, 1.1);
      // best-power mixture falls with density; lean of peak loses power, too lean kills engine
      const best = clamp(Math.sqrt(atm.sigma), 0.4, 1);
      const m = mix ?? best;
      let mixF = 1 - 1.8 * Math.max(0, m - best) ** 2 - 6 * Math.max(0, best - m) ** 2;
      if (m < best * 0.62 && this.running) this.running = false;
      mixF = clamp(mixF, 0, 1);
      const P = this.running ? s.kw * 1000 * (0.06 + 0.94 * pwr) * densFactor * mixF : 0;
      this.power = P;
      this.rpm = this.running ? lerp(700, s.rpm || 2700, clamp(pwr * 0.85 + V / 140, 0, 1)) : Math.max(0, V * 8);
      T = propThrust(P, V, s.fixedPitch ? 0.72 : 0.8, 0.021);
      if (!this.running) T = -0.02 * 0.5 * atm.rho * V * V * (s.kw / 100); // windmill drag
      this.ff = P * 7.6e-8 * (0.8 + 0.4 * m / best);
      this.egt = approach(this.egt, this.running ? 700 + 280 * pwr - 250 * Math.abs(m - best) : 20, 40, dt);
      this.oilP = this.running ? 60 + 20 * pwr : approach(this.oilP, 0, 20, dt);
    } else {
      // turboprop / turboshaft: shaft power, flat-rated below ~ISA+15 at low altitude
      // flat-rated: full rated power is available up to roughly FL150-FL200
      const P = this.running ? s.kw * 1000 * (0.05 + 0.95 * pwr) * Math.min(1, Math.pow(atm.sigma, 0.75) * 1.7) : 0;
      this.power = P;
      this.torque = (P / (s.kw * 1000)) * 100;
      this.rpm = this.running ? 1700 + 300 * pwr : 0;
      const Tstatic = P * 0.017;
      T = propThrust(P, V, 0.82, 0.017);
      if (reverse && this.running) T = -Tstatic * 0.6 * (0.3 + 0.7 * throttle) / (1 + V / 60);
      else if (!this.running) T = -0.015 * 0.5 * atm.rho * V * V * (s.kw / 150);
      this.ff = this.running ? (P * 0.55 * 0.4536) / (745.7 * 3600) + 0.004 * (s.kw / 700) : 0; // BSFC 0.55 lb/shp/h + idle
      this.egt = approach(this.egt, this.running ? 500 + 300 * pwr : this.starting ? 400 : 20, 60, dt); // ITT
      this.oilP = this.running ? 85 + 20 * pwr : approach(this.oilP, 0, 20, dt);
    }
    this.thrust = T;
    return T;
  }
}

export const AB_GATE = 0.9;

// ------------------------------------------------------------------ aircraft
export class FlightModel {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.heli = spec.cat === "heli";
    this.fuelFrac = opts.fuelFrac ?? 0.6;
    this.payloadFrac = opts.payloadFrac ?? 0.5;
    this.derive();
    this.reset();
  }

  derive() {
    const s = this.spec;
    const tpl = TEMPLATES[s.cat] || TEMPLATES.ga;
    const d = { ...tpl };
    this.d = d;
    this.fuelCap = s.fuel;
    this.payloadMax = Math.max(0, s.mtow - s.mE - s.fuel * 0.6);
    this.fuel = s.fuel * this.fuelFrac;
    this.payload = this.payloadMax * this.payloadFrac;

    if (this.heli) {
      this.deriveHeli();
      this.buildContacts();
      return;
    }

    const AR = (s.b * s.b) / s.S;
    const sweep = (s.model?.sw || 0) * DEG;
    d.AR = AR;
    d.e = s.e ?? tpl.e;
    d.K = 1 / (Math.PI * d.e * AR);
    d.CLa = s.cLa ?? (2 * Math.PI * AR) / (2 + Math.sqrt(4 + AR * AR * (1 + Math.tan(sweep) ** 2)));
    const W = s.mtow * G0;
    const clFromVs = (vs) => (2 * W) / (RHO0 * s.S * (vs * KT) ** 2);
    d.CLmax = s.CLmax ?? clFromVs(s.vs1);
    d.CLmaxLand = s.CLmaxLand ?? clFromVs(s.vs0);
    d.CLmaxNeg = -0.75 * d.CLmax;
    d.CL0 = s.model?.delta ? 0.0 : tpl.CL0;
    d.CDgear = s.gear.retract ? (s.cat === "ga" || s.cat === "prop-twin" ? 0.012 : 0.018) : 0;
    d.CDflap = s.cat === "ga" || s.cat === "aero" ? 0.045 : 0.07;
    d.Mcr = s.mmo && s.mmo < 1.2 ? s.mmo + 0.02 - 0.108 : 5; // Lock's drag-rise onset
    d.wave = s.wave ?? 0;

    // mass properties (use mid-weight)
    const m = s.mtow * 0.8;
    const rx = tpl.rx, ry = tpl.ry;
    this.I = [m * (rx * s.b / 2) ** 2 * 1.8, m * (ry * s.L / 2) ** 2 * 1.4, 0];
    this.I[2] = (this.I[0] + this.I[1]) * 0.95;

    this.buildEngines();

    // parasite drag from published cruise point
    if (s.CD0 != null) {
      d.CD0 = s.CD0;
    } else if (s.cr) {
      const [ktas, ft, pf] = s.cr;
      const atm = atmosphere(ft * FT);
      const V = ktas * KT;
      const M = V / atm.a;
      const q = 0.5 * atm.rho * V * V;
      const mass = s.mE + s.fuel * 0.5 + this.payloadMax * 0.5;
      const CL = (mass * G0) / (q * s.S);
      const CDw = this.waveDrag(M);
      if (s.eng.type === "turbofan") {
        // choose CD0 by class, then solve the altitude-lapse exponent that closes the thrust/drag balance
        d.CD0 = { bizjet: 0.022, narrow: 0.02, wide: 0.018 }[s.cat] ?? 0.021;
        const D = q * s.S * (d.CD0 + d.K * CL * CL + CDw);
        const Mf = 1 - 0.49 * M + 0.2 * M * M;
        const need = D / (s.eng.n * s.eng.kn * 1000 * Mf * (0.045 + 0.955 * Math.pow(pf, 1.4)));
        s.eng.lapseX = clamp(Math.log(need) / Math.log(atm.sigma), 0.45, 1.3);
        for (const e of this.engines) e.spec.lapseX = s.eng.lapseX;
      } else {
        // props: pf = fraction of rated power actually delivered at the cruise point
        const P = pf * s.eng.kw * 1000;
        const T = propThrust(P, V, s.eng.type === "turboprop" ? 0.82 : 0.8, s.eng.type === "turboprop" ? 0.017 : 0.021) * s.eng.n;
        d.CD0 = clamp(T / (q * s.S) - d.K * CL * CL - CDw, 0.016, 0.06);
      }
    }
    d.gLim = s.cat === "glider" ? 5.3 : tpl.gLim;
    this.buildContacts();
  }

  waveDrag(M) {
    const d = this.d;
    let cd = 0;
    if (M > d.Mcr) cd += 20 * Math.min(M - d.Mcr, 0.25) ** 4;
    if (d.wave > 0) {
      // transonic peak at M1.05 decaying supersonically
      if (M < 1.05) cd += d.wave * smoothstep(0.85, 1.05, M);
      else cd += d.wave * Math.pow(1.05 / M, 1.1);
    }
    return cd;
  }

  buildEngines() {
    const s = this.spec;
    const n = s.eng.n;
    const pos = [];
    const lay = s.model?.eng;
    const fd = s.model?.fd || 1.5;
    if (n === 1) pos.push([s.L * 0.35, 0, 0]);
    else if (n === 2) {
      const y = lay === "rear" ? fd * 0.9 : lay === "internal" ? 0.5 : s.b * 0.18;
      const z = lay === "wing" ? fd * 0.45 : 0;
      pos.push([0, -y, z], [0, y, z]);
    } else if (n === 4) {
      const z = lay === "wing" ? fd * 0.4 : fd * 0.3;
      pos.push([0, -s.b * 0.38, z], [0, -s.b * 0.2, z], [0, s.b * 0.2, z], [0, s.b * 0.38, z]);
    }
    this.engines = pos.map((p, i) => new Engine({ ...s.eng }, i, p));
    // piston/turboprop props rotation (clockwise from cockpit -> left turning tendencies)
    this.vRig = s.cr ? s.cr[0] * KT * 0.75 : 50;
    this.propTorque = (s.eng.type === "piston" || s.eng.type === "turboprop") && n === 1;
  }

  buildContacts() {
    const s = this.spec;
    const fd = s.model?.fd || 1.5;
    const L = s.L;
    const b = s.b;
    const gt = s.gear.type;
    const m = s.mtow;
    const pts = [];
    // CG height above ground on gear
    let h;
    if (gt === "skid") h = fd * 0.55 + 0.35;
    else if (gt === "mono") h = fd * 0.5 + 0.12;
    else if (s.cat === "ga" || s.cat === "aero" || s.cat === "warbird") h = fd * 0.5 + 0.75;
    else h = 0.5 * fd + 0.035 * b + 0.45;
    if (s.cat === "fighter") h = fd * 0.5 + 1.3;
    if (s.gh) h = s.gh;
    this.cgHeight = h;
    const mk = (x, y, z, share, kind, steer = false) => {
      const k = (m * G0 * share) / (kind === "gear" ? 0.12 : 0.05);
      const c = 2 * 0.75 * Math.sqrt(k * m * Math.max(share, 0.1));
      pts.push({ r: [x, y, z], k, c, kind, steer, share, comp: 0, force: 0 });
    };
    if (gt === "tri") {
      const track = s.cat === "ga" ? b * 0.11 : Math.max(b * 0.08, fd * 0.6);
      mk(L * 0.33, 0, h, 0.1, "gear", true);
      mk(-L * 0.04, -track, h, 0.45, "gear");
      mk(-L * 0.04, track, h, 0.45, "gear");
    } else if (gt === "tail") {
      const track = b * 0.12;
      const xm = L * 0.1;
      const xt = -L * 0.5;
      const zt = h - (xm - xt) * Math.tan(11 * DEG);
      mk(xm, -track, h, 0.46, "gear");
      mk(xm, track, h, 0.46, "gear");
      mk(xt, 0, zt, 0.08, "gear", true);
    } else if (gt === "mono") {
      mk(L * 0.02, 0, h, 0.8, "gear");
      mk(-L * 0.52, 0, h - 0.15, 0.2, "gear", true);
      mk(L * 0.3, 0, h - 0.12, 0.2, "skid");
    } else if (gt === "skid") {
      const y = fd * 0.62;
      for (const x of [L * 0.18, -L * 0.14]) for (const yy of [-y, y]) mk(x, yy, h, 0.25, "skid");
    }
    // structure contacts (nose, tail, wingtips, belly)
    const zs = fd * 0.5;
    mk(L * 0.48, 0, zs * 0.6, 0.3, "struct");
    mk(-L * (s.tailArm ?? 0.5), 0, zs * 0.2, 0.3, "struct");
    mk(0, 0, zs, 0.6, "belly");
    if (!this.heli) {
      const tipZ = s.model?.wing === "high" ? -fd * 0.4 : s.model?.wing === "low" ? fd * 0.3 : 0;
      mk(-L * 0.05, -b / 2, tipZ, 0.3, "tip");
      mk(-L * 0.05, b / 2, tipZ, 0.3, "tip");
    } else {
      mk(-L * 0.45, 0, zs * 0.2, 0.3, "tailrotor");
    }
    this.contacts = pts;
  }

  deriveHeli() {
    const s = this.spec;
    const m = s.mtow * 0.8;
    this.I = [m * (0.13 * s.L / 2) ** 2 * 4, m * (0.26 * s.L / 2) ** 2 * 4, 0];
    this.I[2] = this.I[1] * 0.9;
    this.rotorA = Math.PI * (s.rotorD / 2) ** 2;
    this.omegaR = 215; // tip speed m/s
    this.rotorE = 1; // normalised rotor rpm (1 = 100 %)
    // max thrust (collective full at SL, 100% Nr) ~ 1.35 × MTOW weight
    this.Tmax = s.mtow * G0 * 1.35;
    // equivalent flat plate area from vno at ~90% power
    const V = s.vno * KT;
    const T = s.mtow * G0;
    const vih = Math.sqrt(T / (2 * RHO0 * this.rotorA));
    const vi = Math.sqrt((-V * V + Math.sqrt(V ** 4 + 4 * vih ** 4)) / 2);
    const Pmax = s.eng.kw * 1000 * s.eng.n;
    this.P0 = Pmax * 0.14; // profile power
    const Pp = Math.max(0.9 * Pmax - T * vi * 1.15 - this.P0, Pmax * 0.2);
    this.fPlate = Pp / (0.5 * RHO0 * V ** 3);
    this.buildEngines();
    for (const e of this.engines) e.pos = [0, 0, 0];
  }

  reset() {
    this.lat = 0;
    this.lon = 0;
    this.alt = 0;
    this.v = [0, 0, 0]; // NED ground velocity
    this.q = [1, 0, 0, 0];
    this.w = [0, 0, 0]; // body rates p q r
    this.ctl = {
      elev: 0, ail: 0, rud: 0, thr: new Array(this.engines.length).fill(0),
      flap: 0, flapPos: 0, gear: 1, gearPos: 1, spoiler: 0, spoilerPos: 0, spoilerArmed: false,
      brakeL: 0, brakeR: 0, park: true, trim: 0, rudTrim: 0, ailTrim: 0,
      reverse: false, mixture: 1, autoMix: true, tiller: 0, collective: 0,
    };
    this.crashed = false;
    this.crashReason = "";
    this.onGround = false;
    this.wow = false;
    this.time = 0;
    this.telemetry = {};
    this.lastAccel = [0, 0, 0];
    this.nz = 1;
    this.maxNz = 1;
    this.touchdownVS = 0;
    this.touchdownVSmax = 0;
    this.damage = "";
    this.stall = 0;
    this.turb = [0, 0, 0];
    this.turbPhase = Math.random() * 100;
  }

  get mass() {
    return this.spec.mE + this.fuel + this.payload;
  }

  // ------------------------------------------------------------------ placement
  placeOnGround(lat, lon, groundAlt, headingRad) {
    this.lat = lat;
    this.lon = lon;
    let pitch = 0;
    if (this.spec.gear.type === "tail") pitch = 11 * DEG;
    const gearPts = this.contacts.filter((c) => c.kind === "gear" || c.kind === "skid");
    this.q = qFromEuler(0, pitch, headingRad);
    // lowest gear point defines height (with static compression)
    let maxDown = 0;
    for (const c of gearPts) {
      const r = qRot(this.q, c.r);
      maxDown = Math.max(maxDown, r[2]);
    }
    this.alt = groundAlt + maxDown - 0.1;
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    const c = this.ctl;
    c.gear = 1;
    c.gearPos = 1;
    this.onGround = true;
    this.wow = true;
  }

  placeInAir(lat, lon, alt, headingRad, kias, flapIdx = 0, gearDown = false) {
    this.lat = lat;
    this.lon = lon;
    this.alt = alt;
    const atm = atmosphere(alt);
    const tas = (kias * KT) / Math.sqrt(atm.sigma) * (1 + 0.0);
    const c = this.ctl;
    c.flap = flapIdx;
    c.flapPos = this.spec.flaps[flapIdx][1];
    c.gear = gearDown ? 1 : this.spec.gear.retract ? 0 : 1;
    c.gearPos = c.gear;
    c.park = false;
    for (const e of this.engines) e.setRunning();
    const trim = this.heli ? { alpha: 0, elev: 0, thr: 0.55 } : this.solveTrim(tas, alt, 0);
    this.q = qFromEuler(0, trim.alpha, headingRad);
    this.v = [tas * Math.cos(headingRad), tas * Math.sin(headingRad), 0];
    this.w = [0, 0, 0];
    c.trim = trim.elev;
    c.elev = 0;
    c.thr.fill(trim.thr);
    c.collective = this.heli ? 0.5 : 0;
    for (const e of this.engines) {
      e.n1 = e.idle + trim.thr * (100 - e.idle);
    }
    this.onGround = false;
    this.wow = false;
  }

  /** Solve level-flight trim: returns {alpha, elev, thr}. */
  solveTrim(V, alt, gamma = 0) {
    const atm = atmosphere(alt);
    const s = this.spec;
    const d = this.d;
    const q = 0.5 * atm.rho * V * V;
    const W = this.mass * G0;
    const fl = this.ctl.flapPos;
    const CLreq = (W * Math.cos(gamma)) / (q * s.S);
    const dCLf = fl * (d.CLmaxLand - d.CLmax);
    const alpha = clamp((CLreq - d.CL0 - dCLf) / d.CLa, -0.2, 0.3);
    const M = V / atm.a;
    const CD = this.dragCoef(CLreq, M, 0);
    const Dn = q * s.S * CD + W * Math.sin(gamma);
    const zT = this.engines.length ? this.engines.reduce((a, e) => a + e.pos[2], 0) / this.engines.length : 0;
    const Cm = d.Cm0 + d.Cma * alpha - 0.05 * fl + (zT * Math.max(Dn, 0)) / (q * s.S * s.c);
    const elev = clamp(-Cm / d.Cmde, -1, 1);
    if (!this.engines.length) return { alpha, elev, thr: 0 };
    // find throttle by bisection on steady-state engine thrust
    let lo = 0, hi = 1;
    const e = this.engines[0];
    const saved = [e.running, e.n1, e.ab, e.egt];
    e.running = true;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      e.n1 = e.idle + Math.min(mid / (s.eng.ab ? AB_GATE : 1), 1) * (100 - e.idle);
      e.ab = 0;
      const T = e.update(0.0001, mid, atm, M, V, undefined, false, true) * this.engines.length;
      if (T < Dn) lo = mid;
      else hi = mid;
    }
    [e.running, e.n1, e.ab, e.egt] = saved;
    return { alpha, elev, thr: (lo + hi) / 2 };
  }

  dragCoef(CL, M, stallW) {
    const d = this.d;
    const c = this.ctl;
    let K = d.K;
    if (M > 1) K *= 1 + 0.6 * (M - 1);
    return (
      d.CD0 + K * CL * CL + d.CDflap * Math.pow(c.flapPos, 1.6) + d.CDgear * c.gearPos + 0.06 * c.spoilerPos +
      this.waveDrag(M) + 1.25 * stallW
    );
  }

  liftCoef(alpha) {
    const d = this.d;
    const fl = this.ctl.flapPos;
    const dCL = fl * (d.CLmaxLand - d.CLmax);
    const CL0 = d.CL0 + dCL;
    const CLmax = d.CLmax + dCL - 0.25 * this.ctl.spoilerPos * d.CLmax;
    const aS = (CLmax - CL0) / d.CLa;
    const aN = (d.CLmaxNeg - CL0) / d.CLa;
    let CL = CL0 + d.CLa * alpha;
    let stall = 0;
    if (alpha > aS) {
      const x = alpha - aS;
      const ps = CLmax * (1 - 0.3 * smoothstep(0, 0.08, x));
      const flat = 1.15 * Math.sin(2 * alpha);
      stall = smoothstep(0, 0.35, x);
      CL = lerp(ps, flat, smoothstep(0.08, 0.45, x));
      this.stallMargin = -x;
    } else if (alpha < aN) {
      const x = aN - alpha;
      const ps = d.CLmaxNeg * (1 - 0.3 * smoothstep(0, 0.08, x));
      const flat = 1.15 * Math.sin(2 * alpha);
      stall = smoothstep(0, 0.35, x);
      CL = lerp(ps, flat, smoothstep(0.08, 0.45, x));
      this.stallMargin = -x;
    } else {
      this.stallMargin = aS - alpha;
    }
    // spoilers dump lift
    CL -= 0.35 * this.ctl.spoilerPos * Math.max(CL, 0) * (this.wow ? 1.4 : 0.5);
    this.aStall = aS;
    return [CL, stall];
  }

  // ------------------------------------------------------------------ main step
  /**
   * @param env { groundAlt, wind:[n,e,d], dT, qnh, turb (0..1), surface }
   */
  step(dt, env) {
    if (this.crashed) return;
    const s = this.spec;
    const c = this.ctl;
    this.time += dt;

    // control surface / system actuators
    c.flapPos = approach(c.flapPos, s.flaps[c.flap][1], 1 / 12, dt);
    if (s.gear.retract) c.gearPos = approach(c.gearPos, c.gear, 1 / 8, dt);
    c.spoilerPos = approach(c.spoilerPos, c.spoiler, 1.2, dt);

    const atm = atmosphere(this.alt, env.dT || 0, env.qnh || 101325);
    this.atm = atm;

    // winds & turbulence (Dryden-like filtered noise)
    const wind = env.wind || [0, 0, 0];
    const tI = env.turb || 0;
    if (tI > 0) {
      this.turbPhase += dt;
      const t = this.turbPhase;
      const agl = Math.max(this.alt - (env.groundAlt || 0), 1);
      const sig = tI * (agl < 300 ? 1.5 : 2.5);
      this.turb = [
        sig * (Math.sin(t * 0.61) * 0.6 + Math.sin(t * 1.73 + 1) * 0.3 + Math.sin(t * 4.1 + 2) * 0.1),
        sig * (Math.sin(t * 0.53 + 3) * 0.6 + Math.sin(t * 1.37 + 5) * 0.3 + Math.sin(t * 3.7) * 0.1),
        sig * 0.6 * (Math.sin(t * 0.77 + 4) * 0.5 + Math.sin(t * 2.3 + 7) * 0.35 + Math.sin(t * 5.3) * 0.15),
      ];
    } else this.turb = [0, 0, 0];
    const vAirN = [this.v[0] - wind[0] - this.turb[0], this.v[1] - wind[1] - this.turb[1], this.v[2] - wind[2] - this.turb[2]];
    const vb = qRotInv(this.q, vAirN);
    const V = Math.max(len(vb), 0.01);
    const M = V / atm.a;
    const qbar = 0.5 * atm.rho * V * V;

    let F = [0, 0, 0]; // body forces (N)
    let Mo = [0, 0, 0]; // body moments (N·m)

    if (this.heli) {
      this.heliForces(dt, atm, vb, V, F, Mo, env);
    } else {
      this.aeroForces(atm, vb, V, M, qbar, F, Mo, env);
      // engines
      const hasFuel = this.fuel > 0;
      let ffTot = 0;
      for (let i = 0; i < this.engines.length; i++) {
        const e = this.engines[i];
        const mix = c.autoMix ? undefined : c.mixture;
        const T = e.update(dt, c.thr[i] ?? 0, atm, M, V, mix, c.reverse && this.wow, hasFuel);
        F[0] += T;
        const r = e.pos;
        Mo[1] += r[2] * T; // underslung thrust -> nose up
        Mo[2] += -r[1] * T;
        ffTot += e.ff;
        if (this.propTorque && e.power > 0) {
          const omega = (e.rpm / 60) * 2 * Math.PI;
          // torque reaction & p-factor/slipstream; airframe is rigged neutral near cruise speed
          const rig = clamp(1 - V / this.vRig, 0, 1);
          Mo[0] -= 0.5 * (e.power / Math.max(omega, 50)) * (0.1 + 0.9 * rig);
          Mo[2] -= 0.08 * T * s.L * 0.15 * rig;
        }
      }
      this.fuel = Math.max(0, this.fuel - ffTot * dt);
      this.fuelFlow = ffTot;
    }

    // gravity (NED) -> body
    const g = G0 * (6371000 / (6371000 + this.alt)) ** 2;
    const m = this.mass;
    const Fg = qRotInv(this.q, [0, 0, m * g]);

    // ground contacts
    const Fgnd = [0, 0, 0];
    const Mgnd = [0, 0, 0];
    this.groundContacts(dt, env, Fgnd, Mgnd);

    const Fb = add(add(F, Fg), Fgnd);
    const Mb = add(Mo, Mgnd);

    // load factor (aerodynamic + propulsive specific force, body -z); ground loads are
    // judged separately through the touchdown sink rate
    const specF = scale(this.wow ? add(F, Fgnd) : F, 1 / m);
    this.nz = -specF[2] / G0;
    this.nx = specF[0] / G0;
    this.ny = specF[1] / G0;

    // translational: NED
    const aN = scale(qRot(this.q, Fb), 1 / m);
    this.v = add(this.v, scale(aN, dt));

    // rotational: Euler's equations (principal axes)
    const I = this.I;
    const w = this.w;
    const Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
    const gyro = cross(w, Iw);
    const wd = [(Mb[0] - gyro[0]) / I[0], (Mb[1] - gyro[1]) / I[1], (Mb[2] - gyro[2]) / I[2]];
    this.w = [w[0] + wd[0] * dt, w[1] + wd[1] * dt, w[2] + wd[2] * dt];
    // clamp absurd rates (numerical safety)
    for (let i = 0; i < 3; i++) this.w[i] = clamp(this.w[i], -6, 6);
    this.q = qNorm(qMul(this.q, qFromRotVec(scale(this.w, dt))));

    // position on ellipsoid + transport rate (local-level frame rotation)
    const [rm, rn] = earthRadii(this.lat);
    const vN = this.v[0], vE = this.v[1];
    this.lat += (vN * dt) / (rm + this.alt);
    this.lon += (vE * dt) / ((rn + this.alt) * Math.cos(this.lat));
    this.alt -= this.v[2] * dt;
    if (this.lon > Math.PI) this.lon -= 2 * Math.PI;
    if (this.lon < -Math.PI) this.lon += 2 * Math.PI;
    const wt = [vE / (rn + this.alt), -vN / (rm + this.alt), (-vE * Math.tan(this.lat)) / (rn + this.alt)];
    const dq = qFromRotVec(scale(wt, -dt));
    this.q = qNorm(qMul(dq, this.q));
    this.v = qRot(dq, this.v);

    // structural limits
    const vneCas = (s.vne || 999) * KT;
    const casNow = casFromTas(V, atm);
    if (!this.wow && casNow > vneCas * 1.3 && s.cat !== "fighter") this.crash("구조 파손: VNE 초과 (과속)");
    if (!this.wow && Math.abs(this.nz) > this.d.gLim * 1.6 + 0.5) this.crash(`구조 파손: 하중계수 ${this.nz.toFixed(1)} G 초과`);
    this.maxNz = Math.max(this.maxNz, this.nz);

    this.updateTelemetry(atm, vb, V, M, env, wind);
  }

  aeroForces(atm, vb, V, M, qbar, F, Mo, env) {
    const s = this.spec;
    const d = this.d;
    const c = this.ctl;
    const [u, vv, w] = vb;
    const alpha = Math.atan2(w, Math.max(Math.abs(u), 0.1) * Math.sign(u || 1));
    const beta = Math.asin(clamp(vv / V, -1, 1));
    this.alpha = alpha;
    this.beta = beta;
    const [p, q, r] = this.w;
    const b = s.b, cbar = s.c, S = s.S;
    const Veff = Math.max(V, 15);
    const ph = (p * b) / (2 * Veff), qh = (q * cbar) / (2 * Veff), rh = (r * b) / (2 * Veff);

    // aerodynamic effectiveness fades out at very low airspeed (taxi)
    const [CLraw, stallW] = this.liftCoef(alpha);
    this.stall = stallW;
    let CL = CLraw;
    // ground effect: less induced drag, slight lift gain
    const hWing = Math.max(this.alt - (env.groundAlt ?? -1e4) - this.cgHeight * 0.6, 0.1);
    const x = (16 * hWing) / b;
    const phiGE = (x * x) / (1 + x * x);
    CL *= 1 + 0.08 * (1 - phiGE);
    const CDi = d.K * CL * CL * phiGE;
    let CD = this.dragCoef(0, M, stallW) + CDi;
    // brake chute / speed brake on fighters
    if (s.cat === "fighter") CD += 0.03 * c.spoilerPos;

    const CY = d.CYb * beta + d.CYdr * (c.rud + c.rudTrim);

    const elevCmd = clamp(c.elev + c.trim, -1, 1);
    const ailCmd = clamp(c.ail + c.ailTrim, -1, 1);
    const rudCmd = clamp(c.rud + c.rudTrim, -1, 1);
    // control effectiveness reduced in deep stall, elevator also in propwash for props on ground (simplified)
    const eff = 1 - 0.5 * stallW;

    const Cm = d.Cm0 + d.Cma * alpha + d.Cmq * qh + d.Cmde * elevCmd * eff - 0.05 * c.flapPos
      - (s.gear.type === "tail" ? 0 : 0) + (M > 0.9 && d.wave > 0 ? -0.04 * smoothstep(0.9, 1.3, M) : 0);
    // autorotation: roll damping reverses when stalled (spins)
    const Clp = d.Clp * (1 - 2.2 * stallW);
    const Cl = d.Clb * beta + Clp * ph + d.Clr * rh * (1 + 2 * stallW) + d.Clda * ailCmd * eff + d.Cldr * rudCmd
      + stallW * 0.03 * Math.sin(this.time * 1.7 + this.turbPhase) * (1 + Math.abs(beta) * 8);
    const Cn = d.Cnb * beta + d.Cnr * rh + d.Cnp * ph + d.Cnda * ailCmd + d.Cndr * rudCmd * eff;

    // wind axes -> body (lift perpendicular to relative wind in x-z plane)
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const Lf = qbar * S * CL;
    const Df = qbar * S * CD;
    const Yf = qbar * S * CY;
    // drag along -V direction; lift perpendicular in x-z plane
    const vhat = [vb[0] / V, vb[1] / V, vb[2] / V];
    F[0] += -Df * vhat[0] + Lf * sa;
    F[1] += -Df * vhat[1] + Yf;
    F[2] += -Df * vhat[2] - Lf * ca;
    Mo[0] += qbar * S * b * Cl;
    Mo[1] += qbar * S * cbar * Cm;
    Mo[2] += qbar * S * b * Cn;
    this.CL = CL;
    this.CD = CD;
  }

  heliForces(dt, atm, vb, V, F, Mo, env) {
    const s = this.spec;
    const c = this.ctl;
    const m = this.mass;
    const A = this.rotorA;
    // engines/governor
    const hasFuel = this.fuel > 0;
    let Pav = 0, ff = 0;
    for (const e of this.engines) {
      e.update(dt, e.running ? 1 : 0, atm, 0, 0, undefined, false, hasFuel);
      Pav += e.power;
      ff += e.ff;
    }
    const col = clamp(c.collective, 0, 1);
    const Nr = this.rotorE;
    // inflow
    const Vh = Math.hypot(vb[0], vb[1]);
    const climb = -vb[2]; // body up velocity (approx climb through rotor)
    const Tguess = Math.max(this.Tmax * col * atm.sigma * Nr * Nr, 1);
    const vih = Math.sqrt(Tguess / (2 * atm.rho * A));
    const vi = Math.sqrt((-Vh * Vh + Math.sqrt(Vh ** 4 + 4 * vih ** 4)) / 2);
    const etl = smoothstep(4, 12, Vh);
    let T = this.Tmax * (col * 1.05 - 0.05) * atm.sigma * Nr * Nr * (1 + 0.18 * etl);
    T *= clamp(1 - (0.9 * climb) / Math.max(vih * 3 + 10, 1), 0.5, 1.4);
    // ground effect (in-ground-effect hover gain)
    const hAgl = Math.max(this.alt - (env.groundAlt ?? -1e4), 0.5);
    T *= 1 + 0.15 * clamp(1 - hAgl / s.rotorD, 0, 1);
    T = Math.max(T, 0);
    // power required (induced + climb + profile + parasite)
    const Pi = T * (vi * 1.15 + climb);
    const Dpar = 0.5 * atm.rho * V * V * this.fPlate;
    const Preq = Math.max(Pi + this.P0 * Nr ** 3 + Dpar * Vh, -this.P0 * 2);
    const Pmax = s.eng.kw * 1000 * s.eng.n;
    // governor: engines deliver what is required up to available power
    const Pdel = Math.min(Preq, Pav > 0 ? Pmax * Math.min(1, atm.sigma ** 0.7 * 1.1) : 0);
    const Erot = 0.5 * (Pmax * 4.5); // rotor energy scale (J) at Nr=1 (≈4.5 s of max power)
    const dE = (Pdel - Preq) * dt;
    this.rotorE = clamp(Math.sqrt(Math.max(Nr * Nr + dE / Erot, 0)), 0, 1.12);
    if (Pav > 0 && Preq < Pdel + 1) this.rotorE = approach(this.rotorE, 1, 0.1, dt);
    this.heliPower = Pdel;
    this.heliTorque = (Pdel / Pmax) * 100;
    for (const e of this.engines) e.torque = this.heliTorque;
    this.fuel = Math.max(0, this.fuel - ff * dt * (0.3 + 0.7 * Pdel / Pmax));
    this.fuelFlow = ff;

    // rotor thrust along body -z, tilted by flapping-back with forward speed
    const tiltBack = clamp(vb[0] * 0.0035, -0.08, 0.08);
    const tiltSide = clamp(vb[1] * 0.0035, -0.08, 0.08);
    F[0] += -T * tiltBack;
    F[1] += -T * tiltSide;
    F[2] += -T;
    // fuselage drag
    const f = this.fPlate;
    F[0] += -0.5 * atm.rho * Math.abs(vb[0]) * vb[0] * f;
    F[1] += -0.5 * atm.rho * Math.abs(vb[1]) * vb[1] * f * 4;
    F[2] += -0.5 * atm.rho * Math.abs(vb[2]) * vb[2] * f * 6;

    const [p, q, r] = this.w;
    const I = this.I;
    const auth = clamp(T / (m * G0), 0.2, 1.3) * Nr * Nr;
    // cyclic control power, rotor damping, speed stability
    Mo[0] += I[0] * (3.2 * auth * (c.ail + c.ailTrim) - 4.5 * p) - T * tiltSide * 1.2;
    Mo[1] += I[1] * (1.8 * auth * (c.elev + c.trim) - 3.2 * q) + T * tiltBack * 1.5;
    // yaw: tail rotor vs main rotor torque, weathervane
    const Qmain = Pdel / (this.omegaR / (s.rotorD / 2) * Math.max(Nr, 0.2));
    const beta = Math.atan2(vb[1], Math.max(Math.abs(vb[0]), 1));
    Mo[2] += I[2] * (1.6 * Nr * Nr * (c.rud + c.rudTrim) - 1.6 * r) + Qmain * 0.9 - 0.5 * atm.rho * V * V * f * s.L * 0.6 * beta;
    this.alpha = Math.atan2(vb[2], Math.max(Math.abs(vb[0]), 0.1));
    this.beta = beta;
    this.stall = 0;
    this.heliT = T;
    this.vortexRing = climb < -4 && Vh < 8;
    if (this.vortexRing) F[2] += T * 0.35 * Math.min(1, (-climb - 4) / 4);
  }

  groundContacts(dt, env, Fb, Mb) {
    const gA = env.groundAlt;
    this.wow = false;
    if (gA == null) return;
    const s = this.spec;
    const c = this.ctl;
    const hard = env.surface !== "grass";
    let anyGear = false;
    for (const pt of this.contacts) {
      pt.force = 0;
      if (pt.kind === "gear" && s.gear.retract && c.gearPos < 0.98) continue;
      const rN = qRot(this.q, pt.r);
      const ptAlt = this.alt - rN[2];
      const comp = gA - ptAlt;
      pt.comp = comp;
      if (comp <= 0) continue;
      // contact point velocity (NED)
      const vPt = add(this.v, qRot(this.q, cross(this.w, pt.r)));
      const compRate = vPt[2];
      if (pt.kind === "gear" || pt.kind === "skid") {
        anyGear = true;
        if (compRate > this.touchdownVSmax) this.touchdownVSmax = compRate;
      } else {
        // structural contact
        const hs = Math.hypot(vPt[0], vPt[1]);
        if (pt.kind === "belly" && compRate < 3.5 && hs < 90) {
          this.damage = "동체 착륙 — 기체 손상";
        } else if (compRate > 2.5 || (pt.kind !== "belly" && hs > 12 && comp > 0.25) || comp > 1.5) {
          const what = { struct: pt.r[0] > 0 ? "기수" : "꼬리", tip: "날개끝", belly: "동체", tailrotor: "테일로터" }[pt.kind];
          this.crash(`충돌: ${what} 지면 접촉 (${(compRate * 196.85).toFixed(0)} fpm)`);
          return;
        }
      }
      let N = pt.k * Math.min(comp, 1.5) + pt.c * compRate;
      N = Math.max(N, 0);
      pt.force = N;
      // tyre friction in the ground plane
      const fwd = qRot(this.q, [1, 0, 0]);
      let hx = fwd[0], hy = fwd[1];
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl; hy /= hl;
      let steerAng = 0;
      if (pt.steer) {
        const vg = Math.hypot(this.v[0], this.v[1]);
        const maxSteer = (s.gear.type === "tail" ? 30 : 70) * DEG * clamp(1 - vg / 40, 0.12, 1);
        steerAng = clamp(c.tiller + c.rud, -1, 1) * maxSteer;
        if (s.gear.type === "tail" && Math.abs(c.rud) < 0.02) steerAng = 0;
      }
      const cs = Math.cos(steerAng), sn = Math.sin(steerAng);
      const dx = hx * cs - hy * sn, dy = hx * sn + hy * cs; // wheel heading
      const vLong = vPt[0] * dx + vPt[1] * dy;
      const vLat = -vPt[0] * dy + vPt[1] * dx;
      let muRoll = hard ? 0.015 : 0.05;
      let brake = 0;
      if (pt.kind === "gear" && !pt.steer) {
        brake = c.park ? 1 : pt.r[1] < 0 ? c.brakeL : c.brakeR;
      }
      if (pt.kind === "skid") brake = 1;
      const muBrake = hard ? 0.55 : 0.35;
      let muLong = muRoll + brake * muBrake;
      if (pt.kind !== "gear" && pt.kind !== "skid") muLong = 0.45; // sliding structure
      if (pt.kind === "skid") muLong = 0.5;
      const muLat = pt.kind === "gear" ? (hard ? 0.75 : 0.5) : 0.5;
      const fLong = -muLong * N * Math.tanh(vLong / 0.25);
      const fLat = -muLat * N * Math.tanh(vLat / 0.4);
      const fN = [fLong * dx - fLat * dy, fLong * dy + fLat * dx, -N];
      const fBody = qRotInv(this.q, fN);
      Fb[0] += fBody[0]; Fb[1] += fBody[1]; Fb[2] += fBody[2];
      const mm = cross(pt.r, fBody);
      Mb[0] += mm[0]; Mb[1] += mm[1]; Mb[2] += mm[2];
      if (pt.kind === "gear" || pt.kind === "skid") this.wow = true;
    }
    if (anyGear && !this.onGround) {
      // touchdown event
      this.touchdownVS = this.touchdownVSmax || 0;
      this.onTouchdown?.(this.touchdownVS);
      if (this.touchdownVS > 4.6) this.crash(`착륙 장치 파손: 접지 강하율 ${(this.touchdownVS * 196.85).toFixed(0)} fpm`);
      else if (this.touchdownVS > 3.0) this.damage = `하드 랜딩 (${(this.touchdownVS * 196.85).toFixed(0)} fpm)`;
    }
    if (!anyGear) this.touchdownVSmax = 0;
    this.onGround = anyGear;
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    this.onCrash?.(reason);
  }

  updateTelemetry(atm, vb, V, M, env, wind) {
    const [phi, theta, psi] = qToEuler(this.q);
    const t = this.telemetry;
    t.phi = phi; t.theta = theta; t.psi = psi;
    t.tas = V;
    t.cas = casFromTas(V, atm);
    t.ias = t.cas;
    t.mach = M;
    t.gs = Math.hypot(this.v[0], this.v[1]);
    t.trk = Math.atan2(this.v[1], this.v[0]);
    t.vs = -this.v[2];
    t.alt = this.alt;
    t.agl = this.alt - (env.groundAlt ?? -1e4) - this.cgHeight;
    t.baroAlt = baroAltitude(atm.p, env.altSetting || 101325) + 0; // indicated altitude (m)
    t.alpha = this.alpha;
    t.beta = this.beta;
    t.nz = this.nz;
    t.oat = atm.T - 273.15;
    t.sat = t.oat;
    t.windDir = Math.atan2(-wind[1], -wind[0]);
    t.windSpd = Math.hypot(wind[0], wind[1]);
    t.fuel = this.fuel;
    t.ff = this.fuelFlow || 0;
    t.mass = this.mass;
    t.stall = this.stall;
    t.stallWarn = !this.heli && !this.wow && V > 5 && this.stallMargin < 0.035;
    t.onGround = this.onGround;
    t.p = this.w[0]; t.q = this.w[1]; t.r = this.w[2];
  }
}

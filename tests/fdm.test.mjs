// Headless flight-model regression tests: every aircraft must trim, fly
// hands-off without diverging, take off, and follow autopilot commands.
// Run: node tests/fdm.test.mjs [aircraftId]
import { AIRCRAFT } from "../src/sim/aircraft.js";
import { FlightModel } from "../src/sim/fdm.js";
import { FCS } from "../src/sim/fcs.js";
import { DEG, KT, FT, RAD, wrap180 } from "../src/sim/math.js";

const only = process.argv[2];
const DT = 1 / 120;
const env = { groundAlt: 0, wind: [0, 0, 0], dT: 0, qnh: 101325, turb: 0 };
let failures = 0;
const fail = (id, msg) => {
  failures++;
  console.log(`  ✗ ${id}: ${msg}`);
};

function run(fm, fcs, secs, pilot, nav) {
  for (let i = 0; i < secs / DT; i++) {
    fcs.update(DT, pilot, nav);
    fm.step(DT, env);
    if (fm.crashed || !Number.isFinite(fm.alt)) return false;
  }
  return true;
}

for (const spec of AIRCRAFT) {
  if (only && spec.id !== only) continue;
  const fm = new FlightModel(spec, { fuelFrac: 0.5, payloadFrac: 0.5 });
  const fcs = new FCS(fm);
  const d = fm.d;
  const line = [];
  const heli = fm.heli;
  if (!heli) {
    line.push(`CD0=${d.CD0.toFixed(4)} CLmax=${d.CLmax.toFixed(2)}/${d.CLmaxLand.toFixed(2)} CLa=${d.CLa.toFixed(2)}`);
    if (spec.eng.lapseX) line.push(`lapse=${spec.eng.lapseX.toFixed(2)}`);
  }

  // ---- 1. hands-off trimmed flight
  const alt0 = (heli ? 1500 : Math.min(5000, spec.ceil * 0.5)) * FT;
  const spd0 = heli ? 80 : Math.max(spec.vs1 * 1.5, spec.vref + 20);
  fm.placeInAir(0.6, 0.2, alt0, 0, spd0);
  fcs.update(DT, { pitch: 0, roll: 0, yaw: 0, thr: fm.ctl.thr[0], collective: 0.6 });
  const thr0 = fm.ctl.thr[0];
  let ok = run(fm, fcs, 30, { pitch: 0, roll: 0, yaw: 0, thr: thr0, collective: heli ? 0.62 : 0 });
  const t = fm.telemetry;
  if (!ok) fail(spec.id, `hands-off crashed: ${fm.crashReason}`);
  else if (!heli) {
    const dAlt = (t.alt - alt0) / FT;
    line.push(`handsoff dAlt=${dAlt.toFixed(0)}ft θ=${(t.theta * RAD).toFixed(1)} φ=${(t.phi * RAD).toFixed(1)} ias=${(t.cas / KT).toFixed(0)}`);
    if (Math.abs(dAlt) > 1500 || Math.abs(t.phi) > 30 * DEG) fail(spec.id, `hands-off divergence dAlt=${dAlt.toFixed(0)} phi=${(t.phi * RAD).toFixed(0)}`);
  }

  // ---- 2. autopilot: HDG +90, ALT +2000 FLC/VS
  if (!heli && spec.ap) {
    fm.placeInAir(0.6, 0.2, alt0, 0, spd0);
    const fcs2 = new FCS(fm);
    fcs2.update(DT, { pitch: 0, roll: 0, yaw: 0, thr: fm.ctl.thr[0] });
    fm.step(DT, env);
    fcs2.engageAP();
    fcs2.ap.lat = "HDG";
    fcs2.ap.hdg = 90 * DEG;
    fcs2.ap.vert = "VS";
    const slow = ["ga", "prop-twin", "aero", "warbird", "tp"].includes(spec.cat);
    fcs2.ap.vs = (slow ? 400 : 1000) * FT / 60;
    fcs2.ap.alt = alt0 + (slow ? 1000 : 2000) * FT;
    fcs2.ap.altArm = true;
    fcs2.ap.spd = spd0;
    if (fcs2.hasAT) fcs2.ap.at = true;
    const pilot = { pitch: 0, roll: 0, yaw: 0, thr: slow ? 1 : Math.min(fm.ctl.thr[0] + 0.25, 0.85) };
    ok = true;
    for (let i = 0; i < 240 / DT && ok; i++) {
      if (fcs2.ap.vert === "ALT") pilot.thr = fm.solveTrim(fm.telemetry.tas, fm.alt).thr;
      ok = run(fm, fcs2, DT, pilot);
    }
    const t2 = fm.telemetry;
    const hdgErr = wrap180(t2.psi * RAD - 90);
    const altErr = (t2.alt - fcs2.ap.alt) / FT;
    line.push(`AP hdgErr=${hdgErr.toFixed(1)} altErr=${altErr.toFixed(0)} ias=${(t2.cas / KT).toFixed(0)} mode=${fcs2.ap.vert}`);
    if (!ok) fail(spec.id, `AP crashed: ${fm.crashReason}`);
    else if (Math.abs(hdgErr) > 5 || Math.abs(altErr) > 250) fail(spec.id, `AP tracking hdgErr=${hdgErr.toFixed(1)} altErr=${altErr.toFixed(0)}`);
  }

  // ---- 3. takeoff
  if (!spec.airStart) {
    const fm3 = new FlightModel(spec, { fuelFrac: 0.5, payloadFrac: 0.5 });
    const f3 = new FCS(fm3);
    fm3.placeOnGround(0.6, 0.2, 0, 0);
    for (const e of fm3.engines) e.setRunning();
    fm3.ctl.park = false;
    const toFlap = heli ? 0 : Math.min(spec.flaps.length - 1, spec.flaps.length > 3 ? 2 : spec.flaps.length > 1 ? 1 : 0);
    fm3.ctl.flap = toFlap;
    fm3.ctl.flapPos = spec.flaps[toFlap][1];
    let dist = 0, liftoff = null, maxPitch = 0, thT = 0;
    // rotate to 80 % of the tail-strike attitude (max 12°)
    const main = fm3.contacts.find((p) => p.kind === "gear" && p.r[1] !== 0) || fm3.contacts[0];
    const tail = fm3.contacts.find((p) => p.kind === "struct" && p.r[0] < 0);
    const strike = Math.atan2(main.r[2] - tail.r[2], main.r[0] - tail.r[0]);
    const rot = Math.min(12 * DEG, strike * 0.8);
    const lat0 = fm3.lat;
    const maxThr = spec.eng.ab ? 1 : 1;
    for (let i = 0; i < 90 / DT; i++) {
      const tt = fm3.telemetry;
      let pitch = 0;
      if (heli) {
        f3.update(DT, { pitch: 0, roll: 0, yaw: 0, thr: 0, collective: i * DT > 3 ? 0.85 : 0.3 });
      } else {
        if (tt.cas >= spec.vr * KT) pitch = clamp((rot - tt.theta) * 3, -0.3, 0.7);
        if (!fm3.wow && liftoff !== null) {
          // climb at Vy / V2+15 by pitch
          const vy = Math.max(spec.vs1 * 1.3, spec.vr + 12) * KT;
          thT = clamp(thT + (tt.cas - vy) * 0.003 * DT, 2 * DEG, Math.min(rot + 4 * DEG, 15 * DEG));
          pitch = clamp((thT - tt.theta) * 2.5 - (tt.q || 0) * 0.8, -0.6, 0.6);
          if (tt.agl > 50 * FT && tt.vs > 0) fm3.ctl.gear = 0;
          if (tt.agl > 300 * FT) fm3.ctl.flap = 0;
        } else thT = rot;
        f3.update(DT, { pitch, roll: -(tt.phi || 0) * 1.5, yaw: 0, thr: maxThr });
      }
      fm3.step(DT, env);
      if (fm3.crashed) break;
      if (!fm3.wow && liftoff === null && (tt.agl ?? 0) > 1) liftoff = { d: (fm3.lat - lat0) * 6371000, v: tt.cas / KT, t: i * DT };
      maxPitch = Math.max(maxPitch, tt.theta);
      if (tt.agl > 1000 * FT) break;
    }
    if (fm3.crashed) fail(spec.id, `takeoff crash: ${fm3.crashReason}`);
    else if (!liftoff) fail(spec.id, `no liftoff within 90 s (ias ${(fm3.telemetry.cas / KT).toFixed(0)} kt)`);
    else {
      line.push(`T/O roll=${liftoff.d.toFixed(0)}m @${liftoff.v.toFixed(0)}kt t=${liftoff.t.toFixed(0)}s agl=${(fm3.telemetry.agl / FT).toFixed(0)}ft`);
      if (!heli && fm3.telemetry.agl < 500 * FT) fail(spec.id, `weak climb after liftoff: agl ${(fm3.telemetry.agl / FT).toFixed(0)} ft`);
    }
  }

  // ---- 4. max level speed at cruise altitude (non-heli)
  if (!heli && spec.cr) {
    const fm4 = new FlightModel(spec, { fuelFrac: 0.5, payloadFrac: 0.5 });
    const alt = spec.cr[1] * FT;
    const V = spec.cr[0] * KT;
    fm4.ctl.gear = fm4.ctl.gearPos = spec.gear.retract ? 0 : 1;
    const tr = fm4.solveTrim(V, alt, 0);
    line.push(`cruise thr=${tr.thr.toFixed(2)} α=${(tr.alpha * RAD).toFixed(1)}`);
    if (tr.thr > 0.999) fail(spec.id, `cannot sustain published cruise ${spec.cr[0]} KTAS @ ${spec.cr[1]} ft`);
  }
  console.log(`${spec.id.padEnd(10)} ${line.join(" | ")}`);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
console.log(failures ? `\n${failures} failure(s)` : "\nall aircraft passed");
process.exit(failures ? 1 : 0);

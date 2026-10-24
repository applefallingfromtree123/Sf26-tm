// Analog "steam gauge" instruments: six-pack, engine gauges, helicopter and glider panels.
import { COL, FONT_SANS, txt, line, poly, dialFace, dialTicks, arcBand, needle, fmtHdg } from "./common.js";
import { DEG, RAD } from "../../sim/math.js";

const TWO_PI = Math.PI * 2;

export function asi(ctx, cx, cy, r, S) {
  const sp = S.spec;
  const vmax = Math.ceil(((sp.vne || 160) * 1.15) / 20) * 20;
  const vmin = 0;
  const a0 = 0.18, a1 = TWO_PI * 0.92;
  const k = (v) => a0 + ((Math.max(v, vmin) - vmin) / (vmax - vmin)) * (a1 - a0);
  dialFace(ctx, cx, cy, r);
  if (sp.vs0) {
    arcBand(ctx, cx, cy, r * 0.93, k(sp.vs0), k(Math.min(sp.vfe || sp.vno * 0.75, sp.vno)), COL.white, r * 0.05);
    arcBand(ctx, cx, cy, r * 0.87, k(sp.vs1), k(sp.vno), "#22b24c", r * 0.07);
    arcBand(ctx, cx, cy, r * 0.87, k(sp.vno), k(sp.vne), COL.yellow, r * 0.07);
  }
  const redA = k(sp.vne);
  line(ctx, cx + Math.sin(redA) * r * 0.78, cy - Math.cos(redA) * r * 0.78, cx + Math.sin(redA) * r * 0.98, cy - Math.cos(redA) * r * 0.98, COL.red, 3);
  const step = vmax > 300 ? 50 : vmax > 180 ? 20 : 10;
  dialTicks(ctx, cx, cy, r, a0, a1, 0, vmax, step * 2, step, (v) => (v >= 40 || v === 0 ? String(v) : ""), r * 0.15);
  txt(ctx, "KNOTS", cx, cy + r * 0.3, COL.grey, r * 0.11, "center", "middle", FONT_SANS);
  needle(ctx, cx, cy, r * 0.82, k(S.kias), COL.white, Math.max(2, r * 0.04));
}

export function attitude(ctx, cx, cy, r, S) {
  const t = S.t;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-t.phi);
  const py = t.theta * RAD * (r / 30);
  ctx.fillStyle = "#2e6fc0";
  ctx.fillRect(-r * 2, -r * 2 + py, r * 4, r * 2);
  ctx.fillStyle = "#7a4a22";
  ctx.fillRect(-r * 2, py, r * 4, r * 2);
  line(ctx, -r * 2, py, r * 2, py, COL.white, 2);
  for (const p of [-20, -10, -5, 5, 10, 20]) {
    const y = py - p * (r / 30);
    const w = Math.abs(p) === 5 ? r * 0.15 : r * 0.3;
    line(ctx, -w, y, w, y, COL.white, 1.5);
  }
  ctx.restore();
  // bank ticks
  ctx.save();
  ctx.translate(cx, cy);
  for (const a of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) {
    const aa = a * DEG;
    line(ctx, Math.sin(aa) * r * 0.85, -Math.cos(aa) * r * 0.85, Math.sin(aa) * r, -Math.cos(aa) * r, COL.white, Math.abs(a) % 30 === 0 ? 3 : 1.5);
  }
  ctx.rotate(-t.phi);
  poly(ctx, [[0, -r * 0.84], [-6, -r * 0.72], [6, -r * 0.72]], null, COL.orange || COL.amber);
  ctx.restore();
  ctx.strokeStyle = "#3a3f46";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, TWO_PI);
  ctx.stroke();
  // miniature aircraft
  line(ctx, cx - r * 0.5, cy, cx - r * 0.15, cy, COL.amber, 4);
  line(ctx, cx + r * 0.15, cy, cx + r * 0.5, cy, COL.amber, 4);
  ctx.fillStyle = COL.amber;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, TWO_PI);
  ctx.fill();
}

export function altimeter(ctx, cx, cy, r, S) {
  dialFace(ctx, cx, cy, r);
  dialTicks(ctx, cx, cy, r, 0, TWO_PI - TWO_PI / 50, 0, 980, 100, 20, (v) => String(v / 100), r * 0.2);
  const alt = S.altFt;
  // Kollsman window
  ctx.fillStyle = "#000";
  ctx.fillRect(cx + r * 0.25, cy - r * 0.1, r * 0.5, r * 0.2);
  txt(ctx, S.baroInHg ? S.baroInHg.toFixed(2) : "", cx + r * 0.5, cy, COL.white, r * 0.13);
  txt(ctx, "ALT", cx, cy - r * 0.35, COL.grey, r * 0.12, "center", "middle", FONT_SANS);
  needle(ctx, cx, cy, r * 0.5, ((alt / 10000) % 1) * TWO_PI, COL.white, 1.5);
  needle(ctx, cx, cy, r * 0.55, ((alt / 1000) % 10) / 10 * TWO_PI, COL.white, Math.max(3, r * 0.06));
  needle(ctx, cx, cy, r * 0.85, ((alt % 1000) / 1000) * TWO_PI, COL.white, Math.max(2, r * 0.035));
}

export function turnCoordinator(ctx, cx, cy, r, S) {
  dialFace(ctx, cx, cy, r);
  txt(ctx, "L", cx - r * 0.75, cy + r * 0.3, COL.white, r * 0.14);
  txt(ctx, "R", cx + r * 0.75, cy + r * 0.3, COL.white, r * 0.14);
  txt(ctx, "2 MIN", cx, cy + r * 0.72, COL.grey, r * 0.11);
  for (const a of [-20, 0, 20]) {
    const aa = (a + 90) * DEG;
    line(ctx, cx - Math.cos(aa) * r * 0.78, cy + Math.sin(aa) * r * 0.05 + (a ? r * 0.18 : 0), cx - Math.cos(aa) * r * 0.95, cy + (a ? r * 0.22 : 0), COL.white, 2);
  }
  const rate = (S.t.r * Math.cos(S.t.phi) + S.t.q * Math.sin(S.t.phi)) * RAD; // deg/s
  const bank = Math.max(-40, Math.min(40, (rate / 3) * 20)) * DEG;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank);
  line(ctx, -r * 0.72, 0, r * 0.72, 0, COL.white, 4);
  ctx.fillStyle = COL.white;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, TWO_PI);
  ctx.fill();
  line(ctx, 0, -r * 0.1, 0, -r * 0.22, COL.white, 3);
  ctx.restore();
  // inclinometer
  const ball = Math.max(-1, Math.min(1, -(S.fm?.ny ?? 0) * 6));
  ctx.strokeStyle = COL.white;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.45, r * 0.45, r * 0.1, 0, 0, TWO_PI);
  ctx.stroke();
  line(ctx, cx - r * 0.09, cy + r * 0.35, cx - r * 0.09, cy + r * 0.55, COL.white, 1.5);
  line(ctx, cx + r * 0.09, cy + r * 0.35, cx + r * 0.09, cy + r * 0.55, COL.white, 1.5);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(cx + ball * r * 0.36, cy + r * 0.45, r * 0.08, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = "#999";
  ctx.stroke();
}

export function headingIndicator(ctx, cx, cy, r, S) {
  dialFace(ctx, cx, cy, r);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-S.hdgDeg * DEG);
  for (let d = 0; d < 360; d += 5) {
    const a = d * DEG;
    const l = d % 10 === 0 ? r * 0.12 : r * 0.06;
    line(ctx, Math.sin(a) * r * 0.95, -Math.cos(a) * r * 0.95, Math.sin(a) * (r * 0.95 - l), -Math.cos(a) * (r * 0.95 - l), COL.white, 1.5);
    if (d % 30 === 0) {
      ctx.save();
      ctx.translate(Math.sin(a) * r * 0.68, -Math.cos(a) * r * 0.68);
      ctx.rotate(a);
      txt(ctx, { 0: "N", 90: "E", 180: "S", 270: "W" }[d] ?? String(d / 10), 0, 0, COL.white, r * 0.17);
      ctx.restore();
    }
  }
  ctx.rotate(S.ap.hdg);
  poly(ctx, [[-r * 0.07, -r * 0.97], [r * 0.07, -r * 0.97], [0, -r * 0.84]], null, COL.amber);
  ctx.restore();
  // airplane
  line(ctx, cx, cy - r * 0.5, cx, cy + r * 0.35, COL.amber, 3);
  line(ctx, cx - r * 0.3, cy - r * 0.1, cx + r * 0.3, cy - r * 0.1, COL.amber, 3);
  line(ctx, cx - r * 0.12, cy + r * 0.3, cx + r * 0.12, cy + r * 0.3, COL.amber, 3);
  poly(ctx, [[cx, cy - r], [cx - 5, cy - r - 8], [cx + 5, cy - r - 8]], null, COL.white);
}

export function vsi(ctx, cx, cy, r, S, maxFpm = 2000) {
  dialFace(ctx, cx, cy, r);
  const k = (v) => -Math.PI / 2 + (Math.max(-maxFpm, Math.min(maxFpm, v)) / maxFpm) * Math.PI * 0.94;
  for (let v = -maxFpm; v <= maxFpm; v += maxFpm / 20) {
    const a = k(v);
    const major = Math.abs(v) % (maxFpm / 4) < 1;
    line(ctx, cx + Math.sin(a) * r * (major ? 0.8 : 0.88), cy - Math.cos(a) * r * (major ? 0.8 : 0.88), cx + Math.sin(a) * r * 0.97, cy - Math.cos(a) * r * 0.97, COL.white, major ? 2 : 1);
    if (major && v % (maxFpm / 2) === 0) txt(ctx, String(Math.abs(v) / 1000 * (maxFpm >= 2000 ? 1 : 1)), cx + Math.sin(a) * r * 0.64, cy - Math.cos(a) * r * 0.64, COL.white, r * 0.16);
  }
  txt(ctx, "UP", cx - r * 0.3, cy - r * 0.35, COL.grey, r * 0.11);
  txt(ctx, "DN", cx - r * 0.3, cy + r * 0.35, COL.grey, r * 0.11);
  txt(ctx, "VERTICAL SPEED", cx + r * 0.05, cy - r * 0.12, COL.grey, r * 0.08);
  txt(ctx, "×1000 FPM", cx + r * 0.05, cy + r * 0.12, COL.grey, r * 0.08);
  needle(ctx, cx, cy, r * 0.85, k(S.vsFpm), COL.white, Math.max(2, r * 0.04));
}

export function genericGauge(ctx, cx, cy, r, v, vmin, vmax, label, fmt, bands = []) {
  dialFace(ctx, cx, cy, r);
  const a0 = -Math.PI * 0.75, a1 = Math.PI * 0.75;
  const k = (x) => a0 + ((Math.max(vmin, Math.min(vmax, x)) - vmin) / (vmax - vmin)) * (a1 - a0);
  for (const [b0, b1, col] of bands) arcBand(ctx, cx, cy, r * 0.88, k(b0), k(b1), col, r * 0.08);
  const span = vmax - vmin;
  const major = span / 5;
  dialTicks(ctx, cx, cy, r, a0, a1, vmin, vmax, major, major / 2, (x) => fmt(x), r * 0.17);
  txt(ctx, label, cx, cy + r * 0.45, COL.grey, r * 0.14, "center", "middle", FONT_SANS);
  needle(ctx, cx, cy, r * 0.82, k(v), COL.white, Math.max(2, r * 0.045));
}

/** Classic six-pack + engine cluster. */
export function drawSixPack(ctx, X, Y, W, H, S) {
  ctx.fillStyle = "#1c1f23";
  ctx.fillRect(X, Y, W, H);
  const r = Math.min(W * 0.085, H * 0.22);
  const gx = X + W * 0.06 + r;
  const dx = r * 2.35;
  const y1 = Y + H * 0.28, y2 = Y + H * 0.74;
  asi(ctx, gx, y1, r, S);
  attitude(ctx, gx + dx, y1, r, S);
  altimeter(ctx, gx + dx * 2, y1, r, S);
  turnCoordinator(ctx, gx, y2, r, S);
  headingIndicator(ctx, gx + dx, y2, r, S);
  vsi(ctx, gx + dx * 2, y2, r, S);
  // engine cluster
  const ex = gx + dx * 3.1;
  const e = S.engines[0];
  const er = r * 0.82;
  if (S.engType === "piston") {
    genericGauge(ctx, ex, y1, er, e.rpm / 100, 0, 35, "RPM ×100", (x) => String(Math.round(x)), [[21, 27, "#22b24c"], [27, 35, COL.red]]);
  } else if (S.engType === "none") {
    genericGauge(ctx, ex, y1, er, S.t.nz, -2, 6, "G", (x) => String(Math.round(x)), [[-1.5, 4, "#22b24c"], [5.3, 6, COL.red]]);
  } else {
    genericGauge(ctx, ex, y1, er, e.torque, 0, 120, "TORQUE %", (x) => String(Math.round(x)), [[0, 100, "#22b24c"], [100, 120, COL.red]]);
  }
  if (S.engines.length > 1 && S.engType === "piston") {
    genericGauge(ctx, ex + er * 2.3, y1, er, S.engines[1].rpm / 100, 0, 35, "RPM 2 ×100", (x) => String(Math.round(x)), [[21, 27, "#22b24c"], [27, 35, COL.red]]);
  }
  const fuelFrac = S.fuelKg / Math.max(S.fuelCap, 1);
  if (S.engType !== "none") {
    genericGauge(ctx, ex, y2, er * 0.8, fuelFrac * 100, 0, 100, "FUEL %", (x) => (x % 50 === 0 ? String(x) : ""), [[0, 12, COL.red], [12, 100, "#22b24c"]]);
    genericGauge(ctx, ex + er * 1.9, y2, er * 0.8, e.oilP || 0, 0, 120, "OIL PSI", (x) => (x % 40 === 0 ? String(x) : ""), [[25, 100, "#22b24c"]]);
    genericGauge(ctx, ex + er * 3.8, y2, er * 0.8, e.egt, 0, 1000, S.engType === "piston" ? "EGT" : "ITT", (x) => (x % 500 === 0 ? String(x) : ""), []);
  }
  // annunciators
  const ay = Y + 12;
  const anns = [];
  if (S.stallWarn) anns.push(["STALL", COL.red]);
  if (S.gearRetract) anns.push([S.gearPos > 0.99 ? "GEAR DN" : S.gearPos < 0.01 ? "GEAR UP" : "GEAR ···", S.gearPos > 0.99 ? "#22b24c" : S.gearPos < 0.01 ? COL.grey : COL.red]);
  anns.push([`FLAPS ${S.flapLabel}`, COL.white]);
  if (S.park) anns.push(["PARK BRK", COL.red]);
  if (S.fuelKg < S.fuelCap * 0.1 && S.engType !== "none") anns.push(["LOW FUEL", COL.amber]);
  if (S.ap.master) anns.push([`AP ${S.fma.lat} ${S.fma.vert}`, "#22b24c"]);
  anns.forEach(([t, c], i) => txt(ctx, t, X + 10 + i * 100, ay, c, 12, "left"));
  txt(ctx, `TRIM ${S.trimPct >= 0 ? "▲" : "▼"}${Math.abs(S.trimPct).toFixed(0)}%`, X + W - 10, ay, COL.white, 12, "right");
}

/** Helicopter panel. */
export function drawHeliPanel(ctx, X, Y, W, H, S) {
  ctx.fillStyle = "#1c1f23";
  ctx.fillRect(X, Y, W, H);
  const r = Math.min(W * 0.08, H * 0.22);
  const dx = r * 2.3;
  const gx = X + W * 0.05 + r;
  const y1 = Y + H * 0.28, y2 = Y + H * 0.74;
  asi(ctx, gx, y1, r, S);
  attitude(ctx, gx + dx, y1, r, S);
  altimeter(ctx, gx + dx * 2, y1, r, S);
  vsi(ctx, gx, y2, r, S, 3000);
  headingIndicator(ctx, gx + dx, y2, r, S);
  turnCoordinator(ctx, gx + dx * 2, y2, r, S);
  const ex = gx + dx * 3.05;
  const fm = S.fm;
  genericGauge(ctx, ex, y1, r * 0.9, fm.heliTorque || 0, 0, 120, "TORQUE %", (x) => String(Math.round(x)), [[0, 100, "#22b24c"], [100, 120, COL.red]]);
  genericGauge(ctx, ex + r * 2.1, y1, r * 0.9, (fm.rotorE || 0) * 100, 0, 120, "NR %", (x) => String(Math.round(x)), [[95, 106, "#22b24c"], [106, 120, COL.red], [0, 90, COL.amber]]);
  genericGauge(ctx, ex, y2, r * 0.8, S.engines[0].egt, 0, 1000, "TOT °C", (x) => (x % 500 === 0 ? String(x) : ""), [[0, 780, "#22b24c"], [800, 1000, COL.red]]);
  genericGauge(ctx, ex + r * 2.1, y2, r * 0.8, (S.fuelKg / Math.max(S.fuelCap, 1)) * 100, 0, 100, "FUEL %", (x) => (x % 50 === 0 ? String(x) : ""), [[0, 10, COL.red], [10, 100, "#22b24c"]]);
  txt(ctx, `COLLECTIVE ${Math.round((fm.ctl.collective || 0) * 100)}%`, X + W - 12, Y + 14, COL.white, 12, "right");
  if (fm.vortexRing) txt(ctx, "VORTEX RING", X + W / 2, Y + 14, COL.red, 14);
  if ((fm.rotorE || 1) < 0.9) txt(ctx, "ROTOR LOW RPM", X + W / 2, Y + 30, COL.red, 14);
}

/** Glider panel: ASI, altimeter, TE variometer, compass, G. */
export function drawGliderPanel(ctx, X, Y, W, H, S) {
  ctx.fillStyle = "#e9e6df";
  ctx.fillRect(X, Y, W, H);
  const r = Math.min(W * 0.1, H * 0.4);
  const cy = Y + H / 2;
  const dx = r * 2.4;
  let x = X + W * 0.1 + r;
  asi(ctx, x, cy, r, S);
  x += dx;
  // total energy variometer (kt)
  const teVs = S.teVario; // kt
  dialFace(ctx, x, cy, r);
  const k = (v) => -Math.PI / 2 + (Math.max(-10, Math.min(10, v)) / 10) * Math.PI * 0.94;
  for (let v = -10; v <= 10; v += 1) {
    const a = k(v);
    line(ctx, x + Math.sin(a) * r * (v % 5 ? 0.88 : 0.8), cy - Math.cos(a) * r * (v % 5 ? 0.88 : 0.8), x + Math.sin(a) * r * 0.97, cy - Math.cos(a) * r * 0.97, COL.white, v % 5 ? 1 : 2);
    if (v % 5 === 0) txt(ctx, String(Math.abs(v)), x + Math.sin(a) * r * 0.64, cy - Math.cos(a) * r * 0.64, COL.white, r * 0.16);
  }
  txt(ctx, "TE VARIO kt", x, cy + r * 0.45, COL.grey, r * 0.11);
  needle(ctx, x, cy, r * 0.85, k(teVs), COL.yellow, 3);
  x += dx;
  altimeter(ctx, x, cy, r, S);
  x += dx;
  headingIndicator(ctx, x, cy, r, S);
  x += dx;
  genericGauge(ctx, x, cy, r * 0.8, S.t.nz, -3, 7, "G", (v) => String(Math.round(v)), [[-2.65, 5.3, "#22b24c"], [5.3, 7, COL.red]]);
  txt(ctx, `L/D ${S.glideRatio ? S.glideRatio.toFixed(0) : "--"}`, X + W - 14, Y + 16, "#222", 14, "right");
  txt(ctx, `AIRBRAKE ${Math.round(S.spoiler * 100)}%`, X + W - 14, Y + 34, "#222", 12, "right");
}

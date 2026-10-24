// Conformal head-up display (fighters; optional for other types) and the
// minimal external-view data strip.
import { COL, txt, line, poly, rect, fmtHdg } from "./common.js";
import { DEG, RAD, wrap180 } from "../../sim/math.js";

const HUD = "#46ff7a";

export function drawHUD(ctx, W, H, S, vfov, headYaw = 0, headPitch = 0) {
  const t = S.t;
  const ppr = H / 2 / Math.tan(vfov / 2); // pixels per radian
  const cx = W / 2 + headYaw * ppr * -1;
  const cy = H / 2 - headPitch * ppr * -1;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;
  ctx.strokeStyle = HUD;
  ctx.fillStyle = HUD;
  const lw = 1.6;
  // pitch ladder (conformal)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-t.phi);
  for (let p = -90; p <= 90; p += 5) {
    const y = (t.theta - p * DEG) * ppr;
    if (Math.abs(y) > H * 0.42) continue;
    const w = p === 0 ? W * 0.25 : W * 0.07;
    const gap = W * 0.04;
    ctx.setLineDash(p < 0 ? [8, 6] : []);
    if (p === 0) {
      line(ctx, -w, y, -gap, y, HUD, lw);
      line(ctx, gap, y, w, y, HUD, lw);
    } else {
      line(ctx, -gap - w, y, -gap, y, HUD, lw);
      line(ctx, gap, y, gap + w, y, HUD, lw);
      const tick = p > 0 ? 8 : -8;
      line(ctx, -gap - w, y, -gap - w, y + tick, HUD, lw);
      line(ctx, gap + w, y, gap + w, y + tick, HUD, lw);
      txt(ctx, String(Math.abs(p)), -gap - w - 16, y, HUD, 13);
      txt(ctx, String(Math.abs(p)), gap + w + 16, y, HUD, 13);
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
  // boresight (waterline)
  line(ctx, cx - 22, cy, cx - 8, cy, HUD, 2);
  line(ctx, cx + 8, cy, cx + 22, cy, HUD, 2);
  line(ctx, cx - 8, cy, cx, cy + 7, HUD, 2);
  line(ctx, cx + 8, cy, cx, cy + 7, HUD, 2);
  // flight path marker
  if (t.tas > 15) {
    const gamma = Math.asin(Math.max(-1, Math.min(1, t.vs / t.tas)));
    const fy = cy + (t.theta - gamma) * ppr * Math.cos(t.phi) + wrap180((t.trk - t.psi) * RAD) * DEG * ppr * Math.sin(t.phi);
    const fx = cx + wrap180((t.trk - t.psi) * RAD) * DEG * ppr * Math.cos(t.phi) - (t.theta - gamma) * ppr * Math.sin(t.phi);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, 8, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, fx - 20, fy, fx - 8, fy, HUD, 2);
    line(ctx, fx + 8, fy, fx + 20, fy, HUD, 2);
    line(ctx, fx, fy - 8, fx, fy - 16, HUD, 2);
  }
  // speed / altitude boxes
  const bx = W / 2 - W * 0.22, ax = W / 2 + W * 0.22;
  rect(ctx, bx - 70, cy - 16, 70, 32, HUD, "rgba(0,0,0,0.15)", 1.5);
  txt(ctx, String(Math.round(S.kias)), bx - 8, cy, HUD, 20, "right");
  rect(ctx, ax, cy - 16, 84, 32, HUD, "rgba(0,0,0,0.15)", 1.5);
  txt(ctx, String(Math.round(S.altFt)), ax + 78, cy, HUD, 20, "right");
  txt(ctx, `M ${S.mach.toFixed(2)}`, bx - 35, cy + 34, HUD, 14);
  txt(ctx, `G ${t.nz.toFixed(1)}`, bx - 35, cy + 54, HUD, 14);
  txt(ctx, `α ${(t.alpha * RAD).toFixed(1)}`, bx - 35, cy + 74, HUD, 14);
  txt(ctx, `${S.vsFpm >= 0 ? "+" : ""}${Math.round(S.vsFpm / 10) * 10}`, ax + 42, cy + 34, HUD, 14);
  if (S.radioAltFt < 5000) txt(ctx, `R ${Math.round(S.radioAltFt)}`, ax + 42, cy + 54, HUD, 14);
  // heading tape
  const hy = H * 0.12;
  const pxd = W * 0.006;
  for (let d = Math.floor(S.hdgDeg - 30); d <= S.hdgDeg + 30; d++) {
    if (d % 5) continue;
    const x = W / 2 + (d - S.hdgDeg) * pxd * 1.6;
    line(ctx, x, hy, x, hy + (d % 10 ? 6 : 11), HUD, 1.5);
    if (d % 10 === 0) txt(ctx, fmtHdg(d).slice(0, 2), x, hy - 10, HUD, 12);
  }
  poly(ctx, [[W / 2, hy + 14], [W / 2 - 6, hy + 24], [W / 2 + 6, hy + 24]], HUD, null, 1.5);
  // bank scale
  ctx.save();
  ctx.translate(W / 2, H * 0.78);
  for (const a of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
    const r0 = 70, r1 = a % 30 === 0 ? 82 : 76;
    const aa = a * DEG;
    line(ctx, Math.sin(aa) * r0, Math.cos(aa) * r0, Math.sin(aa) * r1, Math.cos(aa) * r1, HUD, 1.5);
  }
  ctx.rotate(t.phi);
  poly(ctx, [[0, 66], [-6, 56], [6, 56]], HUD, null, 1.5);
  ctx.restore();
  // status
  const lines = [];
  lines.push(`THR ${Math.round(S.thrPct)}%${S.engines.some((e) => e.ab > 0.05) ? " AB" : ""}`);
  if (S.gearRetract && S.gearPos > 0.01) lines.push(S.gearPos > 0.99 ? "GEAR DN" : "GEAR ···");
  if (S.flapPos > 0.01) lines.push(`FLAP ${S.flapLabel}`);
  if (S.spoiler > 0.02) lines.push("SPD BRK");
  if (S.ap.master) lines.push(`A/P ${S.fma.lat} ${S.fma.vert}`);
  lines.forEach((l, i) => txt(ctx, l, bx - 70, H * 0.66 + i * 18, HUD, 13, "left"));
  if (S.stallWarn) txt(ctx, "AOA", W / 2, cy + 60, COL.red, 22);
  if (S.gpws) txt(ctx, S.gpws, W / 2, cy + 90, COL.red, 20);
  ctx.restore();
}

/** Compact data strip for external views. */
export function drawDataStrip(ctx, W, H, S) {
  const items = [
    ["IAS", `${Math.round(S.kias)} kt`],
    ["GS", `${Math.round(S.gsKt)} kt`],
    ["ALT", `${Math.round(S.altFt)} ft`],
    ["AGL", `${Math.round(S.radioAltFt)} ft`],
    ["V/S", `${Math.round(S.vsFpm)} fpm`],
    ["HDG", `${fmtHdg(S.hdgDeg)}°`],
    ["THR", `${Math.round(S.thrPct)}%`],
    ["FLAP", S.flapLabel],
    ["GEAR", S.gearRetract ? (S.gearPos > 0.99 ? "DN" : S.gearPos < 0.01 ? "UP" : "···") : "FIXED"],
  ];
  const w = Math.min(W - 20, 820);
  const x0 = (W - w) / 2;
  ctx.fillStyle = "rgba(6,8,10,0.62)";
  ctx.fillRect(x0, H - 44, w, 36);
  const cw = w / items.length;
  items.forEach(([k, v], i) => {
    txt(ctx, k, x0 + cw * (i + 0.5), H - 34, COL.grey, 10);
    txt(ctx, v, x0 + cw * (i + 0.5), H - 18, COL.white, 13);
  });
  if (S.stallWarn) txt(ctx, "STALL", W / 2, H - 64, COL.red, 20);
}

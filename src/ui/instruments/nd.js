// Navigation Display / MFD moving map (ARC and ROSE modes).
import { COL, txt, line, rect, poly, clip, fmtHdg } from "./common.js";
import { DEG, RAD, NM, wrap180 } from "../../sim/math.js";

export function drawND(ctx, X, Y, W, H, S, opts = {}) {
  ctx.fillStyle = "#000";
  ctx.fillRect(X, Y, W, H);
  const t = S.t;
  const fm = S.fm;
  const mode = opts.mode || "arc";
  const range = S.ndRange; // NM (outer ring)
  const hdg = S.hdgDeg;
  const cx = X + W / 2;
  const cy = mode === "arc" ? Y + H * 0.84 : Y + H * 0.52;
  const R = mode === "arc" ? H * 0.74 : Math.min(W, H) * 0.4;
  const pxPerM = R / (range * NM);
  const cosLat = Math.cos(fm.lat);
  const project = (lat, lon) => {
    const n = (lat - fm.lat) * 6371000;
    const e = (lon - fm.lon) * 6371000 * cosLat;
    const a = hdg * DEG;
    const xr = e * Math.cos(a) - n * Math.sin(a);
    const yr = e * Math.sin(a) + n * Math.cos(a);
    return [cx + xr * pxPerM, cy - yr * pxPerM];
  };
  clip(ctx, X, Y, W, H);
  // terrain-ish background gradient
  // range rings
  ctx.strokeStyle = "#5a6068";
  ctx.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    if (mode === "arc") ctx.arc(cx, cy, R * f, -Math.PI * 0.85, -Math.PI * 0.15);
    else ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  txt(ctx, String(range / 2), cx - R * 0.5 * Math.cos(Math.PI * 0.35) - 12, cy - R * 0.5 * Math.sin(Math.PI * 0.35), COL.cyan, 11);

  // airports & navaids
  for (const a of S.nearAirports || []) {
    const [x, y] = project(a.lat, a.lon);
    if (Math.hypot(x - cx, y - cy) > R * 1.05) continue;
    const isArr = S.plan?.arr?.apt === a, isDep = S.plan?.dep?.apt === a;
    ctx.strokeStyle = isArr || isDep ? COL.white : COL.magenta + "cc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    if (range <= 80 || isArr || isDep) txt(ctx, a.ident, x + 8, y - 8, isArr || isDep ? COL.white : COL.magenta + "cc", 11, "left");
    // runways of the arrival/departure airport
    if ((isArr || isDep) && range <= 40) {
      for (const rw of a.runways) {
        const [x1, y1] = project(rw.lat, rw.lon);
        const [x2, y2] = project(rw.endLat, rw.endLon);
        line(ctx, x1, y1, x2, y2, COL.white, 3);
      }
    }
  }
  for (const n of S.nearNavaids || []) {
    const [x, y] = project(n.lat, n.lon);
    if (Math.hypot(x - cx, y - cy) > R * 1.05) continue;
    if (range > 160) continue;
    const vor = n.type <= 4;
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 1.2;
    if (vor) {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * 5, py = y + Math.sin(a) * 5;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    txt(ctx, n.ident, x + 7, y + 8, COL.cyan, 10, "left");
  }

  // ILS localizer course
  if (S.plan?.arr?.hasIls) {
    const rw = S.plan.arr;
    const [x1, y1] = project(rw.lat, rw.lon);
    const far = rw.alongRad(-15 * NM);
    const [x2, y2] = project(far[0], far[1]);
    ctx.setLineDash([10, 6]);
    line(ctx, x1, y1, x2, y2, COL.magenta, 1.5);
    ctx.setLineDash([]);
  }

  // flight plan route
  const pts = S.plan?.points || [];
  if (pts.length > 1) {
    ctx.lineWidth = 2.5;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = project(pts[i - 1].lat, pts[i - 1].lon);
      const [x2, y2] = project(pts[i].lat, pts[i].lon);
      const active = S.nav?.leg?.index === i;
      line(ctx, x1, y1, x2, y2, active ? COL.magenta : COL.white, active ? 3 : 2);
    }
    pts.forEach((p, i) => {
      const [x, y] = project(p.lat, p.lon);
      const active = S.nav?.leg?.index === i;
      poly(ctx, [[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]], active ? COL.magenta : COL.white, null, 2);
      txt(ctx, p.ident, x + 9, y + 1, active ? COL.magenta : COL.white, 11, "left");
    });
  }
  ctx.restore();

  // compass arc / rose
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = COL.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (mode === "arc") ctx.arc(0, 0, R, -Math.PI * 0.5 - 0.8, -Math.PI * 0.5 + 0.8);
  else ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  for (let d = 0; d < 360; d += 5) {
    const rel = wrap180(d - hdg);
    if (mode === "arc" && Math.abs(rel) > 46) continue;
    const a = rel * DEG;
    const l = d % 10 === 0 ? 12 : 6;
    line(ctx, Math.sin(a) * R, -Math.cos(a) * R, Math.sin(a) * (R - l), -Math.cos(a) * (R - l), COL.white, 1.5);
    if (d % 30 === 0) {
      ctx.save();
      ctx.translate(Math.sin(a) * (R - 24), -Math.cos(a) * (R - 24));
      ctx.rotate(a);
      txt(ctx, String(d / 10), 0, 0, COL.white, 14);
      ctx.restore();
    }
  }
  // heading bug
  const hb = wrap180(S.ap.hdg * RAD - hdg) * DEG;
  ctx.save();
  ctx.rotate(hb);
  poly(ctx, [[-8, -R], [8, -R], [8, -R + 7], [0, -R + 12], [-8, -R + 7]], COL.cyan, null, 2);
  ctx.restore();
  // track line
  const tr = wrap180(S.trkDeg - hdg) * DEG;
  ctx.save();
  ctx.rotate(tr);
  ctx.setLineDash([6, 5]);
  line(ctx, 0, -18, 0, -R, COL.green, 1.5);
  ctx.setLineDash([]);
  ctx.restore();
  ctx.restore();
  // aircraft symbol
  poly(ctx, [[cx, cy - 16], [cx - 4, cy - 6], [cx - 16, cy - 2], [cx - 16, cy + 2], [cx - 4, cy + 2], [cx - 2, cy + 10], [cx - 7, cy + 14], [cx + 7, cy + 14], [cx + 2, cy + 10], [cx + 4, cy + 2], [cx + 16, cy + 2], [cx + 16, cy - 2], [cx + 4, cy - 6]], COL.yellow, null, 2);
  // heading readout
  rect(ctx, cx - 26, Y + 6, 52, 22, COL.white, "#000", 1);
  txt(ctx, fmtHdg(hdg), cx, Y + 17, COL.white, 15);
  txt(ctx, "HDG", cx - 48, Y + 17, COL.green, 11);

  // corner data
  txt(ctx, `GS ${Math.round(S.gsKt)}  TAS ${Math.round(S.tasKt)}`, X + 8, Y + 14, COL.white, 12, "left");
  const wd = ((Math.round(S.windDir) % 360) + 360) % 360;
  txt(ctx, `${String(wd).padStart(3, "0")}°/${Math.round(S.windKt)}`, X + 8, Y + 30, COL.white, 12, "left");
  if (S.windKt > 1) {
    const a = (S.windDir + 180 - hdg) * DEG;
    const wx = X + 22, wy = Y + 56;
    line(ctx, wx - Math.sin(a) * 12, wy + Math.cos(a) * 12, wx + Math.sin(a) * 12, wy - Math.cos(a) * 12, COL.green, 2);
    poly(ctx, [[wx + Math.sin(a) * 14, wy - Math.cos(a) * 14], [wx + Math.sin(a - 0.5) * 7, wy - Math.cos(a - 0.5) * 7], [wx + Math.sin(a + 0.5) * 7, wy - Math.cos(a + 0.5) * 7]], COL.green, COL.green);
  }
  if (S.nav?.leg) {
    const lg = S.nav.leg;
    txt(ctx, lg.to.ident, X + W - 8, Y + 14, COL.magenta, 13, "right");
    txt(ctx, `${(lg.dist / NM).toFixed(1)} NM`, X + W - 8, Y + 30, COL.white, 12, "right");
    const ete = S.gsKt > 30 ? (lg.dist / NM / S.gsKt) * 60 : null;
    if (ete != null) txt(ctx, `${Math.floor(ete / 60)}:${String(Math.floor(ete % 60)).padStart(2, "0")} ETE`, X + W - 8, Y + 46, COL.white, 11, "right");
  }
  if (S.nav?.remaining != null && S.gsKt > 30) {
    txt(ctx, `DEST ${(S.nav.remaining / NM).toFixed(0)} NM`, X + W - 8, Y + H - 12, COL.white, 11, "right");
  }
  txt(ctx, `${range} NM`, X + 8, Y + H - 12, COL.cyan, 11, "left");
  if (S.nav?.nav1) txt(ctx, `VOR1 ${S.nav.nav1.ident} ${S.nav.nav1.dist.toFixed(1)}`, X + 8, Y + H - 28, COL.green, 11, "left");
}

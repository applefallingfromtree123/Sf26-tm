// Primary Flight Display (airliner / Garmin G1000 style) and HSI.
import { COL, FONT, txt, line, rect, poly, clip, fmtHdg, pad } from "./common.js";
import { DEG, RAD, wrap180 } from "../../sim/math.js";

export function drawPFD(ctx, X, Y, W, H, S, style = "airliner") {
  const g1000 = style === "g1000";
  ctx.fillStyle = "#000";
  ctx.fillRect(X, Y, W, H);
  const t = S.t;
  const fmaH = g1000 ? 0 : H * 0.085;
  const hdgH = g1000 ? H * 0.34 : H * 0.12;
  const tapeW = W * 0.16;
  const attX = X + tapeW + W * 0.03;
  const attW = W - tapeW * 2 - W * 0.13;
  const attY = Y + fmaH + H * 0.03;
  const attH = H - fmaH - hdgH - H * 0.05;
  const cx = attX + attW / 2;
  const cy = attY + attH * 0.5;

  // ---------------- attitude
  const pxPerDeg = attH / 36;
  clip(ctx, attX, attY, attW, attH);
  ctx.translate(cx, cy);
  ctx.rotate(-t.phi);
  const pitchPx = t.theta * RAD * pxPerDeg;
  const big = 2000;
  ctx.fillStyle = COL.sky;
  ctx.fillRect(-big, -big + pitchPx, big * 2, big);
  ctx.fillStyle = COL.ground;
  ctx.fillRect(-big, pitchPx, big * 2, big);
  line(ctx, -big, pitchPx, big, pitchPx, COL.white, 2);
  // pitch ladder
  for (let p = -90; p <= 90; p += 2.5) {
    if (p === 0) continue;
    const y = pitchPx - p * pxPerDeg;
    if (Math.abs(y) > attH * 0.55) continue;
    const major = p % 10 === 0, mid = p % 5 === 0;
    const hw = major ? attW * 0.16 : mid ? attW * 0.08 : attW * 0.04;
    line(ctx, -hw, y, hw, y, COL.white, major ? 2 : 1.5);
    if (major) {
      txt(ctx, String(Math.abs(p)), -hw - 16, y, COL.white, 13);
      txt(ctx, String(Math.abs(p)), hw + 16, y, COL.white, 13);
    }
  }
  ctx.restore();
  ctx.save();
  // bank scale
  const R = attH * 0.44;
  ctx.translate(cx, cy);
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const r0 = R, r1 = R + (Math.abs(a) % 30 === 0 ? 12 : 7);
    const ang = a * DEG;
    line(ctx, Math.sin(ang) * r0, -Math.cos(ang) * r0, Math.sin(ang) * r1, -Math.cos(ang) * r1, COL.white, 2);
  }
  poly(ctx, [[0, -R], [-7, -R - 11], [7, -R - 11]], COL.white, null, 1.5);
  ctx.rotate(-t.phi);
  const bankOver = Math.abs(t.phi) > 35 * DEG;
  poly(ctx, [[0, -R + 1], [-8, -R + 13], [8, -R + 13]], bankOver ? COL.amber : COL.white, bankOver ? COL.amber : null, 2);
  // slip/skid
  const slip = Math.max(-1, Math.min(1, (S.fm?.ny ?? 0) * -8));
  rect(ctx, -9 + slip * 18, -R + 15, 18, 5, bankOver ? COL.amber : COL.white, null, 2);
  ctx.restore();

  // flight director
  if (S.ap.fd && S.hasAP && !t.onGround) {
    const dp = (S.cmd.theta - t.theta) * RAD * pxPerDeg;
    const dr = (S.cmd.phi - t.phi) * RAD * 3;
    const fdC = g1000 ? COL.magenta : COL.green;
    line(ctx, cx - attW * 0.25, cy - Math.max(-attH * 0.3, Math.min(attH * 0.3, dp)), cx + attW * 0.25, cy - Math.max(-attH * 0.3, Math.min(attH * 0.3, dp)), fdC, 3);
    line(ctx, cx + Math.max(-attW * 0.3, Math.min(attW * 0.3, dr)), cy - attH * 0.25, cx + Math.max(-attW * 0.3, Math.min(attW * 0.3, dr)), cy + attH * 0.25, fdC, 3);
  }
  // aircraft symbol
  const ac = COL.yellow;
  if (g1000) {
    poly(ctx, [[cx, cy], [cx - attW * 0.2, cy + 22], [cx - attW * 0.12, cy + 22]], "#000", ac, 1);
    poly(ctx, [[cx, cy], [cx + attW * 0.2, cy + 22], [cx + attW * 0.12, cy + 22]], "#000", ac, 1);
  } else {
    rect(ctx, cx - attW * 0.3, cy - 3, attW * 0.12, 7, ac, "#000", 2.5);
    rect(ctx, cx + attW * 0.18, cy - 3, attW * 0.12, 7, ac, "#000", 2.5);
    rect(ctx, cx - 4, cy - 4, 8, 8, ac, "#000", 2.5);
  }
  // flight path vector (bird)
  if (!t.onGround && S.showFPV) {
    const fpaDev = (Math.asin(Math.max(-1, Math.min(1, t.vs / Math.max(t.tas, 1)))) - t.theta) * RAD * pxPerDeg;
    const drift = wrap180((t.trk - t.psi) * RAD) * pxPerDeg;
    const fx = cx + drift, fy = cy - fpaDev;
    ctx.strokeStyle = COL.green;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, 7, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, fx - 18, fy, fx - 7, fy, COL.green, 2);
    line(ctx, fx + 7, fy, fx + 18, fy, COL.green, 2);
    line(ctx, fx, fy - 7, fx, fy - 14, COL.green, 2);
  }
  // ILS deviation
  if (S.nav?.loc?.valid) {
    const dev = Math.max(-2.5, Math.min(2.5, S.nav.loc.dev));
    const yb = attY + attH - 16;
    for (const d of [-2, -1, 1, 2]) {
      ctx.strokeStyle = COL.white;
      ctx.beginPath();
      ctx.arc(cx + d * attW * 0.12, yb, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    poly(ctx, [[cx - dev * attW * 0.12, yb - 7], [cx - dev * attW * 0.12 + 9, yb], [cx - dev * attW * 0.12, yb + 7], [cx - dev * attW * 0.12 - 9, yb]], COL.magenta, COL.magenta);
    if (S.nav.gs?.valid) {
      const gd = Math.max(-2.5, Math.min(2.5, S.nav.gs.dev));
      const xb = attX + attW - 14;
      for (const d of [-2, -1, 1, 2]) {
        ctx.beginPath();
        ctx.arc(xb, cy + d * attH * 0.12, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      poly(ctx, [[xb - 7, cy + gd * attH * 0.12], [xb, cy + gd * attH * 0.12 - 9], [xb + 7, cy + gd * attH * 0.12], [xb, cy + gd * attH * 0.12 + 9]], COL.magenta, COL.magenta);
    }
    txt(ctx, `${S.nav.loc.rwy.apt.ident} ${S.nav.loc.rwy.ident}`, attX + 6, attY + 12, COL.magenta, 12, "left");
    txt(ctx, `ILS ${S.nav.loc.rwy.ilsFreq.toFixed(2)}`, attX + 6, attY + 27, COL.magenta, 11, "left");
    if (S.nav.dme != null) txt(ctx, `DME ${S.nav.dme.toFixed(1)}`, attX + 6, attY + 42, COL.white, 11, "left");
  }
  // radio altitude
  if (S.radioAltFt < 2500 && !t.onGround) {
    const ra = S.radioAltFt < 10 ? Math.round(S.radioAltFt) : Math.round(S.radioAltFt / 10) * 10;
    txt(ctx, String(ra), cx, attY + attH - 36, S.radioAltFt < (S.minimums || 200) ? COL.amber : COL.white, 18);
  }
  // warnings on the attitude
  if (S.stallWarn) txt(ctx, "STALL", cx, cy + attH * 0.2, COL.red, 22);
  if (S.overspeed) txt(ctx, "OVERSPEED", cx, cy - attH * 0.2, COL.red, 18);
  if (S.gpws) txt(ctx, S.gpws, cx, cy + attH * 0.32, COL.red, 18);

  // ---------------- speed tape
  const sx = X + W * 0.02, sy = attY, sh = attH;
  drawTape(ctx, sx, sy, tapeW, sh, S.kias, 4.2, 10, 20, (v) => (v >= 30 ? String(v) : ""), "left", S);
  if (S.mach > 0.4) txt(ctx, `M ${S.mach.toFixed(3).slice(1)}`, sx + tapeW / 2, sy + sh + 14, COL.green, 14);
  // speed target
  const spdTarget = S.ap.useMach ? `M.${pad(S.ap.mach * 1000, 3)}` : String(Math.round(S.ap.spd));
  if (S.hasAP) txt(ctx, spdTarget, sx + tapeW / 2, sy - 10, COL.magenta, 14);

  // ---------------- altitude tape
  const ax = X + W - tapeW - W * 0.085;
  drawTape(ctx, ax, sy, tapeW, sh, S.altFt, 0.34, 100, 500, (v) => String(v), "right", S);
  txt(ctx, `${Math.round(S.ap.alt / 0.3048 / 100) * 100}`, ax + tapeW / 2, sy - 10, COL.cyan, 14);
  txt(ctx, S.baroStr, ax + tapeW / 2, sy + sh + 14, S.baroStd ? COL.cyan : COL.cyan, 13);
  if (S.minimums && !g1000) txt(ctx, `MIN ${S.minimums}`, ax + tapeW / 2, sy + sh + 30, COL.grey, 11);

  // ---------------- vertical speed
  const vx = X + W - W * 0.075, vw = W * 0.065;
  rect(ctx, vx, sy + sh * 0.1, vw, sh * 0.8, null, "#2b2f35");
  const vsMax = 6000;
  const vsY = (v) => cy - Math.sign(v) * (1 - Math.exp(-Math.abs(v) / 2000)) / (1 - Math.exp(-vsMax / 2000)) * sh * 0.4;
  for (const v of [-6000, -2000, -1000, -500, 0, 500, 1000, 2000, 6000]) {
    line(ctx, vx, vsY(v), vx + (v % 1000 === 0 ? 10 : 6), vsY(v), COL.white, 1.5);
    if (v && Math.abs(v) !== 500) txt(ctx, String(Math.abs(v) / 1000), vx + 17, vsY(v), COL.white, 11);
  }
  line(ctx, vx + vw, cy, vx + 3, vsY(S.vsFpm), COL.green, 2.5);
  if (Math.abs(S.vsFpm) > 200) txt(ctx, String(Math.round(Math.abs(S.vsFpm) / 50) * 50), vx + vw / 2, S.vsFpm > 0 ? sy + sh * 0.06 : sy + sh * 0.95, COL.green, 12);
  if (S.ap.vert === "VS") {
    const yb = vsY(S.ap.vs / 0.3048 * 60);
    poly(ctx, [[vx, yb - 5], [vx + 8, yb], [vx, yb + 5]], null, COL.cyan);
  }

  // ---------------- heading
  if (g1000) {
    drawHSI(ctx, cx, Y + H - hdgH * 0.52, hdgH * 0.46, S);
  } else {
    const hy = Y + H - hdgH;
    clip(ctx, attX, hy, attW, hdgH);
    rect(ctx, attX, hy, attW, hdgH, null, "#2b2f35");
    const hdg = S.hdgDeg;
    const pxd = attW / 50;
    for (let d = Math.floor(hdg - 30); d <= hdg + 30; d++) {
      if (d % 5) continue;
      const x = cx + (d - hdg) * pxd;
      line(ctx, x, hy, x, hy + (d % 10 ? 7 : 12), COL.white, 1.5);
      if (d % 10 === 0) txt(ctx, String((((d % 360) + 360) % 360) / 10), x, hy + 22, COL.white, 13);
    }
    const hb = cx + wrap180(S.ap.hdg * RAD - hdg) * pxd;
    poly(ctx, [[hb - 7, hy], [hb + 7, hy], [hb + 7, hy + 7], [hb, hy + 11], [hb - 7, hy + 7]], COL.cyan, null, 2);
    const tk = cx + wrap180(S.trkDeg - hdg) * pxd;
    ctx.strokeStyle = COL.green;
    ctx.beginPath();
    ctx.arc(tk, hy + 6, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    line(ctx, cx, hy - 4, cx, hy + 14, COL.yellow, 3);
    rect(ctx, cx - 24, hy - 26, 48, 20, COL.white, "#000", 1);
    txt(ctx, fmtHdg(hdg), cx, hy - 16, COL.white, 14);
  }

  // ---------------- FMA
  if (!g1000) drawFMA(ctx, X, Y, W, fmaH, S);
  else drawG1000Bar(ctx, X, Y, W, S);
}

function drawTape(ctx, x, y, w, h, value, pxPer, minor, major, label, side, S) {
  const cy = y + h / 2;
  rect(ctx, x, y, w, h, null, "#3a3f47");
  clip(ctx, x, y, w, h);
  const span = h / 2 / pxPer;
  const v0 = Math.floor((value - span) / minor) * minor;
  for (let v = v0; v <= value + span; v += minor) {
    if (side === "left" && v < 30) continue;
    const yy = cy - (v - value) * pxPer;
    const isMajor = v % major === 0;
    if (side === "left") {
      line(ctx, x + w - (isMajor ? 12 : 7), yy, x + w, yy, COL.white, 1.5);
      if (isMajor) txt(ctx, label(v), x + w - 16, yy, COL.white, 14, "right");
    } else {
      line(ctx, x, yy, x + (isMajor ? 12 : 7), yy, COL.white, 1.5);
      if (isMajor) txt(ctx, label(v), x + 16, yy, COL.white, 13, "left");
    }
  }
  if (side === "left") {
    // barber pole (VMO/MMO) and low speed band
    const vmoY = cy - (S.vmoKt - value) * pxPer;
    for (let yy = vmoY; yy > y - 20; yy -= 12) {
      rect(ctx, x + w - 7, yy - 12, 7, 6, null, COL.red);
      rect(ctx, x + w - 7, yy - 6, 7, 6, null, COL.white);
    }
    if (!S.t.onGround && S.vStallKt) {
      const vsY = cy - (S.vStallKt - value) * pxPer;
      const vlsY = cy - (S.vStallKt * 1.13 - value) * pxPer;
      rect(ctx, x + w - 7, vlsY, 4, vsY - vlsY, null, COL.amber);
      for (let yy = vsY; yy < y + h + 20; yy += 12) {
        rect(ctx, x + w - 7, yy, 7, 6, null, COL.red);
        rect(ctx, x + w - 7, yy + 6, 7, 6, null, "#000");
      }
    }
    if (S.vfeKt) {
      const yy = cy - (S.vfeKt - value) * pxPer;
      line(ctx, x + w - 12, yy, x + w, yy, COL.amber, 3);
    }
    // speed bug
    const bugV = S.ap.useMach ? S.machBugKt : S.ap.spd;
    if (S.hasAP) {
      const by = Math.max(y, Math.min(y + h, cy - (bugV - value) * pxPer));
      poly(ctx, [[x + w, by], [x + w + 8, by - 7], [x + w + 8, by + 7]], COL.magenta, null, 2);
    }
    // trend vector (10 s)
    if (S.speedTrend && Math.abs(S.speedTrend) > 1) {
      const ty = cy - S.speedTrend * pxPer;
      line(ctx, x + w - 3, cy, x + w - 3, ty, COL.green, 2);
      poly(ctx, [[x + w - 3, ty], [x + w - 7, ty + Math.sign(S.speedTrend) * 7], [x + w + 1, ty + Math.sign(S.speedTrend) * 7]], COL.green, null, 1.5);
    }
    // V-speeds on ground
    if (S.t.onGround && S.vr) {
      for (const [v, lbl] of [[S.v1, "1"], [S.vr, "R"], [S.v2, "2"]]) {
        const yy = cy - (v - value) * pxPer;
        line(ctx, x + w - 6, yy, x + w + 4, yy, COL.cyan, 2);
        txt(ctx, lbl, x + w + 10, yy, COL.cyan, 11);
      }
    }
  } else {
    // altitude bug
    const bug = S.ap.alt / 0.3048;
    const by = Math.max(y, Math.min(y + h, cy - (bug - value) * pxPer));
    poly(ctx, [[x, by - 9], [x + 8, by - 9], [x + 8, by + 9], [x, by + 9], [x + 5, by]], COL.cyan, null, 2);
    // ground reference
    if (S.groundAltFt != null) {
      const gy = cy - (S.groundAltFt - value) * pxPer;
      if (gy < y + h) rect(ctx, x, gy, 10, y + h - gy + 10, null, COL.amber + "aa");
    }
    if (S.minimums && S.arrElevFt != null) {
      const my = cy - (S.arrElevFt + S.minimums - value) * pxPer;
      line(ctx, x, my, x + w, my, COL.amber, 2);
    }
  }
  ctx.restore();
  // current value box
  const bh = 30;
  if (side === "left") {
    poly(ctx, [[x + 2, cy - bh / 2], [x + w - 12, cy - bh / 2], [x + w - 12, cy - 6], [x + w - 2, cy], [x + w - 12, cy + 6], [x + w - 12, cy + bh / 2], [x + 2, cy + bh / 2]], COL.white, "#000", 1.5);
    txt(ctx, String(Math.max(0, Math.round(value))), x + w - 16, cy, value < (S.vStallKt || 0) && !S.t.onGround ? COL.red : COL.white, 20, "right");
  } else {
    poly(ctx, [[x + 12, cy - bh / 2], [x + w + 2, cy - bh / 2], [x + w + 2, cy + bh / 2], [x + 12, cy + bh / 2], [x + 12, cy + 6], [x + 2, cy], [x + 12, cy - 6]], COL.white, "#000", 1.5);
    const a = Math.round(value);
    const hundreds = Math.floor(Math.abs(a) / 100);
    const tens = Math.round((Math.abs(a) % 100) / 20) * 20 % 100;
    txt(ctx, (a < 0 ? "-" : "") + hundreds, x + w * 0.62, cy, COL.white, 20, "right");
    txt(ctx, pad(tens, 2), x + w * 0.64, cy, COL.white, 15, "left");
  }
}

function drawFMA(ctx, X, Y, W, H, S) {
  rect(ctx, X, Y, W, H, null, "#000");
  const cols = 5;
  const cw = W / cols;
  for (let i = 1; i < cols; i++) line(ctx, X + cw * i, Y + 3, X + cw * i, Y + H - 3, COL.grey, 1);
  const ap = S.ap;
  const thr = S.fma.thr, vert = S.fma.vert, lat = S.fma.lat;
  txt(ctx, thr, X + cw * 0.5, Y + H * 0.35, COL.green, 13);
  txt(ctx, vert, X + cw * 1.5, Y + H * 0.35, COL.green, 13);
  txt(ctx, lat, X + cw * 2.5, Y + H * 0.35, COL.green, 13);
  if (S.fma.vertArm) txt(ctx, S.fma.vertArm, X + cw * 1.5, Y + H * 0.75, COL.cyan, 12);
  if (S.fma.latArm) txt(ctx, S.fma.latArm, X + cw * 2.5, Y + H * 0.75, COL.cyan, 12);
  if (S.fma.cat) txt(ctx, S.fma.cat, X + cw * 3.5, Y + H * 0.35, COL.white, 12);
  txt(ctx, ap.master ? "AP" : "", X + cw * 4.5, Y + H * 0.28, COL.white, 12);
  txt(ctx, `${ap.fd ? "FD" : ""}${ap.at ? "  A/THR" : ""}`, X + cw * 4.5, Y + H * 0.7, ap.at ? COL.white : COL.white, 11);
}

function drawG1000Bar(ctx, X, Y, W, S) {
  const h = 22;
  rect(ctx, X, Y, W, h, null, "#101418");
  const f = S.fma;
  txt(ctx, S.ap.master ? "AP" : "", X + W * 0.47, Y + h / 2, COL.green, 13);
  txt(ctx, f.lat, X + W * 0.25, Y + h / 2, COL.green, 13);
  if (f.latArm) txt(ctx, f.latArm, X + W * 0.36, Y + h / 2, COL.white, 12);
  txt(ctx, f.vert, X + W * 0.62, Y + h / 2, COL.green, 13);
  if (f.vertArm) txt(ctx, f.vertArm, X + W * 0.76, Y + h / 2, COL.white, 12);
  if (S.ap.vert === "VS") txt(ctx, `${Math.round(S.ap.vs / 0.3048 * 60)}FPM`, X + W * 0.88, Y + h / 2, COL.green, 12);
  txt(ctx, `TAS ${Math.round(S.tasKt)}KT`, X + W * 0.02, Y + h + 12, COL.white, 11, "left");
  txt(ctx, `OAT ${Math.round(S.t.oat)}°C`, X + W * 0.02, Y + h + 26, COL.white, 11, "left");
}

/** Horizontal situation indicator (compass rose with CDI). */
export function drawHSI(ctx, cx, cy, r, S) {
  const hdg = S.hdgDeg;
  ctx.save();
  ctx.fillStyle = "rgba(20,24,30,0.9)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(cx, cy);
  ctx.rotate(-hdg * DEG);
  for (let d = 0; d < 360; d += 5) {
    const a = d * DEG;
    const l = d % 10 === 0 ? r * 0.1 : r * 0.05;
    line(ctx, Math.sin(a) * r, -Math.cos(a) * r, Math.sin(a) * (r - l), -Math.cos(a) * (r - l), COL.white, 1.5);
    if (d % 30 === 0) {
      ctx.save();
      ctx.translate(Math.sin(a) * r * 0.75, -Math.cos(a) * r * 0.75);
      ctx.rotate(a);
      txt(ctx, { 0: "N", 90: "E", 180: "S", 270: "W" }[d] ?? String(d / 10), 0, 0, COL.white, r * 0.14);
      ctx.restore();
    }
  }
  // heading bug
  const hb = S.ap.hdg;
  ctx.save();
  ctx.rotate(hb);
  poly(ctx, [[-7, -r], [7, -r], [7, -r + 6], [0, -r + 10], [-7, -r + 6]], COL.cyan, COL.cyan);
  ctx.restore();
  // course pointer & CDI: GPS leg (magenta) or LOC (green)
  let crs = null, dev = 0, col = COL.magenta, toFrom = null;
  if (S.nav?.loc?.valid) {
    crs = S.nav.loc.course;
    dev = S.nav.loc.dev;
    col = COL.green;
  } else if (S.cdiSource === "VOR" && S.nav?.nav1) {
    crs = (S.radios?.obs || 0);
    dev = S.nav.nav1.dev;
    col = COL.green;
    toFrom = S.nav.nav1.toFrom;
  } else if (S.nav?.leg) {
    crs = S.nav.leg.course;
    dev = S.nav.leg.xtk / 1852 / 1; // 1 NM per dot (enroute scale ±2 NM)
  }
  if (crs != null) {
    ctx.save();
    ctx.rotate(crs);
    line(ctx, 0, -r * 0.88, 0, -r * 0.45, col, 4);
    poly(ctx, [[0, -r * 0.92], [-7, -r * 0.8], [7, -r * 0.8]], col, col);
    line(ctx, 0, r * 0.45, 0, r * 0.88, col, 4);
    for (const d of [-2, -1, 1, 2]) {
      ctx.strokeStyle = COL.white;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(d * r * 0.17, 0, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const dx = Math.max(-2.3, Math.min(2.3, -dev)) * r * 0.17;
    line(ctx, dx, -r * 0.42, dx, r * 0.42, col, 4);
    if (toFrom) poly(ctx, toFrom === "TO" ? [[r * 0.25, -r * 0.2], [r * 0.18, -r * 0.1], [r * 0.32, -r * 0.1]] : [[r * 0.25, r * 0.2], [r * 0.18, r * 0.1], [r * 0.32, r * 0.1]], COL.white, COL.white);
    ctx.restore();
  }
  ctx.restore();
  // lubber & aircraft
  poly(ctx, [[cx, cy - r - 2], [cx - 7, cy - r - 12], [cx + 7, cy - r - 12]], COL.white, COL.white);
  line(ctx, cx, cy - 12, cx, cy + 14, COL.white, 2);
  line(ctx, cx - 14, cy - 2, cx + 14, cy - 2, COL.white, 2);
  line(ctx, cx - 6, cy + 12, cx + 6, cy + 12, COL.white, 2);
  rect(ctx, cx - 26, cy - r - 36, 52, 22, COL.white, "#000", 1);
  txt(ctx, `${fmtHdg(hdg)}°`, cx, cy - r - 25, COL.white, 14);
  // current track diamond
  const trkA = (S.trkDeg - hdg) * DEG;
  poly(ctx, [[cx + Math.sin(trkA) * r * 0.95, cy - Math.cos(trkA) * r * 0.95], [cx + Math.sin(trkA - 0.03) * r * 0.87, cy - Math.cos(trkA - 0.03) * r * 0.87], [cx + Math.sin(trkA) * r * 0.8, cy - Math.cos(trkA) * r * 0.8], [cx + Math.sin(trkA + 0.03) * r * 0.87, cy - Math.cos(trkA + 0.03) * r * 0.87]], COL.magenta, null, 1.5);
  // source label
  txt(ctx, S.nav?.loc?.valid ? "LOC1" : S.cdiSource === "VOR" ? "VOR1" : "GPS", cx - r * 0.55, cy - r * 0.2, S.nav?.loc?.valid || S.cdiSource === "VOR" ? COL.green : COL.magenta, 12);
}

// Shared drawing helpers and avionics colour palette.
export const COL = {
  white: "#f4f6f8",
  green: "#3dff6e",
  cyan: "#2ee6ff",
  magenta: "#ff4df0",
  amber: "#ffb000",
  red: "#ff3b30",
  yellow: "#ffe14d",
  grey: "#8b929c",
  dark: "#1a1d22",
  panel: "#0b0d10",
  sky: "#2f73c9",
  ground: "#8a5a2b",
  tape: "#3b414a",
};
export const FONT = '"B612 Mono", "Consolas", monospace';
export const FONT_SANS = '"B612", "Segoe UI", sans-serif';

export function txt(ctx, s, x, y, color = COL.white, size = 14, align = "center", base = "middle", font = FONT) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}
export function line(ctx, x1, y1, x2, y2, color = COL.white, w = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
export function rect(ctx, x, y, w, h, stroke, fill, lw = 1.5) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
}
export function poly(ctx, pts, stroke, fill, lw = 1.5) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
export function clip(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}
export function bezel(ctx, x, y, w, h, title) {
  ctx.fillStyle = "#050607";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#2a2f36";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (title) txt(ctx, title, x + 8, y + 10, COL.grey, 10, "left");
}
export const pad = (n, w) => String(Math.round(n)).padStart(w, "0");
export const fmtHdg = (deg) => pad(((Math.round(deg) % 360) + 360) % 360 || 360, 3);

/** Round analog dial: value mapped linearly between a0..a1 (radians, 0 = up, clockwise). */
export function dialFace(ctx, cx, cy, r, label) {
  const g = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#23272d");
  g.addColorStop(1, "#0c0e11");
  ctx.fillStyle = "#3a3f46";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (label) txt(ctx, label, cx, cy + r * 0.38, COL.grey, Math.max(8, r * 0.13), "center", "middle", FONT_SANS);
}
export function dialTicks(ctx, cx, cy, r, a0, a1, vmin, vmax, major, minor, labelFn, size) {
  for (let v = vmin; v <= vmax + 1e-6; v += minor) {
    const a = a0 + ((v - vmin) / (vmax - vmin)) * (a1 - a0);
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r1 = r * (isMajor ? 0.82 : 0.9);
    line(ctx, cx + Math.sin(a) * r1, cy - Math.cos(a) * r1, cx + Math.sin(a) * r * 0.98, cy - Math.cos(a) * r * 0.98, COL.white, isMajor ? 2 : 1);
    if (isMajor && labelFn) {
      const lr = r * 0.66;
      txt(ctx, labelFn(v), cx + Math.sin(a) * lr, cy - Math.cos(a) * lr, COL.white, size || r * 0.16, "center", "middle", FONT_SANS);
    }
  }
}
export function arcBand(ctx, cx, cy, r, a0, a1, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2);
  ctx.stroke();
}
export function needle(ctx, cx, cy, r, a, color = COL.white, w = 3, tail = 0.15) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - Math.sin(a) * r * tail, cy + Math.cos(a) * r * tail);
  ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, r * 0.07), 0, Math.PI * 2);
  ctx.fill();
}

/** Arc gauge used on EICAS/ECAM (N1, EGT…) */
export function engArc(ctx, cx, cy, r, v, vmax, redline, label, valueStr, cmd) {
  const a0 = -Math.PI * 0.75, a1 = Math.PI * 0.25 + 0.3;
  const k = (x) => a0 + Math.max(0, Math.min(x / vmax, 1.08)) * (a1 - a0);
  arcBand(ctx, cx, cy, r, a0, k(redline), COL.white, 2);
  arcBand(ctx, cx, cy, r, k(redline), a1, COL.red, 3);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, a0 - Math.PI / 2, k(v) - Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  const over = v > redline;
  needle(ctx, cx, cy, r, k(v), over ? COL.red : COL.white, 2.5, 0);
  if (cmd != null) {
    const a = k(cmd);
    line(ctx, cx + Math.sin(a) * r * 0.85, cy - Math.cos(a) * r * 0.85, cx + Math.sin(a) * r * 1.12, cy - Math.cos(a) * r * 1.12, COL.cyan, 2.5);
  }
  rect(ctx, cx + 2, cy - r * 0.05, r * 1.0, r * 0.42, COL.grey, "#000", 1);
  txt(ctx, valueStr, cx + r * 0.95, cy + r * 0.16, over ? COL.red : COL.green, r * 0.34, "right");
  if (label) txt(ctx, label, cx, cy + r * 0.62, COL.cyan, r * 0.26);
}

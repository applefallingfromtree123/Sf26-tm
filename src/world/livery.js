// Procedural livery painter: draws fuselage and fin textures (cheatlines,
// cabin windows, cockpit glazing, doors, titles, registration, tail art)
// onto canvases that are embedded in the generated GLB.
//
// Fuselage UV: u = (x - tailEnd) / L  (0 tail → 1 nose)
//              v = ring angle / 2π, angle 0 = left side (+y), π/2 = top.

export function paintFuselage(spec, liv, geo, W = 2048, H = 512) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const L = spec.L;
  const xToU = (x) => ((x + L / 2) / L) * W;
  const zAt = (y) => Math.sin((y / H) * Math.PI * 2);
  const vOf = (z, left) => {
    // left side: angle in (-π/2, π/2); right side: (π/2, 3π/2)
    const a = left ? Math.asin(z) : Math.PI - Math.asin(z);
    return (((a / (Math.PI * 2)) % 1) + 1) % 1 * H;
  };
  // base: body above / belly below, cheatlines
  for (let y = 0; y < H; y++) {
    const z = zAt(y);
    let c = z < -0.38 ? liv.belly : liv.body;
    if (liv.cheat && z > -0.16 && z < -0.03) c = liv.cheat;
    if (liv.cheat2 && z > -0.27 && z < -0.18) c = liv.cheat2;
    g.fillStyle = c;
    g.fillRect(0, y, W, 1);
  }
  // tail colour sweep onto the rear fuselage for disc/solid schemes on airliners
  if (geo.big && (liv.tailArt === "solid" || liv.tailArt === "swoosh")) {
    for (const left of [true, false]) {
      g.fillStyle = liv.tail;
      const x0 = xToU(geo.tailEnd + geo.tailLen * 0.45), x1 = xToU(geo.tailEnd + geo.tailLen * 0.8);
      const yTop = vOf(1, left), y1 = vOf(0.55, left);
      g.beginPath();
      g.moveTo(xToU(geo.tailEnd), Math.min(yTop, y1));
      g.lineTo(x1, Math.min(yTop, y1));
      g.lineTo(x0, Math.max(yTop, y1));
      g.lineTo(xToU(geo.tailEnd), Math.max(yTop, y1));
      g.closePath();
      g.globalAlpha = 0.9;
      g.fill();
      g.globalAlpha = 1;
    }
  }
  // cabin windows
  const big = geo.big;
  const pitch = big ? 0.52 : L > 12 ? 0.75 : 0;
  if (pitch) {
    const x0 = geo.nose - geo.noseLen - 0.6, x1 = geo.tailEnd + geo.tailLen * 0.85;
    const wz = big ? 0.24 : 0.2;
    for (const left of [true, false]) {
      const yc = vOf(wz, left);
      const wh = H * (big ? 0.022 : 0.03), ww = (W / L) * (big ? 0.26 : 0.38);
      g.fillStyle = "#1a2433";
      for (let x = x0; x > x1; x -= pitch) {
        if (big && geo.doors.some((d) => Math.abs(d - x) < 0.8)) continue;
        roundRect(g, xToU(x) - ww / 2, yc - wh / 2, ww, wh, Math.min(ww, wh) / 2);
      }
      // upper deck
      if (spec.id === "a380" || spec.id === "b748") {
        const uz = 0.62;
        const yu = vOf(uz, left);
        const xEnd = spec.id === "a380" ? x1 : geo.nose - L * 0.3;
        for (let x = x0 - 1; x > xEnd; x -= pitch) roundRect(g, xToU(x) - ww / 2, yu - wh / 2, ww, wh, Math.min(ww, wh) / 2);
      }
      // doors
      if (big) {
        g.strokeStyle = "rgba(40,48,60,0.55)";
        g.lineWidth = 2;
        for (const d of geo.doors) {
          const dw = (W / L) * 0.95;
          const ytop = vOf(0.42, left), ybot = vOf(-0.22, left);
          g.strokeRect(xToU(d) - dw / 2, Math.min(ytop, ybot), dw, Math.abs(ybot - ytop));
        }
      }
    }
  }
  // cockpit glazing (dark band near the nose, both sides)
  for (const left of [true, false]) {
    const xs = geo.nose - geo.noseLen * (big ? 0.42 : 0.75), xe = geo.nose - geo.noseLen * (big ? 0.18 : 0.35);
    const ya = vOf(big ? 0.62 : 0.72, left), yb = vOf(big ? 0.32 : 0.2, left);
    g.fillStyle = "#121a26";
    g.beginPath();
    g.moveTo(xToU(xs), ya);
    g.lineTo(xToU(xe), ya + (yb - ya) * 0.15);
    g.lineTo(xToU(xe + 0.3), yb);
    g.lineTo(xToU(xs - 0.4), yb);
    g.closePath();
    g.fill();
  }
  // titles and registration
  const titleH = H * (big ? 0.07 : 0.06);
  const aspect = (W / L) / (H / (Math.PI * (spec.model?.fd || 1.5)));
  for (const left of [true, false]) {
    if (liv.title) {
      const tx = xToU(geo.nose - geo.noseLen - (big ? L * 0.16 : L * 0.12));
      const ty = vOf(big ? 0.5 : 0.35, left);
      drawText(g, liv.title, tx, ty, titleH, liv.titleColor, left, "700", W * 0.3, aspect);
    }
    if (liv.reg) {
      const rx = xToU(geo.tailEnd + geo.tailLen * (big ? 0.95 : 0.7));
      drawText(g, liv.reg, rx, vOf(big ? 0.15 : 0.0, left), titleH * (big ? 0.42 : 0.8), "#2a2f36", left, "600", undefined, aspect);
    }
  }
  return cv;
}

export function paintTail(liv, W = 512, H = 512) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  // u (canvas x): 0 leading edge → 1 trailing edge ; v (canvas y): 0 root → 1 tip
  const base = liv.tailArt === "flag" || liv.tailArt === "disc" && liv.tail === "#f3f4f6" ? liv.tail : liv.tail;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const c2 = liv.tail2 || liv.body;
  switch (liv.tailArt) {
    case "band":
      g.fillStyle = c2;
      g.fillRect(0, H * 0.35, W, H * 0.22);
      break;
    case "stripe":
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? c2 : liv.body;
        g.fillRect(0, H * (0.25 + k * 0.12), W, H * 0.06);
      }
      break;
    case "swoosh": {
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, liv.tail);
      grd.addColorStop(1, c2);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.beginPath();
      g.moveTo(0, H * 0.25);
      g.quadraticCurveTo(W * 0.5, H * 0.45, W, H * 0.9);
      g.lineTo(W, H * 0.98);
      g.quadraticCurveTo(W * 0.45, H * 0.55, 0, H * 0.33);
      g.fill();
      break;
    }
    case "disc":
      g.fillStyle = c2;
      g.beginPath();
      g.arc(W * 0.45, H * 0.55, Math.min(W, H) * 0.22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = liv.tail === "#f3f4f6" ? "#c8102e" : liv.body;
      g.beginPath();
      g.arc(W * 0.45, H * 0.55, Math.min(W, H) * 0.22, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
      break;
    case "flag":
      g.fillStyle = c2;
      for (let k = 0; k < 3; k++) {
        g.save();
        g.translate(W * 0.1, H * (0.2 + k * 0.2));
        g.rotate(-0.35);
        g.fillRect(0, 0, W * 1.2, H * 0.07);
        g.restore();
      }
      g.fillStyle = "#c8102e";
      g.save();
      g.translate(W * 0.1, H * 0.78);
      g.rotate(-0.35);
      g.fillRect(0, 0, W * 1.2, H * 0.05);
      g.restore();
      break;
    default:
      break;
  }
  return cv;
}

export function canvasToPng(cv) {
  const b64 = cv.toDataURL("image/png").split(",")[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

function drawText(g, text, x, y, size, color, left, weight = "700", maxW, aspect = 1) {
  g.save();
  g.translate(x, y);
  // left side of the aircraft: texture is mirrored both ways relative to the viewer
  if (left) g.rotate(Math.PI);
  g.font = `${weight} ${size}px "Noto Sans KR", "B612", Arial, sans-serif`;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  // fuselage texture has different px/m along and around the body: compensate
  g.scale(aspect, 1);
  g.fillText(text, 0, 0, maxW ? maxW / aspect : undefined);
  g.restore();
}

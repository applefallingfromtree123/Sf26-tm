// Procedural aircraft geometry generated from each type's real dimensions
// (length, span, wing area, fuselage diameter, sweep, tail and engine layout),
// painted with a livery texture and exported as an in-memory GLB for CesiumJS
// (and the three.js hangar preview).
//
// Model axes: +x forward, +y left, +z up, origin at the centre of gravity.
// Nodes: "body" (static), "gear" (retractable), "prop" / "rotor" / "tailrotor" (spinning).

import { paintFuselage, paintTail, canvasToPng } from "./livery.js";

const DEG = Math.PI / 180;

class Mesh {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.i = [];
  }
  vert(p, n, uv = [0, 0]) {
    this.p.push(p[0], p[1], p[2]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.n.push(n[0] / l, n[1] / l, n[2] / l);
    this.uv.push(uv[0], uv[1]);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  face(a, b, c, ua, ub, uc) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    this.tri(this.vert(a, n, ua), this.vert(b, n, ub), this.vert(c, n, uc));
  }
  quad(a, b, c, d, uv) {
    const [ua, ub, uc, ud] = uv || [[0, 0], [0, 0], [0, 0], [0, 0]];
    this.face(a, b, c, ua, ub, uc);
    this.face(a, c, d, ua, uc, ud);
  }
}

/**
 * Lofted body along x with smooth normals and (u,v) texture coordinates.
 * stations: [x, ry, rz, zOffset] from front to back.
 */
function loft(mesh, stations, seg = 24, uFn = null) {
  const rings = stations.map(([x, ry, rz, zo]) => {
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      ring.push(mesh.vert([x, ry * c, zo + rz * s], [0, c / Math.max(ry, 1e-3), s / Math.max(rz, 1e-3)], [uFn ? uFn(x) : 0, k / seg]));
    }
    return ring;
  });
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < seg; k++) {
      const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k];
      mesh.tri(a, d, c);
      mesh.tri(a, c, b);
    }
  }
  smoothAxial(mesh, rings, stations, seg);
}
function smoothAxial(mesh, rings, st, seg) {
  for (let r = 0; r < rings.length; r++) {
    const prev = st[Math.max(r - 1, 0)], next = st[Math.min(r + 1, st.length - 1)];
    const dx = prev[0] - next[0] || 1e-3;
    const dr = (next[1] + next[2]) / 2 - (prev[1] + prev[2]) / 2;
    const slope = -dr / dx; // radius growth toward +x
    for (let k = 0; k <= seg; k++) {
      const id = rings[r][k] * 3;
      const ny = mesh.n[id + 1], nz = mesh.n[id + 2];
      const nx = -slope;
      const l = Math.hypot(nx, ny, nz) || 1;
      mesh.n[id] = nx / l;
      mesh.n[id + 1] = ny / l;
      mesh.n[id + 2] = nz / l;
    }
  }
}

function cylinder(mesh, p0, p1, r0, r1 = r0, seg = 14, caps = true) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const L = Math.hypot(...d) || 1;
  const ax = d.map((v) => v / L);
  const tmp = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  let u = [ax[1] * tmp[2] - ax[2] * tmp[1], ax[2] * tmp[0] - ax[0] * tmp[2], ax[0] * tmp[1] - ax[1] * tmp[0]];
  const ul = Math.hypot(...u);
  u = u.map((v) => v / ul);
  const w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const ring = (p, r, nrm) => {
    const out = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      out.push(mesh.vert([p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r], nrm || n, [k / seg, 0]));
    }
    return out;
  };
  const i0 = ring(p0, r0), i1 = ring(p1, r1);
  for (let k = 0; k < seg; k++) {
    mesh.tri(i0[k], i0[k + 1], i1[k + 1]);
    mesh.tri(i0[k], i1[k + 1], i1[k]);
  }
  if (!caps) return;
  const n0 = ax.map((v) => -v);
  const c0 = mesh.vert(p0, n0), c1 = mesh.vert(p1, ax);
  const e0 = ring(p0, r0, n0), e1 = ring(p1, r1, ax);
  for (let k = 0; k < seg; k++) {
    mesh.tri(c0, e0[k + 1], e0[k]);
    mesh.tri(c1, e1[k], e1[k + 1]);
  }
}

/** Lifting surface root→tip with a NACA-like section; uv = (chord fraction, span fraction). */
function surface(mesh, root, tip, vertical = false, seg = 10) {
  const xs = [];
  for (let k = 0; k <= seg; k++) xs.push((1 - Math.cos((k / seg) * Math.PI)) / 2);
  const th = (x) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const sec = (s) => xs.map((x) => {
    const px = s.x - x * s.c;
    const h = th(x) * s.t * s.c;
    return vertical ? [[px, s.y + h, s.z], [px, s.y - h, s.z]] : [[px, s.y, s.z + h], [px, s.y, s.z - h]];
  });
  const A = sec(root), B = sec(tip);
  const sgn = vertical ? Math.sign(tip.z - root.z) || 1 : Math.sign(tip.y - root.y) || 1;
  const q = (a, b, c, d, uv) => (sgn > 0 ? mesh.quad(a, b, c, d, uv) : mesh.quad(d, c, b, a, uv && [uv[3], uv[2], uv[1], uv[0]]));
  for (let k = 0; k < seg; k++) {
    const u0 = xs[k], u1 = xs[k + 1];
    const uvU = [[u1, 0], [u0, 0], [u0, 1], [u1, 1]];
    const uvL = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
    if (vertical) {
      q(A[k][0], A[k + 1][0], B[k + 1][0], B[k][0], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      q(A[k + 1][1], A[k][1], B[k][1], B[k + 1][1], [[u1, 0], [u0, 0], [u0, 1], [u1, 1]]);
    } else {
      q(A[k + 1][0], A[k][0], B[k][0], B[k + 1][0], uvU);
      q(A[k][1], A[k + 1][1], B[k + 1][1], B[k][1], uvL);
    }
  }
  for (let k = 0; k < seg; k++) {
    const t = vertical ? sgn > 0 : sgn < 0;
    if (t) mesh.quad(B[k][0], B[k + 1][0], B[k + 1][1], B[k][1]);
    else mesh.quad(B[k][1], B[k + 1][1], B[k + 1][0], B[k][0]);
  }
}

function box(mesh, c, s) {
  const [x, y, z] = c, [a, b, d] = s.map((v) => v / 2);
  const P = (i, j, k) => [x + i * a, y + j * b, z + k * d];
  mesh.quad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1));
  mesh.quad(P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1));
  mesh.quad(P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1));
  mesh.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1));
  mesh.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1));
  mesh.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
}

function disc(mesh, center, radius, axis = "x", seg = 32) {
  const nrm = axis === "x" ? [1, 0, 0] : [0, 0, 1];
  const c = mesh.vert(center, nrm);
  const r = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const p = axis === "x"
      ? [center[0], center[1] + Math.cos(a) * radius, center[2] + Math.sin(a) * radius]
      : [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]];
    r.push(mesh.vert(p, nrm));
  }
  for (let k = 0; k < seg; k++) mesh.tri(c, r[k], r[(k + 1) % seg]);
}

function hexToRgb(h) {
  const v = parseInt((h || "#cccccc").slice(1), 16);
  const lin = (c) => Math.pow(c / 255, 2.2);
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
}

// ------------------------------------------------------------------ aircraft builder
export function buildAircraftGeometry(spec, cgHeight, livery) {
  const m = spec.model || {};
  const L = spec.L, b = spec.b, fd = m.fd || 1.5, R = fd / 2;
  const parts = { body: {}, gear: {}, prop: {}, rotor: {}, tailrotor: {} };
  const get = (node, mat) => (parts[node][mat] ||= new Mesh());
  const liv = livery || { body: m.col?.[0] || "#eee", belly: m.col?.[0] || "#ccc", tail: m.col?.[1] || "#1d2c5e", cheat: m.col?.[2], engine: m.col?.[0] || "#ddd", wing: "#c7ccd3", tailArt: "solid" };
  const mats = {
    fuselage: { color: [1, 1, 1], metal: 0.15, rough: 0.35, tex: "fuselage" },
    tail: { color: [1, 1, 1], metal: 0.15, rough: 0.35, tex: "tail" },
    wing: { color: hexToRgb(liv.wing || "#c7ccd3"), metal: 0.35, rough: 0.4 },
    engine: { color: hexToRgb(liv.engine || liv.body), metal: 0.3, rough: 0.35 },
    metal: { color: hexToRgb("#8d939b"), metal: 0.85, rough: 0.3 },
    dark: { color: hexToRgb("#24272b"), metal: 0.2, rough: 0.6 },
    glass: { color: hexToRgb("#0d141d"), metal: 0.1, rough: 0.05 },
    tyre: { color: hexToRgb("#141414"), metal: 0, rough: 0.9 },
    prop: { color: hexToRgb("#1a1a1a"), metal: 0, rough: 0.6, alpha: 0.25 },
    belly: { color: hexToRgb(liv.belly), metal: 0.2, rough: 0.4 },
    white: { color: hexToRgb(liv.body), metal: 0.15, rough: 0.35 },
  };
  if (m.heli) return buildHeli(spec, parts, get, mats, cgHeight, liv);

  const jet = ["turbofan", "turbojet"].includes(spec.eng.type);
  const big = L > 25;
  const nose = L / 2, tailEnd = -L / 2;
  const noseLen = big ? fd * 1.7 : spec.eng.type === "none" ? L * 0.2 : spec.cat === "fighter" ? L * 0.3 : L * 0.16;
  const tailLen = L * (big ? 0.27 : spec.cat === "glider" ? 0.55 : 0.42);
  const rzScale = spec.id === "a380" ? 1.18 : 1;
  const midEnd = tailEnd + tailLen;
  // ---- fuselage
  const st = [];
  const NN = 14;
  for (let k = 0; k <= NN; k++) {
    const t = k / NN;
    const x = nose - t * noseLen;
    const shape = spec.cat === "fighter" || spec.id === "concorde" ? Math.pow(t, 0.75) : Math.sqrt(Math.max(1 - (1 - t) ** 2.2, 0));
    const r = R * Math.max(shape, 0.03);
    const zo = -((1 - t) ** 2) * R * (big ? 0.25 : 0.1);
    st.push([x, r, r * rzScale, zo]);
  }
  st.push([(nose - noseLen + midEnd) / 2, R, R * rzScale, 0]);
  st.push([midEnd, R, R * rzScale, 0]);
  const NT = 12;
  for (let k = 1; k <= NT; k++) {
    const t = k / NT;
    const x = midEnd - t * tailLen;
    const r = R * Math.max(1 - Math.pow(t, 1.25) * 0.9, 0.05);
    st.push([x, r * (1 - 0.1 * t), r * rzScale, t * t * R * (big ? 0.6 : 0.45)]);
  }
  loft(get("body", "fuselage"), st, 28, (x) => (x - tailEnd) / L);
  if (spec.id === "b748") {
    loft(get("body", "white"), [
      [nose - fd * 0.55, 0.05, 0.05, R * 0.55], [nose - fd * 0.9, R * 0.5, R * 0.36, R * 0.72],
      [nose - L * 0.22, R * 0.62, R * 0.45, R * 0.72], [nose - L * 0.34, R * 0.5, R * 0.3, R * 0.74], [nose - L * 0.38, 0.05, 0.05, R * 0.8],
    ], 18);
  }
  const doors = [];
  if (big) {
    const usable = L - noseLen - tailLen * 0.7;
    const nDoor = L > 60 ? 5 : L > 45 ? 4 : 3;
    for (let k = 0; k < nDoor; k++) doors.push(nose - noseLen - 0.8 - (usable - 1.5) * (k / (nDoor - 1)));
  }
  const geo = { big, nose, noseLen, tailEnd, tailLen, doors };

  // ---- wing
  const sw = (m.sw || 0) * DEG;
  const delta = !!m.delta;
  const taper = delta ? 0.06 : big || jet ? 0.28 : spec.cat === "glider" ? 0.4 : 0.72;
  const cr = (2 * spec.S) / (b * (1 + taper));
  const ct = cr * taper;
  const wingZ = m.wing === "high" ? R * 0.88 : m.wing === "mid" ? 0 : -R * 0.62;
  const dihedral = (m.wing === "high" ? 1.5 : m.wing === "mid" ? (spec.cat === "fighter" ? -2 : 1) : big ? 6 : 5) * DEG;
  const rootLE = delta ? nose - L * 0.28 : cr * 0.55 + (big ? L * 0.04 : L * 0.02);
  const semi = b / 2;
  const thick = delta ? 0.035 : spec.cat === "fighter" ? 0.05 : jet ? 0.12 : 0.15;
  for (const side of [1, -1]) {
    const tipLE = delta ? rootLE - cr + ct * 1.05 : rootLE - Math.tan(sw) * semi;
    const tipZ = wingZ + Math.tan(dihedral) * semi;
    if (big && !delta) {
      // yehudi / kinked trailing edge: inboard panel
      const kinkY = semi * 0.34;
      const kLE = rootLE - Math.tan(sw) * kinkY;
      const kC = cr * 0.62;
      surface(get("body", "wing"), { x: rootLE, y: side * R * 0.7, z: wingZ, c: cr, t: thick }, { x: kLE, y: side * kinkY, z: wingZ + Math.tan(dihedral) * kinkY, c: kC, t: thick * 0.9 });
      surface(get("body", "wing"), { x: kLE, y: side * kinkY, z: wingZ + Math.tan(dihedral) * kinkY, c: kC, t: thick * 0.9 }, { x: tipLE, y: side * semi, z: tipZ, c: ct, t: thick * 0.75 });
      // flap track fairings
      for (const f of [0.22, 0.4, 0.58, 0.74]) {
        const y = semi * f, le = rootLE - Math.tan(sw) * y;
        const ch = f < 0.34 ? cr - (cr - kC) * (f / 0.34) : kC - (kC - ct) * ((f - 0.34) / 0.66);
        cylinder(get("body", "wing"), [le - ch * 0.6, side * y, wingZ + Math.tan(dihedral) * y - 0.15], [le - ch * 1.15, side * y, wingZ + Math.tan(dihedral) * y - 0.1], ch * 0.05, ch * 0.015, 8);
      }
      // wing-to-body fairing (belly)
      loft(get("body", "belly"), [
        [rootLE + cr * 0.15, R * 0.3, R * 0.2, -R * 0.7], [rootLE - cr * 0.2, R * 0.85, R * 0.4, -R * 0.62],
        [rootLE - cr * 0.8, R * 0.85, R * 0.4, -R * 0.62], [rootLE - cr * 1.3, R * 0.3, R * 0.2, -R * 0.6],
      ], 18);
    } else {
      surface(get("body", "wing"), { x: rootLE, y: side * R * 0.6, z: wingZ, c: cr, t: thick }, { x: tipLE, y: side * semi, z: tipZ, c: ct, t: thick * 0.8 });
    }
    if (m.wing === "high" && !jet && L < 16 && spec.cat !== "glider" && spec.cat !== "regional-tp") {
      cylinder(get("body", "metal"), [rootLE - cr * 0.3, side * R * 0.8, -R * 0.75], [rootLE - cr * 0.3, side * semi * 0.55, wingZ], 0.04, 0.04, 8);
    }
    if (big && !delta) {
      // winglet / sharklet / raked tip
      const raked = ["b789", "b77w", "b748"].includes(spec.id);
      if (!raked) {
        surface(get("body", "tail"), { x: tipLE + 0.05, y: side * semi, z: tipZ, c: ct * 0.95, t: 0.08 },
          { x: tipLE - ct * 0.55, y: side * semi * 1.004, z: tipZ + ct * 1.5, c: ct * 0.42, t: 0.08 }, true);
      }
    }
  }

  // ---- empennage
  const vH = delta ? L * 0.17 : Math.max(L * (big ? 0.19 : 0.17), fd * 1.4);
  const vC = delta ? L * 0.22 : L * (big ? 0.13 : 0.16);
  const finX = tailEnd + vC * 1.05;
  const hSpan = delta ? 0 : b * (big ? 0.33 : spec.cat === "glider" ? 0.17 : spec.cat === "fighter" ? 0.45 : 0.35);
  const hC = hSpan * (spec.cat === "fighter" ? 0.38 : 0.28);
  const tailTopZ = R * (big ? 0.6 : 0.45);
  const finSweep = (big ? sw + 8 * DEG : 30 * DEG);
  if (m.tail === "V") {
    for (const side of [1, -1]) {
      surface(get("body", "tail"), { x: finX + vC * 0.2, y: side * R * 0.2, z: tailTopZ, c: vC, t: 0.1 },
        { x: finX - vC * 0.4, y: side * vH * 0.8, z: tailTopZ + vH * 0.6, c: vC * 0.5, t: 0.1 });
    }
  } else if (m.tail === "twin") {
    for (const side of [1, -1]) {
      surface(get("body", "tail"), { x: finX + vC * 0.8, y: side * R * 0.8, z: R * 0.3, c: vC, t: 0.05 },
        { x: finX - vC * 0.15, y: side * R * 1.25, z: R * 0.3 + vH, c: vC * 0.42, t: 0.05 }, true);
    }
  } else {
    surface(get("body", "tail"), { x: finX + vC * 0.4, y: 0, z: tailTopZ * 0.8, c: vC * 1.25, t: 0.1 },
      { x: finX - Math.tan(finSweep) * vH, y: 0, z: tailTopZ + vH, c: vC * 0.55, t: 0.1 }, true);
    if (big || spec.cat === "bizjet") {
      // dorsal fillet
      surface(get("body", "tail"), { x: finX + vC * 1.1, y: 0, z: tailTopZ * 0.7, c: vC * 0.9, t: 0.05 },
        { x: finX + vC * 0.35, y: 0, z: tailTopZ + vH * 0.15, c: vC * 0.2, t: 0.05 }, true);
    }
  }
  if (hSpan > 0 && m.tail !== "V") {
    const tee = m.tail === "T";
    const hz = tee ? tailTopZ + vH * 0.96 : m.tail === "twin" ? R * 0.1 : tailTopZ * 0.7;
    const hx = tee ? finX - Math.tan(finSweep) * vH * 0.96 + vC * 0.35 : finX + hC * 0.4;
    for (const side of [1, -1]) {
      surface(get("body", tee ? "tail" : "wing"), { x: hx + hC * 0.4, y: side * (tee ? 0.1 : R * 0.3), z: hz, c: hC * 1.35, t: 0.09 },
        { x: hx - Math.tan(sw + 5 * DEG) * hSpan * 0.5, y: side * hSpan / 2, z: hz + (tee ? 0 : 0.06 * hSpan), c: hC * 0.55, t: 0.09 });
    }
  }
  // canopy for fighters / gliders / GA
  if (spec.cat === "fighter" || spec.cat === "glider" || spec.cat === "aero" || spec.cat === "warbird") {
    loft(get("body", "glass"), [
      [nose - noseLen * 0.75, 0.05, 0.05, R * 0.55], [nose - noseLen * 0.95, R * 0.42, R * 0.4, R * 0.65],
      [nose - noseLen * 1.4, R * 0.42, R * 0.38, R * 0.65], [nose - noseLen * 1.8, 0.05, 0.05, R * 0.6],
    ], 16);
  }

  // ---- engines
  const n = spec.eng.n;
  const lay = m.eng;
  const ENG = get("body", "engine"), DARK = get("body", "dark"), MET = get("body", "metal");
  if (lay === "nose") {
    cylinder(DARK, [nose - 0.05, 0, 0], [nose + R * 0.55, 0, 0], R * 0.28, 0.02, 14);
    const pd = Math.min(Math.max(1.8, spec.eng.kw / 250), 3.4) / 2;
    disc(get("prop", "prop"), [nose + 0.1, 0, 0], pd, "x");
  } else if (lay === "pusher") {
    disc(get("prop", "prop"), [nose - L * 0.45, 0, R * 0.9], 0.85, "x");
  } else if (lay === "wing" || lay === "podded") {
    const ys = n === 4 ? [0.38, 0.2] : [n === 2 && !jet ? 0.24 : 0.33];
    for (const f of ys) for (const side of [1, -1]) {
      const y = side * semi * f * (lay === "podded" ? 0.7 : 1);
      const leX = rootLE - Math.tan(sw) * Math.abs(y);
      const zW = wingZ + Math.tan(dihedral) * Math.abs(y);
      if (jet && lay !== "podded") {
        const nr = Math.sqrt((spec.eng.kn || 50) / 120) * 1.08 * (big ? 1 : 0.75);
        const len = nr * 3.4;
        const z = zW - nr * 1.15;
        const xf = leX + len * 0.6;
        loft(ENG, [[xf, nr * 0.92, nr * 0.92, 0], [xf - 0.15, nr, nr, 0], [xf - len * 0.5, nr * 1.02, nr * 1.02, 0], [xf - len * 0.85, nr * 0.75, nr * 0.75, 0], [xf - len, nr * 0.55, nr * 0.55, 0]].map(([x, a, bb, zz]) => [x, a, bb, z + zz]).map(([x, a, bb, zz]) => [x, a, bb, zz]), 22);
        offsetY(ENG, y);
        disc(DARK, [xf - 0.12, y, z], nr * 0.86, "x");
        cylinder(MET, [xf - len, y, z], [xf - len - nr * 0.7, y, z], nr * 0.35, 0.05, 12);
        // pylon
        box(get("body", "white"), [leX - len * 0.05, y, (z + zW) / 2 + nr * 0.25], [len * 0.75, nr * 0.22, Math.abs(zW - z) - nr * 0.2]);
      } else if (lay === "podded") {
        const w = 1.3, h = 1.2;
        box(ENG, [rootLE - cr * 0.65, y, wingZ - h * 0.6], [cr * 0.45, w * 2.1, h]);
        cylinder(DARK, [rootLE - cr * 0.42, y - w * 0.5, wingZ - h * 0.6], [rootLE - cr * 0.41, y - w * 0.5, wingZ - h * 0.6], 0.5, 0.5, 10);
      } else {
        const nr = Math.min(0.35 + (spec.eng.kw || 300) / 4000, 1.05);
        const z = zW + (m.wing === "high" ? -nr * 0.25 : nr * 0.3);
        loft(ENG, [[leX + nr * 2.3, nr * 0.55, nr * 0.55, z], [leX + nr * 1.8, nr, nr * 1.05, z], [leX - cr * 0.3, nr * 0.95, nr, z], [leX - cr * 0.9, nr * 0.3, nr * 0.4, z]], 18);
        offsetY(ENG, y);
        cylinder(DARK, [leX + nr * 2.3, y, z], [leX + nr * 2.9, y, z], nr * 0.38, 0.02, 12);
        const pd = Math.min(Math.max(1.9, (spec.eng.kw || 300) / 700), 4.1) / 2;
        disc(get("prop", "prop"), [leX + nr * 2.35, y, z], pd, "x");
      }
    }
  } else if (lay === "rear" || lay === "overwing" || lay === "top") {
    const nr = Math.sqrt((spec.eng.kn || 10) / 120) * 0.95;
    const len = nr * 4;
    const ys = lay === "top" ? [0] : [1, -1];
    for (const side of ys) {
      let x, y, z;
      if (lay === "rear") { x = tailEnd + tailLen * 0.92; y = side * (R * 0.85 + nr * 1.3); z = R * 0.35; }
      else if (lay === "top") { x = tailEnd + tailLen * 0.95; y = 0; z = R * 1.05 + nr * 0.5; }
      else { x = rootLE - cr * 0.25; y = side * semi * 0.35; z = wingZ + nr * 1.6; }
      loft(ENG, [[x + len / 2, nr * 0.9, nr * 0.9, z], [x + len / 2 - 0.1, nr, nr, z], [x - len * 0.2, nr, nr, z], [x - len / 2, nr * 0.7, nr * 0.7, z]], 20);
      offsetY(ENG, y);
      disc(DARK, [x + len / 2 - 0.08, y, z], nr * 0.85, "x");
      if (lay === "rear") box(get("body", "white"), [x, side * (R * 0.5 + nr * 0.5), z], [len * 0.4, R * 0.7 + nr, nr * 0.25]);
      if (lay === "overwing") box(get("body", "white"), [x, y, (z + wingZ) / 2], [len * 0.4, nr * 0.25, z - wingZ]);
    }
  } else if (lay === "internal") {
    for (const side of n === 2 ? [1, -1] : [0]) {
      cylinder(DARK, [tailEnd + 0.4, side * 0.55, 0], [tailEnd - 0.5, side * 0.55, 0], 0.48, 0.42, 14);
      box(get("body", "white"), [nose - L * 0.4, side * R * 1.05, -R * 0.35], [L * 0.28, R * 0.55, R * 0.75]);
      box(DARK, [nose - L * 0.27, side * R * 1.05, -R * 0.35], [0.06, R * 0.5, R * 0.7]);
    }
  }

  // ---- landing gear at the flight-model contact points
  const gt = spec.gear.type;
  const h = cgHeight;
  const wr = Math.max(0.2, Math.min(0.62, fd * 0.1));
  const gearPts = [];
  if (gt === "tri") {
    const track = spec.cat === "ga" ? b * 0.11 : Math.max(b * 0.08, fd * 0.6);
    gearPts.push([L * 0.33, 0, 1, 1], [-L * 0.04, track, big ? 2 : 1, L > 60 ? 2 : 1], [-L * 0.04, -track, big ? 2 : 1, L > 60 ? 2 : 1]);
    if (spec.id === "a380" || spec.id === "b748") gearPts.push([-L * 0.07, R * 0.45, 2, 2], [-L * 0.07, -R * 0.45, 2, 2]);
  } else if (gt === "tail") {
    gearPts.push([L * 0.1, b * 0.12, 1, 1], [L * 0.1, -b * 0.12, 1, 1]);
    const zt = h - (L * 0.1 + L * 0.5) * Math.tan(11 * DEG);
    cylinder(get("gear", "metal"), [-L * 0.5 + 0.25, 0, 0], [-L * 0.5, 0, -zt + 0.1], 0.03, 0.03, 8);
    cylinder(get("gear", "tyre"), [-L * 0.5, 0.06, -zt + 0.1], [-L * 0.5, -0.06, -zt + 0.1], 0.1, 0.1, 12);
  } else if (gt === "mono") {
    gearPts.push([L * 0.02, 0, 1, 1]);
  }
  for (const [x, y, nW, nAx] of gearPts) {
    const top = [x, y * 0.6, -R * 0.4];
    const bot = [x, y, -h + wr];
    cylinder(get("gear", "metal"), top, bot, Math.max(0.04, wr * 0.22), Math.max(0.04, wr * 0.2), 10);
    for (let ax = 0; ax < nAx; ax++) {
      for (let k = 0; k < nW; k++) {
        const dx = (nAx > 1 ? (ax - 0.5) * wr * 2.4 : 0);
        const dy = nW > 1 ? (k - 0.5) * wr * 1.3 : 0;
        cylinder(get("gear", "tyre"), [x + dx, y + dy + wr * 0.3, -h + wr], [x + dx, y + dy - wr * 0.3, -h + wr], wr, wr, 16);
      }
    }
  }
  const textures = {
    fuselage: canvasToPng(paintFuselage(spec, liv, geo)),
    tail: canvasToPng(paintTail(liv)),
  };
  return toGlb(parts, mats, {}, textures);
}

/** Translate the vertices appended to a mesh since the last call along y. */
function offsetY(mesh, dy) {
  mesh._done ||= 0;
  for (let i = mesh._done; i < mesh.p.length; i += 3) mesh.p[i + 1] += dy;
  mesh._done = mesh.p.length;
}

function buildHeli(spec, parts, get, mats, h, liv) {
  const L = spec.L, fd = spec.model.fd, R = fd / 2, rd = spec.rotorD / 2;
  const st = [];
  const podLen = L * 0.46;
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const x = L * 0.28 - t * podLen;
    const r = R * Math.sqrt(Math.max(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.02)) * (1 - 0.25 * t);
    st.push([x, r * 0.85, r, t * 0.12]);
  }
  mats.fuselage.tex = null;
  mats.fuselage.color = hexToRgb(liv.body);
  mats.tail.tex = null;
  mats.tail.color = hexToRgb(liv.tail);
  loft(get("body", "fuselage"), st, 22);
  loft(get("body", "glass"), [[L * 0.29, 0.05, 0.05, R * 0.05], [L * 0.24, R * 0.8, R * 0.75, R * 0.1], [L * 0.12, R * 0.82, R * 0.82, R * 0.15], [L * 0.06, 0.05, 0.05, R * 0.2]], 16);
  cylinder(get("body", "fuselage"), [L * 0.28 - podLen * 0.8, 0, R * 0.3], [-L * 0.62, 0, R * 0.45], R * 0.25, R * 0.1, 12);
  surface(get("body", "tail"), { x: -L * 0.55, y: 0, z: R * 0.4, c: 0.9, t: 0.1 }, { x: -L * 0.63, y: 0, z: R * 0.4 + 1.3, c: 0.5, t: 0.1 }, true);
  for (const s of [1, -1]) surface(get("body", "tail"), { x: -L * 0.42, y: 0, z: R * 0.38, c: 0.6, t: 0.1 }, { x: -L * 0.44, y: s * 1.1, z: R * 0.4, c: 0.45, t: 0.1 });
  cylinder(get("body", "metal"), [0, 0, R], [0, 0, R + 0.5], 0.12, 0.12, 10);
  loft(get("body", "fuselage"), [[0.9, 0.05, 0.05, R * 0.95], [0.5, 0.45, 0.25, R * 1.0], [-0.9, 0.45, 0.25, R * 0.95], [-1.4, 0.05, 0.05, R * 0.85]], 14);
  for (const s of [1, -1]) {
    cylinder(get("gear", "metal"), [L * 0.22, s * fd * 0.62, -h], [-L * 0.2, s * fd * 0.62, -h], 0.05, 0.05, 8);
    cylinder(get("gear", "metal"), [L * 0.12, s * fd * 0.62, -h], [L * 0.1, s * R * 0.6, -R * 0.6], 0.04, 0.04, 8);
    cylinder(get("gear", "metal"), [-L * 0.1, s * fd * 0.62, -h], [-L * 0.1, s * R * 0.6, -R * 0.6], 0.04, 0.04, 8);
  }
  const blades = spec.id === "cabri" ? 3 : spec.id === "h135" || spec.id === "b407" ? 4 : 3;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const chord = 0.3;
    const p0 = [c * 0.3, s * 0.3, 0], p1 = [c * rd, s * rd, -0.08];
    const nx = -s * chord / 2, ny = c * chord / 2;
    const mm = get("rotor", "dark");
    mm.quad([p0[0] - nx, p0[1] - ny, 0], [p1[0] - nx, p1[1] - ny, p1[2]], [p1[0] + nx, p1[1] + ny, p1[2]], [p0[0] + nx, p0[1] + ny, 0]);
  }
  disc(get("tailrotor", "prop"), [0, 0, 0], spec.rotorD * 0.09, "x");
  return toGlb(parts, mats, { rotor: [0, 0, R + 0.55], tailrotor: [-L * 0.6, 0.25, R * 0.4 + 0.7] }, {});
}

// ------------------------------------------------------------------ GLB writer
function toGlb(parts, mats, nodeOffsets = {}, textures = {}) {
  const matNames = Object.keys(mats);
  const gltf = {
    asset: { version: "2.0", generator: "SkyForge procedural" },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
    images: [], textures: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 10497 }],
  };
  const chunks = [];
  let offset = 0;
  const addView = (bytesLike, target) => {
    const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike.buffer, bytesLike.byteOffset, bytesLike.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    chunks.push(bytes);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
    if (target) view.target = target;
    gltf.bufferViews.push(view);
    offset += bytes.byteLength;
    return gltf.bufferViews.length - 1;
  };
  const texIndex = {};
  for (const [k, png] of Object.entries(textures)) {
    if (!png) continue;
    const bv = addView(png);
    gltf.images.push({ bufferView: bv, mimeType: "image/png" });
    gltf.textures.push({ source: gltf.images.length - 1, sampler: 0 });
    texIndex[k] = gltf.textures.length - 1;
  }
  gltf.materials = matNames.map((k) => {
    const m = mats[k];
    const pbr = { baseColorFactor: [...m.color, m.alpha ?? 1], metallicFactor: m.metal, roughnessFactor: m.rough };
    if (m.tex && texIndex[m.tex] != null) pbr.baseColorTexture = { index: texIndex[m.tex] };
    return { name: k, pbrMetallicRoughness: pbr, alphaMode: m.alpha != null ? "BLEND" : "OPAQUE", doubleSided: true };
  });
  for (const [nodeName, byMat] of Object.entries(parts)) {
    const prims = [];
    for (const [matName, mesh] of Object.entries(byMat)) {
      if (!mesh.i.length) continue;
      const pos = new Float32Array(mesh.p), nor = new Float32Array(mesh.n), uv = new Float32Array(mesh.uv);
      const big = pos.length / 3 > 65535;
      const idx = big ? new Uint32Array(mesh.i) : new Uint16Array(mesh.i);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < pos.length; k += 3) for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], pos[k + j]);
        max[j] = Math.max(max[j], pos[k + j]);
      }
      const vp = addView(pos, 34962), vn = addView(nor, 34962), vt = addView(uv, 34962), vi = addView(idx, 34963);
      gltf.accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
      gltf.accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: "VEC3" });
      gltf.accessors.push({ bufferView: vt, componentType: 5126, count: uv.length / 2, type: "VEC2" });
      gltf.accessors.push({ bufferView: vi, componentType: big ? 5125 : 5123, count: idx.length, type: "SCALAR" });
      const a = gltf.accessors.length;
      prims.push({ attributes: { POSITION: a - 4, NORMAL: a - 3, TEXCOORD_0: a - 2 }, indices: a - 1, material: matNames.indexOf(matName) });
    }
    if (!prims.length) continue;
    gltf.meshes.push({ name: nodeName, primitives: prims });
    const node = { name: nodeName, mesh: gltf.meshes.length - 1 };
    if (nodeOffsets[nodeName]) node.translation = nodeOffsets[nodeName];
    gltf.nodes.push(node);
    gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
  }
  if (!gltf.images.length) { delete gltf.images; delete gltf.textures; }
  const bin = new Uint8Array(offset + ((4 - (offset % 4)) % 4));
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  gltf.buffers[0].byteLength = bin.byteLength;
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jpad = (4 - (json.byteLength % 4)) % 4;
  if (jpad) { const j2 = new Uint8Array(json.byteLength + jpad).fill(0x20); j2.set(json); json = j2; }
  const total = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  const glb = new Uint8Array(total);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  glb.set(json, 20);
  dv.setUint32(20 + json.byteLength, bin.byteLength, true);
  dv.setUint32(24 + json.byteLength, 0x004e4942, true);
  glb.set(bin, 28 + json.byteLength);
  return glb;
}

// Small, allocation-light vector / quaternion helpers used by the flight model.
// Conventions:
//   NED   : local North-East-Down navigation frame
//   Body  : x forward, y right wing, z down
//   Quaternion q = [w, x, y, z] rotates BODY vectors into NED.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const KT = 0.514444; // m/s per knot
export const FT = 0.3048; // m per foot
export const NM = 1852; // m per nautical mile
export const G0 = 9.80665;
export const LB = 0.45359237;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Move `v` toward `target` by at most `rate*dt`. */
export const approach = (v, target, rate, dt) => {
  const d = target - v;
  const m = rate * dt;
  return Math.abs(d) <= m ? target : v + Math.sign(d) * m;
};

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);

export function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
export function qNorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
export const qConj = (q) => [q[0], -q[1], -q[2], -q[3]];

/** Rotate vector v by quaternion q (body -> NED). */
export function qRot(q, v) {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}
/** Rotate vector v by the inverse of q (NED -> body). */
export const qRotInv = (q, v) => qRot(qConj(q), v);

/** Quaternion from rotation vector (axis * angle). */
export function qFromRotVec(r) {
  const a = len(r);
  if (a < 1e-12) return [1, r[0] / 2, r[1] / 2, r[2] / 2];
  const s = Math.sin(a / 2) / a;
  return [Math.cos(a / 2), r[0] * s, r[1] * s, r[2] * s];
}

/** Aerospace 3-2-1 Euler (yaw psi, pitch theta, roll phi) -> quaternion body->NED. */
export function qFromEuler(phi, theta, psi) {
  const cr = Math.cos(phi / 2), sr = Math.sin(phi / 2);
  const cp = Math.cos(theta / 2), sp = Math.sin(theta / 2);
  const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}
/** Quaternion -> [phi, theta, psi] (radians). */
export function qToEuler(q) {
  const [w, x, y, z] = q;
  const phi = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const theta = Math.asin(clamp(2 * (w * y - z * x), -1, 1));
  const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [phi, theta, psi];
}

// ---- Geodesy (WGS-84) ----
export const WGS_A = 6378137.0;
const WGS_E2 = 6.69437999014e-3;
export function earthRadii(lat) {
  const s = Math.sin(lat);
  const d = 1 - WGS_E2 * s * s;
  const rn = WGS_A / Math.sqrt(d); // prime vertical
  const rm = (WGS_A * (1 - WGS_E2)) / (d * Math.sqrt(d)); // meridian
  return [rm, rn];
}

/** Great-circle distance (m) and initial bearing (rad) between two lat/lon (rad). */
export function gcDistBrg(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return [d, Math.atan2(y, x)];
}
/** Destination point given start (rad), bearing (rad), distance (m). */
export function gcDest(lat, lon, brg, dist) {
  const R = 6371008.8;
  const d = dist / R;
  const lat2 = Math.asin(
    Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brg),
  );
  const lon2 =
    lon +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
    );
  return [lat2, wrapPi(lon2)];
}
/** Signed cross-track distance (m) of point 3 from the great circle 1->2 (right = +). */
export function crossTrack(lat1, lon1, lat2, lon2, lat3, lon3) {
  const R = 6371008.8;
  const [d13, b13] = gcDistBrg(lat1, lon1, lat3, lon3);
  const [, b12] = gcDistBrg(lat1, lon1, lat2, lon2);
  return Math.asin(Math.sin(d13 / R) * Math.sin(b13 - b12)) * R;
}

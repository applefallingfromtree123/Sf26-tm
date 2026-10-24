// World navigation database (OurAirports) with runway geometry helpers, ILS
// synthesis for instrument runways and radio navigation (VOR/NDB/DME).

import { DEG, RAD, FT, NM, gcDistBrg, gcDest, wrap180 } from "./math.js";

const TYPE_NAME = { 1: "대형 공항", 2: "중형 공항", 3: "소형 비행장", 4: "헬리포트", 5: "수상 비행장" };
const NAV_TYPE = { 1: "VOR", 2: "VOR-DME", 3: "VORTAC", 4: "TACAN", 5: "NDB", 6: "NDB-DME", 7: "DME" };

/** One physical runway end (threshold) with approach direction. */
export class RunwayEnd {
  constructor(apt, raw, reversed) {
    const [le, he, lenFt, widFt, surf, leLat, leLon, leE, hdg, heLat, heLon, heE, leDisp, heDisp, lit] = raw;
    this.apt = apt;
    this.reversed = reversed;
    this.ident = reversed ? he : le;
    this.oppIdent = reversed ? le : he;
    this.lengthM = lenFt * FT;
    this.widthM = widFt * FT;
    this.surface = surf; // 0 hard, 1 soft, 2 water
    this.lighted = !!lit;
    const a = reversed ? [heLat, heLon, heE, heDisp] : [leLat, leLon, leE, leDisp];
    const b = reversed ? [leLat, leLon, leE] : [heLat, heLon, heE];
    this.lat = a[0] * DEG;
    this.lon = a[1] * DEG;
    this.endLat = b[0] * DEG;
    this.endLon = b[1] * DEG;
    this.elevM = a[2] * FT;
    this.endElevM = b[2] * FT;
    this.displacedM = (a[3] || 0) * FT;
    const [d, brg] = gcDistBrg(this.lat, this.lon, this.endLat, this.endLon);
    this.course = d > 10 ? brg : ((reversed ? hdg + 180 : hdg) % 360) * DEG;
    if (d > 10) this.lengthM = d;
    this.cosLat = Math.cos(this.lat);
    // synthesized ILS for instrument-capable runways
    this.hasIls = apt.type <= 2 && this.surface === 0 && this.lengthM > 1500;
    this.gsAngle = 3 * DEG;
    this.ilsFreq = this.hasIls ? 108.1 + ((Math.abs(hash(apt.ident + this.ident)) % 20) * 0.2 + ((hash(this.ident) & 1) ? 0 : 0.05)) : null;
  }
  get name() {
    return `${this.apt.ident} RWY ${this.ident}`;
  }
  /** Point along the centreline (m from threshold, + toward far end) and lateral offset (m, + right). */
  along(dist, lateral = 0) {
    const [la, lo] = gcDest(this.lat, this.lon, this.course, dist);
    if (!lateral) return [la * RAD, lo * RAD];
    const [la2, lo2] = gcDest(la, lo, this.course + Math.PI / 2, lateral);
    return [la2 * RAD, lo2 * RAD];
  }
  alongRad(dist, lateral = 0) {
    const [a, b] = this.along(dist, lateral);
    return [a * DEG, b * DEG];
  }
  /** Aircraft position in runway frame: [x along (m), y right (m), distance to threshold]. */
  localPos(lat, lon) {
    const [d, brg] = gcDistBrg(this.lat, this.lon, lat, lon);
    const rel = brg - this.course;
    return [d * Math.cos(rel), d * Math.sin(rel), d];
  }
}

export class Airport {
  constructor(raw) {
    const [ident, name, type, lat, lon, elev, country, city, iata, rws] = raw;
    this.ident = ident;
    this.name = name;
    this.type = type;
    this.lat = lat * DEG;
    this.lon = lon * DEG;
    this.elevM = elev * FT;
    this.country = country;
    this.city = city;
    this.iata = iata;
    this.rawRunways = rws;
    this._ends = null;
  }
  get typeName() {
    return TYPE_NAME[this.type];
  }
  get runways() {
    if (!this._ends) {
      this._ends = [];
      for (const r of this.rawRunways) {
        this._ends.push(new RunwayEnd(this, r, false));
        if (r[1]) this._ends.push(new RunwayEnd(this, r, true));
      }
    }
    return this._ends;
  }
  /** Physical runways (one per pair) for lighting. */
  get physicalRunways() {
    return this.runways.filter((r) => !r.reversed);
  }
}

export class NavDB {
  constructor() {
    this.airports = [];
    this.byIdent = new Map();
    this.navaids = [];
    this.grid = new Map();
    this.ready = false;
  }

  async load(base = "./data/") {
    const [a, n] = await Promise.all([
      fetch(base + "airports.json").then((r) => r.json()),
      fetch(base + "navaids.json").then((r) => r.json()).catch(() => []),
    ]);
    this.airports = a.map((r) => new Airport(r));
    for (const ap of this.airports) {
      this.byIdent.set(ap.ident.toUpperCase(), ap);
      if (ap.iata) this.byIdent.set("#" + ap.iata.toUpperCase(), ap);
      const key = this.cell(ap.lat, ap.lon);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(ap);
    }
    this.navaids = n.map(([ident, name, type, freq, lat, lon, elev, magvar]) => ({
      ident, name, type, typeName: NAV_TYPE[type], freq: type >= 5 && type <= 6 ? freq : freq / 1000,
      lat: lat * DEG, lon: lon * DEG, elevM: elev * FT, magvar,
    }));
    this.ready = true;
    return this;
  }

  cell(lat, lon) {
    return `${Math.floor(lat * RAD)}:${Math.floor(lon * RAD)}`;
  }

  get(ident) {
    if (!ident) return null;
    const k = ident.trim().toUpperCase();
    return this.byIdent.get(k) || this.byIdent.get("#" + k) || null;
  }

  search(q, limit = 40) {
    q = q.trim().toLowerCase();
    if (!q) return this.airports.slice(0, limit);
    const exact = this.get(q);
    const out = exact ? [exact] : [];
    for (const a of this.airports) {
      if (out.length >= limit) break;
      if (a === exact) continue;
      if (a.ident.toLowerCase().startsWith(q) || a.iata.toLowerCase() === q || a.name.toLowerCase().includes(q) || a.city.toLowerCase().includes(q)) out.push(a);
    }
    return out;
  }

  nearestAirports(lat, lon, radiusM = 50000, max = 20) {
    const res = [];
    const dLat = Math.ceil(radiusM / 111000) + 1;
    const la0 = Math.floor(lat * RAD), lo0 = Math.floor(lon * RAD);
    for (let i = -dLat; i <= dLat; i++) {
      for (let j = -dLat; j <= dLat; j++) {
        const list = this.grid.get(`${la0 + i}:${lo0 + j}`);
        if (!list) continue;
        for (const a of list) {
          const [d] = gcDistBrg(lat, lon, a.lat, a.lon);
          if (d < radiusM) res.push([d, a]);
        }
      }
    }
    res.sort((x, y) => x[0] - y[0]);
    return res.slice(0, max).map((x) => x[1]);
  }

  /**
   * Airport flattening: surveyed runway elevation and blend weight (0..1) at a
   * point (radians). Runway strips (+60 m shoulders/overrun) are flat; terrain
   * blends back to the DEM over 250 m.
   */
  runwayFlatten(lat, lon) {
    const la0 = Math.floor(lat * RAD), lo0 = Math.floor(lon * RAD);
    let best = null, bestW = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.grid.get(`${la0 + i}:${lo0 + j}`);
      if (!list) continue;
      for (const a of list) {
        if (a.type > 3) continue;
        if (Math.abs(a.lat - lat) > 0.0012 * Math.max(1, a.rawRunways.reduce((m, r) => Math.max(m, r[2]), 0) / 6000)) continue;
        if (Math.abs(a.lon - lon) * Math.cos(lat) > 0.0012 * Math.max(1, a.rawRunways.reduce((m, r) => Math.max(m, r[2]), 0) / 6000)) continue;
        for (const rw of a.physicalRunways) {
          if (rw.surface === 2) continue;
          // flat-earth local frame at the threshold
          const n = (lat - rw.lat) * 6371000, e = (lon - rw.lon) * 6371000 * rw.cosLat;
          const cx = Math.cos(rw.course), sx = Math.sin(rw.course);
          const x = n * cx + e * sx, y = -n * sx + e * cx;
          const hw = rw.widthM / 2 + 60;
          const dx = x < -60 ? -60 - x : x > rw.lengthM + 60 ? x - rw.lengthM - 60 : 0;
          const dy = Math.max(Math.abs(y) - hw, 0);
          const d = Math.hypot(dx, dy);
          if (d > 250) continue;
          const t = Math.min(Math.max(d / 250, 0), 1);
          const w = 1 - t * t * (3 - 2 * t);
          if (w > bestW) {
            const f = Math.min(Math.max(x / rw.lengthM, 0), 1);
            bestW = w;
            best = rw.elevM + (rw.endElevM - rw.elevM) * f;
          }
        }
      }
    }
    return bestW > 0 ? [best, bestW] : null;
  }

  navaidsNear(lat, lon, radiusM = 300000, max = 60) {
    const res = [];
    for (const n of this.navaids) {
      if (Math.abs(n.lat - lat) > radiusM / 6.3e6 * 1.2) continue;
      const [d] = gcDistBrg(lat, lon, n.lat, n.lon);
      if (d < radiusM) res.push([d, n]);
    }
    res.sort((a, b) => a[0] - b[0]);
    return res.slice(0, max).map((x) => x[1]);
  }

  findNavaid(ident, nearLat, nearLon) {
    const c = this.navaids.filter((n) => n.ident === ident.toUpperCase());
    if (!c.length) return null;
    c.sort((a, b) => gcDistBrg(nearLat, nearLon, a.lat, a.lon)[0] - gcDistBrg(nearLat, nearLon, b.lat, b.lon)[0]);
    return c[0];
  }

  tuneFreq(freq, lat, lon) {
    // VOR/ILS in MHz, NDB in kHz
    const best = [];
    for (const n of this.navaids) {
      if (Math.abs(n.freq - freq) > 0.001) continue;
      const [d] = gcDistBrg(lat, lon, n.lat, n.lon);
      if (d < 370000) best.push([d, n]);
    }
    best.sort((a, b) => a[0] - b[0]);
    return best[0]?.[1] || null;
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ------------------------------------------------------------------ flight plan & navigation solution
export class FlightPlan {
  constructor() {
    this.dep = null; // RunwayEnd
    this.arr = null; // RunwayEnd
    this.waypoints = []; // {ident, lat, lon, kind}
    this.active = 1;
  }
  /** All points including departure and final approach fix. */
  get points() {
    const pts = [];
    if (this.dep) pts.push({ ident: this.dep.apt.ident, lat: this.dep.lat, lon: this.dep.lon, kind: "dep" });
    pts.push(...this.waypoints);
    if (this.arr) {
      // final approach fix 8 NM out on the extended centreline, 2 NM intercept point
      const [la, lo] = gcDest(this.arr.lat, this.arr.lon, this.arr.course + Math.PI, 10 * NM);
      pts.push({ ident: "FAF" + this.arr.ident, lat: la, lon: lo, kind: "faf", alt: this.arr.elevM + 3000 * FT });
      pts.push({ ident: this.arr.apt.ident + this.arr.ident, lat: this.arr.lat, lon: this.arr.lon, kind: "rwy" });
    }
    return pts;
  }
  get totalDistance() {
    const p = this.points;
    let d = 0;
    for (let i = 1; i < p.length; i++) d += gcDistBrg(p[i - 1].lat, p[i - 1].lon, p[i].lat, p[i].lon)[0];
    return d;
  }
}

/** Compute navigation solution: active leg, cross-track, LOC/GS deviations, radio nav. */
export function navSolution(plan, fm, radios, navdb) {
  const out = { leg: null, loc: null, gs: null, dme: null, nav1: null, adf: null };
  const pts = plan.points;
  if (pts.length >= 2) {
    let i = clampI(plan.active, 1, pts.length - 1);
    let from = pts[i - 1], to = pts[i];
    const [dTo, brgTo] = gcDistBrg(fm.lat, fm.lon, to.lat, to.lon);
    const [, crs] = gcDistBrg(from.lat, from.lon, to.lat, to.lon);
    // sequence when passing abeam or within turn anticipation distance
    const gs = Math.max(fm.telemetry.gs || 50, 50);
    const turn = Math.min(gs * gs / (9.81 * Math.tan(25 * DEG)) * 0.6, 6000);
    if (i < pts.length - 1 && (dTo < turn || Math.cos(brgTo - crs) < 0)) {
      plan.active = i + 1;
      i = plan.active;
      from = pts[i - 1];
      to = pts[i];
    }
    const [, crs2] = gcDistBrg(from.lat, from.lon, to.lat, to.lon);
    const [d13, b13] = gcDistBrg(from.lat, from.lon, fm.lat, fm.lon);
    const xtk = Math.asin(Math.sin(d13 / 6371008.8) * Math.sin(b13 - crs2)) * 6371008.8;
    const [dist, brg] = gcDistBrg(fm.lat, fm.lon, to.lat, to.lon);
    out.leg = { from, to, course: crs2, xtk, dist, brg, index: i };
    out.remaining = dist + pts.slice(i).reduce((acc, p, k, arr) => (k ? acc + gcDistBrg(arr[k - 1].lat, arr[k - 1].lon, p.lat, p.lon)[0] : acc), 0);
  }
  // ILS on the arrival runway (auto-tuned) or any runway whose ILS frequency is dialled on NAV1
  let ils = plan.arr?.hasIls ? plan.arr : null;
  if (radios?.nav1 && ils && Math.abs(ils.ilsFreq - radios.nav1) > 0.001) ils = null;
  if (radios?.nav1 && !ils && radios.ilsCandidates) ils = radios.ilsCandidates.find((r) => Math.abs(r.ilsFreq - radios.nav1) < 0.001) || null;
  if (ils) {
    const [x, y, d] = ils.localPos(fm.lat, fm.lon);
    const locAntenna = ils.lengthM + 300 - x; // distance to localizer antenna beyond far end
    const angDev = Math.atan2(y, Math.max(locAntenna, 1)); // + right of course
    const dots = angDev / (DEG * 1.25); // full scale ±2.5 dots ≈ ±2.5°... (course width 5°)
    const inFront = x < ils.lengthM && locAntenna > 0 && d < 25 * NM;
    out.loc = { valid: inFront && Math.abs(angDev) < 35 * DEG, dev: dots, course: ils.course, rwy: ils, dist: d };
    const gpX = 300 - x; // glide path antenna ~300 m past threshold
    if (gpX > 0) {
      const hAbove = fm.alt - ils.elevM;
      const ang = Math.atan2(hAbove, gpX);
      const gsDots = (ang - ils.gsAngle) / (0.35 * DEG); // ±0.7° full scale = 2 dots
      out.gs = { valid: out.loc.valid && Math.abs(ang - ils.gsAngle) < 3 * DEG && x < 300, dev: gsDots, angle: ils.gsAngle };
    }
    out.dme = d / NM;
  }
  // VOR / NDB
  if (radios?.nav1Station) {
    const st = radios.nav1Station;
    const [d, brg] = gcDistBrg(st.lat, st.lon, fm.lat, fm.lon); // radial FROM station
    const radial = brg - (st.magvar || 0) * DEG;
    const devDeg = wrap180((radial - (radios.obs || 0)) * RAD);
    out.nav1 = { ident: st.ident, dist: d / NM, radial, toFrom: Math.abs(devDeg) > 90 ? "TO" : "FROM", dev: (Math.abs(devDeg) > 90 ? -wrap180(devDeg - 180) : devDeg) / 2 };
  }
  if (radios?.adfStation) {
    const st = radios.adfStation;
    const [, brg] = gcDistBrg(fm.lat, fm.lon, st.lat, st.lon);
    out.adf = { ident: st.ident, rel: brg - fm.telemetry.psi };
  }
  return out;
}

function clampI(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

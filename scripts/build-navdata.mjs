// Builds the world navigation database (airports, runways, navaids) from the
// public-domain OurAirports dataset into compact JSON files under public/data.
//   node scripts/build-navdata.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/";

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length >= head.length - 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

async function get(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCSV(await res.text());
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const num = (v) => (v === "" || v == null ? null : Number(v));
const R = 6371008.8, D = Math.PI / 180;
function dest(lat, lon, brgDeg, dist) {
  const d = dist / R, b = brgDeg * D, la = lat * D, lo = lon * D;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [la2 / D, lo2 / D];
}
function brg(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * D) * Math.cos(lat2 * D);
  const x = Math.cos(lat1 * D) * Math.sin(lat2 * D) - Math.sin(lat1 * D) * Math.cos(lat2 * D) * Math.cos((lon2 - lon1) * D);
  return ((Math.atan2(y, x) / D) + 360) % 360;
}
const TYPE = { large_airport: 1, medium_airport: 2, small_airport: 3, heliport: 4, seaplane_base: 5 };
function surface(s) {
  s = (s || "").toUpperCase();
  if (/WAT/.test(s)) return 2;
  if (/ASP|CON|PEM|BIT|TAR|ASF|PAV|MAC|BRI|CEM/.test(s)) return 0;
  return 1;
}

console.log("downloading OurAirports …");
const [airports, runways, navaids] = await Promise.all([get("airports.csv"), get("runways.csv"), get("navaids.csv")]);
console.log(`airports ${airports.length}, runways ${runways.length}, navaids ${navaids.length}`);

const rwByApt = new Map();
for (const r of runways) {
  if (r.closed === "1") continue;
  const list = rwByApt.get(r.airport_ref) || [];
  list.push(r);
  rwByApt.set(r.airport_ref, list);
}

const outA = [];
let nRw = 0;
for (const a of airports) {
  const t = TYPE[a.type];
  if (!t) continue;
  const lat = num(a.latitude_deg), lon = num(a.longitude_deg);
  if (lat == null || lon == null) continue;
  const elev = num(a.elevation_ft) ?? 0;
  const rws = [];
  for (const r of rwByApt.get(a.id) || []) {
    const len = num(r.length_ft) || (t === 4 ? 60 : 0);
    if (!len) continue;
    let leLat = num(r.le_latitude_deg), leLon = num(r.le_longitude_deg);
    let heLat = num(r.he_latitude_deg), heLon = num(r.he_longitude_deg);
    let hdg = num(r.le_heading_degT);
    if (leLat != null && heLat != null) {
      if (hdg == null) hdg = brg(leLat, leLon, heLat, heLon);
    } else {
      // no threshold coordinates: centre the runway on the airport reference point
      if (hdg == null) {
        const m = /^(\d{1,2})/.exec(r.le_ident || "");
        hdg = m ? Number(m[1]) * 10 : t === 4 ? 0 : null;
      }
      if (hdg == null) continue;
      const half = (len * 0.3048) / 2;
      [leLat, leLon] = dest(lat, lon, hdg + 180, half);
      [heLat, heLon] = dest(lat, lon, hdg, half);
    }
    const leE = num(r.le_elevation_ft) ?? elev, heE = num(r.he_elevation_ft) ?? elev;
    rws.push([
      r.le_ident || "", r.he_ident || "", Math.round(len), Math.round(num(r.width_ft) || (t <= 2 ? 150 : 60)),
      surface(r.surface), r6(leLat), r6(leLon), Math.round(leE), Math.round(hdg * 10) / 10,
      r6(heLat), r6(heLon), Math.round(heE), Math.round(num(r.le_displaced_threshold_ft) || 0), Math.round(num(r.he_displaced_threshold_ft) || 0),
      r.lighted === "1" ? 1 : 0,
    ]);
  }
  if (!rws.length) continue;
  nRw += rws.length;
  outA.push([a.ident, a.name, t, r6(lat), r6(lon), Math.round(elev), a.iso_country, a.municipality || "", a.iata_code || "", rws]);
}
// larger airports first so searches rank them higher
outA.sort((x, y) => x[2] - y[2]);

const NT = { VOR: 1, "VOR-DME": 2, VORTAC: 3, TACAN: 4, NDB: 5, "NDB-DME": 6, DME: 7 };
const outN = [];
for (const n of navaids) {
  const t = NT[n.type];
  if (!t) continue;
  const lat = num(n.latitude_deg), lon = num(n.longitude_deg);
  if (lat == null) continue;
  outN.push([n.ident, n.name, t, Number(n.frequency_khz) || 0, r6(lat), r6(lon), Math.round(num(n.elevation_ft) || 0), Math.round((num(n.magnetic_variation_deg) || 0) * 10) / 10]);
}

mkdirSync(resolve(root, "public/data"), { recursive: true });
writeFileSync(resolve(root, "public/data/airports.json"), JSON.stringify(outA));
writeFileSync(resolve(root, "public/data/navaids.json"), JSON.stringify(outN));
console.log(`wrote ${outA.length} airports / ${nRw} runways, ${outN.length} navaids`);

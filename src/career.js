// Career mode: pilot licences/ranks, job board (passenger, cargo, charter,
// ferry, medevac, sightseeing), flight evaluation, pay, XP and logbook.
// Persisted in localStorage.

import { gcDistBrg, NM, DEG } from "./sim/math.js";

const KEY = "skyforge.career.v1";

export const RANKS = [
  { name: "학생 조종사", en: "Student Pilot", xp: 0, cats: ["ga", "glider"] },
  { name: "자가용 조종사 (PPL)", en: "Private Pilot", xp: 1500, cats: ["aero", "heli"] },
  { name: "사업용 조종사 (CPL·IR)", en: "Commercial Pilot", xp: 5000, cats: ["prop-twin", "tp", "warbird"] },
  { name: "부기장 (First Officer)", en: "First Officer", xp: 12000, cats: ["regional-tp", "bizjet", "narrow"] },
  { name: "기장 (Captain, ATPL)", en: "Captain", xp: 30000, cats: ["wide"] },
  { name: "선임 기장 · 시험 조종사", en: "Senior Captain / Test Pilot", xp: 60000, cats: ["supersonic", "fighter"] },
];

const JOB_TYPES = {
  ga: [["관광 비행", 1.0], ["소화물 운송", 0.9], ["비행 훈련 교차비행", 0.7], ["페리 비행", 0.8]],
  glider: [["크로스컨트리 활공", 1.0]],
  aero: [["에어쇼 이동", 1.2], ["페리 비행", 0.8]],
  heli: [["응급 의료 후송", 1.6], ["관광 비행", 1.1], ["경찰 지원", 1.3]],
  "prop-twin": [["전세 비행", 1.2], ["화물 운송", 1.0]],
  tp: [["지역 화물", 1.0], ["전세 여객", 1.2], ["오지 보급", 1.3]],
  warbird: [["에어쇼 이동", 1.4]],
  "regional-tp": [["지역 여객 노선", 1.0], ["지역 화물", 0.9]],
  bizjet: [["VIP 전세", 1.5], ["의료 후송 제트", 1.6]],
  narrow: [["정기 여객 노선", 1.0], ["화물 특송", 0.9], ["전세 여객", 1.1]],
  wide: [["장거리 국제선", 1.0], ["대형 화물", 0.95]],
  supersonic: [["초음속 대서양 횡단", 1.8]],
  fighter: [["기지 이동 페리", 1.5]],
};

// distance bands (NM) and minimum runway length (m) per class
const BANDS = {
  ga: [15, 140, 500], glider: [10, 40, 400], aero: [20, 120, 500], heli: [8, 70, 0], warbird: [40, 300, 1200],
  "prop-twin": [60, 400, 900], tp: [50, 450, 800], "regional-tp": [120, 600, 1300], bizjet: [200, 1500, 1500],
  narrow: [250, 2200, 2000], wide: [1500, 7000, 2800], supersonic: [1500, 3500, 3000], fighter: [100, 600, 2400],
};
const RATE = { ga: 6, glider: 4, aero: 8, heli: 14, warbird: 12, "prop-twin": 9, tp: 10, "regional-tp": 13, bizjet: 18, narrow: 20, wide: 26, supersonic: 40, fighter: 30 };

export class Career {
  constructor() {
    this.load();
  }
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
    this.d = d || { name: "", started: false, xp: 0, money: 5000, hours: 0, flights: 0, landings: [], base: "RKSI", log: [], jobs: [], active: null, crashes: 0 };
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch {}
  }
  reset() {
    localStorage.removeItem(KEY);
    this.load();
  }
  get rankIndex() {
    let i = 0;
    RANKS.forEach((r, k) => { if (this.d.xp >= r.xp) i = k; });
    return i;
  }
  get rank() { return RANKS[this.rankIndex]; }
  get nextRank() { return RANKS[this.rankIndex + 1] || null; }
  get allowedCats() {
    return RANKS.slice(0, this.rankIndex + 1).flatMap((r) => r.cats);
  }
  canFly(spec) { return this.allowedCats.includes(spec.cat); }
  get avgLanding() {
    const l = this.d.landings;
    return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
  }

  /** Generate a job board from the current base for every unlocked class. */
  generateJobs(navdb, aircraftList) {
    const base = navdb.get(this.d.base);
    if (!base) return [];
    const jobs = [];
    const cats = this.allowedCats;
    let seed = (Date.now() / 3.6e6) | 0; // changes hourly
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const cat of cats) {
      const [dMin, dMax, rwyMin] = BANDS[cat] || [20, 200, 600];
      const types = aircraftList.filter((a) => a.cat === cat);
      if (!types.length) continue;
      const cands = navdb.nearestAirports(base.lat, base.lon, dMax * NM, 4000).filter((a) => {
        if (a === base) return false;
        const [d] = gcDistBrg(base.lat, base.lon, a.lat, a.lon);
        if (d < dMin * NM) return false;
        if (cat === "heli") return true;
        if (a.type === 4) return false;
        return a.runways.some((r) => r.lengthM >= rwyMin && (cat === "ga" || cat === "glider" || r.surface === 0));
      });
      if (!cands.length) continue;
      const n = Math.min(3, cands.length);
      for (let k = 0; k < n; k++) {
        // prefer larger airports for airliners
        const pool = ["narrow", "wide", "supersonic", "regional-tp", "bizjet"].includes(cat) ? cands.filter((a) => a.type <= 2) : cands;
        const dest = (pool.length ? pool : cands)[Math.floor(rnd() * (pool.length || cands.length))];
        const [d] = gcDistBrg(base.lat, base.lon, dest.lat, dest.lon);
        const nm = d / NM;
        const [title, mult] = JOB_TYPES[cat][Math.floor(rnd() * JOB_TYPES[cat].length)];
        const ac = types[Math.floor(rnd() * types.length)];
        const pay = Math.round((400 + nm * RATE[cat]) * mult / 10) * 10;
        const payloadFrac = title.includes("페리") ? 0 : 0.4 + rnd() * 0.55;
        jobs.push({
          id: `${cat}-${dest.ident}-${k}-${seed % 1000}`, cat, title, dep: base.ident, arr: dest.ident, arrName: dest.name,
          nm: Math.round(nm), pay, xp: Math.round(80 + nm * 2 * mult), aircraft: ac.id, payloadFrac,
        });
      }
    }
    this.d.jobs = jobs;
    this.save();
    return jobs;
  }

  accept(job) {
    this.d.active = { ...job, started: null };
    this.save();
  }
  cancel() {
    this.d.active = null;
    this.save();
  }

  /**
   * Evaluate a finished flight.
   * stats: { landed, crashed, airport (ident), touchdownFpm, maxG, overspeed, stallTime, flightTimeH, crashReason }
   */
  complete(stats) {
    const job = this.d.active;
    const d = this.d;
    d.hours += stats.flightTimeH;
    d.flights += 1;
    const entry = {
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      aircraft: stats.aircraftName, dep: stats.dep, arr: stats.airport || "—", time: stats.flightTimeH,
      fpm: stats.touchdownFpm != null ? Math.round(stats.touchdownFpm) : null, result: "", pay: 0, xp: 0, job: job?.title || "자유 비행",
    };
    if (stats.crashed) {
      const repair = Math.round(2000 + (stats.massKg || 5000) * 0.4);
      d.money -= repair;
      d.crashes += 1;
      entry.result = `사고 — ${stats.crashReason}`;
      entry.pay = -repair;
      if (job) d.active = null;
    } else if (stats.landed) {
      const fpm = Math.abs(stats.touchdownFpm ?? 300);
      d.landings.push(fpm);
      if (d.landings.length > 100) d.landings.shift();
      // landing score: 100 at 60-200 fpm, falls off above 300 fpm, slight penalty for floating (<40 fpm)
      let score = fpm < 40 ? 85 : fpm <= 200 ? 100 : Math.max(0, 100 - (fpm - 200) * 0.18);
      if (stats.maxG > 1.6) score -= (stats.maxG - 1.6) * 30;
      if (stats.overspeed) score -= 15;
      if (stats.stallTime > 2) score -= 10;
      score = Math.max(0, Math.round(score));
      entry.score = score;
      if (job && stats.airport === job.arr) {
        const pay = Math.round(job.pay * (0.5 + score / 200));
        const xp = Math.round(job.xp * (0.6 + score / 250));
        d.money += pay;
        d.xp += xp;
        d.base = job.arr;
        entry.result = `임무 완료 · 착륙 점수 ${score}`;
        entry.pay = pay;
        entry.xp = xp;
        d.active = null;
      } else {
        const xp = Math.round(20 + stats.flightTimeH * 120);
        d.xp += xp;
        entry.xp = xp;
        if (stats.airport) d.base = stats.airport;
        entry.result = job ? `목적지 아님 (${stats.airport || "비공항"}) · 착륙 점수 ${score}` : `자유 비행 · 착륙 점수 ${score}`;
      }
    } else {
      entry.result = "비행 중단";
    }
    d.log.unshift(entry);
    if (d.log.length > 200) d.log.pop();
    this.save();
    return entry;
  }
}

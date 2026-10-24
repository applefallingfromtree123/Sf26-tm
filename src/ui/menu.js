// Main menu: world-map flight planning, aircraft hangar & spec sheets with
// liveries, fuel/payload, weather/time, settings (world sources, graphics,
// controller axes), key reference and career mode.

import { AIRCRAFT, CATEGORIES, getAircraft } from "../sim/aircraft.js";
import { SPEC_EXTRA, liveriesFor } from "../sim/specs.js";
import { FlightModel } from "../sim/fdm.js";
import { IMAGERY, TERRAIN } from "../world/world.js";
import { KEY_HELP } from "./controls.js";
import { RANKS } from "../career.js";
import { RAD, FT, NM, gcDistBrg } from "../sim/math.js";

const $ = (id) => document.getElementById(id);
const STORE = "skyforge.cfg.v1";

export const DEFAULT_CFG = {
  aircraftId: "a320", liveryId: null, dep: "RKSI", depRwy: null, arr: "RKPC", arrRwy: null, route: "", cruiseAlt: 35000, minimums: 200,
  startMode: "runway", fuel: 60, payload: 50,
  wx: { preset: "clear", dir: 270, spd: 5, dirUp: 280, spdUp: 40, gust: 0, turb: 0, vis: 30, temp: 15, qnh: 1013, clouds: "" },
  realTime: true, utc: null,
  settings: { imagery: "esri", terrain: "terrarium", ionToken: "", googleKey: "", buildings: false, quality: "medium", fov: 50, vol: 70, baro: "hpa", callouts: true },
};

export class Menu {
  constructor(app) {
    this.app = app;
    this.cfg = this.load();
    this.cat = "all";
  }

  load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE));
      if (v) return { ...DEFAULT_CFG, ...v, wx: { ...DEFAULT_CFG.wx, ...v.wx }, settings: { ...DEFAULT_CFG.settings, ...v.settings } };
    } catch {}
    return structuredClone(DEFAULT_CFG);
  }
  save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.cfg)); } catch {}
  }

  init() {
    const c = this.cfg;
    // tabs
    document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => this.tab(b.dataset.tab)));
    // plan
    this.bindSearch("dep");
    this.bindSearch("arr");
    $("depRwy").addEventListener("change", () => { c.depRwy = $("depRwy").value; this.changed(); });
    $("arrRwy").addEventListener("change", () => { c.arrRwy = $("arrRwy").value; this.changed(); });
    for (const [id, key, num] of [["startMode", "startMode"], ["route", "route"], ["cruiseAlt", "cruiseAlt", 1], ["minimums", "minimums", 1]]) {
      $(id).value = c[key];
      $(id).addEventListener("change", () => { c[key] = num ? Number($(id).value) : $(id).value; this.changed(); });
    }
    // aircraft
    this.renderCats();
    this.renderAircraft();
    // load
    for (const [id, key, lbl] of [["fuel", "fuel", "fuelLbl"], ["payload", "payload", "payLbl"]]) {
      $(id).value = c[key];
      $(id).addEventListener("input", () => { c[key] = Number($(id).value); this.updateMass(); this.save(); });
    }
    // weather
    const W = c.wx;
    const wmap = [["wxDir", "dir"], ["wxSpd", "spd"], ["wxDirUp", "dirUp"], ["wxSpdUp", "spdUp"], ["wxGust", "gust"], ["wxTurb", "turb"], ["wxVis", "vis"], ["wxTemp", "temp"], ["wxQnh", "qnh"]];
    for (const [id, k] of wmap) {
      $(id).value = W[k];
      $(id).addEventListener("change", () => { W[k] = Number($(id).value); this.save(); });
    }
    $("wxClouds").value = W.clouds;
    $("wxClouds").addEventListener("change", () => { W.clouds = $("wxClouds").value.toUpperCase(); this.save(); });
    $("wxPreset").value = W.preset;
    $("wxPreset").addEventListener("change", () => this.applyPreset($("wxPreset").value));
    $("metarBtn").addEventListener("click", () => this.fetchMetar());
    $("realTime").checked = c.realTime;
    $("realTime").addEventListener("change", () => { c.realTime = $("realTime").checked; this.save(); });
    const now = new Date();
    $("utcTime").value = (c.utc || now.toISOString()).slice(0, 16);
    $("utcTime").addEventListener("change", () => { c.utc = $("utcTime").value + ":00Z"; c.realTime = false; $("realTime").checked = false; this.save(); });
    document.querySelectorAll("#timeChips button").forEach((b) => b.addEventListener("click", () => this.setSolarTime(Number(b.dataset.h))));
    // settings
    const S = c.settings;
    $("setImagery").innerHTML = Object.entries(IMAGERY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    $("setTerrain").innerHTML = Object.entries(TERRAIN).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    for (const [id, k, type] of [["setImagery", "imagery"], ["setTerrain", "terrain"], ["setIon", "ionToken"], ["setGoogle", "googleKey"], ["setQuality", "quality"], ["setBaro", "baro"], ["setFov", "fov", "n"], ["setVol", "vol", "n"], ["setBuildings", "buildings", "b"], ["setCallouts", "callouts", "b"]]) {
      const el = $(id);
      if (type === "b") el.checked = S[k];
      else el.value = S[k];
      el.addEventListener("change", () => {
        S[k] = type === "b" ? el.checked : type === "n" ? Number(el.value) : el.value.trim();
        this.save();
        if (["imagery", "terrain", "ionToken", "googleKey", "buildings", "quality"].includes(k)) this.app.worldSettingsChanged();
        if (k === "vol") this.app.audio.setVolume(S.vol / 100);
        this.updateLabels();
      });
    }
    this.updateLabels();
    this.renderAxes();
    // keys
    const rows = KEY_HELP.map(([k, v]) => (v ? `<tr><td>${k}</td><td>${v}</td></tr>` : `<tr class="h"><td colspan="2">${k}</td></tr>`)).join("");
    $("keyTable").innerHTML = rows;
    $("helpTable").innerHTML = rows;
    $("startBtn").addEventListener("click", () => this.app.startFlight());
    this.refreshPlan();
    this.renderCareer();
  }

  tab(name) {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
    $("menu").classList.toggle("wide", name === "aircraft" || name === "career" || name === "keys");
    $("globePop").classList.add("hidden");
    if (name === "aircraft") this.showSpec();
    if (name === "career") this.renderCareer();
  }

  changed() {
    this.save();
    this.refreshPlan();
  }

  // ------------------------------------------------------------ flight plan
  bindSearch(which) {
    const inp = $(which + "Search"), res = $(which + "Results");
    inp.addEventListener("input", () => {
      const db = this.app.navdb;
      if (!db.ready) return;
      const list = db.search(inp.value, 30);
      res.innerHTML = list.map((a) => `<div data-id="${a.ident}"><b>${a.ident}</b>${esc(a.name)}<span class="t">${a.iata ? a.iata + " · " : ""}${esc(a.city || a.country)}</span></div>`).join("");
    });
    res.addEventListener("click", (e) => {
      const d = e.target.closest("div[data-id]");
      if (!d) return;
      this.setAirport(which, d.dataset.id, true);
      res.innerHTML = "";
      inp.value = "";
    });
  }

  setAirport(which, ident, fly = false) {
    this.cfg[which] = ident;
    this.cfg[which + "Rwy"] = null;
    this.changed();
    const apt = this.app.navdb.get(ident);
    if (fly && apt) this.app.world?.flyToAirport(apt);
  }

  refreshPlan() {
    const db = this.app.navdb;
    if (!db.ready) return;
    const c = this.cfg;
    const dep = db.get(c.dep), arr = db.get(c.arr);
    const rwyOpts = (apt, sel) => {
      if (!apt) return "";
      const list = apt.runways.slice().sort((a, b) => b.lengthM - a.lengthM);
      return list.map((r) => `<option value="${r.ident}" ${r.ident === sel ? "selected" : ""}>${r.ident} — ${Math.round(r.lengthM)} m${r.hasIls ? " · ILS " + r.ilsFreq.toFixed(2) : ""}${r.surface === 1 ? " · 비포장" : r.surface === 2 ? " · 수상" : ""}</option>`).join("");
    };
    $("depSel").textContent = dep ? `${dep.ident} · ${dep.name} (${dep.city || dep.country}) · 표고 ${Math.round(dep.elevM / FT)} ft` : "선택 없음";
    $("arrSel").textContent = arr ? `${arr.ident} · ${arr.name} (${arr.city || arr.country}) · 표고 ${Math.round(arr.elevM / FT)} ft` : "선택 없음";
    $("depRwy").innerHTML = rwyOpts(dep, c.depRwy);
    $("arrRwy").innerHTML = rwyOpts(arr, c.arrRwy);
    if (dep && !c.depRwy) c.depRwy = $("depRwy").value;
    if (arr && !c.arrRwy) c.arrRwy = $("arrRwy").value;
    const plan = this.app.buildPlan();
    const spec = getAircraft(c.aircraftId);
    let info = "";
    if (plan.dep && plan.arr) {
      const nm = plan.totalDistance / NM;
      const cruiseKt = spec.cr ? spec.cr[0] : (spec.vno || 100);
      const hours = nm / cruiseKt;
      info = `총 거리 ${nm.toFixed(0)} NM · 예상 비행시간 ${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, "0")}m (${spec.name} 순항 ${cruiseKt} KTAS)<br>`;
      info += `경로: ${plan.points.map((p) => p.ident).join(" → ")}`;
      const ext = SPEC_EXTRA[spec.id];
      if (ext?.range && nm > ext.range) info += `<br><span style="color:var(--warn)">⚠ 기체 최대 항속거리(${ext.range} NM)를 초과합니다.</span>`;
    }
    $("routeInfo").innerHTML = info;
    $("sumRoute").innerHTML = `<p>${dep ? dep.ident + " " + (c.depRwy || "") : "—"} → ${arr ? arr.ident + " " + (c.arrRwy || "") : "—"}</p><p>${$("startMode").selectedOptions[0]?.textContent || ""}</p>`;
    this.app.world?.showRoute(plan.points, dep, arr);
    this.save();
  }

  /** Popup when an airport is clicked on the globe. */
  globePick(apt, pos) {
    const pop = $("globePop");
    if (!apt) { pop.classList.add("hidden"); return; }
    const longest = apt.runways.reduce((m, r) => Math.max(m, r.lengthM), 0);
    pop.innerHTML = `<h4>${apt.ident}${apt.iata ? " / " + apt.iata : ""} — ${esc(apt.name)}</h4>
      <p>${apt.typeName} · ${esc(apt.city || "")} ${apt.country}</p>
      <p>표고 ${Math.round(apt.elevM / FT)} ft · 활주로 ${apt.runways.length / (apt.rawRunways[0]?.[1] ? 2 : 1)}개 · 최장 ${Math.round(longest)} m</p>
      <p>${apt.runways.filter((r) => r.hasIls).map((r) => r.ident).join(", ") ? "ILS: " + apt.runways.filter((r) => r.hasIls).map((r) => r.ident).join(", ") : ""}</p>
      <div class="btns"><button class="primary" data-w="dep">출발지로</button><button data-w="arr">도착지로</button><button data-w="zoom">확대</button></div>`;
    pop.classList.remove("hidden");
    const x = Math.min(pos.x + 14, window.innerWidth - 280), y = Math.min(pos.y + 14, window.innerHeight - 180);
    pop.style.left = x + "px";
    pop.style.top = y + "px";
    pop.onclick = (e) => {
      const w = e.target.dataset.w;
      if (!w) return;
      if (w === "zoom") this.app.world.flyToAirport(apt, 15000);
      else { this.setAirport(w, apt.ident); pop.classList.add("hidden"); this.tab("plan"); }
    };
  }

  // ------------------------------------------------------------ aircraft & hangar
  renderCats() {
    $("catChips").innerHTML = CATEGORIES.map(([k, v]) => `<button data-c="${k}" class="${k === this.cat ? "active" : ""}">${v}</button>`).join("");
    $("catChips").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      this.cat = b.dataset.c;
      this.renderCats();
      this.renderAircraft();
    };
  }

  renderAircraft() {
    const career = this.app.careerActive();
    const list = AIRCRAFT.filter((a) => this.cat === "all" || a.cat === this.cat);
    $("acList").innerHTML = list.map((a) => {
      const ex = SPEC_EXTRA[a.id] || {};
      const eng = a.eng.type === "none" ? "무동력" : `${a.eng.n}× ${a.eng.kn ? a.eng.kn + " kN" : a.eng.kw + " kW"}`;
      const locked = career && !this.app.career.canFly(a);
      return `<div class="ac ${a.id === this.cfg.aircraftId ? "active" : ""} ${locked ? "lock" : ""}" data-id="${a.id}">
        <h3>${a.name}</h3><div class="cls">${a.cls} · ${{ airliner: "글라스 콕핏 (PFD/ND/EICAS)", g1000: "Garmin 글라스", analog: "아날로그 6팩", fighter: "HUD + MFD", heli: "헬기 계기", glider: "활공 계기" }[a.cockpit] || ""}</div>
        <dl><dt>엔진</dt><dd>${eng}</dd><dt>MTOW</dt><dd>${a.mtow.toLocaleString()} kg</dd>
        ${a.vr ? `<dt>VR / VREF</dt><dd>${a.vr} / ${a.vref} kt</dd>` : ""}<dt>상승한도</dt><dd>${a.ceil.toLocaleString()} ft</dd>
        ${ex.range ? `<dt>항속</dt><dd>${ex.range.toLocaleString()} NM</dd>` : ""}</dl></div>`;
    }).join("");
    $("acList").onclick = (e) => {
      const d = e.target.closest(".ac");
      if (!d) return;
      this.cfg.aircraftId = d.dataset.id;
      this.cfg.liveryId = null;
      this.save();
      this.renderAircraft();
      this.showSpec();
      this.refreshPlan();
      this.updateMass();
    };
    this.updateSummary();
  }

  showSpec() {
    const spec = getAircraft(this.cfg.aircraftId);
    const livs = liveriesFor(spec);
    if (!livs.find((l) => l.id === this.cfg.liveryId)) this.cfg.liveryId = livs[0].id;
    $("livChips").innerHTML = livs.map((l) => `<button data-l="${l.id}" class="${l.id === this.cfg.liveryId ? "active" : ""}">${l.name}</button>`).join("");
    $("livChips").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      this.cfg.liveryId = b.dataset.l;
      this.save();
      this.showSpec();
    };
    const fm = new FlightModel(spec, { fuelFrac: this.cfg.fuel / 100, payloadFrac: this.cfg.payload / 100 });
    const ex = SPEC_EXTRA[spec.id] || {};
    const d = fm.d;
    const row = (k, v) => (v == null || v === "" ? "" : `<tr><td>${k}</td><td>${v}</td></tr>`);
    const eng = spec.eng.type === "none" ? "없음" : spec.eng.kn ? `${spec.eng.n} × ${spec.eng.kn} kN (${Math.round(spec.eng.kn * 224.8).toLocaleString()} lbf)${spec.eng.ab ? ` · A/B ${spec.eng.ab} kN` : ""}` : `${spec.eng.n} × ${spec.eng.kw} kW (${Math.round(spec.eng.kw * 1.341)} hp)`;
    $("specSheet").innerHTML = `<h2>${spec.name}</h2><div class="specdesc">${ex.desc || ""}</div>
      <table class="spec">
        ${row("제조사", spec.maker)}${row("분류", spec.cls)}${row("초도 비행", ex.first)}
        ${row("승무원 / 좌석", ex.crew != null ? `${ex.crew}명 / ${ex.pax}석` : null)}
        ${row("엔진", ex.eng)}${row("추력 / 출력", eng)}
        ${row("전장 / 날개폭", `${spec.L} m / ${spec.b} m`)}${spec.S ? row("날개 면적 / 종횡비", `${spec.S} m² / ${(spec.b ** 2 / spec.S).toFixed(1)}`) : ""}
        ${spec.model?.sw ? row("후퇴각", `${spec.model.sw}°`) : ""}
        ${row("자체 중량 / MTOW", `${spec.mE.toLocaleString()} / ${spec.mtow.toLocaleString()} kg`)}
        ${row("연료 용량", spec.fuel ? `${spec.fuel.toLocaleString()} kg` : "—")}
        ${spec.vs1 ? row("VS0 / VS1 (MTOW)", `${spec.vs0} / ${spec.vs1} KIAS`) : ""}
        ${spec.vr ? row("VR / VREF", `${spec.vr} / ${spec.vref} KIAS`) : ""}
        ${row(spec.mmo ? "VMO / MMO" : "VNE", spec.mmo ? `${spec.vne} KIAS / M${spec.mmo}` : `${spec.vne} KIAS`)}
        ${spec.cr ? row("순항", `${spec.cr[0]} KTAS @ ${spec.cr[1].toLocaleString()} ft`) : ""}
        ${row("실용 상승한도", `${spec.ceil.toLocaleString()} ft`)}${row("최대 항속", ex.range ? `${ex.range.toLocaleString()} NM` : null)}
        ${row("조종 계통", spec.fbw === "airbus" ? "FBW 노멀 로 (사이드스틱)" : spec.fbw === "fighter" ? "디지털 FBW (G 명령)" : "기계식 / 유압 부스트")}
        ${row("자동비행", [spec.ap ? "AP/FD" : null, spec.at ? "오토스로틀" : null].filter(Boolean).join(" · ") || "없음")}
        ${row("착륙장치", `${{ tri: "전륜식", tail: "후륜식(테일드래거)", mono: "단일 휠", skid: "스키드" }[spec.gear.type]}${spec.gear.retract ? " · 접이식" : " · 고정식"}`)}
        ${!fm.heli && d.CLmax ? row("FDM: CLmax 클린/착륙", `${d.CLmax.toFixed(2)} / ${d.CLmaxLand.toFixed(2)}`) : ""}
        ${!fm.heli && d.CD0 ? row("FDM: CD0 / e", `${d.CD0.toFixed(4)} / ${d.e}`) : ""}
      </table>`;
    const liv = livs.find((l) => l.id === this.cfg.liveryId);
    this.app.showHangar(spec, fm.cgHeight, liv);
    this.updateSummary();
  }

  updateSummary() {
    const spec = getAircraft(this.cfg.aircraftId);
    const liv = liveriesFor(spec).find((l) => l.id === this.cfg.liveryId) || liveriesFor(spec)[0];
    $("sumAc").innerHTML = `<h3>${spec.name}</h3><p>${spec.cls} · ${liv.name} · ${liv.reg}</p>`;
    this.updateMass();
  }

  updateMass() {
    const spec = getAircraft(this.cfg.aircraftId);
    const fm = new FlightModel(spec, { fuelFrac: this.cfg.fuel / 100, payloadFrac: this.cfg.payload / 100 });
    $("fuelLbl").textContent = `${this.cfg.fuel}% · ${Math.round(fm.fuel).toLocaleString()} kg`;
    $("payLbl").textContent = `${this.cfg.payload}% · ${Math.round(fm.payload).toLocaleString()} kg`;
    const over = fm.mass > spec.mtow;
    $("massInfo").innerHTML = `자체 중량 ${spec.mE.toLocaleString()} kg<br>연료 ${Math.round(fm.fuel).toLocaleString()} kg / 탑재 ${Math.round(fm.payload).toLocaleString()} kg<br>총 중량 <b style="color:${over ? "var(--bad)" : "var(--good)"}">${Math.round(fm.mass).toLocaleString()} kg</b> / MTOW ${spec.mtow.toLocaleString()} kg${over ? " — 최대 이륙중량 초과!" : ""}`;
  }

  // ------------------------------------------------------------ weather
  applyPreset(p) {
    const W = this.cfg.wx;
    W.preset = p;
    const P = {
      clear: { vis: 50, clouds: "", turb: 0, gust: 0, spd: 5 },
      few: { vis: 30, clouds: "FEW040", turb: 0.05, gust: 0, spd: 8 },
      sct: { vis: 20, clouds: "SCT030 SCT080", turb: 0.15, gust: 0, spd: 10 },
      bkn: { vis: 10, clouds: "BKN020 BKN070", turb: 0.25, gust: 5, spd: 14 },
      ovc: { vis: 4, clouds: "OVC008", turb: 0.2, gust: 0, spd: 10 },
      fog: { vis: 0.4, clouds: "OVC002", turb: 0, gust: 0, spd: 2 },
      windy: { vis: 25, clouds: "SCT045", turb: 0.6, gust: 15, spd: 25 },
    }[p];
    Object.assign(W, P);
    for (const [id, k] of [["wxSpd", "spd"], ["wxGust", "gust"], ["wxTurb", "turb"], ["wxVis", "vis"]]) $(id).value = W[k];
    $("wxClouds").value = W.clouds;
    this.save();
  }

  async fetchMetar() {
    const id = this.cfg.dep;
    $("metarInfo").textContent = `${id} METAR 조회 중…`;
    try {
      const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(id)}&format=json`);
      const j = await r.json();
      const m = j[0];
      if (!m) throw new Error("데이터 없음");
      const W = this.cfg.wx;
      if (typeof m.wdir === "number") W.dir = m.wdir;
      W.spd = m.wspd ?? W.spd;
      W.gust = m.wgst ? m.wgst - (m.wspd || 0) : 0;
      W.temp = m.temp ?? W.temp;
      W.qnh = Math.round(m.altim ?? W.qnh);
      const vis = typeof m.visib === "string" ? parseFloat(m.visib) : m.visib;
      W.vis = vis ? Math.min(vis * 1.609, 50) : W.vis;
      W.clouds = (m.clouds || []).filter((c) => c.base != null).map((c) => `${c.cover}${String(Math.round(c.base / 100)).padStart(3, "0")}`).join(" ");
      W.dirUp = (W.dir + 20) % 360;
      W.spdUp = Math.max(W.spd * 3, 25);
      for (const [idd, k] of [["wxDir", "dir"], ["wxSpd", "spd"], ["wxGust", "gust"], ["wxTemp", "temp"], ["wxQnh", "qnh"], ["wxVis", "vis"], ["wxDirUp", "dirUp"], ["wxSpdUp", "spdUp"]]) $(idd).value = typeof W[k] === "number" ? Math.round(W[k] * 10) / 10 : W[k];
      $("wxClouds").value = W.clouds;
      $("metarInfo").textContent = m.rawOb || "적용됨";
      this.save();
    } catch (e) {
      $("metarInfo").textContent = `METAR를 가져오지 못했습니다 (${e.message}). 네트워크/CORS 제한일 수 있습니다 — 수동 입력을 사용하세요.`;
    }
  }

  setSolarTime(h) {
    const apt = this.app.navdb.get(this.cfg.dep);
    const lonDeg = apt ? apt.lon * RAD : 127;
    const d = new Date();
    const utcH = (((h - lonDeg / 15) % 24) + 24) % 24;
    d.setUTCHours(Math.floor(utcH), Math.round((utcH % 1) * 60), 0, 0);
    this.cfg.utc = d.toISOString();
    this.cfg.realTime = false;
    $("realTime").checked = false;
    $("utcTime").value = this.cfg.utc.slice(0, 16);
    this.save();
  }

  updateLabels() {
    const S = this.cfg.settings;
    $("fovLbl").textContent = `${S.fov}°`;
    $("volLbl").textContent = `${S.vol}%`;
  }

  renderAxes() {
    const ctl = this.app.controls;
    const fns = [["roll", "롤 (에일러론)"], ["pitch", "피치 (엘리베이터)"], ["yaw", "요 (러더)"], ["throttle", "스로틀"], ["brake", "토 브레이크"]];
    $("axisBind").innerHTML = `<p class="hint">조이스틱·요크·스로틀·페달을 연결하고 아무 버튼이나 누른 뒤, "할당"을 누르고 해당 축을 끝까지 움직이세요.</p>` +
      fns.map(([k, l]) => `<div class="axisrow"><span>${l}</span><div class="meter"><i id="ax-${k}"></i></div><button data-k="${k}">할당</button><button data-inv="${k}">반전</button></div>`).join("");
    $("axisBind").onclick = (e) => {
      const k = e.target.dataset.k, inv = e.target.dataset.inv;
      if (k) {
        e.target.textContent = "움직이세요…";
        ctl.bindAxis(k, (i) => { e.target.textContent = `축 ${i}`; });
      }
      if (inv && ctl.axisMap[inv]) {
        ctl.axisMap[inv].invert = !ctl.axisMap[inv].invert;
        ctl.saveAxes();
        e.target.textContent = ctl.axisMap[inv].invert ? "반전됨" : "반전";
      }
    };
  }
  updateAxisMeters() {
    const ctl = this.app.controls;
    const set = (k, v) => { const el = $("ax-" + k); if (el) el.style.left = `${(v + 1) * 50}%`; };
    set("roll", ctl.roll);
    set("pitch", -ctl.pitch);
    set("yaw", ctl.yaw);
    set("throttle", ctl.throttle * 2 - 1);
    set("brake", ctl.brake * 2 - 1);
  }

  // ------------------------------------------------------------ career
  renderCareer() {
    const car = this.app.career;
    const d = car.d;
    const el = $("careerView");
    if (!el) return;
    if (!d.started) {
      el.innerHTML = `<div class="card narrow"><h2>커리어 시작</h2>
        <p class="hint">학생 조종사로 시작해 임무(관광·화물·여객·전세·의료후송)를 수행하며 경험치와 수입을 쌓고, 자가용 → 사업용 → 부기장 → 기장 → 시험 조종사로 승급하세요. 등급에 따라 조종 가능한 기종이 해금됩니다. 착륙 강하율·G·과속·실속이 평가되며, 사고 시 수리비가 청구됩니다.</p>
        <label>조종사 이름</label><input id="pilotName" placeholder="이름" />
        <label>홈 베이스 공항 (ICAO)</label><input id="pilotBase" value="RKSI" />
        <button class="primary" id="careerStart" style="margin-top:14px;width:100%">커리어 시작</button></div>`;
      $("careerStart").onclick = () => {
        const base = this.app.navdb.get($("pilotBase").value) ? $("pilotBase").value.toUpperCase() : "RKSI";
        d.name = $("pilotName").value || "Pilot";
        d.base = base;
        d.started = true;
        car.save();
        car.generateJobs(this.app.navdb, AIRCRAFT);
        this.renderCareer();
        this.renderAircraft();
      };
      return;
    }
    const r = car.rank, nx = car.nextRank;
    const pct = nx ? ((d.xp - r.xp) / (nx.xp - r.xp)) * 100 : 100;
    if (!d.jobs?.length) car.generateJobs(this.app.navdb, AIRCRAFT);
    const base = this.app.navdb.get(d.base);
    const act = d.active;
    el.innerHTML = `
      <div class="grid2">
        <div class="card">
          <div class="career-head"><div><h2>${esc(d.name)} — ${r.name}</h2><div class="hint">${r.en} · 기지 ${d.base} ${base ? esc(base.name) : ""}</div></div><div style="font:700 20px var(--mono);color:var(--good)">$${d.money.toLocaleString()}</div></div>
          <div class="xpbar"><i style="width:${pct}%"></i></div>
          <div class="hint">XP ${d.xp.toLocaleString()} ${nx ? `/ ${nx.xp.toLocaleString()} → 다음 등급: ${nx.name} (해금: ${nx.cats.map(catName).join(", ")})` : "· 최고 등급"}</div>
          <div class="stats">
            <div><b>${d.hours.toFixed(1)}</b><span>비행 시간</span></div>
            <div><b>${d.flights}</b><span>비행 횟수</span></div>
            <div><b>${car.avgLanding != null ? Math.round(car.avgLanding) : "—"}</b><span>평균 접지 fpm</span></div>
            <div><b>${d.crashes}</b><span>사고</span></div>
          </div>
          <p class="hint" style="margin-top:10px">조종 가능: ${car.allowedCats.map(catName).join(", ")}</p>
          ${act ? `<div class="job" style="border-color:var(--accent)"><div><h4>진행 중: ${act.title}</h4><p>${act.dep} → ${act.arr} (${esc(act.arrName)}) · ${act.nm} NM · ${getAircraft(act.aircraft).name}</p></div><div><div class="pay">$${act.pay.toLocaleString()}</div><button id="jobFly">비행</button> <button id="jobCancel" style="background:#444">취소</button></div></div>` : ""}
          <button class="secondary" id="careerReset">커리어 초기화</button>
        </div>
        <div class="card"><h2>임무 게시판 — ${d.base}</h2>
          <button class="secondary" id="jobRefresh" style="margin:0 0 6px">새로고침</button>
          ${(d.jobs || []).map((j, i) => `<div class="job"><div><h4>${j.title} · ${catName(j.cat)}</h4><p>${j.dep} → ${j.arr} ${esc(j.arrName)}</p><p>${j.nm} NM · ${getAircraft(j.aircraft).name} · 탑재 ${Math.round(j.payloadFrac * 100)}%</p></div><div><div class="pay">$${j.pay.toLocaleString()}</div><p style="text-align:right">+${j.xp} XP</p><button data-j="${i}">수락</button></div></div>`).join("") || "<p class='hint'>주변에 가능한 임무가 없습니다.</p>"}
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h2>로그북</h2>
        <table class="log"><tr><th>일시</th><th>임무</th><th>기종</th><th>구간</th><th>시간</th><th>접지</th><th>결과</th><th>수입</th></tr>
        ${d.log.slice(0, 40).map((l) => `<tr><td>${l.date}</td><td>${esc(l.job)}</td><td>${esc(l.aircraft)}</td><td>${l.dep} → ${l.arr}</td><td>${l.time.toFixed(1)}h</td><td>${l.fpm != null ? l.fpm + " fpm" : "—"}</td><td>${esc(l.result)}</td><td style="color:${l.pay < 0 ? "var(--bad)" : "var(--good)"}">${l.pay ? "$" + l.pay.toLocaleString() : ""}</td></tr>`).join("")}</table>
      </div>`;
    el.querySelectorAll("button[data-j]").forEach((b) => (b.onclick = () => {
      const j = d.jobs[Number(b.dataset.j)];
      car.accept(j);
      Object.assign(this.cfg, { aircraftId: j.aircraft, liveryId: null, dep: j.dep, arr: j.arr, depRwy: null, arrRwy: null, payload: Math.round(j.payloadFrac * 100), startMode: "runway" });
      $("startMode").value = "runway";
      $("payload").value = this.cfg.payload;
      this.changed();
      this.renderAircraft();
      this.renderCareer();
    }));
    $("jobRefresh").onclick = () => { car.generateJobs(this.app.navdb, AIRCRAFT); this.renderCareer(); };
    $("careerReset").onclick = () => { if (confirm("커리어를 초기화할까요?")) { car.reset(); this.renderCareer(); this.renderAircraft(); } };
    if ($("jobFly")) $("jobFly").onclick = () => this.app.startFlight();
    if ($("jobCancel")) $("jobCancel").onclick = () => { car.cancel(); this.renderCareer(); };
  }
}

function catName(c) {
  return (CATEGORIES.find(([k]) => k === c) || [c, c])[1];
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}
export { RANKS };

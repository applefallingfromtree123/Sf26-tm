// SkyForge Flight Simulator — application shell.
// Ties together the flight model, flight controls, the Cesium world, the
// 3D cockpit, avionics, audio, menu and career mode.

import { getAircraft, AIRCRAFT } from "./sim/aircraft.js";
import { FlightModel, AB_GATE } from "./sim/fdm.js";
import { FCS } from "./sim/fcs.js";
import { NavDB, FlightPlan, navSolution } from "./sim/navdb.js";
import { liveriesFor } from "./sim/specs.js";
import { atmosphere, casFromTas } from "./sim/atmosphere.js";
import { DEG, RAD, KT, FT, NM, G0, clamp, approach, qRot, gcDest, gcDistBrg, wrap360 } from "./sim/math.js";
import { World } from "./world/world.js";
import { Controls } from "./ui/controls.js";
import { Menu } from "./ui/menu.js";
import { APBar } from "./ui/apbar.js";
import { Cockpit3D } from "./ui/cockpit3d.js";
import { Hangar } from "./ui/preview.js";
import { Audio } from "./audio/audio.js";
import { Career } from "./career.js";
import { drawPFD } from "./ui/instruments/pfd.js";
import { drawND } from "./ui/instruments/nd.js";
import { drawEICAS, drawEIS } from "./ui/instruments/eicas.js";
import { drawSixPack, drawHeliPanel, drawGliderPanel } from "./ui/instruments/analog.js";
import { drawHUD, drawDataStrip } from "./ui/instruments/hud.js";
import { drawMCP, drawGarminAP } from "./ui/instruments/mcp.js";
import { txt } from "./ui/instruments/common.js";

const Cesium = window.Cesium;
const $ = (id) => document.getElementById(id);
const VIEWS = ["cockpit", "chase", "orbit", "tower", "flyby"];
const VIEW_NAME = { cockpit: "조종석", chase: "추적", orbit: "외부 궤도", tower: "관제탑", flyby: "플라이바이" };
const ND_RANGES = [5, 10, 20, 40, 80, 160, 320, 640];

const CHECKLISTS = {
  jet: [
    ["시동 전 (BEFORE START)", ["파킹 브레이크 — SET", "연료량 — 확인", "고도계 — QNH 설정 (B)", "MCP/FCU — SPD·HDG·ALT 설정", "비콘 라이트 — ON (L)"]],
    ["시동 (START)", ["엔진 시동 — Ctrl+E", "N1/EGT — 안정 확인", "플랩 — 이륙 위치 (F7)"]],
    ["이륙 전 (BEFORE T/O)", ["트림 — 이륙 설정", "스포일러 — ARM (Shift+/)", "착륙등/스트로브 — ON", "파킹 브레이크 — 해제 (Ctrl+.)"]],
    ["이륙 (TAKEOFF)", ["추력 — TOGA/FLEX (F4)", "VR — 회전 (15° 피치)", "양의 상승률 — 기어 업 (G)", "가속 고도 — 플랩 업", "AP — 연결 (Z)"]],
    ["접근 (APPROACH)", ["ILS 주파수 — 확인", "APPR — ARM (Shift+A)", "플랩 — 단계적 전개", "기어 — DOWN (2000 ft 이하)", "스포일러 — ARM"]],
    ["착륙 후 (AFTER LANDING)", ["역추력 — F2 유지", "브레이크 — . (유지)", "스포일러 — 수납", "플랩 — UP"]],
  ],
  ga: [
    ["시동 전", ["파킹 브레이크 — SET", "믹스처 — RICH (])", "연료 — 확인"]],
    ["시동", ["시동 — Ctrl+E", "오일 압력 — 그린"]],
    ["런업 · 이륙 전", ["조종면 — 자유 작동", "트림 — 이륙", "플랩 — 0–10°", "고도계 — QNH (B)"]],
    ["이륙", ["파킹 브레이크 해제 — Ctrl+.", "풀 스로틀 — F4", "러더로 중심선 유지 (Q/E)", "VR — 부드럽게 회전"]],
    ["순항", ["출력 — 65–75%", "믹스처 — 린 조정 ([)"]],
    ["착륙", ["플랩 — 전개", "접근 속도 — VREF", "플레어 — 강하율 감소", "터치다운 후 브레이크"]],
  ],
  heli: [
    ["시동", ["콜렉티브 — 하단 (F1)", "시동 — Ctrl+E", "NR — 100%"]],
    ["이륙", ["콜렉티브 서서히 상승 (F3)", "왼/오른 페달로 토크 상쇄 (Q/E)", "사이클릭으로 위치 유지", "ETL 통과 — 전진 가속"]],
    ["착륙", ["접근 속도 감소", "호버 — 콜렉티브 조절", "부드럽게 접지 — 콜렉티브 하단"]],
  ],
};

class App {
  constructor() {
    this.navdb = new NavDB();
    this.controls = new Controls();
    this.audio = new Audio();
    this.career = new Career();
    this.menu = new Menu(this);
    this.state = "menu";
    this.view = "cockpit";
    this.cockpitMode = "3d";
    this.panelVisible = true;
    this.paused = false;
    this.simRate = 1;
    this.ndRange = 40;
    this.minimums = 200;
    this.radios = { nav1: null, nav1Station: null, obs: 0, ilsCandidates: [] };
    this.baroStd = false;
    this.baroPa = 101325;
    this.lights = { nav: true, beacon: true, strobe: false, landing: false };
    this.head = { yaw: 0, pitch: -0.08 };
    this.zoom = 1;
    this.orbit = { yaw: Math.PI * 0.8, pitch: -0.25, dist: 60 };
    this.lastFrame = performance.now();
    this.fps = 60;
    this.panelTimer = 0;
    this.messagesShown = 0;
  }

  async init() {
    this.menu.init();
    this.bindControls();
    this.bindMouse();
    this.bindOverlays();
    window.addEventListener("resize", () => this.layout());
    document.addEventListener("pointerdown", () => this.audio.resume(), { once: true });
    $("dbStatus").textContent = "세계 공항 데이터 로딩 중… (OurAirports)";
    const dbPromise = this.navdb.load("./data/").then(() => {
      $("dbStatus").textContent = `공항 ${this.navdb.airports.length.toLocaleString()}개 · 항행시설 ${this.navdb.navaids.length.toLocaleString()}개 로드됨`;
      this.menu.refreshPlan();
      this.menu.renderCareer();
      if (this.world) this.world.showAirports(this.navdb, (a, p) => this.menu.globePick(a, p));
    });
    await this.createWorld();
    await dbPromise.catch((e) => ($("dbStatus").textContent = "항법 데이터 로드 실패: " + e.message));
    this.world.showAirports(this.navdb, (a, p) => this.menu.globePick(a, p));
    this.menu.refreshPlan();
    const dep = this.navdb.get(this.menu.cfg.dep);
    if (dep) this.world.flyHome(dep.lat * RAD, dep.lon * RAD);
    else this.world.flyHome();
    this.cockpit3d = new Cockpit3D($("cockpit3d"));
    this.apbar = new APBar($("apbar"), this);
    this.layout();
    requestAnimationFrame((t) => this.frame(t));
  }

  async createWorld() {
    const s = this.menu.cfg.settings;
    this.world = new World($("cesium"), { ...s, fov: 50 });
    this.world.onError = (m) => this.toast(m, "warn");
    this.world.setNavDB(this.navdb);
    await this.world.init();
    this.world.setMenuMode(true);
    this.world.setTime(new Date());
    this.worldDirty = false;
  }
  worldSettingsChanged() {
    this.worldDirty = true;
    this.toast("월드 설정은 다음 비행 시작 시 적용됩니다", "warn");
  }
  async rebuildWorld() {
    try { this.world.viewer.destroy(); } catch {}
    $("cesium").innerHTML = "";
    await this.createWorld();
    this.world.showAirports(this.navdb, (a, p) => this.menu.globePick(a, p));
  }

  careerActive() {
    return !!this.career.d.active;
  }

  showHangar(spec, cg, livery) {
    if (!this.hangar) this.hangar = new Hangar($("hangar"));
    this.hangar.show(spec, cg, livery).catch((e) => console.warn("hangar", e));
  }

  // ------------------------------------------------------------ flight plan
  buildPlan() {
    const c = this.menu.cfg;
    const plan = new FlightPlan();
    const dep = this.navdb.get(c.dep), arr = this.navdb.get(c.arr);
    if (dep) plan.dep = dep.runways.find((r) => r.ident === c.depRwy) || dep.runways[0];
    if (arr) plan.arr = arr.runways.find((r) => r.ident === c.arrRwy) || arr.runways[0];
    const ref = dep || arr;
    for (const id of (c.route || "").toUpperCase().split(/[\s,]+/).filter(Boolean)) {
      const nav = ref ? this.navdb.findNavaid(id, ref.lat, ref.lon) : null;
      const apt = this.navdb.get(id);
      const p = nav || apt;
      if (p) plan.waypoints.push({ ident: id, lat: p.lat, lon: p.lon, kind: nav ? "nav" : "apt" });
    }
    return plan;
  }

  // ------------------------------------------------------------ start / end flight
  async startFlight() {
    const cfg = this.menu.cfg;
    const spec = getAircraft(cfg.aircraftId);
    if (this.careerActive() && !this.career.canFly(spec)) {
      this.toast(`커리어 등급(${this.career.rank.name})으로는 ${spec.name}을(를) 조종할 수 없습니다`, "bad");
      return;
    }
    const plan = this.buildPlan();
    if (!plan.dep) {
      this.toast("출발 공항을 선택하세요", "bad");
      return;
    }
    this.audio.resume();
    $("menu").classList.add("hidden");
    $("globePop").classList.add("hidden");
    $("crash").classList.add("hidden");
    $("pauseMenu").classList.add("hidden");
    this.hangar?.stop();
    this.hangar && (this.hangar.running = false);
    this.loading(true, "월드 준비 중…", 0.05);
    this.state = "loading";
    if (this.worldDirty) await this.rebuildWorld();
    const W = this.world;
    W.setMenuMode(false);

    const fm = new FlightModel(spec, { fuelFrac: cfg.fuel / 100, payloadFrac: cfg.payload / 100 });
    const fcs = new FCS(fm);
    this.fm = fm;
    this.fcs = fcs;
    this.plan = plan;
    this.minimums = cfg.minimums;
    const livery = liveriesFor(spec).find((l) => l.id === cfg.liveryId) || liveriesFor(spec)[0];
    this.livery = livery;
    this.loading(true, `${spec.name} (${livery.name}) 기체 생성 중…`, 0.15);
    await W.loadAircraft(spec, fm.cgHeight, livery);

    // time & weather
    W.setTime(cfg.realTime || !cfg.utc ? new Date() : new Date(cfg.utc));
    this.wx = this.parseWeather(cfg.wx);
    W.applyWeather(this.wx);
    this.baroPa = this.wx.qnh;
    this.baroStd = false;

    // start position
    const mode = spec.airStart && cfg.startMode !== "approach" ? "glider" : cfg.startMode;
    const rw = plan.dep;
    let lat, lon, hdg, ground;
    let air = null;
    if (mode === "approach" && plan.arr) {
      const ar = plan.arr;
      const dist = (spec.cat === "ga" || spec.cat === "heli" || spec.cat === "glider" ? 5 : 10) * NM;
      [lat, lon] = gcDest(ar.lat, ar.lon, ar.course + Math.PI, dist);
      hdg = ar.course;
      const altAgl = Math.tan(3 * DEG) * dist;
      air = { alt: ar.elevM + altAgl, kias: spec.cat === "heli" ? 70 : Math.max(spec.vref + 15, spec.vs0 * 1.4), flap: Math.max(0, spec.flaps.length - (spec.flaps.length > 3 ? 2 : 1)), gear: true };
      ground = ar.elevM;
    } else if (mode === "cruise" || mode === "glider") {
      lat = rw.lat;
      lon = rw.lon;
      hdg = rw.course;
      const next = plan.points[1];
      if (next) hdg = gcDistBrg(lat, lon, next.lat, next.lon)[1];
      if (mode === "glider") {
        [lat, lon] = rw.alongRad(rw.lengthM * 0.5);
        air = { alt: rw.elevM + 900, kias: spec.vs1 * 1.35, flap: 0, gear: false };
      } else {
        const altFt = Math.min(cfg.cruiseAlt, spec.ceil - 2000);
        const altM = Math.max(altFt * FT, rw.elevM + 2000 * FT);
        const atm = atmosphere(altM);
        const cruiseTas = spec.cr ? spec.cr[0] * KT : (spec.vno || 100) * KT;
        const kias = Math.min(casFromTas(cruiseTas, atm) / KT, (spec.vne || 300) * 0.9);
        air = { alt: altM, kias: spec.cat === "heli" ? 100 : kias, flap: 0, gear: false };
      }
      ground = rw.elevM;
    } else {
      // on the runway threshold, lined up
      const back = rw.displacedM + Math.max(25, spec.L * 0.6);
      [lat, lon] = rw.alongRad(Math.min(back, rw.lengthM * 0.3));
      hdg = rw.course;
      ground = rw.elevM;
    }
    this.loading(true, "지형·위성영상 스트리밍 중…", 0.3);
    W.scene.camera.setView({ destination: Cesium.Cartesian3.fromRadians(lon, lat, (air ? air.alt : ground) + 60), orientation: { heading: hdg, pitch: -0.1, roll: 0 } });
    let gh = await W.waitForGround(lat, lon, ground, (p) => this.loading(true, "지형·위성영상 스트리밍 중…", 0.3 + p * 0.65));
    // the airport database elevation is authoritative if streamed terrain is missing or implausible
    if (gh == null || !Number.isFinite(gh) || Math.abs(gh - ground) > 120) gh = ground;
    this.groundAlt = gh;
    W.lastGround = gh;

    if (air) {
      fm.placeInAir(lat, lon, Math.max(air.alt, gh + 300), hdg, air.kias, air.flap, air.gear);
      fcs.ap.hdg = hdg;
      fcs.ap.alt = Math.round(air.alt / FT / 100) * 100 * FT;
      fcs.ap.spd = Math.round(air.kias);
      if (mode === "cruise" && fcs.hasAP) {
        fcs.update(1 / 120, { pitch: 0, roll: 0, yaw: 0, thr: fm.ctl.thr[0] });
        fcs.engageAP();
        fcs.ap.vert = "ALT";
        fcs.ap.lat = plan.points.length > 1 ? "NAV" : "HDG";
        if (fcs.hasAT) fcs.ap.at = true;
      }
      if (mode === "approach") {
        fcs.ap.alt = (plan.arr.elevM / FT + 3000) * FT;
        fcs.ap.spd = Math.round(spec.vref + 5);
      }
      this.controls.throttle = fm.ctl.thr[0] ?? 0;
    } else {
      fm.placeOnGround(lat, lon, gh, hdg);
      fm.ctl.park = true;
      if (mode !== "cold") for (const e of fm.engines) e.setRunning();
      this.controls.throttle = 0;
      fcs.ap.hdg = hdg;
      fcs.ap.alt = Math.round((gh / FT + 5000) / 100) * 100 * FT;
      fcs.ap.spd = spec.vr ? spec.vr + 20 : 100;
      // takeoff flaps
      if (spec.flaps.length > 1 && spec.cat !== "fighter") {
        fm.ctl.flap = spec.flaps.length > 4 ? 2 : 1;
        fm.ctl.flapPos = spec.flaps[fm.ctl.flap][1];
      }
    }
    this.controls.mixture = 1;
    // radios: ILS of the arrival runway auto-tuned
    this.radios = { nav1: plan.arr?.hasIls ? plan.arr.ilsFreq : null, nav1Station: null, obs: plan.arr ? plan.arr.course : 0, ilsCandidates: [plan.arr, plan.dep].filter(Boolean) };
    this.nav = null;
    const nearDep = this.navdb.nearestAirports(rw.lat, rw.lon, 30000, 4);
    W.buildAirportLights([rw.apt, plan.arr?.apt, ...nearDep].filter((a, i, arr) => a && arr.indexOf(a) === i).map((a) => ({ ...a, type: a.type, runways: a.physicalRunways })));
    this.towerPos = { lat: rw.apt.lat, lon: rw.apt.lon, alt: rw.apt.elevM + 35 };

    // flight bookkeeping
    this.flight = { t0: performance.now(), airborneTime: 0, wasAirborne: !!air, maxG: 1, overspeed: false, stallTime: 0, touchdownFpm: null, dep: rw.apt.ident, ended: false, lastTouch: 0 };
    fm.onTouchdown = (vs) => this.onTouchdown(vs);
    fm.onCrash = (r) => this.onCrash(r);
    fcs.onDisconnect = () => { this.audio.chime("apdisc"); this.alertMsg("AP OFF", 2, 5); };

    // cockpit
    this.view = "cockpit";
    this.head = { yaw: 0, pitch: spec.cockpit === "airliner" ? -0.22 : spec.cockpit === "fighter" ? -0.05 : spec.cockpit === "heli" ? -0.28 : -0.16 };
    this.zoom = 1;
    this.orbit.dist = Math.max(spec.L, spec.b) * 1.8;
    this.cockpit3d.build(spec);
    this.cockpit3d.enabled = this.cockpitMode === "3d";
    this.apbar.build(spec, fcs);
    this.gpwsState = {};
    this.alerts = [];
    this.speedHist = [];
    this.paused = false;
    this.simRate = 1;
    this.state = "flying";
    this.loading(false);
    $("panel").classList.remove("hidden");
    $("topbar").classList.remove("hidden");
    this.layout();
    const startMsg = { runway: "활주로 정렬 완료 — 파킹 브레이크 해제: Ctrl+.  ·  이륙 추력: F4", cold: "콜드 & 다크 — Ctrl+E 로 엔진 시동", approach: `최종 접근 중 — ${plan.arr?.name} · ILS ${this.radios.nav1?.toFixed(2) || "없음"} · APPR: Shift+A`, cruise: "순항 중 — AP 연결됨", glider: "활공 시작 — 상승기류를 찾아보세요" }[mode];
    this.toast(startMsg);
    if (this.careerActive()) this.toast(`임무: ${this.career.d.active.title} → ${this.career.d.active.arr}`);
  }

  parseWeather(w) {
    const clouds = (w.clouds || "").trim().split(/\s+/).filter(Boolean).map((s) => {
      const m = /^(FEW|SCT|BKN|OVC)(\d{3})/.exec(s);
      return m ? { cover: m[1], base: Number(m[2]) * 100 } : null;
    }).filter(Boolean);
    return { ...w, visibility: w.vis, clouds, qnh: (w.qnh || 1013.25) * 100 };
  }

  backToMenu() {
    this.state = "menu";
    this.paused = false;
    $("panel").classList.add("hidden");
    $("topbar").classList.add("hidden");
    $("pauseMenu").classList.add("hidden");
    $("crash").classList.add("hidden");
    $("checklist").classList.add("hidden");
    $("menu").classList.remove("hidden");
    this.cockpit3d.enabled = false;
    const ctx = $("hud").getContext("2d");
    ctx.clearRect(0, 0, $("hud").width, $("hud").height);
    this.cockpit3d.renderer.clear();
    this.world.setMenuMode(true);
    if (this.world.aircraftModel) this.world.aircraftModel.show = false;
    this.world.acLights.removeAll();
    this.world.lights.removeAll();
    const dep = this.navdb.get(this.menu.cfg.dep);
    if (dep) this.world.flyToAirport(dep, 400000);
    this.audio.update(this.fm, this.cockpitState(), "orbit", true);
    this.menu.renderCareer();
    this.menu.refreshPlan();
  }

  onTouchdown(vs) {
    const f = this.flight;
    if (!f || f.ended) return;
    const fpm = vs * 196.85;
    f.touchdownFpm = fpm;
    f.lastTouch = performance.now();
    const g = Math.max(this.fm.nz, 1);
    const verdict = fpm < 60 ? "버터 랜딩" : fpm < 200 ? "부드러운 착륙" : fpm < 400 ? "정상 착륙" : fpm < 600 ? "단단한 착륙" : "하드 랜딩";
    this.toast(`접지: ${Math.round(fpm)} fpm · ${g.toFixed(2)} G · ${verdict}`, fpm > 600 ? "bad" : fpm > 400 ? "warn" : "");
  }

  onCrash(reason) {
    $("crashReason").textContent = reason;
    $("crash").classList.remove("hidden");
    this.audio.chime("warning");
    this.endFlight({ crashed: true, crashReason: reason });
  }

  endFlight(extra) {
    const f = this.flight;
    if (!f || f.ended) return null;
    f.ended = true;
    const fm = this.fm;
    const near = this.navdb.nearestAirports(fm.lat, fm.lon, 5000, 1)[0];
    const stats = {
      landed: !extra.crashed && f.wasAirborne && fm.onGround,
      crashed: !!extra.crashed, crashReason: extra.crashReason, airport: near?.ident,
      touchdownFpm: f.touchdownFpm, maxG: f.maxG, overspeed: f.overspeed, stallTime: f.stallTime,
      flightTimeH: f.airborneTime / 3600, aircraftName: fm.spec.name, dep: f.dep, massKg: fm.mass,
    };
    if (!this.career.d.started) return null;
    const entry = this.career.complete(stats);
    this.toast(`로그북 기록: ${entry.result}${entry.pay ? ` · $${entry.pay.toLocaleString()}` : ""}${entry.xp ? ` · +${entry.xp} XP` : ""}`, entry.pay < 0 ? "bad" : "");
    return entry;
  }

  // ------------------------------------------------------------ inputs
  bindControls() {
    const C = this.controls;
    const on = (a, f) => C.on(a, (...x) => { if (this.state === "flying") f(...x); });
    on("flaps", (k) => {
      const c = this.fm.ctl, n = this.fm.spec.flaps.length - 1;
      c.flap = k === "up" ? 0 : k === "full" ? n : k === "inc" ? Math.min(n, c.flap + 1) : Math.max(0, c.flap - 1);
      this.toast(`플랩 ${this.fm.spec.flaps[c.flap][0]}`);
    });
    on("gear", () => {
      const fm = this.fm;
      if (!fm.spec.gear.retract) return this.toast("고정식 착륙장치");
      if (fm.wow && fm.ctl.gear) return this.toast("지상에서는 기어를 올릴 수 없습니다 (WOW)", "warn");
      fm.ctl.gear = fm.ctl.gear ? 0 : 1;
      this.toast(fm.ctl.gear ? "기어 DOWN" : "기어 UP");
    });
    on("spoiler", () => {
      const c = this.fm.ctl;
      c.spoiler = c.spoiler > 0.1 ? 0 : this.fm.spec.cat === "glider" ? 1 : 0.6;
      c.spoilerArmed = false;
    });
    on("spoilerArm", () => {
      const c = this.fm.ctl;
      c.spoilerArmed = !c.spoilerArmed;
      this.toast(c.spoilerArmed ? "스포일러 ARM" : "스포일러 DISARM");
    });
    on("parkingBrake", () => {
      const c = this.fm.ctl;
      c.park = !c.park;
      this.toast(c.park ? "파킹 브레이크 SET" : "파킹 브레이크 해제");
    });
    on("brakeHold", () => {});
    on("lights", () => {
      const l = this.lights;
      const all = !(l.landing && l.strobe);
      Object.assign(l, { nav: true, beacon: true, strobe: all, landing: all });
      this.toast(all ? "외부 조명 ON (LDG/STROBE)" : "착륙등·스트로브 OFF");
    });
    on("baro", (std) => (std ? this.setStd() : this.setQnh()));
    on("ap", () => this.toggleAP());
    on("at", () => this.toggleAT());
    on("apMode", (m) => this.apMode(m));
    on("bug", (k, d) => {
      const ap = this.fcs.ap;
      if (k === "hdg") ap.hdg = (wrap360(ap.hdg * RAD + d)) * DEG;
      if (k === "alt") ap.alt = Math.max(0, ap.alt + d * FT);
      if (k === "spd") ap.useMach ? (ap.mach = clamp(ap.mach + d / 100, 0.3, 2.2)) : (ap.spd = clamp(ap.spd + d, 40, 600));
      if (k === "vs") ap.vs += (d * FT) / 60;
    });
    on("autostart", () => this.autostart());
    on("reverse", (r) => { if (!r) this.reverseThr = 0; });
    on("mixture", (m) => { this.fm.ctl.autoMix = false; this.fm.ctl.mixture = m; });
    on("rudTrim", (d) => (this.fm.ctl.rudTrim = clamp(this.fm.ctl.rudTrim + d * 0.02, -0.5, 0.5)));
    on("view", (v) => (v ? this.setView(v) : this.cycleView()));
    on("panel", () => { this.panelVisible = !this.panelVisible; this.layout(); });
    on("pause", () => { this.paused = !this.paused; this.toast(this.paused ? "일시정지 (P)" : "재개"); });
    on("simrate", (d) => {
      const r = [1, 2, 4, 8, 16];
      this.simRate = r[clamp(r.indexOf(this.simRate) + d, 0, r.length - 1)];
      this.toast(`시뮬레이션 배속 ${this.simRate}×`);
    });
    on("checklist", () => this.toggleChecklist());
    C.on("menu", () => {
      if (this.state === "flying") {
        this.paused = true;
        $("pauseMenu").classList.toggle("hidden");
        if ($("pauseMenu").classList.contains("hidden")) this.paused = false;
      }
    });
    C.on("help", () => $("help").classList.toggle("hidden"));
    C.on("message", (m) => this.toast(m));
  }

  bindOverlays() {
    $("pauseMenu").addEventListener("click", (e) => {
      const a = e.target.dataset.act;
      if (a === "resume") { $("pauseMenu").classList.add("hidden"); this.paused = false; }
      if (a === "restart") this.startFlight();
      if (a === "menu") { if (this.flight?.wasAirborne && !this.flight.ended) this.endFlight({}); this.backToMenu(); }
    });
    $("crash").addEventListener("click", (e) => {
      const a = e.target.dataset.act;
      if (a === "restart") this.startFlight();
      if (a === "menu") this.backToMenu();
    });
    $("help").addEventListener("click", (e) => { if (e.target.dataset.act === "close" || e.target.id === "help") $("help").classList.add("hidden"); });
  }

  bindMouse() {
    let drag = null;
    const el = $("cesium");
    el.addEventListener("contextmenu", (e) => this.state === "flying" && e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (this.state !== "flying") return;
      if (e.button === 2 || (e.button === 0 && this.view === "orbit")) drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => (drag = null));
    window.addEventListener("pointermove", (e) => {
      if (!drag || this.state !== "flying") return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      if (this.view === "cockpit") {
        this.head.yaw = clamp(this.head.yaw + dx * 0.004, -2.6, 2.6);
        this.head.pitch = clamp(this.head.pitch - dy * 0.004, -1.2, 1.3);
      } else {
        this.orbit.yaw += dx * 0.006;
        this.orbit.pitch = clamp(this.orbit.pitch - dy * 0.004, -1.4, 0.6);
      }
    });
    el.addEventListener("wheel", (e) => {
      if (this.state !== "flying") return;
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.1 : 0.9;
      if (this.view === "cockpit") this.zoom = clamp(this.zoom * k, 0.4, 1.6);
      else this.orbit.dist = clamp(this.orbit.dist * k, 5, 5000);
    }, { passive: false });
    el.addEventListener("dblclick", () => { if (this.view === "cockpit") this.head = { yaw: 0, pitch: -0.1 }; });
  }

  toggleAP() {
    const f = this.fcs;
    if (f.ap.master) f.disconnectAP("AP 해제");
    else { f.engageAP(); if (f.ap.master) this.toast("AP 연결"); }
  }
  toggleAT() {
    const f = this.fcs;
    if (!f.hasAT) return this.toast("오토스로틀이 없는 기체입니다");
    f.ap.at = !f.ap.at;
    if (!f.ap.at) { this.audio.chime("caution"); this.controls.throttle = this.fm.ctl.thr[0]; }
    this.toast(f.ap.at ? "A/THR ON" : "A/THR OFF");
  }
  apMode(m) {
    const f = this.fcs, ap = f.ap, t = this.fm.telemetry;
    if (!f.hasAP) return this.toast("오토파일럿이 없는 기체입니다");
    if (m === "HDG") { ap.lat = "HDG"; ap.armLoc = false; }
    if (m === "NAV") { if (this.plan.points.length > 1) { ap.lat = "NAV"; } else this.toast("비행 계획이 없습니다", "warn"); }
    if (m === "LOC") ap.armLoc = !ap.armLoc;
    if (m === "APPR") { const on = !(ap.armGs || ap.vert === "GS"); ap.armLoc = on && ap.lat !== "LOC"; ap.armGs = on; if (!on && ap.vert === "GS") ap.vert = "VS"; }
    if (m === "ALT") { ap.vert = "ALT"; ap.alt = Math.round(t.alt / FT / 100) * 100 * FT; }
    if (m === "VS") { ap.vert = "VS"; ap.vs = Math.round((t.vs / FT) * 60 / 100) * 100 * FT / 60; ap.altArm = true; }
    if (m === "FLC") { ap.vert = "FLC"; ap.spd = Math.round(t.cas / KT); ap.altArm = true; if (f.hasAT) ap.at = true; }
  }
  autostart() {
    const fm = this.fm;
    const running = fm.engines.some((e) => e.running || e.starting);
    if (running) {
      fm.engines.forEach((e) => e.shutdown());
      this.toast("엔진 정지");
    } else {
      fm.engines.forEach((e, i) => setTimeout(() => e.startSeq(), i * 3500));
      this.controls.throttle = 0;
      this.toast("엔진 시동 시퀀스 시작");
    }
  }
  setQnh() {
    this.baroStd = false;
    this.baroPa = this.wx.qnh;
    this.toast(`QNH ${this.baroText()}`);
  }
  setStd() {
    this.baroStd = !this.baroStd;
    this.toast(this.baroStd ? "STD 1013" : `QNH ${this.baroText()}`);
  }
  adjustBaro(d) {
    this.baroStd = false;
    this.baroPa += this.menu.cfg.settings.baro === "inhg" ? d * 33.8639 : d * 100;
  }
  baroText() {
    if (this.baroStd) return "STD";
    return this.menu.cfg.settings.baro === "inhg" ? (this.baroPa / 3386.39).toFixed(2) : String(Math.round(this.baroPa / 100));
  }
  tuneNav(d) {
    let f = this.radios.nav1 ?? 108.0;
    f = Math.round((f + d) * 100) / 100;
    if (f > 117.95) f = 108.0;
    if (f < 108.0) f = 117.95;
    this.radios.nav1 = f;
    const ils = this.radios.ilsCandidates.find((r) => r.hasIls && Math.abs(r.ilsFreq - f) < 0.001);
    this.radios.nav1Station = ils ? null : this.navdb.tuneFreq(f, this.fm.lat, this.fm.lon);
  }
  ndZoom(d) {
    this.ndRange = ND_RANGES[clamp(ND_RANGES.indexOf(this.ndRange) + d, 0, ND_RANGES.length - 1)];
  }
  thrPct() {
    return ((this.fm.ctl.thr[0] ?? 0) / (this.fm.spec.eng.ab ? AB_GATE : 1)) * 100;
  }
  cycleView() {
    this.setView(VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]);
  }
  setView(v) {
    this.view = v;
    if (v === "flyby") this.flyby = null;
    this.layout();
    this.toast(`시점: ${VIEW_NAME[v]}`);
  }
  toggleCockpitMode() {
    this.cockpitMode = this.cockpitMode === "3d" ? "2d" : "3d";
    this.cockpit3d.enabled = this.cockpitMode === "3d";
    this.layout();
    this.toast(this.cockpitMode === "3d" ? "3D 가상 조종석" : "2D 계기판");
  }
  toggleChecklist() {
    const el = $("checklist");
    if (!el.classList.contains("hidden")) return el.classList.add("hidden");
    const cat = this.fm.spec.cat;
    const lists = cat === "heli" ? CHECKLISTS.heli : ["ga", "aero", "glider", "warbird", "prop-twin"].includes(cat) ? CHECKLISTS.ga : CHECKLISTS.jet;
    el.innerHTML = `<h3>체크리스트 — ${this.fm.spec.name}</h3>` + lists.map(([h, items]) => `<div><b style="font-size:12px;color:#cfe3ff">${h}</b>${items.map((it) => { const [a, b] = it.split(" — "); return `<div class="ck"><span>${a}</span><span>${b || ""}</span></div>`; }).join("")}</div>`).join("");
    el.onclick = (e) => e.target.closest(".ck")?.classList.toggle("done");
    el.classList.remove("hidden");
  }

  // ------------------------------------------------------------ layout
  layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hud = $("hud");
    hud.width = w * dpr;
    hud.height = h * dpr;
    this.hudDpr = dpr;
    this.cockpit3d?.resize(w, h);
    const panel = $("panel");
    const pc = $("panelCanvas");
    const flying = this.state === "flying";
    const show2d = flying && this.view === "cockpit" && this.cockpitMode === "2d" && this.panelVisible;
    panel.classList.toggle("hidden", !flying || !this.panelVisible);
    pc.style.display = show2d ? "block" : "none";
    const ph = Math.round(Math.max(240, Math.min(h * 0.36, 420)));
    pc.style.height = ph + "px";
    pc.width = w * dpr;
    pc.height = ph * dpr;
    this.panelH = show2d ? ph : 0;
  }

  loading(on, text, p) {
    $("loading").classList.toggle("hidden", !on);
    if (text) $("loadText").textContent = text;
    if (p != null) $("loadBar").style.width = `${Math.round(p * 100)}%`;
  }

  toast(text, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = text;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while ($("toasts").children.length > 5) $("toasts").firstChild.remove();
  }

  alertMsg(text, lvl, secs) {
    this.timedAlerts ||= [];
    this.timedAlerts.push({ text, lvl, until: performance.now() + secs * 1000 });
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.controls.update(dt);
    if (this.state === "menu") {
      this.menu.updateAxisMeters();
      this.world.render();
      return;
    }
    if (this.state !== "flying") {
      this.world.render();
      return;
    }
    try {
      this.simulate(dt);
      this.renderFlight(dt);
    } catch (e) {
      console.error(e);
    }
  }

  simulate(dt) {
    const fm = this.fm, fcs = this.fcs, C = this.controls, c = fm.ctl, W = this.world;
    if (this.paused || fm.crashed) return;
    const simDt = dt * this.simRate;
    // ground under the aircraft
    const gh = W.groundHeight(fm.lat, fm.lon);
    if (gh != null && Number.isFinite(gh)) {
      // rate-limit terrain height changes (tiles refining, missing data) to plausible slopes
      const maxRate = 40 + (fm.telemetry.gs || 0) * 0.7;
      this.groundAlt = approach(this.groundAlt, gh, maxRate, dt * this.simRate);
    }
    W.lastGround = this.groundAlt;
    // pilot inputs
    c.trim = clamp(c.trim + (C.trimDir || 0) * 0.25 * dt, -1, 1);
    c.brakeL = c.brakeR = C.brake;
    if (!c.autoMix) c.mixture = C.mixture;
    let thr = C.throttle;
    if (C.reverseHeld && fm.wow && fm.spec.eng.type !== "piston" && fm.spec.eng.type !== "none") {
      this.reverseThr = approach(this.reverseThr || 0, 1, 0.5, dt);
      c.reverse = true;
      thr = this.reverseThr;
    } else if (c.reverse && !C.reverseHeld) {
      c.reverse = false;
      this.reverseThr = 0;
    }
    if (fm.spec.eng.ab && !fcs.ap.at) thr = thr; // full travel incl. afterburner detent
    // auto ground spoilers
    if (c.spoilerArmed && fm.wow && this.flight.wasAirborne && (c.thr[0] ?? 0) < 0.1) c.spoiler = 1;
    const pilot = { pitch: C.pitch, roll: C.roll, yaw: C.yaw, thr, collective: C.throttle };
    // environment
    const env = this.environment();
    const n = Math.max(1, Math.ceil(simDt / (1 / 120)));
    const h = simDt / n;
    for (let i = 0; i < n; i++) {
      fcs.update(h, pilot, this.nav);
      fm.step(h, env);
      if (fm.crashed) break;
    }
    if (!fcs.ap.at || !fcs.hasAT) { /* throttle follows pilot */ } else C.throttle = c.thr[0];
    this.nav = navSolution(this.plan, fm, this.radios, this.navdb);
    W.advanceTime(simDt);
    // flight bookkeeping
    const f = this.flight;
    if (!fm.wow) {
      f.airborneTime += simDt;
      if (f.airborneTime > 5) f.wasAirborne = true;
      f.maxG = Math.max(f.maxG, fm.nz);
      if (fm.telemetry.stallWarn) f.stallTime += simDt;
      if (fm.telemetry.cas > (fm.spec.vne || 999) * KT * 1.02) f.overspeed = true;
    }
    // arrival detection: stopped on an airport after a flight
    if (f.wasAirborne && !f.ended && fm.onGround && fm.telemetry.gs < 1.5 && (c.park || fm.engines.every((e) => !e.running))) {
      const near = this.navdb.nearestAirports(fm.lat, fm.lon, 5000, 1)[0];
      const entry = this.endFlight({});
      this.toast(`비행 완료 — ${near ? near.ident + " " + near.name : "비공항 지점"} · 비행시간 ${(f.airborneTime / 60).toFixed(0)}분`);
      if (entry) this.menu.renderCareer();
    }
  }

  environment() {
    const fm = this.fm;
    const wx = this.wx;
    const agl = Math.max(fm.alt - this.groundAlt, 0);
    const k = clamp(agl / 3000, 0, 1);
    const dir = (wx.dir + ((((wx.dirUp - wx.dir + 540) % 360) - 180) * k)) * DEG;
    let spd = (wx.spd + (wx.spdUp - wx.spd) * k) * KT;
    if (agl < 30) spd *= 0.6 + 0.4 * (agl / 30);
    const t = fm.time;
    if (wx.gust) spd += Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1)) * wx.gust * KT;
    // wind FROM dir -> air moving toward dir+180
    const wind = [-Math.cos(dir) * spd, -Math.sin(dir) * spd, 0];
    const elev = this.plan.dep?.elevM ?? 0;
    const dT = wx.temp - (15 - 0.0065 * elev);
    return {
      groundAlt: this.groundAlt, wind, dT, qnh: wx.qnh, turb: wx.turb * clamp(1 - agl / 6000, 0.2, 1),
      altSetting: this.baroStd ? 101325 : this.baroPa, surface: "hard",
    };
  }

  // ------------------------------------------------------------ cockpit state for avionics
  cockpitState() {
    const fm = this.fm, fcs = this.fcs, t = fm.telemetry, s = fm.spec, c = fm.ctl, atm = fm.atm || atmosphere(fm.alt);
    const kias = (t.cas || 0) / KT;
    this.speedHist.push([fm.time, kias]);
    while (this.speedHist.length > 2 && this.speedHist[0][0] < fm.time - 1) this.speedHist.shift();
    const sh = this.speedHist;
    const trend = sh.length > 1 ? ((sh[sh.length - 1][1] - sh[0][1]) / Math.max(sh[sh.length - 1][0] - sh[0][0], 0.1)) * 10 : 0;
    const d = fm.d || {};
    const flapFrac = c.flapPos;
    const clmax = d.CLmax ? d.CLmax + flapFrac * (d.CLmaxLand - d.CLmax) : 1.5;
    const vStall = s.S ? Math.sqrt((2 * fm.mass * G0) / (1.225 * s.S * clmax)) / KT : 0;
    let vmo = s.vne || 300;
    if (s.mmo && s.mmo < 2.5) vmo = Math.min(vmo, casFromTas(s.mmo * atm.a, atm) / KT);
    const vfe = flapFrac > 0.01 ? (s.vne || 200) * (0.68 - 0.18 * flapFrac) : null;
    const agl = (t.agl ?? 0) / FT;
    const vsFpm = (t.vs / FT) * 60;
    const ap = fcs.ap;
    const airbus = s.fbw === "airbus";
    const thrNames = airbus ? { SPEED: "SPEED", CLB: "THR CLB", IDLE: "THR IDLE", RETARD: "RETARD" } : { SPEED: "SPD", CLB: "THR REF", IDLE: "IDLE", RETARD: "RETARD" };
    const vertNames = { PIT: "PIT", ALT: "ALT", VS: "V/S", FLC: airbus ? "OP CLB" : "FLCH SPD", GS: "G/S", FLARE: "FLARE", ROLLOUT: "ROLLOUT" };
    const latNames = { ROL: "ROL", HDG: "HDG", NAV: airbus ? "NAV" : "LNAV", LOC: "LOC", ROLLOUT: "ROLLOUT" };
    const fdOn = ap.master || ap.fd;
    const fma = {
      thr: fcs.alphaFloor ? "A.FLOOR" : ap.at ? thrNames[ap.thrMode] || "SPEED" : "",
      vert: fdOn ? (ap.vert === "FLC" && ap.alt < fm.alt ? (airbus ? "OP DES" : "FLCH SPD") : vertNames[ap.vert]) : "",
      lat: fdOn ? latNames[ap.lat] : "",
      latArm: ap.armLoc ? "LOC" : "",
      vertArm: ap.armGs ? "G/S" : ap.altArm && ap.vert !== "ALT" && fdOn ? "ALT" : "",
      cat: ap.vert === "GS" || ap.armGs ? (ap.at && ap.master ? "CAT 3 DUAL" : "CAT 1") : "",
    };
    // GPWS
    let gpws = null;
    const transport = ["narrow", "wide", "bizjet", "regional-tp", "supersonic"].includes(s.cat);
    if (!t.onGround && agl < 2450 && this.flight.airborneTime > 10) {
      if (vsFpm < -Math.max(2500, agl * 2.2)) gpws = "PULL UP";
      else if (vsFpm < -Math.max(1500, agl * 1.3)) gpws = "SINK RATE";
      else if (s.gear.retract && c.gear === 0 && agl < 500 && vsFpm < -200 && kias < (s.vref || 100) + 40) gpws = "TOO LOW GEAR";
      else if (transport && Math.abs(t.phi) > 40 * DEG) gpws = "BANK ANGLE";
    }
    // alerts
    const alerts = [];
    const thrNow = c.thr[0] ?? 0;
    if (fm.wow && thrNow > 0.75 && (c.park || (transport && c.flap === 0) || c.spoiler > 0.1)) alerts.push({ lvl: 3, text: c.park ? "CONFIG PARK BRK" : c.flap === 0 ? "CONFIG FLAPS" : "CONFIG SPD BRK" });
    if (s.gear.retract && !t.onGround && c.gear === 0 && agl < 750 && flapFrac > 0.6) alerts.push({ lvl: 3, text: "GEAR NOT DOWN" });
    if (t.stallWarn) alerts.push({ lvl: 3, text: "STALL" });
    if (kias > vmo + 2 && !t.onGround) alerts.push({ lvl: 3, text: "OVERSPEED" });
    fm.engines.forEach((e, i) => { if (!e.running && !e.starting && !t.onGround && s.eng.type !== "none") alerts.push({ lvl: 2, text: `ENG ${i + 1} SHUTDOWN` }); });
    if (fm.fuel < fm.fuelCap * 0.08 && s.eng.type !== "none") alerts.push({ lvl: 2, text: "FUEL LO LEVEL" });
    if (c.park && !t.onGround) alerts.push({ lvl: 2, text: "PARK BRK ON" });
    if (fm.damage) alerts.push({ lvl: 2, text: fm.damage });
    if (c.spoilerArmed) alerts.push({ lvl: 1, text: "GND SPLRS ARMED" });
    if (c.spoiler > 0.05 && !t.onGround) alerts.push({ lvl: 1, text: "SPEED BRK" });
    if (this.lights.landing) alerts.push({ lvl: 1, text: "LDG LT" });
    const nowMs = performance.now();
    this.timedAlerts = (this.timedAlerts || []).filter((a) => a.until > nowMs);
    alerts.push(...this.timedAlerts);
    const tasKt = t.tas / KT;
    return {
      spec: s, fm, t, ap, cmd: fcs.cmd, hasAP: fcs.hasAP, kias, mach: t.mach || 0, tasKt, gsKt: (t.gs || 0) / KT,
      altFt: (t.baroAlt || t.alt) / FT, vsFpm, hdgDeg: wrap360((t.psi || 0) * RAD), trkDeg: wrap360((t.gs > 2 ? t.trk : t.psi) * RAD),
      windDir: wrap360((t.windDir || 0) * RAD), windKt: (t.windSpd || 0) / KT,
      radioAltFt: Math.max(0, agl), baroStr: this.baroStd ? "STD" : (this.menu.cfg.settings.baro === "inhg" ? `${(this.baroPa / 3386.39).toFixed(2)} IN` : `QNH ${Math.round(this.baroPa / 100)}`),
      baroStd: this.baroStd, baroInHg: (this.baroStd ? 101325 : this.baroPa) / 3386.39, minimums: this.minimums,
      arrElevFt: this.plan.arr ? this.plan.arr.elevM / FT : null, groundAltFt: this.groundAlt / FT + (t.baroAlt - t.alt) / FT,
      vStallKt: vStall, vmoKt: vmo, vfeKt: vfe, machBugKt: ap.useMach ? casFromTas(ap.mach * atm.a, atm) / KT : ap.spd, speedTrend: trend,
      v1: s.vr ? s.vr - 5 : null, vr: s.vr, v2: s.vr ? s.vr + 10 : null,
      stallWarn: t.stallWarn, overspeed: kias > vmo + 2 && !t.onGround, gpws, fma, nav: this.nav, plan: this.plan, radios: this.radios,
      ndRange: this.ndRange, nearAirports: this.nearAirports || [], nearNavaids: this.nearNavaids || [],
      engines: fm.engines.map((e) => ({ n1: e.n1, n2: e.n2, egt: e.egt, ff: e.ff, running: e.running, starting: e.starting > 0, torque: e.torque, rpm: e.rpm, ab: e.ab, oilP: e.oilP, power: e.power, reverse: c.reverse })),
      engType: s.eng.type, idleN1: fm.engines.map((e) => e.idle), thrCmd: c.thr, enginePowerKw: s.eng.kw || 100,
      fuelKg: fm.fuel, fuelCap: fm.fuelCap, grossKg: fm.mass, flapLabel: s.flaps[c.flap][0], flapPos: flapFrac, flapMoving: Math.abs(flapFrac - s.flaps[c.flap][1]) > 0.01,
      gearRetract: s.gear.retract, gearPos: c.gearPos, spoiler: c.spoilerPos, spoilerArmed: c.spoilerArmed, park: c.park,
      trimPct: (c.trim || 0) * 100, alerts, thrPct: this.thrPct(), showFPV: s.cockpit !== "g1000",
      teVario: this.te || 0, glideRatio: t.vs < -0.1 ? t.gs / -t.vs : null,
      cdiSource: this.radios.nav1Station ? "VOR" : "GPS",
    };
  }

  // ------------------------------------------------------------ rendering
  renderFlight(dt) {
    const fm = this.fm, W = this.world, s = fm.spec;
    const tt = fm.telemetry;
    if (this.prevTas != null && dt > 0 && !this.paused) {
      const te = (tt.vs + ((tt.tas - this.prevTas) / dt) * tt.tas / G0) / KT;
      this.te = (this.te || 0) * 0.9 + te * 0.1;
    }
    this.prevTas = tt.tas;
    const S = this.cockpitState();
    // nearby objects for ND (refresh every 2 s)
    this.nearTimer = (this.nearTimer || 0) - dt;
    if (this.nearTimer <= 0) {
      this.nearTimer = 2;
      this.nearAirports = this.navdb.nearestAirports(fm.lat, fm.lon, Math.min(this.ndRange * NM * 1.2, 400000), 60);
      this.nearNavaids = this.navdb.navaidsNear(fm.lat, fm.lon, Math.min(this.ndRange * NM * 1.2, 600000), 50);
    }
    const timeSec = fm.time;
    const cockpit = this.view === "cockpit";
    W.updateAircraft(fm, dt, !cockpit, this.lights, timeSec);
    W.updateClouds(fm);
    W.updatePapi(fm);
    this.updateCamera(dt);
    W.render();

    // 3D cockpit
    const vfov = this.vfov;
    const sunEl = W.sunElevation(fm.lat, fm.lon);
    if (cockpit && this.cockpitMode === "3d") {
      this.cockpit3d.enabled = true;
      this.panelTimer -= dt;
      if (this.panelTimer <= 0) {
        this.panelTimer = 1 / 20;
        this.drawCockpitDisplays(S);
        this.cockpit3d.flush();
      }
      const c = fm.ctl;
      const shake = (fm.stall * 0.004 + (fm.onGround ? Math.min(fm.telemetry.gs / 60, 1) * 0.0015 : 0)) * Math.sin(timeSec * 60);
      this.cockpit3d.render(this.head.yaw, this.head.pitch + shake, vfov, { pitch: this.controls.pitch, roll: this.controls.roll, thr: c.thr, flapPos: c.flapPos, spoiler: c.spoilerPos, collective: c.collective, beta: fm.beta }, clamp(sunEl * 5 + 0.6, 0.08, 1));
    } else if (this.cockpit3d.enabled) {
      this.cockpit3d.enabled = false;
      this.cockpit3d.renderer.clear();
    }

    // HUD overlay
    const hud = $("hud");
    const hc = hud.getContext("2d");
    const dpr = this.hudDpr || 1;
    hc.setTransform(dpr, 0, 0, dpr, 0, 0);
    hc.clearRect(0, 0, hud.width, hud.height);
    const Wpx = hud.width / dpr, Hpx = hud.height / dpr - (this.panelH || 0) - (this.panelVisible ? $("apbar").offsetHeight : 0);
    if (cockpit && (s.cockpit === "fighter")) drawHUD(hc, Wpx, hud.height / dpr, S, vfov, this.head.yaw, this.head.pitch);
    else if (!cockpit) drawDataStrip(hc, Wpx, Math.max(Hpx, 200), S);
    if (cockpit && s.cat === "glider" && this.cockpitMode === "2d") {
      const ang = clamp(fm.beta * 6, -0.8, 0.8);
      hc.strokeStyle = "#ff3b30";
      hc.lineWidth = 3;
      hc.beginPath();
      hc.moveTo(Wpx / 2, 60);
      hc.lineTo(Wpx / 2 + Math.sin(ang) * 40, 60 + Math.cos(ang) * 40);
      hc.stroke();
    }
    if (this.paused) txt(hc, "일시정지", Wpx / 2, 90, "#ffb000", 22);
    if (S.gpws && !cockpit) txt(hc, S.gpws, Wpx / 2, 120, "#ff3b30", 22);

    // 2D panel
    if (cockpit && this.cockpitMode === "2d" && this.panelVisible) {
      this.panelTimer -= dt;
      if (this.panelTimer <= 0) {
        this.panelTimer = 1 / 30;
        this.draw2DPanel(S);
      }
    }
    this.apbar.update();
    // audio & callouts
    this.audio.update(fm, S, this.view, this.paused);
    this.voice(S);
    // top bar
    this.tbTimer = (this.tbTimer || 0) - dt;
    if (this.tbTimer <= 0) {
      this.tbTimer = 0.5;
      const date = W.currentDate();
      $("tb-ac").textContent = `${s.name} · ${this.livery?.reg || ""}`;
      $("tb-view").textContent = `${VIEW_NAME[this.view]}${cockpit ? (this.cockpitMode === "3d" ? " 3D" : " 2D") : ""}`;
      $("tb-rate").textContent = this.simRate > 1 ? `${this.simRate}×` : "";
      $("tb-time").textContent = `${date.toISOString().slice(11, 16)}Z`;
      $("tb-fps").textContent = `${Math.round(this.fps)} FPS`;
    }
    for (const m of this.fcs.messages.splice(0)) this.toast(m.text, "warn");
  }

  drawCockpitDisplays(S) {
    const ck = this.cockpit3d;
    const D = ck.displays;
    const draw = (name, fn) => { const d = D[name]; if (d) { d.ctx.setTransform(1, 0, 0, 1, 0, 0); fn(d.ctx, d.w, d.h); } };
    draw("pfd", (g, w, h) => drawPFD(g, 0, 0, w, h, S, S.spec.cockpit === "g1000" ? "g1000" : "airliner"));
    draw("nd", (g, w, h) => drawND(g, 0, 0, w, h, S, { mode: "arc" }));
    draw("eicas", (g, w, h) => drawEICAS(g, 0, 0, w, h, S));
    draw("eicas2", (g, w, h) => drawND(g, 0, 0, w, h, { ...S, ndRange: Math.max(S.ndRange / 2, 5) }, { mode: "rose" }));
    draw("mcp", (g, w, h) => drawMCP(g, w, h, S));
    draw("apstrip", (g, w, h) => drawGarminAP(g, w, h, S));
    draw("mfd", (g, w, h) => { drawEIS(g, 0, 0, w * 0.26, h, S); drawND(g, w * 0.26, 0, w * 0.74, h, S, { mode: "rose" }); });
    draw("sixpack", (g, w, h) => drawSixPack(g, 0, 0, w, h, S));
    draw("heli", (g, w, h) => drawHeliPanel(g, 0, 0, w, h, S));
    draw("glider", (g, w, h) => drawGliderPanel(g, 0, 0, w, h, S));
    draw("upfront", (g, w, h) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      const l = [`FUEL ${Math.round(S.fuelKg)} KG`, `GW ${(S.grossKg / 1000).toFixed(1)} T`, `THR ${Math.round(S.thrPct)}%`, `G ${S.t.nz.toFixed(1)}  MAX ${this.flight.maxG.toFixed(1)}`, `${S.fma.lat} ${S.fma.vert}`];
      l.forEach((s, i) => txt(g, s, 20, 40 + i * 60, "#3dff6e", 34, "left"));
    });
  }

  draw2DPanel(S) {
    const pc = $("panelCanvas");
    const g = pc.getContext("2d");
    const dpr = this.hudDpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = pc.width / dpr, H = pc.height / dpr;
    g.fillStyle = "#0a0c0f";
    g.fillRect(0, 0, W, H);
    const type = S.spec.cockpit;
    const pad = 8;
    if (type === "airliner") {
      const sz = Math.min(H - pad * 2, (W - pad * 4) / 3);
      const x0 = (W - sz * 3 - pad * 2) / 2;
      drawPFD(g, x0, pad, sz, sz, S, "airliner");
      drawND(g, x0 + sz + pad, pad, sz, sz, S, { mode: "arc" });
      drawEICAS(g, x0 + (sz + pad) * 2, pad, sz, sz, S);
    } else if (type === "g1000") {
      const h = H - pad * 2, w = Math.min(h * 1.33, (W - pad * 3) / 2);
      const x0 = (W - w * 2 - pad) / 2;
      drawPFD(g, x0, pad, w, h, S, "g1000");
      drawEIS(g, x0 + w + pad, pad, w * 0.26, h, S);
      drawND(g, x0 + w + pad + w * 0.26, pad, w * 0.74, h, S, { mode: "rose" });
    } else if (type === "fighter") {
      const sz = H - pad * 2;
      drawND(g, W / 2 - sz - pad, pad, sz, sz, S, { mode: "arc" });
      drawEICAS(g, W / 2 + pad, pad, sz, sz, S);
    } else if (type === "heli") drawHeliPanel(g, 0, 0, W, H, S);
    else if (S.spec.cat === "glider") drawGliderPanel(g, 0, 0, W, H, S);
    else drawSixPack(g, 0, 0, W, H, S);
  }

  voice(S) {
    if (!this.menu.cfg.settings.callouts) return;
    const transport = ["narrow", "wide", "bizjet", "regional-tp", "supersonic"].includes(S.spec.cat);
    if (S.spec.cat !== "heli" && S.spec.cat !== "glider") this.audio.callouts(S.radioAltFt, S.vsFpm, S.t.onGround, transport, S.minimums);
    const st = this.gpwsState;
    const now = performance.now();
    if (S.gpws && (!st.last || now - st.last > 3500 || st.text !== S.gpws)) {
      st.last = now;
      st.text = S.gpws;
      this.audio.say(S.gpws === "PULL UP" ? "Whoop whoop, pull up" : S.gpws.toLowerCase(), true);
    }
    if (S.overspeed && (!st.os || now - st.os > 1500)) { st.os = now; this.audio.chime("clacker"); }
    if (S.alerts.some((a) => a.lvl === 3 && a.text.startsWith("CONFIG")) && (!st.cfg || now - st.cfg > 2500)) { st.cfg = now; this.audio.chime("warning"); }
    // minimums callout
    if (S.arrElevFt != null && !S.t.onGround && S.vsFpm < -100) {
      const above = S.altFt - S.arrElevFt;
      if (above < S.minimums + 100 && above > S.minimums + 80 && !st.app) { st.app = 1; this.audio.say("Approaching minimums", true); }
      if (above < S.minimums && above > S.minimums - 30 && !st.min) { st.min = 1; this.audio.say("Minimums", true); }
      if (above > S.minimums + 400) st.app = st.min = 0;
    }
    if (transport && S.ap.vert === "FLARE" && S.radioAltFt < 20 && !st.retard) { st.retard = 1; this.audio.say("Retard", true); }
    if (S.t.onGround) st.retard = 0;
  }

  // ------------------------------------------------------------ cameras
  updateCamera(dt) {
    const fm = this.fm, W = this.world, cam = W.scene.camera, s = fm.spec;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const baseV = (this.menu.cfg.settings.fov || 50) * DEG;
    let vfov = baseV;
    const M = W.frameMatrix(fm);
    const toWorldDir = (b) => {
      // body NED (x fwd, y right, z down) -> model (x fwd, y left, z up) -> ECEF
      const v = new Cesium.Cartesian3(b[0], -b[1], -b[2]);
      return Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(M, v, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    };
    const toWorldPt = (b) => Cesium.Matrix4.multiplyByPoint(M, new Cesium.Cartesian3(b[0], -b[1], -b[2]), new Cesium.Cartesian3());
    const acPos = Cesium.Cartesian3.fromRadians(fm.lon, fm.lat, fm.alt);
    cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    let dest, dir, up;
    const enuUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(acPos, new Cesium.Cartesian3());
    if (this.view === "cockpit") {
      vfov = baseV * this.zoom;
      const eye = this.eyeOffset(s);
      dest = toWorldPt(eye);
      const { yaw, pitch } = this.head;
      const shake = fm.onGround ? Math.sin(fm.time * 37) * Math.min(fm.telemetry.gs / 50, 1) * 0.0012 : (fm.turb ? (fm.turb[2] || 0) * 0.0008 : 0);
      const p = pitch + shake;
      dir = toWorldDir([Math.cos(p) * Math.cos(yaw), Math.cos(p) * Math.sin(yaw), -Math.sin(p)]);
      up = toWorldDir([Math.sin(p) * Math.cos(yaw), Math.sin(p) * Math.sin(yaw), -Math.cos(p)]);
      cam.frustum.near = 0.1;
    } else {
      cam.frustum.near = 1;
      const size = Math.max(s.L, s.b);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(acPos);
      const local = (e, n, u) => Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(e, n, u), new Cesium.Cartesian3());
      if (this.view === "chase") {
        const psi = fm.telemetry.gs > 5 ? fm.telemetry.trk : fm.telemetry.psi;
        this.chaseHdg = this.chaseHdg == null ? psi : this.chaseHdg + Math.atan2(Math.sin(psi - this.chaseHdg), Math.cos(psi - this.chaseHdg)) * Math.min(1, dt * 2.5);
        const dist = size * 1.6 + 8;
        dest = local(-Math.sin(this.chaseHdg) * dist, -Math.cos(this.chaseHdg) * dist, size * 0.35 + 3);
      } else if (this.view === "orbit") {
        const o = this.orbit;
        const yaw = fm.telemetry.psi + o.yaw;
        dest = local(Math.sin(yaw) * Math.cos(o.pitch) * o.dist, Math.cos(yaw) * Math.cos(o.pitch) * o.dist, -Math.sin(o.pitch) * o.dist);
      } else if (this.view === "tower") {
        const tp = this.towerPos;
        dest = Cesium.Cartesian3.fromRadians(tp.lon, tp.lat, tp.alt);
        const dd = Cesium.Cartesian3.distance(dest, acPos);
        vfov = clamp(Math.atan2(size * 3, dd) * 2, 1 * DEG, baseV);
      } else {
        if (!this.flyby || Cesium.Cartesian3.distance(this.flyby, acPos) > 900) {
          const tr = fm.telemetry.gs > 5 ? fm.telemetry.trk : fm.telemetry.psi;
          const ahead = Math.max(fm.telemetry.gs * 6, 150);
          const [la, lo] = gcDest(fm.lat, fm.lon, tr, ahead);
          const [la2, lo2] = gcDest(la, lo, tr + Math.PI / 2, size * 1.5 + 20);
          const g = W.groundHeight(la2, lo2) ?? this.groundAlt;
          this.flyby = Cesium.Cartesian3.fromRadians(lo2, la2, Math.max(fm.alt - 5, g + 2));
        }
        dest = this.flyby;
      }
      // keep above terrain
      const cc = Cesium.Cartographic.fromCartesian(dest);
      const gh = W.groundHeight(cc.latitude, cc.longitude);
      if (gh != null && cc.height < gh + 1.5) dest = Cesium.Cartesian3.fromRadians(cc.longitude, cc.latitude, gh + 1.5);
      dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(acPos, dest, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(dir, enuUp, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      up = Cesium.Cartesian3.cross(right, dir, new Cesium.Cartesian3());
    }
    this.vfov = vfov;
    cam.frustum.fov = aspect > 1 ? 2 * Math.atan(Math.tan(vfov / 2) * aspect) : vfov;
    cam.setView({ destination: dest, orientation: { direction: dir, up } });
  }

  /** Pilot eye position in body axes (x fwd, y right, z down) relative to the CG. */
  eyeOffset(s) {
    const L = s.L, fd = s.model?.fd || 1.5, R = fd / 2;
    if (s.cat === "heli") return [L * 0.2, 0.32, -0.15];
    if (s.cockpit === "airliner") return [L / 2 - Math.max(fd * 0.75, 2.2), -0.53, -R * 0.42];
    if (s.cockpit === "fighter" || s.cat === "aero" || s.cat === "warbird") return [L / 2 - L * (s.cat === "fighter" ? 0.3 : 0.5), 0, -R * 0.75];
    if (s.cat === "glider") return [L * 0.28, 0, -R * 0.45];
    if (s.model?.eng === "wing" || s.model?.eng === "pusher") return [L / 2 - L * 0.18, -0.3, -R * 0.45];
    return [L * 0.08, -0.3, -R * 0.5];
  }
}

const app = new App();
window.skyforge = app;
app.init().catch((e) => {
  console.error(e);
  const el = document.getElementById("dbStatus");
  if (el) el.textContent = "초기화 실패: " + e.message;
});

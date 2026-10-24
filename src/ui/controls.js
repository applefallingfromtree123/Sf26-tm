// Pilot inputs: keyboard (FS-style default bindings), game controllers /
// joysticks / yokes / rudder pedals through the Gamepad API with user axis
// binding, and mouse head-look.

import { clamp, approach } from "../sim/math.js";

const STORE = "skyforge.axes.v1";

export const KEY_HELP = [
  ["비행 조종", ""],
  ["↑ / ↓ · Num8 / Num2", "피치 (↓ = 기수 들기)"],
  ["← / → · Num4 / Num6", "롤 (에일러론)"],
  ["Q / E · Num0 / NumEnter", "러더 (지상: 노즈휠 스티어링)"],
  ["Num5", "조종면 중립"],
  ["Num7 / Num1 · Home / End", "엘리베이터 트림 (기수 내림 / 들기)"],
  ["Ctrl+← / Ctrl+→", "러더 트림"],
  ["추력 / 엔진", ""],
  ["F1 / F2 / F3 / F4", "스로틀 컷 / 감소 / 증가 / 최대 (F2 유지 = 지상 역추력)"],
  ["= / -", "스로틀 증가 / 감소"],
  ["[ / ]", "믹스처 린 / 리치 (피스톤)"],
  ["Ctrl+E", "엔진 자동 시동 / 정지"],
  ["기체 시스템", ""],
  ["F5 / F6 / F7 / F8", "플랩 전부 올림 / 한 단계 올림 / 한 단계 내림 / 최대"],
  ["G", "랜딩기어 올림/내림"],
  ["/ · Shift+/", "스포일러(스피드브레이크) 토글 · 오토 스포일러 ARM"],
  [". (유지)", "휠 브레이크"],
  ["Ctrl+.", "파킹 브레이크"],
  ["L", "외부 조명 (NAV/BCN/STROBE/LDG)"],
  ["B", "고도계 QNH 설정 (Shift+B = STD 1013)"],
  ["오토파일럿", ""],
  ["Z", "AP 마스터"],
  ["Shift+R", "오토스로틀 (A/THR)"],
  ["Shift+H / Shift+N / Shift+A", "HDG / NAV(LNAV) / APPR(LOC+G/S) 모드"],
  ["Shift+L / Shift+V / Shift+F", "ALT 홀드 / V/S / FLC(속도-피치) 모드"],
  ["Insert / Delete (Shift ×10)", "헤딩 버그 −/+"],
  ["PageUp / PageDown (Shift ×10)", "고도 버그 +/− 100 ft"],
  ["Ctrl+PageUp / Ctrl+PageDown", "속도 버그 +/−"],
  ["Ctrl+Home / Ctrl+End", "V/S 버그 +/− 100 fpm"],
  ["시점 / 시뮬레이션", ""],
  ["V · F9 / F10 / F12", "시점 전환: 조종석 → 추적 → 외부 궤도 → 관제탑 → 플라이바이"],
  ["마우스 오른쪽 드래그 · 휠", "시선 이동 / 줌 (외부: 궤도)"],
  ["I", "계기판 표시/숨김"],
  ["P", "일시정지"],
  ["Ctrl+↑ / Ctrl+↓", "시뮬레이션 배속 (1×–16×)"],
  ["C", "체크리스트"],
  ["Esc", "메뉴"],
  ["H", "도움말"],
];

export class Controls {
  constructor() {
    this.keys = new Set();
    this.pitch = 0; // + = pull (nose up)
    this.roll = 0;
    this.yaw = 0;
    this.throttle = 0;
    this.mixture = 1;
    this.brake = 0;
    this.pitchKbd = 0;
    this.rollKbd = 0;
    this.yawKbd = 0;
    this.handlers = new Map(); // action -> fn
    this.axisMap = this.loadAxes();
    this.gamepadIndex = null;
    this.lastAxes = [];
    this.gpThrottleActive = false;
    this.binding = null;
    this.headYaw = 0;
    this.headPitch = 0;
    this.zoom = 1;
    this.reverseHeld = false;
    this.enabled = true;
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("gamepadconnected", (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.emit("message", `컨트롤러 연결됨: ${e.gamepad.id}`);
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.gamepadIndex = null;
      this.emit("message", "컨트롤러 연결 해제");
    });
  }

  on(action, fn) {
    this.handlers.set(action, fn);
  }
  emit(action, ...args) {
    this.handlers.get(action)?.(...args);
  }

  loadAxes() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE));
      if (v) return v;
    } catch {}
    return {
      roll: { axis: 0, invert: false, dz: 0.05 },
      pitch: { axis: 1, invert: false, dz: 0.05 },
      yaw: { axis: 2, invert: false, dz: 0.08 },
      throttle: { axis: 3, invert: true, dz: 0.0 },
    };
  }
  saveAxes() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.axisMap));
    } catch {}
  }
  /** Start listening for the next moved axis and bind it to `fn` (roll|pitch|yaw|throttle|brake). */
  bindAxis(fn, done) {
    this.binding = { fn, done, base: null };
  }

  onKey(e, down) {
    if (!this.enabled) return;
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const code = e.code;
    const block = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F12", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "PageUp", "PageDown", "Home", "End", "Insert", "Delete", "Slash", "Period", "Tab", "Backspace"];
    if (block.includes(code) || code.startsWith("Numpad") || (e.ctrlKey && ["KeyE", "KeyH", "KeyS"].includes(code))) e.preventDefault();
    if (down) {
      if (this.keys.has(code) && !["F2", "F3", "Equal", "Minus", "Insert", "Delete", "PageUp", "PageDown", "Home", "End", "Numpad7", "Numpad1", "BracketLeft", "BracketRight"].includes(code)) return;
      this.keys.add(code);
      this.discrete(code, e);
    } else {
      this.keys.delete(code);
      if (code === "F2") this.reverseHeld = false;
    }
  }

  discrete(code, e) {
    const s = e.shiftKey, c = e.ctrlKey || e.metaKey;
    const E = (a, ...x) => this.emit(a, ...x);
    switch (code) {
      case "F1": this.throttle = 0; E("throttleSet"); break;
      case "F2":
        if (this.throttle <= 0.001) { this.reverseHeld = true; E("reverse", true); }
        this.throttle = clamp(this.throttle - 0.02, 0, 1); break;
      case "F3": this.throttle = clamp(this.throttle + 0.02, 0, 1); E("reverse", false); break;
      case "F4": this.throttle = 1; E("reverse", false); break;
      case "Equal": case "NumpadAdd": this.throttle = clamp(this.throttle + 0.02, 0, 1); E("reverse", false); break;
      case "Minus": case "NumpadSubtract": this.throttle = clamp(this.throttle - 0.02, 0, 1); break;
      case "BracketLeft": this.mixture = clamp(this.mixture - 0.02, 0, 1); E("mixture", this.mixture); break;
      case "BracketRight": this.mixture = clamp(this.mixture + 0.02, 0, 1); E("mixture", this.mixture); break;
      case "F5": E("flaps", "up"); break;
      case "F6": E("flaps", "dec"); break;
      case "F7": E("flaps", "inc"); break;
      case "F8": E("flaps", "full"); break;
      case "KeyG": E("gear"); break;
      case "Slash": s ? E("spoilerArm") : E("spoiler"); break;
      case "Period": if (c) E("parkingBrake"); break;
      case "KeyL": s ? E("apMode", "ALT") : E("lights"); break;
      case "KeyB": E("baro", s); break;
      case "KeyZ": E("ap"); break;
      case "KeyR": if (s) E("at"); break;
      case "KeyH": s ? E("apMode", "HDG") : E("help"); break;
      case "KeyN": if (s) E("apMode", "NAV"); break;
      case "KeyA": if (s) E("apMode", "APPR"); break;
      case "KeyF": if (s) E("apMode", "FLC"); break;
      case "KeyV": s ? E("apMode", "VS") : E("view"); break;
      case "KeyE": if (c) E("autostart"); break;
      case "Insert": E("bug", "hdg", s ? -10 : -1); break;
      case "Delete": E("bug", "hdg", s ? 10 : 1); break;
      case "PageUp": c ? E("bug", "spd", 1) : E("bug", "alt", s ? 1000 : 100); break;
      case "PageDown": c ? E("bug", "spd", -1) : E("bug", "alt", s ? -1000 : -100); break;
      case "Home": if (c) E("bug", "vs", 100); break;
      case "End": if (c) E("bug", "vs", -100); break;
      case "KeyI": E("panel"); break;
      case "KeyP": E("pause"); break;
      case "KeyC": if (!c) E("checklist"); break;
      case "Escape": E("menu"); break;
      case "F9": E("view", "cockpit"); break;
      case "F10": E("view", "chase"); break;
      case "F12": E("view", "orbit"); break;
      case "Numpad5": this.pitchKbd = this.rollKbd = this.yawKbd = 0; break;
      case "ArrowUp": if (c) E("simrate", 1); break;
      case "ArrowDown": if (c) E("simrate", -1); break;
      case "ArrowLeft": if (c) E("rudTrim", -1); break;
      case "ArrowRight": if (c) E("rudTrim", 1); break;
    }
  }

  /** Per-frame update: integrates keyboard axes and reads game controllers. */
  update(dt) {
    const k = this.keys;
    const ctrl = k.has("ControlLeft") || k.has("ControlRight");
    const shift = k.has("ShiftLeft") || k.has("ShiftRight");
    const rate = 1.6;
    const ret = 2.2;
    const up = !ctrl && !shift && (k.has("ArrowDown") || k.has("Numpad2"));
    const dn = !ctrl && !shift && (k.has("ArrowUp") || k.has("Numpad8"));
    const lf = !ctrl && (k.has("ArrowLeft") || k.has("Numpad4"));
    const rt = !ctrl && (k.has("ArrowRight") || k.has("Numpad6"));
    const yl = k.has("KeyQ") || k.has("Numpad0");
    const yr = k.has("KeyE") && !ctrl || k.has("NumpadEnter");
    this.pitchKbd = up ? approach(this.pitchKbd, 1, rate, dt) : dn ? approach(this.pitchKbd, -1, rate, dt) : approach(this.pitchKbd, 0, ret, dt);
    this.rollKbd = rt ? approach(this.rollKbd, 1, rate, dt) : lf ? approach(this.rollKbd, -1, rate, dt) : approach(this.rollKbd, 0, ret, dt);
    this.yawKbd = yr ? approach(this.yawKbd, 1, rate, dt) : yl ? approach(this.yawKbd, -1, rate, dt) : approach(this.yawKbd, 0, ret, dt);
    this.trimDir = (k.has("Numpad1") || (k.has("End") && !ctrl) ? 1 : 0) - (k.has("Numpad7") || (k.has("Home") && !ctrl) ? 1 : 0);
    if (k.has("F2") && this.throttle > 0) this.throttle = clamp(this.throttle - 0.4 * dt, 0, 1);
    if (k.has("F3")) this.throttle = clamp(this.throttle + 0.4 * dt, 0, 1);
    this.brake = k.has("Period") && !ctrl ? 1 : 0;

    let jp = 0, jr = 0, jy = 0, jt = null, jb = 0;
    const gp = this.readGamepad();
    if (gp) {
      const ax = gp.axes;
      const read = (m) => {
        if (!m || m.axis == null || ax[m.axis] == null) return null;
        let v = ax[m.axis];
        if (m.invert) v = -v;
        return Math.abs(v) < (m.dz || 0) ? 0 : v;
      };
      const M = this.axisMap;
      jr = read(M.roll) ?? 0;
      jp = -(read(M.pitch) ?? 0); // stick back (+axis) = pull
      jy = read(M.yaw) ?? 0;
      const t = read(M.throttle);
      if (t != null && gp.mapping !== "standard") jt = (t + 1) / 2;
      if (M.brake) jb = ((read(M.brake) ?? -1) + 1) / 2;
      if (gp.mapping === "standard") {
        // Xbox / PlayStation layout: RT/LT throttle, bumpers rudder
        const b = gp.buttons;
        jy = (b[5]?.value || 0) - (b[4]?.value || 0) + (ax[2] ?? 0) * 0.6;
        if (b[7]?.value > 0.05) this.throttle = clamp(this.throttle + b[7].value * 0.5 * dt, 0, 1);
        if (b[6]?.value > 0.05) this.throttle = clamp(this.throttle - b[6].value * 0.5 * dt, 0, 1);
        this.pad(b, 0, "gear");
        this.pad(b, 1, "brakeHold");
        this.pad(b, 12, "flaps", "dec");
        this.pad(b, 13, "flaps", "inc");
        this.pad(b, 3, "ap");
        this.pad(b, 9, "view");
        if (b[1]?.pressed) jb = 1;
      }
      if (jt != null) {
        if (Math.abs(jt - (this.lastJt ?? jt)) > 0.004 || this.gpThrottleActive) {
          this.gpThrottleActive = true;
          this.throttle = jt;
        }
        this.lastJt = jt;
      }
    }
    this.pitch = clamp(this.pitchKbd + jp, -1, 1);
    this.roll = clamp(this.rollKbd + jr, -1, 1);
    this.yaw = clamp(this.yawKbd + jy, -1, 1);
    this.brake = Math.max(this.brake, jb);
  }

  pad(b, idx, action, arg) {
    this.prevBtn ||= [];
    const p = !!b[idx]?.pressed;
    if (p && !this.prevBtn[idx]) this.emit(action, arg);
    this.prevBtn[idx] = p;
  }

  readGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = this.gamepadIndex != null ? pads[this.gamepadIndex] : null;
    if (!gp) gp = [...pads].find((p) => p);
    if (!gp) return null;
    if (this.binding) {
      const ax = gp.axes;
      if (!this.binding.base) this.binding.base = [...ax];
      for (let i = 0; i < ax.length; i++) {
        if (Math.abs(ax[i] - this.binding.base[i]) > 0.5) {
          const fn = this.binding.fn;
          this.axisMap[fn] = { axis: i, invert: false, dz: fn === "throttle" ? 0 : 0.05 };
          this.saveAxes();
          this.binding.done?.(i);
          this.binding = null;
          break;
        }
      }
    }
    return gp;
  }
}

// Keyboard + gamepad input. Slot 0 = keyboard + first gamepad, slot 1 = second gamepad.
const KEYMAP = {
  KeyJ: 'pass', KeyK: 'shoot', KeyL: 'through', KeyI: 'lob', KeyQ: 'sw', KeyU: 'sw', KeyF: 'skill', KeyE: 'finesse',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'skip', Enter: 'skip',
};
const PAD = { 0: 'pass', 1: 'shoot', 2: 'lob', 3: 'through', 4: 'sw', 5: 'finesse', 7: 'sprint', 11: 'skill', 10: 'skill' };
const ACTIONS = ['pass', 'shoot', 'through', 'lob', 'sw', 'skill', 'skip'];

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.slots = [0, 1].map(() => ({ taps: Object.fromEntries(ACTIONS.map(a => [a, 0])), held: {}, padPrev: [] }));
    this.handlers = {};
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.enabled) return;
      const a = KEYMAP[e.code];
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (a && ACTIONS.includes(a)) this.slots[0].taps[a]++;
        if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause');
        if (e.code === 'KeyC') this.emit('camera');
        if (a === 'skip') this.emit('skip');
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev) { const fn = this.handlers[ev]; if (fn) fn(); }
  pads() { return (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean); }
  padCount() { return this.pads().length; }

  // yaw: camera heading angle in world x-z; returns engine input object
  poll(slot, yaw) {
    const S = this.slots[slot];
    let sx = 0, sy = 0; // screen-space stick: x right, y up
    const held = { pass: false, shoot: false, through: false, lob: false, finesse: false, sprint: false };
    if (slot === 0) {
      const k = this.keys;
      if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) sx += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) sy += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) sy -= 1;
      for (const [code, a] of Object.entries(KEYMAP)) if (k.has(code) && a in held) held[a] = true;
    }
    const pad = this.pads()[slot];
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { sx += ax; sy -= ay; }
      const b = pad.buttons;
      if (b[12]?.pressed) sy += 1; if (b[13]?.pressed) sy -= 1; if (b[14]?.pressed) sx -= 1; if (b[15]?.pressed) sx += 1;
      for (const [idx, a] of Object.entries(PAD)) {
        const pressed = !!b[idx]?.pressed || (idx === '7' && (b[7]?.value || 0) > 0.3);
        if (pressed && a in held) held[a] = true;
        if (pressed && !S.padPrev[idx] && ACTIONS.includes(a)) S.taps[a]++;
        S.padPrev[idx] = pressed;
      }
      const start = !!b[9]?.pressed; if (start && !S.padPrev.start) this.emit('pause'); S.padPrev.start = start;
      const back = !!b[8]?.pressed; if (back && !S.padPrev.back) this.emit('camera'); S.padPrev.back = back;
      const a0 = !!b[0]?.pressed; if (a0 && !S.padPrev.a0) { S.taps.skip++; this.emit('skip'); } S.padPrev.a0 = a0;
    }
    const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; }
    // screen -> world using camera yaw (forward = up on screen)
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const mx = -fz * sx + fx * sy, mz = fx * sx + fz * sy;
    return { mx, mz, sprint: held.sprint, pass: held.pass, shoot: held.shoot, through: held.through, lob: held.lob, finesse: held.finesse, taps: { ...S.taps } };
  }
}

export const CONTROLS_HTML = `
<div class="keys">
  <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 방향키</div><div>이동</div>
  <div><kbd>Shift</kbd></div><div>스프린트</div>
  <div><kbd>J</kbd></div><div>패스 · (수비) 태클 / 누르고 있으면 압박</div>
  <div><kbd>K</kbd></div><div>슈팅 (길게 눌러 파워) · (수비) 슬라이딩 태클</div>
  <div><kbd>L</kbd></div><div>스루패스 · (수비) 동료 압박</div>
  <div><kbd>I</kbd></div><div>로빙 패스 / 크로스</div>
  <div><kbd>E</kbd> + <kbd>K</kbd></div><div>감아차기 (피네스 슛)</div>
  <div><kbd>F</kbd></div><div>개인기 (페인트)</div>
  <div><kbd>Q</kbd></div><div>선수 변경</div>
  <div><kbd>C</kbd></div><div>카메라 전환</div>
  <div><kbd>Space</kbd></div><div>리플레이/세리머니 스킵</div>
  <div><kbd>Esc</kbd></div><div>일시정지</div>
</div>
<p class="muted small" style="margin-top:12px">게임패드: A 패스 · B 슛 · Y 스루 · X 로빙 · LB 선수변경 · RB 피네스 · RT 스프린트 · R3 개인기 · Start 일시정지. 두 번째 게임패드를 연결하면 로컬 2인 대전이 가능합니다.</p>`;

// On-screen touch controls for tablets and phones: a floating virtual joystick on the
// left half and context-sensitive action buttons on the right. Feeds InputManager.
const TAP_ACTIONS = new Set(['pass', 'shoot', 'through', 'lob', 'sw', 'skill']);
const LABELS = {
  attack: { pass: '패스', shoot: '슛', through: '스루', lob: '로빙' },
  defend: { pass: '태클', shoot: '슬라이딩', through: '압박', lob: '로빙' },
  setpiece: { pass: '패스', shoot: '슛', through: '스루', lob: '로빙' },
};

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.el = null;
    this.mode = '';
    input.touch = { sx: 0, sy: 0, held: {} };
  }

  mount(device, scale = 1) {
    this.unmount();
    const base = (device === 'phone' ? 62 : 78) * scale;
    const el = document.createElement('div');
    el.id = 'touch';
    el.className = `touch touch-${device}`;
    el.style.setProperty('--b', `${base}px`);
    el.innerHTML = `
      <div class="tc-zone"><div class="tc-base"><div class="tc-knob"></div></div></div>
      <div class="tc-cluster">
        <button class="tc-btn tc-shoot" data-a="shoot">슛</button>
        <button class="tc-btn tc-pass" data-a="pass">패스</button>
        <button class="tc-btn tc-lob" data-a="lob">로빙</button>
        <button class="tc-btn tc-through" data-a="through">스루</button>
        <button class="tc-btn tc-sprint" data-a="sprint">달리기</button>
        <div class="tc-row">
          <button class="tc-btn tc-sm" data-a="sw">선수변경</button>
          <button class="tc-btn tc-sm" data-a="skill">개인기</button>
          <button class="tc-btn tc-sm" data-a="finesse">감아차기</button>
        </div>
      </div>
      <button class="tc-skip hidden" data-a="skip">건너뛰기 ⏭</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.bindStick(el.querySelector('.tc-zone'), base);
    el.querySelectorAll('[data-a]').forEach(b => this.bindButton(b));
    // block browser gestures (scroll, pinch, double-tap zoom) while playing
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  unmount() {
    if (this.el) this.el.remove();
    this.el = null; this.mode = '';
    this.input.touch = { sx: 0, sy: 0, held: {} };
  }

  bindStick(zone, base) {
    const baseEl = zone.querySelector('.tc-base'), knob = zone.querySelector('.tc-knob');
    const R = base * 0.95;
    let id = null, ox = 0, oy = 0;
    const set = (x, y) => {
      let dx = x - ox, dy = y - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let sx = dx / R, sy = -dy / R;
      const m = Math.hypot(sx, sy);
      if (m < 0.14) { sx = 0; sy = 0; } else { const k = Math.min(1, (m - 0.14) / 0.76) / m; sx *= k; sy *= k; }
      this.input.touch.sx = sx; this.input.touch.sy = sy;
    };
    const reset = () => {
      id = null; this.input.touch.sx = 0; this.input.touch.sy = 0;
      knob.style.transform = '';
      baseEl.classList.remove('on'); baseEl.style.left = ''; baseEl.style.top = '';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId; zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      baseEl.classList.add('on');
      baseEl.style.left = `${e.clientX - r.left}px`; baseEl.style.top = `${e.clientY - r.top}px`;
      set(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, (e) => { if (e.pointerId === id) reset(); });
  }

  bindButton(btn) {
    const a = btn.dataset.a;
    let id = null;
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null; btn.classList.remove('on');
      this.input.touch.held[a] = false;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; btn.setPointerCapture(id);
      btn.classList.add('on');
      this.input.touch.held[a] = true;
      if (TAP_ACTIONS.has(a) || a === 'skip') this.input.slots[0].taps[a]++;
      if (a === 'skip') this.input.emit('skip');
      if (navigator.vibrate && a !== 'sprint') try { navigator.vibrate(12); } catch { /* unsupported */ }
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, up);
  }

  // called every frame by the match runner
  update(snap, ctx, myTeam) {
    if (!this.el || !snap) return;
    let mode = 'attack';
    if (snap.sp && snap.sp.tm === myTeam) mode = 'setpiece';
    else {
      const owner = snap.b[3];
      if (owner >= 0 && (owner < 11 ? 0 : 1) !== myTeam) mode = 'defend';
    }
    if (mode !== this.mode) {
      this.mode = mode;
      for (const [a, txt] of Object.entries(LABELS[mode])) { const b = this.el.querySelector(`[data-a="${a}"]`); if (b) b.textContent = txt; }
      this.el.classList.toggle('defending', mode === 'defend');
    }
    const showSkip = !!ctx.replay || snap.ph === 'goal' || snap.ph === 'halftime';
    this.el.querySelector('.tc-skip').classList.toggle('hidden', !showSkip);
    const ch = ctx.charge || 0;
    const shoot = this.el.querySelector('.tc-shoot');
    shoot.style.setProperty('--charge', `${Math.min(100, ch / 1.15 * 100)}%`);
    shoot.classList.toggle('charging', ch > 0);
  }
}

export function detectDevice() {
  const coarse = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1;
  if (!coarse) return 'pc';
  const s = Math.min(screen.width, screen.height);
  return s >= 600 ? 'tablet' : 'phone';
}

export const TOUCH_HELP_HTML = `
<div class="keys">
  <div><b>왼쪽 화면</b></div><div>아무 곳이나 눌러 조이스틱으로 이동</div>
  <div><b>슛</b></div><div>길게 누를수록 강한 슛 · (수비) 슬라이딩 태클</div>
  <div><b>패스</b></div><div>짧은 패스 · (수비) 태클 / 누르고 있으면 압박</div>
  <div><b>스루 / 로빙</b></div><div>침투 패스 / 띄우는 패스·크로스</div>
  <div><b>달리기</b></div><div>누르고 있는 동안 스프린트</div>
  <div><b>감아차기</b></div><div>누른 채로 슛하면 감아차기</div>
  <div><b>선수변경 · 개인기</b></div><div>수비 시 선수 교체 · 페인트 동작</div>
</div>`;

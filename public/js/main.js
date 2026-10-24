// SF2027 app bootstrap & screen router.
import { Renderer } from './game/renderer.js';
import { InputManager } from './game/input.js';
import { GameAudio } from './game/audio.js';
import { Hud } from './game/hud.js';
import { MatchRunner } from './game/matchRunner.js';
import { api, LS } from './api.js';
import * as menus from './ui/menus.js';
import * as career from './ui/career.js';
import * as pcareer from './ui/pcareer.js';
import * as online from './ui/online.js';
import * as superclass from './ui/superclass.js';
import * as cupui from './ui/cupui.js';
import { toast } from './ui/dom.js';
import { TouchControls, detectDevice } from './game/touch.js';

const bar = document.querySelector('.boot-bar i');
const msg = document.querySelector('.boot-msg');
const progress = (p, t) => { bar.style.width = `${p}%`; if (t) msg.textContent = t; };

const DEFAULT_SETTINGS = { volume: 0.7, camera: 'broadcast', difficulty: 2, quality: 2, shadows: true, night: true, device: 'auto', touchScale: 1 };
const saved = LS.get('sf_settings', null);
const settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
// first launch on a tablet/phone: lighter graphics defaults
if (!saved) {
  const d = detectDevice();
  if (d !== 'pc') { settings.quality = 0; settings.shadows = d === 'tablet'; }
}
// one-time upgrade: PCs on the old "high" preset move to the new Ultra (AAA) graphics
if (saved && !saved.gfx2) { if (saved.quality === 1 && detectDevice() === 'pc') settings.quality = 2; settings.gfx2 = true; LS.set('sf_settings', settings); }

const app = {
  settings, api,
  ui: document.getElementById('ui'),
  inMatch: false,
  saveSettings() { LS.set('sf_settings', this.settings); this.audio.setVolume(this.settings.volume); this.renderer.camMode = this.settings.camera; },
  show(html) { this.ui.innerHTML = html; return this.ui.firstElementChild; },
  // effective device profile: 'pc' | 'tablet' | 'phone'
  applyDevice() {
    this.device = this.settings.device === 'auto' || !this.settings.device ? detectDevice() : this.settings.device;
    document.body.classList.remove('device-pc', 'device-tablet', 'device-phone');
    document.body.classList.add('device-' + this.device);
    if (this.inMatch) this.mountTouch();
  },
  mountTouch() {
    if (this.device === 'pc') this.touch.unmount(); else this.touch.mount(this.device, this.settings.touchScale || 1);
  },
  enterMatch() { this.inMatch = true; this.ui.innerHTML = ''; document.body.classList.add('in-match'); this.mountTouch(); },
  leaveMatch() { this.inMatch = false; document.body.classList.remove('in-match'); this.touch.unmount(); },
  go(name, ...args) {
    const screens = {
      main: menus.mainMenu, kickoff: menus.kickoffSetup, settings: menus.settingsScreen, account: menus.accountScreen,
      career: career.careerEntry, pcareer: pcareer.playerCareerEntry, online: online.onlineLobby, superclass: superclass.superClassEntry, cup: cupui.kickoffCupEntry,
    };
    const fn = screens[name];
    if (!fn) return;
    Promise.resolve(fn(app, ...args)).catch(e => { console.error(e); toast('오류: ' + e.message, true); });
  },
  async playMatch(cfg) {
    this.enterMatch();
    try { return await this.runner.playLocal({ camera: this.settings.camera, night: this.settings.night, ...cfg }); }
    finally { this.leaveMatch(); }
  },
  async playOnline(socket, start) {
    this.enterMatch();
    try { return await this.runner.playOnline(socket, start); }
    finally { this.leaveMatch(); }
  },
};
window.SF = app;

async function boot() {
  progress(10, '그래픽 엔진 초기화...');
  await new Promise(r => setTimeout(r, 30));
  try {
    app.renderer = new Renderer(document.getElementById('gl'), settings);
  } catch (e) {
    console.error(e);
    msg.textContent = 'WebGL을 초기화할 수 없습니다. 최신 브라우저(Chrome/Safari/Edge/Firefox)를 사용해주세요.';
    return;
  }
  progress(70, '관중 입장 중...');
  app.renderer.camMode = settings.camera;
  app.input = new InputManager();
  app.touch = new TouchControls(app.input);
  app.applyDevice();
  app.audio = new GameAudio(); app.audio.setVolume(settings.volume);
  app.hud = new Hud(document.getElementById('hud'));
  app.runner = new MatchRunner(app);
  // unlock audio on first interaction
  const unlock = () => { app.audio.ensure(); app.audio.setCrowd(0.12, 0.02); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  // menu render loop
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (!app.inMatch) app.renderer.renderFrame(dt, null, {});
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  progress(100, '킥오프!');
  if (api.loggedIn) api.refresh();
  setTimeout(() => document.getElementById('boot').classList.add('done'), 250);
  app.go('main');
}
boot();

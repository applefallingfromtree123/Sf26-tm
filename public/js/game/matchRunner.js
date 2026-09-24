// Drives a match: local (engine in the browser) or online (server snapshots).
import { Match } from '/shared/sim.js';
import { modal, esc, confirmBox } from '../ui/dom.js';
import { CONTROLS_HTML } from './input.js';

const STEP = 1 / 60;
const CAMS = ['broadcast', 'close', 'pro'];
const CAM_NAMES = { broadcast: '방송 카메라', close: '근접 카메라', pro: '선수 시점 (프로)' };

function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
export function lerpSnap(a, b, t) {
  if (!a || !b) return b || a;
  t = Math.max(0, Math.min(1, t));
  const p = b.p.slice();
  for (let i = 0; i < 22; i++) {
    const o = i * 7;
    const dx = b.p[o] - a.p[o], dz = b.p[o + 1] - a.p[o + 1];
    if (dx * dx + dz * dz > 9) continue;
    p[o] = a.p[o] + dx * t; p[o + 1] = a.p[o + 1] + dz * t;
    p[o + 2] = lerpAng(a.p[o + 2], b.p[o + 2], t);
    p[o + 3] = a.p[o + 3] + (b.p[o + 3] - a.p[o + 3]) * t;
    if (a.p[o + 4] === b.p[o + 4]) p[o + 5] = a.p[o + 5] + (b.p[o + 5] - a.p[o + 5]) * t;
  }
  const bb = b.b, ab = a.b;
  const jump = Math.hypot(bb[0] - ab[0], bb[2] - ab[2]) > 6;
  const ball = jump ? bb : [ab[0] + (bb[0] - ab[0]) * t, ab[1] + (bb[1] - ab[1]) * t, ab[2] + (bb[2] - ab[2]) * t, bb[3]];
  return { ...b, p, b: ball };
}

export class MatchRunner {
  constructor(app) { this.app = app; }

  setupScene(home, away, kits, night) {
    const R = this.app.renderer;
    R.setNight(night !== false);
    R.setStadiumColors(home.club.c1, home.club.c2, kits.away[0], kits.away[1]);
    R.setMenuMode(false);
    R.setTeams(home, away, kits);
    this.app.hud.show([home, away], kits, { online: this.online, onMenu: () => this.app.input.emit('pause'), onQuit: () => this.app.input.emit('quit') });
    this.app.audio.ensure();
    this.app.audio.setCrowd(0.22, 0.04);
    this.spike = 0;
  }

  handleEvent(e, snap) {
    const A = this.app.audio, H = this.app.hud, R = this.app.renderer;
    H.onEvent(e, snap);
    switch (e.type) {
      case 'kick': A.kick(e.power); break;
      case 'whistle': A.whistle(1); break;
      case 'goal': A.cheer(true); A.net(); this.spike = 1.3; R.netHit(Math.sign(snap.b[0]) || 1, Math.max(0.3, snap.b[1]), snap.b[2]); this.goalAt = this.clock; this.goalTeam = e.team; this.goalScorer = e.p; break;
      case 'save': case 'post': A.ooh(); this.spike = Math.max(this.spike, 0.7); break;
      case 'shot': this.spike = Math.max(this.spike, 0.5); if (!e.onTarget) setTimeout(() => A.groan(), 500); break;
      case 'foul': case 'offside': A.whistle(1); break;
      case 'penalty': A.whistle(1); A.cheer(false); this.spike = 0.8; break;
      case 'card': if (e.color === 'red') A.groan(); break;
      case 'halftime': A.whistle(2, true); break;
      case 'fulltime': A.whistle(3, true); A.cheer(false); break;
      case 'skill': this.spike = Math.max(this.spike, 0.3); break;
    }
  }

  excitement(snap, dt) {
    this.spike = Math.max(0, (this.spike || 0) - dt * 0.18);
    const near = Math.max(0, (Math.abs(snap.b[0]) - 30) / 22);
    const lvl = 0.15 + near * 0.25 + this.spike;
    this.app.audio.setCrowd(0.16 + near * 0.12 + Math.min(0.6, this.spike * 0.5), 0.03 + near * 0.03);
    return Math.min(1.2, lvl);
  }

  camYaw(attackDir) {
    const cam = this.app.renderer.camMode;
    if (cam === 'pro') return attackDir > 0 ? 0 : Math.PI;
    return -Math.PI / 2;
  }
  cycleCamera() {
    const R = this.app.renderer;
    const i = (CAMS.indexOf(R.camMode) + 1) % CAMS.length;
    R.camMode = CAMS[i];
    this.app.hud.say(`카메라: ${CAM_NAMES[R.camMode]}`, 1.5);
  }

  // ---------------- local ----------------
  playLocal(cfg) {
    this.online = false;
    const { home, away, kits } = cfg;
    const humans = cfg.humans || [{ slot: 0, team: 0 }];
    const m = new Match({ home, away, difficulty: cfg.difficulty ?? 2, controllers: humans.map(h => ({ team: h.team, lock: h.lock ?? -1 })), seed: (Math.random() * 1e9) | 0, allowSkip: true, realSeconds: cfg.realSeconds });
    this.match = m;
    this.setupScene(home, away, kits, cfg.night);
    const R = this.app.renderer, H = this.app.hud, I = this.app.input;
    if (cfg.camera) R.camMode = cfg.camera;
    const myTeam = humans[0]?.team ?? 0;
    return new Promise((resolve) => {
      let prev = m.snapshot(), cur = prev, acc = 0, last = performance.now();
      const hist = [];
      let replay = null, paused = false, done = false, endShown = false, halfShown = false, pauseModal = null;
      this.clock = 0; this.goalAt = -1;
      const resumeSync = () => { const inputs = humans.map(h => I.poll(h.slot, this.camYaw(1))); m.consumeTaps(inputs); };
      I.on('pause', () => {
        if (endShown) return;
        if (paused) { pauseModal?.close(); return; }
        paused = true;
        pauseModal = modal(`<h2>일시정지</h2><div class="col"><button class="btn primary" data-close>계속하기</button><button class="btn" id="pm-cam">카메라: ${CAM_NAMES[R.camMode]}</button><details><summary class="muted" style="cursor:pointer">조작법</summary>${CONTROLS_HTML}</details><button class="btn danger" id="pm-quit">경기 포기</button></div>`, { onClose: () => { paused = false; pauseModal = null; last = performance.now(); resumeSync(); } });
        pauseModal.el.querySelector('#pm-cam').onclick = (ev) => { this.cycleCamera(); ev.target.textContent = `카메라: ${CAM_NAMES[R.camMode]}`; };
        pauseModal.el.querySelector('#pm-quit').onclick = () => { pauseModal.close(); finish({ aborted: true }); };
      });
      I.on('camera', () => this.cycleCamera());
      I.on('skip', () => { if (replay) { replay = null; H.replay(false); resumeSync(); } });
      let quitting = false;
      I.on('quit', async () => {
        if (endShown || quitting) return;
        quitting = true; pauseModal?.close(); paused = true;
        const ok = await confirmBox(cfg.quitWarning || '경기에서 나가시겠습니까? 진행 상황은 저장되지 않습니다.', '나가기');
        quitting = false;
        if (ok) finish({ aborted: true }); else { paused = false; last = performance.now(); resumeSync(); }
      });
      const finish = (res) => {
        if (done) return; done = true;
        I.on('pause', null); I.on('camera', null); I.on('skip', null); I.on('quit', null);
        H.hide(); R.setMenuMode(true);
        resolve(res);
      };
      const loop = (now) => {
        if (done) return;
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
        if (!paused && !replay && !endShown) {
          acc += dt;
          let n = 0;
          while (acc >= STEP && n < 8) {
            const ad = m.dir(myTeam);
            const inputs = humans.map(h => I.poll(h.slot, this.camYaw(ad)));
            m.step(STEP, inputs);
            this.clock += STEP;
            prev = cur; cur = m.snapshot();
            hist.push(cur); if (hist.length > 600) hist.shift();
            for (const e of m.drainEvents()) this.handleEvent(e, cur);
            acc -= STEP; n++;
          }
          if (n === 8) acc = 0;
          // schedule goal replay
          if (this.goalAt >= 0 && this.clock - this.goalAt > 2.2 && cur.ph === 'goal') {
            const frames = hist.slice(-Math.min(hist.length, Math.round(60 * 6.4)));
            replay = { frames, pos: 0, speed: 0.62, angle: Math.random() * 0.8 - 0.4 };
            this.goalAt = -1; H.replay(true);
          }
          if (cur.ph === 'halftime' && !halfShown) {
            halfShown = true;
            const el = H.overlay(H.statsPanel('HALF TIME', m.result(), '', '<button class="btn primary" id="h-2nd">후반전 시작</button>'));
            el.querySelector('#h-2nd').onclick = () => { if (m.phase === 'halftime') m.startSecondHalf(); };
          }
          if (halfShown && cur.ph !== 'halftime' && cur.h === 2) { H.overlay(''); halfShown = 'done'; }
        }
        let snap;
        const ctx = { controlled: cur.c[0] ?? -1, controlled2: humans.length > 1 ? cur.c[1] : -1, attackDir: m.dir(myTeam), charge: cur.ch[0] || 0 };
        if (replay) {
          replay.pos += dt * 60 * replay.speed;
          const i = Math.floor(replay.pos);
          if (i >= replay.frames.length - 1) { replay = null; H.replay(false); resumeSync(); snap = cur; }
          else snap = lerpSnap(replay.frames[i], replay.frames[i + 1], replay.pos - i);
          ctx.replay = !!replay; ctx.replayAngle = replay?.angle; ctx.replaySide = Math.sign(cur.b[0]) || 1;
        } else snap = lerpSnap(prev, cur, acc / STEP);
        if (!replay && cur.ph === 'goal' && this.goalScorer >= 0) { ctx.cam = 'goal'; ctx.goalSide = Math.sign(cur.b[0]) || 1; ctx.focus = [snap.p[this.goalScorer * 7], snap.p[this.goalScorer * 7 + 1]]; }
        if (ctx.controlled >= 0) { const o = ctx.controlled * 7; ctx.controlledInfo = { name: H.pname(ctx.controlled), stamina: cur.p[o + 4] === 3 ? 1 : cur.p[o + 6] }; }
        ctx.mySetPiece = cur.sp && humans.some(h => h.team === cur.sp.tm) && cur.sp.tk === cur.c[0];
        ctx.defendingPen = cur.sp && cur.sp.ty === 'penalty' && cur.sp.tm !== myTeam;
        ctx.excite = this.excitement(snap, dt);
        R.renderFrame(dt, snap, ctx);
        H.update(snap, ctx, dt);
        if (m.finished && !endShown && cur.ph === 'fulltime' && !replay) {
          endShown = true;
          const res = m.result();
          setTimeout(() => {
            const el = H.overlay(H.statsPanel('FULL TIME', res, this.ratingsHtml(res, myTeam, cfg), '<button class="btn primary" id="h-cont">계속</button>'));
            el.querySelector('#h-cont').onclick = () => finish(res);
          }, 1800);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }

  ratingsHtml(res, team, cfg = {}) {
    const mine = res.ratings.filter(r => r.team === team).sort((a, b) => b.rating - a.rating);
    const motm = res.motm;
    const hl = cfg.highlightId;
    return `<div style="margin-top:12px"><div class="small muted" style="margin-bottom:6px">경기 MVP: <b class="gold">${esc(motm.name)}</b> (${motm.rating.toFixed(1)})</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;font-size:12.5px;max-height:150px;overflow:auto">${mine.map(r => `<div class="row" style="justify-content:space-between;${r.id === hl ? 'color:var(--accent);font-weight:700' : ''}"><span>${esc(r.pos)} ${esc(r.name)}${r.goals ? ` ⚽${r.goals > 1 ? '×' + r.goals : ''}` : ''}${r.assists ? ` 🅰${r.assists > 1 ? '×' + r.assists : ''}` : ''}</span><b>${r.rating.toFixed(1)}</b></div>`).join('')}</div></div>`;
  }

  // ---------------- online ----------------
  playOnline(socket, start) {
    this.online = true;
    const { home, away, you } = start;
    const kits = start.kits;
    this.setupScene(home, away, kits, true);
    const R = this.app.renderer, H = this.app.hud, I = this.app.input;
    const DELAY = 110;
    return new Promise((resolve) => {
      const buf = []; const hist = [];
      let done = false, last = performance.now(), sentAt = 0, lastSent = '', replay = null, endData = null, cur = null;
      const t0 = performance.now();
      this.clock = 0; this.goalAt = -1;
      H.say(`${start.names[0]} vs ${start.names[1]} — 곧 경기가 시작됩니다!`, 3.5);
      const onSnap = (s) => {
        const now = performance.now();
        buf.push({ t: now, s }); if (buf.length > 60) buf.shift();
        hist.push(s); if (hist.length > 180) hist.shift();
        cur = s;
        for (const e of s.ev || []) this.handleEvent(e, s);
      };
      const onEnd = (d) => { endData = d; };
      const onDisc = () => { if (!endData) endData = { error: '서버와의 연결이 끊어졌습니다.' }; };
      socket.on('snap', onSnap); socket.on('match:end', onEnd); socket.on('disconnect', onDisc);
      I.on('pause', () => {
        const pm = modal(`<h2>메뉴</h2><div class="col"><button class="btn primary" data-close>계속하기</button><button class="btn" id="pm-cam">카메라 변경</button><details><summary class="muted" style="cursor:pointer">조작법</summary>${CONTROLS_HTML}</details><button class="btn danger" id="pm-quit">기권하기</button></div><p class="small muted">온라인 경기는 일시정지되지 않습니다.</p>`);
        pm.el.querySelector('#pm-cam').onclick = () => this.cycleCamera();
        pm.el.querySelector('#pm-quit').onclick = () => { pm.close(); socket.emit('room:leave'); };
      });
      I.on('camera', () => this.cycleCamera());
      I.on('skip', () => { if (replay) { replay = null; H.replay(false); } });
      I.on('quit', async () => {
        if (endData) return;
        if (await confirmBox('경기에서 나가면 기권패로 처리됩니다. 나가시겠습니까?', '기권하고 나가기')) socket.emit('room:leave');
      });
      const finish = (res) => {
        if (done) return; done = true;
        socket.off('snap', onSnap); socket.off('match:end', onEnd); socket.off('disconnect', onDisc);
        I.on('pause', null); I.on('camera', null); I.on('skip', null); I.on('quit', null);
        H.hide(); R.setMenuMode(true);
        resolve(res);
      };
      let endShown = false;
      const loop = (now) => {
        if (done) return;
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
        this.clock += dt;
        // countdown
        const cd = 3.5 - (now - t0) / 1000;
        if (cd > 0 && !buf.length) H.overlay(`<div class="countdown">${Math.ceil(cd)}</div>`); else if (!endShown) H.overlay('');
        // inputs
        const half = cur?.h ?? 1;
        const attackDir = (you === 0 ? 1 : -1) * (half === 1 ? 1 : -1);
        const inp = I.poll(0, this.camYaw(attackDir));
        const key = JSON.stringify(inp);
        if (key !== lastSent || now - sentAt > 100) { if (now - sentAt > 30) { socket.emit('input', inp); lastSent = key; sentAt = now; } }
        // pick render snapshot
        let snap = null;
        const rt = now - DELAY;
        if (buf.length) {
          let i = buf.length - 1;
          while (i > 0 && buf[i - 1].t > rt) i--;
          if (i > 0 && buf[i].t >= rt) { const a = buf[i - 1], b = buf[i]; snap = lerpSnap(a.s, b.s, (rt - a.t) / Math.max(1, b.t - a.t)); }
          else snap = buf[buf.length - 1].s;
        }
        if (this.goalAt >= 0 && this.clock - this.goalAt > 2.0 && hist.length > 20) {
          replay = { frames: hist.slice(-Math.min(hist.length, 110)), pos: 0, speed: 0.75 }; this.goalAt = -1; H.replay(true);
        }
        const ctx = { controlled: snap ? snap.c[you] : -1, controlled2: -1, attackDir, charge: snap ? snap.ch[you] : 0 };
        if (replay && snap) {
          replay.pos += dt * 20 * replay.speed;
          const i = Math.floor(replay.pos);
          if (i >= replay.frames.length - 1 || snap.ph !== 'goal') { replay = null; H.replay(false); }
          else { snap = lerpSnap(replay.frames[i], replay.frames[i + 1], replay.pos - i); ctx.replay = true; ctx.replaySide = Math.sign(snap.b[0]) || 1; }
        }
        if (snap) {
          if (!ctx.replay && snap.ph === 'goal') { ctx.cam = 'goal'; ctx.goalSide = Math.sign(snap.b[0]) || 1; if (this.goalScorer >= 0) ctx.focus = [snap.p[this.goalScorer * 7], snap.p[this.goalScorer * 7 + 1]]; }
          if (ctx.controlled >= 0) { const o = ctx.controlled * 7; ctx.controlledInfo = { name: H.pname(ctx.controlled), stamina: snap.p[o + 4] === 3 ? 1 : snap.p[o + 6] }; }
          ctx.mySetPiece = snap.sp && snap.sp.tm === you && snap.sp.tk === snap.c[you];
          ctx.defendingPen = snap.sp && snap.sp.ty === 'penalty' && snap.sp.tm !== you;
          ctx.excite = this.excitement(snap, dt);
          R.renderFrame(dt, snap, ctx);
          H.update(snap, ctx, dt);
        } else R.renderFrame(dt, null, {});
        if (endData && !endShown) {
          endShown = true;
          if (endData.error) {
            H.overlay(`<div class="stats-ov"><h2>연결 종료</h2><p style="text-align:center">${esc(endData.error)}</p><div class="row" style="justify-content:center"><button class="btn primary" id="h-cont">로비로</button></div></div>`);
            H.root.querySelector('#h-cont').onclick = () => finish({ aborted: true });
          } else {
            const res = endData;
            const won = res.score[you] > res.score[1 - you], draw = res.score[0] === res.score[1];
            const title = res.forfeitBy !== null && res.forfeitBy !== undefined ? (res.forfeitBy === you ? '기권패' : '상대 기권 — 승리!') : won ? '승리!' : draw ? '무승부' : '패배';
            const extra = `<div style="text-align:center;margin-top:10px;font-size:18px">레이팅 <b class="${res.ratingDelta >= 0 ? 'accent' : 'danger'}">${res.ratingDelta >= 0 ? '+' : ''}${res.ratingDelta}</b>${res.user ? ` → ${res.user.rating}` : ''}</div>`;
            setTimeout(() => {
              const el = H.overlay(H.statsPanel(title, res, extra, '<button class="btn primary" id="h-cont">로비로</button>'));
              el.querySelector('#h-cont').onclick = () => finish(res);
            }, res.forfeitBy !== null && res.forfeitBy !== undefined ? 0 : 1500);
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }
}

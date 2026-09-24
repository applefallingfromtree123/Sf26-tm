// In-match HUD: scoreboard, clock, radar, controlled-player card, banners, commentary.
import { esc } from '../ui/dom.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const LINES = {
  kickoff: ['주심의 휘슬과 함께 경기가 시작됩니다!', '킥오프! 양 팀 모두 좋은 출발을 기대합니다.', '경기가 시작됐습니다. 관중들의 함성이 대단합니다!'],
  secondHalf: ['후반전이 시작됩니다!', '후반 킥오프! 승부는 지금부터입니다.'],
  goal: ['골! {p}! 골망을 흔듭니다!', '{p}의 환상적인 마무리! 골입니다!', '들어갑니다! {p}가 해냅니다!', '{p}! 키퍼가 손쓸 수 없는 슈팅이었습니다!', '고오오오올! {t}의 {p}!'],
  goalAssist: ['{a}의 패스를 받은 {p}, 골! 완벽한 호흡입니다!', '{a}의 어시스트, {p}의 마무리! 골입니다!'],
  ownGoal: ['아! 자책골입니다. {p}에게는 잊고 싶은 순간이겠네요.', '불운한 자책골! {p}의 발에 맞고 들어갑니다.'],
  save: ['{p}의 선방! 대단한 반사신경입니다!', '막아냅니다! {p}, 오늘 컨디션이 좋네요!', '{p}가 몸을 날려 막아냅니다!'],
  shotWide: ['아깝습니다! 골문을 살짝 벗어납니다.', '슈팅! 하지만 빗나갑니다.', '{p}의 슈팅, 크로스바 위로 넘어갑니다.'],
  post: ['골대를 맞힙니다! 아, 정말 아까웠어요!', '골대 강타! 운이 따르지 않네요.'],
  foul: ['{p}의 반칙입니다. 휘슬이 울립니다.', '주심이 {p}의 파울을 선언합니다.'],
  yellow: ['{p}에게 옐로카드가 주어집니다.', '경고! {p}, 조심해야겠네요.'],
  red: ['레드카드! {p}가 퇴장당합니다!', '다이렉트 퇴장! {p}, 팀에 큰 타격입니다.'],
  corner: ['코너킥을 얻어냅니다.', '{t}의 코너킥 찬스입니다.'],
  offside: ['오프사이드! 부심의 깃발이 올라갑니다.', '아, 오프사이드 트랩에 걸렸습니다.'],
  penalty: ['페널티킥! 주심이 페널티 스팟을 가리킵니다!', 'PK 선언! 결정적인 기회입니다!'],
  freekick: ['{t}가 좋은 위치에서 프리킥을 얻습니다.'],
  tackle: ['{p}의 깔끔한 태클!', '{p}가 공을 빼앗아냅니다!'],
  halftime: ['전반전이 종료됩니다.', '하프타임 휘슬이 울립니다.'],
  fulltime: ['경기 종료! 휘슬이 울립니다!', '모든 경기가 끝났습니다!'],
  addedTime: ['추가 시간은 {n}분입니다.'],
  skill: ['{p}의 화려한 개인기!', '{p}, 수비를 흔듭니다!'],
};
const fmt = (s, v) => s.replace(/\{(\w)\}/g, (_, k) => v[k] ?? '');

export class Hud {
  constructor(root) { this.root = root; this.commT = 0; this.bannerT = 0; }
  show(teams, kits, opts = {}) {
    this.teams = teams; this.kits = kits; this.opts = opts;
    const [h, a] = teams;
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="sb">
        <div class="tm"><span class="kit" style="background:${kits.home[0]}"></span>${esc(h.club.short)}</div>
        <div class="score" id="h-score">0 - 0</div>
        <div class="tm">${esc(a.club.short)}<span class="kit" style="background:${kits.away[0]}"></span></div>
        <div class="clock" id="h-clock">00:00</div>
        <div class="added hidden" id="h-added">+0</div>
      </div>
      ${opts.online ? '<div class="net-ind" id="h-net">ONLINE</div>' : ''}
      <canvas class="radar" id="h-radar" width="500" height="324"></canvas>
      <div class="pcard" id="h-pcard"><div class="nm" id="h-pname">-</div><div class="sub" id="h-psub"></div><div class="stam"><i id="h-stam"></i></div><div class="power hidden" id="h-power"><i id="h-powi"></i></div></div>
      <div class="comm" id="h-comm" style="opacity:0"></div>
      <div class="hint hidden" id="h-hint"></div>
      <div id="h-banner"></div>
      <div id="h-card"></div>
      <div class="replay-tag hidden" id="h-replay">REPLAY</div>
      <div id="h-over"></div>`;
    this.$ = (id) => this.root.querySelector('#' + id);
    this.radar = this.$('h-radar').getContext('2d');
  }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; }

  update(snap, ctx, dt) {
    if (!snap || !this.$) return;
    this.$('h-score').textContent = `${snap.sc[0]} - ${snap.sc[1]}`;
    const t = snap.t, mm = Math.floor(t / 60), ss = t % 60;
    this.$('h-clock').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const add = this.$('h-added');
    if (snap.add) { add.classList.remove('hidden'); add.textContent = `+${snap.add}`; } else add.classList.add('hidden');
    // player card
    const ci = ctx.controlled;
    this.$('h-pcard').classList.toggle('hidden', !(ci >= 0));
    if (ci >= 0) {
      const team = ci < 11 ? 0 : 1, info = this.teams[team].xi[ci % 11];
      const name = info.name;
      if (this.lastPc !== ci) { this.$('h-pname').textContent = `${info.num}  ${name}`; this.$('h-psub').textContent = `${this.teams[team].slots[ci % 11].pos} · OVR ${info.ovr}`; this.lastPc = ci; }
      const st = snap.p[ci * 7 + 4] === 3 ? 1 : snap.p[ci * 7 + 6];
      this.$('h-stam').style.width = `${Math.round(Math.max(0, Math.min(1, st)) * 100)}%`;
    }
    const ch = ctx.charge || 0;
    const pw = this.$('h-power');
    if (ch > 0) { pw.classList.remove('hidden'); this.$('h-powi').style.width = `${Math.min(100, ch / 1.15 * 100)}%`; } else pw.classList.add('hidden');
    // hint
    const hint = this.$('h-hint');
    if (snap.sp && snap.sp.w && ctx.mySetPiece) {
      const m = { kickoff: '킥오프 — J 패스', throwin: '스로인 — J 짧게 · I 길게', corner: '코너킥 — I 크로스 · J 짧은 패스', goalkick: '골킥 — J 짧게 · I 길게', freekick: '프리킥 — K 슛(길게 눌러 파워, E 감아차기) · J 패스 · I 로빙', penalty: '페널티킥 — 방향 + K 슛' }[snap.sp.ty];
      hint.textContent = m || ''; hint.classList.toggle('hidden', !m);
    } else if (snap.sp && snap.sp.ty === 'penalty' && ctx.defendingPen) { hint.textContent = '페널티 방어 — 방향키로 다이빙 방향 선택'; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
    // radar
    this.drawRadar(snap, ctx);
    // commentary fade
    if (this.commT > 0) { this.commT -= dt; if (this.commT <= 0) this.$('h-comm').style.opacity = 0; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.$('h-banner').innerHTML = ''; }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.$('h-card').innerHTML = ''; }
  }
  drawRadar(snap, ctx) {
    const g = this.radar, W = 500, H = 324;
    g.clearRect(0, 0, W, H);
    const X = (x) => (x + 52.5) / 105 * W, Z = (z) => (z + 34) / 68 * H;
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 9.15 / 105 * W, 0, Math.PI * 2); g.stroke();
    g.strokeRect(0, Z(-20.16), 16.5 / 105 * W, (40.32 / 68) * H); g.strokeRect(W - 16.5 / 105 * W, Z(-20.16), 16.5 / 105 * W, (40.32 / 68) * H);
    const P = snap.p;
    for (let i = 0; i < 22; i++) {
      const o = i * 7; if (P[o + 4] === -1) continue;
      const team = i < 11 ? 0 : 1;
      g.fillStyle = team ? this.kits.away[0] : this.kits.home[0];
      g.beginPath(); g.arc(X(P[o]), Z(P[o + 1]), 8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.stroke();
      if (i === ctx.controlled) { g.strokeStyle = '#00ffa3'; g.lineWidth = 4; g.beginPath(); g.arc(X(P[o]), Z(P[o + 1]), 13, 0, Math.PI * 2); g.stroke(); }
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(snap.b[0]), Z(snap.b[2]), 6, 0, Math.PI * 2); g.fill();
  }
  say(text, secs = 3.5) { const el = this.$('h-comm'); if (!el) return; el.textContent = text; el.style.opacity = 1; this.commT = secs; }
  banner(main, sub = '', secs = 3) { const el = this.$('h-banner'); if (!el) return; el.innerHTML = `<div class="banner"><div class="b-main">${esc(main)}</div>${sub ? `<div class="b-sub">${esc(sub)}</div>` : ''}</div>`; this.bannerT = secs; }
  cardFlash(color, name) { const el = this.$('h-card'); el.innerHTML = `<div class="cardflash"><div class="cd" style="background:${color === 'red' ? '#ff2d3d' : '#ffd400'}"></div><div>${esc(name)}</div></div>`; this.cardT = 4; }
  replay(on) { const el = this.$('h-replay'); if (el) el.classList.toggle('hidden', !on); }
  pname(i) { if (i < 0) return ''; const t = i < 11 ? 0 : 1; return this.teams[t].xi[i % 11]?.name || ''; }
  tname(t) { return this.teams[t]?.club.name || ''; }

  // process an engine event; returns excitement hint
  onEvent(e, snap) {
    const p = this.pname(e.p ?? -1);
    switch (e.type) {
      case 'whistle': if (e.kind === 'kickoff') this.say(pick((snap?.h === 2 && snap.t <= 2702) ? LINES.secondHalf : LINES.kickoff)); break;
      case 'goal': {
        const a = e.assist >= 0 ? this.pname(e.assist) : '';
        this.banner('GOAL!', `${e.own ? '(자책) ' : ''}${p}  ${e.min}'`, 4);
        this.say(fmt(pick(e.own ? LINES.ownGoal : a ? LINES.goalAssist : LINES.goal), { p, a, t: this.tname(e.team) }), 5);
        break;
      }
      case 'save': this.say(fmt(pick(LINES.save), { p })); break;
      case 'post': this.say(pick(LINES.post)); break;
      case 'foul': this.say(fmt(pick(LINES.foul), { p })); break;
      case 'card': this.cardFlash(e.color, p); this.say(fmt(pick(e.color === 'red' ? LINES.red : LINES.yellow), { p })); break;
      case 'corner': this.say(fmt(pick(LINES.corner), { t: this.tname(e.team) })); break;
      case 'offside': this.say(pick(LINES.offside)); break;
      case 'penalty': this.banner('PENALTY', '', 2.5); this.say(pick(LINES.penalty)); break;
      case 'freekick': if (e.direct && e.dist < 32) this.say(fmt(pick(LINES.freekick), { t: this.tname(e.team) })); break;
      case 'addedTime': this.say(fmt(pick(LINES.addedTime), { n: e.min })); break;
      case 'halftime': this.banner('HALF TIME', `${snap?.sc?.[0] ?? ''} - ${snap?.sc?.[1] ?? ''}`, 3); this.say(pick(LINES.halftime)); break;
      case 'fulltime': this.banner('FULL TIME', `${snap?.sc?.[0] ?? ''} - ${snap?.sc?.[1] ?? ''}`, 3); this.say(pick(LINES.fulltime)); break;
      case 'skill': if (Math.random() < 0.3) this.say(fmt(pick(LINES.skill), { p }), 2); break;
      case 'tackle': if (Math.random() < 0.15) this.say(fmt(pick(LINES.tackle), { p }), 2); break;
      case 'shot': if (!e.onTarget && Math.random() < 0.6) setTimeout(() => this.say(fmt(pick(LINES.shotWide), { p })), 700); break;
    }
  }

  statsPanel(title, res, extraHtml = '', buttons = '') {
    const s = res.stats;
    const row = (label, a, b, pct = false) => {
      const tot = (a + b) || 1;
      return `<div class="st-row"><div class="l">${a}${pct ? '%' : ''}</div><div class="mid">${label}<div class="st-bar"><i style="width:${a / tot * 100}%;background:${this.kits.home[0]}"></i><i style="width:${b / tot * 100}%;background:${this.kits.away[0]}"></i></div></div><div class="r">${b}${pct ? '%' : ''}</div></div>`;
    };
    const sc = res.scorers || [];
    const scorers = (t) => sc.filter(x => x.team === t).map(x => `${esc(x.name)} ${x.min}'${x.own ? ' (OG)' : ''}`).join(', ');
    return `<div class="stats-ov"><h2>${esc(title)}</h2>
      <div style="text-align:center;font-family:var(--display);font-size:42px;font-weight:700;margin:4px 0 2px">${esc(this.teams[0].club.short)} ${res.score[0]} - ${res.score[1]} ${esc(this.teams[1].club.short)}</div>
      <div class="row small muted" style="justify-content:space-between;margin-bottom:8px"><span>${scorers(0)}</span><span>${scorers(1)}</span></div>
      ${row('점유율', s[0].possPct, s[1].possPct, true)}${row('슈팅', s[0].shots, s[1].shots)}${row('유효 슈팅', s[0].sot, s[1].sot)}${row('패스 성공', s[0].passOk, s[1].passOk)}${row('태클', s[0].tackles, s[1].tackles)}${row('파울', s[0].fouls, s[1].fouls)}${row('코너킥', s[0].corners, s[1].corners)}${row('오프사이드', s[0].offsides, s[1].offsides)}${row('경고', s[0].yellow, s[1].yellow)}
      ${extraHtml}
      <div class="row" style="justify-content:center;margin-top:14px">${buttons}</div></div>`;
  }
  overlay(html) { const el = this.$('h-over'); if (el) el.innerHTML = html; return el; }
}

// Main menu, kick-off setup, settings and account screens + shared team picker.
import { LEAGUES, CLUB_BY_ID, ALL_CLUBS } from '/shared/data/leagues.js';
import { generateSquad, teamRating, buildTeam, kitColors } from '/shared/squad.js';
import { esc, toast, crest, stars, modal } from './dom.js';
import { CONTROLS_HTML } from '../game/input.js';

const ratingCache = new Map();
export function clubOvr(id) { if (!ratingCache.has(id)) ratingCache.set(id, teamRating(generateSquad(id))); return ratingCache.get(id); }
export const DIFFS = ['아마추어', '세미프로', '프로페셔널', '월드클래스', '레전드'];

export function teamPicker(el, { value, onChange, leagues = LEAGUES, maxOvr = 99 }) {
  let league = CLUB_BY_ID[value]?.league || leagues[0].id;
  let sel = value;
  const render = () => {
    const lg = leagues.find(l => l.id === league) || leagues[0];
    el.innerHTML = `<div class="picker">
      <div class="lg-tabs">${leagues.map(l => `<div class="lg-tab ${l.id === lg.id ? 'on' : ''}" data-lg="${l.id}">${esc(l.name)}</div>`).join('')}</div>
      <div class="club-grid">${lg.clubs.map(c => { const o = clubOvr(c.id); const dis = o > maxOvr; return `<div class="club ${c.id === sel ? 'on' : ''}" data-id="${c.id}" style="${dis ? 'opacity:.35;pointer-events:none' : ''}">${crest(c)}<span class="nm">${esc(c.name)}</span><span class="ov">${o}</span></div>`; }).join('')}</div></div>`;
    el.querySelectorAll('[data-lg]').forEach(t => t.onclick = () => { league = t.dataset.lg; render(); });
    el.querySelectorAll('[data-id]').forEach(t => t.onclick = () => { sel = t.dataset.id; render(); onChange && onChange(sel); });
  };
  render();
  return { set(id) { sel = id; league = CLUB_BY_ID[id]?.league || league; render(); }, get: () => sel };
}
export function clubCard(id) {
  const c = CLUB_BY_ID[id]; if (!c) return '';
  const o = clubOvr(id);
  return `<div class="sel-card">${crest(c, 'lg')}<div><div style="font-family:var(--display);font-size:26px;font-weight:700">${esc(c.name)}</div><div class="muted small">${esc(c.leagueName)} · ${esc(c.stadium)}</div><div>${stars(o)} <span class="ovr gold">${o}</span></div></div></div>`;
}

export function acctBadge(app) {
  const u = app.api.user;
  if (!u) return `<button class="btn sm" data-go="account">로그인 / 회원가입</button>`;
  return `<div class="acct" data-go="account" style="cursor:pointer"><div class="avatar">${esc((u.nickname || u.username)[0].toUpperCase())}</div><div><div style="font-weight:700">${esc(u.nickname || u.username)}</div><div class="small muted">레이팅 ${u.rating} · ${u.wins}승 ${u.draws}무 ${u.losses}패</div></div></div>`;
}
export function bindGo(app, root) { root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => app.go(b.dataset.go))); }

// ---------------- main menu ----------------
export function mainMenu(app) {
  const root = app.show(`<div class="screen">
    <div class="topbar"><div class="logo">SF<span>2027</span></div>${acctBadge(app)}</div>
    <div class="menu-wrap">
      <div class="menu-tiles">
        <div class="tile big" data-go="kickoff"><div class="t-ico">⚽</div><div class="t-name">킥오프</div><div class="t-desc">전 세계 ${ALL_CLUBS.length}개 클럽으로 바로 한 판! 90분 경기 · 실제 플레이 12분</div></div>
        <div class="tile" data-go="online"><div class="t-ico">🌐</div><div class="t-name">온라인</div><div class="t-desc">실시간 1:1 매치메이킹 · 친선방 · 랭킹</div></div>
        <div class="tile" data-go="career"><div class="t-ico">📋</div><div class="t-name">감독 커리어</div><div class="t-desc">팀을 맡아 리그 우승에 도전. 이적시장 · 전술 · 시즌 진행</div></div>
        <div class="tile" data-go="pcareer"><div class="t-ico">🏃</div><div class="t-name">선수 커리어</div><div class="t-desc">나만의 선수를 만들어 월드클래스로 성장</div></div>
        <div class="tile" data-go="settings"><div class="t-ico">⚙️</div><div class="t-name">설정</div><div class="t-desc">조작법 · 그래픽 · 사운드 · 카메라</div></div>
      </div>
      <div class="spacer"></div>
      <div class="panel" style="width:330px;align-self:flex-end">
        <h3>조작 요약</h3>
        <div class="small" style="line-height:1.9"><b>WASD</b> 이동 · <b>Shift</b> 스프린트<br><b>J</b> 패스/태클 · <b>K</b> 슛/슬라이딩<br><b>L</b> 스루패스 · <b>I</b> 로빙/크로스<br><b>E+K</b> 감아차기 · <b>F</b> 개인기 · <b>Q</b> 선수변경<br><b>C</b> 카메라 · <b>Esc</b> 일시정지</div>
        <p class="small muted" style="margin-bottom:0">게임패드도 지원합니다 (Xbox/PS 표준 배치).</p>
      </div>
    </div></div>`);
  bindGo(app, root);
}

// ---------------- kick-off ----------------
export function kickoffSetup(app, pre = {}) {
  const st = { home: pre.home || 'rma', away: pre.away || 'bar', side: pre.side ?? 0, p2: -1, diff: app.settings.difficulty, night: app.settings.night };
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">킥오프</h1><p class="subtitle">팀을 고르고 경기를 시작하세요 · 90분 경기가 실제 12분 동안 진행됩니다</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
    <div class="grid2" style="flex:1;min-height:0">
      <div class="panel col"><div class="row"><h3 style="margin:0">홈</h3><span class="spacer"></span><button class="btn sm" id="rh">🎲 랜덤</button></div><div id="hcard"></div><div id="hpick"></div></div>
      <div class="panel col"><div class="row"><h3 style="margin:0">원정</h3><span class="spacer"></span><button class="btn sm" id="ra">🎲 랜덤</button></div><div id="acard"></div><div id="apick"></div></div>
    </div>
    <div class="panel row" style="margin-top:16px">
      <label class="fld">P1 (키보드/패드1)<select class="inp" id="side"><option value="0">홈 팀 조작</option><option value="1">원정 팀 조작</option><option value="-1">관전 (CPU vs CPU)</option></select></label>
      <label class="fld">P2 (게임패드 2)<select class="inp" id="p2"><option value="-1">없음</option><option value="0">홈 팀</option><option value="1">원정 팀</option></select></label>
      <label class="fld">난이도<select class="inp" id="diff">${DIFFS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
      <label class="fld">시간대<select class="inp" id="night"><option value="1">야간 (조명)</option><option value="0">주간</option></select></label>
      <span class="spacer"></span>
      <button class="btn primary" id="go" style="font-size:20px;padding:14px 34px">킥오프!</button>
    </div></div>`);
  bindGo(app, root);
  const upd = () => { root.querySelector('#hcard').innerHTML = clubCard(st.home); root.querySelector('#acard').innerHTML = clubCard(st.away); };
  const hp = teamPicker(root.querySelector('#hpick'), { value: st.home, onChange: (id) => { st.home = id; upd(); } });
  const ap = teamPicker(root.querySelector('#apick'), { value: st.away, onChange: (id) => { st.away = id; upd(); } });
  const rnd = () => { const top = ALL_CLUBS.filter(c => clubOvr(c.id) >= 72); return top[Math.floor(Math.random() * top.length)].id; };
  root.querySelector('#rh').onclick = () => { st.home = rnd(); hp.set(st.home); upd(); };
  root.querySelector('#ra').onclick = () => { st.away = rnd(); ap.set(st.away); upd(); };
  root.querySelector('#side').value = String(st.side);
  root.querySelector('#diff').value = String(st.diff);
  root.querySelector('#night').value = st.night ? '1' : '0';
  upd();
  root.querySelector('#go').onclick = async () => {
    st.side = +root.querySelector('#side').value; st.p2 = +root.querySelector('#p2').value; st.diff = +root.querySelector('#diff').value; st.night = root.querySelector('#night').value === '1';
    if (st.home === st.away) return toast('서로 다른 팀을 선택하세요.', true);
    if (st.p2 >= 0 && app.input.padCount() < 2) toast('두 번째 게임패드가 감지되지 않았습니다. 버튼을 한 번 눌러 연결하세요.', true);
    app.settings.difficulty = st.diff; app.settings.night = st.night; app.saveSettings();
    const home = buildTeam(st.home), away = buildTeam(st.away);
    const kits = kitColors(home.club, away.club);
    const humans = [];
    if (st.side >= 0) humans.push({ slot: 0, team: st.side });
    if (st.p2 >= 0) humans.push({ slot: 1, team: st.p2 });
    const res = await app.playMatch({ home, away, kits, difficulty: st.diff, humans, night: st.night });
    kickoffSetup(app, { home: st.home, away: st.away, side: st.side });
    if (res && !res.aborted) toast(`경기 종료: ${home.club.short} ${res.score[0]} - ${res.score[1]} ${away.club.short}`);
  };
}

// ---------------- settings ----------------
export function settingsScreen(app) {
  const s = app.settings;
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">설정</h1></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
    <div class="grid2">
      <div class="panel col">
        <h3>게임</h3>
        <label class="fld">기본 카메라<select class="inp" id="cam"><option value="broadcast">방송 카메라</option><option value="close">근접 카메라</option><option value="pro">선수 시점 (프로)</option></select></label>
        <label class="fld">기본 난이도<select class="inp" id="diff">${DIFFS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
        <label class="fld">마스터 볼륨 <input type="range" min="0" max="1" step="0.05" id="vol"></label>
        <h3 style="margin-top:10px">그래픽</h3>
        <label class="fld">품질 (재시작 필요)<select class="inp" id="q"><option value="1">높음 (4K 잔디 텍스처, 풀 관중)</option><option value="0">보통 (저사양 PC)</option></select></label>
        <label class="row small"><input type="checkbox" id="sh"> 실시간 그림자 (재시작 필요)</label>
        <div class="row"><button class="btn primary" id="save">저장</button><button class="btn" id="reload">저장 후 재시작</button></div>
      </div>
      <div class="panel"><h3>조작법</h3>${CONTROLS_HTML}</div>
    </div></div>`);
  bindGo(app, root);
  root.querySelector('#cam').value = s.camera; root.querySelector('#diff').value = String(s.difficulty); root.querySelector('#vol').value = s.volume;
  root.querySelector('#q').value = String(s.quality); root.querySelector('#sh').checked = s.shadows;
  const apply = () => { s.camera = root.querySelector('#cam').value; s.difficulty = +root.querySelector('#diff').value; s.volume = +root.querySelector('#vol').value; s.quality = +root.querySelector('#q').value; s.shadows = root.querySelector('#sh').checked; app.saveSettings(); };
  root.querySelector('#vol').oninput = () => { app.audio.ensure(); app.audio.setVolume(+root.querySelector('#vol').value); };
  root.querySelector('#save').onclick = () => { apply(); toast('설정이 저장되었습니다.'); };
  root.querySelector('#reload').onclick = () => { apply(); location.reload(); };
}

// ---------------- account ----------------
export async function accountScreen(app) {
  const u = app.api.user;
  if (!u) {
    const root = app.show(`<div class="screen dim">
      <div class="topbar"><div><h1 class="title">계정</h1><p class="subtitle">계정을 만들면 온라인 대전, 랭킹, 클라우드 저장을 사용할 수 있습니다.</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
      <div class="grid2" style="max-width:900px">
        <form class="panel col" id="lf"><h3>로그인</h3>
          <input class="inp" name="u" placeholder="아이디" autocomplete="username" required>
          <input class="inp" name="p" type="password" placeholder="비밀번호" autocomplete="current-password" required>
          <button class="btn primary">로그인</button></form>
        <form class="panel col" id="rf"><h3>회원가입</h3>
          <input class="inp" name="u" placeholder="아이디 (영문/숫자 3~20자)" autocomplete="username" required pattern="[A-Za-z0-9_]{3,20}">
          <input class="inp" name="n" placeholder="닉네임 (선택)" maxlength="16">
          <input class="inp" name="p" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="new-password" required minlength="6">
          <input class="inp" name="p2" type="password" placeholder="비밀번호 확인" autocomplete="new-password" required minlength="6">
          <button class="btn purple">계정 만들기</button></form>
      </div></div>`);
    bindGo(app, root);
    root.querySelector('#lf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { await app.api.login(f.u.value.trim(), f.p.value); toast('환영합니다!'); app.go('main'); } catch (err) { toast(err.message, true); }
    };
    root.querySelector('#rf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      if (f.p.value !== f.p2.value) return toast('비밀번호가 일치하지 않습니다.', true);
      try { await app.api.register(f.u.value.trim(), f.p.value, f.n.value.trim()); toast('계정이 생성되었습니다!'); app.go('main'); } catch (err) { toast(err.message, true); }
    };
    return;
  }
  await app.api.refresh();
  const me = app.api.user || u;
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">내 계정</h1></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
    <div class="grid2">
      <div class="panel col">
        <div class="row"><div class="avatar" style="width:64px;height:64px;font-size:28px">${esc((me.nickname || me.username)[0].toUpperCase())}</div><div><div style="font-size:24px;font-weight:900">${esc(me.nickname)}</div><div class="muted">@${esc(me.username)}</div></div></div>
        <div class="grid3" style="gap:8px"><div class="panel" style="text-align:center"><div class="big-num accent">${me.rating}</div><div class="small muted">레이팅</div></div><div class="panel" style="text-align:center"><div class="big-num">${me.wins}-${me.draws}-${me.losses}</div><div class="small muted">승-무-패</div></div><div class="panel" style="text-align:center"><div class="big-num">${me.gf}:${me.ga}</div><div class="small muted">득:실</div></div></div>
        <label class="fld">닉네임<div class="row"><input class="inp grow" id="nick" maxlength="16" value="${esc(me.nickname)}"><button class="btn" id="savenick">변경</button></div></label>
        <button class="btn danger" id="logout">로그아웃</button>
      </div>
      <div class="panel"><h3>온라인 랭킹 TOP 50</h3><div class="scroll" style="max-height:60vh" id="lb">불러오는 중...</div></div>
    </div></div>`);
  bindGo(app, root);
  root.querySelector('#logout').onclick = () => { app.api.logout(); toast('로그아웃되었습니다.'); app.go('main'); };
  root.querySelector('#savenick').onclick = async () => { try { await app.api.updateMe({ nickname: root.querySelector('#nick').value }); toast('닉네임이 변경되었습니다.'); accountScreen(app); } catch (e) { toast(e.message, true); } };
  leaderboardInto(app, root.querySelector('#lb'));
}
export async function leaderboardInto(app, el) {
  try {
    const users = await app.api.leaderboard();
    el.innerHTML = `<table class="tbl"><tr><th>#</th><th>플레이어</th><th class="num">레이팅</th><th class="num">전적</th></tr>${users.map((x, i) => `<tr class="${app.api.user?.username === x.username ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.nickname || x.username)}</td><td class="num ovr">${x.rating}</td><td class="num">${x.wins}-${x.draws}-${x.losses}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">아직 기록이 없습니다.</td></tr>'}</table>`;
  } catch (e) { el.textContent = '랭킹을 불러올 수 없습니다.'; }
}
export function showControls() { modal(`<h2>조작법</h2>${CONTROLS_HTML}<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>닫기</button></div>`); }

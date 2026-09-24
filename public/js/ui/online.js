// Online lobby: matchmaking, private rooms, leaderboard.
import { kitColors } from '/shared/squad.js';
import { esc, toast } from './dom.js';
import { teamPicker, clubCard, bindGo, leaderboardInto, acctBadge } from './menus.js';
import { LS } from '../api.js';

let socket = null;
function loadSocketIo() {
  if (window.io) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/socket.io/socket.io.min.js'; s.onload = res; s.onerror = () => rej(new Error('온라인 서버에 연결할 수 없습니다.'));
    document.head.appendChild(s);
  });
}
async function connect(app) {
  await loadSocketIo();
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = window.io({ auth: { token: app.api.token }, transports: ['websocket', 'polling'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('서버 연결 시간 초과')), 8000);
    socket.once('connect', () => { clearTimeout(t); res(); });
    socket.once('connect_error', (e) => { clearTimeout(t); rej(new Error(e.message === 'unauthorized' ? '다시 로그인해주세요.' : '서버 연결 실패')); });
  });
  return socket;
}

export async function onlineLobby(app) {
  if (!app.api.loggedIn) {
    const root = app.show(`<div class="screen dim"><div class="topbar"><div><h1 class="title">온라인</h1><p class="subtitle">온라인 대전은 계정이 필요합니다.</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
      <div class="panel col" style="max-width:520px"><p class="lead">로그인하고 전 세계 플레이어와 실시간 1:1 대결을 펼치세요! 승리하면 레이팅이 오르고 랭킹에 이름을 올릴 수 있습니다.</p><button class="btn primary" data-go="account">로그인 / 회원가입</button></div></div>`);
    bindGo(app, root); return;
  }
  const st = { club: LS.get('sf_online_club', 'rma'), status: 'idle', code: null };
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">온라인 대전</h1><p class="subtitle" id="lobbyinfo">서버에 연결 중...</p></div><div class="row">${acctBadge(app)}<button class="btn ghost" data-go="main">← 메인 메뉴</button></div></div>
    <div class="grid2" style="flex:1;min-height:0">
      <div class="panel col"><h3>내 클럽 선택</h3><div id="card"></div><div id="pick"></div></div>
      <div class="col">
        <div class="panel col">
          <h3>대전 찾기</h3>
          <div id="status" class="lead muted">클럽을 고르고 매치를 찾으세요.</div>
          <div class="row"><button class="btn primary" id="quick">⚡ 빠른 대전</button><button class="btn" id="create">🔒 친선방 만들기</button><button class="btn danger hidden" id="cancel">취소</button></div>
          <div class="row"><input class="inp" id="code" placeholder="방 코드" maxlength="5" style="width:140px;text-transform:uppercase"><button class="btn" id="join">코드로 참가</button></div>
          <p class="small muted" style="margin:0">서버 권한 방식으로 경기가 진행됩니다 (Render 서버). 연결이 끊기면 기권패 처리됩니다.</p>
        </div>
        <div class="panel" style="flex:1;min-height:0"><h3>랭킹</h3><div class="scroll" style="max-height:34vh" id="lb">불러오는 중...</div></div>
      </div>
    </div></div>`);
  bindGo(app, root);
  root.querySelector('#card').innerHTML = clubCard(st.club);
  teamPicker(root.querySelector('#pick'), { value: st.club, onChange: (id) => { st.club = id; LS.set('sf_online_club', id); root.querySelector('#card').innerHTML = clubCard(id); } });
  leaderboardInto(app, root.querySelector('#lb'));
  const status = (html, busy) => { root.querySelector('#status').innerHTML = html; root.querySelector('#cancel').classList.toggle('hidden', !busy); root.querySelector('#quick').disabled = busy; root.querySelector('#create').disabled = busy; root.querySelector('#join').disabled = busy; };
  let s;
  try { s = await connect(app); } catch (e) { root.querySelector('#lobbyinfo').textContent = e.message; toast(e.message, true); return; }
  const onLobby = (d) => { const el = document.getElementById('lobbyinfo'); if (el) el.textContent = `접속자 ${d.online}명 · 대기열 ${d.queue}명 · 진행 중인 경기 ${d.matches}`; };
  const onWaiting = () => status('<span class="accent">상대를 찾는 중...</span> ⏳', true);
  const onCreated = ({ code }) => status(`방 코드: <b class="accent" style="font-size:28px;letter-spacing:4px">${esc(code)}</b><br><span class="small">친구에게 코드를 알려주세요. 상대가 입장하면 경기가 시작됩니다.</span>`, true);
  const onErr = ({ message }) => { toast(message, true); status('다시 시도하세요.', false); };
  const cleanup = () => { s.off('lobby', onLobby); s.off('queue:waiting', onWaiting); s.off('room:created', onCreated); s.off('room:error', onErr); s.off('match:start', onStart); };
  const onStart = async (start) => {
    cleanup();
    const home = start.home, away = start.away;
    start.kits = kitColors(home.club, away.club);
    const res = await app.playOnline(s, start);
    if (res && res.user) { app.api.user = res.user; LS.set('sf_user', res.user); }
    onlineLobby(app);
  };
  s.on('lobby', onLobby); s.on('queue:waiting', onWaiting); s.on('room:created', onCreated); s.on('room:error', onErr); s.on('match:start', onStart);
  root.querySelector('#quick').onclick = () => { s.emit('queue:join', { clubId: st.club }); onWaiting(); };
  root.querySelector('#create').onclick = () => s.emit('room:create', { clubId: st.club });
  root.querySelector('#join').onclick = () => { const code = root.querySelector('#code').value.trim().toUpperCase(); if (code.length < 5) return toast('5자리 코드를 입력하세요.', true); s.emit('room:join', { code, clubId: st.club }); };
  root.querySelector('#cancel').onclick = () => { s.emit('queue:leave'); s.emit('room:leave'); status('취소되었습니다.', false); };
  // leaving the screen
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { cleanup(); s.emit('queue:leave'); s.emit('room:leave'); }));
}

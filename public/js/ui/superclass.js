// SUPER CLASS mode: FC-Online-style card collecting. Open packs, build a squad from
// cards, play local challenges or online, level up to unlock better packs.
import { CLUB_BY_ID } from '/shared/data/leagues.js';
import { buildTeam, kitColors, FORMATIONS, FORMATION_NAMES, fitRating } from '/shared/squad.js';
import { PACKS, MATCH_TYPES, BANDS, TIERS, LADDER_STAGES, MAX_LEVEL, KIT_COLORS, DAILY_PACK, PACK_BY_ID, xpToNext, tierOf, sellValue, localReward, strengthMult, ladderBonus } from '/shared/superclass.js';
import { esc, toast, modal, confirmBox, textOn } from './dom.js';
import { teamPicker, clubCard, clubOvr, DIFFS, bindGo } from './menus.js';
import { connect } from './online.js';
import { LS } from '../api.js';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
let state = null; // server state

async function api(app, method, path, body) { return app.api.req(method, path, body); }
async function refresh(app) { state = (await api(app, 'GET', '/api/sc')).sc; return state; }

// ---------- card rendering ----------
export function cardHtml(c, opts = {}) {
  const t = tierOf(c);
  const club = CLUB_BY_ID[c.club];
  const a = c.attrs || {};
  const gk = c.pos === 'GK';
  const L = gk ? ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const vals = [a.pac, a.sho, a.pas, a.dri, a.def, a.phy];
  return `<div class="sc-card t-${t}${opts.sel ? ' sel' : ''}${opts.small ? ' small' : ''}" ${opts.attr || ''}>
    <div class="scc-top"><div class="scc-ovr">${c.ovr}</div><div class="scc-pos">${esc(c.pos)}</div>${t === 'sc' ? '<div class="scc-badge">SC</div>' : ''}</div>
    <div class="scc-face">${esc((c.name || '?').split(' ').map(w => w[0]).slice(0, 2).join(''))}</div>
    <div class="scc-name">${esc(shortName(c.name))}</div>
    ${opts.small ? '' : `<div class="scc-stats">${L.map((l, i) => `<span><b>${vals[i] ?? '-'}</b>${l}</span>`).join('')}</div>`}
    <div class="scc-foot"><span>${esc(c.nat || '')}</span><span>${esc(club?.short || '')}</span></div>
    ${opts.dup ? '<div class="scc-dup">중복</div>' : ''}
  </div>`;
}
const shortName = (n = '') => { const p = n.split(' '); return p.length > 1 && n.length > 13 ? p.slice(-1)[0] : n; };

function header(app) {
  const s = state, c = s.club;
  const need = xpToNext(s.level);
  return `<div class="topbar">
    <div class="row">
      <div class="crest lg" style="background:linear-gradient(135deg, ${c.c1} 0 55%, ${c.c2} 55%);color:${textOn(c.c1)}">${esc(c.short)}</div>
      <div>
        <div class="row" style="gap:10px"><h1 class="title sc-title">${esc(c.name)}</h1><span class="sc-lv">Lv.${s.level}</span></div>
        <div class="sc-xpbar" title="${fmt(s.xp)} / ${fmt(need)} XP"><i style="width:${s.level >= MAX_LEVEL ? 100 : Math.min(100, s.xp / need * 100)}%"></i></div>
        <div class="subtitle">팀 OVR <b class="gold">${s.teamOvr}</b> · 🪙 <b class="accent">${fmt(s.coins)}</b> · 랭크 포인트 ${fmt(s.rp)} · ${s.level >= MAX_LEVEL ? '최고 레벨' : `다음 레벨까지 ${fmt(need - s.xp)} XP`}</div>
      </div>
    </div>
    <button class="btn ghost" data-go="main">← 메인 메뉴</button>
  </div>`;
}

// ---------- entry ----------
export async function superClassEntry(app, tab = 'play') {
  if (!app.api.loggedIn) {
    const root = app.show(`<div class="screen dim"><div class="topbar"><div><h1 class="title sc-title">SUPER CLASS</h1><p class="subtitle">카드를 모으고, 나만의 드림팀을 만들고, 온라인에서 겨루세요.</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
      <div class="panel col" style="max-width:560px"><p class="lead">SUPER CLASS는 카드·코인·레벨이 계정에 저장되는 모드라 <b>로그인</b>이 필요합니다.</p><button class="btn primary" data-go="account">로그인 / 회원가입</button></div></div>`);
    bindGo(app, root); return;
  }
  try { await refresh(app); } catch (e) { toast(e.message, true); app.go('main'); return; }
  hub(app, tab);
}

function hub(app, tab = 'play') {
  const root = app.show(`<div class="screen dim sc-screen">
    ${header(app)}
    <div class="tabs">${[['play', '⚽ 경기'], ['shop', `🎴 팩 상점${state.dailyAvailable ? ' <span class="chat-badge">1</span>' : ''}`], ['squad', '📋 스쿼드'], ['cards', `🗂️ 컬렉션 (${state.cards.length})`], ['record', '📈 기록']].map(([k, n]) => `<div class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</div>`).join('')}</div>
    <div id="content" style="flex:1;min-height:0"></div></div>`);
  bindGo(app, root);
  root.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => hub(app, t.dataset.tab));
  const el = root.querySelector('#content');
  ({ play: tabPlay, shop: tabShop, squad: tabSquad, cards: tabCards, record: tabRecord })[tab](app, el);
}

// ---------- play ----------
function tabPlay(app, el) {
  el.innerHTML = `<div class="sc-modes">${MATCH_TYPES.map(m => `<div class="tile sc-mode" data-mode="${m.id}"><div class="t-ico">${m.icon}</div><div class="t-name">${esc(m.name)}</div><div class="t-desc">${esc(m.desc)}</div>${m.online ? '<span class="badge sc-onl">ONLINE</span>' : ''}</div>`).join('')}</div>
    <div id="mode-panel"></div>`;
  el.querySelectorAll('[data-mode]').forEach(t => t.onclick = () => {
    el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === t));
    const panel = el.querySelector('#mode-panel');
    ({ friendly: friendlyPanel, quick: friendlyPanel, ladder: ladderPanel, rank: onlinePanel, room: onlinePanel })[t.dataset.mode](app, panel, t.dataset.mode);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function rewardPreview(oppId, diff, short) {
  const opp = clubOvr(oppId);
  const r = localReward({ outcome: 'win', myOvr: state.teamOvr, oppOvr: opp, difficulty: diff, goals: 2, short });
  const sm = strengthMult(state.teamOvr, opp);
  return `<div class="sc-preview"><div>상대 OVR <b>${opp}</b> vs 내 팀 <b>${state.teamOvr}</b></div><div>강팀 보너스 <b class="${sm > 1 ? 'accent' : 'muted'}">×${sm.toFixed(2)}</b> · 난이도 ×${({ 0: 0.6, 1: 0.8, 2: 1, 3: 1.25, 4: 1.55 })[diff]}</div><div>승리 시 예상 보상 (2골 기준): <b class="accent">+${fmt(r.xp)} XP</b> · <b class="gold">+${fmt(r.coins)} 🪙</b></div></div>`;
}

function friendlyPanel(app, el, mode) {
  const st = { opp: LS.get('sc_opp', 'tot'), diff: LS.get('sc_diff', 2) };
  const short = mode === 'quick';
  el.innerHTML = `<div class="grid2" style="margin-top:14px"><div class="panel"><h3>상대 클럽 선택</h3><div id="opick"></div></div>
    <div class="panel col"><h3>${short ? '⚡ 스피드 매치 (6분)' : '⚔️ 로컬 친선전 (12분)'}</h3><div id="ocard"></div>
      <label class="fld">난이도<select class="inp" id="odiff">${DIFFS.map((d, i) => `<option value="${i}" ${i === st.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <div id="oprev"></div>
      <button class="btn primary" id="ogo" style="font-size:18px">경기 시작</button>
      <p class="small muted" style="margin:0">강한 팀을 높은 난이도에서 이길수록 경험치와 코인을 훨씬 많이 받습니다. 경기를 중간에 나가면 보상이 없습니다.</p></div></div>`;
  const upd = () => { el.querySelector('#ocard').innerHTML = clubCard(st.opp); el.querySelector('#oprev').innerHTML = rewardPreview(st.opp, st.diff, short); };
  teamPicker(el.querySelector('#opick'), { value: st.opp, onChange: (id) => { st.opp = id; LS.set('sc_opp', id); upd(); } });
  el.querySelector('#odiff').onchange = (e) => { st.diff = +e.target.value; LS.set('sc_diff', st.diff); upd(); };
  upd();
  el.querySelector('#ogo').onclick = () => playLocal(app, { type: mode, opp: st.opp, difficulty: st.diff });
}

function ladderPanel(app, el) {
  const lo = state.ladderOpp;
  const stage = state.ladder.stage;
  const st = { diff: LS.get('sc_ldiff', 2) };
  el.innerHTML = `<div class="panel col" style="margin-top:14px">
    <h3>🏆 SC 리그 도전 ${state.ladder.runs ? `· ${state.ladder.runs + 1}회차` : ''}</h3>
    <div class="sc-ladder">${Array.from({ length: LADDER_STAGES }, (_, i) => `<div class="sc-step ${i < stage ? 'done' : i === stage ? 'cur' : ''}"><b>${i + 1}</b><span>+${fmt(ladderBonus(i + 1).coins)}</span></div>`).join('')}</div>
    <div class="grid2"><div>${clubCard(lo.id)}</div>
    <div class="col"><label class="fld">난이도<select class="inp" id="ldiff">${DIFFS.map((d, i) => `<option value="${i}" ${i === st.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label><div id="lprev"></div>
    <button class="btn primary" id="lgo" style="font-size:18px">${stage + 1}단계 도전</button></div></div>
    <p class="small muted" style="margin:0">승리하면 다음 단계로 올라가고 단계 보너스를 받습니다. 10단계를 모두 깨면 5,000 🪙 추가 보너스와 함께 더 강한 상대로 다시 시작합니다.</p></div>`;
  const upd = () => { const b = ladderBonus(stage + 1); el.querySelector('#lprev').innerHTML = rewardPreview(lo.id, st.diff, false) + `<div class="small">단계 클리어 보너스 <b class="accent">+${fmt(b.xp)} XP · +${fmt(b.coins)} 🪙</b></div>`; };
  el.querySelector('#ldiff').onchange = (e) => { st.diff = +e.target.value; LS.set('sc_ldiff', st.diff); upd(); };
  upd();
  el.querySelector('#lgo').onclick = () => playLocal(app, { type: 'ladder', difficulty: st.diff });
}

async function playLocal(app, { type, opp, difficulty }) {
  let start;
  try { start = await api(app, 'POST', '/api/sc/start', { type, opp, difficulty }); } catch (e) { return toast(e.message, true); }
  const home = start.team, away = buildTeam(start.opp);
  const kits = kitColors(home.club, away.club);
  const res = await app.playMatch({ home, away, kits, difficulty: start.difficulty, humans: [{ slot: 0, team: 0 }], realSeconds: start.realSeconds, quitWarning: '경기에서 나가면 보상을 받을 수 없습니다. 나가시겠습니까?' });
  let out;
  try { out = await api(app, 'POST', '/api/sc/result', { token: start.token, score: res && !res.aborted ? res.score : null, aborted: !res || !!res.aborted }); }
  catch (e) { toast(e.message, true); await refresh(app); return hub(app, 'play'); }
  state = out.sc;
  hub(app, 'play');
  if (!out.aborted) showReward(app, out, CLUB_BY_ID[start.opp]?.name, res.score);
}

function showReward(app, out, oppName, score) {
  const r = out.reward;
  const title = out.outcome === 'win' ? '승리!' : out.outcome === 'draw' ? '무승부' : '패배';
  const ups = out.levelUps || [];
  const unlocked = PACKS.filter(p => ups.some(u => u.level === p.level));
  const m = modal(`<div class="sc-reward"><h2>${title}</h2>
    ${score ? `<div class="big-num">${score[0]} - ${score[1]}</div><div class="muted">vs ${esc(oppName || '상대')}</div>` : ''}
    <div class="sc-rw"><div><b class="accent">+${fmt(r.xp)}</b><span>XP</span></div><div><b class="gold">+${fmt(r.coins)}</b><span>코인</span></div>${r.rp !== undefined ? `<div><b>${r.rp >= 0 ? '+' : ''}${r.rp}</b><span>랭크 포인트</span></div>` : ''}${r.mult ? `<div><b>×${r.mult}</b><span>보상 배율</span></div>` : ''}</div>
    ${out.bonus ? `<div class="news">🏆 리그 도전 단계 클리어! 보너스 +${fmt(out.bonus.xp)} XP · +${fmt(out.bonus.coins)} 🪙${out.bonus.completed ? ' · <b>10단계 완주! +5,000 🪙</b>' : ''}</div>` : ''}
    ${ups.map(u => `<div class="sc-levelup">LEVEL UP! Lv.${u.level} <span>+${fmt(u.coins)} 🪙</span></div>`).join('')}
    ${unlocked.map(p => `<div class="news">🔓 <b>${esc(p.name)}</b> 해금!</div>`).join('')}
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" data-close>확인</button>${unlocked.length ? '<button class="btn purple" id="goshop">팩 상점으로</button>' : ''}</div></div>`);
  if (ups.length) app.audio.cheer(true);
  const gs = m.el.querySelector('#goshop'); if (gs) gs.onclick = () => { m.close(); hub(app, 'shop'); };
}

// ---------- online ----------
function onlinePanel(app, el, mode) {
  el.innerHTML = `<div class="panel col" style="margin-top:14px;max-width:640px">
    <h3>${mode === 'rank' ? '🌐 온라인 랭크전' : '🔒 온라인 친선방'}</h3>
    <div class="row">${clubBadge()}<div><b>${esc(state.club.name)}</b><div class="small muted">팀 OVR ${state.teamOvr} · ${esc(state.squad.formation)}</div></div></div>
    <div id="ostatus" class="lead muted">${mode === 'rank' ? '같은 SUPER CLASS 모드 플레이어와 매칭됩니다.' : '방을 만들거나 친구의 코드로 참가하세요.'}</div>
    <div class="row">${mode === 'rank' ? '<button class="btn primary" id="oq">⚡ 상대 찾기</button>' : '<button class="btn primary" id="oc">방 만들기</button><input class="inp" id="ocode" placeholder="방 코드" maxlength="5" style="width:120px;text-transform:uppercase"><button class="btn" id="oj">참가</button>'}<button class="btn danger hidden" id="ox">취소</button></div>
    <p class="small muted" style="margin:0">승리 +220 XP · +1,500 🪙 · +25 RP / 무승부 +110 XP / 패배 +60 XP. 연결이 끊기면 기권패입니다.</p></div>`;
  const status = (h, busy) => { el.querySelector('#ostatus').innerHTML = h; el.querySelector('#ox').classList.toggle('hidden', !busy); el.querySelectorAll('#oq,#oc,#oj').forEach(b => b.disabled = busy); };
  let s = null;
  const off = () => { if (!s) return; s.off('queue:waiting', onW); s.off('room:created', onC); s.off('room:error', onE); s.off('match:start', onS); };
  const onW = () => status('<span class="accent">상대를 찾는 중...</span> ⏳', true);
  const onC = ({ code }) => status(`방 코드: <b class="accent" style="font-size:28px;letter-spacing:4px">${esc(code)}</b><br><span class="small">친구가 SUPER CLASS → 온라인 친선방에서 이 코드를 입력하면 시작됩니다.</span>`, true);
  const onE = ({ message }) => { toast(message, true); status('다시 시도하세요.', false); };
  const onS = async (start) => {
    off();
    start.kits = kitColors(start.home.club, start.away.club);
    const res = await app.playOnline(s, start);
    await refresh(app);
    hub(app, 'play');
    if (res && res.scReward) showReward(app, res.scReward, start.names[1 - start.you], res.you === 1 ? [res.score[1], res.score[0]] : res.score);
  };
  const ensure = async () => {
    if (s) return s;
    try { s = await connect(app); } catch (e) { toast(e.message, true); return null; }
    s.on('queue:waiting', onW); s.on('room:created', onC); s.on('room:error', onE); s.on('match:start', onS);
    return s;
  };
  const q = el.querySelector('#oq'); if (q) q.onclick = async () => { if (await ensure()) { s.emit('queue:join', { mode: 'sc' }); onW(); } };
  const c = el.querySelector('#oc'); if (c) c.onclick = async () => { if (await ensure()) s.emit('room:create', { mode: 'sc' }); };
  const j = el.querySelector('#oj'); if (j) j.onclick = async () => { const code = el.querySelector('#ocode').value.trim().toUpperCase(); if (code.length < 5) return toast('5자리 코드를 입력하세요.', true); if (await ensure()) s.emit('room:join', { code, mode: 'sc' }); };
  el.querySelector('#ox').onclick = () => { if (s) { s.emit('queue:leave'); s.emit('room:leave'); } status('취소되었습니다.', false); };
}
const clubBadge = () => { const c = state.club; return `<div class="crest" style="background:linear-gradient(135deg, ${c.c1} 0 55%, ${c.c2} 55%);color:${textOn(c.c1)}">${esc(c.short)}</div>`; };

// ---------- shop ----------
function tabShop(app, el) {
  const daily = PACK_BY_ID[DAILY_PACK];
  el.innerHTML = `${state.dailyAvailable ? `<div class="panel row sc-daily"><div class="grow"><b>🎁 오늘의 무료 팩</b><div class="small muted">매일 ${esc(daily.name)} 1개를 무료로 받을 수 있습니다.</div></div><button class="btn primary" id="daily">무료로 열기</button></div>` : ''}
    <div class="sc-packs">${PACKS.map(p => {
      const locked = state.level < p.level, poor = state.coins < p.price;
      const total = p.odds.reduce((a, b) => a + b, 0);
      return `<div class="sc-pack ${locked ? 'locked' : ''}" style="--pc:${p.color}">
        <div class="sc-pack-art"><span>${p.cards}</span><small>CARDS</small></div>
        <div class="sc-pack-name">${esc(p.name)}</div>
        <div class="small muted">${esc(p.desc)}</div>
        <div class="sc-odds">${p.odds.map((o, i) => o ? `<div title="${BANDS[i][0]}~${BANDS[i][1]}"><span>${BANDS[i][0]}+</span><i style="width:${o / total * 100}%"></i><em>${Math.round(o / total * 100)}%</em></div>` : '').join('')}${p.scChance ? `<div class="small accent">SUPER CLASS 강화 카드 ${Math.round(p.scChance * 100)}%</div>` : ''}</div>
        ${locked ? `<button class="btn" disabled>🔒 Lv.${p.level} 필요</button>` : `<button class="btn ${poor ? '' : 'primary'}" data-buy="${p.id}" ${poor ? 'disabled' : ''}>🪙 ${fmt(p.price)}</button>`}
      </div>`;
    }).join('')}</div>`;
  const d = el.querySelector('#daily'); if (d) d.onclick = () => openPack(app, { daily: true }, daily);
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
    const p = PACK_BY_ID[b.dataset.buy];
    if (p.price >= 10000 && !(await confirmBox(`${p.name}을(를) ${fmt(p.price)} 코인에 구매할까요?`, '구매'))) return;
    openPack(app, { pack: p.id }, p);
  });
}

async function openPack(app, body, pack) {
  let out;
  try { out = await api(app, 'POST', '/api/sc/open', body); } catch (e) { return toast(e.message, true); }
  state = out.sc;
  const cards = out.cards;
  const owned = new Map();
  for (const c of state.cards) if (!cards.some(n => n.uid === c.uid)) owned.set(c.pid, true);
  const ov = document.createElement('div');
  ov.className = 'sc-open';
  ov.style.setProperty('--pc', pack.color);
  ov.innerHTML = `<div class="sc-open-pack"><div class="sc-pack-art big"><span>${cards.length}</span><small>${esc(pack.name)}</small></div><div class="muted" style="margin-top:14px">탭하여 개봉</div></div>`;
  document.body.appendChild(ov);
  app.audio.ensure();
  let i = -1;
  const best = cards[cards.length - 1];
  const showAll = () => {
    ov.innerHTML = `<div class="sc-open-all"><h2>${esc(pack.name)} 결과</h2><div class="sc-grid">${cards.map(c => cardHtml(c, { dup: owned.has(c.pid) })).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="sc-ok">보관함에 넣기</button>${cards.some(c => owned.has(c.pid)) ? `<button class="btn" id="sc-selldup">중복 카드 판매 (+${fmt(cards.filter(c => owned.has(c.pid)).reduce((s, c) => s + sellValue(c), 0))} 🪙)</button>` : ''}</div></div>`;
    ov.querySelector('#sc-ok').onclick = () => { ov.remove(); hub(app, 'shop'); };
    const sd = ov.querySelector('#sc-selldup');
    if (sd) sd.onclick = async () => {
      try { const r = await api(app, 'POST', '/api/sc/sell', { uids: cards.filter(c => owned.has(c.pid)).map(c => c.uid) }); state = r.sc; toast(`${r.sold}장 판매 · +${fmt(r.coins)} 🪙`); } catch (e) { toast(e.message, true); }
      ov.remove(); hub(app, 'shop');
    };
  };
  const next = () => {
    i++;
    if (i >= cards.length) return showAll();
    const c = cards[i];
    const t = tierOf(c);
    const walkout = c === best && (c.ovr >= 82 || c.sc);
    const club = CLUB_BY_ID[c.club];
    const reveal = () => {
      ov.innerHTML = `<div class="sc-reveal t-${t}"><div class="sc-rays"></div>${cardHtml(c, { dup: owned.has(c.pid) })}<div class="sc-rev-info"><b>${esc(c.name)}</b> · ${esc(club?.name || '')} · ${TIERS[t].name}</div><div class="muted small">${i + 1} / ${cards.length} — 탭하여 계속 ${i < cards.length - 1 ? '· <u id="sc-skip">모두 보기</u>' : ''}</div></div>`;
      const sk = ov.querySelector('#sc-skip'); if (sk) sk.onclick = (e) => { e.stopPropagation(); i = cards.length; showAll(); };
      if (t === 'icon' || t === 'sc') app.audio.cheer(true); else if (t === 'elite' || t === 'gold') app.audio.cheer(false); else app.audio.kick(10);
    };
    if (walkout) { // FC-style walkout: nation → position → club → card
      const steps = [`<div class="sc-wo-big">${esc(c.nat)}</div><div class="muted">국적</div>`, `<div class="sc-wo-big">${esc(c.pos)}</div><div class="muted">포지션</div>`, `<div class="sc-wo-big" style="color:${club?.c1 || '#fff'}">${esc(club?.short || '')}</div><div class="muted">${esc(club?.name || '')}</div>`];
      let k = 0;
      ov.innerHTML = `<div class="sc-walkout t-${t}"><div class="sc-rays"></div><div class="sc-wo-step">${steps[0]}</div></div>`;
      app.audio.ooh();
      const iv = setInterval(() => { k++; if (k < steps.length) { const s = ov.querySelector('.sc-wo-step'); if (s) s.innerHTML = steps[k]; } else { clearInterval(iv); reveal(); } }, 900);
      ov.dataset.busy = '1'; setTimeout(() => { ov.dataset.busy = ''; }, 900 * steps.length + 100);
    } else reveal();
  };
  ov.addEventListener('click', () => { if (ov.dataset.busy === '1' || ov.querySelector('.sc-open-all')) return; next(); });
}

// ---------- squad ----------
function tabSquad(app, el) {
  let sel = null; // index of XI slot selected
  let xi = state.squad.xi.slice();
  const byUid = new Map(state.cards.map(c => [c.uid, c]));
  const render = () => {
    const slots = FORMATIONS[state.squad.formation];
    const xiCards = xi.map(u => byUid.get(u));
    const ovr = Math.round(xiCards.reduce((s, c) => s + (c?.ovr || 0), 0) / 11);
    const xiPids = new Set(xiCards.filter(Boolean).map(c => c.pid));
    const pos = sel !== null ? slots[sel][0] : null;
    const pool = state.cards.filter(c => !xi.includes(c.uid)).sort((a, b) => pos ? fitRating(b, pos) - fitRating(a, pos) : b.ovr - a.ovr);
    el.innerHTML = `<div class="grid2" style="grid-template-columns:minmax(300px, 480px) minmax(0, 1fr)">
      <div class="panel col">
        <div class="row"><label class="fld grow">포메이션<select class="inp" id="sf">${FORMATION_NAMES.map(f => `<option ${f === state.squad.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label><button class="btn sm" id="sauto" style="align-self:flex-end">자동 선발</button></div>
        <div class="pitch-mini sc-pitch">${slots.map((s, i) => { const c = xiCards[i]; return `<div class="sc-slot ${sel === i ? 'sel' : ''}" data-slot="${i}" style="left:${50 + s[2] * 40}%;top:${92 - s[1] * 100}%">${c ? cardHtml(c, { small: true }) : '<div class="sc-card small empty">+</div>'}<div class="sc-slotpos">${s[0]}</div></div>`; }).join('')}</div>
        <div class="row"><span>팀 OVR <b class="gold">${ovr}</b></span><span class="spacer"></span><button class="btn primary" id="ssave">스쿼드 저장</button></div>
        <details><summary class="muted" style="cursor:pointer">클럽 이름 · 유니폼 색상</summary>
          <div class="col" style="margin-top:8px"><div class="row"><input class="inp grow" id="cname" maxlength="20" value="${esc(state.club.name)}"><input class="inp" id="cshort" maxlength="4" style="width:80px;text-transform:uppercase" value="${esc(state.club.short)}"></div>
          <div class="small muted">메인 색상</div><div class="row sc-swatches" data-k="c1">${KIT_COLORS.map(k => `<i data-c="${k}" class="${k === state.club.c1 ? 'on' : ''}" style="background:${k}"></i>`).join('')}</div>
          <div class="small muted">보조 색상</div><div class="row sc-swatches" data-k="c2">${KIT_COLORS.map(k => `<i data-c="${k}" class="${k === state.club.c2 ? 'on' : ''}" style="background:${k}"></i>`).join('')}</div>
          <button class="btn sm" id="csave">클럽 정보 저장</button></div></details>
      </div>
      <div class="panel col" style="min-height:0"><h3>${sel !== null ? `${slots[sel][0]} 자리에 넣을 카드 선택` : '경기장의 자리를 누른 뒤 카드를 선택하세요'}</h3>
        <div class="sc-grid scroll" style="max-height:60vh">${pool.map(c => cardHtml(c, { small: true, attr: `data-card="${c.uid}"`, dup: xiPids.has(c.pid) })).join('') || '<p class="muted">추가 카드가 없습니다. 팩을 열어보세요!</p>'}</div></div></div>`;
    el.querySelector('#sf').onchange = async (e) => { try { state = (await api(app, 'POST', '/api/sc/squad', { formation: e.target.value })).sc; xi = state.squad.xi.slice(); sel = null; render(); } catch (err) { toast(err.message, true); } };
    el.querySelector('#sauto').onclick = async () => { try { state = (await api(app, 'POST', '/api/sc/squad', { auto: true })).sc; xi = state.squad.xi.slice(); sel = null; render(); toast('최적의 선수로 자동 선발했습니다.'); } catch (err) { toast(err.message, true); } };
    el.querySelectorAll('[data-slot]').forEach(d => d.onclick = () => {
      const i = +d.dataset.slot;
      if (sel !== null && sel !== i) { [xi[sel], xi[i]] = [xi[i], xi[sel]]; sel = null; } else sel = sel === i ? null : i;
      render();
    });
    el.querySelectorAll('[data-card]').forEach(d => d.onclick = () => {
      if (sel === null) return toast('먼저 경기장의 자리를 선택하세요.');
      const c = byUid.get(d.dataset.card);
      if (xi.some((u, k) => k !== sel && byUid.get(u)?.pid === c.pid)) return toast('같은 선수가 이미 선발 명단에 있습니다.', true);
      xi[sel] = c.uid; sel = null; render();
    });
    el.querySelector('#ssave').onclick = async () => { try { state = (await api(app, 'POST', '/api/sc/squad', { xi })).sc; toast('스쿼드를 저장했습니다.'); hub(app, 'squad'); } catch (err) { toast(err.message, true); } };
    const clubSel = { c1: state.club.c1, c2: state.club.c2 };
    el.querySelectorAll('.sc-swatches').forEach(row => row.querySelectorAll('[data-c]').forEach(sw => sw.onclick = () => { clubSel[row.dataset.k] = sw.dataset.c; row.querySelectorAll('i').forEach(x => x.classList.toggle('on', x === sw)); }));
    el.querySelector('#csave').onclick = async () => {
      try { state = (await api(app, 'POST', '/api/sc/squad', { club: { name: el.querySelector('#cname').value, short: el.querySelector('#cshort').value, ...clubSel } })).sc; toast('클럽 정보를 저장했습니다.'); hub(app, 'squad'); } catch (err) { toast(err.message, true); }
    };
  };
  render();
}

// ---------- collection ----------
function tabCards(app, el) {
  const f = { sort: 'ovr', tier: '', pos: '' };
  const selected = new Set();
  const render = () => {
    const xiSet = new Set(state.squad.xi);
    let list = state.cards.filter(c => (!f.tier || tierOf(c) === f.tier) && (!f.pos || c.pos === f.pos));
    list.sort(f.sort === 'ovr' ? (a, b) => b.ovr - a.ovr : f.sort === 'pos' ? (a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr : (a, b) => a.name.localeCompare(b.name));
    const gain = [...selected].reduce((s, u) => { const c = state.cards.find(x => x.uid === u); return s + (c ? sellValue(c) : 0); }, 0);
    el.innerHTML = `<div class="panel col" style="min-height:0">
      <div class="row">
        <select class="inp" id="fs"><option value="ovr">OVR 순</option><option value="pos">포지션 순</option><option value="name">이름 순</option></select>
        <select class="inp" id="ft"><option value="">전체 등급</option>${Object.entries(TIERS).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('')}</select>
        <select class="inp" id="fp"><option value="">전체 포지션</option>${['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'].map(p => `<option>${p}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button class="btn sm" id="dups">중복 카드 선택</button>
        <button class="btn sm danger" id="sell" ${selected.size ? '' : 'disabled'}>선택 판매 ${selected.size ? `(${selected.size}장 · +${fmt(gain)} 🪙)` : ''}</button>
      </div>
      <div class="small muted">카드를 누르면 판매할 카드로 선택됩니다. 선발 명단(⭐)의 카드는 판매할 수 없습니다. 보관함 ${state.cards.length}/300</div>
      <div class="sc-grid scroll" style="max-height:62vh">${list.map(c => `<div class="sc-cwrap">${cardHtml(c, { sel: selected.has(c.uid), attr: `data-c="${c.uid}"` })}${xiSet.has(c.uid) ? '<div class="sc-star">⭐</div>' : ''}</div>`).join('')}</div></div>`;
    el.querySelector('#fs').value = f.sort; el.querySelector('#ft').value = f.tier; el.querySelector('#fp').value = f.pos;
    el.querySelector('#fs').onchange = (e) => { f.sort = e.target.value; render(); };
    el.querySelector('#ft').onchange = (e) => { f.tier = e.target.value; render(); };
    el.querySelector('#fp').onchange = (e) => { f.pos = e.target.value; render(); };
    el.querySelectorAll('[data-c]').forEach(d => d.onclick = () => {
      const u = d.dataset.c;
      if (xiSet.has(u)) return toast('선발 명단의 카드는 판매할 수 없습니다.');
      selected.has(u) ? selected.delete(u) : selected.add(u); render();
    });
    el.querySelector('#dups').onclick = () => {
      const keep = new Map();
      for (const c of state.cards) { const k = c.pid; const cur = keep.get(k); if (xiSet.has(c.uid) || !cur || (!xiSet.has(cur.uid) && c.ovr > cur.ovr)) keep.set(k, c); }
      selected.clear();
      for (const c of state.cards) if (keep.get(c.pid) !== c && !xiSet.has(c.uid)) selected.add(c.uid);
      if (!selected.size) toast('중복 카드가 없습니다.');
      render();
    };
    el.querySelector('#sell').onclick = async () => {
      if (!(await confirmBox(`${selected.size}장을 판매하고 ${fmt(gain)} 코인을 받을까요?`, '판매'))) return;
      try { const r = await api(app, 'POST', '/api/sc/sell', { uids: [...selected] }); state = r.sc; selected.clear(); toast(`${r.sold}장 판매 · +${fmt(r.coins)} 🪙`); hub(app, 'cards'); } catch (e) { toast(e.message, true); }
    };
  };
  render();
}

// ---------- record ----------
function tabRecord(app, el) {
  const s = state.stats;
  const best = state.cards.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  el.innerHTML = `<div class="grid2">
    <div class="col"><div class="panel"><h3>전적</h3>
      <div class="grid3" style="text-align:center;gap:8px"><div><div class="big-num">${s.played}</div><div class="small muted">경기</div></div><div><div class="big-num accent">${s.wins + s.onlineW}</div><div class="small muted">승</div></div><div><div class="big-num">${s.gf}:${s.ga}</div><div class="small muted">득:실</div></div></div>
      <div class="kv"><span>로컬</span><span>${s.wins}승 ${s.draws}무 ${s.losses}패</span></div>
      <div class="kv"><span>온라인</span><span>${s.onlineW}승 ${s.onlineD}무 ${s.onlineL}패 · RP ${fmt(state.rp)}</span></div>
      <div class="kv"><span>SC 리그 도전</span><span>${state.ladder.runs}회 완주 · 현재 ${state.ladder.stage + 1}단계</span></div>
      <div class="kv"><span>개봉한 팩</span><span>${s.packs}</span></div></div>
      <div class="panel"><h3>최고 카드</h3><div class="sc-grid">${best.map(c => cardHtml(c, { small: true })).join('')}</div></div></div>
    <div class="panel"><h3>레벨 보상</h3><table class="tbl"><tr><th>레벨</th><th>해금</th></tr>${PACKS.map(p => `<tr class="${state.level >= p.level ? 'me' : ''}"><td>Lv.${p.level}</td><td>${esc(p.name)} ${state.level >= p.level ? '✅' : '🔒'}</td></tr>`).join('')}</table>
      <p class="small muted">레벨은 경기를 할 때마다 오릅니다. 강한 팀을 높은 난이도에서 이길수록, 온라인에서 이길수록 경험치를 많이 받습니다. 레벨이 오를 때마다 코인 보너스도 받습니다.</p></div></div>`;
}

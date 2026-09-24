// Player career ("Be a Pro"): create a player, play as him, grow, earn transfers.
import { CLUB_BY_ID, ALL_CLUBS } from '/shared/data/leagues.js';
import { generateSquad, buildTeam, kitColors, pickLineup, makeAttrs, calcOvr, playerValue, rng, ATTR_KEYS, ATTR_LABELS, fitRating, FORMATIONS } from '/shared/squad.js';
import { roundRobin, newTable, applyResult, sortTable, simFixture, addScorers, leagueClubs, strength } from '/shared/career.js';
import { esc, toast, crest, confirmBox, posTag, money } from './dom.js';
import { teamPicker, clubCard, clubOvr, DIFFS, bindGo } from './menus.js';

const SLOTS = ['player1', 'player2', 'player3'];
const POS_OPTS = ['ST', 'LW', 'RW', 'CAM', 'CM', 'CDM', 'LB', 'RB', 'CB'];
const NATS = [['KOR', '대한민국'], ['JPN', '일본'], ['ENG', '잉글랜드'], ['ESP', '스페인'], ['FRA', '프랑스'], ['GER', '독일'], ['ITA', '이탈리아'], ['BRA', '브라질'], ['ARG', '아르헨티나'], ['POR', '포르투갈'], ['NED', '네덜란드'], ['USA', '미국'], ['NGA', '나이지리아'], ['SEN', '세네갈']];

export async function playerCareerEntry(app) {
  const saves = await app.api.listSaves();
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">선수 커리어</h1><p class="subtitle">나만의 선수를 만들어 직접 뛰고, 성장시키고, 빅클럽으로 이적하세요. 경기 중에는 내 선수만 조작합니다. (J: 패스 요청)</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
    <div class="grid3">${SLOTS.map((s, i) => {
      const sm = saves[s]?.summary;
      return `<div class="panel col"><h3>슬롯 ${i + 1}</h3>${sm ? `<div class="row">${crest(CLUB_BY_ID[sm.club] || { c1: '#333', c2: '#555', short: '?' })}<div><b>${esc(sm.name)}</b> ${posTag(sm.pos)}<div class="small muted">${esc(CLUB_BY_ID[sm.club]?.name || '')} · OVR ${sm.ovr} · ${sm.season}시즌</div></div></div><div class="row"><button class="btn primary" data-load="${s}">이어하기</button><button class="btn danger sm" data-del="${s}">삭제</button></div>` : `<p class="muted">비어 있음</p><button class="btn purple" data-new="${s}">선수 만들기</button>`}</div>`;
    }).join('')}</div></div>`);
  bindGo(app, root);
  root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => createPlayer(app, b.dataset.new));
  root.querySelectorAll('[data-load]').forEach(b => b.onclick = async () => { const d = await app.api.loadSave(b.dataset.load); if (!d) return toast('불러오기 실패', true); hub(app, d); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('이 선수 커리어를 삭제할까요?', '삭제')) { await app.api.deleteSave(b.dataset.del); playerCareerEntry(app); } });
}

function createPlayer(app, slot) {
  let club = 'sun';
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">선수 만들기</h1><p class="subtitle">18세 유망주로 커리어를 시작합니다.</p></div><button class="btn ghost" id="back">← 뒤로</button></div>
    <div class="grid2" style="flex:1;min-height:0">
      <div class="panel col">
        <label class="fld">선수 이름<input class="inp" id="nm" maxlength="22" value="${esc(app.api.user?.nickname || '')}" placeholder="예: 김민준"></label>
        <div class="row"><label class="fld grow">국적<select class="inp" id="nat">${NATS.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="fld grow">포지션<select class="inp" id="pos">${POS_OPTS.map(p => `<option>${p}</option>`).join('')}</select></label>
        <label class="fld">등번호<input class="inp" id="num" type="number" min="1" max="99" value="10" style="width:80px"></label></div>
        <label class="fld">경기 난이도<select class="inp" id="diff">${DIFFS.map((d, i) => `<option value="${i}" ${i === app.settings.difficulty ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <div id="preview"></div>
      </div>
      <div class="panel col"><h3>시작 클럽 (팀 OVR 78 이하)</h3><div id="card"></div><div id="pick"></div><button class="btn primary" id="go">커리어 시작</button></div>
    </div></div>`);
  root.querySelector('#back').onclick = () => playerCareerEntry(app);
  const preview = () => {
    const pos = root.querySelector('#pos').value;
    const a = baseAttrs(pos);
    root.querySelector('#preview').innerHTML = `<div class="panel" style="background:rgba(255,255,255,.04)"><div class="row"><span class="big-num accent">${calcOvr(pos, a)}</span><span class="muted">시작 OVR · 잠재력 88+</span></div>${attrBars(pos, a)}</div>`;
  };
  root.querySelector('#pos').onchange = preview;
  preview();
  const upd = () => { root.querySelector('#card').innerHTML = clubCard(club); };
  teamPicker(root.querySelector('#pick'), { value: club, maxOvr: 78, onChange: (id) => { club = id; upd(); } });
  upd();
  root.querySelector('#go').onclick = async () => {
    const name = root.querySelector('#nm').value.trim();
    if (!name) return toast('선수 이름을 입력하세요.', true);
    const pos = root.querySelector('#pos').value;
    const attrs = baseAttrs(pos);
    const c = CLUB_BY_ID[club];
    const me = { id: 'me', name, pos, nat: root.querySelector('#nat').value, age: 18, attrs, ovr: calcOvr(pos, attrs), pot: 90, num: +root.querySelector('#num').value || 10, skin: 0 };
    me.value = playerValue(me.ovr, me.age);
    const ids = leagueClubs(c.league);
    const save = {
      v: 1, type: 'player', slot, me, clubId: club, leagueId: c.league, season: 2027, round: 0, difficulty: +root.querySelector('#diff').value,
      fixtures: roundRobin(ids.slice().sort(() => Math.random() - 0.5)), table: newTable(ids), scorers: {},
      stats: { apps: 0, goals: 0, assists: 0, rsum: 0 }, career: { apps: 0, goals: 0, assists: 0, clubs: [club], trophies: 0 },
      xp: 0, sp: 3, offers: [], news: [{ t: `🖊️ <b>${esc(name)}</b>, ${esc(c.name)}와 첫 프로 계약 체결!` }], history: [], wage: 5,
    };
    await persist(app, save);
    hub(app, save);
  };
}
function baseAttrs(pos) { const r = rng(12345); const a = makeAttrs(r, pos, 64); return a; }
function attrBars(pos, a, up = null) {
  const labels = pos === 'GK' ? { pac: 'DIV', sho: 'HAN', pas: 'KIC', dri: 'REF', def: 'SPD', phy: 'POS' } : ATTR_LABELS;
  return ATTR_KEYS.map(k => `<div class="attr-row"><b>${labels[k]}</b><div class="bar"><i style="width:${a[k]}%;background:${a[k] >= 80 ? '#00ffa3' : a[k] >= 65 ? '#ffcc4d' : '#ff5b6e'}"></i></div><span class="ovr">${a[k]}</span>${up ? `<button class="btn sm" data-up="${k}" ${up.disabled ? 'disabled' : ''}>+</button>` : '<span></span>'}</div>`).join('');
}
async function persist(app, save) {
  save.summary = { club: save.clubId, season: save.season, name: save.me.name, pos: save.me.pos, ovr: save.me.ovr };
  return app.api.writeSave(save.slot, save);
}

// the user's club with "me" in the squad and guaranteed in the XI
function myTeam(save) {
  const squad = generateSquad(save.clubId).filter(p => p.num !== save.me.num);
  const players = [...squad, { ...save.me }];
  const formation = '4-3-3';
  const slots = FORMATIONS[formation];
  let { xi } = pickLineup(players, formation);
  let idx = xi.findIndex(p => p.id === 'me');
  if (idx < 0) {
    let best = 0, bs = -1;
    slots.forEach((s, i) => { if (s[0] === 'GK') return; const f = fitRating(save.me, s[0]) - xi[i].ovr * 0.2; if (f > bs) { bs = f; best = i; } });
    xi[best] = players[players.length - 1]; idx = best;
  }
  return { players, lineup: xi.map(p => p.id), lockTi: idx, formation };
}

function hub(app, save, tab = 'home') {
  const club = CLUB_BY_ID[save.clubId];
  const me = save.me;
  const done = save.round >= save.fixtures.length;
  const root = app.show(`<div class="screen dim">
    <div class="topbar">
      <div class="row">${crest(club, 'lg')}<div><h1 class="title">${esc(me.name)} ${posTag(me.pos)} <span class="ovr accent" style="font-size:30px">${me.ovr}</span></h1><p class="subtitle">${esc(club.name)} #${me.num} · ${me.age}세 · ${save.season}/${(save.season + 1) % 100} 시즌 · ${done ? '시즌 종료' : `${save.round + 1}/${save.fixtures.length} 라운드`} · 시장가치 ${money(playerValue(me.ovr, me.age))}</p></div></div>
      <div class="row"><button class="btn sm" id="savebtn">💾 저장</button><button class="btn ghost" id="quit">메인 메뉴</button></div>
    </div>
    <div class="tabs">${[['home', '홈'], ['dev', `성장 ${save.sp ? `(${save.sp})` : ''}`], ['table', '리그 순위'], ['career', '커리어 기록']].map(([k, n]) => `<div class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</div>`).join('')}</div>
    <div id="content" style="flex:1;min-height:0"></div></div>`);
  root.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => hub(app, save, t.dataset.tab));
  root.querySelector('#savebtn').onclick = async () => { const w = await persist(app, save); toast(w === 'cloud' ? '클라우드에 저장되었습니다.' : '이 브라우저에 저장되었습니다.'); };
  root.querySelector('#quit').onclick = async () => { await persist(app, save); app.go('main'); };
  const el = root.querySelector('#content');
  ({ home: tabHome, dev: tabDev, table: tabTable, career: tabCareer })[tab](app, save, el);
}

function nextFixture(save) { return save.round < save.fixtures.length ? save.fixtures[save.round].find(f => f.h === save.clubId || f.a === save.clubId) : null; }

function tabHome(app, save, el) {
  const fx = nextFixture(save);
  const st = save.stats;
  const tbl = sortTable(save.table);
  el.innerHTML = `<div class="grid2"><div class="col">
    <div class="panel col">${fx ? `
      <h3>다음 경기 · ${save.round + 1}라운드</h3>
      <div class="row" style="justify-content:space-around"><div style="text-align:center">${crest(CLUB_BY_ID[fx.h], 'lg')}<div style="font-weight:700;margin-top:6px">${esc(CLUB_BY_ID[fx.h].name)}</div></div><div class="vs">VS</div><div style="text-align:center">${crest(CLUB_BY_ID[fx.a], 'lg')}<div style="font-weight:700;margin-top:6px">${esc(CLUB_BY_ID[fx.a].name)}</div></div></div>
      <div class="row" style="justify-content:center"><button class="btn primary" id="play" style="font-size:18px">⚽ 경기 출전</button><button class="btn" id="sim">⏩ 시뮬레이션</button></div>
      <div class="small muted" style="text-align:center">경기 중 카메라: C키로 '선수 시점' 전환 · 동료가 공을 가졌을 때 J로 패스 요청</div>` : `<h3>시즌 종료</h3><p class="lead">팀 최종 순위 ${tbl.findIndex(r => r.id === save.clubId) + 1}위</p>${save.offers.length ? `<h3>이적 제안</h3>${save.offers.map((o, i) => `<div class="row news">${crest(CLUB_BY_ID[o.club])}<div class="grow"><b>${esc(CLUB_BY_ID[o.club].name)}</b> <span class="small muted">팀 OVR ${clubOvr(o.club)} · 주급 €${o.wage}K</span></div><button class="btn sm primary" data-acc="${i}">수락</button></div>`).join('')}` : ''}<button class="btn primary" id="next">${save.offers.length ? '현 소속팀 잔류 · ' : ''}다음 시즌 →</button>`}
    </div>
    <div class="panel"><h3>이번 시즌</h3><div class="grid3" style="gap:8px;text-align:center"><div><div class="big-num">${st.apps}</div><div class="small muted">출전</div></div><div><div class="big-num accent">${st.goals}</div><div class="small muted">골</div></div><div><div class="big-num">${st.assists}</div><div class="small muted">도움</div></div></div><div class="kv"><span>평균 평점</span><b>${st.apps ? (st.rsum / st.apps).toFixed(2) : '-'}</b></div><div class="kv"><span>경험치</span><span>${save.xp % 100}/100 (스킬 포인트 ${save.sp})</span></div></div>
  </div><div class="col"><div class="panel"><h3>뉴스</h3>${save.news.slice(-7).reverse().map(n => `<div class="news">${n.t}</div>`).join('')}</div></div></div>`;
  if (fx) { el.querySelector('#play').onclick = () => playRound(app, save, true); el.querySelector('#sim').onclick = () => playRound(app, save, false); }
  else {
    el.querySelector('#next').onclick = () => newSeason(app, save, null);
    el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => newSeason(app, save, save.offers[+b.dataset.acc]));
  }
}

async function playRound(app, save, play) {
  const fx = nextFixture(save);
  const home = fx.h === save.clubId;
  const mine = myTeam(save);
  const otherId = home ? fx.a : fx.h;
  let gh, ga, myR = 6, myG = 0, myA = 0;
  if (play) {
    const mk = (id) => id === save.clubId ? buildTeam(id, { players: mine.players, formation: mine.formation, lineup: mine.lineup }) : buildTeam(id);
    const H = mk(fx.h), A = mk(fx.a);
    // keep my name on the shirt
    const res = await app.playMatch({ home: H, away: A, kits: kitColors(H.club, A.club), difficulty: save.difficulty, humans: [{ slot: 0, team: home ? 0 : 1, lock: mine.lockTi }], camera: app.settings.camera, highlightId: 'me' });
    if (!res || res.aborted) { gh = home ? 0 : 1; ga = home ? 1 : 0; myR = 5.0; save.news.push({ t: '경기를 중도 포기했습니다. 감독의 신뢰가 떨어졌습니다.' }); }
    else {
      [gh, ga] = res.score;
      const r = res.ratings.find(x => x.id === 'me');
      if (r) { myR = r.rating; myG = r.goals; myA = r.assists; }
      for (const x of res.ratings) if (x.goals || x.assists) { const e = save.scorers[x.id] || (save.scorers[x.id] = { n: x.name, c: x.team === 0 ? fx.h : fx.a, g: 0, a: 0 }); e.g += x.goals; e.a += x.assists; }
    }
  } else {
    const r = simFixture(home ? mine.players : generateSquad(otherId), home ? generateSquad(otherId) : mine.players);
    gh = r.gh; ga = r.ga;
    addScorers(save.scorers, r.hs, fx.h); addScorers(save.scorers, r.as, fx.a);
    const list = home ? r.hs : r.as;
    myG = list.filter(s => s.id === 'me').length; myA = list.filter(s => s.assist?.id === 'me').length;
    const my = home ? gh : ga, op = home ? ga : gh;
    myR = Math.max(4.5, Math.min(10, 6.2 + (save.me.ovr - strength(mine.players)) * 0.04 + myG * 0.9 + myA * 0.5 + (my > op ? 0.3 : my < op ? -0.3 : 0) + (Math.random() - 0.5) * 1.2));
    myR = Math.round(myR * 10) / 10;
  }
  fx.s = [gh, ga];
  applyResult(save.table, fx.h, fx.a, gh, ga);
  for (const f of save.fixtures[save.round]) {
    if (f === fx) continue;
    const r = simFixture(generateSquad(f.h), generateSquad(f.a));
    f.s = [r.gh, r.ga]; applyResult(save.table, f.h, f.a, r.gh, r.ga);
    addScorers(save.scorers, r.hs, f.h); addScorers(save.scorers, r.as, f.a);
  }
  // progression
  const xp = Math.round(myR * 9 + myG * 18 + myA * 10 + (play ? 10 : 0));
  const before = Math.floor(save.xp / 100);
  save.xp += xp;
  const gained = Math.floor(save.xp / 100) - before;
  save.sp += gained;
  const st = save.stats; st.apps++; st.goals += myG; st.assists += myA; st.rsum += myR;
  const c = save.career; c.apps++; c.goals += myG; c.assists += myA;
  const my = home ? gh : ga, op = home ? ga : gh;
  save.news.push({ t: `${my > op ? '🟢' : my < op ? '🔴' : '⚪'} ${esc(CLUB_BY_ID[fx.h].short)} ${gh}-${ga} ${esc(CLUB_BY_ID[fx.a].short)} · 평점 <b>${myR.toFixed(1)}</b>${myG ? ` · ⚽ ${myG}골` : ''}${myA ? ` · 🅰 ${myA}도움` : ''} · +${xp} XP${gained ? ` · <b class="accent">스킬 포인트 +${gained}</b>` : ''}` });
  if (myR >= 8.5) save.news.push({ t: `⭐ 현지 언론: "<b>${esc(save.me.name)}</b>, 오늘 경기의 주인공!"` });
  save.round++;
  if (save.round >= save.fixtures.length) makeOffers(save);
  save.news = save.news.slice(-30);
  await persist(app, save);
  hub(app, save, 'home');
  if (gained) toast(`스킬 포인트 +${gained}! '성장' 탭에서 능력치를 올리세요.`);
}

function makeOffers(save) {
  const st = save.stats;
  const avg = st.apps ? st.rsum / st.apps : 6;
  save.offers = [];
  const cur = clubOvr(save.clubId);
  const target = save.me.ovr + (avg - 6.5) * 4;
  const cands = ALL_CLUBS.filter(c => c.id !== save.clubId && clubOvr(c.id) > cur - 2 && clubOvr(c.id) <= Math.max(cur + 2, target + 4)).sort(() => Math.random() - 0.5);
  const n = avg >= 7.2 ? 3 : avg >= 6.7 ? 2 : avg >= 6.3 ? 1 : 0;
  for (const c of cands.slice(0, n)) save.offers.push({ club: c.id, wage: Math.round(playerValue(save.me.ovr, save.me.age) * 4 + clubOvr(c.id) - 55) });
  if (n) save.news.push({ t: `📨 시즌 평점 ${avg.toFixed(2)} — <b>${n}개 클럽</b>에서 이적 제안이 도착했습니다!` });
}

async function newSeason(app, save, offer) {
  const tbl = sortTable(save.table);
  const pos = tbl.findIndex(r => r.id === save.clubId) + 1;
  const st = save.stats;
  save.history.push({ season: save.season, club: save.clubId, apps: st.apps, goals: st.goals, assists: st.assists, avg: st.apps ? +(st.rsum / st.apps).toFixed(2) : 0, pos, ovr: save.me.ovr });
  if (pos === 1) save.career.trophies++;
  if (offer) {
    save.clubId = offer.club; save.leagueId = CLUB_BY_ID[offer.club].league; save.wage = offer.wage;
    if (!save.career.clubs.includes(offer.club)) save.career.clubs.push(offer.club);
    save.news.push({ t: `✈️ <b>${esc(save.me.name)}</b>, ${esc(CLUB_BY_ID[offer.club].name)}로 이적!` });
  }
  save.me.age++;
  // natural growth (young players) — skill points do the rest
  if (save.me.age <= 23) { save.sp += 2; }
  if (save.me.age >= 31) for (const k of ['pac', 'phy']) save.me.attrs[k] = Math.max(30, save.me.attrs[k] - 2);
  save.me.ovr = calcOvr(save.me.pos, save.me.attrs);
  save.season++; save.round = 0; save.offers = [];
  const ids = leagueClubs(save.leagueId);
  save.fixtures = roundRobin(ids.slice().sort(() => Math.random() - 0.5)); save.table = newTable(ids); save.scorers = {};
  save.stats = { apps: 0, goals: 0, assists: 0, rsum: 0 };
  save.news.push({ t: `🆕 ${save.season}/${(save.season + 1) % 100} 시즌 개막 — ${esc(CLUB_BY_ID[save.clubId].name)}` });
  await persist(app, save);
  hub(app, save);
}

function tabDev(app, save, el) {
  const me = save.me;
  const cap = Math.min(99, (me.pot || 90) + 6);
  const cost = (v) => v >= 90 ? 3 : v >= 80 ? 2 : 1;
  const render = () => {
    el.innerHTML = `<div class="grid2"><div class="panel"><h3>능력치 · 스킬 포인트 <span class="accent">${save.sp}</span></h3>${attrBars(me.pos, me.attrs, { disabled: false })}<p class="small muted">능력치 80 이상은 2포인트, 90 이상은 3포인트가 필요합니다. 경기 평점과 골/도움으로 경험치를 얻습니다.</p></div>
      <div class="panel"><h3>선수 정보</h3><div class="kv"><span>종합 능력치</span><b class="accent">${me.ovr}</b></div><div class="kv"><span>잠재력</span><b>${me.pot}</b></div><div class="kv"><span>나이</span><span>${me.age}</span></div><div class="kv"><span>포지션</span><span>${me.pos}</span></div><div class="kv"><span>주급</span><span>€${save.wage}K</span></div><div class="kv"><span>시장 가치</span><span>${money(playerValue(me.ovr, me.age))}</span></div></div></div>`;
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => {
      const k = b.dataset.up; const c = cost(me.attrs[k]);
      if (save.sp < c) return toast(`스킬 포인트가 부족합니다 (필요: ${c}).`, true);
      if (me.attrs[k] >= cap) return toast('이 능력치는 최대치입니다.', true);
      save.sp -= c; me.attrs[k]++; me.ovr = calcOvr(me.pos, me.attrs);
      await persist(app, save); hub(app, save, 'dev');
    });
  };
  render();
}
function tabTable(app, save, el) {
  const tbl = sortTable(save.table);
  const top = Object.entries(save.scorers).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.g - a.g).slice(0, 12);
  el.innerHTML = `<div class="grid2"><div class="panel scroll" style="max-height:70vh"><table class="tbl"><tr><th>#</th><th>클럽</th><th class="num">경기</th><th class="num">득실</th><th class="num">승점</th></tr>${tbl.map((r, i) => `<tr class="${r.id === save.clubId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(CLUB_BY_ID[r.id].name)}</td><td class="num">${r.p}</td><td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</table></div>
    <div class="panel"><h3>득점 순위</h3><table class="tbl">${top.map((s, i) => `<tr class="${s.id === 'me' ? 'me' : ''}"><td>${i + 1}</td><td>${esc(s.n)}</td><td class="small">${esc(CLUB_BY_ID[s.c]?.short || '')}</td><td class="num"><b>${s.g}</b></td></tr>`).join('') || '<tr><td class="muted">기록 없음</td></tr>'}</table></div></div>`;
}
function tabCareer(app, save, el) {
  const c = save.career;
  el.innerHTML = `<div class="grid2"><div class="panel"><h3>통산 기록</h3><div class="grid3" style="text-align:center;gap:8px"><div><div class="big-num">${c.apps}</div><div class="small muted">출전</div></div><div><div class="big-num accent">${c.goals}</div><div class="small muted">골</div></div><div><div class="big-num">${c.assists}</div><div class="small muted">도움</div></div></div><div class="kv"><span>리그 우승</span><span>${c.trophies} 🏆</span></div><div class="kv"><span>소속 클럽</span><span>${c.clubs.map(id => esc(CLUB_BY_ID[id].short)).join(' → ')}</span></div></div>
    <div class="panel"><h3>시즌별</h3><table class="tbl"><tr><th>시즌</th><th>클럽</th><th class="num">경기</th><th class="num">골</th><th class="num">도움</th><th class="num">평점</th><th class="num">OVR</th></tr>${save.history.map(h => `<tr><td>${h.season}</td><td>${esc(CLUB_BY_ID[h.club].short)}</td><td class="num">${h.apps}</td><td class="num">${h.goals}</td><td class="num">${h.assists}</td><td class="num">${h.avg}</td><td class="num">${h.ovr}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">첫 시즌 진행 중</td></tr>'}</table></div></div>`;
}

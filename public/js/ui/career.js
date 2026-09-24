// Manager career mode.
import { LEAGUE_BY_ID, CLUB_BY_ID, LEAGUES } from '/shared/data/leagues.js';
import { generateSquad, buildTeam, kitColors, pickLineup, FORMATIONS, FORMATION_NAMES } from '/shared/squad.js';
import { roundRobin, newTable, applyResult, sortTable, simFixture, addScorers, developPlayer, youthPlayer, allPlayers, leagueClubs, strength } from '/shared/career.js';
import { esc, toast, crest, modal, confirmBox, posTag, money, posGroup, textOn } from './dom.js';
import { teamPicker, clubCard, clubOvr, bindGo, DIFFS } from './menus.js';

const SLOTS = ['manager1', 'manager2', 'manager3'];

export async function careerEntry(app) {
  const saves = await app.api.listSaves();
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">감독 커리어</h1><p class="subtitle">클럽을 맡아 시즌을 치르고, 선수를 영입하고, 트로피를 들어올리세요. ${app.api.loggedIn ? '☁️ 클라우드 저장 사용 중' : '💾 로그인하지 않으면 이 브라우저에만 저장됩니다.'}</p></div><button class="btn ghost" data-go="main">← 메인 메뉴</button></div>
    <div class="grid3">${SLOTS.map((s, i) => {
      const sv = saves[s]; const sm = sv?.summary;
      return `<div class="panel col"><h3>슬롯 ${i + 1}</h3>${sm ? `<div class="row">${crest(CLUB_BY_ID[sm.club] || { c1: '#333', c2: '#555', short: '?' })}<div><b>${esc(CLUB_BY_ID[sm.club]?.name || sm.club)}</b><div class="small muted">${esc(sm.manager || '')} · ${sm.season}/${(sm.season + 1) % 100} 시즌 · ${sm.round}라운드</div></div></div><div class="row"><button class="btn primary" data-load="${s}">이어하기</button><button class="btn danger sm" data-del="${s}">삭제</button></div>` : `<p class="muted">비어 있음</p><button class="btn purple" data-new="${s}">새 커리어</button>`}</div>`;
    }).join('')}</div></div>`);
  bindGo(app, root);
  root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => newCareer(app, b.dataset.new));
  root.querySelectorAll('[data-load]').forEach(b => b.onclick = async () => { const d = await app.api.loadSave(b.dataset.load); if (!d) return toast('저장 데이터를 불러올 수 없습니다.', true); hub(app, d); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('이 커리어를 삭제할까요? 되돌릴 수 없습니다.', '삭제')) { await app.api.deleteSave(b.dataset.del); careerEntry(app); } });
}

function newCareer(app, slot) {
  let club = 'tot';
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">새 감독 커리어</h1><p class="subtitle">맡을 클럽을 선택하세요.</p></div><button class="btn ghost" id="back">← 뒤로</button></div>
    <div class="grid2" style="flex:1;min-height:0"><div class="panel"><div id="pick"></div></div>
    <div class="panel col"><div id="card"></div>
      <label class="fld">감독 이름<input class="inp" id="mname" maxlength="20" value="${esc(app.api.user?.nickname || '신임')}"></label>
      <label class="fld">경기 난이도<select class="inp" id="diff">${DIFFS.map((d, i) => `<option value="${i}" ${i === app.settings.difficulty ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <div id="info" class="small muted"></div>
      <button class="btn primary" id="start">커리어 시작</button></div></div></div>`);
  root.querySelector('#back').onclick = () => careerEntry(app);
  const upd = () => {
    root.querySelector('#card').innerHTML = clubCard(club);
    const c = CLUB_BY_ID[club];
    root.querySelector('#info').innerHTML = `리그: ${esc(c.leagueName)} (${LEAGUE_BY_ID[c.league].clubs.length}개 팀, ${(LEAGUE_BY_ID[c.league].clubs.length - 1) * 2}라운드)<br>이적 예산: <b class="accent">${money(startBudget(club))}</b>`;
  };
  teamPicker(root.querySelector('#pick'), { value: club, onChange: (id) => { club = id; upd(); } });
  upd();
  root.querySelector('#start').onclick = async () => {
    const c = CLUB_BY_ID[club];
    const ids = leagueClubs(c.league);
    const save = {
      v: 1, type: 'manager', slot, manager: root.querySelector('#mname').value.trim() || '신임', clubId: club, leagueId: c.league,
      season: 2027, round: 0, budget: startBudget(club), difficulty: +root.querySelector('#diff').value,
      formation: '4-3-3', lineup: null, squad: generateSquad(club).map(p => ({ ...p, apps: 0, goals: 0, assists: 0, rsum: 0 })), mods: {},
      fixtures: roundRobin(shuffle(ids)), table: newTable(ids), scorers: {}, news: [{ t: `${c.name} 이사회가 새 감독 ${esc(root.querySelector('#mname').value.trim() || '신임')}의 부임을 발표했습니다. 목표: ${objective(club)}` }], history: [],
    };
    await persist(app, save);
    hub(app, save);
  };
}
const startBudget = (club) => Math.max(5, Math.round((clubOvr(club) - 60) * 5));
function objective(club) {
  const c = CLUB_BY_ID[club];
  const rank = leagueClubs(c.league).map(id => ({ id, o: clubOvr(id) })).sort((a, b) => b.o - a.o).findIndex(x => x.id === club);
  return rank < 2 ? '리그 우승' : rank < 5 ? '상위 4위 진입' : rank < 10 ? '중위권 안착' : '1부 리그 잔류';
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function persist(app, save) {
  save.summary = { club: save.clubId, season: save.season, round: save.round, manager: save.manager };
  const where = await app.api.writeSave(save.slot, save);
  return where;
}
function squadOf(save, clubId) {
  if (clubId === save.clubId) return save.squad;
  const mod = save.mods[clubId];
  const base = generateSquad(clubId);
  if (!mod) return base;
  return base.filter(p => !mod.out.includes(p.id)).concat(mod.in || []);
}
function userLineup(save) {
  const valid = save.lineup && save.lineup.length === FORMATIONS[save.formation].length && save.lineup.every(id => save.squad.some(p => p.id === id));
  const { xi, bench } = pickLineup(save.squad, save.formation, valid ? save.lineup : null);
  save.lineup = xi.map(p => p.id);
  return { xi, bench };
}

// ---------------- hub ----------------
function hub(app, save, tab = 'home') {
  const club = CLUB_BY_ID[save.clubId];
  const done = save.round >= save.fixtures.length;
  const pos = sortTable(save.table).findIndex(r => r.id === save.clubId) + 1;
  const root = app.show(`<div class="screen dim">
    <div class="topbar">
      <div class="row">${crest(club, 'lg')}<div><h1 class="title">${esc(club.name)}</h1><p class="subtitle">${esc(save.manager)} 감독 · ${save.season}/${(save.season + 1) % 100} ${esc(club.leagueName)} · ${done ? '시즌 종료' : `${save.round + 1}/${save.fixtures.length} 라운드`} · 순위 ${pos}위 · 예산 <b class="accent">${money(save.budget)}</b></p></div></div>
      <div class="row"><button class="btn sm" id="savebtn">💾 저장</button><button class="btn ghost" id="quit">메인 메뉴</button></div>
    </div>
    <div class="tabs">${[['home', '홈'], ['squad', '스쿼드 · 전술'], ['transfer', '이적시장'], ['table', '리그 순위'], ['fixtures', '일정'], ['stats', '기록']].map(([k, n]) => `<div class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</div>`).join('')}</div>
    <div id="content" style="flex:1;min-height:0"></div></div>`);
  root.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => hub(app, save, t.dataset.tab));
  root.querySelector('#savebtn').onclick = async () => { const w = await persist(app, save); toast(w === 'cloud' ? '클라우드에 저장되었습니다.' : '이 브라우저에 저장되었습니다.'); };
  root.querySelector('#quit').onclick = async () => { await persist(app, save); app.go('main'); };
  const el = root.querySelector('#content');
  ({ home: tabHome, squad: tabSquad, transfer: tabTransfer, table: tabTable, fixtures: tabFixtures, stats: tabStats })[tab](app, save, el);
}

function nextFixture(save) {
  if (save.round >= save.fixtures.length) return null;
  return save.fixtures[save.round].find(f => f.h === save.clubId || f.a === save.clubId) || null;
}

function tabHome(app, save, el) {
  const fx = nextFixture(save);
  const done = save.round >= save.fixtures.length;
  const tbl = sortTable(save.table);
  const my = tbl.findIndex(r => r.id === save.clubId);
  const recent = [];
  for (let r = save.round - 1; r >= 0 && recent.length < 5; r--) { const f = save.fixtures[r].find(f => f.h === save.clubId || f.a === save.clubId); if (f && f.s) recent.push(f); }
  const opp = fx ? (fx.h === save.clubId ? fx.a : fx.h) : null;
  el.innerHTML = `<div class="grid2">
    <div class="col">
      <div class="panel col">
        ${done ? `<h3>시즌 종료!</h3><p class="lead">최종 순위: <b class="accent">${my + 1}위</b> ${my === 0 ? '🏆 리그 우승!' : ''}</p><button class="btn primary" id="newseason">다음 시즌 시작 →</button>` : `
        <h3>다음 경기 · ${save.round + 1}라운드</h3>
        <div class="row" style="justify-content:space-around">
          <div style="text-align:center">${crest(CLUB_BY_ID[fx.h], 'lg')}<div style="margin-top:6px;font-weight:700">${esc(CLUB_BY_ID[fx.h].name)}</div><div class="small muted">OVR ${Math.round(strength(squadOf(save, fx.h)))}</div></div>
          <div class="vs">VS</div>
          <div style="text-align:center">${crest(CLUB_BY_ID[fx.a], 'lg')}<div style="margin-top:6px;font-weight:700">${esc(CLUB_BY_ID[fx.a].name)}</div><div class="small muted">OVR ${Math.round(strength(squadOf(save, fx.a)))}</div></div>
        </div>
        <div class="small muted" style="text-align:center">${esc(CLUB_BY_ID[fx.h].stadium)} · 상대 순위 ${tbl.findIndex(r => r.id === opp) + 1}위</div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="play" style="font-size:18px">⚽ 경기하기</button><button class="btn" id="sim">⏩ 시뮬레이션</button></div>`}
      </div>
      <div class="panel"><h3>최근 결과</h3>${recent.map(f => fixtureRow(f, save.clubId)).join('') || '<p class="muted">아직 경기가 없습니다.</p>'}</div>
    </div>
    <div class="col">
      <div class="panel"><h3>뉴스</h3>${save.news.slice(-6).reverse().map(n => `<div class="news">${n.t}</div>`).join('')}</div>
      <div class="panel"><h3>순위 요약</h3>${miniTable(save, tbl)}</div>
    </div></div>`;
  if (done) el.querySelector('#newseason').onclick = () => newSeason(app, save);
  else {
    el.querySelector('#play').onclick = () => playRound(app, save, true);
    el.querySelector('#sim').onclick = () => playRound(app, save, false);
  }
}
function fixtureRow(f, me) {
  const H = CLUB_BY_ID[f.h], A = CLUB_BY_ID[f.a];
  return `<div class="fixture ${f.h === me || f.a === me ? 'me' : ''}"><div class="h">${esc(H.name)}</div><div class="s">${f.s ? `${f.s[0]} - ${f.s[1]}` : 'vs'}</div><div>${esc(A.name)}</div></div>`;
}
function miniTable(save, tbl) {
  const my = tbl.findIndex(r => r.id === save.clubId);
  const rows = tbl.map((r, i) => ({ r, i })).filter(({ i }) => i < 5 || Math.abs(i - my) <= 1);
  return `<table class="tbl"><tr><th>#</th><th>클럽</th><th class="num">경기</th><th class="num">득실</th><th class="num">승점</th></tr>${rows.map(({ r, i }) => `<tr class="${r.id === save.clubId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(CLUB_BY_ID[r.id].name)}</td><td class="num">${r.p}</td><td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</table>`;
}

async function playRound(app, save, play) {
  const fx = nextFixture(save);
  if (!fx) return;
  const club = CLUB_BY_ID[save.clubId];
  const userHome = fx.h === save.clubId;
  let gh, ga;
  const news = [];
  if (play) {
    userLineup(save);
    const mk = (id) => id === save.clubId ? buildTeam(id, { players: save.squad, formation: save.formation, lineup: save.lineup }) : buildTeam(id, { players: squadOf(save, id) });
    const home = mk(fx.h), away = mk(fx.a);
    const kits = kitColors(home.club, away.club);
    const res = await app.playMatch({ home, away, kits, difficulty: save.difficulty, humans: [{ slot: 0, team: userHome ? 0 : 1 }], quitWarning: '경기에서 나가면 0-3 몰수패로 처리됩니다. 나가시겠습니까?' });
    if (!res || res.aborted) {
      gh = userHome ? 0 : 3; ga = userHome ? 3 : 0;
      news.push({ t: `경기를 포기하여 <b>0-3 몰수패</b> 처리되었습니다.` });
    } else {
      [gh, ga] = res.score;
      const myTeam = userHome ? 0 : 1;
      for (const r of res.ratings) {
        const clubId = r.team === 0 ? fx.h : fx.a;
        if (r.goals || r.assists) {
          const e = save.scorers[r.id] || (save.scorers[r.id] = { n: r.name, c: clubId, g: 0, a: 0 });
          e.g += r.goals; e.a += r.assists;
        }
        if (r.team === myTeam) { const p = save.squad.find(q => q.id === r.id); if (p) { p.apps = (p.apps || 0) + 1; p.goals = (p.goals || 0) + r.goals; p.assists = (p.assists || 0) + r.assists; p.rsum = (p.rsum || 0) + r.rating; } }
      }
      news.push({ t: `경기 MVP는 <b>${esc(res.motm.name)}</b> (${res.motm.rating.toFixed(1)})` });
    }
  } else {
    const r = simFixture(squadOf(save, fx.h), squadOf(save, fx.a));
    gh = r.gh; ga = r.ga;
    addScorers(save.scorers, r.hs, fx.h); addScorers(save.scorers, r.as, fx.a);
    const mine = userHome ? r.hs : r.as;
    const { xi } = userLineup(save);
    for (const p of xi) { p.apps = (p.apps || 0) + 1; p.rsum = (p.rsum || 0) + 6 + Math.random() * 2; }
    for (const s of mine) { const p = save.squad.find(q => q.id === s.id); if (p) p.goals = (p.goals || 0) + 1; if (s.assist) { const a = save.squad.find(q => q.id === s.assist.id); if (a) a.assists = (a.assists || 0) + 1; } }
  }
  fx.s = [gh, ga];
  applyResult(save.table, fx.h, fx.a, gh, ga);
  const my = userHome ? gh : ga, op = userHome ? ga : gh;
  const oppName = CLUB_BY_ID[userHome ? fx.a : fx.h].name;
  news.unshift({ t: `${my > op ? '🟢 승리' : my < op ? '🔴 패배' : '⚪ 무승부'} — ${esc(club.name)} ${my} : ${op} ${esc(oppName)}` });
  // other fixtures
  for (const f of save.fixtures[save.round]) {
    if (f === fx) continue;
    const r = simFixture(squadOf(save, f.h), squadOf(save, f.a));
    f.s = [r.gh, r.ga];
    applyResult(save.table, f.h, f.a, r.gh, r.ga);
    addScorers(save.scorers, r.hs, f.h); addScorers(save.scorers, r.as, f.a);
  }
  save.round++;
  // mid-season events
  if (Math.random() < 0.25) news.push({ t: transferRumour(save) });
  if (save.round === save.fixtures.length) {
    const tbl = sortTable(save.table);
    const pos = tbl.findIndex(r => r.id === save.clubId) + 1;
    news.push({ t: pos === 1 ? `🏆 <b>${esc(club.name)}, ${save.season}/${(save.season + 1) % 100} ${esc(club.leagueName)} 우승!</b>` : `시즌 종료. 최종 순위 <b>${pos}위</b>. 우승: ${esc(CLUB_BY_ID[tbl[0].id].name)}` });
  }
  save.news.push(...news);
  save.news = save.news.slice(-30);
  await persist(app, save);
  hub(app, save, 'home');
}
function transferRumour(save) {
  const p = allPlayers()[Math.floor(Math.random() * allPlayers().length)];
  const to = LEAGUES[Math.floor(Math.random() * 5)].clubs[Math.floor(Math.random() * 18)];
  return `📰 루머: <b>${esc(p.name)}</b> (${esc(CLUB_BY_ID[p.club].name)})가 ${esc(to?.name || '빅클럽')}의 관심을 받고 있다는 소식입니다.`;
}

async function newSeason(app, save) {
  const tbl = sortTable(save.table);
  const pos = tbl.findIndex(r => r.id === save.clubId) + 1;
  const n = tbl.length;
  const prize = Math.round((n - pos + 1) * 2.5 + (pos === 1 ? 40 : pos <= 4 ? 20 : 0));
  save.history.push({ season: save.season, pos, champion: tbl[0].id, pts: tbl[pos - 1].pts });
  const changes = [];
  for (const p of save.squad) {
    const d = developPlayer(p);
    if (Math.abs(d) >= 2) changes.push(`${esc(p.name)} ${d > 0 ? '▲' : '▼'}${Math.abs(d)}`);
    p.apps = 0; p.goals = 0; p.assists = 0; p.rsum = 0;
  }
  // retirements
  const retired = save.squad.filter(p => p.age >= 37 && Math.random() < 0.6);
  save.squad = save.squad.filter(p => !retired.includes(p));
  // youth academy
  const youth = [0, 1].map(i => youthPlayer(save.clubId, save.season + 1, i));
  save.squad.push(...youth.map(p => ({ ...p, apps: 0, goals: 0, assists: 0, rsum: 0 })));
  save.season++; save.round = 0;
  save.budget = Math.round((save.budget + prize + startBudget(save.clubId) * 0.5) * 10) / 10;
  const ids = leagueClubs(save.leagueId);
  save.fixtures = roundRobin(shuffle(ids)); save.table = newTable(ids); save.scorers = {};
  save.news.push({ t: `🆕 ${save.season}/${(save.season + 1) % 100} 시즌 개막! 상금 ${money(prize)} 지급. 유스 승격: ${youth.map(p => esc(p.name) + ` (${p.pos}, ${p.ovr})`).join(', ')}` });
  if (retired.length) save.news.push({ t: `은퇴: ${retired.map(p => esc(p.name)).join(', ')}` });
  if (changes.length) save.news.push({ t: `선수 성장: ${changes.slice(0, 8).join(' · ')}` });
  await persist(app, save);
  modal(`<h2>${save.season - 1}/${save.season % 100} 시즌 결산</h2><p class="lead">최종 순위 <b class="accent">${pos}위</b>${pos === 1 ? ' 🏆' : ''}<br>상금: ${money(prize)} · 새 예산: ${money(save.budget)}</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>새 시즌으로</button></div>`);
  hub(app, save, 'home');
}

// ---------------- squad ----------------
function tabSquad(app, save, el) {
  const slots = FORMATIONS[save.formation];
  const club = CLUB_BY_ID[save.clubId];
  let sel = null; // {type:'xi', i} | {type:'sq', id}
  const render = () => {
    const { xi } = userLineup(save);
    const others = save.squad.filter(p => !save.lineup.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    el.innerHTML = `<div class="grid2" style="grid-template-columns: minmax(300px, 440px) 1fr">
      <div class="panel col">
        <div class="row"><label class="fld grow">포메이션<select class="inp" id="form">${FORMATION_NAMES.map(f => `<option ${f === save.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label><button class="btn sm" id="auto" style="align-self:flex-end">자동 선발</button></div>
        <div class="pitch-mini">${slots.map((s, i) => { const p = xi[i]; return `<div class="pdot ${sel?.type === 'xi' && sel.i === i ? 'sel' : ''}" data-xi="${i}" style="left:${50 + s[2] * 42}%;top:${94 - s[1] * 100}%"><div class="shirt" style="background:${club.c1};color:${textOn(club.c1)}">${p?.ovr ?? '-'}</div><div class="pn">${esc(s[0])} ${esc(p?.name.split(' ').slice(-1)[0] || '')}</div></div>`; }).join('')}</div>
        <div class="small muted">선발 선수를 클릭한 뒤 교체할 선수를 클릭하세요. 팀 OVR ${Math.round(xi.reduce((s, p) => s + p.ovr, 0) / 11)}</div>
      </div>
      <div class="panel scroll" style="max-height:66vh"><table class="tbl"><tr><th></th><th>이름</th><th>포지션</th><th class="num">나이</th><th class="num">OVR</th><th class="num">POT</th><th class="num">경기</th><th class="num">골</th><th class="num">도움</th><th class="num">평점</th><th class="num">가치</th></tr>
        ${[...xi.map(p => ({ p, xi: true })), ...others.map(p => ({ p, xi: false }))].map(({ p, xi: inXi }) => `<tr class="click ${sel?.type === 'sq' && sel.id === p.id ? 'me' : ''}" data-sq="${p.id}"><td>${inXi ? '🟢' : ''}</td><td>${esc(p.name)}${p.youth ? ' <span class="badge">유스</span>' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${p.age}</td><td class="num ovr">${p.ovr}</td><td class="num muted">${p.pot || '-'}</td><td class="num">${p.apps || 0}</td><td class="num">${p.goals || 0}</td><td class="num">${p.assists || 0}</td><td class="num">${p.apps ? (p.rsum / p.apps).toFixed(1) : '-'}</td><td class="num">${money(p.value)}</td></tr>`).join('')}
      </table></div></div>`;
    el.querySelector('#form').onchange = (e) => { save.formation = e.target.value; save.lineup = null; render(); };
    el.querySelector('#auto').onclick = () => { save.lineup = null; render(); };
    el.querySelectorAll('[data-xi]').forEach(d => d.onclick = () => click({ type: 'xi', i: +d.dataset.xi }));
    el.querySelectorAll('[data-sq]').forEach(d => d.onclick = () => click({ type: 'sq', id: d.dataset.sq }));
  };
  const click = (c) => {
    if (!sel) { sel = c; return render(); }
    const L = save.lineup.slice();
    const idOf = (x) => x.type === 'xi' ? L[x.i] : x.id;
    const a = idOf(sel), b = idOf(c);
    const ia = L.indexOf(a), ib = L.indexOf(b);
    if (ia >= 0 && ib >= 0) { L[ia] = b; L[ib] = a; }
    else if (ia >= 0) L[ia] = b;
    else if (ib >= 0) L[ib] = a;
    save.lineup = L; sel = null; render();
  };
  render();
}

// ---------------- transfers ----------------
function tabTransfer(app, save, el) {
  const f = { pos: '', minOvr: 70, maxPrice: Math.max(5, Math.floor(save.budget)), q: '', league: '' };
  const render = () => {
    const out = new Set(Object.values(save.mods).flatMap(m => m.out || []));
    const mine = new Set(save.squad.map(p => p.id));
    const list = allPlayers().filter(p => p.club !== save.clubId && !out.has(p.id) && !mine.has(p.id)
      && (!f.pos || posGroup(p.pos) === f.pos || p.pos === f.pos) && p.ovr >= f.minOvr && price(p) <= f.maxPrice
      && (!f.league || CLUB_BY_ID[p.club].league === f.league) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())))
      .sort((a, b) => b.ovr - a.ovr).slice(0, 80);
    el.innerHTML = `<div class="grid2" style="grid-template-columns: 1fr minmax(280px, 380px)">
      <div class="panel col" style="min-height:0">
        <div class="row">
          <input class="inp" id="q" placeholder="선수 이름 검색" value="${esc(f.q)}" style="width:170px">
          <select class="inp" id="pos"><option value="">전체 포지션</option>${['GK', 'DEF', 'MID', 'FWD', 'ST', 'LW', 'RW', 'CAM', 'CM', 'CDM', 'CB', 'LB', 'RB'].map(p => `<option ${p === f.pos ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <select class="inp" id="lg"><option value="">전체 리그</option>${LEAGUES.map(l => `<option value="${l.id}" ${l.id === f.league ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
          <label class="small">OVR ≥ <input class="inp" id="mo" type="number" min="40" max="99" value="${f.minOvr}" style="width:70px"></label>
          <label class="small">가격 ≤ €<input class="inp" id="mp" type="number" min="0" value="${f.maxPrice}" style="width:80px">M</label>
        </div>
        <div class="scroll" style="max-height:58vh"><table class="tbl"><tr><th>이름</th><th>포지션</th><th class="num">나이</th><th class="num">OVR</th><th>클럽</th><th class="num">이적료</th><th></th></tr>
          ${list.map(p => `<tr><td>${esc(p.name)}</td><td>${posTag(p.pos)}</td><td class="num">${p.age}</td><td class="num ovr">${p.ovr}</td><td class="small">${esc(CLUB_BY_ID[p.club].name)}</td><td class="num">${money(price(p))}</td><td><button class="btn sm" data-buy="${p.id}" ${price(p) > save.budget ? 'disabled' : ''}>영입</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">조건에 맞는 선수가 없습니다.</td></tr>'}
        </table></div>
      </div>
      <div class="panel col" style="min-height:0"><h3>선수 판매</h3><div class="small muted">예산 ${money(save.budget)} · 스쿼드 ${save.squad.length}명</div>
        <div class="scroll" style="max-height:58vh"><table class="tbl">${save.squad.slice().sort((a, b) => b.ovr - a.ovr).map(p => `<tr><td>${esc(p.name)}</td><td>${posTag(p.pos)}</td><td class="num ovr">${p.ovr}</td><td class="num">${money(p.value)}</td><td><button class="btn sm danger" data-sell="${p.id}">판매</button></td></tr>`).join('')}</table></div></div></div>`;
    const bindF = (id, key, num) => { const e = el.querySelector(id); e.onchange = () => { f[key] = num ? +e.value : e.value; render(); }; };
    bindF('#pos', 'pos'); bindF('#lg', 'league'); bindF('#mo', 'minOvr', true); bindF('#mp', 'maxPrice', true); bindF('#q', 'q');
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
    el.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => sell(b.dataset.sell));
  };
  const price = (p) => Math.round(p.value * (1.15 + (p.ovr >= 85 ? 0.25 : 0)) * 10) / 10;
  const buy = async (id) => {
    const p = allPlayers().find(x => x.id === id);
    const cost = price(p);
    if (save.squad.length >= 32) return toast('스쿼드가 가득 찼습니다 (최대 32명).', true);
    if (cost > save.budget) return toast('예산이 부족합니다.', true);
    const accept = Math.random() < 0.82;
    if (!(await confirmBox(`${p.name} (${p.pos}, OVR ${p.ovr})를 ${money(cost)}에 영입 제안할까요?`, '제안하기'))) return;
    if (!accept) { toast(`${CLUB_BY_ID[p.club].name}이(가) 제안을 거절했습니다.`, true); return; }
    save.budget = Math.round((save.budget - cost) * 10) / 10;
    (save.mods[p.club] ||= { out: [], in: [] }).out.push(p.id);
    const used = new Set(save.squad.map(q => q.num));
    let num = p.num; while (used.has(num)) num++;
    const np = { ...p, num, apps: 0, goals: 0, assists: 0, rsum: 0 }; delete np.club;
    save.squad.push(np);
    save.news.push({ t: `✍️ <b>${esc(p.name)}</b> 영입 완료! (${money(cost)}, ${esc(CLUB_BY_ID[p.club].name)}에서 이적)` });
    await persist(app, save);
    toast(`${p.name} 영입 완료!`);
    render();
  };
  const sell = async (id) => {
    const p = save.squad.find(x => x.id === id);
    if (save.squad.length <= 16) return toast('스쿼드는 최소 16명이 필요합니다.', true);
    if (p.pos === 'GK' && save.squad.filter(x => x.pos === 'GK').length <= 2) return toast('골키퍼는 최소 2명이 필요합니다.', true);
    const clubs = LEAGUE_BY_ID[save.leagueId].clubs.concat(LEAGUES[Math.floor(Math.random() * LEAGUES.length)].clubs).filter(c => c.id !== save.clubId);
    const buyer = clubs[Math.floor(Math.random() * clubs.length)];
    const offer = Math.round(p.value * (0.8 + Math.random() * 0.45) * 10) / 10;
    if (!(await confirmBox(`${buyer.name}이(가) ${p.name}에 대해 ${money(offer)}를 제안했습니다. 수락할까요?`, '판매'))) return;
    save.squad = save.squad.filter(x => x.id !== id);
    if (save.lineup) save.lineup = save.lineup.map(x => x === id ? null : x);
    (save.mods[buyer.id] ||= { out: [], in: [] }).in.push({ ...p });
    save.budget = Math.round((save.budget + offer) * 10) / 10;
    save.news.push({ t: `💸 <b>${esc(p.name)}</b>, ${esc(buyer.name)}로 이적 (${money(offer)})` });
    await persist(app, save);
    render();
  };
  render();
}

function tabTable(app, save, el) {
  const tbl = sortTable(save.table);
  el.innerHTML = `<div class="panel scroll" style="max-height:72vh"><table class="tbl"><tr><th>#</th><th>클럽</th><th class="num">경기</th><th class="num">승</th><th class="num">무</th><th class="num">패</th><th class="num">득점</th><th class="num">실점</th><th class="num">득실</th><th class="num">승점</th><th>최근</th></tr>
    ${tbl.map((r, i) => `<tr class="${r.id === save.clubId ? 'me' : ''}"><td>${i + 1}</td><td><div class="row" style="gap:8px">${crest(CLUB_BY_ID[r.id])}${esc(CLUB_BY_ID[r.id].name)}</div></td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="num"><b>${r.pts}</b></td><td>${r.form.map(x => `<span style="color:${x === 'W' ? '#2fd28a' : x === 'L' ? '#ff5b6e' : '#aaa'}">${x}</span>`).join(' ')}</td></tr>`).join('')}</table></div>`;
}
function tabFixtures(app, save, el) {
  el.innerHTML = `<div class="panel scroll" style="max-height:72vh"><div class="grid3">${save.fixtures.map((rd, i) => `<div><h3 style="margin:8px 0">${i + 1}라운드 ${i === save.round ? '<span class="badge">다음</span>' : ''}</h3>${rd.map(f => fixtureRow(f, save.clubId)).join('')}</div>`).join('')}</div></div>`;
}
function tabStats(app, save, el) {
  const top = Object.entries(save.scorers).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.g - a.g || b.a - a.a).slice(0, 20);
  const ast = Object.entries(save.scorers).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.a - a.a).slice(0, 10);
  el.innerHTML = `<div class="grid2"><div class="panel scroll" style="max-height:72vh"><h3>득점 순위</h3><table class="tbl"><tr><th>#</th><th>선수</th><th>클럽</th><th class="num">골</th><th class="num">도움</th></tr>${top.map((s, i) => `<tr class="${s.c === save.clubId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(s.n)}</td><td class="small">${esc(CLUB_BY_ID[s.c]?.name || '')}</td><td class="num"><b>${s.g}</b></td><td class="num">${s.a}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">기록 없음</td></tr>'}</table></div>
    <div class="col"><div class="panel"><h3>도움 순위</h3><table class="tbl">${ast.map((s, i) => `<tr class="${s.c === save.clubId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(s.n)}</td><td class="num"><b>${s.a}</b></td></tr>`).join('')}</table></div>
    <div class="panel"><h3>역대 시즌</h3>${save.history.map(h => `<div class="kv"><span>${h.season}/${(h.season + 1) % 100}</span><span>${h.pos}위 · ${h.pts}점 ${h.pos === 1 ? '🏆' : ''}</span></div>`).join('') || '<p class="muted">첫 시즌 진행 중</p>'}</div></div></div>`;
}

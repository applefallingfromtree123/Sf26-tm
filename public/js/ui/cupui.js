// Cup competition UI: brackets, penalty shoot-out reveal, standalone kick-off cups
// and helpers used by the career modes.
import { CLUB_BY_ID } from '/shared/data/leagues.js';
import { buildTeam, kitColors } from '/shared/squad.js';
import { CUPS, CUP_BY_ID, createCup, currentTies, userTie, stageName, roundName, simRound, advance, settleTie, clubStrength, dueCup } from '/shared/cups.js';
import { esc, toast, crest, modal, confirmBox } from './dom.js';
import { bindGo, DIFFS, clubCard } from './menus.js';
import { LS } from '../api.js';

const cname = (id) => CLUB_BY_ID[id]?.name || id;
export const cupBadge = (cup) => `<span class="cup-badge" style="--cc:${cup.color}">${cup.icon} ${esc(cup.name)}</span>`;

export function bracketHtml(cup, my) {
  return `<div class="bracket">${cup.rounds.map((ties) => `<div class="br-col"><div class="br-head">${roundName(ties.length * 2)}</div>${ties.map(t => {
    const row = (id, g, pen) => `<div class="br-team ${t.w === id ? 'win' : t.w ? 'lose' : ''} ${id === my ? 'me' : ''}">${crest(CLUB_BY_ID[id])}<span class="grow">${esc(CLUB_BY_ID[id]?.short || id)}</span><b>${t.s ? g : ''}${pen !== undefined && t.pen ? `<small>(${pen})</small>` : ''}</b></div>`;
    return `<div class="br-tie">${row(t.h, t.s?.[0], t.pen?.[0])}${row(t.a, t.s?.[1], t.pen?.[1])}</div>`;
  }).join('')}</div>`).join('')}${cup.winner ? `<div class="br-col"><div class="br-head">우승</div><div class="br-champ">🏆<br>${crest(CLUB_BY_ID[cup.winner], 'lg')}<b>${esc(cname(cup.winner))}</b></div></div>` : ''}</div>`;
}

// animated penalty shoot-out (results already decided in tie.kicks)
export function showShootout(tie) {
  return new Promise((res) => {
    const kicks = tie.kicks || [];
    const m = modal(`<div class="pso"><h2>승부차기</h2><div class="pso-row"><span>${esc(cname(tie.h))}</span><div class="pso-k" id="ph"></div><b id="psh">0</b></div><div class="pso-row"><span>${esc(cname(tie.a))}</span><div class="pso-k" id="pa"></div><b id="psa">0</b></div><div id="pso-res" class="lead" style="text-align:center;min-height:28px"></div><div class="row" style="justify-content:center"><button class="btn primary hidden" id="pso-ok">확인</button></div></div>`, { dismiss: false, onClose: () => res() });
    let i = 0, a = 0, b = 0;
    const step = () => {
      const flat = []; kicks.forEach(([h, aw]) => { flat.push(['h', h]); if (aw !== null && aw !== undefined) flat.push(['a', aw]); });
      if (i >= flat.length) {
        m.el.querySelector('#pso-res').innerHTML = `<b class="accent">${esc(cname(tie.w))}</b> 승리! (${tie.pen[0]} - ${tie.pen[1]})`;
        const ok = m.el.querySelector('#pso-ok'); ok.classList.remove('hidden'); ok.onclick = () => m.close();
        return;
      }
      const [side, goal] = flat[i++];
      m.el.querySelector(side === 'h' ? '#ph' : '#pa').insertAdjacentHTML('beforeend', `<i class="${goal ? 'g' : 'x'}">${goal ? '⚽' : '✕'}</i>`);
      if (goal) { if (side === 'h') a++; else b++; }
      m.el.querySelector('#psh').textContent = a; m.el.querySelector('#psa').textContent = b;
      setTimeout(step, 650);
    };
    setTimeout(step, 500);
  });
}

// silently simulate due cup rounds where the user is not involved (or already out)
export function processDueCups(cups, round, clubId, strength = clubStrength, news = null) {
  for (let guard = 0; guard < 40; guard++) {
    const cup = dueCup(cups, round);
    if (!cup || userTie(cup, clubId)) return cup && userTie(cup, clubId) ? cup : null;
    const stage = stageName(cup);
    simRound(cup, strength); const done = advance(cup);
    if (done && news) news.push({ t: `${cup.icon} ${esc(cup.name)} 우승: <b>${esc(cname(cup.winner))}</b>` });
    else if (news && stage === '결승') news.push({ t: `${cup.icon} ${esc(cup.name)} 결승 진출 팀이 가려졌습니다.` });
  }
  return null;
}

// settle the user's tie after a match and play out the rest of the round
export async function finishCupTie(cup, tie, gh, ga, clubId, strength = clubStrength) {
  settleTie(tie, gh, ga);
  if (tie.pen) await showShootout(tie);
  simRound(cup, strength);
  const champion = advance(cup);
  const stage = stageName(cup); // the round the winner advances to
  const won = tie.w === clubId;
  return { won, stage, champion: champion && cup.winner === clubId, finished: champion };
}

export function cupsTab(cups, clubId) {
  if (!cups?.length) return '<div class="panel"><p class="muted">이번 시즌 참가하는 컵 대회가 없습니다.</p></div>';
  return cups.map(c => `<div class="panel" style="margin-bottom:14px"><div class="row">${cupBadge(c)}<span class="muted small">${c.winner ? (c.winner === clubId ? '🏆 우승!' : `우승: ${esc(cname(c.winner))}`) : userTie(c, clubId) ? `${stageName(c)} ${c.round ? "진출" : "대기"}` : '탈락'}${c.schedule && !c.winner ? ` · 다음 라운드: 리그 ${c.schedule[c.round] + 1}라운드 이후` : ''}</span></div>${bracketHtml(c, clubId)}</div>`).join('');
}

// ---------------- kick-off cup mode ----------------
export function kickoffCupEntry(app) {
  const saved = LS.get('sf_kcup', null);
  if (saved && saved.cup && !saved.cup.winner) return cupHub(app, saved);
  const st = { cup: 'ucl', club: null, diff: app.settings.difficulty };
  const render = () => {
    const def = CUP_BY_ID[st.cup];
    const preview = createCup(st.cup, { seed: 1 });
    const teams = preview.rounds[0].flatMap(t => [t.h, t.a]).sort((a, b) => clubStrength(b) - clubStrength(a));
    if (!teams.includes(st.club)) st.club = teams[0];
    const root = app.show(`<div class="screen dim">
      <div class="topbar"><div><h1 class="title">컵 대회</h1><p class="subtitle">대회를 고르고 우승에 도전하세요. 토너먼트 · 무승부 시 승부차기</p></div><div class="row"><button class="btn ghost" id="back">← 킥오프</button></div></div>
      <div class="cup-list">${CUPS.map(c => `<div class="cup-tile ${c.id === st.cup ? 'on' : ''}" data-cup="${c.id}" style="--cc:${c.color}"><div class="cup-ico">${c.icon}</div><b>${esc(c.name)}</b><span>${c.size}개 팀 · ${roundName(c.size)}부터</span></div>`).join('')}</div>
      <div class="grid2" style="margin-top:14px"><div class="panel"><h3>${def.icon} ${esc(def.name)} — 참가 클럽 선택</h3><div class="club-grid">${teams.map(id => `<div class="club ${id === st.club ? 'on' : ''}" data-club="${id}">${crest(CLUB_BY_ID[id])}<span class="nm">${esc(CLUB_BY_ID[id].name)}</span><span class="ov">${clubStrength(id)}</span></div>`).join('')}</div></div>
      <div class="panel col"><div id="kc-card">${clubCard(st.club)}</div>
        <label class="fld">난이도<select class="inp" id="kdiff">${DIFFS.map((d, i) => `<option value="${i}" ${i === st.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <button class="btn primary" id="kgo" style="font-size:18px">🏆 대회 시작</button>
        <p class="small muted" style="margin:0">내 경기는 직접 플레이하거나 시뮬레이션할 수 있고, 다른 경기는 자동으로 진행됩니다. 진행 상황은 자동 저장됩니다.</p></div></div></div>`);
    root.querySelector('#back').onclick = () => app.go('kickoff');
    root.querySelectorAll('[data-cup]').forEach(t => t.onclick = () => { st.cup = t.dataset.cup; st.club = null; render(); });
    root.querySelectorAll('[data-club]').forEach(t => t.onclick = () => { st.club = t.dataset.club; render(); });
    root.querySelector('#kdiff').onchange = (e) => { st.diff = +e.target.value; };
    root.querySelector('#kgo').onclick = () => {
      const data = { cup: createCup(st.cup, { include: st.club, seed: (Math.random() * 1e9) | 0 }), club: st.club, diff: st.diff };
      LS.set('sf_kcup', data);
      cupHub(app, data);
    };
  };
  render();
}

function cupHub(app, data) {
  const { cup, club } = data;
  const tie = userTie(cup, club);
  const root = app.show(`<div class="screen dim">
    <div class="topbar"><div><h1 class="title">${cup.icon} ${esc(cup.name)}</h1><p class="subtitle">${esc(cname(club))} · ${cup.winner ? '대회 종료' : stageName(cup)} · 난이도 ${DIFFS[data.diff]}</p></div><div class="row"><button class="btn danger sm" id="abandon">대회 포기</button><button class="btn ghost" data-go="main">메인 메뉴</button></div></div>
    <div class="panel col" style="margin-bottom:14px">${cup.winner ? `<div class="lead" style="text-align:center">${cup.winner === club ? `<div class="cup-champ">🏆 우승! 🏆</div><b>${esc(cname(club))}</b>이(가) ${esc(cup.name)} 정상에 올랐습니다!` : `우승: <b>${esc(cname(cup.winner))}</b>`}</div><div class="row" style="justify-content:center"><button class="btn primary" id="newcup">새 대회</button></div>`
      : tie ? `<h3>${stageName(cup)} 경기</h3><div class="row" style="justify-content:space-around"><div style="text-align:center">${crest(CLUB_BY_ID[tie.h], 'lg')}<div><b>${esc(cname(tie.h))}</b></div><div class="small muted">OVR ${clubStrength(tie.h)}</div></div><div class="vs">VS</div><div style="text-align:center">${crest(CLUB_BY_ID[tie.a], 'lg')}<div><b>${esc(cname(tie.a))}</b></div><div class="small muted">OVR ${clubStrength(tie.a)}</div></div></div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="play" style="font-size:18px">⚽ 경기하기</button><button class="btn" id="sim">⏩ 시뮬레이션</button></div><p class="small muted" style="text-align:center;margin:0">무승부면 승부차기로 승자를 가립니다.</p>`
      : `<p class="lead">탈락했습니다. 남은 경기를 지켜보세요.</p><div class="row"><button class="btn primary" id="simrest">끝까지 시뮬레이션</button><button class="btn" id="newcup2">새 대회</button></div>`}</div>
    <div class="panel scroll">${bracketHtml(cup, club)}</div></div>`);
  bindGo(app, root);
  const save = () => LS.set('sf_kcup', data);
  root.querySelector('#abandon').onclick = async () => { if (await confirmBox('진행 중인 대회를 포기할까요?', '포기')) { LS.set('sf_kcup', null); kickoffCupEntry(app); } };
  const nc = () => { LS.set('sf_kcup', null); kickoffCupEntry(app); };
  root.querySelector('#newcup')?.addEventListener('click', nc);
  root.querySelector('#newcup2')?.addEventListener('click', nc);
  root.querySelector('#simrest')?.addEventListener('click', () => { while (!cup.winner) { simRound(cup); advance(cup); } save(); cupHub(app, data); });
  const go = async (play) => {
    let gh, ga;
    if (play) {
      const H = buildTeam(tie.h), A = buildTeam(tie.a);
      const res = await app.playMatch({ home: H, away: A, kits: kitColors(H.club, A.club), difficulty: data.diff, humans: [{ slot: 0, team: tie.h === club ? 0 : 1 }], quitWarning: '경기에서 나가면 0-3 패배로 탈락합니다. 나가시겠습니까?' });
      if (!res || res.aborted) { [gh, ga] = tie.h === club ? [0, 3] : [3, 0]; } else [gh, ga] = res.score;
    } else { const { quickSim } = await import('/shared/sim.js'); [gh, ga] = quickSim(clubStrength(tie.h), clubStrength(tie.a), Math.random, 0.1); }
    const out = await finishCupTie(cup, tie, gh, ga, club);
    save();
    cupHub(app, data);
    if (out.champion) app.audio.cheer(true);
    toast(out.won ? (out.champion ? `🏆 ${cup.name} 우승!` : `${out.stage} 진출!`) : '탈락했습니다...', !out.won);
  };
  root.querySelector('#play')?.addEventListener('click', () => go(true));
  root.querySelector('#sim')?.addEventListener('click', () => go(false));
}
export { currentTies };

// Cup competitions: knockout brackets with penalty shoot-outs, used by kick-off
// (standalone cup runs) and by the career modes (cup rounds interleaved with the league).
import { LEAGUES, LEAGUE_BY_ID, CLUB_BY_ID, ALL_CLUBS } from './data/leagues.js';
import { generateSquad, teamRating, rng, hashStr } from './squad.js';
import { quickSim } from './sim.js';

const EUROPE = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'eredivisie', 'ligaportugal', 'superlig', 'spfl'];
const ratings = new Map();
export const clubStrength = (id) => { if (!ratings.has(id)) ratings.set(id, teamRating(generateSquad(id))); return ratings.get(id); };
const byStrength = (ids) => ids.slice().sort((a, b) => clubStrength(b) - clubStrength(a));
const leagueIds = (lg) => LEAGUE_BY_ID[lg].clubs.map(c => c.id);

// pool(): candidate clubs, strongest first
export const CUPS = [
  { id: 'ucl', name: 'UEFA 챔피언스 리그', icon: '⭐', color: '#1b3fa8', size: 32, kind: 'continental', prize: 60, pool: () => byStrength(ALL_CLUBS.filter(c => EUROPE.includes(c.league)).map(c => c.id)) },
  { id: 'uel', name: 'UEFA 유로파 리그', icon: '🟠', color: '#f26a1b', size: 16, kind: 'continental', prize: 25, pool: () => byStrength(ALL_CLUBS.filter(c => EUROPE.includes(c.league)).map(c => c.id)).slice(32) },
  { id: 'cwc', name: 'FIFA 클럽 월드컵', icon: '🌍', color: '#c9a227', size: 16, kind: 'world', prize: 80, pool: () => byStrength(LEAGUES.flatMap(l => byStrength(leagueIds(l.id)).slice(0, l.id === 'epl' || l.id === 'laliga' ? 3 : 1))) },
  { id: 'acl', name: 'AFC 챔피언스 리그 엘리트', icon: '🌏', color: '#0c7b5f', size: 16, kind: 'continental', prize: 20, pool: () => byStrength([...leagueIds('kleague'), ...leagueIds('spl')]) },
  { id: 'lib', name: '코파 리베르타도레스', icon: '🏆', color: '#2e7d32', size: 8, kind: 'continental', prize: 15, pool: () => byStrength(leagueIds('sudamerica')) },
  { id: 'fac', name: 'FA컵', icon: '🏴', color: '#c8102e', size: 16, kind: 'domestic', league: 'epl', prize: 8 },
  { id: 'cdr', name: '코파 델 레이', icon: '👑', color: '#aa151b', size: 16, kind: 'domestic', league: 'laliga', prize: 6 },
  { id: 'cit', name: '코파 이탈리아', icon: '🇮🇹', color: '#008c45', size: 16, kind: 'domestic', league: 'seriea', prize: 6 },
  { id: 'dfb', name: 'DFB 포칼', icon: '🇩🇪', color: '#222222', size: 16, kind: 'domestic', league: 'bundesliga', prize: 6 },
  { id: 'cdf', name: '쿠프 드 프랑스', icon: '🇫🇷', color: '#0055a4', size: 16, kind: 'domestic', league: 'ligue1', prize: 5 },
  { id: 'kor', name: '코리아컵', icon: '🇰🇷', color: '#cd2e3a', size: 8, kind: 'domestic', league: 'kleague', prize: 2 },
  { id: 'knv', name: 'KNVB 베이커', icon: '🇳🇱', color: '#f36c21', size: 16, kind: 'domestic', league: 'eredivisie', prize: 3 },
  { id: 'tdp', name: '타사 드 포르투갈', icon: '🇵🇹', color: '#006600', size: 16, kind: 'domestic', league: 'ligaportugal', prize: 3 },
  { id: 'tkc', name: '튀르키예 컵', icon: '🇹🇷', color: '#e30a17', size: 8, kind: 'domestic', league: 'superlig', prize: 2 },
  { id: 'ksc', name: '킹스컵', icon: '🇸🇦', color: '#006c35', size: 16, kind: 'domestic', league: 'spl', prize: 4 },
  { id: 'scc', name: '스코티시컵', icon: '🏴', color: '#005eb8', size: 8, kind: 'domestic', league: 'spfl', prize: 2 },
  { id: 'uoc', name: 'US 오픈컵', icon: '🇺🇸', color: '#002868', size: 8, kind: 'domestic', league: 'mls', prize: 2 },
  { id: 'sfs', name: 'SF 슈퍼컵', icon: '⚡', color: '#7c5cff', size: 8, kind: 'world', prize: 15, pool: () => byStrength(ALL_CLUBS.map(c => c.id)) },
];
export const CUP_BY_ID = Object.fromEntries(CUPS.map(c => [c.id, c]));
const poolOf = (def) => def.pool ? def.pool() : byStrength(leagueIds(def.league));

export function roundName(teams) { return teams === 2 ? '결승' : teams === 4 ? '준결승' : `${teams}강`; }

// create a cup. include: a club that must take part (replaces the weakest entrant if needed)
export function createCup(defId, { include = null, seed = Date.now() } = {}) {
  const def = CUP_BY_ID[defId];
  const r = rng(seed >>> 0);
  let pool = poolOf(def);
  let teams;
  if (def.kind === 'domestic') { // domestic cups: random draw from the whole league
    teams = pool.slice().sort(() => r() - 0.5).slice(0, def.size);
  } else teams = pool.slice(0, def.size);
  if (include && !teams.includes(include)) teams[teams.length - 1] = include;
  teams = teams.slice().sort(() => r() - 0.5);
  const ties = [];
  for (let i = 0; i < teams.length; i += 2) ties.push({ h: teams[i], a: teams[i + 1], s: null, pen: null, w: null });
  return { id: def.id, name: def.name, icon: def.icon, color: def.color, prize: def.prize, seed, rounds: [ties], round: 0, winner: null, teams: teams.length };
}
export const currentTies = (cup) => cup.rounds[cup.round] || [];
export const isAlive = (cup, clubId) => !cup.winner && currentTies(cup).some(t => (t.h === clubId || t.a === clubId) && !t.w) || cup.winner === clubId;
export const userTie = (cup, clubId) => cup.winner ? null : currentTies(cup).find(t => !t.w && (t.h === clubId || t.a === clubId)) || null;
export const stageName = (cup) => cup.winner ? '종료' : roundName(currentTies(cup).length * 2);

// penalty shoot-out: returns {a, b, kicks:[[h,a],...]} with sudden death
export function shootout(r = Math.random, ovrH = 75, ovrA = 75) {
  const pH = Math.min(0.9, Math.max(0.6, 0.76 + (ovrH - ovrA) * 0.005)), pA = Math.min(0.9, Math.max(0.6, 0.76 + (ovrA - ovrH) * 0.005));
  let a = 0, b = 0, nh = 0, na = 0; const kicks = [];
  const decided = () => nh <= 5 && na <= 5 && (a > b + (5 - na) || b > a + (5 - nh));
  for (let k = 0; k < 5 && !decided(); k++) {
    const kh = r() < pH; a += kh; nh++; kicks.push([kh, null]);
    if (decided()) break;
    const ka = r() < pA; b += ka; na++; kicks[k][1] = ka;
  }
  for (let k = 0; a === b && k < 15; k++) { const kh = r() < pH, ka = r() < pA; a += kh; b += ka; kicks.push([kh, ka]); }
  if (a === b) { a++; kicks.push([true, false]); }
  return { a, b, kicks };
}

// decide a tie from a score; draws go to penalties
export function settleTie(tie, gh, ga, r = Math.random) {
  tie.s = [gh, ga];
  if (gh === ga) { const p = shootout(r, clubStrength(tie.h), clubStrength(tie.a)); tie.pen = [p.a, p.b]; tie.kicks = p.kicks; tie.w = p.a > p.b ? tie.h : tie.a; }
  else tie.w = gh > ga ? tie.h : tie.a;
  return tie;
}
// simulate every undecided tie in the current round (strength(id) -> team OVR)
export function simRound(cup, strength = clubStrength, r = Math.random, skip = null) {
  for (const t of currentTies(cup)) {
    if (t.w || t === skip) continue;
    const [gh, ga] = quickSim(strength(t.h), strength(t.a), r, 0.1);
    settleTie(t, gh, ga, r);
  }
}
// move to the next round once all ties are decided; returns true when the cup finished
export function advance(cup) {
  const ties = currentTies(cup);
  if (!ties.length || ties.some(t => !t.w)) return false;
  if (ties.length === 1) { cup.winner = ties[0].w; return true; }
  const next = [];
  for (let i = 0; i < ties.length; i += 2) next.push({ h: ties[i].w, a: ties[i + 1].w, s: null, pen: null, w: null });
  cup.rounds.push(next); cup.round++;
  return false;
}
export const roundsTotal = (cup) => Math.round(Math.log2(cup.teams));

// ---------- career integration ----------
// which cups a club enters this season (domestic cup + continental/world competitions)
export function seasonCups(clubId, season = 2027) {
  const club = CLUB_BY_ID[clubId];
  const out = [];
  const dom = CUPS.find(c => c.kind === 'domestic' && c.league === club.league);
  const seed = hashStr(clubId + season);
  if (dom) out.push(createCup(dom.id, { include: clubId, seed }));
  else if (club.league === 'sudamerica') out.push(createCup('lib', { include: clubId, seed }));
  for (const id of ['ucl', 'uel', 'acl']) {
    const def = CUP_BY_ID[id];
    if (poolOf(def).slice(0, def.size).includes(clubId)) { out.push(createCup(id, { include: clubId, seed: seed + 7 })); break; }
  }
  if (CUP_BY_ID.cwc.pool().slice(0, 16).includes(clubId) && season % 2 === 1) out.push(createCup('cwc', { include: clubId, seed: seed + 13 }));
  return out;
}
// league rounds after which each cup round is played (spread evenly through the season)
export function cupSchedule(cup, leagueRounds, offset = 0) {
  const R = roundsTotal(cup);
  return Array.from({ length: R }, (_, k) => Math.min(leagueRounds - 1, Math.round((k + 1) * leagueRounds / (R + 1)) + offset));
}
export function attachSchedules(cups, leagueRounds) {
  cups.forEach((c, i) => { c.schedule = cupSchedule(c, leagueRounds, i); });
  return cups;
}
// the next cup round that is due at league round `round` (null if none)
export function dueCup(cups, round) {
  return (cups || []).find(c => !c.winner && c.schedule && c.schedule[c.round] !== undefined && c.schedule[c.round] <= round) || null;
}

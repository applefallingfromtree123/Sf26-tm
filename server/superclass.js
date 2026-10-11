// SUPER CLASS mode (card collecting, FC-Online-style) — server-authoritative state:
// packs are opened, rewards computed and squads validated here so clients can't cheat.
import crypto from 'node:crypto';
import { allPlayers } from '../shared/career.js';
import { ALL_CLUBS, CLUB_BY_ID } from '../shared/data/leagues.js';
import { generateSquad, teamRating, buildTeamFrom, FORMATIONS } from '../shared/squad.js';
import { PACK_BY_ID, BANDS, START_COINS, DAILY_PACK, LADDER_STAGES, KIT_COLORS, addXp, localReward, onlineReward, ladderBonus, sellValue, tierOf } from '../shared/superclass.js';

const MAX_CARDS = 300;
// fraction of the real match length that must pass before a local result counts (anti-cheat); tests may disable
const MIN_ELAPSED = process.env.SC_FAST_RESULTS === '1' ? 0 : 0.8;
const uid = () => crypto.randomBytes(6).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);
const rnd = () => crypto.randomInt(0, 1e9) / 1e9;
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- player pool ----------
let bands = null;
function pool() {
  if (bands) return bands;
  const all = allPlayers();
  bands = BANDS.map(([lo, hi]) => all.filter(p => p.ovr >= lo && p.ovr <= hi));
  return bands;
}
function makeCard(p, sc = false) {
  const card = { uid: uid(), pid: p.id, name: p.name, pos: p.pos, nat: p.nat, age: p.age, num: p.num, club: p.club, ovr: p.ovr, attrs: { ...p.attrs } };
  if (sc) { card.sc = true; card.ovr = Math.min(99, p.ovr + 3); for (const k in card.attrs) card.attrs[k] = Math.min(99, card.attrs[k] + 3); }
  card.tier = tierOf(card);
  return card;
}
function drawFromPack(pack) {
  const P = pool();
  const cards = [];
  const guarantees = (pack.guarantee || []).flatMap(g => Array(g.count).fill(g.min));
  for (let i = 0; i < pack.cards; i++) {
    let band;
    const min = guarantees[i];
    const total = pack.odds.reduce((a, b) => a + b, 0);
    for (let tries = 0; tries < 30; tries++) {
      let r = rnd() * total; band = 0;
      for (let b = 0; b < pack.odds.length; b++) { r -= pack.odds[b]; if (r <= 0) { band = b; break; } }
      if (!min || BANDS[band][1] >= min) break;
    }
    let list = P[band];
    if (min) list = list.filter(p => p.ovr >= min);
    if (!list.length) list = P.flat().filter(p => p.ovr >= (min || 0));
    cards.push(makeCard(pickOne(list), pack.scChance ? rnd() < pack.scChance : false));
  }
  return cards.sort((a, b) => a.ovr - b.ovr); // best card revealed last
}

// ---------- state ----------
const STARTER = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'CM', 'CB', 'LW'];
export function newState(user) {
  const all = allPlayers();
  const cards = [];
  const used = new Set();
  for (const pos of STARTER) {
    const cands = all.filter(p => p.pos === pos && p.ovr >= 60 && p.ovr <= 68 && !used.has(p.id));
    const p = pickOne(cands.length ? cands : all.filter(q => q.pos === pos));
    used.add(p.id);
    cards.push(makeCard(p));
  }
  const sc = {
    v: 1, level: 1, xp: 0, coins: START_COINS, rp: 1000, cards, lastDaily: null,
    squad: { formation: '4-3-3', xi: [] },
    club: { name: `${(user.nickname || user.username).slice(0, 12)} FC`, short: (user.username || 'SCF').slice(0, 3).toUpperCase(), c1: KIT_COLORS[(user.username.length * 7) % 6], c2: '#ffffff' },
    ladder: { stage: 0, runs: 0 }, stats: { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, packs: 0, onlineW: 0, onlineD: 0, onlineL: 0 },
    pending: null, created: Date.now(),
  };
  autoSquad(sc);
  return sc;
}
export function autoSquad(sc) {
  const slots = FORMATIONS[sc.squad.formation] || FORMATIONS['4-3-3'];
  const team = buildTeamFrom({ id: 'x', name: 'x', short: 'x', c1: '#000', c2: '#fff' }, uniqueBestCards(sc.cards), sc.squad.formation);
  sc.squad.xi = team.xi.map(p => p.id).slice(0, slots.length);
}
function uniqueBestCards(cards) {
  const best = new Map();
  for (const c of cards) { const k = c.pid; if (!best.has(k) || best.get(k).ovr < c.ovr) best.set(k, c); }
  return [...best.values()].map(cardToPlayer);
}
const cardToPlayer = (c) => ({ id: c.uid, name: c.name, pos: c.pos, nat: c.nat, age: c.age, num: c.num, ovr: c.ovr, attrs: c.attrs });

export function squadInfo(sc) {
  const byUid = new Map(sc.cards.map(c => [c.uid, c]));
  const xi = sc.squad.xi.map(u => byUid.get(u)).filter(Boolean);
  const ovr = xi.length ? Math.round(xi.reduce((s, c) => s + c.ovr, 0) / xi.length) : 0;
  return { xi, ovr };
}
// a match team for the engine built from the user's Super Class squad
export function scTeam(sc, username) {
  const byUid = new Map(sc.cards.map(c => [c.uid, c]));
  const xiCards = sc.squad.xi.map(u => byUid.get(u)).filter(Boolean);
  const xiPids = new Set(xiCards.map(c => c.pid));
  const bench = uniqueBestCards(sc.cards.filter(c => !xiPids.has(c.pid) && !sc.squad.xi.includes(c.uid)));
  const players = [...xiCards.map(cardToPlayer), ...bench];
  // shirt numbers must be unique within the team
  const used = new Set();
  for (const p of players) { let n = p.num || 2; while (used.has(n)) n++; used.add(n); p.num = n; }
  const club = { id: 'sc-' + username, name: sc.club.name, short: sc.club.short, c1: sc.club.c1, c2: sc.club.c2, stadium: `${sc.club.name} Arena` };
  return buildTeamFrom(club, players, sc.squad.formation, sc.squad.xi.length === (FORMATIONS[sc.squad.formation] || []).length ? sc.squad.xi : null);
}

// ladder opponents: increasingly strong real clubs
let clubRatings = null;
export function ladderOpponent(stage, runs = 0) {
  if (!clubRatings) clubRatings = ALL_CLUBS.map(c => ({ id: c.id, ovr: teamRating(generateSquad(c.id)) })).sort((a, b) => a.ovr - b.ovr);
  const target = 64 + stage * 2.7 + Math.min(runs, 3);
  const cands = clubRatings.slice().sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, 4);
  return cands[(stage * 7 + runs * 3) % cands.length];
}
export const clubOvr = (id) => { ladderOpponent(0); return clubRatings.find(c => c.id === id)?.ovr ?? 70; };

export function publicState(sc) {
  const { ovr } = squadInfo(sc);
  const rest = { ...sc }; delete rest.pending;
  const lo = ladderOpponent(sc.ladder.stage, sc.ladder.runs);
  return { ...rest, teamOvr: ovr, dailyAvailable: sc.lastDaily !== today(), ladderOpp: { id: lo.id, ovr: lo.ovr, stage: sc.ladder.stage } };
}

// ---------- routes ----------
export function setupSuperClassRoutes(app, store, auth, wrap) {
  const load = async (username) => {
    const user = await store.getUser(username);
    if (!user) return null;
    if (!user.sc) { user.sc = newState(user); await store.updateUser(username, { sc: user.sc }); }
    return user;
  };
  const save = (user) => store.updateUser(user.username, { sc: user.sc });
  const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });

  app.get('/api/sc', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    res.json({ sc: publicState(u.sc) });
  }));

  app.post('/api/sc/open', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    const sc = u.sc;
    const free = !!req.body?.daily;
    const pack = PACK_BY_ID[free ? DAILY_PACK : req.body?.pack];
    if (!pack) return fail(res, '알 수 없는 팩입니다.');
    if (free) { if (sc.lastDaily === today()) return fail(res, '오늘의 무료 팩은 이미 받았습니다.'); }
    else {
      if (sc.level < pack.level) return fail(res, `레벨 ${pack.level} 이상부터 열 수 있습니다.`);
      if (sc.coins < pack.price) return fail(res, '코인이 부족합니다.');
    }
    if (sc.cards.length + pack.cards > MAX_CARDS) return fail(res, `카드 보관함이 가득 찼습니다 (최대 ${MAX_CARDS}장). 카드를 판매해주세요.`);
    if (free) sc.lastDaily = today(); else sc.coins -= pack.price;
    const cards = drawFromPack(pack);
    sc.cards.push(...cards); sc.stats.packs++;
    await save(u);
    res.json({ cards, sc: publicState(sc) });
  }));

  app.post('/api/sc/sell', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    const sc = u.sc;
    const uids = Array.isArray(req.body?.uids) ? req.body.uids.slice(0, 300).map(String) : [];
    const inXi = new Set(sc.squad.xi);
    let gained = 0, n = 0;
    sc.cards = sc.cards.filter(c => {
      if (!uids.includes(c.uid) || inXi.has(c.uid)) return true;
      gained += sellValue(c); n++; return false;
    });
    if (sc.cards.length < 11) return fail(res, '카드는 최소 11장 보유해야 합니다.');
    sc.coins += gained;
    await save(u);
    res.json({ sold: n, coins: gained, sc: publicState(sc) });
  }));

  app.post('/api/sc/squad', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    const sc = u.sc;
    const b = req.body || {};
    if (b.formation !== undefined) { if (!FORMATIONS[b.formation]) return fail(res, '잘못된 포메이션'); sc.squad.formation = b.formation; }
    if (Array.isArray(b.xi)) {
      const need = FORMATIONS[sc.squad.formation].length;
      const owned = new Map(sc.cards.map(c => [c.uid, c]));
      const xi = b.xi.map(String);
      if (xi.length !== need || new Set(xi).size !== need || !xi.every(x => owned.has(x))) return fail(res, '선발 명단이 올바르지 않습니다.');
      if (new Set(xi.map(x => owned.get(x).pid)).size !== need) return fail(res, '같은 선수를 두 번 넣을 수 없습니다.');
      sc.squad.xi = xi;
    } else if (b.auto || b.formation !== undefined) autoSquad(sc);
    if (b.club && typeof b.club === 'object') {
      const hex = /^#[0-9a-fA-F]{6}$/;
      if (typeof b.club.name === 'string' && b.club.name.trim()) sc.club.name = b.club.name.trim().slice(0, 20);
      if (typeof b.club.short === 'string' && /^[A-Za-z0-9가-힣]{2,4}$/.test(b.club.short)) sc.club.short = b.club.short.toUpperCase();
      if (hex.test(b.club.c1 || '')) sc.club.c1 = b.club.c1;
      if (hex.test(b.club.c2 || '')) sc.club.c2 = b.club.c2;
    }
    await save(u);
    res.json({ sc: publicState(sc) });
  }));

  // start a local match: the server remembers the opponent and start time
  app.post('/api/sc/start', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    const sc = u.sc;
    const type = req.body?.type;
    if (!['friendly', 'ladder', 'quick'].includes(type)) return fail(res, '잘못된 경기 유형');
    let opp = String(req.body?.opp || '');
    if (type === 'ladder') opp = ladderOpponent(sc.ladder.stage, sc.ladder.runs).id;
    if (!CLUB_BY_ID[opp]) return fail(res, '상대 클럽을 선택하세요.');
    const difficulty = Math.max(0, Math.min(4, +req.body?.difficulty || 0));
    const realSeconds = type === 'quick' ? 360 : 720;
    sc.pending = { token: uid(), type, opp, difficulty, realSeconds, t0: Date.now(), myOvr: squadInfo(sc).ovr, oppOvr: clubOvr(opp), stage: sc.ladder.stage };
    await save(u);
    res.json({ token: sc.pending.token, opp, difficulty, realSeconds, team: scTeam(sc, u.username), oppOvr: sc.pending.oppOvr });
  }));

  app.post('/api/sc/result', auth, wrap(async (req, res) => {
    const u = await load(req.username); if (!u) return fail(res, '계정 없음', 404);
    const sc = u.sc;
    const p = sc.pending;
    if (!p || p.token !== req.body?.token) return fail(res, '진행 중인 경기가 없습니다.');
    sc.pending = null;
    const score = Array.isArray(req.body?.score) ? req.body.score.map(n => Math.max(0, Math.min(20, n | 0))) : null;
    const elapsed = (Date.now() - p.t0) / 1000;
    if (req.body?.aborted || !score) { await save(u); return res.json({ aborted: true, sc: publicState(sc) }); }
    if (elapsed < p.realSeconds * MIN_ELAPSED) { await save(u); return fail(res, '경기 시간이 너무 짧아 결과가 인정되지 않았습니다.'); }
    const [gf, ga] = score;
    const outcome = gf > ga ? 'win' : gf === ga ? 'draw' : 'loss';
    const r = localReward({ outcome, myOvr: p.myOvr, oppOvr: p.oppOvr, difficulty: p.difficulty, goals: gf, short: p.type === 'quick' });
    let bonus = null;
    if (p.type === 'ladder' && outcome === 'win' && sc.ladder.stage === p.stage) {
      bonus = ladderBonus(p.stage + 1);
      r.xp += bonus.xp; r.coins += bonus.coins;
      sc.ladder.stage++;
      if (sc.ladder.stage >= LADDER_STAGES) { sc.ladder.stage = 0; sc.ladder.runs++; bonus.completed = true; r.coins += 5000; }
    }
    const st = sc.stats; st.played++; st.gf += gf; st.ga += ga; st[outcome === 'win' ? 'wins' : outcome === 'draw' ? 'draws' : 'losses']++;
    sc.coins += r.coins;
    const ups = addXp(sc, r.xp);
    await save(u);
    res.json({ outcome, reward: r, bonus, levelUps: ups, sc: publicState(sc) });
  }));
}

// online Super Class result (called by the online match server)
export async function applyOnlineResult(store, username, gf, ga) {
  const u = await store.getUser(username);
  if (!u || !u.sc) return null;
  const sc = u.sc;
  const outcome = gf > ga ? 'win' : gf === ga ? 'draw' : 'loss';
  const r = onlineReward(outcome, gf);
  sc.coins += r.coins; sc.rp = Math.max(0, (sc.rp ?? 1000) + r.rp);
  const st = sc.stats; st.played++; st.gf += gf; st.ga += ga;
  st[outcome === 'win' ? 'onlineW' : outcome === 'draw' ? 'onlineD' : 'onlineL']++;
  const ups = addXp(sc, r.xp);
  await store.updateUser(username, { sc });
  return { outcome, reward: r, levelUps: ups, level: sc.level, coins: sc.coins };
}
export async function loadScTeam(store, username) {
  const u = await store.getUser(username);
  if (!u) return null;
  if (!u.sc) { u.sc = newState(u); await store.updateUser(username, { sc: u.sc }); }
  return scTeam(u.sc, username);
}

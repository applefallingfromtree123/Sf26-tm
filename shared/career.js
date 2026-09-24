// Career helpers shared by manager & player career modes (pure functions).
import { LEAGUE_BY_ID, CLUB_BY_ID, ALL_CLUBS } from './data/leagues.js';
import { generateSquad, pickLineup, calcOvr, playerValue, makeAttrs, genName, rng, ATTR_KEYS } from './squad.js';
import { quickSim } from './sim.js';

export function roundRobin(ids) {
  const t = ids.slice();
  if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) round.push(r % 2 ? { h: b, a } : { h: a, a: b });
    }
    rounds.push(round);
    t.splice(1, 0, t.pop());
  }
  const second = rounds.map(rd => rd.map(f => ({ h: f.a, a: f.h })));
  return [...rounds, ...second].map(rd => rd.map(f => ({ ...f, s: null })));
}
export function newTable(ids) { return Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }])); }
export function applyResult(table, h, a, gh, ga) {
  const H = table[h], A = table[a];
  if (!H || !A) return;
  H.p++; A.p++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
  if (gh > ga) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
  else if (gh < ga) { A.w++; H.l++; A.pts += 3; H.form.push('L'); A.form.push('W'); }
  else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
  H.form = H.form.slice(-5); A.form = A.form.slice(-5);
}
export function sortTable(table) {
  return Object.entries(table).map(([id, r]) => ({ id, ...r, gd: r.gf - r.ga })).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || CLUB_BY_ID[x.id].name.localeCompare(CLUB_BY_ID[y.id].name));
}
export function strength(players, formation = '4-3-3') {
  const { xi } = pickLineup(players, formation);
  return xi.reduce((s, p) => s + p.ovr, 0) / Math.max(1, xi.length);
}
// choose scorers weighted by attacking quality
export function pickScorers(players, goals, r = Math.random) {
  const { xi } = pickLineup(players, '4-3-3');
  const w = xi.map(p => ({ p, w: ({ ST: 5, LW: 3, RW: 3, CAM: 2.6, LM: 1.8, RM: 1.8, CM: 1.3, CDM: 0.5, LB: 0.4, RB: 0.4, CB: 0.5, GK: 0 }[p.pos] ?? 1) * (p.attrs.sho / 70) ** 2 }));
  const tot = w.reduce((s, x) => s + x.w, 0);
  const out = [];
  for (let g = 0; g < goals; g++) {
    let k = r() * tot, sc = w[0].p;
    for (const x of w) { k -= x.w; if (k <= 0) { sc = x.p; break; } }
    const ast = r() < 0.72 ? xi.filter(p => p !== sc && p.pos !== 'GK')[Math.floor(r() * 10)] : null;
    out.push({ id: sc.id, name: sc.name, assist: ast ? { id: ast.id, name: ast.name } : null });
  }
  return out;
}
export function simFixture(hPlayers, aPlayers, r = Math.random) {
  const sh = strength(hPlayers), sa = strength(aPlayers);
  const [gh, ga] = quickSim(sh, sa, r);
  return { gh, ga, hs: pickScorers(hPlayers, gh, r), as: pickScorers(aPlayers, ga, r) };
}
export function addScorers(scorers, list, clubId) {
  for (const s of list) {
    const e = scorers[s.id] || (scorers[s.id] = { n: s.name, c: clubId, g: 0, a: 0 });
    e.g++;
    if (s.assist) { const a = scorers[s.assist.id] || (scorers[s.assist.id] = { n: s.assist.name, c: clubId, g: 0, a: 0 }); a.a++; }
  }
}

// season-end development
export function developPlayer(p, r = Math.random) {
  p.age++;
  let d;
  if (p.age <= 21) d = 2 + Math.floor(r() * 4);
  else if (p.age <= 24) d = 1 + Math.floor(r() * 3);
  else if (p.age <= 28) d = Math.floor(r() * 3) - 1;
  else if (p.age <= 31) d = -Math.floor(r() * 3);
  else d = -1 - Math.floor(r() * 4);
  if (d > 0 && p.pot) d = Math.min(d, Math.max(0, p.pot - p.ovr));
  if (d) { for (const k of ATTR_KEYS) p.attrs[k] = Math.max(20, Math.min(99, p.attrs[k] + d + (r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0))); p.ovr = Math.max(40, Math.min(99, p.ovr + d)); }
  p.value = playerValue(p.ovr, p.age);
  return d;
}
export function youthPlayer(clubId, season, idx, r = Math.random) {
  const club = CLUB_BY_ID[clubId];
  const pos = ['ST', 'CM', 'CB', 'LW', 'RW', 'CAM', 'LB', 'RB', 'CDM', 'GK'][Math.floor(r() * 10)];
  const ovr = 54 + Math.floor(r() * 10);
  const nat = club.nat || 'ENG';
  const attrs = makeAttrs(r, pos, ovr);
  return { id: `${clubId}-y${season}-${idx}`, name: genName(r, nat), pos, nat, age: 17, attrs, ovr: calcOvr(pos, attrs), pot: 74 + Math.floor(r() * 20), num: 40 + idx + (season % 10) * 2, value: playerValue(ovr, 17), youth: true };
}

// all players on the market (lazy, cached)
let market = null;
export function allPlayers() {
  if (market) return market;
  market = [];
  for (const c of ALL_CLUBS) for (const p of generateSquad(c.id)) market.push({ ...p, club: c.id });
  return market;
}
export function leagueClubs(leagueId) { return LEAGUE_BY_ID[leagueId].clubs.map(c => c.id); }
export { rng };

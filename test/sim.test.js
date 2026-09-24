// Headless engine test: plays full 90-minute CPU vs CPU matches and checks sanity.
import { Match } from '../shared/sim.js';
import { buildTeam } from '../shared/squad.js';

const pairs = process.argv[2] ? [process.argv.slice(2, 4)] : [['ars', 'che'], ['rma', 'bar'], ['uls', 'seo'], ['fcb', 'utr']];
let fail = 0;
const agg = { goals: 0, shots: 0, sot: 0, fouls: 0, corners: 0, offsides: 0, saves: 0, passAcc: 0, n: 0 };
for (const [h, a] of pairs) {
  for (let rep = 0; rep < (process.env.REPS ? +process.env.REPS : 2); rep++) {
    const m = new Match({ home: buildTeam(h), away: buildTeam(a), difficulty: 2, seed: 1000 + rep * 77 + h.length });
    const t0 = Date.now();
    const ev = {};
    let steps = 0;
    while (!m.finished && steps < 60 * 1300) {
      m.step(1 / 60, []);
      for (const e of m.drainEvents()) ev[e.type] = (ev[e.type] || 0) + 1;
      steps++;
      // invariants
      const b = m.ball;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) { console.error('NaN ball'); fail++; break; }
    }
    const r = m.result();
    const s = r.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${h} ${r.score[0]}-${r.score[1]} ${a} | real ${(steps / 60).toFixed(0)}s sim in ${secs}s | shots ${s[0].shots}/${s[1].shots} sot ${s[0].sot}/${s[1].sot} poss ${s[0].possPct}% pass ${s[0].passOk}/${s[0].passes} ${s[1].passOk}/${s[1].passes} fouls ${s[0].fouls + s[1].fouls} corners ${s[0].corners + s[1].corners} off ${s[0].offsides + s[1].offsides} saves ${s[0].saves + s[1].saves} | ev ${JSON.stringify(ev)}`);
    if (!m.finished) { console.error('match did not finish'); fail++; }
    agg.goals += r.score[0] + r.score[1]; agg.shots += s[0].shots + s[1].shots; agg.sot += s[0].sot + s[1].sot; agg.fouls += s[0].fouls + s[1].fouls; agg.corners += s[0].corners + s[1].corners; agg.offsides += s[0].offsides + s[1].offsides; agg.saves += s[0].saves + s[1].saves; agg.passAcc += (s[0].passOk + s[1].passOk) / Math.max(1, s[0].passes + s[1].passes); agg.n++;
  }
}
const n = agg.n;
console.log(`AVG per match: goals ${(agg.goals / n).toFixed(2)} shots ${(agg.shots / n).toFixed(1)} sot ${(agg.sot / n).toFixed(1)} fouls ${(agg.fouls / n).toFixed(1)} corners ${(agg.corners / n).toFixed(1)} offsides ${(agg.offsides / n).toFixed(1)} saves ${(agg.saves / n).toFixed(1)} passAcc ${(agg.passAcc / n * 100).toFixed(0)}%`);
process.exit(fail ? 1 : 0);

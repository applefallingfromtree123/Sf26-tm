// SUPER CLASS API + online SC match test.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';

const PORT = 3800 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2027-sc-'));
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'test', DATABASE_URL: '', SC_FAST_RESULTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stderr.on('data', d => process.stderr.write(d));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function cleanup(code) { srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); process.exit(code); }
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); cleanup(1); } else console.log('ok -', m); };
setTimeout(() => { console.error('timeout'); cleanup(1); }, 60000);
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { } await sleep(100); }
const call = async (method, p, token, body) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };

const A = (await call('POST', '/api/register', null, { username: 'scalice', password: 'secret1' })).data.token;
const B = (await call('POST', '/api/register', null, { username: 'scbob', password: 'secret1' })).data.token;
assert((await call('GET', '/api/sc')).status === 401, 'sc requires login');
let st = (await call('GET', '/api/sc', A)).data.sc;
assert(st.level === 1 && st.coins === 3000 && st.cards.length === 18 && st.squad.xi.length === 11 && st.dailyAvailable, `starter state (team OVR ${st.teamOvr})`);
let r = await call('POST', '/api/sc/open', A, { daily: true });
assert(r.status === 200 && r.data.cards.length === 5 && !r.data.sc.dailyAvailable, 'daily free pack opened: ' + r.data.cards.map(c => c.ovr).join(','));
assert((await call('POST', '/api/sc/open', A, { daily: true })).status === 400, 'daily pack only once');
assert((await call('POST', '/api/sc/open', A, { pack: 'gold' })).status === 400, 'gold pack locked at level 1');
r = await call('POST', '/api/sc/open', A, { pack: 'bronze' });
assert(r.status === 200 && r.data.sc.coins === 2400, 'bronze pack costs 600');
st = r.data.sc;
const notXi = st.cards.filter(c => !st.squad.xi.includes(c.uid));
r = await call('POST', '/api/sc/sell', A, { uids: [notXi[0].uid, st.squad.xi[0]] });
assert(r.data.sold === 1 && r.data.coins > 0, `sell skips XI cards (+${r.data.coins} coins)`);
st = r.data.sc;
const dupXi = st.squad.xi.slice(); dupXi[1] = dupXi[0];
assert((await call('POST', '/api/sc/squad', A, { xi: dupXi })).status === 400, 'duplicate XI rejected');
r = await call('POST', '/api/sc/squad', A, { formation: '4-4-2', club: { name: '슈퍼 FC', short: 'SFC', c1: '#123456', c2: '#ffffff' } });
assert(r.status === 200 && r.data.sc.squad.formation === '4-4-2' && r.data.sc.club.name === '슈퍼 FC', 'formation & club customisation');
// local match: beat a strong team for more XP
r = await call('POST', '/api/sc/start', A, { type: 'friendly', opp: 'rma', difficulty: 2 });
assert(r.status === 200 && r.data.team.xi.length === 11 && r.data.team.club.name === '슈퍼 FC', 'match start returns my team');
const forged = await call('POST', '/api/sc/result', A, { token: 'fake', score: [9, 0] });
assert(forged.status === 400, 'forged token rejected');
const strong = await call('POST', '/api/sc/result', A, { token: r.data.token, score: [2, 1] });
r = await call('POST', '/api/sc/start', A, { type: 'friendly', opp: 'any', difficulty: 2 });
const weak = await call('POST', '/api/sc/result', A, { token: r.data.token, score: [2, 1] });
assert(strong.data.reward.xp > weak.data.reward.xp * 1.8, `beating Real Madrid gives far more XP (${strong.data.reward.xp}) than FC Anyang (${weak.data.reward.xp})`);
assert(strong.data.levelUps.length >= 1, 'level up after a big win: Lv ' + strong.data.sc.level);
// ladder
r = await call('POST', '/api/sc/start', A, { type: 'ladder' });
const lad = await call('POST', '/api/sc/result', A, { token: r.data.token, score: [1, 0] });
assert(lad.data.bonus && lad.data.sc.ladder.stage === 1, 'ladder stage cleared with bonus');
// online SC match
const sa = io(BASE, { auth: { token: A }, transports: ['websocket'] }), sb = io(BASE, { auth: { token: B }, transports: ['websocket'] });
const ok = (s) => s.connected ? Promise.resolve() : new Promise(res => s.once('connect', res));
await Promise.all([ok(sa), ok(sb)]);
const starts = [], ends = [];
for (const s of [sa, sb]) { s.on('match:start', d => starts.push(d)); s.on('match:end', d => ends.push(d)); }
sa.emit('queue:join', { mode: 'sc' }); await sleep(100);
const sc2 = io(BASE, { auth: { token: B }, transports: ['websocket'] }); void sc2; sc2.disconnect();
sb.emit('queue:join', { clubId: 'che' }); await sleep(500);
assert(starts.length === 0, 'club-mode player not paired with SC-mode player');
sb.emit('queue:leave'); sb.emit('queue:join', { mode: 'sc' }); await sleep(1200);
assert(starts.length === 2 && starts[0].mode === 'sc' && starts.find(s => s.you === 0).home.club.name === '슈퍼 FC', 'SC online match uses card squads');
sb.emit('room:leave'); await sleep(1000);
const endA = ends.find(e => e.you === 0);
assert(endA && endA.scReward && endA.scReward.outcome === 'win' && endA.ratingDelta === 0, `online SC rewards (+${endA?.scReward?.reward.xp} XP, +${endA?.scReward?.reward.coins} coins), normal rating untouched`);
sa.disconnect(); sb.disconnect();
console.log('ALL SUPER CLASS TESTS PASSED');
cleanup(0);

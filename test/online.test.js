// End-to-end online test: boots the server, registers two accounts, matchmakes,
// streams snapshots, forfeits, and checks ratings + saves API.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf2027-'));
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'test', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stderr.on('data', d => process.stderr.write(d));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); cleanup(1); } else console.log('ok -', m); };
function cleanup(code) { srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); process.exit(code); }
const post = async (p, body, token) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };

setTimeout(() => { console.error('timeout'); cleanup(1); }, 60000);
for (let i = 0; i < 50; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch { } await sleep(100); }

const a = await post('/api/register', { username: 'alice', password: 'secret1', nickname: '앨리스' });
assert(a.status === 200 && a.data.token, 'register alice');
const b = await post('/api/register', { username: 'bob', password: 'secret2' });
assert(b.status === 200, 'register bob');
assert((await post('/api/register', { username: 'ALICE', password: 'whatever' })).status === 409, 'duplicate username rejected');
assert((await post('/api/login', { username: 'alice', password: 'wrong' })).status === 401, 'wrong password rejected');
const la = await post('/api/login', { username: 'alice', password: 'secret1' });
assert(la.status === 200, 'login alice');

// saves
const put = await fetch(BASE + '/api/saves/manager1', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.data.token }, body: JSON.stringify({ data: { hello: 1, summary: { club: 'ars' } } }) });
assert(put.ok, 'save written');
const got = await (await fetch(BASE + '/api/saves/manager1', { headers: { Authorization: 'Bearer ' + a.data.token } })).json();
assert(got.data.hello === 1, 'save read back');
assert((await fetch(BASE + '/api/saves/manager1')).status === 401, 'saves require auth');

// online
const sa = io(BASE, { auth: { token: a.data.token }, transports: ['websocket'] });
const sb = io(BASE, { auth: { token: b.data.token }, transports: ['websocket'] });
const bad = io(BASE, { auth: { token: 'nope' }, transports: ['websocket'] });
const badErr = await new Promise(r => bad.on('connect_error', e => r(e.message)));
assert(badErr === 'unauthorized', 'socket rejects bad token');
const connected = (s) => s.connected ? Promise.resolve() : new Promise(r => s.once('connect', r));
await Promise.all([connected(sa), connected(sb)]);
const starts = [];
const snaps = [0, 0];
const ends = [];
sa.on('match:start', d => starts.push(d)); sb.on('match:start', d => starts.push(d));
sa.on('snap', () => snaps[0]++); sb.on('snap', () => snaps[1]++);
sa.on('match:end', d => ends.push(d)); sb.on('match:end', d => ends.push(d));
sa.emit('queue:join', { clubId: 'ars' });
await sleep(200);
sb.emit('queue:join', { clubId: 'che' });
await sleep(800);
assert(starts.length === 2 && starts[0].home.club.id === 'ars' && starts[0].away.club.id === 'che', 'match started for both players');
assert(new Set(starts.map(s => s.you)).size === 2, 'players assigned different teams');
// play a little with inputs
for (let i = 0; i < 30; i++) { sa.emit('input', { mx: 1, mz: 0, sprint: true, taps: { pass: i } }); sb.emit('input', { mx: -1, mz: 0.2, taps: {} }); await sleep(100); }
assert(snaps[0] > 5 && snaps[1] > 5, `snapshots streaming (${snaps[0]}, ${snaps[1]})`);
sb.emit('room:leave');
await sleep(800);
assert(ends.length === 2, 'match ended for both after forfeit');
const endA = ends.find(e => e.you === 0);
assert(endA && endA.score[0] > endA.score[1] && endA.ratingDelta > 0, `forfeit counted as win for alice (+${endA?.ratingDelta})`);
const me = await (await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + a.data.token } })).json();
assert(me.user.wins === 1 && me.user.rating > 1000, 'rating persisted');
const lb = await (await fetch(BASE + '/api/leaderboard')).json();
assert(lb.users[0].username === 'alice', 'leaderboard ordered');
// private room
const codeP = new Promise(r => sa.once('room:created', d => r(d.code)));
sa.emit('room:create', { clubId: 'rma' });
const code = await codeP;
assert(/^[A-Z0-9]{5}$/.test(code), 'private room code ' + code);
starts.length = 0;
sb.emit('room:join', { code, clubId: 'bar' });
await sleep(600);
assert(starts.length === 2, 'private room match started');
sa.disconnect();
await sleep(600);
assert(ends.length === 3, 'disconnect ends match with forfeit');
sb.disconnect(); bad.disconnect();
console.log('ALL ONLINE TESTS PASSED');
cleanup(0);

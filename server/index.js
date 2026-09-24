// SF2027 server: static game client, account/save REST API and Socket.io online play.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createStore, publicUser } from './store.js';
import { hashPassword, verifyPassword, signToken, verifyToken, rateLimit } from './auth.js';
import { setupOnline } from './online.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

const store = await createStore();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---------- static ----------
const stat = (dir, maxAge = '1h') => express.static(dir, { maxAge, fallthrough: true });
app.use('/vendor/three', stat(path.join(ROOT, 'node_modules/three'), '7d'));
app.use('/shared', stat(path.join(ROOT, 'shared')));
app.use(stat(path.join(ROOT, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, name: 'SF2027' }));

// ---------- auth ----------
const USER_RE = /^[a-zA-Z0-9_]{3,20}$/;
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const username = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!username) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.username = username; next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: '서버 오류' }); });

app.post('/api/register', wrap(async (req, res) => {
  if (!rateLimit('reg:' + req.ip, 10, 60 * 60 * 1000)) return res.status(429).json({ error: '잠시 후 다시 시도하세요.' });
  const { username, password, nickname } = req.body || {};
  if (!USER_RE.test(username || '')) return res.status(400).json({ error: '아이디는 영문/숫자/_ 3~20자여야 합니다.' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
  const nick = String(nickname || username).trim().slice(0, 16) || username;
  const user = { username, nickname: nick, pw: hashPassword(password), rating: 1000, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, created: Date.now() };
  if (!(await store.createUser(user))) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  res.json({ token: signToken(username), user: publicUser(user) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!rateLimit('login:' + req.ip, 20, 15 * 60 * 1000)) return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.' });
  const user = typeof username === 'string' ? await store.getUser(username) : null;
  if (!user || !verifyPassword(String(password || ''), user.pw)) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  res.json({ token: signToken(user.username), user: publicUser(user) });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const user = await store.getUser(req.username);
  if (!user) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
  res.json({ user: publicUser(user) });
}));

app.patch('/api/me', auth, wrap(async (req, res) => {
  const patch = {};
  if (typeof req.body?.nickname === 'string') patch.nickname = req.body.nickname.trim().slice(0, 16) || req.username;
  if (typeof req.body?.favClub === 'string') patch.favClub = req.body.favClub.slice(0, 12);
  const user = await store.updateUser(req.username, patch);
  res.json({ user: publicUser(user) });
}));

const SLOT_RE = /^(manager|player)[1-3]$/;
app.get('/api/saves', auth, wrap(async (req, res) => res.json({ saves: await store.listSaves(req.username) })));
app.get('/api/saves/:slot', auth, wrap(async (req, res) => {
  if (!SLOT_RE.test(req.params.slot)) return res.status(400).json({ error: 'bad slot' });
  const s = await store.getSave(req.username, req.params.slot);
  if (!s) return res.status(404).json({ error: '저장 데이터가 없습니다.' });
  res.json(s);
}));
app.put('/api/saves/:slot', auth, wrap(async (req, res) => {
  if (!SLOT_RE.test(req.params.slot)) return res.status(400).json({ error: 'bad slot' });
  if (!req.body || typeof req.body.data !== 'object') return res.status(400).json({ error: 'no data' });
  await store.setSave(req.username, req.params.slot, req.body.data);
  res.json({ ok: true });
}));
app.delete('/api/saves/:slot', auth, wrap(async (req, res) => {
  if (!SLOT_RE.test(req.params.slot)) return res.status(400).json({ error: 'bad slot' });
  await store.deleteSave(req.username, req.params.slot);
  res.json({ ok: true });
}));

app.get('/api/leaderboard', wrap(async (req, res) => res.json({ users: await store.leaderboard(50) })));

// SPA fallback
app.get(/^\/(?!api|shared|vendor|socket\.io).*/, (req, res) => res.sendFile(path.join(ROOT, 'public/index.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e5 });
setupOnline(io, store);

server.listen(PORT, () => console.log(`SF2027 running on http://localhost:${PORT}`));

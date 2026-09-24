// Online multiplayer: matchmaking, private rooms and a server-authoritative
// match loop that runs the shared engine (shared/sim.js) at 60 Hz and streams
// snapshots to both players at 20 Hz.
import { Match } from '../shared/sim.js';
import { buildTeam } from '../shared/squad.js';
import { CLUB_BY_ID } from '../shared/data/leagues.js';
import { verifyToken } from './auth.js';
import { publicUser } from './store.js';

const TICK_MS = 50, STEPS = 3, DT = 1 / 60;

export function setupOnline(io, store) {
  const queue = []; // { socket, clubId }
  const rooms = new Map(); // id -> room
  const socketRoom = new Map(); // socket.id -> room id
  let roomSeq = 1;

  io.use(async (socket, next) => {
    const username = verifyToken(socket.handshake.auth?.token);
    if (!username) return next(new Error('unauthorized'));
    const user = await store.getUser(username).catch(() => null);
    if (!user) return next(new Error('unauthorized'));
    socket.data.username = user.username;
    socket.data.nickname = user.nickname || user.username;
    next();
  });

  const lobbyInfo = () => ({ online: io.engine.clientsCount, queue: queue.length, matches: [...rooms.values()].filter(r => r.match).length });
  setInterval(() => io.emit('lobby', lobbyInfo()), 5000).unref();

  io.on('connection', (socket) => {
    socket.emit('lobby', lobbyInfo());

    socket.on('queue:join', ({ clubId } = {}) => {
      if (!CLUB_BY_ID[clubId] || socketRoom.has(socket.id)) return;
      leaveQueue(socket);
      // avoid pairing a user with themselves (two tabs)
      const idx = queue.findIndex(q => q.socket.data.username !== socket.data.username);
      if (idx >= 0) {
        const other = queue.splice(idx, 1)[0];
        startRoom(createRoom(false), [other, { socket, clubId }]);
      } else {
        queue.push({ socket, clubId });
        socket.emit('queue:waiting', { position: queue.length });
      }
    });
    socket.on('queue:leave', () => leaveQueue(socket));

    socket.on('room:create', ({ clubId } = {}) => {
      if (!CLUB_BY_ID[clubId] || socketRoom.has(socket.id)) return;
      leaveQueue(socket);
      const room = createRoom(true);
      room.waiting = { socket, clubId };
      socketRoom.set(socket.id, room.id);
      socket.emit('room:created', { code: room.code });
    });
    socket.on('room:join', ({ code, clubId } = {}) => {
      if (!CLUB_BY_ID[clubId] || socketRoom.has(socket.id)) return;
      const room = [...rooms.values()].find(r => r.code && r.code === String(code || '').toUpperCase() && r.waiting && !r.match);
      if (!room) return socket.emit('room:error', { message: '방을 찾을 수 없습니다.' });
      if (room.waiting.socket.data.username === socket.data.username) return socket.emit('room:error', { message: '자기 자신과는 대결할 수 없습니다.' });
      leaveQueue(socket);
      const host = room.waiting; room.waiting = null;
      startRoom(room, [host, { socket, clubId }]);
    });
    socket.on('room:leave', () => { const room = rooms.get(socketRoom.get(socket.id)); if (room) abandon(room, socket); });

    socket.on('input', (inp) => {
      const room = rooms.get(socketRoom.get(socket.id));
      if (!room || !room.match) return;
      const team = room.players.findIndex(p => p.socket.id === socket.id);
      if (team < 0) return;
      room.inputs[team] = sanitize(inp);
    });
    socket.on('chat', (msg) => {
      const room = rooms.get(socketRoom.get(socket.id));
      if (!room) return;
      const text = String(msg || '').slice(0, 80);
      for (const p of room.players) p.socket.emit('chat', { from: socket.data.nickname, text });
    });
    socket.on('disconnect', () => {
      leaveQueue(socket);
      const room = rooms.get(socketRoom.get(socket.id));
      if (room) abandon(room, socket);
    });
  });

  function leaveQueue(socket) { const i = queue.findIndex(q => q.socket.id === socket.id); if (i >= 0) queue.splice(i, 1); }

  function createRoom(priv) {
    const id = `r${roomSeq++}`;
    let code = null;
    if (priv) { do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while ([...rooms.values()].some(r => r.code === code)); }
    const room = { id, code, players: [], inputs: [{}, {}], match: null, timer: null, over: false };
    rooms.set(id, room);
    return room;
  }

  function startRoom(room, entries) {
    room.players = entries.map((e, team) => ({ socket: e.socket, clubId: e.clubId, team, username: e.socket.data.username, nickname: e.socket.data.nickname }));
    for (const p of room.players) socketRoom.set(p.socket.id, room.id);
    const home = buildTeam(room.players[0].clubId), away = buildTeam(room.players[1].clubId);
    const seed = (Math.random() * 1e9) | 0;
    room.match = new Match({ home, away, controllers: [{ team: 0 }, { team: 1 }], difficulty: 2, seed, allowSkip: false });
    for (const p of room.players) {
      p.socket.emit('match:start', {
        home, away, you: p.team, seed,
        names: room.players.map(q => q.nickname),
        realSeconds: room.match.realSeconds,
      });
    }
    // 3 second countdown, then run
    room.startAt = Date.now() + 3500;
    room.timer = setInterval(() => tick(room), TICK_MS);
  }

  function tick(room) {
    if (room.over) return;
    if (Date.now() < room.startAt) return;
    const m = room.match;
    for (let i = 0; i < STEPS; i++) m.step(DT, room.inputs);
    const snap = m.snapshot();
    snap.ev = m.drainEvents();
    for (const p of room.players) p.socket.volatile.emit('snap', snap);
    if (m.finished) finish(room, null);
  }

  async function finish(room, forfeitBy) {
    if (room.over) return;
    room.over = true;
    clearInterval(room.timer);
    const m = room.match;
    if (!m.finished) m.finalize();
    const res = m.result();
    let score = res.score;
    if (forfeitBy !== null && forfeitBy !== undefined) {
      const w = 1 - forfeitBy;
      if (score[w] <= score[forfeitBy]) { score = [0, 0]; score[w] = 3; }
    }
    const [u0, u1] = await Promise.all(room.players.map(p => store.getUser(p.username).catch(() => null)));
    const deltas = [0, 0];
    if (u0 && u1) {
      const r0 = u0.rating ?? 1000, r1 = u1.rating ?? 1000;
      const e0 = 1 / (1 + 10 ** ((r1 - r0) / 400));
      const s0 = score[0] > score[1] ? 1 : score[0] < score[1] ? 0 : 0.5;
      deltas[0] = Math.round(32 * (s0 - e0)); deltas[1] = -deltas[0];
      const upd = (u, t, d) => {
        const gf = score[t], ga = score[1 - t];
        return store.updateUser(u.username, {
          rating: Math.max(100, (u.rating ?? 1000) + d),
          wins: (u.wins || 0) + (gf > ga ? 1 : 0), draws: (u.draws || 0) + (gf === ga ? 1 : 0), losses: (u.losses || 0) + (gf < ga ? 1 : 0),
          gf: (u.gf || 0) + gf, ga: (u.ga || 0) + ga,
        });
      };
      await Promise.all([upd(u0, 0, deltas[0]), upd(u1, 1, deltas[1])]).catch(e => console.error('[online] rating update failed', e));
    }
    for (const p of room.players) {
      const u = await store.getUser(p.username).catch(() => null);
      if (p.socket.connected) p.socket.emit('match:end', { ...res, score, forfeitBy, ratingDelta: deltas[p.team], you: p.team, user: u ? publicUser(u) : null });
      socketRoom.delete(p.socket.id);
    }
    rooms.delete(room.id);
  }

  function abandon(room, socket) {
    if (!room.match) { // waiting private room
      socketRoom.delete(socket.id); rooms.delete(room.id); return;
    }
    const team = room.players.findIndex(p => p.socket.id === socket.id);
    if (team >= 0) finish(room, team);
  }
}

function sanitize(inp) {
  if (!inp || typeof inp !== 'object') return {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const taps = {};
  if (inp.taps && typeof inp.taps === 'object') for (const k of ['pass', 'shoot', 'through', 'lob', 'sw', 'skill']) { const v = inp.taps[k]; if (Number.isInteger(v) && v >= 0) taps[k] = v; }
  return { mx: num(inp.mx), mz: num(inp.mz), sprint: !!inp.sprint, pass: !!inp.pass, shoot: !!inp.shoot, through: !!inp.through, lob: !!inp.lob, finesse: !!inp.finesse, taps };
}

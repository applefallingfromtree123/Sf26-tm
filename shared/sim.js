// SF2027 match engine — deterministic-ish football simulation shared by
// the browser (offline modes) and the Node server (online, authoritative).
// Units: metres, seconds. Pitch 105 x 68. x = length, z = width, y = up.
import { rng } from './squad.js';

export const PITCH = { L: 105, W: 68, HL: 52.5, HW: 34, GW: 3.66, GH: 2.44, BOX_D: 16.5, BOX_W: 20.16, SIX_D: 5.5, SIX_W: 9.16, PEN: 11, CIRCLE: 9.15 };
const { HL, HW, GW, GH } = PITCH;
const BR = 0.11, G = 9.81;
export const STATE = { normal: 0, kick: 1, slide: 2, dive: 3, fallen: 4, celebrate: 5, throw: 6, hold: 7, header: 8, skill: 9, tackle: 10 };
export const MATCH_REAL_SECONDS = 720; // 12 real minutes = 90 game minutes

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const GROUP = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD' };

// difficulty tables (index 0..4): amateur .. legendary
const DIFF = {
  noise: [0.4, 0.28, 0.16, 0.08, 0.03],
  react: [0.38, 0.26, 0.15, 0.08, 0.03],
  passErr: [1.9, 1.45, 1.1, 0.9, 0.72],
  shotErr: [1.7, 1.35, 1.05, 0.9, 0.78],
  aggr: [0.45, 0.65, 0.9, 1.05, 1.22],
  speed: [0.9, 0.95, 1, 1.02, 1.045],
  gk: [-0.14, -0.07, 0, 0.04, 0.08],
};

// rolling ball: dv/dt = -(C0 + C1 v)
const C0 = 0.9, C1 = 0.22;
function rollDist(v0, v1) { return ((v0 - v1) - (C0 / C1) * Math.log((C0 + C1 * v0) / (C0 + C1 * v1))) / C1; }
function passSpeedFor(d, vEnd = 5) { let lo = vEnd, hi = 45; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (rollDist(m, vEnd) < d) lo = m; else hi = m; } return (lo + hi) / 2; }

export class Match {
  constructor(opts) {
    this.opts = opts;
    this.teams = [opts.home, opts.away];
    this.realSeconds = opts.realSeconds || MATCH_REAL_SECONDS;
    this.gameSpeed = 5400 / this.realSeconds;
    this.difficulty = clamp(opts.difficulty ?? 2, 0, 4);
    this.allowSkip = opts.allowSkip !== false;
    this.r = rng(opts.seed || ((Math.random() * 1e9) | 0));
    this.controllers = (opts.controllers || []).map(c => ({ team: c.team, lock: c.lock ?? -1, pi: -1, prevTaps: {}, prevHeld: {}, charge: 0, charging: false, buffer: null, idle: 0, callT: 0 }));
    this.humanTeams = new Set(this.controllers.map(c => c.team));
    this.players = [];
    this.teams.forEach((tm, t) => tm.xi.forEach((info, ti) => {
      const a = {}; for (const k of ['pac', 'sho', 'pas', 'dri', 'def', 'phy']) a[k] = (info.attrs?.[k] ?? 60) / 100;
      const slot = tm.slots[ti];
      this.players.push({
        i: this.players.length, team: t, ti, slot, info, a, isGK: slot.pos === 'GK', group: GROUP[slot.pos] || 'MID',
        x: 0, z: 0, vx: 0, vz: 0, face: 0, stamina: 1, state: 0, stateT: 0, stateDur: 1, cool: 0, stun: 0, skillT: 0,
        yellow: 0, off: false, tx: 0, tz: 0, tspd: 0.5, next: 0, run: null, diveDir: 0, holdT: 0, lastKick: -1, human: false,
        st: { goals: 0, assists: 0, shots: 0, sot: 0, passes: 0, passOk: 0, tackles: 0, tackleOk: 0, saves: 0, fouls: 0, rating: 6.0, touches: 0, km: 0 },
      });
    }));
    this.ball = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: -1, lastTouch: -1, lastTeam: -1, kickId: 0, kind: '', shot: null, pass: null, inGoal: false, dribPh: 0 };
    this.time = 0; this.half = 1; this.added = [0, 0]; this.addedShown = [false, false];
    this.score = [0, 0];
    this.realT = 0;
    this.phase = 'kickoff'; this.phaseT = 0; this.sp = null;
    this.events = [];
    this.scorers = [];
    this.stats = [0, 1].map(() => ({ poss: 0, shots: 0, sot: 0, passes: 0, passOk: 0, fouls: 0, corners: 0, yellow: 0, red: 0, offsides: 0, saves: 0, tackles: 0 }));
    this.firstKick = this.r() < 0.5 ? 0 : 1;
    this.finished = false;
    this.lastTouchTeam = -1;
    this.pred = [];
    this.ctx = { chaser: [-1, -1], presser: [-1, -1], presser2: [-1, -1], poss: -1 };
    this.lastPassInfo = null; // for assists
    this.setupKickoff(this.firstKick);
  }

  // ---------- geometry helpers ----------
  dir(t) { return (t === 0 ? 1 : -1) * (this.half === 1 ? 1 : -1); }
  goalX(t) { return this.dir(t) * HL; } // goal the team attacks
  ownGoalX(t) { return -this.dir(t) * HL; }
  toWorld(t, depth, width) { const d = this.dir(t); return [d * (-HL + depth * 105), width * HW * d]; }
  depthOf(t, x) { return (x * this.dir(t) + HL) / 105; }
  isCPU(t) { return !this.humanTeams.has(t); }
  dmod(t, key) { return this.isCPU(t) ? DIFF[key][this.difficulty] : DIFF[key][2]; }
  active(t) { return this.players.filter(p => !p.off && (t === undefined || p.team === t)); }
  gk(t) { return this.players.find(p => p.team === t && p.isGK && !p.off) || null; }
  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  inBox(t, x, z) { // inside the penalty box that team t defends
    const gx = this.ownGoalX(t);
    return Math.abs(x - gx) <= PITCH.BOX_D && Math.abs(z) <= PITCH.BOX_W && Math.sign(x) === Math.sign(gx);
  }
  maxSpeed(p) {
    const base = 6.4 + p.a.pac * 3.9; // brisk, arcade-leaning pace
    return base * (0.82 + 0.18 * p.stamina) * this.dmod(p.team, 'speed') * (p.ti === this.lockedTi(p.team) ? 1.02 : 1);
  }
  lockedTi(t) { const c = this.controllers.find(c => c.team === t && c.lock >= 0); return c ? c.lock : -99; }

  // ---------- setup ----------
  placeFormation(t, ballX, ballZ, ownHalf, compact = 0) {
    for (const p of this.active(t)) {
      const [x, z] = this.shapePos(p, ballX, ballZ, this.ctx.poss === t);
      let px = x;
      if (ownHalf) px = this.dir(t) * Math.min(px * this.dir(t), -0.8);
      p.x = px; p.z = z * (1 - compact); p.vx = p.vz = 0; p.state = 0; p.stateT = 0; p.stun = 0;
      p.face = this.dir(t) > 0 ? 0 : Math.PI; p.tx = p.x; p.tz = p.z; p.run = null;
    }
  }
  resetBall(x, z, y = BR) { Object.assign(this.ball, { x, y, z, vx: 0, vy: 0, vz: 0, spin: 0, owner: -1, shot: null, pass: null, inGoal: false }); }

  setupKickoff(team) {
    this.resetBall(0, 0);
    this.ctx.poss = team;
    for (const t of [0, 1]) {
      for (const p of this.active(t)) {
        const d = this.dir(t);
        let depth = Math.min(p.slot.d * 0.78 + 0.03, 0.46), width = p.slot.w * 0.92;
        if (p.isGK) depth = 0.02;
        let [x, z] = this.toWorld(t, depth, width);
        if (t !== team && hyp(x, z) < 10) { const k = 10.2 / Math.max(0.1, hyp(x, z)); x *= k; z *= k; if (x * d > -0.5) x = -0.6 * d; }
        Object.assign(p, { x, z, vx: 0, vz: 0, state: 0, stateT: 0, stun: 0, run: null, face: d > 0 ? 0 : Math.PI });
      }
    }
    // two strikers at the spot
    const fw = this.active(team).filter(p => !p.isGK).sort((a, b) => b.slot.d - a.slot.d);
    const d = this.dir(team);
    if (fw[0]) Object.assign(fw[0], { x: -0.35 * d, z: 0.2 });
    if (fw[1]) Object.assign(fw[1], { x: -1.2 * d, z: -8 });
    this.phase = 'kickoff'; this.phaseT = 0;
    this.sp = { type: 'kickoff', team, taker: fw[0] ? fw[0].i : -1, x: 0, z: 0, wait: this.humanTeams.has(team) };
    this.assignSetpieceControl();
    this.emit('whistle', { kind: 'kickoff', team });
  }

  // ---------- main step ----------
  step(dt, inputs = []) {
    if (this.finished) return;
    this.realT += dt;
    this.phaseT += dt;
    for (const p of this.players) p.human = false;
    this.controllers.forEach((c, ci) => { if (c.pi >= 0) this.players[c.pi].human = true; });

    if (this.phase === 'goal') return this.stepCelebration(dt, inputs);
    if (this.phase === 'halftime') {
      const skip = this.allowSkip && inputs.some((inp, ci) => this.tapped(ci, inp, 'skip'));
      this.consumeTaps(inputs);
      if (this.phaseT > 8 || skip) this.startSecondHalf();
      return;
    }
    if (this.phase === 'fulltime') return;

    // clock
    const prevTime = this.time;
    this.time += dt * this.gameSpeed;
    this.checkClock(prevTime);
    if (this.phase === 'halftime' || this.phase === 'fulltime') return;

    if (this.phase === 'kickoff' || this.phase === 'setpiece') {
      this.stepSetPiece(dt, inputs);
      this.consumeTaps(inputs);
      return;
    }
    // --- open play ---
    this.teamContext(dt);
    this.controllers.forEach((c, ci) => this.processHuman(c, ci, inputs[ci] || {}, dt));
    for (const p of this.players) {
      if (p.off) continue;
      if (p.cool > 0) p.cool -= dt;
      if (p.skillT > 0) p.skillT -= dt;
      if (p.stateT > 0) { p.stateT -= dt; if (p.stateT <= 0) { if (p.state === STATE.fallen || p.state === STATE.slide || p.state === STATE.dive) p.stun = 0.15; p.state = 0; } }
      if (p.stun > 0) p.stun -= dt;
      if (!p.human) this.aiPlayer(p, dt);
      this.movePlayer(p, dt);
    }
    this.separatePlayers();
    this.updateBall(dt);
    this.checkControl();
    this.checkBallRules();
    // possession stat
    const pt = this.ball.owner >= 0 ? this.players[this.ball.owner].team : this.lastTouchTeam;
    if (pt >= 0) this.stats[pt].poss += dt;
    this.consumeTaps(inputs);
  }

  checkClock(prev) {
    const h1 = 2700, h2 = 5400;
    if (this.half === 1 && prev < h1 && this.time >= h1 && !this.addedShown[0]) {
      this.added[0] = 60 * (1 + Math.floor(this.r() * 2) + Math.min(2, Math.floor((this.score[0] + this.score[1]) / 2)));
      this.addedShown[0] = true; this.emit('addedTime', { min: this.added[0] / 60 });
    }
    if (this.half === 2 && prev < h2 && this.time >= h2 && !this.addedShown[1]) {
      this.added[1] = 60 * (2 + Math.floor(this.r() * 3));
      this.addedShown[1] = true; this.emit('addedTime', { min: this.added[1] / 60 });
    }
    const end = this.half === 1 ? h1 + this.added[0] : h2 + this.added[1];
    if (this.addedShown[this.half - 1] && this.time >= end && (this.phase === 'play' || this.phase === 'setpiece')) {
      // do not blow during a penalty or dangerous attack in the box
      if (this.sp && this.sp.type === 'penalty') return;
      if (this.ball.shot && this.phase === 'play') return;
      if (this.half === 1) { this.phase = 'halftime'; this.phaseT = 0; this.sp = null; this.emit('halftime', { score: [...this.score] }); }
      else { this.phase = 'fulltime'; this.phaseT = 0; this.finished = true; this.sp = null; this.finalize(); this.emit('fulltime', { score: [...this.score] }); }
    }
  }

  startSecondHalf() {
    this.half = 2; this.time = 2700;
    for (const p of this.players) p.stamina = Math.min(1, p.stamina + 0.25);
    this.setupKickoff(1 - this.firstKick);
  }

  // ---------- input helpers ----------
  tapped(ci, inp, key) { const c = this.controllers[ci]; if (!c || !inp || !inp.taps) return false; return (inp.taps[key] || 0) > (c.prevTaps[key] || 0); }
  consumeTaps(inputs) {
    this.controllers.forEach((c, ci) => { const inp = inputs[ci]; if (inp && inp.taps) c.prevTaps = { ...inp.taps }; if (inp) c.prevHeld = { pass: !!inp.pass, shoot: !!inp.shoot, through: !!inp.through, lob: !!inp.lob }; });
  }

  assignSetpieceControl() {
    for (const c of this.controllers) {
      if (!this.sp) continue;
      if (c.lock >= 0) { c.pi = this.teamPlayer(c.team, c.lock)?.i ?? -1; continue; }
      if (this.sp.team === c.team && this.sp.taker >= 0) c.pi = this.sp.taker;
      else c.pi = this.nearestTo(c.team, this.ball.x, this.ball.z, true)?.i ?? -1;
    }
  }
  teamPlayer(t, ti) { return this.players.find(p => p.team === t && p.ti === ti && !p.off); }
  nearestTo(t, x, z, noGK = false, exclude = -1) {
    let best = null, bd = 1e9;
    for (const p of this.active(t)) { if ((noGK && p.isGK) || p.i === exclude) continue; const d = hyp(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ---------- human control ----------
  processHuman(c, ci, inp, dt) {
    const b = this.ball;
    // choose controlled player
    if (c.lock >= 0) {
      const lp = this.teamPlayer(c.team, c.lock);
      c.pi = lp ? lp.i : -1;
    } else {
      if (c.pi < 0 || this.players[c.pi].off) c.pi = this.nearestTo(c.team, b.x, b.z, true)?.i ?? -1;
      const owner = b.owner >= 0 ? this.players[b.owner] : null;
      if (owner && owner.team === c.team && c.pi !== owner.i) c.pi = owner.i;
      // switch
      if (this.tapped(ci, inp, 'sw') && !(owner && owner.team === c.team)) {
        const cand = this.active(c.team).filter(p => !p.isGK && p.i !== c.pi);
        let best = null, bs = 1e9;
        for (const p of cand) {
          const d = hyp(p.x - b.x, p.z - b.z);
          const goalSide = (b.x - p.x) * this.dir(c.team) > 0 ? -2 : 0;
          let s = d + goalSide;
          if (inp.mx || inp.mz) { const ang = Math.atan2(p.z - this.players[c.pi].z, p.x - this.players[c.pi].x); const ia = Math.atan2(inp.mz, inp.mx); s += Math.abs(angDiff(ang, ia)) * 6; }
          if (s < bs) { bs = s; best = p; }
        }
        if (best) c.pi = best.i;
      }
      // auto switch to chaser on loose balls
      const moving = Math.abs(inp.mx || 0) + Math.abs(inp.mz || 0) > 0.1;
      c.idle = moving ? 0 : c.idle + dt;
      if (!owner && !(b.pass && b.pass.team === c.team)) {
        const ch = this.ctx.chaser[c.team];
        if (ch >= 0 && ch !== c.pi && !this.players[ch].isGK) {
          const cp = this.players[c.pi];
          const dC = hyp(cp.x - b.x, cp.z - b.z);
          if (c.idle > 0.3 || dC > 14) c.pi = ch;
        }
      }
    }
    if (c.pi < 0) return;
    const p = this.players[c.pi];
    const hasBall = b.owner === p.i;
    const teamHasBall = b.owner >= 0 && this.players[b.owner].team === c.team;
    // buffer actions (one-touch)
    const actions = ['pass', 'shoot', 'through', 'lob'];
    for (const a of actions) if (this.tapped(ci, inp, a)) c.buffer = { a, t: this.realT };
    if (this.tapped(ci, inp, 'skill') && hasBall) this.skillMove(p, inp);

    // movement
    let mx = inp.mx || 0, mz = inp.mz || 0;
    const mag = Math.min(1, hyp(mx, mz));
    const busy = p.state === STATE.slide || p.state === STATE.fallen || p.state === STATE.dive || p.stun > 0;
    if (!busy) {
      let spd = this.maxSpeed(p) * (inp.sprint ? 1 : 0.74) * mag;
      if (hasBall) spd *= inp.sprint ? 0.96 : 0.93;
      let dvx = mag > 0.05 ? (mx / mag) * spd : 0, dvz = mag > 0.05 ? (mz / mag) * spd : 0;
      // contain / pressure (hold pass while defending)
      if (!teamHasBall && inp.pass && b.owner >= 0 && mag < 0.1) {
        const o = this.players[b.owner];
        const gx = this.ownGoalX(p.team);
        const tx = o.x + (gx - o.x) / Math.max(1, hyp(gx - o.x, o.z)) * 1.3, tz = o.z + (0 - o.z) / Math.max(1, hyp(gx - o.x, o.z)) * 1.3;
        const d = hyp(tx - p.x, tz - p.z);
        const s = Math.min(this.maxSpeed(p) * (inp.sprint ? 1 : 0.7), d * 3);
        if (d > 0.2) { dvx = (tx - p.x) / d * s; dvz = (tz - p.z) / d * s; }
      }
      // loose ball: hold pass/sprint runs at ball when nothing pressed? no — human steers.
      p.dvx = dvx; p.dvz = dvz; p.sprinting = !!inp.sprint && mag > 0.1;
      if (hasBall && mag < 0.05) { p.dvx = 0; p.dvz = 0; }
    } else { p.dvx = p.vx * 0.9; p.dvz = p.vz * 0.9; }
    // pass receiver assist: the intended receiver automatically runs to meet the ball
    // (right after the pass, when the stick is idle, or when the stick points roughly at the ball)
    if (!busy && b.owner < 0 && b.pass && b.pass.target === p.i && b.pass.team === p.team) {
      const ip = this.interceptPoint(p);
      const dx = ip[0] - p.x, dz = ip[1] - p.z, dl = hyp(dx, dz) || 1;
      const toward = mag > 0.1 ? (mx * dx + mz * dz) / (mag * dl) : 1;
      if (this.realT - b.pass.t < 0.55 || mag < 0.1 || toward > 0.2) { this.steerTo(p, ip[0], ip[1], inp.sprint || dl > 4 ? 1 : 0.85, 6); p.sprinting = true; }
    }
    if (p.isGK && hasBall) { p.dvx = 0; p.dvz = 0; p.holdT += dt; if (p.holdT > 6) { this.gkDistribute(p); return; } }
    // second-man press
    if (!teamHasBall && inp.through && b.owner >= 0) this.ctx.teamPress = c.team;

    const aimX = mag > 0.1 ? mx / mag : Math.cos(p.face), aimZ = mag > 0.1 ? mz / mag : Math.sin(p.face);
    // shooting charge
    if (hasBall) {
      if (c.buffer && this.realT - c.buffer.t < 0.45) {
        const a = c.buffer.a;
        if (a === 'shoot') { c.charging = true; c.charge = Math.max(c.charge, 0.05); c.buffer = null; if (!inp.shoot) { this.humanShoot(c, p, inp, Math.max(0.35, c.charge)); c.charging = false; c.charge = 0; } }
        else if (p.cool <= 0 && b.owner === p.i && (this.realT - (p.gotBallT || 0)) > 0.02) {
          c.buffer = null;
          if (a === 'pass') this.humanPass(c, p, aimX, aimZ, 'pass');
          else if (a === 'through') this.humanPass(c, p, aimX, aimZ, 'through');
          else if (a === 'lob') this.humanPass(c, p, aimX, aimZ, 'lob');
        }
      }
      if (c.charging) {
        if (inp.shoot) c.charge = Math.min(1.15, c.charge + dt / 0.95);
        else { this.humanShoot(c, p, inp, Math.max(0.25, c.charge)); c.charging = false; c.charge = 0; }
      }
    } else {
      const oppHasBall = b.owner >= 0 && !teamHasBall;
      c.charging = false;
      if (inp.shoot && !oppHasBall) c.charge = Math.min(1.15, c.charge + dt / 0.95); else c.charge = 0;
      // defending actions
      if (oppHasBall && c.buffer && this.realT - c.buffer.t < 0.1) {
        if (c.buffer.a === 'pass') { this.tryTackle(p, false); c.buffer = null; }
        else if (c.buffer.a === 'shoot') { this.tryTackle(p, true); c.buffer = null; }
      }
      // call for the ball (player career)
      if (teamHasBall && c.lock >= 0 && c.buffer && c.buffer.a === 'pass') { c.callT = this.realT; c.buffer = null; this.emit('callForBall', { p: p.i }); }
      if (teamHasBall && c.lock < 0 && c.buffer && c.buffer.a === 'shoot') c.buffer = null;
      if (c.buffer && this.realT - c.buffer.t > 0.5) { c.buffer = null; }
      // header / volley on incoming ball with buffered shot or pass
      if (b.owner < 0) {
        const d = hyp(b.x - p.x, b.z - p.z);
        const wantShoot = inp.shoot || (c.buffer && c.buffer.a === 'shoot');
        const wantPass = c.buffer && (c.buffer.a === 'pass' || c.buffer.a === 'lob' || c.buffer.a === 'through');
        if (d < 1.1 && p.cool <= 0 && b.y > 0.5 && b.y < 2.6 && (wantShoot || wantPass)) {
          this.header(p, wantShoot ? 'shot' : 'pass', aimX, aimZ);
          c.charging = false; c.charge = 0; c.buffer = null;
        } else if (d < 0.95 && p.cool <= 0 && b.y <= 0.5 && wantShoot && hyp(b.vx, b.vz) > 4) {
          // first-time shot
          b.owner = p.i; this.humanShoot(c, p, inp, Math.max(0.4, c.charge)); c.charging = false; c.charge = 0; c.buffer = null;
        }
      }
    }
  }

  humanPass(c, p, ax, az, type) {
    const b = this.ball;
    let target = this.pickPassTarget(p, ax, az, type);
    if (type === 'lob' && this.isCrossZone(p) && !target) target = this.bestCrossTarget(p);
    if (target) {
      if (type === 'pass') this.groundPass(p, target, false);
      else if (type === 'through') this.groundPass(p, target, true);
      else if (type === 'lob') { if (this.isCrossZone(p)) this.cross(p, target); else this.lobPass(p, target); }
      if (c.lock < 0) c.pi = target.i;
    } else {
      // pass into space
      const dist = type === 'lob' ? 30 : 18;
      const tx = p.x + ax * dist, tz = p.z + az * dist;
      if (type === 'lob') this.lobTo(p, tx, tz, null); else this.groundTo(p, tx, tz, null, type === 'through' ? 3 : 5);
    }
  }

  humanShoot(c, p, inp, power) {
    const mag = hyp(inp.mx || 0, inp.mz || 0);
    const gx = this.goalX(p.team);
    let aimZ;
    if (mag > 0.25) aimZ = clamp((inp.mz / Math.max(mag, 0.5)) * 3.3, -3.3, 3.3);
    else aimZ = (p.z > 0.5 ? -1 : p.z < -0.5 ? 1 : (this.r() < 0.5 ? -1 : 1)) * 2.6;
    // if not facing goal at all (e.g. back to goal in own half), shoot in stick direction as a clearance
    const toGoal = Math.abs(gx - p.x);
    if (toGoal > 45) { const ax = mag > 0.1 ? inp.mx / mag : Math.cos(p.face), az = mag > 0.1 ? inp.mz / mag : Math.sin(p.face); this.clearBall(p, ax, az, power); return; }
    this.shoot(p, power, aimZ, !!inp.finesse);
  }

  // ---------- team context ----------
  teamContext(dt) {
    const b = this.ball;
    this.ctx.teamPress = -1;
    // ball prediction (loose ball)
    const pred = this.pred; pred.length = 0;
    let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
    const st = 0.1;
    for (let i = 0; i <= 30; i++) {
      pred.push([x, y, z]);
      for (let k = 0; k < 2; k++) {
        const h = st / 2;
        if (y > BR + 0.01 || vy > 0) { vy -= G * h; const f = 1 - 0.012 * hyp(vx, vy, vz) * h; vx *= f; vy *= f; vz *= f; }
        else { const sp = hyp(vx, vz); const dec = (C0 + C1 * sp) * h; const s = sp > dec ? (sp - dec) / sp : 0; vx *= s; vz *= s; }
        x += vx * h; y += vy * h; z += vz * h;
        if (y < BR) { y = BR; vy = vy < -1.2 ? -vy * 0.5 : 0; }
      }
    }
    this.ctx.poss = b.owner >= 0 ? this.players[b.owner].team : (b.pass ? b.pass.team : -1);
    for (const t of [0, 1]) {
      this.ctx.chaser[t] = -1; this.ctx.presser[t] = -1; this.ctx.presser2[t] = -1;
      if (b.owner < 0) {
        let best = -1, bt = 1e9;
        for (const p of this.active(t)) {
          if (p.isGK && !this.inBox(t, b.x, b.z)) continue;
          if (p.state === STATE.fallen) continue;
          const ms = this.maxSpeed(p);
          for (let i = 0; i < pred.length; i++) {
            const [bx, by, bz] = pred[i];
            const tt = i * st;
            if (by > 2.6) continue;
            const reach = hyp(bx - p.x, bz - p.z) - 0.6;
            const need = reach / ms + 0.15 + (p.stun > 0 ? p.stun : 0);
            if (need <= tt || i === pred.length - 1) {
              const score = Math.max(need, tt) + (b.pass && b.pass.target === p.i ? -0.6 : 0);
              if (score < bt) { bt = score; best = p.i; }
              break;
            }
          }
        }
        this.ctx.chaser[t] = best;
      } else {
        const o = this.players[b.owner];
        if (o.team !== t && !o.isGK) {
          const gx = this.ownGoalX(t);
          const hp = this.humanPi(t);
          const arr = this.active(t).filter(p => !p.isGK && !(p.i === hp && hyp(p.x - o.x, p.z - o.z) > 8)).map(p => ({ p, d: hyp(p.x - o.x, p.z - o.z) + ((o.x - p.x) * this.dir(t) > 0 ? 3 : 0) })).sort((a, b) => a.d - b.d);
          if (arr[0]) this.ctx.presser[t] = arr[0].p.i;
          if (arr[1] && (this.isCPU(t) ? this.difficulty >= 2 : false) && arr[1].d < 14 && Math.abs(o.x - gx) < 60) this.ctx.presser2[t] = arr[1].p.i;
        }
      }
    }
    // offside lines (depth of second-to-last defender, for each team as the defending side)
    this.offLine = [0, 1].map(t => {
      const d = this.dir(t);
      const xs = this.active(t).map(p => p.x * d).sort((a, b) => a - b); // own goal side first
      return xs.length > 1 ? xs[1] * d : this.ownGoalX(t);
    });
  }

  // ---------- AI ----------
  shapePos(p, bx, bz, inPoss) {
    const t = p.team, s = p.slot;
    const ballDepth = this.depthOf(t, bx);
    const ballW = (bz * this.dir(t)) / HW;
    let depth, width;
    if (p.isGK) {
      return [this.ownGoalX(t) + this.dir(t) * 1.2, clamp(bz * 0.08, -2, 2)];
    }
    if (inPoss) {
      depth = s.d * 0.64 + ballDepth * 0.48 - 0.02;
      width = s.w * 1.08 + ballW * 0.14;
      if (p.group === 'DEF') depth = Math.min(depth, ballDepth + 0.02);
    } else {
      depth = s.d * 0.7 + ballDepth * 0.42 - 0.09;
      width = s.w * 0.72 + ballW * 0.32;
      if (p.group === 'DEF') depth = Math.min(depth, Math.max(0.1, ballDepth - 0.06));
    }
    depth = clamp(depth, 0.05, 0.92); width = clamp(width, -0.94, 0.94);
    return this.toWorld(t, depth, width);
  }

  aiPlayer(p, dt) {
    const b = this.ball;
    if (p.state === STATE.slide || p.state === STATE.fallen || p.state === STATE.dive || p.stun > 0) { p.dvx = p.vx * 0.92; p.dvz = p.vz * 0.92; if (p.isGK && p.state === STATE.dive) this.gkSaveCheck(p); return; }
    if (p.isGK) return this.gkUpdate(p, dt);
    const t = p.team;
    if (b.owner === p.i) return this.carrierAI(p, dt);
    let tx, tz, spd = 0.55;
    const owner = b.owner >= 0 ? this.players[b.owner] : null;
    const think = this.realT >= p.next;
    if (think) p.next = this.realT + 0.13 + this.r() * 0.08 + this.dmod(t, 'react') * 0.4;
    if (!owner) {
      if (this.ctx.chaser[t] === p.i || (b.pass && b.pass.target === p.i && b.pass.team === t)) {
        // run to intercept point
        const ip = this.interceptPoint(p);
        if (b.pass && b.pass.target === p.i && b.pass.team === t) {
          // intended receiver: sprint to meet the ball as early as possible instead of waiting for it
          this.steerTo(p, ip[0], ip[1], 1, 6);
          p.sprinting = true;
          return;
        }
        tx = ip[0]; tz = ip[1]; spd = 1;
      } else {
        const inPoss = b.pass ? b.pass.team === t : this.lastTouchTeam === t;
        [tx, tz] = this.shapePos(p, b.x, b.z, inPoss);
        spd = 0.6;
      }
    } else if (owner.team === t) {
      // attacking support
      [tx, tz] = this.shapePos(p, b.x, b.z, true);
      spd = 0.62;
      const d = this.dir(t);
      if (think) {
        if (p.run && this.realT > p.run.until) p.run = null;
        const carrierDepth = this.depthOf(t, owner.x);
        const canRun = (p.group === 'FWD' || (p.slot.pos === 'CAM') || ((p.slot.pos === 'LB' || p.slot.pos === 'RB') && this.r() < 0.25)) && carrierDepth > 0.35;
        if (!p.run && canRun && this.r() < 0.22) {
          p.run = { until: this.realT + 2.5 + this.r() * 1.5, lane: p.z + (this.r() - 0.5) * 8 };
        }
      }
      if (p.run) {
        const line = this.offLine[1 - t];
        if (p.run.err === undefined) p.run.err = (this.r() - 0.62) * 2.6 * (1.2 - p.a.pac * 0.5);
        tx = line - d * 0.6 + d * p.run.err; tz = clamp(p.run.lane, -HW + 3, HW - 3);
        if (hyp(tx - p.x, tz - p.z) > 3) spd = 0.95;
      }
      // don't stand offside when not running
      const line = this.offLine[1 - t];
      const lim = Math.max(line * d, owner.x * d);
      if (tx * d > lim - 0.4 && !p.run) tx = (lim - 0.8) * d;
      // offer a short option if carrier under pressure
      if (p.group === 'MID' && hyp(p.x - owner.x, p.z - owner.z) < 22 && this.pressureOn(owner) > 0.5) {
        const ang = Math.atan2(p.z - owner.z, p.x - owner.x);
        tx = owner.x + Math.cos(ang) * 11; tz = owner.z + Math.sin(ang) * 11;
      }
    } else {
      // defending
      const isP = this.ctx.presser[t] === p.i, isP2 = this.ctx.presser2[t] === p.i || (this.ctx.teamPress === t && this.nearestTo(t, owner.x, owner.z, true, this.humanPi(t))?.i === p.i);
      if (isP || isP2) {
        const gx = this.ownGoalX(t);
        const dd = Math.max(1, hyp(gx - owner.x, owner.z));
        const standOff = isP ? 0.9 : 3.5;
        tx = owner.x + (gx - owner.x) / dd * standOff + owner.vx * 0.25;
        tz = owner.z + (0 - owner.z) / dd * standOff + owner.vz * 0.25;
        spd = isP ? 0.95 * clamp(this.dmod(t, 'aggr'), 0.6, 1) + 0.05 : 0.8;
        const dist = hyp(owner.x - p.x, owner.z - p.z);
        if (isP && think && dist < 1.7 && p.cool <= 0) {
          const pr = 0.3 * this.dmod(t, 'aggr') * (0.6 + p.a.def * 0.6);
          if (this.r() < pr) this.tryTackle(p, false);
        } else if (isP && think && dist < 3.2 && dist > 1.6 && this.r() < 0.035 * this.dmod(t, 'aggr')) {
          const ang = Math.atan2(owner.z + owner.vz * 0.3 - p.z, owner.x + owner.vx * 0.3 - p.x);
          p.face = ang; this.tryTackle(p, true);
        }
      } else {
        [tx, tz] = this.shapePos(p, b.x, b.z, false);
        spd = 0.6;
        // marking
        if (p.group !== 'FWD') {
          let mk = null, md = 13;
          for (const o of this.active(1 - t)) {
            if (o.isGK || o.i === b.owner) continue;
            const d = hyp(o.x - tx, o.z - tz);
            if (d < md) { md = d; mk = o; }
          }
          if (mk) {
            const gx = this.ownGoalX(t);
            const dd = Math.max(1, hyp(gx - mk.x, mk.z));
            const mx = mk.x + (gx - mk.x) / dd * 1.8, mz = mk.z + (0 - mk.z) / dd * 1.8;
            const w = p.group === 'DEF' ? 0.65 : 0.45;
            tx = tx * (1 - w) + mx * w; tz = tz * (1 - w) + mz * w;
            if (hyp(tx - p.x, tz - p.z) > 4) spd = 0.85;
          }
        }
        // track back fast if behind the ball
        if ((p.x - b.x) * this.dir(t) > 5 && p.group !== 'FWD') spd = 0.9;
      }
    }
    this.steerTo(p, tx, tz, spd);
  }
  humanPi(t) { const c = this.controllers.find(c => c.team === t); return c ? c.pi : -1; }

  interceptPoint(p) {
    const ms = this.maxSpeed(p);
    for (let i = 0; i < this.pred.length; i++) {
      const [bx, by, bz] = this.pred[i];
      const need = (hyp(bx - p.x, bz - p.z) - 0.5) / ms + 0.1;
      if (need <= i * 0.1 && by < 2.4) return [bx, bz];
    }
    const l = this.pred[this.pred.length - 1];
    return [l[0], l[2]];
  }

  steerTo(p, tx, tz, spd, brake = 2.2) {
    p.tx = tx; p.tz = tz;
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
    const max = this.maxSpeed(p) * spd;
    const s = Math.min(max, d * brake);
    if (d < 0.15) { p.dvx = 0; p.dvz = 0; }
    else { p.dvx = dx / d * s; p.dvz = dz / d * s; }
    p.sprinting = spd > 0.8 && d > 3;
  }

  pressureOn(p) {
    let m = 99;
    for (const o of this.active(1 - p.team)) m = Math.min(m, hyp(o.x - p.x, o.z - p.z));
    return clamp((5 - m) / 4, 0, 1);
  }
  nearestOpp(x, z, t) { let m = 99; for (const o of this.active(1 - t)) m = Math.min(m, hyp(o.x - x, o.z - z)); return m; }
  laneOpen(t, x0, z0, x1, z1) {
    let m = 99;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    for (const o of this.active(1 - t)) {
      let u = ((o.x - x0) * dx + (o.z - z0) * dz) / L2;
      if (u < 0.05 || u > 1.02) continue;
      const px = x0 + dx * u, pz = z0 + dz * u;
      const dist = hyp(o.x - px, o.z - pz) - u * 1.2; // farther along = more time to intercept
      m = Math.min(m, dist);
    }
    return m;
  }
  isOffside(q) {
    const d = this.dir(q.team);
    const line = this.offLine[1 - q.team] * d;
    return q.x * d > 0 && q.x * d > line + 0.3 && q.x * d > this.ball.x * d + 0.3;
  }

  carrierAI(p, dt) {
    const t = p.team, d = this.dir(t), b = this.ball;
    const gx = this.goalX(t);
    const distGoal = hyp(gx - p.x, p.z);
    const pressure = this.pressureOn(p);
    const held = this.realT - (p.gotBallT || 0);
    const think = this.realT >= p.next && held > 0.2 + this.dmod(t, 'react');
    // default: dribble toward goal avoiding opponents
    let ax = d, az = -p.z * 0.012;
    for (const o of this.active(1 - t)) {
      const ox = o.x - p.x, oz = o.z - p.z, od = hyp(ox, oz);
      if (od < 7 && (ox * d) > -1) { const w = (7 - od) / 7; az -= Math.sign(oz || (this.r() - 0.5)) * w * 1.3; ax -= (ox / od) * w * 0.5; }
    }
    if (Math.abs(p.z) > HW - 4) az -= Math.sign(p.z) * 0.8;
    const al = hyp(ax, az) || 1;
    const spaceAhead = this.nearestOppAhead(p);
    const spdF = spaceAhead > 8 ? 1 : spaceAhead > 4 ? 0.85 : 0.62;
    this.steerTo(p, p.x + ax / al * 6, p.z + az / al * 6, spdF);
    if (!think) return;
    p.next = this.realT + 0.16 + this.r() * 0.08 + this.dmod(t, 'react') * 0.8;
    const noise = this.dmod(t, 'noise');
    // --- shooting
    let best = { s: 0.32 + (1 - pressure) * 0.1 + p.a.dri * 0.12 + (spaceAhead > 6 ? 0.15 : 0) + (this.r() - 0.5) * noise, act: 'dribble' };
    if (distGoal < 30 && (gx - p.x) * d > 0) {
      const openAng = Math.atan2(GW * 2 * Math.abs(gx - p.x), (gx - p.x) ** 2 + p.z ** 2 - GW * GW);
      const blockers = this.laneOpen(t, p.x, p.z, gx, clamp(p.z * 0.2, -2, 2)) < 0.8 ? 1 : 0;
      const q = clamp(openAng * 2.2, 0, 1.2) * (1 - distGoal / 32) * (blockers ? 0.45 : 1) + p.a.sho * 0.12 + (distGoal < 11 ? 0.2 : 0);
      const s = q * 1.3 + 0.3 + (distGoal < 18 ? 0.14 : 0) + (this.r() - 0.5) * noise;
      if (s > best.s && (distGoal < 24 || p.a.sho > 0.78)) best = { s, act: 'shoot' };
    }
    // --- passing options
    const callC = this.controllers.find(c => c.team === t && c.lock >= 0 && this.realT - c.callT < 1.6);
    for (const q of this.active(t)) {
      if (q.i === p.i) continue;
      const dx = q.x - p.x, dz = q.z - p.z, dist = hyp(dx, dz);
      if (dist < 5 || dist > 48) continue;
      if (q.isGK && (pressure < 0.7 || this.depthOf(t, p.x) > 0.3)) continue;
      if (this.isOffside(q)) continue;
      const gain = (dx * d) / 30;
      const lane = this.laneOpen(t, p.x, p.z, q.x, q.z);
      const laneF = clamp((lane - 0.8) / 3.5, 0, 1);
      const space = clamp((this.nearestOpp(q.x, q.z, t) - 1.5) / 6, 0, 1);
      const qGoal = hyp(this.goalX(t) - q.x, q.z);
      let s = 0.2 + gain * 0.6 + laneF * 0.5 + space * 0.45 - dist / 45 + (qGoal < 22 ? 0.25 * (1 - qGoal / 22) : 0) + pressure * 0.3 + (this.r() - 0.5) * noise;
      if (callC && this.teamPlayer(t, callC.lock) === q) s += 0.6;
      if (laneF > 0.15 && s > best.s) best = { s, act: 'pass', q };
      // lob if lane blocked
      if (laneF <= 0.15 && dist > 14 && space > 0.3) { const ls = s - 0.18 + laneF * 0; if (ls > best.s) best = { s: ls, act: 'lob', q }; }
      // through ball to runners
      if (q.run || (q.group === 'FWD' && (q.vx * d) > 3)) {
        const lx = q.x + d * 8 + q.vx * 0.5, lz = q.z + q.vz * 0.6;
        if (Math.abs(lx) < HL - 2 && Math.abs(lz) < HW - 1) {
          const lane2 = this.laneOpen(t, p.x, p.z, lx, lz);
          const behind = (lx * d) - this.offLine[1 - t] * d;
          const ballT = hyp(lx - p.x, lz - p.z) / 15;
          const runT = hyp(lx - q.x, lz - q.z) / this.maxSpeed(q);
          let oppT = 99; for (const o of this.active(1 - t)) oppT = Math.min(oppT, (hyp(lx - o.x, lz - o.z) - 1) / this.maxSpeed(o) + 0.2);
          const margin = oppT - Math.max(ballT, runT);
          const ts = 0.25 + clamp(margin, 0, 1) * 0.5 + (behind > 0 ? 0.3 : 0) + gain * 0.3 + (this.r() - 0.5) * noise + (callC && this.teamPlayer(t, callC.lock) === q ? 0.5 : 0);
          if (lane2 > 1.5 && margin > 0.3 && ts > best.s) best = { s: ts, act: 'through', q };
        }
      }
    }
    // --- crossing
    if (this.isCrossZone(p) && this.r() < 0.8) {
      const q = this.bestCrossTarget(p);
      if (q) { const cs = 0.62 + (this.r() - 0.5) * noise; if (cs > best.s) best = { s: cs, act: 'cross', q }; }
    }
    // --- clearance under heavy pressure in own box
    if (this.depthOf(t, p.x) < 0.18 && pressure > 0.6 && best.act === 'dribble') best = { act: 'clear' };
    switch (best.act) {
      case 'shoot': {
        const g = this.gk(1 - t);
        const corner = 2.85 + this.r() * 0.45;
        let aim = g ? (g.z > 0 ? -corner : corner) : (this.r() < 0.5 ? -corner : corner);
        if (Math.abs(p.z) > 8 && this.r() < 0.6) aim = -Math.sign(p.z) * corner; // far post
        const power = distGoal < 12 ? 0.55 + this.r() * 0.2 : 0.72 + this.r() * 0.2;
        this.shoot(p, power, aim, distGoal > 16 && this.r() < 0.4);
        break;
      }
      case 'pass': this.groundPass(p, best.q, false); break;
      case 'through': this.groundPass(p, best.q, true); break;
      case 'lob': this.lobPass(p, best.q); break;
      case 'cross': this.cross(p, best.q); break;
      case 'clear': this.clearBall(p, d, (Math.sign(p.z) || 1) * (0.4 + this.r() * 0.9), 0.9); break;
      default: break;
    }
  }
  nearestOppAhead(p) {
    const d = this.dir(p.team); let m = 99;
    for (const o of this.active(1 - p.team)) { const ox = (o.x - p.x) * d; if (ox < -0.5) continue; m = Math.min(m, hyp(o.x - p.x, o.z - p.z)); }
    return m;
  }
  isCrossZone(p) { return this.depthOf(p.team, p.x) > 0.74 && Math.abs(p.z) > 13; }
  bestCrossTarget(p) {
    const t = p.team, gx = this.goalX(t);
    let best = null, bs = -1;
    for (const q of this.active(t)) {
      if (q.i === p.i || q.isGK) continue;
      const dg = Math.abs(gx - q.x);
      if (dg > 18 || Math.abs(q.z) > 12) continue;
      const s = q.a.phy * 0.5 + (18 - dg) / 18 * 0.4 + clamp(this.nearestOpp(q.x, q.z, t) / 4, 0, 1) * 0.4;
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  pickPassTarget(p, ax, az, type) {
    let best = null, bs = -1e9;
    for (const q of this.active(p.team)) {
      if (q.i === p.i) continue;
      const dx = q.x - p.x, dz = q.z - p.z, dist = hyp(dx, dz);
      if (dist < 2 || dist > (type === 'lob' ? 60 : 50)) continue;
      const cos = (dx * ax + dz * az) / dist;
      if (cos < 0.55) continue;
      const lane = this.laneOpen(p.team, p.x, p.z, q.x, q.z);
      const s = cos * 3 - dist / (type === 'lob' ? 40 : 22) + clamp(lane / 3, 0, 1) * 0.6 - (q.isGK ? 0.8 : 0);
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  // ---------- goalkeeper ----------
  gkUpdate(p, dt) {
    const t = p.team, b = this.ball, d = this.dir(t);
    const gx = this.ownGoalX(t);
    if (b.owner === p.i) { // holding
      p.holdT += dt;
      this.steerTo(p, p.x, p.z, 0);
      const humanTeam = this.humanTeams.has(t) && !this.controllers.some(c => c.team === t && c.lock >= 0);
      if (p.holdT > (humanTeam ? 3.5 : 1.3 + this.r() * 1.2)) this.gkDistribute(p);
      return;
    }
    p.holdT = 0;
    // shot threat?
    const threat = this.shotThreat(t);
    if (threat) {
      const react = 0.2 - p.a.dri * 0.12 + (this.isCPU(t) ? -DIFF.gk[this.difficulty] * 0.5 : 0);
      if (b.shot && this.realT - b.shot.rt < Math.max(0.04, react)) { p.dvx = 0; p.dvz = 0; return; }
      const tg = Math.abs(p.x - b.x) / Math.max(1, Math.abs(b.vx));
      const zi = b.z + b.vz * tg;
      const dz = zi - p.z;
      if (Math.abs(dz) > 0.9 && tg < 0.75 && p.state !== STATE.dive) {
        p.state = STATE.dive; p.stateT = 1.0; p.stateDur = 1.0; p.diveDir = Math.sign(dz);
        const reachV = 4.2 + p.a.pac * 3.2;
        p.vz = clamp(dz / Math.max(tg, 0.18), -reachV, reachV); p.vx = (b.x - p.x) * 0.3;
        p.diveH = clamp(b.y + b.vy * tg - 0.5 * G * tg * tg, 0.1, 2.3);
        this.emit('dive', { p: p.i });
      } else {
        this.steerTo(p, p.x + (b.x - p.x) * 0.05, clamp(zi, -GW + 0.2, GW - 0.2), 1);
      }
      this.gkSaveCheck(p);
      return;
    }
    // claim loose ball / rush 1v1
    const inBox = this.inBox(t, b.x, b.z);
    if (b.owner < 0 && inBox && this.ctx.chaser[t] === p.i && b.y < 2.6) {
      const ip = this.interceptPoint(p);
      this.steerTo(p, ip[0], ip[1], 1);
      if (hyp(b.x - p.x, b.z - p.z) < 1.3 && p.cool <= 0 && hyp(b.vx, b.vz) < 22) this.gkClaim(p);
      return;
    }
    if (b.owner >= 0) {
      const o = this.players[b.owner];
      if (o.team !== t && inBox && hyp(o.x - gx, o.z) < 14) {
        // narrow angle / smother
        const dd = hyp(o.x - p.x, o.z - p.z);
        const tx = gx + (o.x - gx) * 0.55, tz = o.z * 0.55;
        this.steerTo(p, tx, tz, 1);
        if (dd < 1.6 && p.cool <= 0 && this.r() < 0.08) {
          const ok = this.r() < 0.35 + (p.a.pac - o.a.dri) * 0.6;
          p.state = STATE.dive; p.stateT = 0.8; p.stateDur = 0.8; p.diveDir = Math.sign(o.z - p.z) || 1; p.diveH = 0.2;
          if (ok) { this.loseBall(o); this.gkClaim(p); this.emit('save', { p: p.i, kind: 'smother' }); p.st.saves++; this.stats[t].saves++; }
          else { p.cool = 0.8; }
        }
        return;
      }
    }
    // positioning
    const bd = hyp(b.x - gx, b.z);
    const out = clamp(0.8 + bd * 0.05, 0.8, 4.2);
    const ang = Math.atan2(b.z, (b.x - gx) * d);
    const tx = gx + d * Math.cos(ang) * out, tz = clamp(Math.sin(ang) * out, -GW + 0.3, GW - 0.3);
    this.steerTo(p, tx, tz, 0.7);
  }
  shotThreat(t) {
    const b = this.ball; if (b.owner >= 0) return false;
    const gx = this.ownGoalX(t);
    const toward = (gx - b.x) * b.vx > 0 && Math.abs(b.vx) > 4;
    if (!toward) return false;
    const tt = (gx - b.x) / b.vx;
    if (tt > 1.4 || tt < 0) return false;
    const zl = b.z + b.vz * tt, yl = b.y + b.vy * tt - 0.5 * G * tt * tt;
    return Math.abs(zl) < GW + 1.2 && yl < GH + 0.8 && (b.shot || hyp(b.vx, b.vz) > 12);
  }
  gkSaveCheck(p) {
    const b = this.ball;
    if (b.owner >= 0 || p.cool > 0) return;
    if (b.shot && b.shot.saveTried) return;
    if (!b.shot && b.lastTeam === p.team) return;
    const diving = p.state === STATE.dive;
    const hy = diving ? (p.diveH ?? 0.8) : clamp(b.y, 0.2, 2.35);
    const d = hyp(b.x - p.x, b.z - p.z, (b.y - hy) * (diving ? 1 : 0.4));
    const reach = diving ? 1.05 + p.a.pac * 0.45 : 0.95;
    if (d > reach) return;
    // evaluate at the moment the ball reaches the keeper's plane (closest approach)
    const ahead = (p.x - b.x) * Math.sign(b.vx || 1);
    if (b.shot && ahead > 0.3 && hyp(b.vx, b.vz) > 6) return;
    if (!this.inBox(p.team, b.x, b.z) && Math.abs(b.x - this.ownGoalX(p.team)) > 18) return;
    const sp = hyp(b.vx, b.vy, b.vz);
    if (b.shot) b.shot.saveTried = true;
    const gkr = (p.a.pac + p.a.dri + p.a.phy) / 3;
    let pr = 0.74 + (gkr - 0.72) * 1.2 - Math.max(0, sp - 24) * 0.02 - (d / reach) ** 2 * 0.32 + (this.isCPU(p.team) ? DIFF.gk[this.difficulty] : 0);
    if (!b.shot) pr += 0.25;
    pr = clamp(pr, 0.1, 0.97);
    if (this.dbg) this.dbg.push({ pr, d, reach, sp, diving });
    if (this.r() < pr) {
      const catchP = clamp(0.25 + p.a.sho * 0.6 - (sp - 14) * 0.05, 0.05, 0.92);
      p.st.saves++; this.stats[p.team].saves++;
      if (b.shot) this.emit('save', { p: p.i, shooter: b.shot.shooter, kind: 'shot' });
      if (this.r() < catchP) { this.gkClaim(p); }
      else {
        const d0 = this.dir(p.team);
        const side = Math.sign(b.z - p.z) || (this.r() < 0.5 ? -1 : 1);
        const sp0 = hyp(b.vx, b.vz);
        b.vx = d0 * (this.r() < 0.45 ? -(1.5 + this.r() * 3) : (1 + this.r() * 3)); b.vz = side * (4 + this.r() * 5 + sp0 * 0.15); b.vy = 1.5 + this.r() * 4.5;
        b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.shot = null; b.pass = null; b.kickId++;
        p.cool = 0.5;
      }
    } else if (b.shot) b.shot.beaten = true;
  }
  gkClaim(p) {
    const b = this.ball;
    b.owner = p.i; b.vx = b.vy = b.vz = 0; b.shot = null; b.pass = null; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team;
    p.holdT = 0; p.gotBallT = this.realT; b.kickId++;
    if (p.state !== STATE.dive) { p.state = STATE.hold; p.stateT = 0.6; p.stateDur = 0.6; }
    this.emit('claim', { p: p.i });
    for (const c of this.controllers) if (c.team === p.team && c.lock < 0) c.pi = p.i;
  }
  gkDistribute(p) {
    const t = p.team, d = this.dir(t);
    const opts = this.active(t).filter(q => q.i !== p.i).map(q => {
      const dist = hyp(q.x - p.x, q.z - p.z);
      const space = this.nearestOpp(q.x, q.z, t);
      return { q, dist, s: space * 0.4 + (this.depthOf(t, q.x) * 3) - (dist > 35 ? 2 : 0) + this.r() };
    }).sort((a, b) => b.s - a.s);
    const tgt = opts[0]?.q;
    if (!tgt) return;
    if (opts[0].dist < 32 && this.nearestOpp(tgt.x, tgt.z, t) > 5) this.groundPass(p, tgt, false, 'throw');
    else {
      const fw = this.active(t).filter(q => q.group === 'FWD' || q.group === 'MID').sort((a, b) => b.x * d - a.x * d)[0] || tgt;
      this.lobPass(p, fw, true);
    }
  }

  // ---------- movement ----------
  movePlayer(p, dt) {
    if (p.off) return;
    let dvx = p.dvx || 0, dvz = p.dvz || 0;
    if (p.state === STATE.slide) { dvx = p.vx; dvz = p.vz; const s = hyp(p.vx, p.vz); const k = Math.max(0, s - 9 * dt) / (s || 1); p.vx *= k; p.vz *= k; }
    else if (p.state === STATE.dive) { p.vx *= 1 - 3 * dt; p.vz *= 1 - 2.2 * dt; }
    else if (p.state === STATE.fallen) { p.vx *= 1 - 6 * dt; p.vz *= 1 - 6 * dt; }
    else {
      const acc = (11 + p.a.pac * 7) * dt;
      let ex = dvx - p.vx, ez = dvz - p.vz;
      const el = hyp(ex, ez);
      if (el > acc) { ex = ex / el * acc; ez = ez / el * acc; }
      p.vx += ex; p.vz += ez;
      if (p.state === STATE.kick || p.state === STATE.tackle) { p.vx *= 1 - 3 * dt; p.vz *= 1 - 3 * dt; }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.x = clamp(p.x, -HL - 4, HL + 4); p.z = clamp(p.z, -HW - 3, HW + 3);
    const sp = hyp(p.vx, p.vz);
    p.st.km += sp * dt / 1000;
    // facing
    if (p.state !== STATE.dive && p.state !== STATE.slide && p.state !== STATE.fallen) {
      if (sp > 0.4) {
        const want = Math.atan2(p.vz, p.vx);
        const hasBall = this.ball.owner === p.i;
        const rate = (hasBall ? 7.5 + p.a.dri * 8 : 13) - Math.min(4, sp * 0.3);
        const da = angDiff(p.face, want);
        p.face += clamp(da, -rate * dt, rate * dt);
      } else if (this.ball.owner !== p.i) {
        const want = Math.atan2(this.ball.z - p.z, this.ball.x - p.x);
        p.face += clamp(angDiff(p.face, want), -4 * dt, 4 * dt);
      }
    }
    // stamina
    const maxS = this.maxSpeed(p);
    const effort = sp / Math.max(1, maxS);
    const scale = 720 / this.realSeconds;
    if (effort > 0.8) p.stamina -= (0.008 - p.a.phy * 0.004) * dt * scale;
    else if (effort < 0.4) p.stamina += 0.004 * dt * scale;
    p.stamina = clamp(p.stamina - 0.00085 * dt * scale * 0.4, 0.25, 1);
  }
  separatePlayers() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i]; if (a.off) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j]; if (b.off) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz);
        if (d < 0.7 && d > 0.0001) {
          const push = (0.7 - d) / 2, nx = dx / d, nz = dz / d;
          const wa = a.a.phy + 0.3, wb = b.a.phy + 0.3, sw = wa + wb;
          a.x -= nx * push * (wb / sw) * 2; a.z -= nz * push * (wb / sw) * 2;
          b.x += nx * push * (wa / sw) * 2; b.z += nz * push * (wa / sw) * 2;
        }
      }
    }
  }

  // ---------- ball ----------
  updateBall(dt) {
    const b = this.ball;
    if (b.owner >= 0) {
      const p = this.players[b.owner];
      if (p.off || p.state === STATE.fallen || p.stun > 0.3) { this.loseBall(p); return; }
      const sp = hyp(p.vx, p.vz);
      b.dribPh += dt * (3 + sp * 1.2);
      if (p.isGK && (p.state === STATE.hold || p.holdT > 0 || p.state === STATE.dive)) {
        b.x = p.x + Math.cos(p.face) * 0.35; b.z = p.z + Math.sin(p.face) * 0.35; b.y = 1.05; b.vx = p.vx; b.vz = p.vz; b.vy = 0;
        return;
      }
      const off = 0.42 + sp * 0.055 + Math.max(0, Math.sin(b.dribPh)) * sp * 0.035 + (p.skillT > 0 ? 0.25 : 0);
      const tx = p.x + Math.cos(p.face) * off, tz = p.z + Math.sin(p.face) * off;
      const k = Math.min(1, dt * (14 + p.a.dri * 14));
      const nx = b.x + (tx - b.x) * k, nz = b.z + (tz - b.z) * k;
      b.vx = (nx - b.x) / dt; b.vz = (nz - b.z) / dt; b.vy = 0;
      b.x = nx; b.z = nz; b.y = BR;
      return;
    }
    // free ball
    if (b.y > BR + 0.001 || b.vy > 0) {
      b.vy -= G * dt;
      const f = 1 - 0.012 * hyp(b.vx, b.vy, b.vz) * dt;
      b.vx *= f; b.vy *= f; b.vz *= f;
      const vh = hyp(b.vx, b.vz);
      if (vh > 1 && b.spin) { const a = b.spin * dt; b.vx += (-b.vz / vh) * a; b.vz += (b.vx / vh) * a; }
      b.spin *= 1 - 0.6 * dt;
    } else {
      const sp = hyp(b.vx, b.vz);
      const dec = (C0 + C1 * sp) * dt;
      const s = sp > dec ? (sp - dec) / sp : 0;
      b.vx *= s; b.vz *= s;
      if (sp > 1 && b.spin) { const a = b.spin * dt * 0.4; b.vx += (-b.vz / sp) * a; b.vz += (b.vx / sp) * a; }
      b.spin *= 1 - 3 * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < BR) { b.y = BR; if (b.vy < -1.2) { b.vy = -b.vy * 0.52; b.vx *= 0.86; b.vz *= 0.86; this.emit('bounce', { v: -b.vy }); } else b.vy = 0; }
    if (b.shot) b.shot.t += dt;
    this.goalFrame();
  }
  goalFrame() {
    const b = this.ball;
    for (const sx of [-1, 1]) {
      const px = sx * HL;
      if (Math.abs(b.x - px) > 2.5) continue;
      // posts
      for (const pz of [-GW, GW]) {
        const dx = b.x - px, dz = b.z - pz, d = hyp(dx, dz);
        if (d < BR + 0.07 && b.y < GH + 0.05) {
          const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
          if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; b.x = px + nx * (BR + 0.071); b.z = pz + nz * (BR + 0.071); this.emit('post', { team: b.lastTeam }); if (b.shot) b.shot.woodwork = true; }
        }
      }
      // crossbar
      if (Math.abs(b.z) < GW) {
        const dx = b.x - px, dy = b.y - GH, d = hyp(dx, dy);
        if (d < BR + 0.07) {
          const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.x = px + nx * (BR + 0.071); b.y = GH + ny * (BR + 0.071); this.emit('post', { team: b.lastTeam, bar: true }); }
        }
      }
      // net (ball inside goal)
      if (b.inGoal && Math.sign(b.x) === sx) {
        const back = sx * (HL + 2.0);
        if (Math.abs(b.x) > HL + 2.0 - BR) { b.x = back - sx * BR; b.vx *= -0.15; b.vz *= 0.5; b.vy *= 0.5; }
        if (Math.abs(b.z) > GW - BR) { b.z = Math.sign(b.z) * (GW - BR); b.vz *= -0.2; b.vx *= 0.6; }
        if (b.y > GH - BR) { b.y = GH - BR; b.vy *= -0.2; }
      }
    }
  }
  loseBall(p) {
    const b = this.ball;
    if (b.owner !== p.i) return;
    b.owner = -1; b.vx = p.vx * 1.1; b.vz = p.vz * 1.1; b.y = BR; b.kickId++;
    p.cool = 0.4;
  }

  checkControl() {
    const b = this.ball;
    if (b.owner >= 0) return this.contactSteal();
    if (b.inGoal) return;
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.off || p.cool > 0 || p.state === STATE.fallen || p.state === STATE.dive || p.stun > 0) continue;
      if (p.lastKick === b.kickId) continue;
      const d = hyp(b.x - p.x, b.z - p.z);
      const reach = b.y < 0.7 ? 0.75 + (p.state === STATE.slide ? 0.35 : 0) : b.y < 2.1 ? 0.6 : 0;
      if (reach && d < reach && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const p = best;
    p.lastKick = b.kickId;
    const vr = hyp(b.vx - p.vx, b.vz - p.vz) + Math.abs(b.vy) * 0.5;
    // GK in own box catches
    if (p.isGK && this.inBox(p.team, b.x, b.z) && b.lastTeam !== p.team) {
      if (b.shot) { this.gkSaveCheck(p); return; }
      const sp = hyp(b.vx, b.vy, b.vz);
      if (this.r() < clamp(1.1 - sp / 40 + p.a.sho * 0.2, 0.3, 0.98)) this.gkClaim(p);
      else { b.vx *= -0.3; b.vz = (this.r() - 0.5) * 8; b.vy = 2; b.kickId++; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; p.cool = 0.4; this.emit('fumble', { p: p.i }); }
      return;
    }
    // offside check
    if (b.pass && b.pass.off && b.pass.off.includes(p.i) && p.team === b.pass.team) {
      this.stats[p.team].offsides++;
      this.emit('offside', { p: p.i, team: p.team });
      return this.startSetPiece('freekick', 1 - p.team, p.x, p.z, { indirect: true, reason: 'offside' });
    }
    // aerial ball at chest/head height: AI header
    if (b.y >= 0.7) {
      if (!p.human) {
        const t = p.team, gx = this.goalX(t);
        const dg = hyp(gx - p.x, p.z);
        if (dg < 15 && (gx - p.x) * this.dir(t) > 0) return this.header(p, 'shot');
        if (this.depthOf(t, p.x) < 0.3) return this.header(p, 'clear');
        if (vr > 14) return this.header(p, 'pass');
      }
    }
    // blocking a shot
    if (b.shot && b.shot.team !== p.team && vr > 16) {
      const s = hyp(b.vx, b.vz);
      b.vx = -b.vx * 0.25 + (this.r() - 0.5) * s * 0.4; b.vz = b.vz * 0.3 + (this.r() - 0.5) * s * 0.5; b.vy = Math.abs(b.vy) * 0.3 + this.r() * 3;
      b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.shot = null; b.pass = null; b.kickId++;
      this.emit('block', { p: p.i });
      return;
    }
    const ctrl = clamp(1.45 - vr / (14 + p.a.dri * 18) - (p.state === STATE.slide ? 0.25 : 0) - (b.y > 0.7 ? 0.12 : 0), 0.08, 0.99);
    if (this.r() < ctrl) {
      // take possession
      const prevTeam = b.lastTeam;
      if (b.pass) {
        const passer = this.players[b.pass.from];
        if (passer && passer.team === p.team && passer.i !== p.i) { passer.st.passOk++; this.stats[p.team].passOk++; this.lastPassInfo = { from: passer.i, to: p.i, t: this.realT }; }
      }
      b.owner = p.i; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.shot = null; b.pass = null; b.spin = 0;
      p.gotBallT = this.realT; p.st.touches++;
      p.next = this.realT + 0.05;
      if (p.state === STATE.slide) { p.state = 0; p.stateT = 0; }
      if (prevTeam !== p.team) { this.emit('turnover', { p: p.i, team: p.team }); this.lastPassInfo = null; }
      this.emit('control', { p: p.i });
    } else {
      // heavy touch / deflection
      const s = hyp(b.vx, b.vz) * 0.45;
      const a = Math.atan2(b.vz, b.vx) + (this.r() - 0.5) * 1.6;
      b.vx = Math.cos(a) * s + p.vx * 0.5; b.vz = Math.sin(a) * s + p.vz * 0.5; b.vy = Math.abs(b.vy) * 0.3;
      b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.pass = null; b.kickId++; p.cool = 0.35;
      this.emit('touch', { p: p.i });
    }
  }

  contactSteal() {
    const b = this.ball, o = this.players[b.owner];
    if (o.isGK && (o.state === STATE.hold || o.holdT > 0)) return;
    for (const p of this.players) {
      if (p.team === o.team || p.off || p.cool > 0 || p.stun > 0 || p.state === STATE.fallen || p.state === STATE.slide || p.isGK) continue;
      if (hyp(b.x - p.x, b.z - p.z) > 0.62) continue;
      p.cool = 0.5;
      const pr = clamp(0.22 + (p.a.def - o.a.dri) * 0.9 - (o.skillT > 0 ? 0.3 : 0) + (p.human ? 0.08 : 0), 0.05, 0.75) * (this.isCPU(p.team) ? DIFF.aggr[this.difficulty] : 1);
      if (this.r() < pr) {
        if (this.r() < 0.5) {
          b.owner = p.i; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.kickId++; p.gotBallT = this.realT; o.cool = 0.5;
          p.st.tackleOk++; this.emit('tackle', { p: p.i, victim: o.i }); this.emit('turnover', { p: p.i, team: p.team });
          for (const c of this.controllers) if (c.team === p.team && c.lock < 0) c.pi = p.i;
        } else {
          b.owner = -1; const a = Math.atan2(b.z - p.z, b.x - p.x) + (this.r() - 0.5) * 1.5; b.vx = Math.cos(a) * 4.5 + o.vx * 0.5; b.vz = Math.sin(a) * 4.5 + o.vz * 0.5; b.kickId++; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; o.cool = 0.35;
          this.emit('touch', { p: p.i });
        }
        return;
      } else if (this.r() < 0.1 * (this.isCPU(p.team) ? DIFF.aggr[this.difficulty] : 1)) { this.foul(p, o, false); return; }
    }
  }

  // ---------- kicking ----------
  kick(p, vx, vy, vz, spin, kind, extra = {}) {
    const b = this.ball;
    const passer = b.owner === p.i || b.owner < 0;
    if (!passer) return;
    b.owner = -1; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin || 0; b.y = Math.max(b.y, BR);
    b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.kickId++; b.kind = kind;
    b.shot = null; b.pass = null;
    p.lastKick = b.kickId; p.cool = 0.28;
    // opponents right next to the ball only sometimes get a block on it
    for (const o of this.players) {
      if (o.team === p.team || o.off) continue;
      if (hyp(o.x - b.x, o.z - b.z) < 1.6 && this.r() > 0.12 + o.a.def * 0.18) o.lastKick = b.kickId;
    }
    if (p.state !== STATE.dive) { p.state = kind === 'throw' ? STATE.throw : kind === 'header' ? STATE.header : STATE.kick; p.stateT = 0.32; p.stateDur = 0.32; }
    p.face = Math.atan2(vz, vx);
    const power = hyp(vx, vy, vz);
    this.emit('kick', { p: p.i, power, kind });
    if (kind === 'shot') {
      b.shot = { team: p.team, shooter: p.i, t: 0, rt: this.realT, saveTried: false };
      p.st.shots++; this.stats[p.team].shots++;
      const gx = this.goalX(p.team);
      const tt = (gx - b.x) / (vx || 1e-6);
      if (tt > 0 && tt < 4) { const zl = b.z + vz * tt; const yl = b.y + vy * tt - 0.5 * G * tt * tt; if (Math.abs(zl) < GW && yl < GH && yl > -1) { p.st.sot++; this.stats[p.team].sot++; b.shot.onTarget = true; } }
      this.emit('shot', { p: p.i, team: p.team, onTarget: !!b.shot.onTarget });
    } else if (['pass', 'through', 'lob', 'cross', 'throw', 'gk'].includes(kind)) {
      const exempt = this.sp && ['throwin', 'corner', 'goalkick'].includes(this.sp.type);
      const off = exempt ? [] : this.active(p.team).filter(q => q.i !== p.i && this.isOffside(q)).map(q => q.i);
      b.pass = { team: p.team, from: p.i, target: extra.target ?? -1, off, fromFoot: kind !== 'throw' && !p.isGK, t: this.realT };
      p.st.passes++; this.stats[p.team].passes++;
      this.emit('pass', { p: p.i, kind, target: extra.target });
    }
  }
  pressureErr(p) { return 1 + this.pressureOn(p) * 0.8; }
  groundPass(p, q, through, kind) {
    const dist0 = hyp(q.x - p.x, q.z - p.z);
    let tx, tz, vEnd;
    const tEst = dist0 / 16;
    if (through) {
      const d = this.dir(p.team);
      tx = q.x + q.vx * tEst * 1.2 + d * (5 + dist0 * 0.1); tz = q.z + q.vz * tEst * 1.2; vEnd = 3.2;
      tx = clamp(tx, -HL + 1, HL - 1); tz = clamp(tz, -HW + 1, HW - 1);
      vEnd = 7;
    } else { tx = q.x + q.vx * tEst * 0.8; tz = q.z + q.vz * tEst * 0.8; vEnd = clamp(8 + dist0 * 0.18, 8.5, 14); }
    this.groundTo(p, tx, tz, q, vEnd, kind || (through ? 'through' : 'pass'));
  }
  groundTo(p, tx, tz, q, vEnd = 5, kind = 'pass') {
    const dx = tx - p.x, dz = tz - p.z, d = Math.max(1, hyp(dx, dz));
    let v = passSpeedFor(d, vEnd);
    if (kind === 'throw') v = Math.min(v, 17);
    const err = (0.007 + (1 - p.a.pas) * 0.05) * this.pressureErr(p) * this.dmod(p.team, 'passErr') * (d > 30 ? 1.3 : 1);
    const ang = Math.atan2(dz, dx) + this.gauss() * err;
    v *= 1 + this.gauss() * err * 0.8;
    v = Math.min(v, 34);
    const vy = kind === 'throw' ? 2.5 : 0;
    this.kick(p, Math.cos(ang) * v, vy, Math.sin(ang) * v, 0, kind === 'through' ? 'through' : kind === 'throw' ? 'throw' : 'pass', { target: q ? q.i : -1 });
  }
  lobPass(p, q, gk = false) {
    const dist0 = hyp(q.x - p.x, q.z - p.z);
    const T = 0.8 + dist0 * 0.028;
    this.lobTo(p, q.x + q.vx * T * 0.9, q.z + q.vz * T * 0.9, q, T, gk ? 'gk' : 'lob');
  }
  lobTo(p, tx, tz, q, T, kind = 'lob') {
    const dx = tx - p.x, dz = tz - p.z, d = Math.max(1, hyp(dx, dz));
    T = T || 0.8 + d * 0.028;
    const drag = 1 + d * 0.0045;
    const vh = d / T * drag, vy = G * T / 2;
    const err = (0.012 + (1 - p.a.pas) * 0.055) * this.pressureErr(p) * this.dmod(p.team, 'passErr');
    const ang = Math.atan2(dz, dx) + this.gauss() * err;
    const f = 1 + this.gauss() * err;
    this.kick(p, Math.cos(ang) * vh * f, vy * (1 + this.gauss() * err * 0.5), Math.sin(ang) * vh * f, 0, kind, { target: q ? q.i : -1 });
  }
  cross(p, q) {
    const T = 0.95 + hyp(q.x - p.x, q.z - p.z) * 0.016;
    const tx = q.x + q.vx * T, tz = q.z + q.vz * T * 0.8;
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
    const vh = d / T * (1 + d * 0.004), vy = (1.7 - BR) / T + 0.5 * G * T;
    const err = (0.018 + (1 - p.a.pas) * 0.06) * this.dmod(p.team, 'passErr');
    const ang = Math.atan2(dz, dx) + this.gauss() * err;
    const spin = -Math.sign(p.z) * this.dir(p.team) * 0; // natural whip handled by aim
    this.kick(p, Math.cos(ang) * vh, vy * (1 + this.gauss() * err), Math.sin(ang) * vh, spin, 'cross', { target: q.i });
  }
  clearBall(p, ax, az, power) {
    const l = hyp(ax, az) || 1;
    const v = 20 + power * 8;
    this.kick(p, ax / l * v, 7 + this.r() * 5, az / l * v, 0, 'clear');
  }
  shoot(p, power, aimZ, finesse) {
    const b = this.ball;
    const t = p.team, gx = this.goalX(t);
    power = clamp(power, 0.1, 1.15);
    const dist = hyp(gx - p.x, aimZ - p.z);
    let speed = (16 + power * 19) * (0.84 + p.a.sho * 0.22);
    if (finesse) speed *= 0.8;
    speed = Math.min(speed, 38);
    let yT = 0.35 + power * 1.05 + (power > 0.9 ? (power - 0.9) * 7 : 0);
    if (dist < 9) yT *= 0.75;
    const tt = dist / speed * (1 + dist * 0.006);
    let vy = (yT - b.y) / tt + 0.5 * G * tt;
    let ang = Math.atan2(aimZ - p.z, gx - p.x);
    // curl: pre-rotate so the ball bends toward the aim point
    let spin = 0;
    if (finesse) {
      // start outside the aim point and bend back in toward the goal centre
      const sgn = -(Math.sign(aimZ) || 1) * Math.sign(gx - p.x);
      spin = sgn * 6.5;
      const disp = 0.5 * 6.5 * tt * tt;
      ang -= sgn * Math.atan2(disp, dist);
    }
    const facing = Math.abs(angDiff(p.face, ang));
    let err = (0.036 + (1 - p.a.sho) * 0.1) * this.pressureErr(p) * this.dmod(t, 'shotErr') * (1 + facing * 0.35) * (finesse ? 0.8 : 1) + (power > 0.85 ? (power - 0.85) * 0.12 : 0);
    ang += this.gauss() * err;
    vy += this.gauss() * err * 14;
    const vh = Math.sqrt(Math.max(1, speed * speed - vy * vy * 0.3));
    this.kick(p, Math.cos(ang) * vh, vy, Math.sin(ang) * vh, spin, 'shot');
  }
  header(p, mode, ax, az) {
    const b = this.ball, t = p.team;
    p.state = STATE.header; p.stateT = 0.45; p.stateDur = 0.45;
    const skill = (p.a.phy + p.a.sho) / 2;
    if (mode === 'shot') {
      const gx = this.goalX(t);
      let aimZ = az !== undefined && Math.abs(az) > 0.3 ? Math.sign(az) * 2.6 : (this.r() < 0.5 ? -2.5 : 2.5);
      const d = hyp(gx - b.x, aimZ - b.z);
      const sp = 12 + skill * 8;
      const tt = d / sp;
      const vy = (0.5 - b.y) / tt + 0.5 * G * tt;
      const ang = Math.atan2(aimZ - b.z, gx - b.x) + this.gauss() * (0.04 + (1 - skill) * 0.1) * this.dmod(t, 'shotErr');
      this.kick(p, Math.cos(ang) * sp, vy + this.gauss() * 1.5, Math.sin(ang) * sp, 0, 'shot');
    } else if (mode === 'clear') {
      const d = this.dir(t);
      this.kick(p, d * (12 + this.r() * 6), 5 + this.r() * 3, (this.r() - 0.5) * 12, 0, 'clear');
    } else {
      let q = ax !== undefined ? this.pickPassTarget(p, ax, az, 'pass') : null;
      if (!q) q = this.nearestTo(t, b.x + this.dir(t) * 8, b.z, true, p.i);
      if (q) { const dx = q.x - b.x, dz = q.z - b.z, d = hyp(dx, dz); const T = 0.6 + d * 0.03; this.kick(p, dx / T, G * T / 2 - b.y / T, dz / T, 0, 'pass', { target: q.i }); }
    }
    this.emit('header', { p: p.i });
  }
  gauss() { return (this.r() + this.r() + this.r() - 1.5) * 2; } // ~N(0,1)

  skillMove(p, inp) {
    if (p.skillT > 0 || p.cool > 0) return;
    p.skillT = 0.55; p.state = STATE.skill; p.stateT = 0.55; p.stateDur = 0.55;
    const mx = inp.mx || 0, mz = inp.mz || 0;
    const m = hyp(mx, mz);
    const side = m > 0.2 ? Math.atan2(mz, mx) : p.face + (this.r() < 0.5 ? 1.2 : -1.2);
    p.vx = Math.cos(side) * 5.5; p.vz = Math.sin(side) * 5.5;
    p.face = side;
    this.emit('skill', { p: p.i });
  }

  // ---------- tackling & fouls ----------
  tryTackle(p, slide) {
    const b = this.ball;
    if (p.cool > 0 || p.state === STATE.slide || p.state === STATE.fallen) return;
    if (slide) {
      p.state = STATE.slide; p.stateT = 0.75; p.stateDur = 0.75;
      const sp = Math.max(6.5, hyp(p.vx, p.vz) + 1.5);
      let ang = p.face;
      if (b.owner >= 0) { const o = this.players[b.owner]; const a2 = Math.atan2(o.z + o.vz * 0.25 - p.z, o.x + o.vx * 0.25 - p.x); if (Math.abs(angDiff(ang, a2)) < 1.2) ang = a2; }
      else { const a2 = Math.atan2(b.z - p.z, b.x - p.x); if (Math.abs(angDiff(ang, a2)) < 1.2) ang = a2; }
      p.face = ang; p.vx = Math.cos(ang) * sp; p.vz = Math.sin(ang) * sp;
      p.slideHit = false; p.st.tackles++; this.stats[p.team].tackles++;
      this.emit('slide', { p: p.i });
      return;
    }
    // standing tackle
    if (b.owner < 0) return;
    const o = this.players[b.owner];
    if (o.team === p.team || o.isGK) return;
    p.state = STATE.tackle; p.stateT = 0.35; p.stateDur = 0.35; p.cool = 0.55;
    const d = hyp(b.x - p.x, b.z - p.z);
    const dPl = hyp(o.x - p.x, o.z - p.z);
    p.st.tackles++; this.stats[p.team].tackles++;
    if (d > 1.55 && dPl > 1.3) { this.emit('tackleMiss', { p: p.i }); p.stun = 0.25; return; }
    const behind = Math.cos(angDiff(o.face, Math.atan2(p.z - o.z, p.x - o.x))) < -0.45;
    let pr = 0.5 + (p.a.def - o.a.dri) * 1.0 + (behind ? -0.2 : 0) - (o.skillT > 0 ? 0.35 : 0) - Math.min(0.2, hyp(o.vx, o.vz) * 0.015) + (this.isCPU(p.team) ? (DIFF.aggr[this.difficulty] - 1) * 0.2 : 0);
    pr = clamp(pr, 0.08, 0.9);
    if (this.r() < pr) {
      p.st.tackleOk++;
      this.emit('tackle', { p: p.i, victim: o.i });
      if (this.r() < 0.55) { // win the ball cleanly
        b.owner = p.i; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.kickId++; p.gotBallT = this.realT; o.cool = 0.5; o.stun = 0.3;
        this.emit('turnover', { p: p.i, team: p.team });
        for (const c of this.controllers) if (c.team === p.team && c.lock < 0) c.pi = p.i;
      } else { // poke loose
        b.owner = -1; const a = Math.atan2(b.z - p.z, b.x - p.x) + (this.r() - 0.5); b.vx = Math.cos(a) * 5; b.vz = Math.sin(a) * 5; b.kickId++; b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; o.cool = 0.4;
      }
    } else if (this.r() < (behind ? 0.45 : 0.16)) {
      this.foul(p, o, false);
    } else { p.stun = 0.45; this.emit('tackleMiss', { p: p.i }); }
  }
  slideContacts() {
    const b = this.ball;
    for (const p of this.players) {
      if (p.state !== STATE.slide || p.slideHit || p.off) continue;
      const fx = p.x + Math.cos(p.face) * 0.6, fz = p.z + Math.sin(p.face) * 0.6;
      const db = hyp(b.x - fx, b.z - fz);
      if (db < 0.85 && b.y < 0.6) {
        p.slideHit = true;
        if (b.owner >= 0 && this.players[b.owner].team !== p.team) { const o = this.players[b.owner]; o.cool = 0.6; o.state = STATE.fallen; o.stateT = 0.9; o.stateDur = 0.9; }
        b.owner = -1; const s = 6 + this.r() * 6; b.vx = Math.cos(p.face) * s + (this.r() - 0.5) * 4; b.vz = Math.sin(p.face) * s + (this.r() - 0.5) * 4; b.vy = this.r() * 2;
        b.lastTouch = p.i; b.lastTeam = p.team; this.lastTouchTeam = p.team; b.kickId++; b.pass = null; b.shot = null;
        p.st.tackleOk++; this.emit('tackle', { p: p.i, slide: true });
        continue;
      }
      for (const o of this.active(1 - p.team)) {
        const dd = hyp(o.x - fx, o.z - fz);
        if (dd < 0.75 && o.state !== STATE.fallen) {
          p.slideHit = true;
          const withBall = b.owner === o.i || hyp(b.x - o.x, b.z - o.z) < 2.5;
          if (!withBall && this.r() < 0.5) break;
          const behind = Math.cos(angDiff(o.face, p.face)) > 0.5;
          o.state = STATE.fallen; o.stateT = 1.2; o.stateDur = 1.2;
          if (b.owner === o.i) { b.owner = -1; b.vx = o.vx; b.vz = o.vz; b.kickId++; }
          this.foul(p, o, true, behind);
          return;
        }
      }
    }
  }
  foul(p, victim, slide, fromBehind) {
    p.st.fouls++; this.stats[p.team].fouls++;
    victim.state = STATE.fallen; victim.stateT = 1.1; victim.stateDur = 1.1;
    this.emit('foul', { p: p.i, victim: victim.i, team: p.team });
    // cards
    let yp = slide ? (fromBehind ? 0.55 : 0.25) : 0.12;
    const lastMan = this.isLastMan(p, victim);
    if (lastMan) yp = 0.6;
    if (slide && fromBehind && this.r() < 0.05 || (lastMan && this.r() < 0.35)) this.card(p, 'red');
    else if (this.r() < yp) this.card(p, 'yellow');
    const inBox = this.inBox(p.team, victim.x, victim.z);
    if (inBox) this.startSetPiece('penalty', victim.team, 0, 0);
    else this.startSetPiece('freekick', victim.team, victim.x, victim.z, { indirect: false });
  }
  isLastMan(p, victim) {
    const gx = this.ownGoalX(p.team);
    if (hyp(victim.x - gx, victim.z) > 32) return false;
    const vd = Math.abs(victim.x - gx);
    return !this.active(p.team).some(q => q.i !== p.i && !q.isGK && Math.abs(q.x - gx) < vd - 1);
  }
  card(p, color) {
    if (color === 'yellow') {
      p.yellow++; this.stats[p.team].yellow++; p.st.rating -= 0.3;
      this.emit('card', { p: p.i, color: 'yellow', team: p.team });
      if (p.yellow >= 2) { this.emit('card', { p: p.i, color: 'red', team: p.team, second: true }); this.sendOff(p); }
    } else { this.stats[p.team].red++; this.emit('card', { p: p.i, color: 'red', team: p.team }); this.sendOff(p); }
  }
  sendOff(p) {
    p.off = true; p.st.rating -= 1.5; p.x = 0; p.z = HW + 8; p.vx = p.vz = 0;
    if (this.ball.owner === p.i) this.ball.owner = -1;
    for (const c of this.controllers) if (c.pi === p.i) c.pi = -1;
    if (p.isGK) { // outfield player goes in goal
      const rep = this.active(p.team).filter(q => q.group === 'DEF')[0] || this.active(p.team)[0];
      if (rep) { rep.isGK = true; rep.group = 'GK'; rep.slot = { ...rep.slot, pos: 'GK', d: 0.02, w: 0 }; }
    }
  }

  // ---------- rules ----------
  checkBallRules() {
    this.slideContacts();
    if (this.phase !== 'play') return;
    const b = this.ball;
    if (b.inGoal) return;
    // goal?
    if (Math.abs(b.x) > HL + BR) {
      const sx = Math.sign(b.x);
      if (Math.abs(b.z) < GW - 0.02 && b.y < GH) {
        b.inGoal = true;
        const scorerTeam = this.dir(0) === sx ? 0 : 1;
        return this.goalScored(scorerTeam);
      }
      // out over goal line
      const defTeam = this.dir(0) === -sx ? 0 : 1; // team defending this side
      if (b.lastTeam === defTeam) {
        this.stats[1 - defTeam].corners++;
        return this.startSetPiece('corner', 1 - defTeam, sx * (HL - 0.4), Math.sign(b.z || 1) * (HW - 0.4));
      }
      return this.startSetPiece('goalkick', defTeam, sx * (HL - 5.5), Math.sign(b.z || 1) * 5);
    }
    if (Math.abs(b.z) > HW + BR) {
      return this.startSetPiece('throwin', b.lastTeam === 0 ? 1 : 0, clamp(b.x, -HL + 1, HL - 1), Math.sign(b.z) * (HW + 0.3));
    }
  }
  goalScored(team) {
    const b = this.ball;
    const scorer = this.players[b.lastTouch];
    const own = scorer && scorer.team !== team;
    this.score[team]++;
    let assist = null;
    if (!own && this.lastPassInfo && this.lastPassInfo.to === scorer?.i && this.realT - this.lastPassInfo.t < 12) {
      assist = this.players[this.lastPassInfo.from];
      if (assist) { assist.st.assists++; assist.st.rating += 0.6; }
    }
    if (scorer) { if (!own) { scorer.st.goals++; scorer.st.rating += 1.0; } }
    for (const p of this.active(1 - team)) if (p.isGK || p.group === 'DEF') p.st.rating -= 0.15;
    const min = Math.floor(this.time / 60) + 1;
    this.scorers.push({ team, p: scorer?.i ?? -1, name: scorer?.info.name ?? '?', own, min, assist: assist?.info.name || null });
    this.phase = 'goal'; this.phaseT = 0;
    this.goalTeam = team; this.goalScorer = scorer ? scorer.i : -1;
    this.emit('goal', { team, p: scorer?.i ?? -1, own, assist: assist?.i ?? -1, score: [...this.score], min });
  }
  stepCelebration(dt, inputs) {
    const skip = this.allowSkip && this.phaseT > 1.5 && inputs.some((inp, ci) => this.tapped(ci, inp, 'skip'));
    this.consumeTaps(inputs);
    // ball keeps moving in the net
    this.updateBall(dt);
    const sc = this.goalScorer >= 0 ? this.players[this.goalScorer] : null;
    for (const p of this.players) {
      if (p.off) continue;
      if (p.stateT > 0) { p.stateT -= dt; if (p.stateT <= 0) p.state = 0; }
      if (sc && p === sc && sc.team === this.goalTeam) {
        const cx = Math.sign(p.x || 1) * (HL - 3), cz = Math.sign(p.z || 1) * (HW - 3);
        this.steerTo(p, cx, cz, this.phaseT < 3.5 ? 0.95 : 0.2);
        if (this.phaseT > 3.2 && p.state !== STATE.celebrate) { p.state = STATE.celebrate; p.stateT = 4; p.stateDur = 4; }
      } else if (sc && p.team === this.goalTeam && sc.team === this.goalTeam) {
        this.steerTo(p, sc.x - Math.cos(p.i) * 2, sc.z - Math.sin(p.i) * 2, 0.8);
      } else {
        this.steerTo(p, p.x * 0.8, p.z * 0.9, 0.25);
      }
      this.movePlayer(p, dt);
    }
    this.separatePlayers();
    if (this.phaseT > 9.5 || skip) {
      this.setupKickoff(1 - this.goalTeam);
    }
  }

  startSetPiece(type, team, x, z, extra = {}) {
    const b = this.ball;
    this.phase = 'setpiece'; this.phaseT = 0;
    b.pass = null; b.shot = null; b.spin = 0;
    for (const p of this.players) { p.run = null; if (p.state !== STATE.fallen) { p.state = 0; p.stateT = 0; } p.cool = 0; p.stun = 0; }
    const d = this.dir(team);
    let taker = null;
    this.ctx.poss = team;
    if (type === 'penalty') {
      const gx = this.goalX(team);
      x = gx - d * PITCH.PEN; z = 0;
      this.resetBall(x, z);
      // shooter: best shooting
      taker = this.active(team).filter(p => !p.isGK).sort((a, b) => b.a.sho - a.a.sho)[0];
      const lk = this.controllers.find(c => c.team === team && c.lock >= 0);
      if (lk) { const lp = this.teamPlayer(team, lk.lock); if (lp && lp.a.sho > 0.7) taker = lp; }
      let k = 0;
      for (const p of this.active()) {
        if (p === taker) { p.x = x - d * 1.8; p.z = 0; }
        else if (p.isGK && p.team !== team) { p.x = gx - d * 0.3; p.z = 0; }
        else if (p.isGK) { const [a, c] = this.toWorld(team, 0.03, 0); p.x = a; p.z = c; }
        else { const row = k++; p.x = gx - d * (19 + (row % 3) * 2.5); p.z = ((row * 7) % 30) - 15; }
        p.vx = p.vz = 0; p.face = Math.atan2(0 - p.z, gx - p.x);
      }
      this.emit('penalty', { team });
    } else if (type === 'corner') {
      this.resetBall(x, z);
      const sx = Math.sign(x), sz = Math.sign(z);
      const gx = sx * HL;
      const att = this.active(team).filter(p => !p.isGK);
      taker = att.slice().sort((a, b) => b.a.pas - a.a.pas)[0];
      const boxers = att.filter(p => p !== taker).sort((a, b) => (b.a.phy + b.a.sho) - (a.a.phy + a.a.sho));
      const spots = [[5.5, sz * 2.5], [9, 0], [7, -sz * 3.5], [12, -sz * 1], [15, sz * 4], [17, -sz * 8]];
      boxers.forEach((p, i) => {
        if (i < spots.length) { p.x = gx - sx * spots[i][0] + (this.r() - 0.5); p.z = spots[i][1] + (this.r() - 0.5) * 1.5; }
        else { const [a, c] = this.toWorld(team, 0.42 + i * 0.01, (i % 2 ? 0.3 : -0.3)); p.x = a; p.z = c; }
      });
      if (taker) { taker.x = x + sx * 0.6; taker.z = z + sz * 0.6; }
      const def = this.active(1 - team);
      const dgk = def.find(p => p.isGK); if (dgk) { dgk.x = gx - sx * 0.6; dgk.z = sz * 0.8; }
      const markers = def.filter(p => !p.isGK);
      markers.forEach((p, i) => {
        const m = boxers[i];
        if (m && i < spots.length) { p.x = m.x - sx * 0.1 + (gx - m.x) * 0.12; p.z = m.z + (this.r() - 0.5) * 0.8 - sz * 0.4; }
        else if (i === spots.length) { p.x = gx - sx * 1; p.z = sz * 3.4; }
        else { p.x = gx - sx * (22 + (i % 3) * 4); p.z = ((i * 11) % 30) - 15; }
      });
      for (const p of this.active()) { p.vx = p.vz = 0; p.face = Math.atan2(z - p.z, x - p.x); }
      this.emit('corner', { team });
    } else if (type === 'goalkick') {
      this.resetBall(x, z);
      taker = this.gk(team);
      this.placeFormation(team, x, z, false);
      this.placeFormation(1 - team, x * 0.6, z, false);
      for (const p of this.active(1 - team)) if (this.inBox(team, p.x, p.z)) p.x = this.ownGoalX(team) + this.dir(team) * 18;
      if (taker) { taker.x = x - this.dir(team) * 1.2; taker.z = z; taker.face = this.dir(team) > 0 ? 0 : Math.PI; }
      this.emit('goalkick', { team });
    } else if (type === 'throwin') {
      // taker stands on the line; the ball is released just inside the field of play
      const sz = Math.sign(z) || 1; z = sz * (HW + 0.2);
      this.resetBall(x, sz * (HW - 0.3), 2.0);
      taker = this.nearestTo(team, x, z, true);
      if (taker) { taker.x = x; taker.z = z; taker.vx = taker.vz = 0; taker.face = Math.atan2(-Math.sign(z), 0.0001); }
      for (const p of this.active(1 - team)) if (hyp(p.x - x, p.z - z) < 2.5) { p.z -= Math.sign(z) * 2.5; }
      this.emit('throwin', { team });
    } else if (type === 'freekick') {
      x = clamp(x, -HL + 1, HL - 1); z = clamp(z, -HW + 1, HW - 1);
      // don't take an attacking free kick inside the box (would be penalty) — pull it out
      this.resetBall(x, z);
      const gx = this.goalX(team);
      const dg = hyp(gx - x, z);
      const att = this.active(team).filter(p => !p.isGK);
      taker = att.slice().sort((a, b) => (b.a.sho + b.a.pas) - (a.a.sho + a.a.pas))[0];
      const lk = this.controllers.find(c => c.team === team && c.lock >= 0);
      if (lk && dg < 32) { const lp = this.teamPlayer(team, lk.lock); if (lp && lp.a.sho > 0.72) taker = lp; }
      this.placeFormation(team, x, z, false);
      this.placeFormation(1 - team, x, z, false);
      const ang = Math.atan2(0 - z, gx - x);
      if (taker) { taker.x = x - Math.cos(ang) * 1.6; taker.z = z - Math.sin(ang) * 1.6; taker.face = ang; }
      // wall
      const wallN = extra.indirect ? 0 : dg < 22 ? 4 : dg < 28 ? 3 : dg < 34 ? 2 : 0;
      const def = this.active(1 - team).filter(p => !p.isGK).sort((a, b) => hyp(a.x - x, a.z - z) - hyp(b.x - x, b.z - z));
      const wx = x + Math.cos(ang) * 9.15, wz = z + Math.sin(ang) * 9.15;
      const px = -Math.sin(ang), pz = Math.cos(ang);
      for (let i = 0; i < wallN && i < def.length; i++) { const o = (i - (wallN - 1) / 2) * 0.62 + (z > 0 ? -0.3 : 0.3); def[i].x = wx + px * o; def[i].z = wz + pz * o; def[i].face = ang + Math.PI; def[i].wall = true; }
      for (const p of def.slice(wallN)) { if (hyp(p.x - x, p.z - z) < 9.15) { const a = Math.atan2(p.z - z, p.x - x); p.x = x + Math.cos(a) * 9.4; p.z = z + Math.sin(a) * 9.4; } }
      const dgk = this.gk(1 - team); if (dgk && dg < 36) { dgk.x = gx - this.dir(team) * 0.8; dgk.z = clamp(-z * 0.08 + (z > 0 ? 1 : -1) * 0.9, -2.5, 2.5); }
      for (const p of this.active()) { p.vx = p.vz = 0; }
      this.sp = null;
      this.emit('freekick', { team, direct: !extra.indirect, dist: dg });
      extra.direct = !extra.indirect && dg < 34;
    }
    this.sp = { type, team, taker: taker ? taker.i : -1, x, z, wait: false, ...extra };
    this.sp.wait = this.controllers.some(c => c.team === team && (c.lock < 0 || (taker && this.teamPlayer(team, c.lock) === taker)));
    if (b.owner >= 0) b.owner = -1;
    this.assignSetpieceControl();
  }

  stepSetPiece(dt, inputs) {
    const sp = this.sp; const b = this.ball;
    if (!sp) { this.phase = 'play'; return; }
    const taker = sp.taker >= 0 ? this.players[sp.taker] : null;
    // other players drift to good positions (throw-ins mostly)
    this.teamContext(dt);
    for (const p of this.players) {
      if (p.off) continue;
      if (p.stateT > 0) { p.stateT -= dt; if (p.stateT <= 0) p.state = 0; }
      if (p === taker) {
        if (sp.pendingAct) { // run-up: jog onto the ball before striking it
          const dx = b.x - p.x, dz = b.z - p.z, dd = Math.hypot(dx, dz) || 1;
          const s = Math.min(this.maxSpeed(p) * 0.55, dd * 6);
          p.dvx = dx / dd * s; p.dvz = dz / dd * s;
        } else { p.dvx = 0; p.dvz = 0; }
      }
      else if (sp.type === 'throwin' || sp.type === 'goalkick') { const [tx, tz] = this.shapePos(p, b.x, b.z, p.team === sp.team); this.steerTo(p, tx, clamp(tz, -HW + 1, HW - 1), 0.6); }
      else { p.dvx = 0; p.dvz = 0; }
      if (p.human && p !== taker && sp.type !== 'penalty') { const ci = this.controllers.findIndex(c => c.pi === p.i); const inp = inputs[ci] || {}; const m = Math.min(1, hyp(inp.mx || 0, inp.mz || 0)); const s = this.maxSpeed(p) * 0.6 * m; p.dvx = m > 0.05 ? inp.mx / m * s : 0; p.dvz = m > 0.05 ? inp.mz / m * s : 0; }
      this.movePlayer(p, dt);
    }
    if (taker) {
      // hold the ball at the taker
      if (sp.type === 'throwin') { b.x = taker.x; b.z = taker.z - Math.sign(taker.z) * 0.5; b.y = 2.1; b.vx = b.vy = b.vz = 0; }
      else if (sp.type === 'goalkick' && taker.isGK) { /* ball stays on the ground */ }
    }
    if (taker && sp.pendingAct) {
      const dist = Math.hypot(b.x - taker.x, b.z - taker.z);
      if (dist < 0.7 || this.phaseT - sp.pendingAt > 2.5) { const a = sp.pendingAct; sp.pendingAct = null; sp.ranUp = true; this.executeSetPiece(a); }
      return;
    }
    const minWait = sp.type === 'kickoff' ? 1.0 : sp.type === 'penalty' ? 1.6 : 1.2;
    if (this.phaseT < minWait) return;
    if (!taker) { this.phase = 'play'; this.sp = null; return; }
    // penalty: human goalkeeper chooses a side
    if (sp.type === 'penalty') {
      const dc = this.controllers.findIndex(c => c.team !== sp.team);
      if (dc >= 0) { const inp = inputs[dc] || {}; this.penaltyGuess = Math.abs(inp.mz || 0) > 0.3 ? Math.sign(inp.mz) : 0; }
    }
    if (sp.wait) {
      const ci = this.controllers.findIndex(c => c.pi === taker.i);
      const c = this.controllers[ci];
      const inp = inputs[ci] || {};
      if (ci >= 0) {
        const m = hyp(inp.mx || 0, inp.mz || 0);
        const ax = m > 0.2 ? inp.mx / m : Math.cos(taker.face), az = m > 0.2 ? inp.mz / m : Math.sin(taker.face);
        if (m > 0.2) taker.aimA = Math.atan2(az, ax);
        const canShoot = sp.type === 'penalty' || (sp.type === 'freekick' && sp.direct);
        if (canShoot) {
          if (this.tapped(ci, inp, 'shoot') || (inp.shoot && !c.charging)) { c.charging = true; c.charge = Math.max(c.charge, 0.05); }
          if (c.charging) {
            if (inp.shoot) c.charge = Math.min(1.15, c.charge + dt / 0.95);
            else { this.executeSetPiece({ act: 'shoot', ax, az, power: Math.max(0.3, c.charge), finesse: !!inp.finesse, aimZ: m > 0.25 ? clamp(inp.mz / Math.max(m, 0.5) * (sp.type === 'penalty' ? 2.7 : 3.2), -3.2, 3.2) : null }); c.charging = false; c.charge = 0; return; }
          }
        }
        for (const a of ['pass', 'through', 'lob']) if (this.tapped(ci, inp, a)) return this.executeSetPiece({ act: a, ax, az });
        if (this.phaseT > 12) return this.executeSetPiece(this.aiSetPiece(sp, taker));
        return;
      }
    }
    if (this.phaseT > minWait + 0.4 + this.r() * 0.5) this.executeSetPiece(this.aiSetPiece(sp, taker));
  }

  aiSetPiece(sp, taker) {
    const t = sp.team, d = this.dir(t);
    switch (sp.type) {
      case 'kickoff': return { act: 'pass', target: this.active(t).filter(p => p !== taker && !p.isGK).sort((a, b) => hyp(a.x - taker.x, a.z - taker.z) - hyp(b.x - taker.x, b.z - taker.z))[0] };
      case 'penalty': return { act: 'shoot', aimZ: (this.r() < 0.5 ? -1 : 1) * (1.8 + this.r() * 1.3), power: 0.62 + this.r() * 0.25 };
      case 'corner': {
        const q = this.bestCrossTarget(taker) || this.active(t).find(p => p !== taker && !p.isGK);
        if (this.r() < 0.15) { const nq = this.nearestTo(t, taker.x, taker.z, true, taker.i); if (nq && hyp(nq.x - taker.x, nq.z - taker.z) < 20) return { act: 'pass', target: nq }; }
        return { act: 'cross', target: q };
      }
      case 'goalkick': {
        if (this.r() < 0.4) { const cb = this.active(t).filter(p => p.group === 'DEF' && this.nearestOpp(p.x, p.z, t) > 6)[0]; if (cb) return { act: 'pass', target: cb }; }
        const fw = this.active(t).filter(p => p.group !== 'DEF' && !p.isGK).sort((a, b) => (b.x * d) - (a.x * d))[Math.floor(this.r() * 3)];
        return { act: 'lob', target: fw };
      }
      case 'freekick': {
        if (sp.direct && this.r() < 0.7) return { act: 'shoot', finesse: true, aimZ: (sp.z * d > 0 ? -1 : 1) * d * 2.9 * (this.r() < 0.5 ? 1 : -1), power: 0.75 + this.r() * 0.15 };
        let best = null, bs = -1e9;
        for (const q of this.active(t)) { if (q === taker || q.isGK || this.isOffside(q)) continue; const dist = hyp(q.x - taker.x, q.z - taker.z); if (dist > 45) continue; const s = (q.x - taker.x) * d / 20 + this.nearestOpp(q.x, q.z, t) / 5 - dist / 40; if (s > bs) { bs = s; best = q; } }
        return best ? { act: hyp(best.x - taker.x, best.z - taker.z) > 25 ? 'lob' : 'pass', target: best } : { act: 'pass', target: this.nearestTo(t, taker.x, taker.z, true, taker.i) };
      }
      case 'throwin': default: {
        let best = null, bs = -1e9;
        for (const q of this.active(t)) { if (q === taker || q.isGK) continue; const dist = hyp(q.x - taker.x, q.z - taker.z); if (dist > 24 || dist < 3) continue; const s = this.nearestOpp(q.x, q.z, t) / 4 + (q.x - taker.x) * d / 15 - dist / 30 + this.r() * 0.4; if (s > bs) { bs = s; best = q; } }
        return { act: 'pass', target: best || this.nearestTo(t, taker.x, taker.z, true, taker.i) };
      }
    }
  }

  executeSetPiece(a) {
    const sp = this.sp; const taker = this.players[sp.taker];
    const b = this.ball;
    // everything except throw-ins starts with a short run-up to the ball
    if (sp.type !== 'throwin' && !sp.ranUp && taker && Math.hypot(b.x - taker.x, b.z - taker.z) > 0.7) {
      if (a.ax === undefined) a = { ...a };
      sp.pendingAct = a; sp.pendingAt = this.phaseT;
      return;
    }
    this.phase = 'play'; this.phaseT = 0;
    for (const p of this.players) p.wall = false;
    b.owner = -1;
    const t = sp.team;
    let target = a.target;
    if (!target && a.ax !== undefined) target = this.pickPassTarget(taker, a.ax, a.az, a.act === 'lob' ? 'lob' : 'pass');
    // nobody in the aimed direction: fall back to the best available team-mate instead of kicking into space
    if (!target && a.act !== 'shoot' && a.act !== 'cross') target = this.aiSetPiece(sp, taker).target || null;
    if (sp.type === 'throwin') {
      b.y = 2.0; b.x = taker.x; b.z = taker.z - Math.sign(taker.z) * 0.5;
      if (!target) target = this.nearestTo(t, taker.x, taker.z, true, taker.i);
      const dx = target.x - b.x, dz = target.z - b.z, dist = hyp(dx, dz);
      const long = a.act === 'lob';
      const T = long ? 0.6 + dist * 0.035 : 0.45 + dist * 0.03;
      const vh = Math.min(dist / T, long ? 19 : 14);
      const vy = (0.4 - 2.0) / T + 0.5 * G * T;
      this.kick(taker, dx / dist * vh, vy, dz / dist * vh, 0, 'throw', { target: target.i });
    } else if (a.act === 'shoot') {
      if (sp.type === 'penalty') {
        const g = this.gk(1 - t);
        const aimZ = a.aimZ ?? (this.r() < 0.5 ? -2.4 : 2.4);
        this.shoot(taker, a.power ?? 0.75, aimZ, false);
        if (g) { // keeper guesses
          const human = this.controllers.some(c => c.team === g.team);
          const guess = human ? (this.penaltyGuess ?? 0) : [-1, 0, 1, 1, -1][Math.floor(this.r() * 5)];
          if (guess !== 0) { g.state = STATE.dive; g.stateT = 1.0; g.stateDur = 1.0; g.diveDir = guess; g.vz = guess * (4.5 + g.a.pac * 2.5); g.diveH = 0.7 + this.r() * 0.8; }
          if (b.shot) b.shot.rt = this.realT - 1; // no reaction delay for pens
        }
      } else {
        const aimZ = a.aimZ ?? (this.r() < 0.5 ? -2.8 : 2.8);
        this.shoot(taker, a.power ?? 0.8, aimZ, a.finesse ?? true);
      }
    } else if (a.act === 'cross' || (a.act === 'lob' && sp.type === 'corner')) {
      target = target || this.bestCrossTarget(taker);
      if (target) this.cross(taker, target); else this.lobTo(taker, this.goalX(t) - this.dir(t) * 8, 0, null);
    } else if (a.act === 'lob') {
      if (target) this.lobPass(taker, target, sp.type === 'goalkick'); else this.lobTo(taker, taker.x + (a.ax ?? this.dir(t)) * 35, taker.z + (a.az ?? 0) * 35, null);
    } else {
      if (target) this.groundPass(taker, target, a.act === 'through'); else this.groundTo(taker, taker.x + (a.ax ?? this.dir(t)) * 15, taker.z + (a.az ?? 0) * 15, null);
    }
    if (target) for (const c of this.controllers) if (c.team === t && c.lock < 0) c.pi = target.i;
    this.emit('restart', { kind: sp.type, team: t });
    this.sp = null;
  }

  // ---------- output ----------
  snapshot() {
    const P = [];
    for (const p of this.players) {
      const sp = hyp(p.vx, p.vz);
      const prog = p.stateDur ? 1 - clamp(p.stateT / p.stateDur, 0, 1) : 0;
      P.push(+p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(2), +sp.toFixed(2), p.off ? -1 : p.state, +prog.toFixed(2), p.state === STATE.dive ? p.diveDir * (p.diveH ?? 0.8) : +(p.stamina.toFixed(2)));
    }
    const b = this.ball;
    return {
      t: Math.round(this.time), h: this.half, ph: this.phase, pt: +this.phaseT.toFixed(2), sc: [...this.score],
      add: this.addedShown[this.half - 1] ? this.added[this.half - 1] / 60 : 0,
      b: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), b.owner],
      p: P,
      c: this.controllers.map(c => c.pi),
      ch: this.controllers.map(c => c.charging ? +c.charge.toFixed(2) : 0),
      sp: this.sp ? { ty: this.sp.type, tm: this.sp.team, tk: this.sp.taker, w: this.sp.wait } : null,
      pos: this.possessionPct(),
    };
  }
  possessionPct() { const a = this.stats[0].poss, b = this.stats[1].poss; return a + b > 0 ? Math.round(a / (a + b) * 100) : 50; }

  finalize() {
    const w = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
    for (const p of this.players) {
      const s = p.st;
      s.rating += (s.passOk * 0.035) - Math.max(0, s.passes - s.passOk) * 0.06 + s.tackleOk * 0.12 + s.saves * 0.28 + s.sot * 0.12 + s.km * 0.05;
      if (w === p.team) s.rating += 0.4; else if (w >= 0) s.rating -= 0.3;
      if (p.isGK || p.group === 'DEF') if (this.score[1 - p.team] === 0) s.rating += 0.5;
      s.rating = clamp(Math.round(s.rating * 10) / 10, 3, 10);
    }
  }
  result() {
    const ratings = this.players.map(p => ({ i: p.i, team: p.team, id: p.info.id, name: p.info.name, num: p.info.num, pos: p.slot.pos, rating: p.st.rating, ...p.st }));
    const motm = ratings.slice().sort((a, b) => b.rating - a.rating)[0];
    return { score: [...this.score], stats: this.stats.map((s, i) => ({ ...s, possPct: i === 0 ? this.possessionPct() : 100 - this.possessionPct() })), scorers: this.scorers, ratings, motm };
  }
}

// ---------- quick simulation for career fixtures ----------
export function quickSim(ovrA, ovrB, r = Math.random, homeAdv = 0.18) {
  const lamA = Math.max(0.2, 1.35 * Math.exp((ovrA - ovrB) * 0.06) + homeAdv);
  const lamB = Math.max(0.2, 1.2 * Math.exp((ovrB - ovrA) * 0.06));
  return [poisson(lamA, r), poisson(lamB, r)];
}
function poisson(l, r) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; }

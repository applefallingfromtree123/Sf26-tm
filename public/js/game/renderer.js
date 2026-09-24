// Three.js renderer: scene/lighting, stadium, 22 players + ball driven by engine snapshots.
import * as THREE from 'three';
import { buildStadium, buildSky } from './stadium.js';
import { createPlayer, animatePlayer, makeKitMaterials, makeIndicator, makeLabel } from './playerModel.js';

const GK_KITS = [['#1fd26a', '#0b3d22'], ['#ffd400', '#222222'], ['#ff4fa3', '#2a0a1a'], ['#00c2ff', '#08263a'], ['#ff7a00', '#221100'], ['#9b5cff', '#1b1033']];

function ballTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, 512, 256);
  // icosahedron vertex directions -> pentagon panels in equirect space
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  for (const [x, y, z] of verts) {
    const l = Math.hypot(x, y, z);
    const lat = Math.asin(y / l), lon = Math.atan2(z, x);
    const u = (lon / (Math.PI * 2) + 0.5) * 512, v = (0.5 - lat / Math.PI) * 256;
    const r = 26, sxk = 1 / Math.max(0.25, Math.cos(lat));
    g.fillStyle = '#16161a';
    for (const du of [-512, 0, 512]) {
      g.beginPath();
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(u + du + Math.cos(a) * r * sxk, v + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
  }
  // modern accents
  g.strokeStyle = '#00d18f'; g.lineWidth = 5;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(i * 90 + 30, 128, 40, 0.2, 1.6); g.stroke(); }
  g.strokeStyle = '#ff3c5f'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(i * 90 + 70, 128, 30, 3.4, 4.8); g.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Renderer {
  constructor(canvas, settings = {}) {
    this.settings = settings;
    this.canvas = canvas;
    const hq = (settings.quality ?? 1) >= 1;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: hq, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, hq ? 2 : 1));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = settings.shadows !== false;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1500);
    this.camera.position.set(0, 24, 60);
    this.camPos = this.camera.position.clone();
    this.camLook = new THREE.Vector3();
    this.camMode = settings.camera || 'broadcast';
    this.menuMode = true;
    this.time = 0;
    this.excite = 0.15;
    this.players = [];
    this.night = true;
    this.setupLights(true);
    this.sky = buildSky(this.scene, true);
    this.stadium = buildStadium(this.scene, this.gl, { quality: settings.quality ?? 1 });
    this.scene.fog = new THREE.Fog(0x0b1328, 180, 520);
    // ball
    this.ballTex = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 20), new THREE.MeshStandardMaterial({ map: this.ballTex, roughness: 0.45, metalness: 0 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballPrev = new THREE.Vector3();
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.012; this.scene.add(this.ballShadow);
    this.indicator = makeIndicator(0x00ffa3); this.indicator.visible = false; this.scene.add(this.indicator);
    this.indicator2 = makeIndicator(0xff3c5f); this.indicator2.visible = false; this.scene.add(this.indicator2);
    this.label = makeLabel(''); this.label.visible = false; this.scene.add(this.label);
    this.labelKey = '';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setupLights(night) {
    if (this.lights) for (const l of this.lights) this.scene.remove(l);
    const hemi = new THREE.HemisphereLight(night ? 0xaec4ff : 0xcfe6ff, night ? 0x1c2a14 : 0x3a5a2a, night ? 0.75 : 1.1);
    const key = new THREE.DirectionalLight(night ? 0xfff4e6 : 0xfff1d8, night ? 2.4 : 3.0);
    key.position.set(night ? -30 : 60, 90, night ? 45 : 30);
    key.castShadow = true;
    const q = (this.settings.quality ?? 1) >= 1;
    key.shadow.mapSize.set(q ? 4096 : 2048, q ? 4096 : 2048);
    Object.assign(key.shadow.camera, { left: -64, right: 64, top: 42, bottom: -42, near: 10, far: 260 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    const fill = new THREE.DirectionalLight(night ? 0xcfd8ff : 0xffffff, night ? 0.9 : 0.4);
    fill.position.set(40, 70, -50);
    const fill2 = new THREE.DirectionalLight(0xffffff, night ? 0.5 : 0.2); fill2.position.set(-60, 50, -20);
    this.lights = [hemi, key, fill, fill2];
    for (const l of this.lights) this.scene.add(l);
    this.key = key;
  }
  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    this.setupLights(night);
    this.sky.dispose(); this.sky = buildSky(this.scene, night);
    this.scene.fog.color.set(night ? 0x0b1328 : 0xaec8e6);
  }
  setStadiumColors(c1, c2, a1, a2) {
    const key = `${c1}${c2}${a1}`;
    if (this.stadiumKey === key) return;
    this.stadiumKey = key;
    this.stadium.dispose();
    this.stadium = buildStadium(this.scene, this.gl, { quality: this.settings.quality ?? 1, homeColor: c1, homeColor2: c2, awayColor: a1, awayColor2: a2 });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  clearTeams() {
    for (const p of this.players) this.scene.remove(p);
    this.players = [];
    this.indicator.visible = false; this.indicator2.visible = false; this.label.visible = false;
  }
  // teams: [home, away] built teams; kits: {home:[c1,c2], away:[c1,c2]}
  setTeams(home, away, kits) {
    this.clearTeams();
    this.teams = [home, away];
    const shadows = this.settings.shadows !== false;
    const gkA = GK_KITS[0], gkB = GK_KITS[1];
    const k0 = makeKitMaterials(kits.home[0], kits.home[1], kits.home[0]);
    const k1 = makeKitMaterials(kits.away[0], kits.away[1], kits.away[0]);
    const g0 = makeKitMaterials(gkA[0], gkA[1], gkA[0]), g1 = makeKitMaterials(gkB[0], gkB[1], gkB[0]);
    const numCol = (hex) => { const c = new THREE.Color(hex); return (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) > 0.6 ? '#111111' : '#ffffff'; };
    [home, away].forEach((tm, t) => {
      tm.xi.forEach((info, i) => {
        const gk = tm.slots[i].pos === 'GK';
        const kit = gk ? (t ? g1 : g0) : (t ? k1 : k0);
        const shirtHex = gk ? (t ? gkB[0] : gkA[0]) : (t ? kits.away[0] : kits.home[0]);
        const m = createPlayer({ ...info, pos: tm.slots[i].pos }, kit, { gk, shadows, shirtHex, numColor: numCol(shirtHex) });
        this.scene.add(m);
        this.players.push(m);
      });
    });
    this.kits = kits;
  }

  setMenuMode(on) { this.menuMode = on; if (on) { this.clearTeams(); this.ball.visible = false; this.ballShadow.visible = false; } else { this.ball.visible = true; this.ballShadow.visible = true; } }

  // snap: engine snapshot (possibly interpolated). ctx: {controlled, controlled2, attackDir, replay, cam}
  renderFrame(dt, snap, ctx = {}) {
    this.time += dt;
    const excTarget = ctx.excite ?? 0.15;
    this.excite += (excTarget - this.excite) * Math.min(1, dt * 1.5);
    this.stadium.update(dt, this.time, this.excite);
    if (this.menuMode || !snap) {
      // slow orbit inside the bowl (stays clear of the stands and roof)
      const a = this.time * 0.045;
      this.camera.position.set(Math.cos(a) * 52, 16 + Math.sin(this.time * 0.1) * 3, Math.sin(a) * 34);
      this.camera.fov = 50; this.camera.updateProjectionMatrix();
      this.camera.lookAt(-Math.cos(a) * 20, 6, -Math.sin(a) * 14);
      this.gl.render(this.scene, this.camera);
      return;
    }
    // players
    const P = snap.p;
    for (let i = 0; i < this.players.length; i++) {
      const o = i * 7;
      animatePlayer(this.players[i], P[o], P[o + 1], P[o + 2], P[o + 3], P[o + 4], P[o + 5], P[o + 6], dt, this.time);
    }
    // ball
    const [bx, by, bz] = snap.b;
    const prev = this.ballPrev;
    const dx = bx - prev.x, dz = bz - prev.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.0001 && dist < 5) {
      const axis = new THREE.Vector3(dz, 0, -dx).normalize();
      this.ball.rotateOnWorldAxis(axis, dist / 0.11);
    }
    prev.set(bx, by, bz);
    this.ball.position.set(bx, by, bz);
    this.ballShadow.position.set(bx, 0.012, bz);
    this.ballShadow.material.opacity = Math.max(0.05, 0.4 - by * 0.06);
    // indicators
    const ci = ctx.controlled ?? -1;
    if (ci >= 0 && this.players[ci] && !ctx.replay) {
      const pl = this.players[ci];
      this.indicator.visible = true;
      this.indicator.position.set(pl.position.x, 0, pl.position.z);
      this.indicator.userData.arrow.position.y = 2.35 + Math.sin(this.time * 6) * 0.08;
      const info = ctx.controlledInfo;
      if (info) {
        this.label.visible = true;
        this.label.position.set(pl.position.x, 2.95, pl.position.z);
        const key = info.name + '|' + Math.round((info.stamina ?? 1) * 20);
        if (key !== this.labelKey) { this.label.userData.set(info.name, info.stamina ?? 1); this.labelKey = key; }
      } else this.label.visible = false;
    } else { this.indicator.visible = false; this.label.visible = false; }
    const c2 = ctx.controlled2 ?? -1;
    if (c2 >= 0 && this.players[c2] && !ctx.replay) { const pl = this.players[c2]; this.indicator2.visible = true; this.indicator2.position.set(pl.position.x, 0, pl.position.z); }
    else this.indicator2.visible = false;

    this.updateCamera(dt, snap, ctx);
    this.gl.render(this.scene, this.camera);
  }

  updateCamera(dt, snap, ctx) {
    const [bx, by, bz] = snap.b;
    const mode = ctx.replay ? 'replay' : (ctx.cam || this.camMode);
    const cam = this.camera;
    let pos, look, fov;
    if (mode === 'replay') {
      const a = ctx.replayAngle ?? 0;
      const side = ctx.replaySide ?? 1;
      pos = new THREE.Vector3(bx - side * 14 * Math.cos(a), 4.5 + by * 0.4, bz + 12 * Math.sin(a) + 6);
      look = new THREE.Vector3(bx, by * 0.6 + 0.6, bz);
      fov = 38;
      this.camPos.lerp(pos, Math.min(1, dt * 3)); this.camLook.lerp(look, Math.min(1, dt * 6));
    } else if (mode === 'pro' && ctx.controlled >= 0 && this.players[ctx.controlled]) {
      const pl = this.players[ctx.controlled].position;
      const d = ctx.attackDir || 1;
      const tx = pl.x * 0.7 + bx * 0.3, tz = pl.z * 0.7 + bz * 0.3;
      // keep the player in the upper-middle of the frame (clear of the radar)
      pos = new THREE.Vector3(tx - d * 11.5, 5.2, tz);
      look = new THREE.Vector3(tx + d * 3.5, 0.2, tz);
      fov = 55;
      this.camPos.lerp(pos, Math.min(1, dt * 3.5)); this.camLook.lerp(look, Math.min(1, dt * 4));
    } else if (mode === 'close') {
      pos = new THREE.Vector3(bx * 0.92, 14, bz * 0.6 + 30);
      look = new THREE.Vector3(bx, 0, bz * 0.85);
      fov = 38;
      this.camPos.lerp(pos, Math.min(1, dt * 2.5)); this.camLook.lerp(look, Math.min(1, dt * 3.2));
    } else if (mode === 'goal') {
      const s = ctx.goalSide || 1;
      const [fx, fz] = ctx.focus || [bx, bz];
      pos = new THREE.Vector3(fx - s * 8, 3.4, fz + (fz > 0 ? -7 : 7));
      look = new THREE.Vector3(fx, 1.2, fz);
      fov = 45;
      this.camPos.lerp(pos, Math.min(1, dt * 2)); this.camLook.lerp(look, Math.min(1, dt * 3));
    } else { // broadcast: elevated main-stand camera that pans and tracks
      pos = new THREE.Vector3(bx * 0.7, 30, 70 + bz * 0.08);
      look = new THREE.Vector3(bx * 0.96, 0, bz * 0.6 + 2);
      const distZ = 70 - bz * 0.6;
      fov = 33 + (distZ - 70) * 0.1 + Math.abs(bx) * 0.02;
      this.camPos.lerp(pos, Math.min(1, dt * 2.6)); this.camLook.lerp(look, Math.min(1, dt * 3.6));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 2.5);
    cam.updateProjectionMatrix();
  }

  netHit(side, y, z) { this.stadium.netHit(side, y, z); }
  cameraYaw() { // for camera-relative controls
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    return Math.atan2(d.z, d.x);
  }
}

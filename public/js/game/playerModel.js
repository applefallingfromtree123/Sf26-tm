// Articulated footballer built from primitives with procedural animation.
import * as THREE from 'three';

const SKIN = ['#f1c9a5', '#e0ac85', '#c68b5e', '#8d5a3b', '#5a3825', '#ecc59b'];
const HAIR = ['#1a1410', '#2b1d12', '#4a3020', '#0d0d0d', '#6b4a2b', '#c9a15a', '#101010'];
const BOOTS = ['#111111', '#ffffff', '#ff3c5f', '#00e5ff', '#ffd400', '#7cff4d', '#ff7a00'];
const S = { normal: 0, kick: 1, slide: 2, dive: 3, fallen: 4, celebrate: 5, throw: 6, hold: 7, header: 8, skill: 9, tackle: 10 };

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }
const capsule = (r, l) => geo(`c${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));

function numberTexture(num, name, fg, bg) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.textAlign = 'center';
  g.font = 'bold 16px Rajdhani, Arial'; g.textBaseline = 'top';
  g.fillText(String(name || '').toUpperCase().slice(0, 12), 64, 6);
  g.font = 'bold 78px Rajdhani, Arial'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeKitMaterials(shirt, shorts, socks) {
  const m = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r, metalness: 0 });
  return { shirt: m(shirt), shorts: m(shorts), socks: m(socks), trim: m(shorts) };
}

export function createPlayer(info, kit, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN[info.skin ?? 0] || SKIN[0], roughness: 0.6 });
  const h = (info.id || info.name || '').split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0) >>> 0, 7);
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR[h % HAIR.length], roughness: 0.9 });
  const bootMat = new THREE.MeshStandardMaterial({ color: BOOTS[(h >> 3) % BOOTS.length], roughness: 0.4, metalness: 0.2 });
  const isGK = info.pos === 'GK' || opts.gk;
  const mats = kit;
  const shadow = opts.shadows !== false;
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };

  const hipY = 0.95;
  const pelvis = new THREE.Group(); pelvis.position.y = hipY; body.add(pelvis);
  // shorts
  const shorts = mesh(capsule(0.16, 0.08), mats.shorts, pelvis, 0, 0.02, 0); shorts.scale.set(1.2, 1, 0.85);
  // legs
  const legs = [];
  for (const side of [1, -1]) {
    const thigh = new THREE.Group(); thigh.position.set(side * 0.1, 0, 0); pelvis.add(thigh);
    mesh(capsule(0.085, 0.2), mats.shorts, thigh, 0, -0.1, 0);
    mesh(capsule(0.072, 0.26), skinMat, thigh, 0, -0.27, 0);
    const shin = new THREE.Group(); shin.position.y = -0.44; thigh.add(shin);
    mesh(capsule(0.063, 0.3), mats.socks, shin, 0, -0.2, 0);
    const foot = mesh(geo('foot', () => new THREE.BoxGeometry(0.1, 0.08, 0.26)), bootMat, shin, 0, -0.43, 0.06);
    legs.push({ thigh, shin, foot });
  }
  // torso
  const torso = new THREE.Group(); torso.position.y = 0.04; pelvis.add(torso);
  const chest = mesh(capsule(0.17, 0.3), mats.shirt, torso, 0, 0.3, 0); chest.scale.set(1.18, 1, 0.72);
  // back number
  const numTex = numberTexture(info.num ?? '', info.shortName || info.name?.split(' ').slice(-1)[0], opts.numColor || '#ffffff', opts.shirtHex || '#000000');
  const numMat = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.8, transparent: false });
  const back = new THREE.Mesh(geo('numplane', () => new THREE.PlaneGeometry(0.3, 0.3)), numMat);
  back.position.set(0, 0.33, -0.125); back.rotation.y = Math.PI; torso.add(back);
  // neck & head
  const headG = new THREE.Group(); headG.position.y = 0.6; torso.add(headG);
  mesh(capsule(0.05, 0.05), skinMat, headG, 0, -0.02, 0);
  const head = mesh(geo('head', () => new THREE.SphereGeometry(0.115, 16, 12)), skinMat, headG, 0, 0.12, 0.01); head.scale.set(0.95, 1.08, 1);
  const hairStyle = h % 4;
  if (hairStyle !== 3) { const hair = mesh(geo('hair' + hairStyle, () => new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, hairStyle === 0 ? 1.4 : hairStyle === 1 ? 1.1 : 1.7)), hairMat, headG, 0, 0.135, -0.005); hair.scale.set(0.98, 1.08, 1.02); }
  // arms
  const arms = [];
  for (const side of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.21, 0.5, 0); torso.add(sh);
    mesh(capsule(0.058, 0.14), mats.shirt, sh, 0, -0.1, 0);
    mesh(capsule(0.048, 0.08), isGK ? mats.shirt : skinMat, sh, 0, -0.22, 0);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    mesh(capsule(0.045, 0.2), isGK ? mats.shirt : skinMat, el, 0, -0.13, 0);
    mesh(geo(isGK ? 'glove' : 'hand', () => new THREE.SphereGeometry(isGK ? 0.07 : 0.045, 8, 6)), isGK ? mats.trim : skinMat, el, 0, -0.28, 0);
    arms.push({ sh, el });
  }
  root.userData = { body, pelvis, torso, headG, legs, arms, phase: Math.random() * 6, celebrateType: h % 3, idleT: Math.random() * 10 };
  return root;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// face = heading angle in world x-z (atan2(vz, vx))
export function animatePlayer(obj, x, z, face, speed, state, prog, extra, dt, time) {
  const u = obj.userData;
  obj.position.set(x, 0, z);
  obj.rotation.y = Math.PI / 2 - face;
  const { body, pelvis, torso, headG, legs, arms } = u;
  // reset pose
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  torso.rotation.set(0, 0, 0); headG.rotation.set(0, 0, 0);
  for (const l of legs) { l.thigh.rotation.set(0, 0, 0); l.shin.rotation.set(0, 0, 0); }
  for (const a of arms) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  const [L, R] = legs, [AL, AR] = arms;

  const runCycle = (sp) => {
    const amp = Math.min(1, sp / 8.2);
    u.phase += dt * (sp > 0.25 ? 4.2 + sp * 0.95 : 0);
    const ph = u.phase;
    const a = amp * 0.85 + (sp > 0.3 ? 0.12 : 0);
    L.thigh.rotation.x = -Math.sin(ph) * a;
    R.thigh.rotation.x = Math.sin(ph) * a;
    L.shin.rotation.x = 0.1 + a * 1.35 * Math.max(0, Math.cos(ph));
    R.shin.rotation.x = 0.1 + a * 1.35 * Math.max(0, -Math.cos(ph));
    AL.sh.rotation.x = Math.sin(ph) * a * 0.8; AR.sh.rotation.x = -Math.sin(ph) * a * 0.8;
    AL.el.rotation.x = -0.35 - a * 0.9; AR.el.rotation.x = -0.35 - a * 0.9;
    AL.sh.rotation.z = 0.08; AR.sh.rotation.z = -0.08;
    body.position.y = Math.abs(Math.cos(ph)) * 0.06 * a - 0.03 * a;
    torso.rotation.x = 0.04 + a * 0.2;
    if (sp < 0.25) { // idle breathing / weight shift
      u.idleT += dt;
      torso.rotation.x = 0.03 + Math.sin(u.idleT * 1.6) * 0.015;
      L.shin.rotation.x = 0.12; R.shin.rotation.x = 0.12; L.thigh.rotation.x = -0.05; R.thigh.rotation.x = -0.05;
      AL.sh.rotation.z = 0.12; AR.sh.rotation.z = -0.12; AL.el.rotation.x = -0.2; AR.el.rotation.x = -0.2;
      body.position.y = -0.02;
    }
  };

  switch (state) {
    case S.kick: {
      runCycle(speed * 0.5);
      const p = prog;
      const back = p < 0.3 ? p / 0.3 : 1 - clamp01((p - 0.3) / 0.25);
      const fwd = p < 0.3 ? 0 : p < 0.6 ? (p - 0.3) / 0.3 : 1 - (p - 0.6) / 0.4;
      R.thigh.rotation.x = back * 0.9 - fwd * 1.5;
      R.shin.rotation.x = back * 1.6 + (1 - fwd) * 0.2;
      L.thigh.rotation.x = -0.15; L.shin.rotation.x = 0.25;
      AL.sh.rotation.z = 0.9; AR.sh.rotation.z = -0.5; AL.sh.rotation.x = -0.4;
      torso.rotation.x = 0.1 - fwd * 0.18; torso.rotation.y = fwd * 0.25;
      break;
    }
    case S.tackle: {
      const p = Math.sin(Math.min(1, prog) * Math.PI);
      R.thigh.rotation.x = -1.1 * p; R.shin.rotation.x = 0.1; L.shin.rotation.x = 0.7 * p; L.thigh.rotation.x = 0.3 * p;
      body.position.y = -0.2 * p; torso.rotation.x = 0.35 * p; AL.sh.rotation.z = 0.7; AR.sh.rotation.z = -0.7;
      break;
    }
    case S.slide: {
      const p = clamp01(prog * 3);
      body.rotation.x = -1.15 * p; body.position.y = -0.62 * p;
      R.thigh.rotation.x = -0.6 * p; R.shin.rotation.x = 0.05;
      L.thigh.rotation.x = 0.1 * p; L.shin.rotation.x = 1.3 * p;
      AL.sh.rotation.z = 1.2 * p; AR.sh.rotation.z = -0.6 * p; AR.sh.rotation.x = 0.6 * p;
      torso.rotation.x = 0.5 * p;
      break;
    }
    case S.dive: {
      const dir = Math.sign(extra) || 1, hgt = Math.abs(extra) || 0.8;
      // world dive direction along z; convert to local side
      const localSide = Math.sign(dir * Math.cos(face)) || 1;
      const p = clamp01(prog * 2.2);
      const air = Math.sin(Math.min(1, prog * 1.6) * Math.PI);
      body.rotation.z = localSide * 1.35 * p;
      body.position.y = Math.max(0, hgt - 0.5) * air * 0.9 + air * 0.25;
      AL.sh.rotation.x = -2.9 * p; AR.sh.rotation.x = -2.9 * p;
      AL.el.rotation.x = -0.1; AR.el.rotation.x = -0.1;
      L.thigh.rotation.x = -0.2 * p; R.thigh.rotation.x = 0.1 * p; L.shin.rotation.x = 0.4 * p;
      if (prog > 0.75) { const k = (prog - 0.75) / 0.25; body.rotation.z = localSide * lerp(1.35, 1.5, k); body.position.y = lerp(body.position.y, 0.1, k); }
      break;
    }
    case S.fallen: {
      const p = prog;
      const down = p < 0.15 ? p / 0.15 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      body.rotation.x = -1.45 * down; body.position.y = -0.82 * down;
      L.shin.rotation.x = 0.8 * down; R.shin.rotation.x = 0.3 * down; L.thigh.rotation.x = -0.4 * down;
      AL.sh.rotation.z = 1.4 * down; AR.sh.rotation.z = -1.1 * down;
      break;
    }
    case S.celebrate: {
      runCycle(Math.min(speed, 5));
      if (u.celebrateType === 0) { AL.sh.rotation.x = -2.7; AR.sh.rotation.x = -2.7; AL.el.rotation.x = -0.2; AR.el.rotation.x = -0.2; body.position.y = Math.abs(Math.sin(time * 7)) * 0.35; }
      else if (u.celebrateType === 1) { AL.sh.rotation.z = 1.45; AR.sh.rotation.z = -1.45; AL.el.rotation.x = 0; AR.el.rotation.x = 0; body.rotation.z = Math.sin(time * 3) * 0.25; }
      else { // knee slide
        const k = clamp01(prog * 3);
        L.thigh.rotation.x = -0.2 * k; L.shin.rotation.x = 1.6 * k; R.thigh.rotation.x = -0.2 * k; R.shin.rotation.x = 1.6 * k;
        body.position.y = -0.42 * k; torso.rotation.x = -0.5 * k; AL.sh.rotation.x = -2.6 * k; AR.sh.rotation.x = -2.6 * k; headG.rotation.x = -0.5 * k;
      }
      break;
    }
    case S.throw: {
      const p = prog;
      const up = p < 0.4 ? p / 0.4 : 1;
      const fw = p < 0.4 ? 0 : (p - 0.4) / 0.6;
      AL.sh.rotation.x = -3.0 * up + fw * 1.6; AR.sh.rotation.x = -3.0 * up + fw * 1.6;
      AL.el.rotation.x = -0.9 * (1 - fw); AR.el.rotation.x = -0.9 * (1 - fw);
      torso.rotation.x = -0.25 * up + fw * 0.45;
      break;
    }
    case S.hold: {
      runCycle(speed);
      AL.sh.rotation.x = -1.25; AR.sh.rotation.x = -1.25; AL.sh.rotation.z = -0.25; AR.sh.rotation.z = 0.25; AL.el.rotation.x = -0.5; AR.el.rotation.x = -0.5;
      break;
    }
    case S.header: {
      const air = Math.sin(clamp01(prog) * Math.PI);
      body.position.y = air * 0.42;
      L.shin.rotation.x = 0.9 * air; R.shin.rotation.x = 0.5 * air;
      AL.sh.rotation.z = 0.9 * air; AR.sh.rotation.z = -0.9 * air; AL.sh.rotation.x = -0.6 * air; AR.sh.rotation.x = -0.6 * air;
      headG.rotation.x = prog < 0.5 ? -0.3 : 0.5; torso.rotation.x = prog < 0.5 ? -0.2 : 0.3;
      break;
    }
    case S.skill: {
      runCycle(speed);
      torso.rotation.z = Math.sin(prog * Math.PI * 2) * 0.35; body.rotation.z = Math.sin(prog * Math.PI * 2) * 0.12;
      R.thigh.rotation.z = Math.sin(prog * Math.PI) * 0.5;
      break;
    }
    default: runCycle(speed);
  }
  // keeper stance when idle
  obj.visible = state !== -1;
}

// selection ring + arrow for the controlled player
export function makeIndicator(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 3), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  arrow.rotation.x = Math.PI; arrow.position.y = 2.4; g.add(arrow);
  g.userData = { ring, arrow };
  return g;
}

export function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  spr.scale.set(2.6, 0.65, 1); spr.renderOrder = 10;
  spr.userData.set = (t, stamina = 1, col = '#00ffa3') => {
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(5,8,16,0.78)'; g.fillRect(28, 6, 200, 40);
    g.fillStyle = '#fff'; g.font = 'bold 26px Rajdhani, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 128, 24);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(40, 40, 176, 4);
    g.fillStyle = col; g.fillRect(40, 40, 176 * Math.max(0, Math.min(1, stamina)), 4);
    tex.needsUpdate = true;
  };
  spr.userData.set(text);
  return spr;
}

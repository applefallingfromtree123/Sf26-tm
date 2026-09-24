// Procedural stadium: striped pitch with accurate markings, two-tier bowl with an
// instanced animated crowd, roof with floodlight strips, LED boards, goals and nets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HL = 52.5, HW = 34, GW = 3.66, GH = 2.44;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- pitch ----------
export function makePitchTexture(renderer, opts = {}) {
  const AX = 120, AZ = 82; // metres covered
  const W = opts.hi ? 4096 : 2048, H = Math.round(W * AZ / AX);
  const c = canvas(W, H), g = c.getContext('2d');
  const sx = W / AX, sz = H / AZ;
  const X = (x) => (x + AX / 2) * sx, Z = (z) => (z + AZ / 2) * sz;
  // base
  g.fillStyle = '#2f7d32'; g.fillRect(0, 0, W, H);
  // mowing stripes (perpendicular to touchline) + subtle cross stripes
  const stripes = 22, sw = 105 / (stripes - 2);
  for (let i = -2; i < stripes + 2; i++) {
    const x0 = -HL + i * sw - sw;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.07)';
    g.fillRect(X(x0), 0, sw * sx + 1, H);
  }
  for (let j = 0; j < 12; j++) { g.fillStyle = j % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.018)'; g.fillRect(0, Z(-AZ / 2 + j * AZ / 12), W, AZ / 12 * sz + 1); }
  // speckle noise
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] = Math.max(0, d[i] + n * 0.6); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n * 0.4);
  }
  g.putImageData(img, 0, 0);
  // wear in the goalmouths and centre
  for (const [cx, cz, r] of [[-HL + 5, 0, 7], [HL - 5, 0, 7], [0, 0, 6], [-HL + 11, 0, 4], [HL - 11, 0, 4]]) {
    const gr = g.createRadialGradient(X(cx), Z(cz), 0, X(cx), Z(cz), r * sx);
    gr.addColorStop(0, 'rgba(120,110,60,0.22)'); gr.addColorStop(1, 'rgba(120,110,60,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X(cx), Z(cz), r * sx, 0, Math.PI * 2); g.fill();
  }
  // markings
  g.strokeStyle = 'rgba(248,250,245,0.93)'; g.fillStyle = 'rgba(248,250,245,0.93)';
  g.lineWidth = 0.12 * sx;
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * sx, (z1 - z0) * sz);
  rect(-HL, -HW, HL, HW);
  g.beginPath(); g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW)); g.stroke();
  const circ = (x, z, r, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.ellipse(X(x), Z(z), r * sx, r * sz, 0, a0, a1); g.stroke(); };
  const spot = (x, z, r = 0.12) => { g.beginPath(); g.ellipse(X(x), Z(z), r * sx, r * sz, 0, 0, Math.PI * 2); g.fill(); };
  circ(0, 0, 9.15); spot(0, 0, 0.15);
  for (const s of [-1, 1]) {
    const gx = s * HL;
    rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
    rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
    spot(gx - s * 11, 0);
    const a = Math.acos(5.5 / 9.15);
    if (s < 0) circ(gx + 11, 0, 9.15, -a, a); else circ(gx - 11, 0, 9.15, Math.PI - a, Math.PI + a);
    for (const cz of [-1, 1]) {
      const a0 = s < 0 ? (cz < 0 ? 0 : -Math.PI / 2) : (cz < 0 ? Math.PI / 2 : Math.PI);
      circ(gx, cz * HW, 1, a0, a0 + Math.PI / 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { tex, AX, AZ };
}

function grassDetailTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.random() * 120 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 60);
  return t;
}

function netTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ledTexture(names) {
  const c = canvas(2048, 64), g = c.getContext('2d');
  const colors = ['#00ffa3', '#ffcc00', '#00b7ff', '#ff3c5f', '#ffffff', '#b388ff'];
  const seg = 2048 / names.length;
  names.forEach((n, i) => {
    g.fillStyle = i % 2 ? '#060a18' : '#0b1430'; g.fillRect(i * seg, 0, seg, 64);
    g.fillStyle = colors[i % colors.length];
    g.font = 'bold 40px Rajdhani, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n, i * seg + seg / 2, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- crowd ----------
function crowdMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  mat.userData.uniforms = { uTime: { value: 0 }, uExcite: { value: 0.2 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.uniforms.uTime;
    sh.uniforms.uExcite = mat.userData.uniforms.uExcite;
    sh.vertexShader = 'uniform float uTime; uniform float uExcite;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
      float jump = abs(sin(uTime * (5.0 + hh * 4.0) + hh * 6.2831));
      transformed.y += jump * uExcite * (0.12 + hh * 0.3) + sin(uTime * 1.3 + hh * 20.0) * 0.02;
      transformed.x += sin(uTime * 2.0 + hh * 30.0) * 0.03 * uExcite;`);
  };
  return mat;
}
function fanGeometry() {
  const body = new THREE.BoxGeometry(0.44, 0.62, 0.28); body.translate(0, 0.31, 0);
  const head = new THREE.BoxGeometry(0.2, 0.22, 0.2); head.translate(0, 0.76, 0);
  const g = mergeGeometries([body, head]);
  return g;
}

// ---------- stadium ----------
export function buildStadium(scene, renderer, opts = {}) {
  const group = new THREE.Group(); group.name = 'stadium';
  scene.add(group);
  const quality = opts.quality ?? 1;
  const home = new THREE.Color(opts.homeColor || '#c8102e');
  const away = new THREE.Color(opts.awayColor || '#1d428a');

  // ground (outer apron)
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 220), new THREE.MeshStandardMaterial({ color: 0x1f5a24, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02; apron.receiveShadow = true;
  group.add(apron);
  // pitch
  const { tex, AX, AZ } = makePitchTexture(renderer, { hi: quality >= 1 });
  const detail = grassDetailTexture();
  const pitchMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, bumpMap: detail, bumpScale: 0.6 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(AX, AZ), pitchMat);
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
  group.add(pitch);
  // running track / concrete rim around grass
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(170, 8), rimMat); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.005, s * (AZ / 2 + 4)); a.receiveShadow = true; group.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(8, AZ + 16), rimMat); b.rotation.x = -Math.PI / 2; b.position.set(s * (AX / 2 + 4), 0.005, 0); b.receiveShadow = true; group.add(b);
  }

  // stands
  const seatMatA = new THREE.MeshStandardMaterial({ color: home.clone().multiplyScalar(0.55), roughness: 0.8 });
  const seatMatB = new THREE.MeshStandardMaterial({ color: home.clone().multiplyScalar(0.35), roughness: 0.8 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95 });
  const fanGeo = fanGeometry();
  const crowdMat = crowdMaterial();
  const fanSpots = [];
  const standGeoA = [], standGeoB = [], concreteGeo = [];
  const palette = [home, home, home, new THREE.Color(opts.homeColor2 || '#ffffff'), new THREE.Color('#1c1c1c'), new THREE.Color('#dddddd'), new THREE.Color('#2b4f8a')];
  const awayPal = [away, away, new THREE.Color(opts.awayColor2 || '#ffffff'), new THREE.Color('#222222')];

  // tier builder along local x axis (length), rows going back along +z and up
  function tier(length, rows, depth, rise, y0, z0, awayBlock) {
    const geos = { a: [], b: [], c: [] };
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * rise, z = z0 + r * depth;
      const step = new THREE.BoxGeometry(length, rise, depth); step.translate(0, y + rise / 2, z + depth / 2);
      (r % 2 ? geos.a : geos.b).push(step);
      const fill = new THREE.BoxGeometry(length, y, depth); fill.translate(0, y / 2, z + depth / 2);
      if (y > 0.01) geos.c.push(fill);
      // fans
      const spacing = 0.62;
      const n = Math.floor(length / spacing);
      for (let i = 0; i < n; i++) {
        if (Math.random() > (quality >= 1 ? 0.93 : 0.55)) continue;
        const x = -length / 2 + (i + 0.5) * spacing + (Math.random() - 0.5) * 0.12;
        const isAway = awayBlock && x > length * 0.18;
        const col = isAway ? awayPal[(Math.random() * awayPal.length) | 0] : palette[(Math.random() * palette.length) | 0];
        fanSpots.push({ x, y: y + rise, z: z + depth * 0.55, col });
      }
    }
    return geos;
  }
  function placeStand(length, lower, upper, dist, rotY, awayBlock) {
    const sub = new THREE.Group();
    const start = fanSpots.length;
    const g1 = tier(length, lower, 0.82, 0.42, 1.2, 0, awayBlock);
    const upZ = lower * 0.82 + 3.5, upY = lower * 0.42 + 1.2 + 4.2;
    const g2 = tier(length, upper, 0.8, 0.56, upY, upZ, awayBlock);
    // front wall with LED ribbon
    const wall = new THREE.BoxGeometry(length, 1.2, 0.3); wall.translate(0, 0.6, -0.15);
    const back = new THREE.BoxGeometry(length, upY + upper * 0.56 + 2, 1); back.translate(0, (upY + upper * 0.56 + 2) / 2, upZ + upper * 0.8 + 0.5);
    const under = new THREE.BoxGeometry(length, 4.2, 3.5); under.translate(0, lower * 0.42 + 1.2 + 2.1, lower * 0.82 + 1.75);
    const matrix = new THREE.Matrix4().makeRotationY(rotY).setPosition(Math.sin(rotY) * dist, 0, Math.cos(rotY) * dist);
    const tf = (arr) => arr.map(g => g.applyMatrix4(matrix));
    standGeoA.push(...tf(g1.a), ...tf(g2.a)); standGeoB.push(...tf(g1.b), ...tf(g2.b));
    concreteGeo.push(...tf(g1.c), ...tf(g2.c), ...tf([wall, back, under]));
    for (let i = start; i < fanSpots.length; i++) {
      const s = fanSpots[i]; const v = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(matrix); s.x = v.x; s.y = v.y; s.z = v.z; s.rot = rotY + Math.PI;
    }
    // LED ribbon between tiers
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.3), new THREE.MeshBasicMaterial({ map: ribbonTex, toneMapped: false }));
    ribbon.position.set(0, lower * 0.42 + 1.2 + 3.3, lower * 0.82 + 0.02);
    ribbon.rotation.y = Math.PI;
    sub.add(ribbon);
    // roof
    const roofD = upZ + upper * 0.8 + 6, roofY = upY + upper * 0.56 + 7;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, roofD), new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.6, metalness: 0.4 }));
    roof.position.set(0, roofY, roofD / 2 - 6);
    sub.add(roof);
    // floodlight strip on the roof edge
    const lights = new THREE.Mesh(new THREE.BoxGeometry(length * 0.92, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    lights.position.set(0, roofY - 0.5, -5.6);
    sub.add(lights);
    for (let i = -3; i <= 3; i++) {
      const glow = new THREE.Sprite(glowMat); glow.scale.set(14, 14, 1); glow.position.set(i * length * 0.14, roofY - 0.6, -6.2); sub.add(glow);
    }
    // supports
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, roofY, 8), concrete);
      col.position.set(i * length / 4.2, roofY / 2, roofD - 6.4); sub.add(col);
    }
    sub.applyMatrix4(matrix);
    group.add(sub);
    return { roofY };
  }
  const ribbonTex = ledTexture(['SF2027', 'NEXUS ENERGY', 'ORBIT BANK', 'VOLTA', 'SF2027', 'KAIROS AIR', 'HALO MOBILE', 'ZENITH']);
  ribbonTex.repeat.set(3, 1);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
  const rowsL = quality >= 1 ? 24 : 16, rowsU = quality >= 1 ? 20 : 12;
  placeStand(150, rowsL, rowsU, HW + 11, 0, false); // main stand (near camera, z+)
  placeStand(150, rowsL, rowsU, HW + 11, Math.PI, false); // far side
  placeStand(96, rowsL, rowsU, HL + 13, Math.PI / 2, true); // east end (away fans corner)
  placeStand(96, rowsL, rowsU, HL + 13, -Math.PI / 2, false);
  // corners
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const len = 30;
    const ang = Math.atan2(sx, sz);
    const dist = Math.hypot(HL + 13, HW + 11) * 0.86;
    placeCorner(len, ang, dist);
  }
  function placeCorner(length, rotY, dist) {
    const start = fanSpots.length;
    const g1 = tier(length, rowsL, 0.82, 0.42, 1.2, 0, false);
    const matrix = new THREE.Matrix4().makeRotationY(rotY).setPosition(Math.sin(rotY) * dist, 0, Math.cos(rotY) * dist);
    const tf = (arr) => arr.map(g => g.applyMatrix4(matrix));
    standGeoA.push(...tf(g1.a)); standGeoB.push(...tf(g1.b)); concreteGeo.push(...tf(g1.c));
    const back = new THREE.BoxGeometry(length, rowsL * 0.42 + 14, 1); back.translate(0, (rowsL * 0.42 + 14) / 2, rowsL * 0.82 + 0.5); concreteGeo.push(back.applyMatrix4(matrix));
    for (let i = start; i < fanSpots.length; i++) { const s = fanSpots[i]; const v = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(matrix); s.x = v.x; s.y = v.y; s.z = v.z; s.rot = rotY + Math.PI; }
  }
  const addMerged = (arr, mat, shadow) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr), mat); m.receiveShadow = shadow; group.add(m); };
  addMerged(standGeoA, seatMatA, false); addMerged(standGeoB, seatMatB, false); addMerged(concreteGeo, concrete, false);

  // crowd instances
  const crowd = new THREE.InstancedMesh(fanGeo, crowdMat, fanSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  fanSpots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot + (Math.random() - 0.5) * 0.3);
    const k = 0.9 + Math.random() * 0.2; sc.set(k, k, k);
    m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, sc);
    crowd.setMatrixAt(i, m4);
    crowd.setColorAt(i, s.col.clone().multiplyScalar(0.7 + Math.random() * 0.5));
  });
  crowd.instanceMatrix.needsUpdate = true;
  group.add(crowd);

  // LED ad boards around the pitch
  const adTex = ledTexture(['SF2027', 'NEXUS ENERGY', 'ORBIT BANK', 'VOLTA DRINKS', 'KAIROS AIR', 'HALO MOBILE', 'ZENITH TYRES', 'PIXELFORGE']);
  const boards = [];
  const mkBoard = (len, x, z, ry) => {
    const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(len / 60, 1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [concrete, concrete, concrete, concrete, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), concrete]);
    m.position.set(x, 0.45, z); m.rotation.y = ry; m.castShadow = false; group.add(m); boards.push(t);
  };
  mkBoard(112, 0, -(HW + 5), 0); mkBoard(112, 0, HW + 5, Math.PI);
  for (const s of [-1, 1]) { mkBoard(28, s * (HL + 5), -22, s > 0 ? -Math.PI / 2 : Math.PI / 2); mkBoard(28, s * (HL + 5), 22, s > 0 ? -Math.PI / 2 : Math.PI / 2); }

  // goals
  const goals = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
  const nt = netTexture();
  for (const s of [-1, 1]) {
    const gGroup = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.06, 0.06, GH, 12);
    for (const z of [-GW, GW]) { const p = new THREE.Mesh(post, postMat); p.position.set(s * HL, GH / 2, z); p.castShadow = true; gGroup.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GW * 2 + 0.12, 12), postMat); bar.rotation.x = Math.PI / 2; bar.position.set(s * HL, GH, 0); bar.castShadow = true; gGroup.add(bar);
    // back frame
    const depth = 2.0;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
    for (const z of [-GW, GW]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, depth, 6), frameMat); top.rotation.z = Math.PI / 2; top.position.set(s * (HL + depth / 2), GH, z); gGroup.add(top);
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GH, 6), frameMat); bk.position.set(s * (HL + depth), GH / 2, z); gGroup.add(bk);
    }
    const mkNet = (w, h, segW, segH, rx) => {
      const t = nt.clone(); t.needsUpdate = true; t.repeat.set(w / 0.13, h / 0.13);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, segW, segH), new THREE.MeshStandardMaterial({ map: t, alphaMap: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, color: 0xf2f2f2 }));
      return m;
    };
    const back = mkNet(GW * 2, GH, 20, 8); back.position.set(s * (HL + depth), GH / 2, 0); back.rotation.y = Math.PI / 2; gGroup.add(back);
    const top = mkNet(depth, GW * 2, 4, 16); top.rotation.x = Math.PI / 2; top.position.set(s * (HL + depth / 2), GH, 0); gGroup.add(top);
    for (const z of [-GW, GW]) { const side = mkNet(depth, GH, 4, 6); side.position.set(s * (HL + depth / 2), GH / 2, z); gGroup.add(side); }
    back.userData.base = back.geometry.attributes.position.array.slice();
    goals.push({ s, back, ripple: 0, hitY: 1, hitZ: 0 });
    group.add(gGroup);
  }
  // corner flags
  const flagPole = new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(flagPole, postMat); p.position.set(sx * HL, 0.75, sz * HW); p.castShadow = true; group.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat); f.position.set(sx * HL + 0.2, 1.35, sz * HW); group.add(f);
  }
  // dugouts
  const dugMat = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.25, roughness: 0.1 });
  for (const sx of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 2.2), dugMat); base.position.set(sx * 10, 0.25, HW + 7.2); group.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 2.6), glass); roof.position.set(sx * 10, 2.1, HW + 7.1); group.add(roof);
    const backW = new THREE.Mesh(new THREE.BoxGeometry(12, 2.1, 0.1), glass); backW.position.set(sx * 10, 1.05, HW + 8.3); group.add(backW);
  }

  return {
    group, crowdMat, boards, goals, pitchMat,
    update(dt, t, excite) {
      crowdMat.userData.uniforms.uTime.value = t;
      crowdMat.userData.uniforms.uExcite.value = excite;
      for (const b of boards) b.offset.x = (b.offset.x + dt * 0.04) % 1;
      ribbonTex.offset.x = (ribbonTex.offset.x - dt * 0.025) % 1;
      for (const g of goals) {
        if (g.ripple <= 0) continue;
        g.ripple = Math.max(0, g.ripple - dt);
        const pos = g.back.geometry.attributes.position; const base = g.back.userData.base;
        const amp = Math.sin((1.4 - g.ripple) * 10) * g.ripple * 0.45;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1];
          const dz = x + g.hitZ, dy = y - (g.hitY - GH / 2);
          pos.array[i * 3 + 2] = base[i * 3 + 2] + g.s * Math.abs(amp) * Math.exp(-(dz * dz + dy * dy) * 0.5);
        }
        pos.needsUpdate = true;
      }
    },
    netHit(side, y, z) { const g = goals.find(g => g.s === side); if (g) { g.ripple = 1.4; g.hitY = y; g.hitZ = z; } },
    dispose() { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
  };
}

function glowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,250,230,0.6)'); gr.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// sky dome
export function buildSky(scene, night = true) {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(night ? 0x03060f : 0x3d7cc9) }, mid: { value: new THREE.Color(night ? 0x0d1a38 : 0x8fb8e8) }, bot: { value: new THREE.Color(night ? 0x28324f : 0xd9e6f2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(bot, mid, smoothstep(-0.1, 0.08, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  let stars = null;
  if (night) {
    const n = 800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.2 + 0.25; pos[i * 3] = Math.cos(th) * Math.cos(ph) * 480; pos[i * 3 + 1] = Math.sin(ph) * 480; pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 480; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
    scene.add(stars);
  }
  return { sky, stars, dispose() { scene.remove(sky); if (stars) scene.remove(stars); } };
}

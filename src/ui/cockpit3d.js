// 3D virtual cockpit rendered with three.js on a transparent canvas layered
// over the CesiumJS world. The cockpit lives in the aircraft body frame with
// the pilot's eye at the origin, so the outside world (Cesium) and the
// interior (three.js) share one camera orientation and field of view.
// Glass displays and gauges are live CanvasTextures drawn by the avionics.
//
// three.js axes here: +x right, +y up, -z forward.

import * as THREE from "three";

const STYLE = {
  airbus: { panel: 0x3b4652, glare: 0x232a31, wall: 0x56616d, frame: 0x2e353d },
  boeing: { panel: 0x4a4744, glare: 0x262524, wall: 0x6a6560, frame: 0x34322f },
  ga: { panel: 0x2c2d30, glare: 0x1b1c1e, wall: 0x8b8277, frame: 0x6f685e },
  mil: { panel: 0x3e454c, glare: 0x22272c, wall: 0x4b535b, frame: 0x30363b },
  heli: { panel: 0x2a2c2f, glare: 0x1c1d1f, wall: 0x4a4e53, frame: 0x34383c },
  glider: { panel: 0x2a2a2a, glare: 0x151515, wall: 0xe9e6df, frame: 0xd8d4cc },
};

export class Cockpit3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 20);
    this.camera.rotation.order = "YXZ";
    this.amb = new THREE.HemisphereLight(0xdfe8f5, 0x2a2622, 0.9);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.position.set(0.3, 1, -0.5);
    this.scene.add(this.amb, this.sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.displays = {}; // name -> {canvas, tex}
    this.anim = {};
    this.enabled = false;
  }

  /** Off-screen canvas for a display, shared between the avionics and the 3D texture. */
  display(name, w = 512, h = 512) {
    if (!this.displays[name]) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.displays[name] = { canvas, ctx: canvas.getContext("2d"), tex, w, h };
    }
    return this.displays[name];
  }

  clear() {
    this.root.clear();
    this.anim = {};
    for (const d of Object.values(this.displays)) d.tex.dispose();
    this.displays = {};
  }

  mat(color, rough = 0.8, metal = 0.1) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }
  box(w, h, d, color, x, y, z, rx = 0, parent = this.root, rough = 0.85) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "number" ? this.mat(color, rough) : color);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    parent.add(m);
    return m;
  }
  /** Textured screen (self-lit). */
  screen(name, w, h, x, y, z, rx, parent = this.root, cw = 512, ch = 512) {
    const d = this.display(name, cw, ch);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.x = rx;
    const bez = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, h * 1.12, 0.02), this.mat(0x15171a, 0.6));
    bez.position.z = -0.011;
    g.add(bez);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: d.tex, toneMapped: false }));
    scr.position.z = 0.0005;
    g.add(scr);
    parent.add(g);
    return g;
  }
  /** A post between two points (window frames). */
  post(a, b, r, color) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const m = new THREE.Mesh(new THREE.BoxGeometry(r, len, r), this.mat(color, 0.7));
    m.position.copy(A.clone().add(B).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.root.add(m);
    return m;
  }
  /** Flat polygon (x,y,z points) — used for panel faces and walls. */
  slab(pts, color, thick = 0.02) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    const m = new THREE.Mesh(g, this.mat(color));
    this.root.add(m);
    return m;
  }

  build(spec) {
    this.clear();
    this.spec = spec;
    const type = spec.cockpit;
    if (type === "airliner") this.buildAirliner(spec);
    else if (type === "fighter") this.buildFighter(spec);
    else if (type === "heli") this.buildHeli(spec);
    else if (spec.cat === "glider") this.buildGlider(spec);
    else this.buildGA(spec);
  }

  // ------------------------------------------------------------ airliner flight deck
  buildAirliner(spec) {
    const airbus = spec.fbw === "airbus" || spec.maker === "Airbus" || spec.maker?.startsWith("ATR");
    const S = airbus ? STYLE.airbus : STYLE.boeing;
    const cx = 0.53; // aircraft centreline (eye is in the left seat)
    const pz = -0.9, py = -0.5; // panel centre
    const tilt = -0.28;
    // main instrument panel
    this.box(2.1, 0.46, 0.06, S.panel, cx, py, pz - 0.03, tilt);
    const dw = 0.205, dh = 0.205;
    const disp = [["pfd", -0.11], ["nd", 0.115], ["eicas", cx], ["nd", cx * 2 - 0.115], ["pfd", cx * 2 + 0.11]];
    for (const [name, x] of disp) this.screen(name, dw, dh, x, py + 0.02, pz + 0.004, tilt);
    if (spec.maker === "Airbus") this.screen("eicas2", dw * 0.95, dh * 0.95, cx, py - 0.25, pz + 0.22, -1.0);
    // glareshield + MCP/FCU
    this.box(2.2, 0.04, 0.3, S.glare, cx, py + 0.25, pz + 0.03, 0);
    this.box(2.2, 0.06, 0.03, S.glare, cx, py + 0.21, pz + 0.18, 0.25);
    this.screen("mcp", 0.56, 0.05, cx, py + 0.212, pz + 0.197, 0.25, this.root, 1024, 100);
    // pedestal with thrust levers, flap lever, speedbrake
    this.box(0.36, 0.22, 0.75, S.panel, cx, -0.66, -0.46, 0);
    this.box(0.36, 0.05, 0.7, S.glare, cx, -0.54, -0.46, 0);
    const n = Math.max(spec.eng.n, 1);
    this.anim.levers = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.position.set(cx - 0.06 + (n === 1 ? 0.06 : (0.12 * i) / (n - 1)), -0.52, -0.62);
      const handle = this.box(0.025, 0.025, 0.11, 0xe8e8e8, 0, 0.13, 0, 0, g, 0.5);
      handle.position.z = 0;
      this.box(0.012, 0.13, 0.012, 0x777777, 0, 0.065, 0, 0, g);
      this.root.add(g);
      this.anim.levers.push(g);
    }
    const flap = new THREE.Group();
    flap.position.set(cx + 0.13, -0.52, -0.5);
    this.box(0.04, 0.03, 0.03, 0xf2f2f2, 0, 0.08, 0, 0, flap, 0.5);
    this.box(0.01, 0.08, 0.01, 0x777777, 0, 0.04, 0, 0, flap);
    this.root.add(flap);
    this.anim.flap = flap;
    const sb = new THREE.Group();
    sb.position.set(cx - 0.14, -0.52, -0.55);
    this.box(0.03, 0.03, 0.04, 0x9a9a9a, 0, 0.07, 0, 0, sb, 0.5);
    this.box(0.01, 0.07, 0.01, 0x777777, 0, 0.035, 0, 0, sb);
    this.root.add(sb);
    this.anim.speedbrake = sb;
    // stick or yoke
    if (spec.fbw === "airbus") {
      const st = new THREE.Group();
      st.position.set(-0.42, -0.52, -0.28);
      this.box(0.13, 0.04, 0.2, S.panel, 0, -0.04, 0.02, 0, st);
      const grip = new THREE.Group();
      this.box(0.035, 0.14, 0.045, 0x222222, 0, 0.07, 0, 0, grip, 0.6);
      st.add(grip);
      this.root.add(st);
      this.anim.stick = grip;
    } else {
      this.anim.yoke = this.buildYoke(0, -0.5, -0.52, 0.17, 0x2b2b2b);
      this.buildYoke(cx * 2, -0.5, -0.52, 0.17, 0x2b2b2b);
    }
    // side consoles & walls
    this.box(0.12, 0.3, 1.4, S.wall, -0.72, -0.5, -0.25, 0);
    this.box(0.12, 0.3, 1.4, S.wall, cx * 2 + 0.72, -0.5, -0.25, 0);
    this.box(0.04, 0.35, 1.2, S.wall, -0.8, 0.05, 0.05, 0);
    this.box(0.04, 0.35, 1.2, S.wall, cx * 2 + 0.8, 0.05, 0.05, 0);
    // window frames: windshield bottom on glareshield, centre post, corner posts, roof
    const yb = py + 0.27, zb = pz - 0.08, yt = 0.32, zt = -0.55;
    this.post([cx, yb, zb], [cx, yt, zt], 0.05, S.frame);
    this.post([-0.62, yb, zb + 0.05], [-0.7, yt, zt + 0.15], 0.05, S.frame);
    this.post([cx * 2 + 0.62, yb, zb + 0.05], [cx * 2 + 0.7, yt, zt + 0.15], 0.05, S.frame);
    this.post([-0.82, yb - 0.04, zb + 0.6], [-0.78, yt - 0.02, zt + 0.6], 0.05, S.frame);
    this.post([cx * 2 + 0.82, yb - 0.04, zb + 0.6], [cx * 2 + 0.78, yt - 0.02, zt + 0.6], 0.05, S.frame);
    this.box(2.4, 0.06, 0.12, S.frame, cx, yt + 0.02, zt, 0.2);
    // overhead panel
    const oh = this.screen("overhead", 1.0, 0.75, cx, 0.43, -0.12, Math.PI / 2 + 0.35, this.root, 512, 384);
    oh.scale.set(1, 1, 1);
    this.box(2.4, 0.04, 1.6, S.wall, cx, 0.5, 0.25, 0);
    paintOverhead(this.display("overhead").ctx, 512, 384, airbus);
    this.display("overhead").tex.needsUpdate = true;
  }

  buildYoke(x, y, z, w, color) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.box(0.04, 0.04, 0.35, 0x303030, 0, -0.12, 0.08, 0.6, g);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.03, 0);
    this.box(w * 2, 0.03, 0.03, color, 0, 0, 0, 0, wheel, 0.5);
    this.box(0.03, 0.11, 0.035, color, -w, 0.04, 0, 0, wheel, 0.5);
    this.box(0.03, 0.11, 0.035, color, w, 0.04, 0, 0, wheel, 0.5);
    this.box(0.05, 0.05, 0.04, 0x555555, 0, 0, 0.01, 0, wheel, 0.5);
    g.add(wheel);
    this.root.add(g);
    return { column: g, wheel };
  }

  // ------------------------------------------------------------ general aviation cabin
  buildGA(spec) {
    const S = STYLE.ga;
    const cx = 0.3;
    const glass = spec.cockpit === "g1000";
    const pz = -0.74, py = -0.38;
    this.box(1.35, 0.42, 0.05, S.panel, cx, py, pz - 0.02, -0.12);
    if (glass) {
      this.screen("pfd", 0.27, 0.2, -0.02, py + 0.04, pz + 0.01, -0.12, this.root, 640, 480);
      this.screen("mfd", 0.27, 0.2, 0.33, py + 0.04, pz + 0.01, -0.12, this.root, 640, 480);
      this.screen("apstrip", 0.5, 0.035, 0.16, py - 0.12, pz + 0.025, -0.12, this.root, 1024, 72);
    } else {
      this.screen("sixpack", 0.85, 0.3, cx - 0.05, py + 0.01, pz + 0.01, -0.12, this.root, 1024, 360);
    }
    // glareshield / cowl
    this.box(1.4, 0.03, 0.18, S.glare, cx, py + 0.225, pz + 0.04, 0.05);
    // yokes
    this.anim.yoke = this.buildYoke(0, py - 0.12, pz + 0.3, 0.12, 0x222222);
    this.buildYoke(0.62, py - 0.12, pz + 0.3, 0.12, 0x222222);
    // throttle quadrant (centre)
    const thr = new THREE.Group();
    thr.position.set(cx, py - 0.15, pz + 0.12);
    this.box(0.012, 0.012, 0.12, 0x999999, 0, 0, 0.06, 0, thr);
    this.box(0.035, 0.035, 0.025, 0x111111, 0, 0, 0.12, 0, thr, 0.4);
    this.root.add(thr);
    this.anim.plunger = thr;
    // cabin walls & door frames
    this.box(0.05, 0.6, 1.4, S.wall, -0.42, -0.35, 0, 0);
    this.box(0.05, 0.6, 1.4, S.wall, 1.02, -0.35, 0, 0);
    const high = spec.model?.wing === "high";
    const yt = high ? 0.22 : 0.3;
    this.post([-0.4, py + 0.25, pz + 0.05], [-0.34, yt, -0.25], 0.05, S.frame);
    this.post([1.0, py + 0.25, pz + 0.05], [0.94, yt, -0.25], 0.05, S.frame);
    this.box(1.4, 0.04, 0.9, high ? 0x9e968a : S.frame, cx, yt + 0.02, 0.15, 0);
    if (high) this.box(1.4, 0.05, 0.3, 0x6f685e, cx, yt, -0.3, 0.3);
    // door post behind
    this.post([-0.42, -0.1, 0.25], [-0.36, yt, 0.25], 0.04, S.frame);
    this.post([1.02, -0.1, 0.25], [0.96, yt, 0.25], 0.04, S.frame);
  }

  buildFighter(spec) {
    const S = STYLE.mil;
    const pz = -0.66, py = -0.42;
    this.box(0.7, 0.3, 0.05, S.panel, 0, py, pz, -0.25);
    this.screen("nd", 0.16, 0.16, -0.19, py + 0.01, pz + 0.03, -0.25);
    this.screen("eicas", 0.16, 0.16, 0.19, py + 0.01, pz + 0.03, -0.25);
    this.screen("upfront", 0.16, 0.12, 0, py + 0.05, pz + 0.03, -0.25, this.root, 512, 384);
    this.box(0.72, 0.04, 0.26, S.glare, 0, py + 0.18, pz + 0.02, 0);
    // HUD combiner glass
    const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.13), new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
    hud.position.set(0, py + 0.3, pz + 0.06);
    hud.rotation.x = -0.4;
    this.root.add(hud);
    // side consoles
    this.box(0.18, 0.12, 0.8, S.wall, -0.38, -0.5, -0.1, 0);
    this.box(0.18, 0.12, 0.8, S.wall, 0.38, -0.5, -0.1, 0);
    // canopy bow
    this.post([-0.5, -0.3, -0.15], [-0.2, 0.36, 0.05], 0.03, S.frame);
    this.post([0.5, -0.3, -0.15], [0.2, 0.36, 0.05], 0.03, S.frame);
    this.post([-0.2, 0.36, 0.05], [0.2, 0.36, 0.05], 0.03, S.frame);
    // stick & throttle
    const st = new THREE.Group();
    st.position.set(spec.id === "f16" ? 0.33 : 0, -0.6, -0.32);
    this.box(0.035, 0.18, 0.035, 0x1d1d1d, 0, 0.09, 0, 0, st, 0.6);
    this.root.add(st);
    this.anim.stickRoot = st;
    const thr = new THREE.Group();
    thr.position.set(-0.36, -0.46, -0.2);
    this.box(0.05, 0.08, 0.06, 0x1d1d1d, 0, 0.05, 0, 0, thr, 0.6);
    this.root.add(thr);
    this.anim.fThrottle = thr;
  }

  buildHeli(spec) {
    const S = STYLE.heli;
    const pz = -0.72, py = -0.46;
    this.box(0.9, 0.3, 0.05, S.panel, -0.3, py, pz, -0.5);
    this.screen("heli", 0.85, 0.27, -0.3, py + 0.005, pz + 0.03, -0.5, this.root, 1024, 330);
    this.box(0.92, 0.02, 0.12, S.glare, -0.3, py + 0.16, pz + 0.06, -0.1);
    // bubble frame
    this.post([-0.32, py + 0.17, pz - 0.05], [-0.32, 0.5, -0.45], 0.018, S.frame);
    this.post([0.45, -0.55, -0.45], [0.42, 0.45, 0.1], 0.03, S.frame);
    this.post([-1.05, -0.55, -0.45], [-1.0, 0.45, 0.1], 0.03, S.frame);
    this.box(1.5, 0.04, 0.5, S.frame, -0.3, 0.5, 0.15, 0);
    // cyclic (between knees), collective (left)
    const cyc = new THREE.Group();
    cyc.position.set(0, -0.72, -0.25);
    this.box(0.025, 0.4, 0.025, 0x1d1d1d, 0, 0.2, 0, 0, cyc, 0.6);
    this.root.add(cyc);
    this.anim.stickRoot = cyc;
    const col = new THREE.Group();
    col.position.set(-0.3, -0.6, 0.05);
    this.box(0.03, 0.03, 0.4, 0x1d1d1d, 0, 0, -0.2, 0, col, 0.6);
    this.root.add(col);
    this.anim.collective = col;
    this.box(0.05, 0.4, 1.2, S.wall, 0.45, -0.6, 0, 0);
  }

  buildGlider(spec) {
    const S = STYLE.glider;
    const pz = -0.6, py = -0.35;
    this.box(0.62, 0.2, 0.04, S.panel, 0, py, pz, -0.35);
    this.screen("glider", 0.6, 0.18, 0, py + 0.005, pz + 0.025, -0.35, this.root, 1024, 300);
    this.box(0.6, 0.06, 0.35, S.wall, 0, -0.62, -0.3, 0);
    this.box(0.08, 0.3, 1.0, S.wall, -0.32, -0.55, 0, 0);
    this.box(0.08, 0.3, 1.0, S.wall, 0.32, -0.55, 0, 0);
    const st = new THREE.Group();
    st.position.set(0, -0.65, -0.25);
    this.box(0.025, 0.32, 0.025, 0x222222, 0, 0.16, 0, 0, st, 0.6);
    this.root.add(st);
    this.anim.stickRoot = st;
    // yaw string on the canopy
    const ys = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.09), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    ys.position.set(0, 0.06, -0.62);
    this.root.add(ys);
    this.anim.yawString = ys;
  }

  // ------------------------------------------------------------ frame update
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param vfov vertical field of view (rad)
   * @param ctl pilot controls {pitch, roll, yaw, thr, flapPos, spoiler, collective}
   * @param light 0..1 ambient level (night = low)
   */
  render(headYaw, headPitch, vfov, ctl, light = 1) {
    if (!this.enabled) return;
    const cam = this.camera;
    cam.fov = (vfov * 180) / Math.PI;
    cam.updateProjectionMatrix();
    cam.rotation.set(headPitch, -headYaw, 0);
    this.amb.intensity = 0.25 + 0.75 * light;
    this.sun.intensity = 0.2 + 1.3 * light;
    const a = this.anim;
    if (a.yoke) {
      a.yoke.wheel.rotation.z = -ctl.roll * 1.2;
      a.yoke.column.position.z = (a.yoke.z0 ??= a.yoke.column.position.z) + ctl.pitch * 0.09;
    }
    if (a.stick) {
      a.stick.rotation.x = -ctl.pitch * 0.35;
      a.stick.rotation.z = -ctl.roll * 0.35;
    }
    if (a.stickRoot) {
      a.stickRoot.rotation.x = -ctl.pitch * 0.3;
      a.stickRoot.rotation.z = -ctl.roll * 0.3;
    }
    if (a.levers) a.levers.forEach((g, i) => (g.rotation.x = -0.6 + (ctl.thr[i] ?? ctl.thr[0] ?? 0) * 1.0));
    if (a.plunger) a.plunger.position.z = (a.pz0 ??= a.plunger.position.z) - (ctl.thr[0] ?? 0) * 0.07;
    if (a.fThrottle) a.fThrottle.position.z = -0.12 - (ctl.thr[0] ?? 0) * 0.15;
    if (a.flap) a.flap.rotation.x = -0.5 + ctl.flapPos * 1.0;
    if (a.speedbrake) a.speedbrake.rotation.x = -ctl.spoiler * 0.8;
    if (a.collective) a.collective.rotation.x = (ctl.collective ?? 0) * 0.35;
    if (a.yawString) a.yawString.rotation.y = Math.max(-0.8, Math.min(0.8, (ctl.beta ?? 0) * 6));
    this.renderer.render(this.scene, cam);
  }

  /** Mark display textures dirty after the avionics have drawn into them. */
  flush() {
    for (const d of Object.values(this.displays)) d.tex.needsUpdate = true;
  }
}

function paintOverhead(g, W, H, airbus) {
  g.fillStyle = airbus ? "#3b4652" : "#4a4744";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  const cols = 6, rows = 5;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = 8 + c * (W - 16) / cols, y = 8 + r * (H - 16) / rows;
      const w = (W - 16) / cols - 8, h = (H - 16) / rows - 8;
      g.strokeRect(x, y, w, h);
      for (let k = 0; k < 3; k++) {
        const bx = x + 8 + k * (w - 16) / 3, by = y + h * 0.35;
        g.fillStyle = "#1b1d20";
        g.fillRect(bx, by, (w - 16) / 3 - 6, h * 0.4);
        if ((c * 7 + r * 3 + k) % 5 === 0) {
          g.fillStyle = (c + r + k) % 2 ? "#ffb000" : "#2ee6ff";
          g.fillRect(bx + 3, by + h * 0.28, (w - 16) / 3 - 12, 3);
        }
      }
    }
  }
  g.fillStyle = "#c9d2dc";
  g.font = "11px 'B612 Mono', monospace";
  const lbl = airbus ? ["ADIRS", "ELEC", "HYD", "FUEL", "AIR COND", "ANTI ICE"] : ["IRS", "ELECTRICAL", "HYDRAULIC", "FUEL", "BLEED AIR", "LIGHTS"];
  lbl.forEach((t, i) => g.fillText(t, 14 + i * (W - 16) / cols, 14));
}

// Hangar preview: turntable rendering of the generated aircraft model and
// livery for the aircraft / spec page.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildAircraftGeometry } from "../world/model.js";

export class Hangar {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 10, 7);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    this.floor = floor;
    this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.loader = new GLTFLoader();
    this.angle = 0.7;
    this.elev = 0.25;
    this.dragging = false;
    canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lx = e.clientX; this.ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointerup", () => (this.dragging = false));
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.angle -= (e.clientX - this.lx) * 0.01;
      this.elev = Math.max(0.02, Math.min(1.2, this.elev + (e.clientY - this.ly) * 0.005));
      this.lx = e.clientX; this.ly = e.clientY;
    });
    this.running = false;
  }

  async show(spec, cgHeight, livery) {
    const glb = buildAircraftGeometry(spec, cgHeight, livery);
    const gltf = await this.loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
    this.holder.clear();
    const obj = gltf.scene;
    // model axes x fwd, y left, z up -> three (y up)
    obj.rotation.x = -Math.PI / 2;
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material.side = THREE.DoubleSide;
        if (o.material.map) o.material.map.anisotropy = 8;
      }
    });
    this.holder.add(obj);
    this.holder.position.y = cgHeight;
    const size = Math.max(spec.L, spec.b);
    this.dist = size * 1.3;
    this.floor.scale.setScalar(size * 0.9);
    this.target = new THREE.Vector3(0, cgHeight * 0.8, 0);
    if (!this.running) {
      this.running = true;
      const tick = () => {
        if (!this.running) return;
        this.render();
        requestAnimationFrame(tick);
      };
      tick();
    }
  }

  render() {
    const c = this.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * this.renderer.getPixelRatio())) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.dragging) this.angle += 0.003;
    const d = this.dist || 30;
    this.camera.position.set(Math.cos(this.angle) * Math.cos(this.elev) * d, Math.sin(this.elev) * d + (this.target?.y || 0), Math.sin(this.angle) * Math.cos(this.elev) * d);
    this.camera.lookAt(this.target || new THREE.Vector3());
    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    this.running = false;
  }
}

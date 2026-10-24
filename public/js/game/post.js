// "Ultra" post-processing chain: MSAA HDR render -> ground-truth ambient occlusion ->
// depth of field (replays / close cameras) -> bloom on floodlights and highlights ->
// broadcast colour grade (contrast, saturation, vignette, chromatic fringe, grain) -> tone map.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.32 }, uGrain: { value: 0.035 }, uCA: { value: 0.0016 },
    uContrast: { value: 1.14 }, uSaturation: { value: 1.03 }, uLift: { value: new THREE.Vector3(0.0, 0.004, 0.012) },
    uGain: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uVignette, uGrain, uCA, uContrast, uSaturation; uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // lens chromatic fringe grows toward the frame edge
      vec2 off = d * uCA * (0.4 + r2 * 4.0);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // HDR-space grade (tone mapping happens afterwards in OutputPass)
      c = c * uGain + uLift;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.18) * uContrast + 0.18;
      c = max(c, 0.0);
      // optical vignette
      c *= mix(1.0, smoothstep(0.85, 0.18, sqrt(r2) * 1.25), uVignette);
      // sensor grain (luma weighted)
      float g = hash(vUv * uRes + fract(uTime * 37.0) * 91.7) - 0.5;
      c += g * uGrain * (0.35 + l * 0.65);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  constructor(gl, scene, camera) {
    this.gl = gl; this.scene = scene; this.camera = camera;
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(gl, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1.0 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.ao);
    this.dof = new BokehPass(scene, camera, { focus: 20, aperture: 0.00045, maxblur: 0.005 });
    this.dof.enabled = false;
    this.composer.addPass(this.dof);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.focusDist = 20;
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.gl.getPixelRatio());
    this.composer.setSize(w, h);
    const s = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.set(s.x, s.y);
  }
  setNight(night) {
    this.bloom.strength = night ? 0.3 : 0.18;
    this.bloom.threshold = night ? 1.0 : 1.1;
    const u = this.grade.uniforms;
    u.uLift.value.set(night ? 0.0 : 0.004, night ? 0.004 : 0.003, night ? 0.012 : 0.0);
    u.uGain.value.set(night ? 1.02 : 1.03, 1.0, night ? 0.97 : 0.95);
  }
  // focus: world distance to keep sharp (null disables depth of field)
  render(dt, time, focus = null) {
    this.grade.uniforms.uTime.value = time;
    if (focus) {
      this.focusDist += (focus - this.focusDist) * Math.min(1, dt * 6);
      this.dof.enabled = true;
      this.dof.uniforms.focus.value = this.focusDist;
    } else this.dof.enabled = false;
    this.composer.render(dt);
  }
}

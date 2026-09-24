// Synthesised stadium audio (no asset files): crowd bed, cheers, whistles, kicks, net.
export class GameAudio {
  constructor() { this.ctx = null; this.volume = 0.7; this.crowdLevel = 0.18; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
    // noise buffers
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown
    this.brown = buf;
    const wb = this.ctx.createBuffer(1, len, this.ctx.sampleRate), wd = wb.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wb;
    // crowd bed
    const src = this.ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0;
    src.connect(bp).connect(this.crowdGain).connect(this.master); src.start();
    // chant layer (low modulated)
    const src2 = this.ctx.createBufferSource(); src2.buffer = this.white; src2.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 420; lp.Q.value = 3;
    this.chantGain = this.ctx.createGain(); this.chantGain.gain.value = 0;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 1.6; const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(this.chantGain.gain); lfo.start();
    src2.connect(lp).connect(this.chantGain).connect(this.master); src2.start();
    return true;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setCrowd(level, chant = 0.03) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(level, t, 0.6);
    this.chantGain.gain.setTargetAtTime(chant, t, 1.0);
  }
  noiseBurst(freq, q, peak, attack, decay, type = 'bandpass', white = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = white ? this.white : this.brown;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + attack + decay + 0.1);
  }
  cheer(big = true) { this.noiseBurst(900, 0.5, big ? 0.9 : 0.4, big ? 0.35 : 0.2, big ? 5 : 2); this.noiseBurst(2200, 0.8, big ? 0.3 : 0.15, 0.4, big ? 4 : 1.5); }
  ooh() { this.noiseBurst(500, 1.2, 0.45, 0.25, 1.6); }
  groan() { this.noiseBurst(300, 1.5, 0.3, 0.2, 1.3); }
  net() { this.noiseBurst(3000, 0.7, 0.25, 0.01, 0.35, 'highpass'); }
  kick(power = 15) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const g = this.ctx.createGain(); const v = Math.min(0.9, 0.15 + power / 40);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
    this.noiseBurst(1800, 1, v * 0.35, 0.002, 0.04);
  }
  whistle(n = 1, long = false) {
    if (!this.ctx) return;
    let t = this.ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const dur = long && i === n - 1 ? 1.1 : 0.32;
      for (const f of [2950, 3150]) {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const vib = this.ctx.createOscillator(); vib.frequency.value = 38; const vg = this.ctx.createGain(); vg.gain.value = 90;
        vib.connect(vg).connect(o.frequency);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
      }
      t += dur + 0.12;
    }
  }
}

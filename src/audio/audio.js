// Synthesised cockpit audio (WebAudio): engine/prop/rotor sound, wind, rolling
// noise, stall horn / stick shaker, overspeed clacker, AP disconnect, master
// caution chimes, and GPWS / altitude callouts through speech synthesis.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.lastCallout = null;
    this.spoken = new Set();
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + 0.03 * w; // pinkish
      d[i] = w * 0.5 + b0 * 3;
    }
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    // jet: filtered roar + fan whine
    this.jetRoarF = ctx.createBiquadFilter();
    this.jetRoarF.type = "lowpass";
    this.jetRoarG = ctx.createGain();
    noise().connect(this.jetRoarF).connect(this.jetRoarG).connect(this.master);
    this.whine = ctx.createOscillator();
    this.whine.type = "sawtooth";
    this.whineF = ctx.createBiquadFilter();
    this.whineF.type = "bandpass";
    this.whineF.Q.value = 8;
    this.whineG = ctx.createGain();
    this.whine.connect(this.whineF).connect(this.whineG).connect(this.master);
    this.whine.start();
    // prop / piston: pulsed buzz
    this.prop = ctx.createOscillator();
    this.prop.type = "sawtooth";
    this.propF = ctx.createBiquadFilter();
    this.propF.type = "lowpass";
    this.propF.frequency.value = 600;
    this.propG = ctx.createGain();
    this.prop.connect(this.propF).connect(this.propG).connect(this.master);
    this.prop.start();
    this.propAM = ctx.createOscillator();
    this.propAMG = ctx.createGain();
    this.propAM.connect(this.propAMG).connect(this.propG.gain);
    this.propAM.start();
    // wind
    this.windF = ctx.createBiquadFilter();
    this.windF.type = "bandpass";
    this.windF.Q.value = 0.6;
    this.windG = ctx.createGain();
    noise().connect(this.windF).connect(this.windG).connect(this.master);
    // rumble
    this.rumbleF = ctx.createBiquadFilter();
    this.rumbleF.type = "lowpass";
    this.rumbleF.frequency.value = 120;
    this.rumbleG = ctx.createGain();
    noise().connect(this.rumbleF).connect(this.rumbleG).connect(this.master);
    // warnings
    this.horn = ctx.createOscillator();
    this.horn.type = "square";
    this.horn.frequency.value = 1500;
    this.hornG = ctx.createGain();
    this.hornG.gain.value = 0;
    this.horn.connect(this.hornG).connect(this.master);
    this.horn.start();
    this.shaker = ctx.createOscillator();
    this.shaker.type = "square";
    this.shaker.frequency.value = 22;
    this.shakerG = ctx.createGain();
    this.shakerG.gain.value = 0;
    this.shaker.connect(this.shakerG).connect(this.master);
    this.shaker.start();
    for (const g of [this.jetRoarG, this.whineG, this.propG, this.windG, this.rumbleG]) g.gain.value = 0;
  }

  resume() {
    this.start();
    this.ctx?.resume?.();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  update(fm, S, view, paused) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(paused || !Number.isFinite(v) ? 0 : v, now, tc);
    const inside = view === "cockpit" ? 0.55 : 1;
    const type = fm.spec.eng.type;
    let jet = 0, n1 = 0, prop = 0, rpm = 0;
    for (const e of fm.engines) {
      if (type === "turbofan" || type === "turbojet") {
        jet = Math.max(jet, e.n1 / 100);
        n1 = Math.max(n1, e.n1);
      } else {
        prop = Math.max(prop, e.running ? 0.35 + e.power / (fm.spec.eng.kw * 1000) * 0.65 : e.n1 / 200);
        rpm = Math.max(rpm, e.rpm || e.n1 * 20);
      }
    }
    if (fm.heli) {
      prop = (fm.rotorE || 0) * 0.8;
      rpm = (fm.rotorE || 0) * 390;
    }
    const ab = Math.max(0, ...fm.engines.map((e) => e.ab || 0));
    set(this.jetRoarF.frequency, 200 + jet * 1800 + ab * 800);
    set(this.jetRoarG.gain, (jet * jet * 0.35 + ab * 0.3) * inside);
    set(this.whine.frequency, 300 + n1 * 38);
    set(this.whineF.frequency, 600 + n1 * 60);
    set(this.whineG.gain, jet > 0.05 ? 0.03 * inside * (0.4 + jet) : 0);
    const blades = fm.heli ? 4 : 3;
    set(this.prop.frequency, Math.max(20, (rpm / 60) * blades * (fm.heli ? 0.5 : 1)));
    set(this.propAM.frequency, fm.heli ? (rpm / 60) * 2 : (rpm / 60) * 0.5);
    set(this.propAMG.gain, fm.heli ? 0.12 * prop : 0.03 * prop);
    set(this.propF.frequency, 300 + prop * 1500);
    set(this.propG.gain, prop * 0.16 * inside);
    const tas = S.t.tas || 0;
    set(this.windF.frequency, 300 + tas * 8);
    set(this.windG.gain, Math.min(0.25, (tas / 250) ** 2 * 0.25) * (view === "cockpit" ? 0.6 : 1));
    const gs = S.t.gs || 0;
    set(this.rumbleG.gain, fm.onGround ? Math.min(0.4, gs / 60) * 0.5 : 0);
    // stall warning: GA horn, transport stick shaker
    const transport = ["narrow", "wide", "bizjet", "regional-tp", "supersonic"].includes(fm.spec.cat);
    set(this.hornG.gain, S.stallWarn && !transport ? 0.08 : 0, 0.02);
    set(this.shakerG.gain, S.stallWarn && transport ? 0.25 : 0, 0.02);
  }

  /** Short synthesized chimes. kind: caution | warning | apdisc | click | clacker */
  chime(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const tone = (f, start, dur, type = "sine", vol = 0.15) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(vol, t0 + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g).connect(this.master);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.05);
    };
    if (kind === "caution") tone(880, 0, 0.35), tone(880, 0.4, 0.35);
    else if (kind === "warning") for (let k = 0; k < 3; k++) tone(1000, k * 0.25, 0.2, "square", 0.08);
    else if (kind === "apdisc") for (let k = 0; k < 4; k++) { tone(1320, k * 0.36, 0.12, "triangle"); tone(990, k * 0.36 + 0.12, 0.12, "triangle"); tone(1180, k * 0.36 + 0.24, 0.12, "triangle"); }
    else if (kind === "click") tone(2000, 0, 0.03, "square", 0.05);
    else if (kind === "clacker") for (let k = 0; k < 6; k++) tone(400, k * 0.12, 0.05, "square", 0.1);
    else if (kind === "marker") tone(1300, 0, 0.1, "sine", 0.06);
  }

  say(text, force = false) {
    if (!this.enabled || !window.speechSynthesis) return;
    if (!force && this.lastCallout === text) return;
    this.lastCallout = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.15;
    u.pitch = 0.8;
    u.volume = Math.min(1, this.volume + 0.2);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /** Radio altitude callouts (Boeing/Airbus style) during approach. */
  callouts(raFt, vsFpm, onGround, transport, minimums) {
    if (onGround) {
      this.spoken.clear();
      return;
    }
    if (raFt > 2600) {
      this.spoken.clear();
      return;
    }
    if (vsFpm > -100) return;
    const marks = transport ? [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10] : [500, 100, 50, 20, 10];
    for (const m of marks) {
      if (raFt <= m && !this.spoken.has(m)) {
        this.spoken.add(m);
        for (const lower of marks) if (lower > m) this.spoken.add(lower);
        const words = { 2500: "Twenty five hundred", 1000: "One thousand", 500: "Five hundred", 400: "Four hundred", 300: "Three hundred", 200: "Two hundred", 100: "One hundred", 50: "Fifty", 40: "Forty", 30: "Thirty", 20: "Twenty", 10: "Ten" };
        this.say(words[m], true);
        break;
      }
    }
    if (minimums && raFt <= minimums + 100 && !this.spoken.has("app")) {
      this.spoken.add("app");
    }
  }
}

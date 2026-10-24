// Autopilot / radio control strip (MCP, FCU, GMC 710, KAP 140 depending on type).
// Knobs: mouse wheel or drag up/down; click left/right half to step; Shift = ×10.
import { DEG, FT } from "../sim/math.js";

export class APBar {
  constructor(el, app) {
    this.el = el;
    this.app = app;
  }

  build(spec, fcs) {
    const el = this.el;
    el.innerHTML = "";
    this.fcs = fcs;
    this.items = [];
    const grp = () => {
      const g = document.createElement("div");
      g.className = "apgrp";
      el.appendChild(g);
      return g;
    };
    const knob = (g, label, get, step, apply, cls = "") => {
      const k = document.createElement("div");
      k.className = "knob";
      k.innerHTML = `<span class="lbl">${label}</span><span class="val ${cls}"></span>`;
      const val = k.querySelector(".val");
      const change = (n, big) => apply(n * (big ? 10 : 1) * step);
      k.addEventListener("wheel", (e) => { e.preventDefault(); change(e.deltaY < 0 ? 1 : -1, e.shiftKey); }, { passive: false });
      k.addEventListener("click", (e) => {
        const r = val.getBoundingClientRect();
        change(e.clientX > r.left + r.width / 2 ? 1 : -1, e.shiftKey);
      });
      g.appendChild(k);
      this.items.push(() => (val.textContent = get()));
      return k;
    };
    const btn = (g, label, fn, state) => {
      const b = document.createElement("button");
      b.className = "apbtn";
      b.textContent = label;
      b.addEventListener("click", () => { fn(); this.app.audio.chime("click"); });
      g.appendChild(b);
      if (state) this.items.push(() => {
        const s = state();
        b.classList.toggle("on", s === true || s === "on");
        b.classList.toggle("arm", s === "arm");
      });
      return b;
    };
    const ap = fcs.ap;
    const A = this.app;
    const kind = spec.cockpit;
    const hasAP = fcs.hasAP;

    if (hasAP) {
      const g1 = grp();
      if (kind === "airliner" || kind === "fighter") {
        knob(g1, ap.useMach ? "MACH" : "SPD", () => (ap.useMach ? ap.mach.toFixed(2) : String(Math.round(ap.spd))), 1, (d) => (ap.useMach ? (ap.mach = Math.max(0.3, Math.min(2.2, ap.mach + d / 100))) : (ap.spd = Math.max(60, Math.min(600, ap.spd + d)))));
        btn(g1, "SPD/M", () => { ap.useMach = !ap.useMach; if (ap.useMach) ap.mach = Math.round((A.fm.telemetry.mach || 0.78) * 100) / 100; }, () => ap.useMach);
      } else knob(g1, "SPD", () => String(Math.round(ap.spd)), 1, (d) => (ap.spd = Math.max(40, ap.spd + d)));
      knob(g1, "HDG", () => String(((Math.round(ap.hdg / DEG) % 360) + 360) % 360).padStart(3, "0"), 1, (d) => (ap.hdg = ((ap.hdg / DEG + d + 360) % 360) * DEG));
      knob(g1, "ALT", () => String(Math.round(ap.alt / FT / 100) * 100), 100, (d) => (ap.alt = Math.max(0, ap.alt + d * FT)));
      knob(g1, "V/S", () => String(Math.round((ap.vs / FT) * 60 / 100) * 100), 100, (d) => (ap.vs = ap.vs + (d * FT) / 60), "cyan");
      const g2 = grp();
      btn(g2, "AP", () => A.toggleAP(), () => ap.master);
      if (fcs.hasAT) btn(g2, kind === "airliner" ? "A/THR" : "AT", () => A.toggleAT(), () => ap.at);
      btn(g2, "FD", () => (ap.fd = !ap.fd), () => ap.fd);
      btn(g2, "HDG", () => A.apMode("HDG"), () => ap.lat === "HDG");
      btn(g2, kind === "airliner" ? "LNAV" : "NAV", () => A.apMode("NAV"), () => ap.lat === "NAV");
      btn(g2, "LOC", () => A.apMode("LOC"), () => (ap.lat === "LOC" ? true : ap.armLoc ? "arm" : false));
      btn(g2, "APPR", () => A.apMode("APPR"), () => (ap.vert === "GS" ? true : ap.armGs ? "arm" : false));
      btn(g2, "ALT", () => A.apMode("ALT"), () => ap.vert === "ALT");
      btn(g2, "V/S", () => A.apMode("VS"), () => ap.vert === "VS");
      btn(g2, kind === "airliner" ? "LVL CHG" : "FLC", () => A.apMode("FLC"), () => ap.vert === "FLC");
    }
    const g3 = grp();
    knob(g3, "BARO", () => A.baroText(), 1, (d) => A.adjustBaro(d));
    btn(g3, "STD", () => A.setStd(), () => A.baroStd);
    knob(g3, "NAV1", () => (A.radios.nav1 ? A.radios.nav1.toFixed(2) : "---.--"), 0.05, (d) => A.tuneNav(d), "cyan");
    knob(g3, "CRS", () => String(Math.round(A.radios.obs / DEG)).padStart(3, "0"), 1, (d) => (A.radios.obs = ((A.radios.obs / DEG + d + 360) % 360) * DEG), "cyan");
    if (kind === "airliner" || kind === "g1000") {
      knob(g3, "ND RNG", () => `${A.ndRange}`, 1, (d) => A.ndZoom(d > 0 ? 1 : -1), "cyan");
      knob(g3, "MINS", () => String(A.minimums), 10, (d) => (A.minimums = Math.max(0, A.minimums + d)), "cyan");
    }
    const g4 = grp();
    const lever = (label, get) => {
      const l = document.createElement("div");
      l.className = "lever";
      l.innerHTML = `<span>${label}</span><b></b>`;
      g4.appendChild(l);
      this.items.push(() => (l.querySelector("b").textContent = get()));
    };
    lever("THR", () => `${Math.round(A.thrPct())}%`);
    lever("FLAPS", () => spec.flaps[A.fm.ctl.flap][0]);
    if (spec.gear.retract) lever("GEAR", () => (A.fm.ctl.gear ? "DN" : "UP"));
    lever("BRK", () => (A.fm.ctl.park ? "PARK" : A.fm.ctl.brakeL > 0.1 ? "ON" : "OFF"));
    if (spec.eng.type === "piston") lever("MIX", () => (A.fm.ctl.autoMix ? "AUTO" : `${Math.round(A.fm.ctl.mixture * 100)}%`));
    const g5 = grp();
    btn(g5, "VIEW", () => A.cycleView());
    btn(g5, "2D/3D", () => A.toggleCockpitMode(), () => A.cockpitMode === "3d");
    btn(g5, "CHK", () => A.toggleChecklist());
    btn(g5, "ENG", () => A.autostart());
  }

  update() {
    if (this.items) for (const f of this.items) f();
  }
}

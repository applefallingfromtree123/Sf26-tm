// Glareshield autopilot panel faces for the 3D cockpit (Boeing MCP / Airbus FCU / Garmin GMC).
import { txt, rect } from "./common.js";

export function drawMCP(ctx, W, H, S) {
  const airbus = S.spec.fbw === "airbus";
  ctx.fillStyle = airbus ? "#2b333c" : "#3a3835";
  ctx.fillRect(0, 0, W, H);
  const ap = S.ap;
  const win = (x, w, label, value, active) => {
    txt(ctx, label, x + w / 2, H * 0.18, "#d8dee6", H * 0.16);
    rect(ctx, x, H * 0.32, w, H * 0.5, "#000", "#050505", 2);
    txt(ctx, value, x + w / 2, H * 0.57, airbus ? "#ffb000" : "#ffd24d", H * 0.36);
    if (active != null) rect(ctx, x + w * 0.35, H * 0.86, w * 0.3, H * 0.08, null, active ? "#3dff6e" : "#333");
  };
  const spd = ap.useMach ? `.${String(Math.round(ap.mach * 1000)).padStart(3, "0")}` : String(Math.round(ap.spd)).padStart(3, " ");
  const hdg = String(((Math.round((ap.hdg * 180) / Math.PI) % 360) + 360) % 360).padStart(3, "0");
  const alt = String(Math.round(ap.alt / 0.3048 / 100) * 100).padStart(5, "0");
  const vs = ap.vert === "VS" ? `${ap.vs >= 0 ? "+" : "-"}${String(Math.abs(Math.round((ap.vs / 0.3048) * 60 / 100) * 100)).padStart(4, "0")}` : airbus ? "-----" : "     ";
  const u = W / 12;
  win(u * 0.3, u * 1.2, ap.useMach ? "MACH" : "SPD", spd, ap.at);
  win(u * 2.2, u * 1.2, "HDG", hdg, ap.lat === "HDG");
  win(u * 5.0, u * 1.6, "ALT", alt, ap.vert === "ALT");
  win(u * 7.3, u * 1.4, "V/S", vs, ap.vert === "VS");
  const btn = (x, label, on) => {
    rect(ctx, x, H * 0.38, u * 0.62, H * 0.38, "#111", on ? "#1f3a24" : "#22262b", 1.5);
    txt(ctx, label, x + u * 0.31, H * 0.57, on ? "#3dff6e" : "#c8ced6", H * 0.18);
  };
  btn(u * 3.6, "LOC", ap.lat === "LOC" || ap.armLoc);
  btn(u * 4.25, "APPR", ap.armGs || ap.vert === "GS");
  btn(u * 9.0, "AP", ap.master);
  btn(u * 9.65, "A/THR", ap.at);
  btn(u * 10.3, "NAV", ap.lat === "NAV");
  btn(u * 10.95, "FLC", ap.vert === "FLC");
}

export function drawGarminAP(ctx, W, H, S) {
  ctx.fillStyle = "#1b1c1e";
  ctx.fillRect(0, 0, W, H);
  const ap = S.ap;
  const items = [["AP", ap.master], ["FD", ap.fd], ["HDG", ap.lat === "HDG"], ["NAV", ap.lat === "NAV" || ap.lat === "LOC"], ["APR", ap.armGs || ap.vert === "GS"], ["ALT", ap.vert === "ALT"], ["VS", ap.vert === "VS"], ["FLC", ap.vert === "FLC"]];
  const w = W / items.length;
  items.forEach(([l, on], i) => {
    rect(ctx, i * w + 6, 6, w - 12, H - 12, "#000", "#2c2e31", 2);
    txt(ctx, l, i * w + w / 2, H / 2, on ? "#3dff6e" : "#d8dee6", H * 0.42);
  });
}

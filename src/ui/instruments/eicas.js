// Engine indication and crew alerting (EICAS / ECAM / Garmin EIS).
import { COL, txt, line, rect, poly, engArc } from "./common.js";

export function drawEICAS(ctx, X, Y, W, H, S) {
  ctx.fillStyle = "#000";
  ctx.fillRect(X, Y, W, H);
  const eng = S.engines;
  const n = eng.length;
  const type = S.engType;
  const cw = W / Math.max(n, 1);
  const r = Math.min(cw * 0.36, H * 0.13, W * 0.17);
  if (type === "turbofan" || type === "turbojet") {
    eng.forEach((e, i) => {
      const cx = X + cw * (i + 0.5);
      engArc(ctx, cx, Y + r + 14, r, e.n1, 100, 104, i === 0 ? "N1" : "", e.n1.toFixed(1), S.thrCmd?.[i] != null ? S.idleN1[i] + S.thrCmd[i] * (100 - S.idleN1[i]) : null);
      engArc(ctx, cx, Y + r * 3.2 + 18, r * 0.8, e.egt, 1100, 1060, i === 0 ? "EGT" : "", String(Math.round(e.egt)));
      txt(ctx, `${e.n2.toFixed(1)}`, cx, Y + r * 4.5 + 20, COL.green, 13);
      txt(ctx, `${Math.round(e.ff * 3600)}`, cx, Y + r * 4.5 + 38, COL.green, 13);
      if (e.ab > 0.02) txt(ctx, "A/B", cx, Y + 8, COL.amber, 12);
      if (e.starting) txt(ctx, "START", cx, Y + r * 2 + 18, COL.cyan, 12);
      if (!e.running && !e.starting) txt(ctx, "SHUT", cx, Y + r * 2 + 18, COL.amber, 12);
      if (e.reverse) txt(ctx, "REV", cx, Y + 8, COL.green, 13);
    });
    txt(ctx, "N2 %", X + W / 2, Y + r * 4.5 + 20, COL.cyan, 11);
    txt(ctx, "FF KG/H", X + W / 2, Y + r * 4.5 + 38, COL.cyan, 11);
  } else if (type === "turboprop" || type === "piston" || type === "turboshaft") {
    eng.forEach((e, i) => {
      const cx = X + cw * (i + 0.5);
      if (type === "piston") {
        engArc(ctx, cx, Y + r + 14, r, e.rpm, 2800, 2700, i === 0 ? "RPM" : "", String(Math.round(e.rpm)));
        engArc(ctx, cx, Y + r * 3.2 + 18, r * 0.8, e.power / 1000, S.enginePowerKw * 1.05, S.enginePowerKw, i === 0 ? "PWR kW" : "", String(Math.round(e.power / 1000)));
        txt(ctx, `EGT ${Math.round(e.egt)}`, cx, Y + r * 4.5 + 20, COL.green, 12);
        txt(ctx, `OIL ${Math.round(e.oilP)} PSI`, cx, Y + r * 4.5 + 36, COL.green, 12);
      } else {
        engArc(ctx, cx, Y + r + 14, r, e.torque, 110, 100, i === 0 ? "TRQ %" : "", e.torque.toFixed(0));
        engArc(ctx, cx, Y + r * 3.2 + 18, r * 0.8, e.egt, 900, 800, i === 0 ? "ITT" : "", String(Math.round(e.egt)));
        txt(ctx, `NG ${e.n2.toFixed(1)}  NP ${Math.round(e.rpm)}`, cx, Y + r * 4.5 + 20, COL.green, 12);
        txt(ctx, `OIL ${Math.round(e.oilP)}`, cx, Y + r * 4.5 + 36, COL.green, 12);
      }
      txt(ctx, `FF ${Math.round(e.ff * 3600)} KG/H`, cx, Y + r * 4.5 + 52, COL.green, 12);
      if (e.starting) txt(ctx, "START", cx, Y + 8, COL.cyan, 12);
      if (!e.running && !e.starting) txt(ctx, "OFF", cx, Y + 8, COL.amber, 12);
    });
  }

  // ---- lower: fuel, weight, config
  const ly = Y + H * 0.64;
  line(ctx, X + 6, ly - 8, X + W - 6, ly - 8, COL.grey, 1);
  txt(ctx, "FOB", X + 10, ly + 6, COL.cyan, 12, "left");
  txt(ctx, `${Math.round(S.fuelKg)} KG`, X + 50, ly + 6, S.fuelKg < S.fuelCap * 0.08 ? COL.amber : COL.green, 14, "left");
  txt(ctx, "GW", X + 10, ly + 24, COL.cyan, 12, "left");
  txt(ctx, `${(S.grossKg / 1000).toFixed(S.grossKg > 10000 ? 1 : 2)} T`, X + 50, ly + 24, COL.green, 14, "left");
  txt(ctx, "TRIM", X + 10, ly + 42, COL.cyan, 12, "left");
  txt(ctx, `${S.trimPct >= 0 ? "UP" : "DN"} ${Math.abs(S.trimPct).toFixed(1)}`, X + 50, ly + 42, COL.green, 13, "left");

  // flaps
  const fx = X + W * 0.56;
  txt(ctx, "FLAPS", fx, ly + 6, COL.cyan, 12, "left");
  txt(ctx, S.flapLabel, fx + 54, ly + 6, S.flapMoving ? COL.cyan : COL.green, 14, "left");
  rect(ctx, fx, ly + 16, W * 0.38, 6, COL.grey, null, 1);
  rect(ctx, fx, ly + 16, W * 0.38 * S.flapPos, 6, null, COL.green);
  // gear
  if (S.gearRetract) {
    const gy = ly + 34;
    txt(ctx, "GEAR", fx, gy + 8, COL.cyan, 12, "left");
    for (let k = 0; k < 3; k++) {
      const down = S.gearPos > 0.99, up = S.gearPos < 0.01;
      const bx = fx + 46 + k * 26;
      if (!up) rect(ctx, bx, gy, 22, 16, down ? COL.green : COL.red, down ? "#063" : "#400", 1.5);
      txt(ctx, down ? "DN" : up ? "UP" : "", bx + 11, gy + 8, down ? COL.green : COL.white, 10);
    }
  }
  if (S.spoiler > 0.02) txt(ctx, `SPD BRK ${Math.round(S.spoiler * 100)}%`, fx, ly + 62, COL.cyan, 12, "left");
  else if (S.spoilerArmed) txt(ctx, "SPLR ARMED", fx, ly + 62, COL.green, 12, "left");

  // messages
  let my = Y + H - 12;
  const msgs = S.alerts || [];
  for (let i = msgs.length - 1; i >= 0 && my > ly + 70; i--) {
    const m = msgs[i];
    txt(ctx, m.text, X + 10, my, m.lvl === 3 ? COL.red : m.lvl === 2 ? COL.amber : COL.green, 13, "left");
    my -= 17;
  }
}

/** Garmin EIS strip (left side of the G1000 MFD). */
export function drawEIS(ctx, X, Y, W, H, S) {
  ctx.fillStyle = "#0a0c0e";
  ctx.fillRect(X, Y, W, H);
  const e = S.engines[0];
  const type = S.engType;
  let y = Y + 16;
  const bar = (label, v, vmax, text, green = [0, 0.9], red = 1) => {
    txt(ctx, label, X + 8, y, COL.white, 11, "left");
    txt(ctx, text, X + W - 8, y, COL.white, 12, "right");
    const bx = X + 8, bw = W - 16, by = y + 9;
    rect(ctx, bx, by, bw, 7, "#555", "#111", 1);
    rect(ctx, bx + bw * green[0], by, bw * (green[1] - green[0]), 7, null, "#1a6b33");
    rect(ctx, bx + bw * red, by, bw * (1 - red) + 2, 7, null, COL.red);
    const px = bx + bw * Math.max(0, Math.min(v / vmax, 1));
    poly(ctx, [[px, by - 2], [px - 5, by - 8], [px + 5, by - 8]], "#000", COL.white, 1);
    y += 34;
  };
  S.engines.forEach((e, i) => {
    const sfx = S.engines.length > 1 ? ` ${i === 0 ? "L" : "R"}` : "";
    if (type === "piston") {
      bar("RPM" + sfx, e.rpm, 2900, String(Math.round(e.rpm)), [0.55, 0.93], 0.94);
      bar("PWR" + sfx, e.power / 1000, S.enginePowerKw * 1.05, `${Math.round((e.power / 1000 / S.enginePowerKw) * 100)}%`, [0, 0.95], 0.96);
      bar("FF GPH" + sfx, e.ff * 3600 / 2.72, S.enginePowerKw * 0.12, (e.ff * 3600 / 2.72).toFixed(1));
      bar("EGT" + sfx, e.egt, 1000, String(Math.round(e.egt)));
      bar("OIL PSI" + sfx, e.oilP, 115, String(Math.round(e.oilP)), [0.4, 0.85], 0.9);
    } else if (type === "turboprop") {
      bar("TRQ %" + sfx, e.torque, 110, e.torque.toFixed(0), [0, 0.9], 0.91);
      bar("ITT °C" + sfx, e.egt, 900, String(Math.round(e.egt)), [0.4, 0.85], 0.89);
      bar("NG %" + sfx, e.n2, 110, e.n2.toFixed(1), [0.5, 0.9], 0.93);
      bar("FF KG/H" + sfx, e.ff * 3600, 350, String(Math.round(e.ff * 3600)));
    } else {
      bar("N1 %" + sfx, e.n1, 110, e.n1.toFixed(1), [0, 0.9], 0.93);
      bar("ITT °C" + sfx, e.egt, 1000, String(Math.round(e.egt)), [0.3, 0.85], 0.9);
      bar("FF KG/H" + sfx, e.ff * 3600, 600, String(Math.round(e.ff * 3600)));
    }
  });
  y += 4;
  txt(ctx, "FUEL QTY", X + 8, y, COL.white, 11, "left");
  txt(ctx, `${Math.round(S.fuelKg)} KG`, X + W - 8, y, S.fuelKg < S.fuelCap * 0.1 ? COL.amber : COL.white, 12, "right");
  y += 18;
  txt(ctx, "FLAPS", X + 8, y, COL.white, 11, "left");
  txt(ctx, S.flapLabel, X + W - 8, y, COL.green, 12, "right");
  y += 18;
  txt(ctx, "TRIM", X + 8, y, COL.white, 11, "left");
  txt(ctx, `${S.trimPct >= 0 ? "UP" : "DN"} ${Math.abs(S.trimPct).toFixed(0)}%`, X + W - 8, y, COL.green, 12, "right");
  if (S.gearRetract) {
    y += 18;
    txt(ctx, "GEAR", X + 8, y, COL.white, 11, "left");
    txt(ctx, S.gearPos > 0.99 ? "DOWN ●●●" : S.gearPos < 0.01 ? "UP" : "TRANSIT", X + W - 8, y, S.gearPos > 0.99 ? COL.green : S.gearPos < 0.01 ? COL.white : COL.red, 12, "right");
  }
  let my = Y + H - 10;
  for (let i = (S.alerts || []).length - 1; i >= 0 && my > y + 20; i--) {
    const m = S.alerts[i];
    txt(ctx, m.text, X + 8, my, m.lvl === 3 ? COL.red : m.lvl === 2 ? COL.amber : COL.white, 11, "left");
    my -= 15;
  }
}

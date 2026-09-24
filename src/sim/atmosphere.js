// International Standard Atmosphere (ICAO Doc 7488) up to 32 km with an
// optional ISA temperature deviation and non-standard sea-level pressure.

const R = 287.05287;
const GAMMA = 1.4;
const G = 9.80665;
const T0 = 288.15;
const P0 = 101325;

/**
 * @param {number} h geopotential altitude (m)
 * @param {number} dT ISA deviation (K)
 * @param {number} qnh sea level pressure (Pa)
 */
export function atmosphere(h, dT = 0, qnh = P0) {
  let T, p;
  if (h < 11000) {
    T = T0 - 0.0065 * h;
    p = qnh * Math.pow(T / T0, 5.25588);
  } else if (h < 20000) {
    const p11 = qnh * 0.22336;
    T = 216.65;
    p = p11 * Math.exp((-G * (h - 11000)) / (R * T));
  } else {
    const p20 = qnh * 0.054032;
    T = 216.65 + 0.001 * (h - 20000);
    p = p20 * Math.pow(T / 216.65, -34.1632);
  }
  T += dT;
  const rho = p / (R * T);
  const a = Math.sqrt(GAMMA * R * T);
  return { T, p, rho, a, sigma: rho / 1.225, delta: p / P0 };
}

/** Pressure altitude (m) as shown by an altimeter set to `setting` Pa for static pressure p. */
export function baroAltitude(p, setting = P0) {
  // Inverse of the troposphere formula referenced to the altimeter setting.
  return (T0 / 0.0065) * (1 - Math.pow(p / setting, 1 / 5.25588));
}

/** Calibrated airspeed (m/s) from true airspeed, using compressible pitot relations. */
export function casFromTas(tas, atm) {
  const M = tas / atm.a;
  // impact pressure
  let qc;
  if (M < 1) {
    qc = atm.p * (Math.pow(1 + 0.2 * M * M, 3.5) - 1);
  } else {
    // Rayleigh pitot tube formula
    qc =
      atm.p *
      ((166.92158 * Math.pow(M, 7)) / Math.pow(7 * M * M - 1, 2.5) - 1);
  }
  return 340.294 * Math.sqrt(5 * (Math.pow(qc / P0 + 1, 2 / 7) - 1));
}

/** TAS (m/s) from CAS at given atmosphere (subsonic). */
export function tasFromCas(cas, atm) {
  const qc = P0 * (Math.pow(1 + 0.2 * (cas / 340.294) ** 2, 3.5) - 1);
  const M = Math.sqrt(5 * (Math.pow(qc / atm.p + 1, 2 / 7) - 1));
  return M * atm.a;
}

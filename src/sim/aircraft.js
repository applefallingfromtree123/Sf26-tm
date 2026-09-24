// Aircraft database.
//
// Units: masses kg, areas m², lengths m, speeds KIAS (knots), altitudes ft,
// shaft power kW per engine, thrust kN per engine (static, sea level).
//
// Stall speeds are quoted at MTOW and are used to derive CLmax; the cruise
// point `cr: [KTAS, ft, power fraction]` is used to derive the parasite drag
// coefficient so that each type reproduces its published cruise performance.
//
// model: fd = fuselage diameter, wing = low|mid|high, sw = ¼-chord sweep (deg),
//        tail = conv|T|V|twin|cruciform, eng = nose|wing|rear|top|overwing|
//        pusher|internal|none, col = [fuselage, tail, stripe]

const F = {
  none: [["-", 0]],
  ga3: [["UP", 0], ["10°", 0.35], ["20°", 0.7], ["30°", 1]],
  ga2: [["UP", 0], ["T/O", 0.4], ["LDG", 1]],
  ga4: [["UP", 0], ["1", 0.3], ["2", 0.6], ["3", 1]],
  airbus: [["0", 0], ["1", 0.15], ["1+F", 0.3], ["2", 0.5], ["3", 0.72], ["FULL", 1]],
  boeing737: [["UP", 0], ["1", 0.1], ["2", 0.18], ["5", 0.3], ["10", 0.42], ["15", 0.52], ["25", 0.72], ["30", 0.86], ["40", 1]],
  boeing: [["UP", 0], ["1", 0.12], ["5", 0.3], ["15", 0.5], ["20", 0.62], ["25", 0.8], ["30", 1]],
  crj: [["0", 0], ["1", 0.1], ["8", 0.25], ["20", 0.5], ["30", 0.75], ["45", 1]],
  ejet: [["0", 0], ["1", 0.15], ["2", 0.3], ["3", 0.5], ["4", 0.62], ["5", 0.8], ["FULL", 1]],
  biz: [["0", 0], ["15", 0.4], ["35", 1]],
  tp: [["UP", 0], ["15", 0.4], ["35", 1]],
  q400: [["0", 0], ["5", 0.2], ["10", 0.45], ["15", 0.65], ["35", 1]],
  fighter: [["AUTO", 0], ["HALF", 0.5], ["FULL", 1]],
};

const C = {
  white: "#f2f3f5",
  grey: "#b9bec6",
  navy: "#1d2c5e",
  red: "#b3202a",
  blue: "#1f5fae",
  green: "#2a6b3c",
  yellow: "#e9c141",
  orange: "#d9661f",
  olive: "#59624a",
  silver: "#c8ccd1",
  black: "#262626",
  mil: "#6a7078",
};

export const AIRCRAFT = [
  // ---------------------------------------------------------------- piston singles
  {
    id: "c152", name: "Cessna 152", maker: "Cessna", cat: "ga", cls: "피스톤 단발",
    eng: { type: "piston", n: 1, kw: 82 }, mE: 490, mtow: 757, fuel: 70,
    S: 14.9, b: 10.1, c: 1.5, L: 7.3, vs0: 43, vs1: 48, vr: 50, vref: 60, vne: 149, vno: 111,
    cr: [107, 8000, 0.75], ceil: 14700, flaps: F.ga3, gear: { type: "tri", retract: false },
    cockpit: "analog", model: { fd: 1.1, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.red, C.red] },
  },
  {
    id: "c172", name: "Cessna 172S Skyhawk G1000", maker: "Cessna", cat: "ga", cls: "피스톤 단발",
    eng: { type: "piston", n: 1, kw: 134 }, mE: 767, mtow: 1157, fuel: 144,
    S: 16.2, b: 11.0, c: 1.49, L: 8.28, vs0: 40, vs1: 48, vr: 55, vref: 65, vne: 163, vno: 129,
    cr: [124, 8000, 0.75], ceil: 14000, flaps: F.ga3, gear: { type: "tri", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.2, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.navy, C.navy] },
  },
  {
    id: "c172a", name: "Cessna 172 Skyhawk (Steam Gauges)", maker: "Cessna", cat: "ga", cls: "피스톤 단발",
    eng: { type: "piston", n: 1, kw: 119 }, mE: 750, mtow: 1111, fuel: 144,
    S: 16.2, b: 11.0, c: 1.49, L: 8.28, vs0: 40, vs1: 48, vr: 55, vref: 65, vne: 163, vno: 129,
    cr: [120, 8000, 0.75], ceil: 13500, flaps: F.ga3, gear: { type: "tri", retract: false },
    cockpit: "analog", ap: true, model: { fd: 1.2, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.orange, C.orange] },
  },
  {
    id: "j3", name: "Piper J-3 Cub", maker: "Piper", cat: "ga", cls: "피스톤 단발 · 테일드래거",
    eng: { type: "piston", n: 1, kw: 48 }, mE: 345, mtow: 550, fuel: 34,
    S: 16.6, b: 10.7, c: 1.6, L: 6.8, vs0: 33, vs1: 33, vr: 38, vref: 50, vne: 106, vno: 83,
    cr: [65, 3000, 0.75], ceil: 11500, flaps: F.none, gear: { type: "tail", retract: false },
    cockpit: "analog", model: { fd: 0.95, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.yellow, C.yellow, C.black] },
  },
  {
    id: "xcub", name: "CubCrafters XCub", maker: "CubCrafters", cat: "ga", cls: "피스톤 단발 · 부시플레인",
    eng: { type: "piston", n: 1, kw: 134 }, mE: 590, mtow: 1043, fuel: 136,
    S: 16.3, b: 10.5, c: 1.55, L: 7.0, vs0: 33, vs1: 42, vr: 40, vref: 50, vne: 153, vno: 120,
    cr: [120, 6000, 0.75], ceil: 15000, flaps: F.ga4, gear: { type: "tail", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.0, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.red, C.black] },
  },
  {
    id: "pa28r", name: "Piper PA-28R Arrow III", maker: "Piper", cat: "ga", cls: "피스톤 단발 · 접이식 기어",
    eng: { type: "piston", n: 1, kw: 149 }, mE: 750, mtow: 1247, fuel: 206,
    S: 15.8, b: 10.8, c: 1.6, L: 7.5, vs0: 55, vs1: 60, vr: 65, vref: 75, vne: 186, vno: 150,
    cr: [140, 7000, 0.75], ceil: 16200, flaps: F.ga3, gear: { type: "tri", retract: true },
    cockpit: "analog", ap: true, model: { fd: 1.2, wing: "low", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.blue, C.blue] },
  },
  {
    id: "dr400", name: "Robin DR400/100 Cadet", maker: "Robin", cat: "ga", cls: "피스톤 단발",
    eng: { type: "piston", n: 1, kw: 79 }, mE: 530, mtow: 900, fuel: 80,
    S: 13.6, b: 8.72, c: 1.6, L: 6.96, vs0: 45, vs1: 51, vr: 55, vref: 65, vne: 166, vno: 140,
    cr: [110, 5000, 0.75], ceil: 13000, flaps: F.ga2, gear: { type: "tri", retract: false },
    cockpit: "analog", model: { fd: 1.15, wing: "low", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.blue, C.red] },
  },
  {
    id: "da40", name: "Diamond DA40 NG", maker: "Diamond", cat: "ga", cls: "디젤 단발",
    eng: { type: "piston", n: 1, kw: 125, turbo: true }, mE: 900, mtow: 1310, fuel: 115,
    S: 13.5, b: 11.63, c: 1.2, L: 8.06, vs0: 49, vs1: 58, vr: 59, vref: 72, vne: 178, vno: 140,
    cr: [140, 10000, 0.8], ceil: 16400, flaps: F.ga2, gear: { type: "tri", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.2, wing: "low", sw: 1, tail: "T", eng: "nose", col: [C.white, C.navy, C.grey] },
  },
  {
    id: "sr22", name: "Cirrus SR22T", maker: "Cirrus", cat: "ga", cls: "피스톤 단발 · 터보",
    eng: { type: "piston", n: 1, kw: 235, turbo: true }, mE: 1050, mtow: 1633, fuel: 250,
    S: 13.5, b: 11.7, c: 1.2, L: 7.9, vs0: 60, vs1: 70, vr: 70, vref: 80, vne: 205, vno: 176,
    cr: [205, 17000, 0.75], ceil: 25000, flaps: F.ga2, gear: { type: "tri", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.3, wing: "low", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.black, C.silver] },
  },
  {
    id: "g36", name: "Beechcraft Bonanza G36", maker: "Beechcraft", cat: "ga", cls: "피스톤 단발 · 접이식 기어",
    eng: { type: "piston", n: 1, kw: 224 }, mE: 1050, mtow: 1655, fuel: 222,
    S: 16.8, b: 10.2, c: 1.7, L: 8.4, vs0: 59, vs1: 70, vr: 70, vref: 80, vne: 203, vno: 165,
    cr: [176, 8000, 0.75], ceil: 18500, flaps: F.ga2, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.3, wing: "low", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.red, C.navy] },
  },
  {
    id: "extra", name: "Extra 330LT", maker: "Extra", cat: "aero", cls: "곡예기",
    eng: { type: "piston", n: 1, kw: 224 }, mE: 677, mtow: 950, fuel: 83,
    S: 10.7, b: 8.0, c: 1.4, L: 6.95, vs0: 55, vs1: 55, vr: 60, vref: 75, vne: 219, vno: 158,
    cr: [185, 8000, 0.75], ceil: 16000, flaps: F.none, gear: { type: "tail", retract: false },
    cockpit: "g1000", model: { fd: 1.05, wing: "mid", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.red, C.blue] },
  },
  {
    id: "icona5", name: "ICON A5", maker: "ICON", cat: "ga", cls: "수륙양용 경량기",
    eng: { type: "piston", n: 1, kw: 75 }, mE: 510, mtow: 703, fuel: 55,
    S: 12.3, b: 10.8, c: 1.2, L: 7.0, vs0: 45, vs1: 51, vr: 50, vref: 60, vne: 120, vno: 100,
    cr: [95, 3000, 0.75], ceil: 15000, flaps: F.ga2, gear: { type: "tri", retract: true },
    cockpit: "analog", model: { fd: 1.3, wing: "high", sw: 0, tail: "T", eng: "pusher", col: [C.white, C.orange, C.black] },
  },
  {
    id: "dhc2", name: "de Havilland DHC-2 Beaver", maker: "de Havilland Canada", cat: "ga", cls: "레이디얼 단발 · 부시플레인",
    eng: { type: "piston", n: 1, kw: 336 }, mE: 1361, mtow: 2313, fuel: 300,
    S: 23.2, b: 14.6, c: 1.6, L: 9.2, vs0: 45, vs1: 52, vr: 55, vref: 65, vne: 158, vno: 125,
    cr: [125, 5000, 0.7], ceil: 18000, flaps: F.ga3, gear: { type: "tail", retract: false },
    cockpit: "analog", model: { fd: 1.5, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.yellow, C.red, C.red] },
  },
  {
    id: "p51", name: "North American P-51D Mustang", maker: "North American", cat: "warbird", cls: "워버드",
    eng: { type: "piston", n: 1, kw: 1111, turbo: true, crit: 20000 }, mE: 3465, mtow: 5490, fuel: 650,
    S: 21.8, b: 11.28, c: 2.0, L: 9.83, vs0: 87, vs1: 95, vr: 100, vref: 110, vne: 439, vno: 350,
    cr: [330, 25000, 0.75], ceil: 41900, flaps: F.ga3, gear: { type: "tail", retract: true },
    cockpit: "analog", model: { fd: 1.4, wing: "low", sw: 0, tail: "conv", eng: "nose", col: [C.silver, C.silver, C.yellow] },
  },
  {
    id: "dc3", name: "Douglas DC-3", maker: "Douglas", cat: "prop-twin", cls: "레이디얼 쌍발 · 클래식 여객기",
    eng: { type: "piston", n: 2, kw: 895, turbo: true, crit: 7500 }, mE: 7650, mtow: 11430, fuel: 2200,
    S: 91.7, b: 29.0, c: 3.5, L: 19.7, vs0: 58, vs1: 67, vr: 80, vref: 85, vne: 193, vno: 160,
    cr: [155, 8000, 0.65], ceil: 23200, flaps: F.ga2, gear: { type: "tail", retract: true },
    cockpit: "analog", ap: true, model: { fd: 2.6, wing: "low", sw: 8, tail: "conv", eng: "wing", col: [C.silver, C.navy, C.red] },
  },
  // ---------------------------------------------------------------- piston twins
  {
    id: "baron", name: "Beechcraft Baron G58", maker: "Beechcraft", cat: "prop-twin", cls: "피스톤 쌍발",
    eng: { type: "piston", n: 2, kw: 224 }, mE: 1700, mtow: 2500, fuel: 580,
    S: 18.5, b: 11.5, c: 1.7, L: 9.1, vs0: 74, vs1: 84, vr: 85, vref: 95, vne: 223, vno: 195,
    cr: [200, 8000, 0.75], ceil: 20688, flaps: F.ga2, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.35, wing: "low", sw: 0, tail: "conv", eng: "wing", col: [C.white, C.navy, C.yellow] },
  },
  {
    id: "da62", name: "Diamond DA62", maker: "Diamond", cat: "prop-twin", cls: "디젤 쌍발",
    eng: { type: "piston", n: 2, kw: 134, turbo: true }, mE: 1580, mtow: 2300, fuel: 260,
    S: 17.1, b: 14.55, c: 1.3, L: 9.19, vs0: 66, vs1: 75, vr: 75, vref: 85, vne: 200, vno: 160,
    cr: [175, 12000, 0.75], ceil: 20000, flaps: F.ga2, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.35, wing: "low", sw: 1, tail: "T", eng: "wing", col: [C.white, C.navy, C.silver] },
  },
  // ---------------------------------------------------------------- turboprops
  {
    id: "c208", name: "Cessna 208B Grand Caravan EX", maker: "Cessna", cat: "tp", cls: "터보프롭 단발",
    eng: { type: "turboprop", n: 1, kw: 647 }, mE: 2350, mtow: 3995, fuel: 1010,
    S: 25.96, b: 15.88, c: 1.98, L: 12.67, vs0: 61, vs1: 78, vr: 70, vref: 80, vne: 175, vno: 175,
    cr: [185, 10000, 0.85], ceil: 25000, flaps: F.tp, gear: { type: "tri", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.7, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.green, C.green] },
  },
  {
    id: "kodiak", name: "Daher Kodiak 100", maker: "Daher", cat: "tp", cls: "터보프롭 단발 · STOL",
    eng: { type: "turboprop", n: 1, kw: 559 }, mE: 1712, mtow: 3290, fuel: 950,
    S: 22.3, b: 13.7, c: 1.7, L: 10.4, vs0: 60, vs1: 72, vr: 60, vref: 75, vne: 183, vno: 183,
    cr: [174, 12000, 0.85], ceil: 25000, flaps: F.tp, gear: { type: "tri", retract: false },
    cockpit: "g1000", ap: true, model: { fd: 1.6, wing: "high", sw: 0, tail: "conv", eng: "nose", col: [C.white, C.orange, C.black] },
  },
  {
    id: "tbm930", name: "Daher TBM 930", maker: "Daher", cat: "tp", cls: "고성능 터보프롭",
    eng: { type: "turboprop", n: 1, kw: 634 }, mE: 2097, mtow: 3354, fuel: 870,
    S: 18.0, b: 12.83, c: 1.5, L: 10.74, vs0: 65, vs1: 85, vr: 90, vref: 85, vne: 266, vno: 266, mmo: 0.6,
    cr: [320, 28000, 0.85], ceil: 31000, flaps: F.tp, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.5, wing: "low", sw: 2, tail: "conv", eng: "nose", col: [C.white, C.black, C.red] },
  },
  {
    id: "pc12", name: "Pilatus PC-12 NGX", maker: "Pilatus", cat: "tp", cls: "터보프롭 단발",
    eng: { type: "turboprop", n: 1, kw: 895 }, mE: 2800, mtow: 4740, fuel: 1230,
    S: 25.8, b: 16.28, c: 1.7, L: 14.4, vs0: 67, vs1: 90, vr: 85, vref: 85, vne: 240, vno: 240, mmo: 0.48,
    cr: [285, 25000, 0.9], ceil: 30000, flaps: F.tp, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, at: true, model: { fd: 1.6, wing: "low", sw: 0, tail: "T", eng: "nose", col: [C.white, C.navy, C.silver] },
  },
  {
    id: "king350", name: "Beechcraft King Air 350i", maker: "Beechcraft", cat: "tp", cls: "터보프롭 쌍발",
    eng: { type: "turboprop", n: 2, kw: 783 }, mE: 4100, mtow: 6800, fuel: 1640,
    S: 28.8, b: 17.65, c: 1.8, L: 14.22, vs0: 81, vs1: 93, vr: 94, vref: 100, vne: 263, vno: 263, mmo: 0.58,
    cr: [300, 24000, 0.9], ceil: 35000, flaps: F.tp, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.6, wing: "low", sw: 0, tail: "T", eng: "wing", col: [C.white, C.navy, C.yellow] },
  },
  {
    id: "dhc6", name: "de Havilland DHC-6 Twin Otter", maker: "de Havilland Canada", cat: "tp", cls: "터보프롭 쌍발 · STOL",
    eng: { type: "turboprop", n: 2, kw: 460 }, mE: 3363, mtow: 5670, fuel: 1150,
    S: 39.0, b: 19.8, c: 2.0, L: 15.8, vs0: 58, vs1: 74, vr: 70, vref: 80, vne: 170, vno: 170,
    cr: [170, 10000, 0.85], ceil: 26700, flaps: F.tp, gear: { type: "tri", retract: false },
    cockpit: "analog", ap: true, model: { fd: 1.7, wing: "high", sw: 0, tail: "conv", eng: "wing", col: [C.white, C.red, C.red] },
  },
  {
    id: "atr72", name: "ATR 72-600", maker: "ATR", cat: "regional-tp", cls: "터보프롭 여객기",
    eng: { type: "turboprop", n: 2, kw: 2051 }, mE: 13500, mtow: 23000, fuel: 5000,
    S: 61.0, b: 27.05, c: 2.3, L: 27.17, vs0: 90, vs1: 110, vr: 110, vref: 113, vne: 250, vno: 250, mmo: 0.55,
    cr: [275, 17000, 0.9], ceil: 25000, flaps: F.tp, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, model: { fd: 2.8, wing: "high", sw: 3, tail: "T", eng: "wing", col: [C.white, C.blue, C.blue] },
  },
  {
    id: "q400", name: "De Havilland Dash 8-400", maker: "De Havilland Canada", cat: "regional-tp", cls: "터보프롭 여객기",
    eng: { type: "turboprop", n: 2, kw: 3781 }, mE: 17100, mtow: 29260, fuel: 5300,
    S: 63.1, b: 28.4, c: 2.3, L: 32.8, vs0: 95, vs1: 115, vr: 120, vref: 120, vne: 286, vno: 286, mmo: 0.6,
    cr: [360, 25000, 0.9], ceil: 27000, flaps: F.q400, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, model: { fd: 2.7, wing: "high", sw: 3, tail: "T", eng: "wing", col: [C.white, C.red, C.grey] },
  },
  // ---------------------------------------------------------------- business jets
  {
    id: "sf50", name: "Cirrus Vision Jet SF50", maker: "Cirrus", cat: "bizjet", cls: "초경량 제트",
    eng: { type: "turbofan", n: 1, kn: 8.0, idle: 45 }, mE: 1650, mtow: 2722, fuel: 896,
    S: 18.1, b: 11.8, c: 1.6, L: 9.4, vs0: 67, vs1: 80, vr: 85, vref: 88, vne: 250, vno: 250, mmo: 0.53,
    cr: [305, 28000, 0.92], ceil: 31000, flaps: F.biz, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, at: true, model: { fd: 1.6, wing: "low", sw: 2, tail: "V", eng: "top", col: [C.white, C.black, C.silver] },
  },
  {
    id: "hondajet", name: "Honda HA-420 HondaJet Elite", maker: "Honda", cat: "bizjet", cls: "경량 비즈니스 제트",
    eng: { type: "turbofan", n: 2, kn: 9.12, idle: 40 }, mE: 3300, mtow: 4853, fuel: 1170,
    S: 16.7, b: 12.12, c: 1.5, L: 12.99, vs0: 90, vs1: 105, vr: 105, vref: 108, vne: 270, vno: 270, mmo: 0.72,
    cr: [415, 30000, 0.92], ceil: 43000, flaps: F.biz, gear: { type: "tri", retract: true },
    cockpit: "g1000", ap: true, model: { fd: 1.6, wing: "low", sw: 4, tail: "conv", eng: "overwing", col: [C.white, C.red, C.navy] },
  },
  {
    id: "cj4", name: "Cessna Citation CJ4", maker: "Cessna", cat: "bizjet", cls: "비즈니스 제트",
    eng: { type: "turbofan", n: 2, kn: 16.1, idle: 30 }, mE: 4800, mtow: 7761, fuel: 2640,
    S: 30.7, b: 15.49, c: 2.1, L: 16.26, vs0: 90, vs1: 105, vr: 110, vref: 110, vne: 305, vno: 305, mmo: 0.77,
    cr: [440, 41000, 0.95], ceil: 45000, flaps: F.biz, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, model: { fd: 1.7, wing: "low", sw: 12, tail: "T", eng: "rear", col: [C.white, C.navy, C.silver] },
  },
  {
    id: "longitude", name: "Cessna Citation Longitude", maker: "Cessna", cat: "bizjet", cls: "슈퍼 미드사이즈 제트",
    eng: { type: "turbofan", n: 2, kn: 32.2, idle: 25 }, mE: 11200, mtow: 18370, fuel: 6400,
    S: 49.9, b: 20.6, c: 2.7, L: 22.3, vs0: 95, vs1: 115, vr: 120, vref: 115, vne: 325, vno: 325, mmo: 0.84,
    cr: [476, 41000, 0.95], ceil: 45000, flaps: F.biz, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 2.1, wing: "low", sw: 28, tail: "T", eng: "rear", col: [C.white, C.navy, C.grey] },
  },
  {
    id: "g650", name: "Gulfstream G650ER", maker: "Gulfstream", cat: "bizjet", cls: "장거리 비즈니스 제트",
    eng: { type: "turbofan", n: 2, kn: 75.2, idle: 23 }, mE: 24500, mtow: 48200, fuel: 21900,
    S: 119.2, b: 30.36, c: 4.4, L: 30.41, vs0: 105, vs1: 135, vr: 135, vref: 125, vne: 340, vno: 340, mmo: 0.925,
    cr: [488, 41000, 0.92], ceil: 51000, flaps: F.biz, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 2.6, wing: "low", sw: 36, tail: "T", eng: "rear", col: [C.white, C.navy, C.silver] },
  },
  // ---------------------------------------------------------------- regional jets
  {
    id: "crj700", name: "Bombardier CRJ700", maker: "Bombardier", cat: "narrow", cls: "리저널 제트",
    eng: { type: "turbofan", n: 2, kn: 61.3, idle: 23 }, mE: 20070, mtow: 34020, fuel: 8900,
    S: 70.6, b: 23.2, c: 3.3, L: 32.5, vs0: 110, vs1: 135, vr: 145, vref: 135, vne: 335, vno: 335, mmo: 0.85,
    cr: [447, 37000, 0.92], ceil: 41000, flaps: F.crj, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, model: { fd: 2.7, wing: "low", sw: 26, tail: "T", eng: "rear", col: [C.white, C.blue, C.grey] },
  },
  {
    id: "e175", name: "Embraer E175", maker: "Embraer", cat: "narrow", cls: "리저널 제트",
    eng: { type: "turbofan", n: 2, kn: 63.2, idle: 23 }, mE: 21890, mtow: 38790, fuel: 9335,
    S: 72.7, b: 26.0, c: 3.2, L: 31.68, vs0: 105, vs1: 140, vr: 140, vref: 130, vne: 320, vno: 320, mmo: 0.82,
    cr: [447, 37000, 0.92], ceil: 41000, flaps: F.ejet, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 3.0, wing: "low", sw: 25, tail: "conv", eng: "wing", col: [C.white, C.navy, C.blue] },
  },
  // ---------------------------------------------------------------- narrow-body airliners
  {
    id: "a320", name: "Airbus A320neo", maker: "Airbus", cat: "narrow", cls: "협동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 120.6, idle: 20 }, mE: 44300, mtow: 79000, fuel: 18700,
    S: 122.6, b: 35.8, c: 4.19, L: 37.57, vs0: 115, vs1: 160, vr: 145, vref: 135, vne: 350, vno: 350, mmo: 0.82,
    cr: [450, 37000, 0.92], ceil: 39800, flaps: F.airbus, gear: { type: "tri", retract: true },
    cockpit: "airliner", fbw: "airbus", ap: true, at: true, model: { fd: 3.95, wing: "low", sw: 25, tail: "conv", eng: "wing", col: [C.white, C.navy, C.blue] },
  },
  {
    id: "a321", name: "Airbus A321neo", maker: "Airbus", cat: "narrow", cls: "협동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 147, idle: 20 }, mE: 50100, mtow: 97000, fuel: 18900,
    S: 122.6, b: 35.8, c: 4.19, L: 44.51, vs0: 120, vs1: 170, vr: 155, vref: 140, vne: 350, vno: 350, mmo: 0.82,
    cr: [450, 35000, 0.92], ceil: 39800, flaps: F.airbus, gear: { type: "tri", retract: true },
    cockpit: "airliner", fbw: "airbus", ap: true, at: true, model: { fd: 3.95, wing: "low", sw: 25, tail: "conv", eng: "wing", col: [C.white, C.red, C.navy] },
  },
  {
    id: "b738", name: "Boeing 737-800", maker: "Boeing", cat: "narrow", cls: "협동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 121.4, idle: 20 }, mE: 41413, mtow: 79016, fuel: 20894,
    S: 124.6, b: 35.79, c: 3.96, L: 39.5, vs0: 115, vs1: 160, vr: 150, vref: 145, vne: 340, vno: 340, mmo: 0.82,
    cr: [453, 35000, 0.92], ceil: 41000, flaps: F.boeing737, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 3.76, wing: "low", sw: 25, tail: "conv", eng: "wing", col: [C.white, C.navy, C.yellow] },
  },
  {
    id: "b38m", name: "Boeing 737 MAX 8", maker: "Boeing", cat: "narrow", cls: "협동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 130.4, idle: 20 }, mE: 45070, mtow: 82190, fuel: 20730,
    S: 127.0, b: 35.9, c: 3.96, L: 39.52, vs0: 115, vs1: 160, vr: 150, vref: 145, vne: 340, vno: 340, mmo: 0.82,
    cr: [453, 37000, 0.92], ceil: 41000, flaps: F.boeing737, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 3.76, wing: "low", sw: 25, tail: "conv", eng: "wing", col: [C.white, C.blue, C.red] },
  },
  {
    id: "a310", name: "Airbus A310-300", maker: "Airbus", cat: "wide", cls: "광동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 238, idle: 21 }, mE: 77400, mtow: 164000, fuel: 49000,
    S: 219, b: 43.9, c: 5.8, L: 46.66, vs0: 115, vs1: 160, vr: 150, vref: 140, vne: 360, vno: 360, mmo: 0.84,
    cr: [460, 35000, 0.92], ceil: 41000, flaps: F.boeing, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 5.64, wing: "low", sw: 28, tail: "conv", eng: "wing", col: [C.white, C.red, C.red] },
  },
  // ---------------------------------------------------------------- wide-body airliners
  {
    id: "a330", name: "Airbus A330-900neo", maker: "Airbus", cat: "wide", cls: "광동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 324, idle: 21 }, mE: 135000, mtow: 251000, fuel: 111000,
    S: 465, b: 64.0, c: 8.0, L: 63.66, vs0: 115, vs1: 165, vr: 155, vref: 140, vne: 330, vno: 330, mmo: 0.86,
    cr: [470, 39000, 0.92], ceil: 41450, flaps: F.airbus, gear: { type: "tri", retract: true },
    cockpit: "airliner", fbw: "airbus", ap: true, at: true, model: { fd: 5.64, wing: "low", sw: 30, tail: "conv", eng: "wing", col: [C.white, C.navy, C.blue] },
  },
  {
    id: "a350", name: "Airbus A350-900", maker: "Airbus", cat: "wide", cls: "광동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 374, idle: 21 }, mE: 142400, mtow: 283000, fuel: 110500,
    S: 442, b: 64.75, c: 7.9, L: 66.8, vs0: 115, vs1: 165, vr: 155, vref: 140, vne: 340, vno: 340, mmo: 0.89,
    cr: [488, 39000, 0.92], ceil: 43100, flaps: F.airbus, gear: { type: "tri", retract: true },
    cockpit: "airliner", fbw: "airbus", ap: true, at: true, model: { fd: 5.96, wing: "low", sw: 31.9, tail: "conv", eng: "wing", col: [C.white, C.black, C.grey] },
  },
  {
    id: "a380", name: "Airbus A380-800", maker: "Airbus", cat: "wide", cls: "초대형 여객기",
    eng: { type: "turbofan", n: 4, kn: 311, idle: 21 }, mE: 277000, mtow: 575000, fuel: 254000,
    S: 845, b: 79.75, c: 11.7, L: 72.72, vs0: 115, vs1: 165, vr: 150, vref: 140, vne: 340, vno: 340, mmo: 0.89,
    cr: [488, 39000, 0.92], ceil: 43000, flaps: F.airbus, gear: { type: "tri", retract: true },
    cockpit: "airliner", fbw: "airbus", ap: true, at: true, model: { fd: 7.2, wing: "low", sw: 33.5, tail: "conv", eng: "wing", col: [C.white, C.navy, C.red] },
  },
  {
    id: "b748", name: "Boeing 747-8 Intercontinental", maker: "Boeing", cat: "wide", cls: "초대형 여객기",
    eng: { type: "turbofan", n: 4, kn: 296, idle: 21 }, mE: 220128, mtow: 447700, fuel: 193000,
    S: 554, b: 68.4, c: 8.3, L: 76.3, vs0: 120, vs1: 170, vr: 165, vref: 150, vne: 365, vno: 365, mmo: 0.9,
    cr: [490, 39000, 0.92], ceil: 43100, flaps: F.boeing, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 6.5, wing: "low", sw: 37.5, tail: "conv", eng: "wing", col: [C.white, C.blue, C.navy] },
  },
  {
    id: "b77w", name: "Boeing 777-300ER", maker: "Boeing", cat: "wide", cls: "광동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 513, idle: 21 }, mE: 167800, mtow: 351500, fuel: 145500,
    S: 436.8, b: 64.8, c: 8.0, L: 73.9, vs0: 120, vs1: 170, vr: 165, vref: 150, vne: 330, vno: 330, mmo: 0.89,
    cr: [490, 35000, 0.92], ceil: 43100, flaps: F.boeing, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 6.2, wing: "low", sw: 31.6, tail: "conv", eng: "wing", col: [C.white, C.navy, C.grey] },
  },
  {
    id: "b789", name: "Boeing 787-9 Dreamliner", maker: "Boeing", cat: "wide", cls: "광동체 여객기",
    eng: { type: "turbofan", n: 2, kn: 330, idle: 21 }, mE: 128850, mtow: 254000, fuel: 101300,
    S: 360, b: 60.12, c: 7.2, L: 62.8, vs0: 115, vs1: 165, vr: 155, vref: 145, vne: 350, vno: 350, mmo: 0.9,
    cr: [488, 39000, 0.92], ceil: 43100, flaps: F.boeing, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 5.77, wing: "low", sw: 32.2, tail: "conv", eng: "wing", col: [C.white, C.blue, C.navy] },
  },
  // ---------------------------------------------------------------- supersonic / military
  {
    id: "concorde", name: "Aérospatiale/BAC Concorde", maker: "Aérospatiale/BAC", cat: "supersonic", cls: "초음속 여객기",
    eng: { type: "turbojet", n: 4, kn: 140, ab: 169, idle: 30 }, mE: 78700, mtow: 185000, fuel: 95680,
    S: 358.25, b: 25.6, c: 18.0, L: 61.66, vs0: 165, vs1: 165, vr: 195, vref: 162, vne: 530, vno: 530, mmo: 2.04,
    CD0: 0.0125, cLa: 2.6, wave: 0.009, ceil: 60000, gh: 4.6, tailArm: 0.38, flaps: F.none, gear: { type: "tri", retract: true },
    cockpit: "airliner", ap: true, at: true, model: { fd: 2.9, wing: "low", sw: 60, delta: true, tail: "fin", eng: "podded", col: [C.white, C.navy, C.red] },
  },
  {
    id: "fa18", name: "Boeing F/A-18E Super Hornet", maker: "Boeing", cat: "fighter", cls: "전투기",
    eng: { type: "turbojet", n: 2, kn: 62.3, ab: 97.9, idle: 60 }, mE: 14552, mtow: 29937, fuel: 6780,
    S: 46.45, b: 13.62, c: 3.8, L: 18.31, vs0: 125, vs1: 140, vr: 150, vref: 140, vne: 750, vno: 750, mmo: 1.6,
    CD0: 0.021, cLa: 3.6, wave: 0.028, ceil: 50000, flaps: F.fighter, gear: { type: "tri", retract: true },
    cockpit: "fighter", fbw: "fighter", ap: true, model: { fd: 1.9, wing: "mid", sw: 20, tail: "twin", eng: "internal", col: [C.mil, C.mil, C.grey] },
  },
  {
    id: "f16", name: "General Dynamics F-16C Block 50", maker: "General Dynamics", cat: "fighter", cls: "전투기",
    eng: { type: "turbojet", n: 1, kn: 76.3, ab: 129.4, idle: 65 }, mE: 8570, mtow: 19200, fuel: 3200,
    S: 27.87, b: 9.96, c: 3.45, L: 15.06, vs0: 125, vs1: 130, vr: 150, vref: 140, vne: 800, vno: 800, mmo: 2.0,
    CD0: 0.019, cLa: 3.4, wave: 0.024, ceil: 50000, flaps: F.none, gear: { type: "tri", retract: true },
    cockpit: "fighter", fbw: "fighter", ap: true, model: { fd: 1.6, wing: "mid", sw: 40, tail: "conv", eng: "internal", col: [C.mil, C.mil, C.grey] },
  },
  // ---------------------------------------------------------------- gliders
  {
    id: "ls8", name: "Schempp-Hirth LS8-18 (Glider)", maker: "DG Flugzeugbau", cat: "glider", cls: "글라이더",
    eng: { type: "none", n: 0 }, mE: 270, mtow: 525, fuel: 0,
    S: 11.4, b: 18.0, c: 0.66, L: 6.7, vs0: 38, vs1: 40, vr: 40, vref: 50, vne: 151, vno: 110,
    CD0: 0.0085, e: 0.95, ceil: 25000, flaps: F.none, gear: { type: "mono", retract: true },
    cockpit: "analog", airStart: true, model: { fd: 0.7, wing: "mid", sw: 0, tail: "T", eng: "none", col: [C.white, C.white, C.red] },
  },
  {
    id: "dg1001", name: "DG-1001 Club (Two-seat Glider)", maker: "DG Flugzeugbau", cat: "glider", cls: "글라이더",
    eng: { type: "none", n: 0 }, mE: 400, mtow: 750, fuel: 0,
    S: 17.5, b: 20.0, c: 0.9, L: 8.6, vs0: 40, vs1: 42, vr: 42, vref: 55, vne: 146, vno: 110,
    CD0: 0.0095, e: 0.93, ceil: 25000, flaps: F.none, gear: { type: "mono", retract: false },
    cockpit: "analog", airStart: true, model: { fd: 0.8, wing: "mid", sw: 0, tail: "T", eng: "none", col: [C.white, C.white, C.blue] },
  },
  // ---------------------------------------------------------------- helicopters
  {
    id: "h125", name: "Airbus H125", maker: "Airbus Helicopters", cat: "heli", cls: "헬리콥터",
    eng: { type: "turboshaft", n: 1, kw: 632 }, mE: 1200, mtow: 2250, fuel: 430,
    rotorD: 10.69, L: 10.93, b: 10.69, vne: 155, vno: 136, vs0: 0, vs1: 0, vr: 0, vref: 0, ceil: 23000,
    flaps: F.none, gear: { type: "skid", retract: false }, cockpit: "heli", ap: false,
    model: { fd: 1.8, heli: true, col: [C.red, C.white, C.white] },
  },
  {
    id: "h135", name: "Airbus H135", maker: "Airbus Helicopters", cat: "heli", cls: "쌍발 헬리콥터",
    eng: { type: "turboshaft", n: 2, kw: 435 }, mE: 1455, mtow: 2980, fuel: 560,
    rotorD: 10.2, L: 10.2, b: 10.2, vne: 155, vno: 137, vs0: 0, vs1: 0, vr: 0, vref: 0, ceil: 20000,
    flaps: F.none, gear: { type: "skid", retract: false }, cockpit: "heli", ap: true,
    model: { fd: 1.8, heli: true, col: [C.yellow, C.black, C.black] },
  },
  {
    id: "b407", name: "Bell 407", maker: "Bell", cat: "heli", cls: "헬리콥터",
    eng: { type: "turboshaft", n: 1, kw: 606 }, mE: 1210, mtow: 2268, fuel: 385,
    rotorD: 10.67, L: 10.56, b: 10.67, vne: 140, vno: 133, vs0: 0, vs1: 0, vr: 0, vref: 0, ceil: 18690,
    flaps: F.none, gear: { type: "skid", retract: false }, cockpit: "heli", ap: false,
    model: { fd: 1.7, heli: true, col: [C.navy, C.white, C.white] },
  },
  {
    id: "cabri", name: "Guimbal Cabri G2", maker: "Hélicoptères Guimbal", cat: "heli", cls: "피스톤 헬리콥터",
    eng: { type: "turboshaft", n: 1, kw: 108 }, mE: 440, mtow: 700, fuel: 120,
    rotorD: 7.2, L: 6.31, b: 7.2, vne: 100, vno: 90, vs0: 0, vs1: 0, vr: 0, vref: 0, ceil: 13000,
    flaps: F.none, gear: { type: "skid", retract: false }, cockpit: "heli", ap: false,
    model: { fd: 1.3, heli: true, col: [C.white, C.blue, C.blue] },
  },
];

export const CATEGORIES = [
  ["all", "전체"],
  ["ga", "GA 피스톤"],
  ["prop-twin", "피스톤 쌍발"],
  ["tp", "터보프롭"],
  ["regional-tp", "터보프롭 여객기"],
  ["bizjet", "비즈니스 제트"],
  ["narrow", "협동체/리저널"],
  ["wide", "광동체"],
  ["supersonic", "초음속"],
  ["fighter", "군용"],
  ["warbird", "워버드"],
  ["aero", "곡예기"],
  ["glider", "글라이더"],
  ["heli", "헬리콥터"],
];

export function getAircraft(id) {
  return AIRCRAFT.find((a) => a.id === id) || AIRCRAFT[1];
}

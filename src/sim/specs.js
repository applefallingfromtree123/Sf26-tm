// Extended type data for the spec sheet (첫 비행, 승무원, 좌석, 항속거리, 설명)
// and the livery catalogue. Liveries are airline-inspired colour schemes
// painted procedurally onto the generated airframe.

export const SPEC_EXTRA = {
  c152: { first: 1977, crew: 1, pax: 1, range: 415, eng: "Lycoming O-235 110 hp", desc: "세계에서 가장 많이 쓰인 2인승 훈련기. 정직한 실속 특성과 간결한 계통." },
  c172: { first: 1955, crew: 1, pax: 3, range: 640, eng: "Lycoming IO-360-L2A 180 hp", desc: "역사상 최다 생산 항공기. Garmin G1000 글라스 콕핏과 KAP-140 대신 GFC700 오토파일럿." },
  c172a: { first: 1955, crew: 1, pax: 3, range: 600, eng: "Lycoming O-320 160 hp", desc: "전통적인 6팩 아날로그 계기. 계기비행 기초 훈련의 표준." },
  j3: { first: 1938, crew: 1, pax: 1, range: 190, eng: "Continental A-65 65 hp", desc: "테일드래거 입문의 상징. 러더 사용과 3점 착륙 감각이 필수." },
  xcub: { first: 2016, crew: 1, pax: 1, range: 700, eng: "Lycoming CC363i 180 hp", desc: "초단거리 이착륙 부시플레인. 큰 플랩과 툰드라 타이어." },
  pa28r: { first: 1967, crew: 1, pax: 3, range: 860, eng: "Lycoming IO-360-C1C6 200 hp", desc: "가변 피치 프로펠러와 접이식 기어를 가진 대표적 복합기(complex) 훈련기." },
  dr400: { first: 1972, crew: 1, pax: 3, range: 550, eng: "Lycoming O-235 108 hp", desc: "유럽 비행 클럽의 대표 목재 기체. 특유의 '조이너' 갈매기 날개." },
  da40: { first: 2010, crew: 1, pax: 3, range: 760, eng: "Austro AE300 디젤 168 hp", desc: "복합재 기체, FADEC 디젤 엔진, 단일 레버 출력 관리." },
  sr22: { first: 2001, crew: 1, pax: 4, range: 1000, eng: "Continental TSIO-550-K 315 hp", desc: "기체 낙하산 CAPS를 갖춘 고성능 터보 단발기." },
  g36: { first: 2006, crew: 1, pax: 5, range: 920, eng: "Continental IO-550-B 300 hp", desc: "1947년부터 생산된 Bonanza의 최신형. G1000 NXi." },
  extra: { first: 2010, crew: 1, pax: 1, range: 400, eng: "Lycoming AEIO-580 315 hp", desc: "+/-10 G 무제한 곡예기. 높은 롤레이트와 대칭 익형." },
  icona5: { first: 2008, crew: 1, pax: 1, range: 427, eng: "Rotax 912 iS 100 hp", desc: "스핀 저항 설계의 수륙양용 경량 스포츠기." },
  dhc2: { first: 1947, crew: 1, pax: 6, range: 395, eng: "P&W R-985 Wasp Jr 450 hp", desc: "캐나다 오지를 개척한 전설적 부시플레인." },
  p51: { first: 1940, crew: 1, pax: 0, range: 1430, eng: "Packard V-1650-7 Merlin 1,490 hp", desc: "2단 과급기 Merlin 엔진의 2차대전 장거리 호위 전투기." },
  dc3: { first: 1935, crew: 2, pax: 32, range: 1300, eng: "P&W R-1830 Twin Wasp ×2", desc: "항공 여객 운송을 만든 기체. 테일드래거 대형기 조종의 진수." },
  baron: { first: 1960, crew: 1, pax: 5, range: 1480, eng: "Continental IO-550-C 300 hp ×2", desc: "다발 한정 훈련의 표준. 엔진 고장 시 Vmc 관리가 핵심." },
  da62: { first: 2012, crew: 1, pax: 6, range: 1280, eng: "Austro AE330 180 hp ×2", desc: "디젤 쌍발 복합재 투어러. G1000 NXi + GFC700." },
  c208: { first: 1982, crew: 1, pax: 13, range: 912, eng: "P&W PT6A-140 867 shp", desc: "고정 기어 단발 터보프롭 다목적기. 화물·여객·수상기." },
  kodiak: { first: 2004, crew: 1, pax: 9, range: 1132, eng: "P&W PT6A-34 750 shp", desc: "험지 STOL 성능의 단발 터보프롭 유틸리티기." },
  tbm930: { first: 2016, crew: 1, pax: 5, range: 1730, eng: "P&W PT6A-66D 850 shp", desc: "330 KTAS로 순항하는 가장 빠른 단발 터보프롭 중 하나. G3000." },
  pc12: { first: 1991, crew: 1, pax: 9, range: 1803, eng: "P&W PT6E-67XP 1,200 shp", desc: "전자식 출력 제어와 오토스로틀을 갖춘 단발 터보프롭." },
  king350: { first: 1988, crew: 2, pax: 11, range: 1806, eng: "P&W PT6A-60A 1,050 shp ×2", desc: "가장 많이 팔린 쌍발 터보프롭 비즈니스기의 대형 버전." },
  dhc6: { first: 1965, crew: 2, pax: 19, range: 775, eng: "P&W PT6A-27 620 shp ×2", desc: "험지·수상·스키 운용이 가능한 STOL 통근기." },
  atr72: { first: 1988, crew: 2, pax: 72, range: 825, eng: "P&W PW127M 2,750 shp ×2", desc: "가장 많이 운용되는 지역 터보프롭 여객기. A/T 없음, 수동 출력 관리." },
  q400: { first: 1998, crew: 2, pax: 78, range: 1100, eng: "P&W PW150A 5,071 shp ×2", desc: "360 KTAS의 고속 지역 터보프롭." },
  sf50: { first: 2014, crew: 1, pax: 6, range: 1275, eng: "Williams FJ33-5A 1,846 lbf", desc: "단발 개인용 제트. V-테일과 동체 상부 엔진." },
  hondajet: { first: 2003, crew: 1, pax: 6, range: 1437, eng: "GE Honda HF120 2,050 lbf ×2", desc: "주익 상면 엔진 장착(OTWEM)으로 항력을 줄인 초경량 제트." },
  cj4: { first: 2008, crew: 1, pax: 9, range: 2165, eng: "Williams FJ44-4A 3,621 lbf ×2", desc: "단일 조종사 인증 비즈니스 제트. Collins Pro Line 21." },
  longitude: { first: 2016, crew: 2, pax: 12, range: 3500, eng: "Honeywell HTF7700L 7,665 lbf ×2", desc: "슈퍼 미드사이즈 비즈니스 제트, 오토스로틀 장착." },
  g650: { first: 2009, crew: 2, pax: 19, range: 7500, eng: "Rolls-Royce BR725 16,900 lbf ×2", desc: "Mach 0.925 최대 운용 속도의 장거리 비즈니스 제트." },
  crj700: { first: 1999, crew: 2, pax: 78, range: 1378, eng: "GE CF34-8C5 13,790 lbf ×2", desc: "후방 엔진 T-테일 리저널 제트. A/T 없음." },
  e175: { first: 2003, crew: 2, pax: 88, range: 2200, eng: "GE CF34-8E 14,200 lbf ×2", desc: "북미 지역 노선의 주력 리저널 제트." },
  a320: { first: 2014, crew: 2, pax: 180, range: 3400, eng: "CFM LEAP-1A26 27,120 lbf ×2", desc: "플라이바이와이어 노멀 로 — 받음각/뱅크/피치 보호, 사이드스틱, 비연동 추력 레버." },
  a321: { first: 2016, crew: 2, pax: 220, range: 3500, eng: "CFM LEAP-1A33 33,110 lbf ×2", desc: "A320 계열의 동체 연장형. 높은 이륙 중량과 긴 회전 속도." },
  b738: { first: 1997, crew: 2, pax: 189, range: 2935, eng: "CFM56-7B27 27,300 lbf ×2", desc: "가장 많이 운용되는 제트 여객기 계열. 요크와 기계식 트림." },
  b38m: { first: 2016, crew: 2, pax: 189, range: 3550, eng: "CFM LEAP-1B28 29,317 lbf ×2", desc: "AT 윙렛과 LEAP 엔진의 737 최신형." },
  a310: { first: 1982, crew: 2, pax: 220, range: 5150, eng: "GE CF6-80C2A2 53,500 lbf ×2", desc: "2인 승무 광동체 개척기. 아날로그/초기 글라스 혼합 조종실." },
  a330: { first: 2017, crew: 2, pax: 287, range: 7200, eng: "Rolls-Royce Trent 7000 72,834 lbf ×2", desc: "A330neo — 새 날개와 Trent 7000." },
  a350: { first: 2013, crew: 2, pax: 315, range: 8100, eng: "Rolls-Royce Trent XWB-84 84,200 lbf ×2", desc: "탄소 복합재 동체·날개. 가변 캠버 날개." },
  a380: { first: 2005, crew: 2, pax: 555, range: 8000, eng: "Rolls-Royce Trent 970 70,000 lbf ×4", desc: "세계 최대 여객기. 전 층 2층 동체." },
  b748: { first: 2010, crew: 2, pax: 410, range: 7730, eng: "GE GEnx-2B67 66,500 lbf ×4", desc: "점보 제트의 최종형. 연장된 2층 덱과 레이크드 윙팁." },
  b77w: { first: 2003, crew: 2, pax: 396, range: 7370, eng: "GE90-115B 115,300 lbf ×2", desc: "세계 최대 추력 터보팬 GE90-115B 장착 장거리 쌍발기." },
  b789: { first: 2013, crew: 2, pax: 296, range: 7530, eng: "GE GEnx-1B74 74,100 lbf ×2", desc: "복합재 동체의 장거리 효율기. 날개 휨이 큰 고종횡비 날개." },
  concorde: { first: 1969, crew: 3, pax: 100, range: 3900, eng: "RR/Snecma Olympus 593 Mk610 ×4 (애프터버너)", desc: "Mach 2.04 초음속 여객기. 오지브 델타익, 드룹 노즈, 연료 이송 트림." },
  fa18: { first: 1995, crew: 1, pax: 0, range: 1275, eng: "GE F414-GE-400 ×2 (A/B 22,000 lbf)", desc: "함재 다목적 전투기. 디지털 FBW, 고받음각 기동." },
  f16: { first: 1974, crew: 1, pax: 0, range: 2280, eng: "GE F110-GE-129 (A/B 29,100 lbf)", desc: "최초의 정적 불안정 FBW 전투기. 사이드스틱, 9 G 한계." },
  ls8: { first: 1994, crew: 1, pax: 0, range: 0, eng: "없음 (활공)", desc: "18 m 클래스 고성능 단좌 글라이더. 최대 활공비 약 48:1." },
  dg1001: { first: 2000, crew: 2, pax: 0, range: 0, eng: "없음 (활공)", desc: "20 m 복좌 훈련·크로스컨트리 글라이더." },
  h125: { first: 1974, crew: 1, pax: 5, range: 340, eng: "Safran Arriel 2D 952 shp", desc: "고고도 성능이 뛰어난 단발 헬리콥터. 에베레스트 착륙 기록." },
  h135: { first: 1994, crew: 1, pax: 6, range: 330, eng: "P&W PW206B3 ×2", desc: "응급의료·경찰 표준 쌍발 경헬기. 페네스트론 꼬리 로터." },
  b407: { first: 1995, crew: 1, pax: 6, range: 324, eng: "RR M250-C47B 813 shp", desc: "4엽 로터의 단발 다목적 헬리콥터." },
  cabri: { first: 2005, crew: 1, pax: 1, range: 380, eng: "Lycoming O-360 145 hp", desc: "자동회전 안전성이 높은 2인승 훈련 헬리콥터." },
};

// ------------------------------------------------------------------ liveries
// body: fuselage, belly: lower fuselage, cheat: cheatline(s), tail: fin colour,
// tailArt: 'solid' | 'band' | 'stripe' | 'swoosh' | 'disc', engine: nacelle colour,
// title/titleColor: fuselage titles, reg: registration.
const L = (name, o) => ({ name, body: "#f3f4f6", belly: "#c9ced6", cheat: null, cheat2: null, tail: "#1d2c5e", tailArt: "solid", tail2: null, engine: "#d9dce1", title: "", titleColor: "#1d2c5e", reg: "", wing: "#c7ccd3", ...o });

const HOUSE = {
  Airbus: L("Airbus House", { tail: "#00205b", tailArt: "swoosh", tail2: "#00aeef", belly: "#f3f4f6", title: "AIRBUS", titleColor: "#00205b", reg: "F-WNEO", engine: "#00205b" }),
  Boeing: L("Boeing House", { tail: "#0b3d91", tailArt: "swoosh", tail2: "#4f9fe0", belly: "#0b3d91", cheat: "#4f9fe0", title: "BOEING", titleColor: "#0b3d91", reg: "N7378X" }),
  Embraer: L("Embraer House", { tail: "#0e2c5a", tailArt: "band", tail2: "#2fa8d8", title: "EMBRAER", reg: "PR-XQE" }),
  Bombardier: L("Bombardier House", { tail: "#111", tailArt: "solid", title: "BOMBARDIER", titleColor: "#111", reg: "C-FCRJ" }),
  ATR: L("ATR House", { tail: "#0056a3", tailArt: "band", tail2: "#58b947", title: "ATR", titleColor: "#0056a3", reg: "F-WWEY" }),
};

const AIRLINES = {
  korean: L("Korean Air 스타일", { body: "#9fd1ec", belly: "#d9dde3", cheat: "#c0c6cf", tail: "#f3f4f6", tailArt: "disc", tail2: "#0b5aa8", title: "KOREAN AIR", titleColor: "#123b7a", reg: "HL8001", engine: "#9fd1ec" }),
  asiana: L("Asiana 스타일", { tail: "#5b5f66", tailArt: "stripe", tail2: "#e1a12b", belly: "#8f9399", title: "ASIANA AIRLINES", titleColor: "#4a4d52", reg: "HL7700", engine: "#5b5f66" }),
  jeju: L("Jeju Air 스타일", { tail: "#ff6a13", tailArt: "solid", title: "JEJU AIR", titleColor: "#ff6a13", reg: "HL8086", engine: "#ff6a13" }),
  lufthansa: L("Lufthansa 스타일", { tail: "#0a1d3d", tailArt: "disc", tail2: "#f2f2f2", belly: "#0a1d3d", title: "Lufthansa", titleColor: "#0a1d3d", reg: "D-AINA", engine: "#0a1d3d" }),
  emirates: L("Emirates 스타일", { tail: "#f3f4f6", tailArt: "flag", tail2: "#d71921", title: "Emirates", titleColor: "#c8102e", reg: "A6-EEA", engine: "#e6e6e6" }),
  singapore: L("Singapore 스타일", { tail: "#1c2a5b", tailArt: "swoosh", tail2: "#f2b33d", cheat: "#1c2a5b", cheat2: "#f2b33d", title: "SINGAPORE AIRLINES", titleColor: "#1c2a5b", reg: "9V-SMA" }),
  british: L("British Airways 스타일", { tail: "#f3f4f6", tailArt: "flag", tail2: "#0a2f6b", belly: "#0a2f6b", cheat: "#c8102e", title: "BRITISH AIRWAYS", titleColor: "#0a2f6b", reg: "G-XLEA" }),
  cathay: L("Cathay 스타일", { tail: "#006564", tailArt: "swoosh", tail2: "#f3f4f6", cheat: "#006564", title: "CATHAY PACIFIC", titleColor: "#006564", reg: "B-LRA" }),
  ryanair: L("Ryanair 스타일", { body: "#f3f4f6", belly: "#07357a", tail: "#07357a", tailArt: "disc", tail2: "#f1c933", title: "RYANAIR", titleColor: "#07357a", reg: "EI-DCL", engine: "#07357a" }),
  southwest: L("Southwest 스타일", { body: "#304cb2", belly: "#c4161c", cheat: "#ffbf27", tail: "#304cb2", tailArt: "band", tail2: "#c4161c", title: "Southwest", titleColor: "#f3f4f6", reg: "N8701Q", engine: "#c4c9d1" }),
  easy: L("Orange Low-cost 스타일", { body: "#f3f4f6", tail: "#ff6600", tailArt: "solid", belly: "#ff6600", title: "easy", titleColor: "#ff6600", reg: "G-UZHA", engine: "#ff6600" }),
  delta: L("Delta 스타일", { body: "#f3f4f6", belly: "#0b2a5b", tail: "#0b2a5b", tailArt: "swoosh", tail2: "#c8102e", title: "DELTA", titleColor: "#0b2a5b", reg: "N101DQ", engine: "#0b2a5b" }),
  airfrance: L("Air France 스타일", { tail: "#f3f4f6", tailArt: "stripe", tail2: "#002157", title: "AIR FRANCE", titleColor: "#002157", reg: "F-HTYA" }),
  ana: L("ANA 스타일", { tail: "#0b3b8c", tailArt: "solid", cheat: "#0b3b8c", cheat2: "#2fa3dd", title: "ANA", titleColor: "#0b3b8c", reg: "JA891A" }),
  jal: L("JAL 스타일", { tail: "#f3f4f6", tailArt: "disc", tail2: "#c8102e", title: "JAPAN AIRLINES", titleColor: "#222", reg: "JA861J" }),
  qantas: L("Qantas 스타일", { tail: "#e40000", tailArt: "solid", title: "QANTAS", titleColor: "#e40000", reg: "VH-ZNA" }),
  cargo: L("Cargo 스타일", { tail: "#4b2e83", tailArt: "solid", title: "CARGO", titleColor: "#4b2e83", reg: "N401FX", engine: "#bfc4cc" }),
  bafr: L("BA/AF 콩코드 스타일", { tail: "#f3f4f6", tailArt: "flag", tail2: "#0a2f6b", cheat: "#c8102e", title: "CONCORDE", titleColor: "#0a2f6b", reg: "G-BOAC" }),
};

const GA = {
  red: L("Factory Red", { tail: "#b3202a", cheat: "#b3202a", belly: "#f3f4f6", engine: "#f3f4f6", reg: "HL1172", titleColor: "#b3202a" }),
  blue: L("Factory Blue", { tail: "#1d2c5e", cheat: "#1d2c5e", cheat2: "#4f9fe0", belly: "#f3f4f6", engine: "#f3f4f6", reg: "N172SP" }),
  gold: L("Classic Gold", { tail: "#b8862b", cheat: "#b8862b", cheat2: "#4a3010", belly: "#f3f4f6", engine: "#f3f4f6", reg: "N5123G" }),
  school: L("Flight School", { tail: "#0b6e4f", cheat: "#0b6e4f", belly: "#f3f4f6", title: "AERO ACADEMY", titleColor: "#0b6e4f", engine: "#f3f4f6", reg: "HL1234" }),
  cubyellow: L("Cub Yellow", { body: "#f2c230", belly: "#f2c230", tail: "#f2c230", cheat: "#111", engine: "#f2c230", reg: "NC3021" }),
  silver: L("Natural Metal", { body: "#c8ccd1", belly: "#b5bac0", tail: "#c8ccd1", cheat: "#1a1a1a", engine: "#c8ccd1", reg: "44-14111", tailArt: "band", tail2: "#f2c230" }),
  navy: L("Military Grey", { body: "#6a7078", belly: "#8a9099", tail: "#5d636b", engine: "#5d636b", wing: "#6a7078", reg: "166420", titleColor: "#2a2d31", title: "NAVY" }),
  usaf: L("USAF Viper Grey", { body: "#7c838c", belly: "#9aa1a9", tail: "#6b727a", engine: "#6b727a", wing: "#7c838c", reg: "AF 91-0400", titleColor: "#2a2d31", title: "" }),
  medevac: L("Medical Red", { body: "#c8102e", belly: "#f3f4f6", tail: "#f3f4f6", cheat: "#f3f4f6", engine: "#c8102e", title: "AIR RESCUE", titleColor: "#f3f4f6", reg: "D-HDRK" }),
  police: L("Police Blue", { body: "#0b2a5b", belly: "#f3f4f6", tail: "#f3f4f6", cheat: "#f3c300", engine: "#0b2a5b", title: "POLICE", titleColor: "#f3f4f6", reg: "HL9500" }),
  glider: L("Glider White", { body: "#f7f7f7", belly: "#f7f7f7", tail: "#f7f7f7", tailArt: "band", tail2: "#c8102e", engine: "#f7f7f7", reg: "D-1234" }),
};

const BY_ID = {
  a320: ["Airbus", "korean", "asiana", "jeju", "lufthansa", "easy", "delta"],
  a321: ["Airbus", "korean", "asiana", "lufthansa", "delta", "jeju"],
  b738: ["Boeing", "jeju", "korean", "ryanair", "southwest", "delta"],
  b38m: ["Boeing", "korean", "southwest", "ryanair", "jeju"],
  a310: ["Airbus", "airfrance", "lufthansa", "cargo"],
  a330: ["Airbus", "korean", "delta", "airfrance", "cathay"],
  a350: ["Airbus", "korean", "asiana", "singapore", "cathay", "lufthansa", "airfrance", "jal"],
  a380: ["Airbus", "korean", "asiana", "emirates", "singapore", "british", "lufthansa", "qantas"],
  b748: ["Boeing", "korean", "lufthansa", "cargo"],
  b77w: ["Boeing", "korean", "asiana", "emirates", "cathay", "ana", "jal", "airfrance"],
  b789: ["Boeing", "korean", "british", "ana", "jal", "qantas", "singapore"],
  e175: ["Embraer", "delta", "lufthansa"],
  crj700: ["Bombardier", "delta", "lufthansa"],
  atr72: ["ATR", "jeju", "airfrance"],
  q400: ["Bombardier", "qantas", "ana"],
  concorde: ["bafr", "airfrance", "british"],
  fa18: ["navy"],
  f16: ["usaf"],
  j3: ["cubyellow", "red"],
  p51: ["silver"],
  dc3: ["silver", "blue", "red"],
  ls8: ["glider"],
  dg1001: ["glider"],
  h125: ["red", "police", "medevac"],
  h135: ["medevac", "police", "blue"],
  b407: ["blue", "police", "medevac"],
  cabri: ["school", "blue"],
};

export function liveriesFor(spec) {
  const ids = BY_ID[spec.id] || (["bizjet"].includes(spec.cat) ? ["blue", "gold", "red"] : ["blue", "red", "school", "gold"]);
  return ids.map((k) => {
    const base = HOUSE[k] || AIRLINES[k] || GA[k];
    return { id: k, ...base, reg: base.reg || "N" + spec.id.toUpperCase() };
  });
}

// Squad generation, attributes, formations and lineup selection.
import { CLUB_BY_ID } from './data/leagues.js';

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- name pools ----------
const POOLS = {
  ENG: [['James', 'Harry', 'Jack', 'Oliver', 'George', 'Charlie', 'Tom', 'Ben', 'Sam', 'Luke', 'Callum', 'Josh', 'Ryan', 'Lewis', 'Jordan', 'Mason', 'Kyle', 'Alfie', 'Reece', 'Connor'], ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Walker', 'Wright', 'Hughes', 'Clarke', 'Hall', 'Green', 'Wood', 'Turner', 'Baker', 'Cooper', 'Harris', 'Ward', 'Morris', 'King', 'Bennett', 'Palmer', 'Barnes', 'Fisher', 'Chapman', 'Holmes']],
  SCO: [['Callum', 'Scott', 'Lewis', 'Ryan', 'Kieran', 'Ross', 'Craig', 'Andy', 'Liam', 'Stuart', 'Grant', 'Fraser'], ['McLean', 'Campbell', 'Stewart', 'MacDonald', 'Murray', 'Reid', 'Robertson', 'Paterson', 'Fraser', 'McKenna', 'Ferguson', 'Hendry', 'Christie', 'Gordon', 'Kerr']],
  ESP: [['Pablo', 'Sergio', 'Álvaro', 'Javier', 'Carlos', 'Daniel', 'Adrián', 'Iván', 'Marcos', 'Raúl', 'Hugo', 'Diego', 'Mario', 'Rubén', 'Aitor', 'Jorge', 'Unai', 'Iker', 'Óscar', 'Víctor'], ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Molina', 'Castro']],
  ITA: [['Marco', 'Luca', 'Alessandro', 'Andrea', 'Matteo', 'Lorenzo', 'Davide', 'Simone', 'Federico', 'Riccardo', 'Giacomo', 'Stefano', 'Nicolò', 'Filippo', 'Gabriele', 'Tommaso'], ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana']],
  GER: [['Lukas', 'Leon', 'Felix', 'Jonas', 'Maximilian', 'Paul', 'Niklas', 'Tim', 'Jan', 'Florian', 'Tobias', 'Moritz', 'Julian', 'Kevin', 'Marvin', 'Nico', 'David', 'Philipp'], ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner']],
  FRA: [['Lucas', 'Hugo', 'Théo', 'Nathan', 'Mathis', 'Enzo', 'Louis', 'Clément', 'Maxime', 'Antoine', 'Kylian', 'Yanis', 'Rayan', 'Adrien', 'Florian', 'Jordan', 'Moussa', 'Ibrahima'], ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Fontaine', 'Rousseau', 'Diallo', 'Traoré', 'Camara', 'Koné', 'Mendy', 'Sylla']],
  NED: [['Daan', 'Sem', 'Lucas', 'Milan', 'Levi', 'Thijs', 'Jesse', 'Bram', 'Stijn', 'Ruben', 'Luuk', 'Joey', 'Kenneth', 'Mats'], ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker']],
  POR: [['João', 'Pedro', 'Diogo', 'Tiago', 'Rui', 'Gonçalo', 'André', 'Rafael', 'Bruno', 'Nuno', 'Francisco', 'Miguel', 'Ricardo', 'Vítor'], ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira']],
  BRA: [['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Rafael', 'Vinícius', 'Thiago', 'Bruno', 'Felipe', 'Guilherme', 'Gustavo', 'Caio', 'Igor', 'Wesley', 'Douglas', 'Everton', 'Renan', 'Diego'], ['Silva', 'Souza', 'Santos', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Ribeiro', 'Almeida', 'Carvalho', 'Nascimento', 'Araújo', 'Barbosa', 'Rocha', 'Moura', 'Cardoso', 'Teixeira', 'Mendes']],
  ARG: [['Lautaro', 'Julián', 'Facundo', 'Nicolás', 'Matías', 'Gonzalo', 'Franco', 'Agustín', 'Santiago', 'Tomás', 'Ezequiel', 'Leandro'], ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sosa', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Giménez']],
  KOR: [['민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '준서', '현우', '지훈', '건우', '우진', '선우', '민재', '태민', '승현', '동현', '재원', '성민'], ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '홍', '전']],
  JPN: [['Takumi', 'Kaoru', 'Daichi', 'Yuki', 'Ritsu', 'Shogo', 'Kento', 'Riku', 'Sota', 'Haruto', 'Ren', 'Yuto'], ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Matsumoto', 'Inoue', 'Kimura']],
  KSA: [['Mohammed', 'Abdullah', 'Faisal', 'Salem', 'Saud', 'Sultan', 'Nawaf', 'Fahad', 'Hassan', 'Ali', 'Turki', 'Khalid', 'Yasser', 'Majed'], ['Al-Dawsari', 'Al-Shahrani', 'Al-Ghamdi', 'Al-Qahtani', 'Al-Harbi', 'Al-Otaibi', 'Al-Zahrani', 'Al-Malki', 'Al-Shehri', 'Al-Amri', 'Al-Buraikan', 'Kanno', 'Al-Faraj', 'Al-Najei']],
  TUR: [['Emre', 'Mert', 'Burak', 'Can', 'Kerem', 'Arda', 'Hakan', 'Ozan', 'Cenk', 'Oğuz', 'Yusuf', 'Berk'], ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Koç']],
  USA: [['Tyler', 'Brandon', 'Chris', 'Matt', 'Josh', 'Brenden', 'Cole', 'Jake', 'Aidan', 'Caleb', 'Ethan', 'Logan'], ['Johnson', 'Williams', 'Miller', 'Davis', 'Anderson', 'Thompson', 'Moore', 'Jackson', 'White', 'Martin', 'Robinson', 'Lewis', 'Allen', 'Young', 'Adams', 'Nelson']],
  AFR: [['Moussa', 'Ibrahim', 'Amadou', 'Kwame', 'Samuel', 'Emmanuel', 'Ousmane', 'Cheikh', 'Victor', 'Yaw', 'Abdou', 'Joseph', 'Sadio', 'Kelechi'], ['Diallo', 'Traoré', 'Koné', 'Mensah', 'Osei', 'Okafor', 'Ndiaye', 'Sarr', 'Touré', 'Bamba', 'Adeyemi', 'Boateng', 'Diop', 'Keita', 'Eze', 'Owusu']],
  BAL: [['Luka', 'Marko', 'Ivan', 'Nikola', 'Stefan', 'Filip', 'Josip', 'Dušan', 'Mateo', 'Ante', 'Milan', 'Petar'], ['Petrović', 'Jovanović', 'Horvat', 'Kovačević', 'Babić', 'Marić', 'Nikolić', 'Perić', 'Pavlović', 'Knežević', 'Vuković', 'Radić']],
  SCA: [['Erik', 'Mikkel', 'Lars', 'Anders', 'Oscar', 'Emil', 'Viktor', 'Jonas', 'Kasper', 'Magnus', 'Sander', 'Henrik'], ['Hansen', 'Johansson', 'Nielsen', 'Andersen', 'Larsen', 'Olsen', 'Karlsson', 'Lindqvist', 'Berg', 'Holm', 'Dahl', 'Strand']],
};
const NAT_POOL = { ENG: 'ENG', WAL: 'ENG', NIR: 'ENG', IRL: 'ENG', SCO: 'SCO', ESP: 'ESP', ITA: 'ITA', GER: 'GER', AUT: 'GER', SUI: 'GER', FRA: 'FRA', BEL: 'FRA', NED: 'NED', POR: 'POR', BRA: 'BRA', ARG: 'ARG', URU: 'ARG', COL: 'ARG', MEX: 'ARG', KOR: 'KOR', JPN: 'JPN', KSA: 'KSA', TUR: 'TUR', USA: 'USA', CAN: 'USA', SEN: 'AFR', NGA: 'AFR', GHA: 'AFR', CIV: 'AFR', CMR: 'AFR', MLI: 'AFR', CRO: 'BAL', SRB: 'BAL', SVN: 'BAL', DEN: 'SCA', NOR: 'SCA', SWE: 'SCA' };
const FOREIGN = ['BRA', 'FRA', 'ESP', 'ARG', 'POR', 'NED', 'SEN', 'NGA', 'CRO', 'DEN', 'GER', 'ENG', 'USA', 'JPN', 'SRB', 'GHA', 'SWE', 'URU', 'COL', 'KOR'];

export function genName(r, nat) {
  const pool = POOLS[NAT_POOL[nat] || 'ENG'];
  const f = pick(r, pool[0]), l = pick(r, pool[1]);
  return nat === 'KOR' ? `${l}${f}` : `${f} ${l}`;
}

// ---------- positions & attributes ----------
export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
export const POS_GROUP = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD' };
// attr offsets from overall: [pac, sho, pas, dri, def, phy]
const PROFILE = {
  GK: [0, 0, 0, 0, 0, 0],
  CB: [-12, -30, -12, -15, 4, 3],
  LB: [4, -22, -5, -4, -2, -6],
  RB: [4, -22, -5, -4, -2, -6],
  CDM: [-10, -14, -2, -6, 1, 2],
  CM: [-6, -8, 2, -1, -12, -4],
  CAM: [-2, -3, 2, 3, -35, -12],
  LM: [5, -7, -2, 1, -30, -10],
  RM: [5, -7, -2, 1, -30, -10],
  LW: [6, -3, -4, 3, -40, -12],
  RW: [6, -3, -4, 3, -40, -12],
  ST: [2, 3, -10, -2, -45, -2],
};
export const ATTR_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
export const ATTR_LABELS = { pac: 'PAC', sho: 'SHO', pas: 'PAS', dri: 'DRI', def: 'DEF', phy: 'PHY' };
export const GK_LABELS = { pac: 'DIV', sho: 'HAN', pas: 'KIC', dri: 'REF', def: 'SPD', phy: 'POS' };

export function makeAttrs(r, pos, ovr) {
  const prof = PROFILE[pos] || PROFILE.CM;
  const a = {};
  ATTR_KEYS.forEach((k, i) => {
    let v = ovr + prof[i] + Math.round((r() - 0.5) * 10);
    if (pos === 'GK') v = ovr + Math.round((r() - 0.5) * 8) - (k === 'def' ? 25 : 0) - (k === 'pas' ? 8 : 0);
    a[k] = clamp(v, 20, 99);
  });
  return a;
}
export function calcOvr(pos, a) {
  const w = {
    GK: [0.24, 0.22, 0.05, 0.25, 0.02, 0.22], CB: [0.08, 0.02, 0.1, 0.08, 0.5, 0.22],
    LB: [0.22, 0.03, 0.17, 0.16, 0.3, 0.12], RB: [0.22, 0.03, 0.17, 0.16, 0.3, 0.12],
    CDM: [0.06, 0.06, 0.24, 0.14, 0.32, 0.18], CM: [0.1, 0.12, 0.34, 0.26, 0.1, 0.08],
    CAM: [0.12, 0.2, 0.3, 0.34, 0.0, 0.04], LM: [0.24, 0.14, 0.24, 0.3, 0.02, 0.06], RM: [0.24, 0.14, 0.24, 0.3, 0.02, 0.06],
    LW: [0.26, 0.2, 0.18, 0.34, 0.0, 0.02], RW: [0.26, 0.2, 0.18, 0.34, 0.0, 0.02], ST: [0.2, 0.42, 0.06, 0.2, 0.0, 0.12],
  }[pos] || [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
  let s = 0; ATTR_KEYS.forEach((k, i) => s += a[k] * w[i]);
  const bias = { GK: 1, CB: 1.2, LB: 2.5, RB: 2.5, CDM: 2, CM: 2.6, CAM: -0.4, LM: 1.2, RM: 1.2, LW: -1.1, RW: -1.1, ST: -0.4 }[pos] ?? 0;
  return clamp(Math.round(s + bias), 30, 99);
}
export function playerValue(ovr, age) {
  const base = 150 * Math.exp((ovr - 90) * 0.16); // millions € (90 OVR prime ≈ €150M)
  const ageF = age <= 21 ? 1.5 : age <= 25 ? 1.3 : age <= 29 ? 1 : age <= 32 ? 0.55 : 0.25;
  return Math.max(0.1, Math.round(base * ageF * 10) / 10);
}

// Squad template: 25 players
const TEMPLATE = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'CDM', 'CDM', 'CM', 'CM', 'CM', 'CAM', 'CAM', 'LW', 'RW', 'LM', 'RM', 'ST', 'ST', 'ST'];

function parseStars(str) {
  if (!str) return [];
  return str.split(';').map(s => s.split(',')).filter(p => p.length >= 5 && +p[2] > 0)
    .map(([name, pos, ovr, nat, age]) => ({ name: name.trim(), pos, ovr: +ovr, nat, age: +age }));
}

const squadCache = new Map();
export function generateSquad(clubId) {
  if (squadCache.has(clubId)) return JSON.parse(JSON.stringify(squadCache.get(clubId)));
  const club = CLUB_BY_ID[clubId];
  if (!club) throw new Error('unknown club ' + clubId);
  const r = rng(hashStr(clubId + '#sf2027'));
  const players = [];
  const stars = parseStars(club.stars);
  const remaining = TEMPLATE.slice();
  for (const s of stars) {
    const a = makeAttrs(r, s.pos, s.ovr);
    const p = { id: `${clubId}-${players.length}`, name: s.name, pos: s.pos, nat: s.nat, age: s.age, attrs: a, ovr: s.ovr, pot: Math.max(s.ovr, s.ovr + Math.max(0, 24 - s.age) * 2), star: true };
    players.push(p);
    const ix = remaining.indexOf(s.pos);
    if (ix >= 0) remaining.splice(ix, 1);
    else { // remove a same-group slot
      const g = POS_GROUP[s.pos];
      const j = remaining.findIndex(x => POS_GROUP[x] === g);
      if (j >= 0) remaining.splice(j, 1);
    }
  }
  while (players.length < 23 && remaining.length) {
    const pos = remaining.shift();
    const starterish = players.length < 16;
    const spread = starterish ? 4 : 9;
    const ovr = clamp(Math.round(club.ovr - 3 - r() * spread + (stars.length ? -2 : 0)), 45, 90);
    const nat = r() < 0.62 ? club.nat : pick(r, FOREIGN);
    const age = 17 + Math.floor(r() * 17);
    const a = makeAttrs(r, pos, ovr);
    players.push({ id: `${clubId}-${players.length}`, name: genName(r, nat), pos, nat, age, attrs: a, ovr: calcOvr(pos, a), pot: clamp(ovr + Math.max(0, 25 - age) * (1 + Math.floor(r() * 3)), ovr, 94) });
  }
  // shirt numbers
  const used = new Set();
  const pref = { GK: [1, 13, 31], CB: [4, 5, 6, 15, 3], LB: [3, 12, 21], RB: [2, 22, 24], CDM: [6, 16, 14], CM: [8, 18, 20], CAM: [10, 23, 19], LM: [11, 17], RM: [7, 27], LW: [11, 7, 17], RW: [7, 11, 27], ST: [9, 19, 29, 99] };
  players.sort((a, b) => b.ovr - a.ovr);
  for (const p of players) {
    let n = (pref[p.pos] || []).find(x => !used.has(x));
    if (!n) { n = 30; while (used.has(n)) n++; }
    used.add(n); p.num = n;
    p.value = playerValue(p.ovr, p.age);
    p.wage = Math.round(p.value * 3 + 5); // k€/week
  }
  squadCache.set(clubId, players);
  return JSON.parse(JSON.stringify(players));
}

export function teamRating(players) {
  const xi = pickLineup(players, '4-3-3').xi;
  return Math.round(xi.reduce((s, p) => s + p.ovr, 0) / xi.length);
}

// ---------- formations ----------
// slot: [pos, depth (0 own goal .. 1 opp goal), width (-1 left .. 1 right)]
export const FORMATIONS = {
  '4-3-3': [['GK', .02, 0], ['LB', .22, -.78], ['CB', .18, -.28], ['CB', .18, .28], ['RB', .22, .78], ['CDM', .34, 0], ['CM', .44, -.4], ['CM', .44, .4], ['LW', .64, -.75], ['ST', .7, 0], ['RW', .64, .75]],
  '4-4-2': [['GK', .02, 0], ['LB', .22, -.78], ['CB', .18, -.28], ['CB', .18, .28], ['RB', .22, .78], ['LM', .44, -.75], ['CM', .4, -.22], ['CM', .4, .22], ['RM', .44, .75], ['ST', .68, -.2], ['ST', .68, .2]],
  '4-2-3-1': [['GK', .02, 0], ['LB', .22, -.78], ['CB', .18, -.28], ['CB', .18, .28], ['RB', .22, .78], ['CDM', .34, -.22], ['CDM', .34, .22], ['LW', .56, -.72], ['CAM', .54, 0], ['RW', .56, .72], ['ST', .7, 0]],
  '4-1-2-1-2': [['GK', .02, 0], ['LB', .22, -.75], ['CB', .18, -.28], ['CB', .18, .28], ['RB', .22, .75], ['CDM', .32, 0], ['CM', .43, -.4], ['CM', .43, .4], ['CAM', .55, 0], ['ST', .68, -.2], ['ST', .68, .2]],
  '3-5-2': [['GK', .02, 0], ['CB', .18, -.45], ['CB', .16, 0], ['CB', .18, .45], ['LM', .42, -.82], ['CDM', .34, 0], ['CM', .44, -.35], ['CM', .44, .35], ['RM', .42, .82], ['ST', .68, -.2], ['ST', .68, .2]],
  '3-4-3': [['GK', .02, 0], ['CB', .18, -.45], ['CB', .16, 0], ['CB', .18, .45], ['LM', .42, -.8], ['CM', .4, -.25], ['CM', .4, .25], ['RM', .42, .8], ['LW', .64, -.6], ['ST', .7, 0], ['RW', .64, .6]],
  '5-3-2': [['GK', .02, 0], ['LB', .26, -.85], ['CB', .17, -.45], ['CB', .15, 0], ['CB', .17, .45], ['RB', .26, .85], ['CM', .4, -.4], ['CDM', .36, 0], ['CM', .4, .4], ['ST', .66, -.2], ['ST', .66, .2]],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

const COMPAT = {
  GK: { GK: 1 }, CB: { CB: 1, CDM: .85, LB: .8, RB: .8 }, LB: { LB: 1, LM: .88, RB: .85, CB: .8, LW: .75 }, RB: { RB: 1, RM: .88, LB: .85, CB: .8, RW: .75 },
  CDM: { CDM: 1, CM: .94, CB: .85 }, CM: { CM: 1, CDM: .94, CAM: .94, LM: .85, RM: .85 }, CAM: { CAM: 1, CM: .93, LW: .88, RW: .88, ST: .86 },
  LM: { LM: 1, LW: .96, LB: .85, CM: .85, RM: .9 }, RM: { RM: 1, RW: .96, RB: .85, CM: .85, LM: .9 }, LW: { LW: 1, LM: .96, RW: .92, CAM: .88, ST: .86 },
  RW: { RW: 1, RM: .96, LW: .92, CAM: .88, ST: .86 }, ST: { ST: 1, CAM: .86, LW: .84, RW: .84 },
};
export function fitRating(p, slotPos) {
  const c = (COMPAT[slotPos] || {})[p.pos] ?? (p.pos === 'GK' || slotPos === 'GK' ? 0.1 : 0.7);
  return p.ovr * c;
}

export function pickLineup(players, formation = '4-3-3', fixed = null) {
  const slots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const avail = players.filter(p => !p.injured && !p.suspended);
  const used = new Set();
  const xi = new Array(slots.length);
  if (fixed && fixed.length === slots.length) {
    fixed.forEach((id, i) => { const p = avail.find(q => q.id === id); if (p && !used.has(p.id)) { xi[i] = p; used.add(p.id); } });
  }
  // greedy: fill scarce slots first (GK, then by best fit)
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a][0] === 'GK' ? -1 : 0) - (slots[b][0] === 'GK' ? -1 : 0));
  for (const i of order) {
    if (xi[i]) continue;
    let best = null, bs = -1;
    for (const p of avail) { if (used.has(p.id)) continue; const s = fitRating(p, slots[i][0]); if (s > bs) { bs = s; best = p; } }
    if (best) { xi[i] = best; used.add(best.id); }
  }
  const bench = avail.filter(p => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, 9);
  return { xi, bench, slots };
}

// Build a match team object used by the simulation
export function buildTeam(clubId, opts = {}) {
  const club = CLUB_BY_ID[clubId];
  const players = opts.players || generateSquad(clubId);
  const formation = opts.formation || '4-3-3';
  const { xi, bench, slots } = pickLineup(players, formation, opts.lineup);
  return {
    club: { id: club.id, name: club.name, short: club.short, c1: club.c1, c2: club.c2, stadium: club.stadium },
    formation, slots: slots.map(s => ({ pos: s[0], d: s[1], w: s[2] })),
    xi: xi.map(p => ({ id: p.id, name: p.name, pos: p.pos, num: p.num, ovr: p.ovr, attrs: p.attrs, nat: p.nat, skin: skinFor(p) })),
    bench: bench.map(p => ({ id: p.id, name: p.name, pos: p.pos, num: p.num, ovr: p.ovr, attrs: p.attrs, nat: p.nat, skin: skinFor(p) })),
  };
}
const DARK = new Set(['SEN', 'NGA', 'GHA', 'CIV', 'CMR', 'MLI', 'GAM', 'COD', 'GUI', 'BFA', 'TOG', 'JAM', 'ANG', 'GAB', 'BEN', 'EQG', 'ZAM', 'MOZ', 'HAI', 'NIG', 'CTA', 'GLP', 'GUF', 'CPV']);
function skinFor(p) {
  const h = hashStr(p.id + p.name);
  if (DARK.has(p.nat)) return 3 + (h % 2);
  if (['BRA', 'COL', 'ECU', 'MAR', 'ALG', 'TUN', 'EGY', 'KSA', 'TUR', 'MEX', 'URU', 'PAR', 'VEN'].includes(p.nat)) return 1 + (h % 3);
  if (['KOR', 'JPN', 'UZB', 'IDN'].includes(p.nat)) return 5;
  return h % 2;
}

// Kit clash helper: returns colors for the away team
export function kitColors(home, away) {
  const d = colorDist(home.c1, away.c1);
  if (d > 120) return { home: [home.c1, home.c2], away: [away.c1, away.c2] };
  const alt = colorDist(home.c1, away.c2) > 120 ? [away.c2, away.c1] : (colorDist(home.c1, '#FFFFFF') > 150 ? ['#FFFFFF', away.c1] : ['#1A1A1A', away.c1]);
  return { home: [home.c1, home.c2], away: alt };
}
export function colorDist(a, b) {
  const pa = hex(a), pb = hex(b);
  return Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2);
}
function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

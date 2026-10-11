// SUPER CLASS mode rules shared by server (authoritative) and client (display):
// card tiers, packs, levels, match types and rewards.

export const MAX_LEVEL = 50;
export const START_COINS = 3000;

// XP needed to go from `level` to `level + 1`
export const xpToNext = (level) => 200 + level * 90;
export const levelUpCoins = (newLevel) => 400 + newLevel * 150;

// ---------- card tiers ----------
export const TIERS = {
  bronze: { name: '브론즈', min: 0, sell: 40 },
  silver: { name: '실버', min: 65, sell: 150 },
  gold: { name: '골드', min: 75, sell: 450 },
  elite: { name: '엘리트', min: 82, sell: 1800 },
  icon: { name: '월드클래스', min: 86, sell: 6000 },
  sc: { name: 'SUPER CLASS', min: 99, sell: 12000 }, // special boosted version
};
export function tierOf(card) {
  if (card.sc) return 'sc';
  const o = card.ovr;
  return o >= 86 ? 'icon' : o >= 82 ? 'elite' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';
}
export const sellValue = (card) => {
  const t = tierOf(card);
  return TIERS[t].sell + Math.max(0, card.ovr - TIERS[t === 'sc' ? 'icon' : t].min) * (t === 'bronze' ? 2 : t === 'silver' ? 15 : 60);
};

// OVR bands used for pack odds
export const BANDS = [[40, 64], [65, 74], [75, 79], [80, 83], [84, 86], [87, 99]];
// packs: cards = number of cards; odds = weights per band; guarantee = [{min, count}]
export const PACKS = [
  { id: 'bronze', name: '브론즈 팩', level: 1, price: 600, cards: 5, color: '#b0743b', desc: '기본 팩. 대부분 브론즈·실버 카드', odds: [70, 26, 4, 0, 0, 0] },
  { id: 'silver', name: '실버 팩', level: 3, price: 1800, cards: 5, color: '#c3ccd6', desc: '실버 위주, 골드 카드 등장', odds: [20, 58, 18, 4, 0, 0], guarantee: [{ min: 65, count: 2 }] },
  { id: 'gold', name: '골드 팩', level: 6, price: 4500, cards: 6, color: '#e5b93b', desc: '골드 카드 1장 이상 보장', odds: [0, 40, 42, 15, 3, 0], guarantee: [{ min: 75, count: 1 }] },
  { id: 'premium', name: '프리미엄 골드 팩', level: 10, price: 10000, cards: 8, color: '#ffd84d', desc: '골드 3장 보장, 80+ 확률 UP', odds: [0, 20, 44, 28, 7, 1], guarantee: [{ min: 75, count: 3 }] },
  { id: 'elite', name: '엘리트 팩', level: 15, price: 22000, cards: 6, color: '#a26bff', desc: '82+ 엘리트 카드 1장 보장', odds: [0, 0, 40, 40, 16, 4], guarantee: [{ min: 82, count: 1 }] },
  { id: 'worldclass', name: '월드클래스 팩', level: 22, price: 45000, cards: 5, color: '#00e0ff', desc: '86+ 월드클래스 카드 1장 보장', odds: [0, 0, 20, 40, 28, 12], guarantee: [{ min: 86, count: 1 }] },
  { id: 'superclass', name: 'SUPER CLASS 팩', level: 30, price: 90000, cards: 3, color: '#ff3c8e', desc: '전원 84+, SUPER CLASS 강화 카드(+3) 등장', odds: [0, 0, 0, 0, 55, 45], guarantee: [{ min: 84, count: 3 }], scChance: 0.22 },
];
export const PACK_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));
export const DAILY_PACK = 'silver'; // free once per day

// ---------- match types ----------
export const MATCH_TYPES = [
  { id: 'friendly', name: '로컬 친선전', icon: '⚔️', desc: '원하는 클럽과 대결. 강한 팀을 이길수록 보상과 경험치가 크게 늘어납니다.', online: false },
  { id: 'ladder', name: 'SC 리그 도전', icon: '🏆', desc: '점점 강해지는 10단계 상대를 차례로 격파. 단계 클리어 보너스 지급.', online: false },
  { id: 'quick', name: '스피드 매치', icon: '⚡', desc: '6분짜리 짧은 경기. 보상은 60%.', online: false },
  { id: 'rank', name: '온라인 랭크전', icon: '🌐', desc: '내 SC 스쿼드로 다른 플레이어와 실시간 대결. 랭크 포인트 획득.', online: true },
  { id: 'room', name: '온라인 친선방', icon: '🔒', desc: '방 코드로 친구와 SC 스쿼드 대결.', online: true },
];

// difficulty multiplier (index 0..4)
export const DIFF_MULT = [0.6, 0.8, 1, 1.25, 1.55];

// strength multiplier: beating stronger teams gives much more
export function strengthMult(myOvr, oppOvr) {
  return Math.max(0.5, Math.min(3, 1 + (oppOvr - myOvr) * 0.09));
}

// rewards for a local match. outcome: 'win'|'draw'|'loss'
export function localReward({ outcome, myOvr, oppOvr, difficulty = 2, goals = 0, short = false }) {
  const sm = strengthMult(myOvr, oppOvr), dm = DIFF_MULT[difficulty] ?? 1;
  const base = outcome === 'win' ? { xp: 110, coins: 700 } : outcome === 'draw' ? { xp: 55, coins: 300 } : { xp: 25, coins: 120 };
  const k = (outcome === 'loss' ? 1 : sm) * dm * (short ? 0.6 : 1);
  const g = Math.min(5, goals);
  return { xp: Math.round((base.xp + g * 6) * k), coins: Math.round((base.coins + g * 40) * k / 10) * 10, mult: +(sm * dm).toFixed(2) };
}
export function onlineReward(outcome, goals = 0) {
  const g = Math.min(5, goals);
  return outcome === 'win' ? { xp: 220 + g * 8, coins: 1500 + g * 60, rp: 25 } : outcome === 'draw' ? { xp: 110 + g * 8, coins: 700 + g * 60, rp: 8 } : { xp: 60 + g * 8, coins: 300 + g * 60, rp: -15 };
}
export const LADDER_STAGES = 10;
export const ladderBonus = (stage) => ({ xp: 60 + stage * 25, coins: 500 + stage * 400 });

// apply XP, returning level-ups
export function addXp(sc, xp) {
  const ups = [];
  sc.xp += xp;
  while (sc.level < MAX_LEVEL && sc.xp >= xpToNext(sc.level)) {
    sc.xp -= xpToNext(sc.level); sc.level++;
    const c = levelUpCoins(sc.level); sc.coins += c;
    ups.push({ level: sc.level, coins: c });
  }
  if (sc.level >= MAX_LEVEL) sc.xp = Math.min(sc.xp, xpToNext(sc.level));
  return ups;
}

export const KIT_COLORS = ['#e8173a', '#0b5cff', '#ffffff', '#111111', '#ffd400', '#00b86b', '#7c4dff', '#ff7a00', '#00c8e8', '#ff4fa3', '#8b1a1a', '#1d2b53'];

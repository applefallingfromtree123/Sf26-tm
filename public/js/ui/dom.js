// Small DOM helpers shared by all screens.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, err = false, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function modal(html, { onClose, dismiss = true } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.getElementById('ui').appendChild(bg);
  const close = () => { bg.remove(); onClose && onClose(); };
  if (dismiss) bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el: bg.firstElementChild, close };
}

export function confirmBox(text, okLabel = '확인') {
  return new Promise((res) => {
    const m = modal(`<h2>확인</h2><p class="lead">${esc(text)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-no>취소</button><button class="btn primary" data-yes>${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    m.el.querySelector('[data-yes]').onclick = () => { res(true); m.close(); };
    m.el.querySelector('[data-no]').onclick = () => { res(false); m.close(); };
  });
}

export function crest(club, cls = '') {
  return `<div class="crest ${cls}" style="background:linear-gradient(135deg, ${club.c1} 0 55%, ${club.c2} 55%);color:${textOn(club.c1)}">${esc(club.short)}</div>`;
}
export function textOn(hex) {
  const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#111' : '#fff';
}
export function stars(ovr) {
  const s = Math.max(0.5, Math.min(5, (ovr - 58) / 6));
  const full = Math.floor(s), half = s - full >= 0.5;
  return `<span class="stars">${'★'.repeat(full)}${half ? '½' : ''}</span>`;
}
export const posGroup = (p) => ({ GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD' }[p] || 'MID');
export const posTag = (p) => `<span class="pos ${posGroup(p)}">${esc(p)}</span>`;
export const money = (m) => m >= 1 ? `€${m.toFixed(m >= 100 ? 0 : 1)}M` : `€${Math.round(m * 1000)}K`;

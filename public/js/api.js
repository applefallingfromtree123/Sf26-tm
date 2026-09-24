// REST client for accounts, saves and leaderboard. Guests save to localStorage.
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export { LS };

export const api = {
  token: LS.get('sf_token'),
  user: LS.get('sf_user'),
  get loggedIn() { return !!this.token; },
  async req(method, path, body) {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && this.token && path !== '/api/login') { this.logout(); }
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  },
  setSession(d) { this.token = d.token; this.user = d.user; LS.set('sf_token', d.token); LS.set('sf_user', d.user); },
  async register(username, password, nickname) { const d = await this.req('POST', '/api/register', { username, password, nickname }); this.setSession(d); return d.user; },
  async login(username, password) { const d = await this.req('POST', '/api/login', { username, password }); this.setSession(d); return d.user; },
  logout() { this.token = null; this.user = null; LS.del('sf_token'); LS.del('sf_user'); },
  async refresh() { if (!this.token) return null; try { const d = await this.req('GET', '/api/me'); this.user = d.user; LS.set('sf_user', d.user); return d.user; } catch { return null; } },
  async updateMe(patch) { const d = await this.req('PATCH', '/api/me', patch); this.user = d.user; LS.set('sf_user', d.user); return d.user; },
  async leaderboard() { return (await this.req('GET', '/api/leaderboard')).users; },

  // saves: slot = manager1..3 / player1..3
  async listSaves() {
    const local = {};
    for (const s of ['manager1', 'manager2', 'manager3', 'player1', 'player2', 'player3']) { const v = LS.get('sf_save_' + s); if (v) local[s] = { slot: s, updated: v.updated, summary: v.data?.summary, local: true }; }
    if (this.loggedIn) {
      try { const { saves } = await this.req('GET', '/api/saves'); for (const s of saves) local[s.slot] = s; } catch { /* offline */ }
    }
    return local;
  },
  async loadSave(slot) {
    if (this.loggedIn) { try { return (await this.req('GET', '/api/saves/' + slot)).data; } catch { /* fall back */ } }
    return LS.get('sf_save_' + slot)?.data || null;
  },
  async writeSave(slot, data) {
    LS.set('sf_save_' + slot, { data, updated: Date.now() });
    if (this.loggedIn) { try { await this.req('PUT', '/api/saves/' + slot, { data }); return 'cloud'; } catch { return 'local'; } }
    return 'local';
  },
  async deleteSave(slot) {
    LS.del('sf_save_' + slot);
    if (this.loggedIn) { try { await this.req('DELETE', '/api/saves/' + slot); } catch { /* ignore */ } }
  },
};

// Persistence layer. Uses PostgreSQL when DATABASE_URL is set (Render Postgres),
// otherwise a JSON file in DATA_DIR (default ./data). Render's free web service disk
// is ephemeral, so use a Render Postgres database (see render.yaml) for real accounts.
import fs from 'node:fs';
import path from 'node:path';

class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(dir, { recursive: true });
    try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.db = { users: {}, saves: {} }; }
    this.timer = null;
  }
  async init() { }
  flush() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, this.file);
    }, 300);
  }
  async getUser(username) { return this.db.users[username.toLowerCase()] || null; }
  async createUser(user) {
    const k = user.username.toLowerCase();
    if (this.db.users[k]) return false;
    this.db.users[k] = user; this.flush(); return true;
  }
  async updateUser(username, patch) {
    const u = this.db.users[username.toLowerCase()]; if (!u) return null;
    Object.assign(u, patch); this.flush(); return u;
  }
  async getSave(username, slot) { return this.db.saves[`${username.toLowerCase()}:${slot}`] || null; }
  async setSave(username, slot, data) { this.db.saves[`${username.toLowerCase()}:${slot}`] = { data, updated: Date.now() }; this.flush(); }
  async deleteSave(username, slot) { delete this.db.saves[`${username.toLowerCase()}:${slot}`]; this.flush(); }
  async listSaves(username) {
    const pre = username.toLowerCase() + ':';
    return Object.entries(this.db.saves).filter(([k]) => k.startsWith(pre)).map(([k, v]) => ({ slot: k.slice(pre.length), updated: v.updated, summary: v.data?.summary || null }));
  }
  async leaderboard(limit = 50) {
    return Object.values(this.db.users).map(publicUser).sort((a, b) => b.rating - a.rating).slice(0, limit);
  }
}

class PgStore {
  constructor(url) { this.url = url; }
  async init() {
    const pg = (await import('pg')).default;
    this.pool = new pg.Pool({ connectionString: this.url, ssl: this.url.includes('localhost') ? false : { rejectUnauthorized: false }, max: 5 });
    await this.pool.query(`CREATE TABLE IF NOT EXISTS sf_users (username TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS sf_saves (username TEXT NOT NULL, slot TEXT NOT NULL, data JSONB NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY (username, slot))`);
  }
  async getUser(username) { const r = await this.pool.query('SELECT data FROM sf_users WHERE username=$1', [username.toLowerCase()]); return r.rows[0]?.data || null; }
  async createUser(user) {
    const r = await this.pool.query('INSERT INTO sf_users (username, data) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.username.toLowerCase(), user]);
    return r.rowCount === 1;
  }
  async updateUser(username, patch) {
    const u = await this.getUser(username); if (!u) return null;
    Object.assign(u, patch);
    await this.pool.query('UPDATE sf_users SET data=$2 WHERE username=$1', [username.toLowerCase(), u]);
    return u;
  }
  async getSave(username, slot) { const r = await this.pool.query('SELECT data, updated FROM sf_saves WHERE username=$1 AND slot=$2', [username.toLowerCase(), slot]); return r.rows[0] ? { data: r.rows[0].data, updated: +r.rows[0].updated } : null; }
  async setSave(username, slot, data) { await this.pool.query('INSERT INTO sf_saves (username, slot, data, updated) VALUES ($1,$2,$3,$4) ON CONFLICT (username, slot) DO UPDATE SET data=$3, updated=$4', [username.toLowerCase(), slot, data, Date.now()]); }
  async deleteSave(username, slot) { await this.pool.query('DELETE FROM sf_saves WHERE username=$1 AND slot=$2', [username.toLowerCase(), slot]); }
  async listSaves(username) { const r = await this.pool.query("SELECT slot, updated, data->'summary' AS summary FROM sf_saves WHERE username=$1", [username.toLowerCase()]); return r.rows.map(x => ({ slot: x.slot, updated: +x.updated, summary: x.summary })); }
  async leaderboard(limit = 50) { const r = await this.pool.query("SELECT data FROM sf_users ORDER BY (data->>'rating')::int DESC NULLS LAST LIMIT $1", [limit]); return r.rows.map(x => publicUser(x.data)); }
}

export function publicUser(u) {
  return { username: u.username, nickname: u.nickname, rating: u.rating ?? 1000, wins: u.wins || 0, draws: u.draws || 0, losses: u.losses || 0, gf: u.gf || 0, ga: u.ga || 0, favClub: u.favClub || null, created: u.created };
}

export async function createStore() {
  const s = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(process.env.DATA_DIR || path.resolve('data'));
  await s.init();
  console.log(`[store] using ${process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON file'} storage`);
  return s;
}

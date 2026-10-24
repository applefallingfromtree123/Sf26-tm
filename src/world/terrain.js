// Global elevation from the open AWS Terrain Tiles (Terrarium encoding, ~30 m
// SRTM/ETOPO/NED blend), exposed to CesiumJS as a heightmap terrain provider.
// No API key required.

const Cesium = window.Cesium;

const URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SIZE = 65; // heightmap samples per tile edge

export class TerrariumTerrainProvider {
  constructor({ maxLevel = 15, url = URL, flatten = null } = {}) {
    this.flatten = flatten;
    this._tilingScheme = new Cesium.WebMercatorTilingScheme();
    this._maxLevel = maxLevel;
    this._url = url;
    this._errorEvent = new Cesium.Event();
    this._credit = new Cesium.Credit("Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED, ETOPO1, NED)");
    this._levelZeroMaximumGeometricError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this._tilingScheme.ellipsoid, SIZE, this._tilingScheme.getNumberOfXTilesAtLevel(0),
    );
    this._canvas = document.createElement("canvas");
    this._canvas.width = this._canvas.height = 256;
    this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });
    this.ready = true;
  }
  get errorEvent() { return this._errorEvent; }
  get credit() { return this._credit; }
  get tilingScheme() { return this._tilingScheme; }
  get hasWaterMask() { return false; }
  get hasVertexNormals() { return false; }
  get availability() { return undefined; }

  getLevelMaximumGeometricError(level) {
    return this._levelZeroMaximumGeometricError / (1 << level);
  }
  getTileDataAvailable(x, y, level) {
    return level <= this._maxLevel;
  }
  loadTileDataAvailability() {
    return undefined;
  }

  /** Airport flattening applied to a heightmap tile. */
  applyFlatten(out, x, y, level) {
    const rect = this._tilingScheme.tileXYToRectangle(x, y, level);
    const cLat = (rect.north + rect.south) / 2, cLon = (rect.east + rect.west) / 2;
    if (!this.flatten.near(cLat, cLon, Math.max(rect.width * Math.cos(cLat), rect.height) * 6371000)) return;
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat / 2));
    const m0 = merc(rect.north), m1 = merc(rect.south);
    for (let j = 0; j < SIZE; j++) {
      const lat = 2 * Math.atan(Math.exp(m0 + (m1 - m0) * (j / (SIZE - 1)))) - Math.PI / 2;
      for (let i = 0; i < SIZE; i++) {
        const lon = rect.west + rect.width * (i / (SIZE - 1));
        const f = this.flatten.at(lat, lon);
        if (f) out[j * SIZE + i] = out[j * SIZE + i] * (1 - f[1]) + f[0] * f[1];
      }
    }
  }

  requestTileGeometry(x, y, level, request) {
    const url = this._url.replace("{z}", level).replace("{x}", x).replace("{y}", y);
    const res = new Cesium.Resource({ url, request });
    const promise = res.fetchImage({ preferImageBitmap: true });
    if (!promise) return undefined; // throttled, Cesium will retry
    const childMask = level < this._maxLevel ? 15 : 0;
    return promise
      .then((img) => {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, 256, 256);
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, 256, 256).data;
        const out = new Float32Array(SIZE * SIZE);
        // sample on tile edges (shared with neighbours) with bilinear filtering
        for (let j = 0; j < SIZE; j++) {
          const fy = Math.min((j / (SIZE - 1)) * 255, 255);
          const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, 255), ty = fy - y0;
          for (let i = 0; i < SIZE; i++) {
            const fx = Math.min((i / (SIZE - 1)) * 255, 255);
            const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, 255), tx = fx - x0;
            const h = (xx, yy) => {
              const k = (yy * 256 + xx) * 4;
              return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768;
            };
            const v = (h(x0, y0) * (1 - tx) + h(x1, y0) * tx) * (1 - ty) + (h(x0, y1) * (1 - tx) + h(x1, y1) * tx) * ty;
            out[j * SIZE + i] = Math.max(v, 0); // oceans: bathymetry clamped to mean sea level
          }
        }
        if (this.flatten && level >= 10) this.applyFlatten(out, x, y, level);
        return new Cesium.HeightmapTerrainData({ buffer: out, width: SIZE, height: SIZE, childTileMask: childMask });
      })
      .catch(() => new Cesium.HeightmapTerrainData({ buffer: new Float32Array(SIZE * SIZE), width: SIZE, height: SIZE, childTileMask: childMask }));
  }
}

/**
 * Direct elevation sampler for the flight model: decodes Terrarium tiles at a
 * fixed zoom into a small cache and answers point queries synchronously
 * (undefined until the tile has arrived). Independent of what the globe has
 * rendered, so physics never sees half-streamed terrain.
 */
export class TerrainSampler {
  constructor({ zoom = 13, url = URL, maxTiles = 96, flatten = null } = {}) {
    this.flatten = flatten;
    this.zoom = zoom;
    this.url = url;
    this.max = maxTiles;
    this.cache = new Map(); // key -> Float32Array | "pending" | "error"
  }
  key(x, y) {
    return `${this.zoom}/${x}/${y}`;
  }
  async load(x, y) {
    const k = this.key(x, y);
    this.cache.set(k, "pending");
    try {
      const blob = await fetch(this.url.replace("{z}", this.zoom).replace("{x}", x).replace("{y}", y)).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.blob();
      });
      const img = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const cv = (this._cv ||= Object.assign(document.createElement("canvas"), { width: 256, height: 256 }));
      const g = (this._g ||= cv.getContext("2d", { willReadFrequently: true }));
      g.clearRect(0, 0, 256, 256);
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, 256, 256).data;
      const h = new Float32Array(256 * 256);
      for (let i = 0; i < h.length; i++) h[i] = Math.max(px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768, 0);
      this.cache.set(k, h);
      if (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    } catch {
      this.cache.set(k, "error");
    }
  }
  /** Height (m) at lat/lon in radians, or undefined while loading. */
  heightAt(lat, lon) {
    const n = 2 ** this.zoom;
    const xf = ((lon * 180) / Math.PI + 180) / 360 * n;
    const s = Math.sin(lat);
    const yf = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.floor(xf), y = Math.floor(yf);
    const t = this.cache.get(this.key(x, y));
    if (t === undefined) { this.load(x, y); return undefined; }
    if (typeof t === "string") return t === "error" ? 0 : undefined;
    const fx = Math.min((xf - x) * 256 - 0.5, 254.999), fy = Math.min((yf - y) * 256 - 0.5, 254.999);
    const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy));
    const tx = Math.max(0, fx - x0), ty = Math.max(0, fy - y0);
    const H = (i, j) => t[j * 256 + i];
    let h = (H(x0, y0) * (1 - tx) + H(x0 + 1, y0) * tx) * (1 - ty) + (H(x0, y0 + 1) * (1 - tx) + H(x0 + 1, y0 + 1) * tx) * ty;
    const f = this.flatten?.at(lat, lon);
    if (f) h = h * (1 - f[1]) + f[0] * f[1];
    return h;
  }
  /** Prefetch the tiles around a point (call at spawn). */
  prefetch(lat, lon) {
    for (const [dl, dn] of [[0, 0], [0.003, 0], [-0.003, 0], [0, 0.003], [0, -0.003]]) this.heightAt(lat + dl, lon + dn);
  }
}

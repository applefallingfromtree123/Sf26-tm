// Global elevation from the open AWS Terrain Tiles (Terrarium encoding, ~30 m
// SRTM/ETOPO/NED blend), exposed to CesiumJS as a heightmap terrain provider.
// No API key required.

const Cesium = window.Cesium;

const URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SIZE = 65; // heightmap samples per tile edge

export class TerrariumTerrainProvider {
  constructor({ maxLevel = 15, url = URL } = {}) {
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
        return new Cesium.HeightmapTerrainData({ buffer: out, width: SIZE, height: SIZE, childTileMask: childMask });
      })
      .catch(() => new Cesium.HeightmapTerrainData({ buffer: new Float32Array(SIZE * SIZE), width: SIZE, height: SIZE, childTileMask: childMask }));
  }
}

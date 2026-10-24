// CesiumJS world: real-world imagery and terrain streaming, sun/atmosphere,
// weather (fog, clouds), airport lighting, the aircraft model and cameras.

import { TerrariumTerrainProvider, TerrainSampler } from "./terrain.js";
import { buildAircraftGeometry } from "./model.js";
import { qRot } from "../sim/math.js";

const Cesium = window.Cesium;

export const IMAGERY = {
  esri: "Esri World Imagery (위성, 키 불필요)",
  bing: "Bing Maps Aerial (MSFS와 동일 소스 · Cesium ion 토큰)",
  google3d: "Google Photorealistic 3D Tiles (포토그래메트리 · Cesium ion 토큰 또는 Google 키)",
  osm: "OpenStreetMap (지도)",
  offline: "Natural Earth II (오프라인 · 저해상도)",
};
export const TERRAIN = {
  terrarium: "AWS Terrain Tiles (SRTM 30 m, 키 불필요)",
  ion: "Cesium World Terrain (ion 토큰)",
  arcgis: "Esri World Elevation 3D",
  none: "평면 (지형 없음)",
};

export class World {
  constructor(container, settings) {
    this.settings = settings;
    this.container = container;
    this.aircraftModel = null;
    this.lights = null;
    this.clouds = null;
    this.cloudCenter = null;
    this.lastGround = 0;
    this.nav = { beacon: null, strobe: null };
  }

  async init() {
    const s = this.settings;
    if (s.ionToken) Cesium.Ion.defaultAccessToken = s.ionToken;
    const viewer = new Cesium.Viewer(this.container, {
      animation: false, baseLayerPicker: false, fullscreenButton: false, geocoder: false,
      homeButton: false, infoBox: false, sceneModePicker: false, selectionIndicator: false,
      timeline: false, navigationHelpButton: false, navigationInstructionsInitiallyVisible: false,
      scene3DOnly: true, useDefaultRenderLoop: false, shouldAnimate: false,
      baseLayer: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      msaaSamples: s.quality === "ultra" ? 4 : s.quality === "high" ? 2 : 1,
      requestRenderMode: false,
      contextOptions: { webgl: { powerPreference: "high-performance", preserveDrawingBuffer: !!s.preserveBuffer } },
    });
    this.viewer = viewer;
    const scene = viewer.scene;
    this.scene = scene;
    viewer.cesiumWidget.creditContainer.classList.add("credits");
    scene.globe.enableLighting = true;
    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.dynamicAtmosphereLightingFromSun = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = true;
    scene.skyAtmosphere.show = true;
    scene.fog.enabled = true;
    scene.highDynamicRange = s.quality === "ultra";
    scene.postProcessStages.fxaa.enabled = s.quality !== "low";
    scene.globe.maximumScreenSpaceError = { low: 4, medium: 2, high: 1.5, ultra: 1.1 }[s.quality] ?? 2;
    scene.globe.tileCacheSize = { low: 150, medium: 300, high: 600, ultra: 1000 }[s.quality] ?? 300;
    scene.globe.preloadSiblings = true;
    viewer.resolutionScale = s.quality === "low" ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 1.5);
    viewer.shadows = s.quality === "ultra";
    viewer.shadowMap.softShadows = true;
    viewer.shadowMap.darkness = 0.4;
    scene.camera.frustum.near = 0.3;
    scene.camera.frustum.fov = Cesium.Math.toRadians(s.fov || 60);
    const ssc = scene.screenSpaceCameraController;
    ssc.enableInputs = false;
    ssc.enableCollisionDetection = false;

    await this.setImagery(s.imagery);
    await this.setTerrain(s.terrain);
    if (s.buildings && (s.ionToken) && s.imagery !== "google3d") {
      try {
        this.osmBuildings = await Cesium.createOsmBuildingsAsync();
        scene.primitives.add(this.osmBuildings);
      } catch (e) {
        console.warn("OSM buildings unavailable", e);
      }
    }
    this.lights = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.acLights = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.clouds = scene.primitives.add(new Cesium.CloudCollection({ noiseDetail: 16.0 }));
    return this;
  }

  async setImagery(kind) {
    const layers = this.viewer.imageryLayers;
    layers.removeAll();
    const s = this.settings;
    let provider;
    try {
      if (kind === "bing" && s.ionToken) provider = await Cesium.IonImageryProvider.fromAssetId(2);
      else if (kind === "osm") provider = new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" });
      else if (kind === "offline") provider = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
      else if (kind === "google3d") provider = null;
      else {
        provider = new Cesium.UrlTemplateImageryProvider({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          maximumLevel: 19,
          credit: new Cesium.Credit("Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"),
        });
      }
    } catch (e) {
      console.warn("imagery failed, falling back", e);
      provider = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
    }
    // offline base underneath so something always renders
    const base = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
    layers.addImageryProvider(base);
    if (provider) layers.addImageryProvider(provider);

    if (kind === "google3d") {
      try {
        let tileset;
        if (s.googleKey) {
          Cesium.GoogleMaps.defaultApiKey = s.googleKey;
          tileset = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
        } else {
          tileset = await Cesium.createGooglePhotorealistic3DTileset(undefined, { onlyUsingWithGoogleGeocoder: true });
        }
        tileset.maximumScreenSpaceError = { low: 24, medium: 16, high: 8, ultra: 4 }[s.quality] ?? 16;
        this.tileset = this.scene.primitives.add(tileset);
        this.scene.globe.show = false;
        this.use3dTiles = true;
      } catch (e) {
        console.warn("Google 3D tiles unavailable", e);
        this.onError?.("Google 3D Tiles 로드 실패 — 토큰/키를 확인하세요. 위성 영상으로 대체합니다.");
        layers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          maximumLevel: 19,
        }));
      }
    }
  }

  async setTerrain(kind) {
    let tp;
    try {
      if (kind === "ion" && this.settings.ionToken) tp = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true, requestWaterMask: true });
      else if (kind === "arcgis") tp = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl("https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer");
      else if (kind === "none") tp = new Cesium.EllipsoidTerrainProvider();
      else tp = new TerrariumTerrainProvider({ flatten: this.flattenHook() });
    } catch (e) {
      console.warn("terrain failed, using terrarium", e);
      tp = new TerrariumTerrainProvider({ flatten: this.flattenHook() });
    }
    this.scene.terrainProvider = tp;
    // physics elevation source (Terrarium data matches the default terrain; also a good proxy for other DEMs)
    this.sampler = kind === "none" ? null : new TerrainSampler({ flatten: this.flattenHook() });
  }

  /** Airport flattening backed by the navigation database (set via setNavDB). */
  flattenHook() {
    return {
      near: (lat, lon, r) => !!this.navdb?.ready && this.navdb.nearestAirports(lat, lon, r + 4000, 1).length > 0,
      at: (lat, lon) => (this.navdb?.ready ? this.navdb.runwayFlatten(lat, lon) : null),
    };
  }
  setNavDB(db) {
    this.navdb = db;
  }

  // ------------------------------------------------------------------ ground queries
  /** Terrain/surface height (m) below lat/lon (radians). Returns undefined if not loaded. */
  groundHeight(lat, lon) {
    if (this.use3dTiles && this.tileset && this.scene.sampleHeightSupported) {
      const h = this.scene.sampleHeight(new Cesium.Cartographic(lon, lat), this.aircraftModel ? [this.aircraftModel] : undefined);
      if (h != null) return h;
    }
    if (this.settings.terrain === "none") return 0;
    if (this.sampler) return this.sampler.heightAt(lat, lon);
    return this.scene.globe.getHeight(new Cesium.Cartographic(lon, lat));
  }

  /** Wait until the terrain under a point is streamed at full detail. */
  async waitForGround(lat, lon, fallback, onProgress, timeoutMs = 20000) {
    const t0 = performance.now();
    this.sampler?.prefetch(lat, lon);
    let h;
    while (performance.now() - t0 < timeoutMs) {
      this.render();
      h = this.groundHeight(lat, lon);
      const loaded = this.scene.globe.tilesLoaded && (!this.tileset || this.tileset.tilesLoaded);
      const el = performance.now() - t0;
      onProgress?.(Math.min(0.99, el / timeoutMs), loaded);
      // need the elevation; give imagery a few seconds to stream around the airport
      if (h != null && (loaded || el > 6000)) return h;
      await new Promise((r) => setTimeout(r, 60));
    }
    return h ?? fallback;
  }

  // ------------------------------------------------------------------ aircraft model
  async loadAircraft(spec, cgHeight, livery) {
    if (this.aircraftModel) {
      this.scene.primitives.remove(this.aircraftModel);
      this.aircraftModel = null;
    }
    const glb = buildAircraftGeometry(spec, cgHeight, livery);
    const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    const model = await Cesium.Model.fromGltfAsync({
      url,
      upAxis: Cesium.Axis.Z,
      forwardAxis: Cesium.Axis.X,
      shadows: Cesium.ShadowMode.ENABLED,
      minimumPixelSize: 0,
      backFaceCulling: false,
    });
    this.aircraftModel = this.scene.primitives.add(model);
    await new Promise((res) => {
      const rem = model.readyEvent.addEventListener(() => { rem(); res(); });
    });
    this.nodes = {
      gear: model.getNode("gear"),
      prop: model.getNode("prop"),
      rotor: model.getNode("rotor"),
      tailrotor: model.getNode("tailrotor"),
    };
    this.rotorAngle = 0;
    this.spec = spec;
    // navigation / anti-collision / landing lights
    this.acLights.removeAll();
    const mk = (color, size) => this.acLights.add({ color, pixelSize: size, show: true, disableDepthTestDistance: 0 });
    this.nav = {
      left: mk(Cesium.Color.RED, 6),
      right: mk(Cesium.Color.LIME, 6),
      tail: mk(Cesium.Color.WHITE, 5),
      beacon: mk(Cesium.Color.RED, 7),
      strobeL: mk(Cesium.Color.WHITE, 9),
      strobeR: mk(Cesium.Color.WHITE, 9),
      landing: mk(Cesium.Color.fromCssColorString("#fff6d8"), 10),
    };
    URL.revokeObjectURL(url);
  }

  /** Build ECEF transform for the aircraft (model axes x fwd, y left, z up). */
  frameMatrix(fm, out = new Cesium.Matrix4()) {
    const pos = Cesium.Cartesian3.fromRadians(fm.lon, fm.lat, fm.alt);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    const f = qRot(fm.q, [1, 0, 0]);
    const r = qRot(fm.q, [0, 1, 0]);
    const d = qRot(fm.q, [0, 0, 1]);
    // NED -> ENU : (n,e,d) -> (e,n,-d)
    const col = (v) => [v[1], v[0], -v[2]];
    const fx = col(f), ly = col(r).map((x) => -x), uz = col(d).map((x) => -x);
    const rot = new Cesium.Matrix4(
      fx[0], ly[0], uz[0], 0,
      fx[1], ly[1], uz[1], 0,
      fx[2], ly[2], uz[2], 0,
      0, 0, 0, 1,
    );
    Cesium.Matrix4.multiply(enu, rot, out);
    return out;
  }

  updateAircraft(fm, dt, show, lightsState, timeSec) {
    const model = this.aircraftModel;
    if (!model) return;
    this.frameMatrix(fm, model.modelMatrix);
    model.show = show;
    const c = fm.ctl;
    if (this.nodes.gear) {
      const g = fm.spec.gear.retract ? c.gearPos : 1;
      this.nodes.gear.show = g > 0.02;
      const m = Cesium.Matrix4.fromUniformScale(Math.max(g, 0.001));
      Cesium.Matrix4.setTranslation(m, new Cesium.Cartesian3(0, 0, (1 - g) * (fm.cgHeight * 0.5)), m);
      this.nodes.gear.matrix = m;
    }
    const rpm = fm.heli ? (fm.rotorE ?? 1) * 400 : Math.max(...fm.engines.map((e) => (e.rpm || e.n1 * 20)), 0);
    this.rotorAngle += (rpm / 60) * Math.PI * 2 * dt;
    if (this.nodes.rotor) {
      const t = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationZ(this.rotorAngle), new Cesium.Cartesian3(0, 0, fm.spec.model.fd / 2 + 0.55));
      this.nodes.rotor.matrix = t;
    }
    if (this.nodes.tailrotor) {
      const L = fm.spec.L, R = fm.spec.model.fd / 2;
      this.nodes.tailrotor.matrix = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationX(this.rotorAngle * 5), new Cesium.Cartesian3(-L * 0.6, 0.25, R * 0.4 + 0.7));
    }
    // lights
    const s = fm.spec, b = s.b, L = s.L;
    const P = (x, y, z) => Cesium.Matrix4.multiplyByPoint(model.modelMatrix, new Cesium.Cartesian3(x, y, z), new Cesium.Cartesian3());
    const n = this.nav;
    const on = lightsState;
    n.left.position = P(-L * 0.05, b / 2, 0);
    n.right.position = P(-L * 0.05, -b / 2, 0);
    n.tail.position = P(-L / 2, 0, fm.spec.model.fd * 0.4);
    n.beacon.position = P(0, 0, fm.spec.model.fd * 0.55);
    n.strobeL.position = P(-L * 0.06, b / 2, 0);
    n.strobeR.position = P(-L * 0.06, -b / 2, 0);
    n.landing.position = P(L * 0.25, 0, -fm.spec.model.fd * 0.3);
    n.left.show = n.right.show = n.tail.show = on.nav;
    n.beacon.show = on.beacon && Math.sin(timeSec * 6) > 0.6;
    const strobe = on.strobe && (timeSec % 1.2) < 0.06;
    n.strobeL.show = n.strobeR.show = strobe;
    n.landing.show = on.landing;
  }

  // ------------------------------------------------------------------ environment
  setTime(date) {
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
  }
  advanceTime(sec) {
    const c = this.viewer.clock;
    c.currentTime = Cesium.JulianDate.addSeconds(c.currentTime, sec, new Cesium.JulianDate());
  }
  currentDate() {
    return Cesium.JulianDate.toDate(this.viewer.clock.currentTime);
  }
  sunElevation(lat, lon) {
    const t = this.viewer.clock.currentTime;
    const sun = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(t);
    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(t) || Cesium.Transforms.computeTemeToPseudoFixedMatrix(t);
    const sunF = Cesium.Matrix3.multiplyByVector(icrfToFixed, sun, new Cesium.Cartesian3());
    const p = Cesium.Cartesian3.fromRadians(lon, lat, 0);
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(p, new Cesium.Cartesian3());
    const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(sunF, p, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    return Math.asin(Cesium.Cartesian3.dot(up, dir));
  }

  applyWeather(wx) {
    const scene = this.scene;
    // visibility (km) -> fog density
    const vis = Math.max(wx.visibility, 0.2) * 1000;
    scene.fog.density = Math.min(3.0 / vis, 0.02);
    scene.fog.minimumBrightness = 0.03;
    scene.fog.screenSpaceErrorFactor = 2.0;
    this.wx = wx;
    this.cloudCenter = null;
  }

  /** Regenerate cumulus cloud field around the aircraft when it has moved far. */
  updateClouds(fm) {
    const wx = this.wx;
    if (!wx || !this.clouds) return;
    const here = [fm.lat, fm.lon];
    if (this.cloudCenter) {
      const d = Math.hypot(here[0] - this.cloudCenter[0], (here[1] - this.cloudCenter[1]) * Math.cos(here[0])) * 6371000;
      if (d < 15000) return;
    }
    this.cloudCenter = here;
    this.clouds.removeAll();
    const layers = wx.clouds || [];
    let seed = Math.floor((here[0] * 1000) ^ (here[1] * 1000)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const layer of layers) {
      const count = { FEW: 40, SCT: 110, BKN: 230, OVC: 380 }[layer.cover] || 0;
      const base = layer.base * 0.3048;
      const ground = this.lastGround || 0;
      for (let k = 0; k < count; k++) {
        const r = 30000 * Math.sqrt(rnd());
        const a = rnd() * Math.PI * 2;
        const dLat = (r * Math.cos(a)) / 6371000;
        const dLon = (r * Math.sin(a)) / (6371000 * Math.cos(here[0]));
        const w = 900 + rnd() * 2200;
        const h = 350 + rnd() * (layer.cover === "OVC" ? 500 : 1200);
        this.clouds.add({
          position: Cesium.Cartesian3.fromRadians(here[1] + dLon, here[0] + dLat, Math.max(base, ground + 300) + h * 0.45),
          scale: new Cesium.Cartesian2(w, h),
          maximumSize: new Cesium.Cartesian3(22, 12, 14),
          slice: 0.36 + rnd() * 0.2,
          brightness: layer.cover === "OVC" ? 0.75 : 0.95,
        });
      }
    }
  }

  /** Runway, approach and PAPI lights for a set of runways (airport objects from navdb). */
  buildAirportLights(airports) {
    const coll = this.lights;
    coll.removeAll();
    this.papis = [];
    const C = Cesium.Color;
    const add = (lat, lon, h, color, size = 4) =>
      coll.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat, h + 0.6), color, pixelSize: size, scaleByDistance: new Cesium.NearFarScalar(200, 1.6, 12000, 0.5) });
    for (const apt of airports) {
      if (!apt) continue;
      for (const rw of apt.runways) {
        if (rw.surface === 2) continue;
        const len = rw.lengthM;
        const n = Math.max(2, Math.floor(len / 60));
        const halfW = rw.widthM / 2 + 1;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const [la, lo] = rw.along(t * len, 0);
          const [la1, lo1] = rw.along(t * len, halfW);
          const [la2, lo2] = rw.along(t * len, -halfW);
          const edge = t > 0.8 || t < 0.2 ? C.fromCssColorString("#ffd27a") : C.fromCssColorString("#fff4d6");
          add(la1, lo1, rw.elevM, edge, 4);
          add(la2, lo2, rw.elevM, edge, 4);
          if (apt.type <= 2 && k % 1 === 0) add(la, lo, rw.elevM, t > 0.9 ? C.RED : C.fromCssColorString("#fffaf0"), 3);
        }
        // threshold / end bars
        for (let y = -halfW; y <= halfW; y += 3) {
          const [a1, o1] = rw.along(0, y);
          add(a1, o1, rw.elevM, C.LIME, 5);
          const [a2, o2] = rw.along(len, y);
          add(a2, o2, rw.elevM, C.RED, 5);
        }
        // approach lighting system (ALSF-like) for larger airports
        if (apt.type <= 2) {
          for (let d = 30; d <= 900; d += 30) {
            for (const y of [-6, -3, 0, 3, 6]) {
              if (d % 150 !== 0 && y !== 0 && Math.abs(y) !== 3) continue;
              const [a, o] = rw.along(-d, y);
              add(a, o, rw.elevM, C.fromCssColorString("#fffbe8"), d % 300 === 0 ? 6 : 4);
            }
          }
          // PAPI: 4 units on the left, 300 m past threshold
          const units = [];
          for (let k = 0; k < 4; k++) {
            const [a, o] = rw.along(300, -(rw.widthM / 2 + 15 + k * 9));
            units.push(add(a, o, rw.elevM, C.WHITE, 7));
          }
          this.papis.push({ rw, units });
        }
      }
    }
  }

  updatePapi(fm) {
    if (!this.papis) return;
    for (const { rw, units } of this.papis) {
      const [dx, , dist] = rw.localPos(fm.lat, fm.lon);
      const along = 300 - dx;
      if (along < 50) continue;
      const ang = Math.atan2(fm.alt - rw.elevM - 2, along) * 180 / Math.PI;
      // transition angles 2.5, 2.83, 3.17, 3.5 (outer to inner)
      const th = [3.5, 3.17, 2.83, 2.5];
      units.forEach((u, k) => { u.color = ang > th[k] ? Cesium.Color.WHITE : Cesium.Color.RED; });
    }
  }

  render() {
    this.viewer.render();
  }

  // ------------------------------------------------------------------ globe airport picker (menu)
  setMenuMode(on) {
    this.menuMode = on;
    if (this.smallPoints) this.smallPoints.show = on;
    for (const e of this.routeMarks || []) e.show = on;
    const ssc = this.scene.screenSpaceCameraController;
    ssc.enableInputs = on;
    ssc.enableCollisionDetection = on;
    this.scene.camera.frustum.near = on ? 1 : 0.3;
    if (this.airportPoints) this.airportPoints.show = on;
    if (this.airportLabels) this.airportLabels.show = on;
    if (this.routeEntity) this.routeEntity.show = on;
    if (on && this.aircraftModel) this.aircraftModel.show = false;
    if (on) this.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  /** Plot airports on the globe; small fields appear when zoomed in. */
  showAirports(navdb, onPick) {
    const scene = this.scene;
    this.navdb = navdb;
    if (!this.airportPoints) {
      this.airportPoints = scene.primitives.add(new Cesium.PointPrimitiveCollection());
      this.airportLabels = scene.primitives.add(new Cesium.LabelCollection());
      this.smallPoints = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    }
    this.airportPoints.removeAll();
    this.airportLabels.removeAll();
    const C = Cesium.Color;
    for (const a of navdb.airports) {
      if (a.type > 2) continue;
      const pos = Cesium.Cartesian3.fromRadians(a.lon, a.lat, a.elevM + 30);
      const large = a.type === 1;
      this.airportPoints.add({
        position: pos, id: a, pixelSize: large ? 7 : 4.5,
        color: large ? C.fromCssColorString("#2ee6ff") : C.fromCssColorString("#7fb7ff"),
        outlineColor: C.BLACK, outlineWidth: 1,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.6, 1.5e7, 0.6),
        disableDepthTestDistance: 5e6,
      });
      if (large) {
        this.airportLabels.add({
          position: pos, text: a.ident, font: "12px 'B612 Mono', monospace", fillColor: C.WHITE, outlineColor: C.BLACK, outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(8, -8), id: a,
          translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 1, 6e6, 0),
          disableDepthTestDistance: 5e6,
        });
      }
    }
    if (!this.pickHandler) {
      this.pickHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
      this.pickHandler.setInputAction((e) => {
        if (!this.menuMode) return;
        const picked = scene.pick(e.position);
        const apt = picked?.id && picked.id.ident ? picked.id : null;
        this.onPick?.(apt, e.position);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      scene.camera.moveEnd.addEventListener(() => this.refreshSmallAirports());
    }
    this.onPick = onPick;
  }

  refreshSmallAirports() {
    if (!this.smallPoints || !this.navdb || !this.menuMode) return;
    this.smallPoints.removeAll();
    const cam = this.scene.camera;
    const h = cam.positionCartographic.height;
    if (h > 600000) return;
    const c = cam.positionCartographic;
    const C = Cesium.Color;
    const list = this.navdb.nearestAirports(c.latitude, c.longitude, Math.min(h * 2.5, 600000), 2500);
    for (const a of list) {
      if (a.type <= 2) continue;
      this.smallPoints.add({
        position: Cesium.Cartesian3.fromRadians(a.lon, a.lat, a.elevM + 10), id: a, pixelSize: a.type === 4 ? 4 : 5,
        color: a.type === 4 ? C.fromCssColorString("#ffb000") : a.type === 5 ? C.fromCssColorString("#3fa7ff") : C.fromCssColorString("#c9d2dc"),
        outlineColor: C.BLACK, outlineWidth: 1, disableDepthTestDistance: 5e5,
      });
    }
  }

  /** Show departure/arrival markers and the great-circle route. */
  showRoute(points, dep, arr) {
    const v = this.viewer;
    if (this.routeEntity) v.entities.remove(this.routeEntity);
    for (const e of this.routeMarks || []) v.entities.remove(e);
    this.routeMarks = [];
    const mark = (apt, color, text) => {
      if (!apt) return;
      this.routeMarks.push(v.entities.add({
        position: Cesium.Cartesian3.fromRadians(apt.lon, apt.lat, apt.elevM + 50),
        point: { pixelSize: 12, color, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text, font: "13px 'Noto Sans KR', sans-serif", fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: color.withAlpha(0.8), pixelOffset: new Cesium.Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    };
    mark(dep, Cesium.Color.fromCssColorString("#3dff6e"), dep ? `출발 ${dep.ident}` : "");
    mark(arr, Cesium.Color.fromCssColorString("#ff4df0"), arr ? `도착 ${arr.ident}` : "");
    if (points && points.length > 1) {
      this.routeEntity = v.entities.add({
        polyline: {
          positions: points.map((p) => Cesium.Cartesian3.fromRadians(p.lon, p.lat, 0)),
          width: 3, arcType: Cesium.ArcType.GEODESIC,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.fromCssColorString("#ff4df0") }),
          clampToGround: false,
        },
      });
    }
  }

  flyToAirport(apt, height = 60000) {
    this.scene.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(apt.lon, apt.lat - 0.004 * (height / 60000), height), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 }, duration: 1.8 });
  }
  flyHome(lat = 36, lon = 127.5) {
    this.scene.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat - 12, 9.5e6), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-80), roll: 0 }, duration: 0 });
  }
  resize() {
    this.viewer.resize();
  }
}

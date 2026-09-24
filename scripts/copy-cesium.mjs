// Copies the prebuilt CesiumJS distribution into public/cesium so it is served
// as static files (workers, assets, widgets) next to the simulator.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/cesium/Build/Cesium");
const dst = resolve(root, "public/cesium");

if (!existsSync(src)) {
  console.error("CesiumJS not found. Run `npm install` first.");
  process.exit(1);
}
if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log("CesiumJS copied to public/cesium");

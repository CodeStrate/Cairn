import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * Build layout (see scripts/build.mjs):
 *   out/main/index.js         ← this bundle
 *   out/preload/index.cjs     ← preload (CommonJS, required by sandboxed renderers)
 *   out/renderer/*.html       ← Vite output
 * In development `npm run dev` sets VITE_DEV_SERVER_URL and pages load from Vite instead.
 */
const OUT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function getPreloadPath(): string {
  return path.join(OUT_ROOT, "preload", "index.cjs");
}

export function getWindowUrl(htmlFileName: string): string {
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) return `${devServer.replace(/\/$/, "")}/${htmlFileName}`;
  return pathToFileURL(path.join(OUT_ROOT, "renderer", htmlFileName)).toString();
}

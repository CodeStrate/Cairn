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

/**
 * The app icon as a PNG, for things the running app sets itself (Dock in dev, About panel,
 * Linux window icon). `app.getAppPath()` is the project root in dev and app.asar when
 * packaged; build-resources/icon.png is listed in package.json "files" so it ships.
 */
export function getAppIconPath(appPath: string): string {
  return path.join(appPath, "build-resources", "icon.png");
}

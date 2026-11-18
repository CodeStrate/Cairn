/**
 * esbuild settings for the two Node-side bundles, shared by build.mjs and dev.mjs.
 *
 *   main    → out/main/index.js       ESM (package.json is "type": "module")
 *   preload → out/preload/index.cjs   CommonJS (sandboxed preloads can't be ESM)
 *
 * `electron` and `node-pty` stay external: Electron provides the first, and node-pty
 * loads a native addon plus its spawn-helper from its own folder at runtime.
 */
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** @type {import("esbuild").BuildOptions} */
export const mainOptions = {
  absWorkingDir: root,
  entryPoints: ["main/index.ts"],
  outfile: "out/main/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: ["electron", "node-pty"],
  // Some bundled dependencies still call require(); give ESM output a real one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
};

/** @type {import("esbuild").BuildOptions} */
export const preloadOptions = {
  absWorkingDir: root,
  entryPoints: ["renderer/preload.ts"],
  outfile: "out/preload/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: "inline",
  external: ["electron"],
  logLevel: "info",
};

/**
 * Production build into out/: renderer (Vite), then main and preload (esbuild).
 * `npm run dist` packages out/ with electron-builder afterwards.
 */
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

import { mainOptions, preloadOptions } from "./bundle.mjs";

// fileURLToPath, not URL.pathname: on Windows .pathname is "/D:/…", which Vite can't resolve.
await viteBuild({ configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) });
await Promise.all([esbuild(mainOptions), esbuild(preloadOptions)]);
console.log("\nBuilt out/ — run `npm start` to launch, or `npm run dist` to package.");

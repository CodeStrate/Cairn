/**
 * Production build into out/: renderer (Vite), then main and preload (esbuild).
 * `npm run dist` packages out/ with electron-builder afterwards.
 */
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";

import { mainOptions, preloadOptions } from "./bundle.mjs";

await viteBuild({ configFile: new URL("../vite.config.ts", import.meta.url).pathname });
await Promise.all([esbuild(mainOptions), esbuild(preloadOptions)]);
console.log("\nBuilt out/ — run `npm start` to launch, or `npm run dist` to package.");

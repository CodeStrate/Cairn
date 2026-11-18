/**
 * Development: Vite serves the renderer with hot reload, esbuild watches main and preload,
 * and Electron restarts whenever either Node-side bundle changes.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { context } from "esbuild";
import { createServer } from "vite";

import { mainOptions, preloadOptions } from "./bundle.mjs";

const electronPath = createRequire(import.meta.url)("electron");

const server = await createServer({
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
});
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173/";

let child = null;
let restarting = false;

function launch() {
  child = spawn(electronPath, ["."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  child.on("exit", (code) => {
    if (restarting) return;
    // The user quit the app: stop the dev session too.
    void shutdown(code ?? 0);
  });
}

async function restart() {
  if (!child) return launch();
  restarting = true;
  child.once("exit", () => {
    restarting = false;
    launch();
  });
  child.kill();
}

/** esbuild plugin: relaunch Electron after every successful rebuild. */
const relaunch = {
  name: "relaunch-electron",
  setup(build) {
    let first = true;
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      if (first) {
        first = false;
        return;
      }
      console.log("[dev] backend changed, restarting Electron…");
      void restart();
    });
  },
};

const contexts = await Promise.all([
  context({ ...mainOptions, plugins: [relaunch] }),
  context({ ...preloadOptions, plugins: [relaunch] }),
]);
await Promise.all(contexts.map((ctx) => ctx.rebuild()));
await Promise.all(contexts.map((ctx) => ctx.watch()));
launch();

async function shutdown(code) {
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  await server.close();
  process.exit(code);
}

process.on("SIGINT", () => {
  restarting = true;
  child?.kill();
  void shutdown(0);
});

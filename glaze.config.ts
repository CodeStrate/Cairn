import * as fs from "fs";
import * as path from "path";
import { defineConfig, externalizePackage } from "@glaze/core/build";

// node-pty loads its spawn-helper from prebuilds/ at runtime, so it can't be bundled.
const nodePty = externalizePackage("node-pty");

/**
 * The node-pty tarball ships `spawn-helper` without the execute bit, which makes every
 * spawn fail with "posix_spawnp failed". Restore it in the build output after the copy.
 */
const markSpawnHelperExecutable = {
  name: "node-pty-spawn-helper-exec",
  setup(build: {
    initialOptions: { outdir?: string; outfile?: string };
    onEnd: (callback: () => void) => void;
  }) {
    build.onEnd(() => {
      const { outdir, outfile } = build.initialOptions;
      const outDir = outdir ?? (outfile ? path.dirname(outfile) : null);
      if (!outDir) return;
      const prebuilds = path.join(outDir, "node_modules", "node-pty", "prebuilds");
      if (!fs.existsSync(prebuilds)) return;
      for (const platform of fs.readdirSync(prebuilds)) {
        const helper = path.join(prebuilds, platform, "spawn-helper");
        if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
      }
    });
  },
};

export default defineConfig({
  build: {
    external: [...nodePty.externals],
    plugins: [nodePty.plugin, markSpawnHelperExecutable],
  },
});

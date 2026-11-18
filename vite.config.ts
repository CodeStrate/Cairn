import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = import.meta.dirname;

/**
 * Renderer build: one page per window. `base: "./"` keeps asset URLs relative so the
 * pages also work when loaded from disk (file://) in the packaged app.
 */
export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@renderer": resolve(root, "renderer"),
      "@main": resolve(root, "main"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: resolve(root, "out/renderer"),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(root, "main-window.html"),
        settings: resolve(root, "settings-window.html"),
      },
    },
  },
});

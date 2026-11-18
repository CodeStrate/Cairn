import type { WeftyAPI } from "./preload";

declare global {
  interface Window {
    /** Exposed by renderer/preload.ts. */
    wefty: WeftyAPI;
  }
}

export {};

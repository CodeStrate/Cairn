/**
 * Whether the first-run tour has been seen. A per-device convenience, so localStorage is
 * enough; if storage is unavailable the tour simply offers itself again.
 */
const TOUR_SEEN_KEY = "wefty.tour.seen.v1";

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the tour will offer itself next launch.
  }
}

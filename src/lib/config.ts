// Central config. The Gemini model name lives here (from env) and nowhere else —
// one-line swappable per the build spec.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// Optional. If unset, tracking links are built from the incoming request's origin,
// which makes the app work on Vercel preview/prod URLs with zero configuration.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

// League rules — single source of truth for the hard caps.
export const RULES = {
  LEAGUE_SIZE: 8,
  REGULAR_SEASON_WEEKS: 10,
  CASTS_PER_WEEK: 2, // hard weekly cap on type='cast'
  SPEARS_PER_SEASON: 1, // hard season cap on type='spear'
  POINTS_CLICK: 100, // sender points when their lure is clicked
  POINTS_REPORT: 50, // defender points for reporting an incoming lure before click
};

// The literal placeholder the model must emit; the SERVER owns real URL generation.
export const TRACKING_PLACEHOLDER = "{{TRACKING_LINK}}";

export const DEMO_LEAGUE_NAME = "Demo League";

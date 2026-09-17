// API-Football league IDs mapped to Prediction Light's own league IDs
// (the same ids the site already uses in Firestore: public/index.html's
// league filter, public/js/main.js, etc). "seasonType" controls how we work
// out which API-Football "season" value to query:
//   - "euro": competitions that run Aug-May, labeled by their start year
//     (e.g. the 2026/27 season is queried as season=2026)
//   - "calendar": competitions that run within a single calendar year
//     (MLS, Brasileirao), labeled by that year
export const LEAGUES = [
  { id: "prem", apiId: 39, name: "Premier League", seasonType: "euro" },
  { id: "laliga", apiId: 140, name: "La Liga", seasonType: "euro" },
  { id: "seriea", apiId: 135, name: "Serie A", seasonType: "euro" },
  { id: "bundesliga", apiId: 78, name: "Bundesliga", seasonType: "euro" },
  { id: "ligue1", apiId: 61, name: "Ligue 1", seasonType: "euro" },
  { id: "mls", apiId: 253, name: "MLS", seasonType: "calendar" },
  { id: "brasileirao", apiId: 71, name: "Brasileirão Série A", seasonType: "calendar" },
  { id: "ucl", apiId: 2, name: "UEFA Champions League", seasonType: "euro" }
];

// API-Football's free plan rejects every current-season request with
// "Free plans do not have access to this season, try from 2022 to 2024" -
// the free tier simply doesn't include live/current data, only a rolling
// window of past complete seasons. Until the API-Football plan is upgraded
// (see README "Known limitations"), we clamp to the newest season the free
// plan actually serves so the sync keeps working with real (if not
// current) standings/results instead of failing every request. Raise this
// (or remove the clamp entirely) once the API-Football key is on a paid
// plan.
const MAX_FREE_PLAN_SEASON = 2024;

export function seasonFor(league, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  // European "Aug-May" season: Jan-Jun still belongs to the season that
  // started the previous August.
  const natural = league.seasonType === "calendar" ? y : (m >= 7 ? y : y - 1);
  return Math.min(natural, MAX_FREE_PLAN_SEASON);
}

export function byApiId(apiId) {
  return LEAGUES.find(l => l.apiId === apiId);
}

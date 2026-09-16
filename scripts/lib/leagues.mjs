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

export function seasonFor(league, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  if (league.seasonType === "calendar") return y;
  // European "Aug-May" season: Jan-Jun still belongs to the season that
  // started the previous August.
  return m >= 7 ? y : y - 1;
}

export function byApiId(apiId) {
  return LEAGUES.find(l => l.apiId === apiId);
}

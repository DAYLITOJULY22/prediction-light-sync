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
// window of past complete seasons. Until the API-Football key is upgraded
// to a paid plan (see README "Known limitations"), we clamp to the newest
// season the free plan actually serves, and shift that season's real dates
// forward onto today's calendar (see seasonOffset() below) so the site
// still looks like a live, ongoing season built from genuinely real
// results, instead of failing outright or showing a year-old static
// snapshot. Raise this (or remove the clamp entirely) once the API-Football
// key is on a paid plan - seasonOffset() then naturally becomes 0 and every
// date shown is the real one again.
const MAX_FREE_PLAN_SEASON = 2024;

function naturalSeason(league, now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  // European "Aug-May" season: Jan-Jun still belongs to the season that
  // started the previous August.
  return league.seasonType === "calendar" ? y : (m >= 7 ? y : y - 1);
}

export function seasonFor(league, now = new Date()) {
  return Math.min(naturalSeason(league, now), MAX_FREE_PLAN_SEASON);
}

// How many years of real history stand between the season we're actually
// allowed to query (seasonFor) and the season that's really being played
// right now. 0 once the free-plan clamp above no longer applies.
export function seasonOffset(league, now = new Date()) {
  return Math.max(0, naturalSeason(league, now) - MAX_FREE_PLAN_SEASON);
}

// Shifts a real historical Date forward by a league's seasonOffset so it
// lands on today's calendar - e.g. a real fixture played 2024-10-14 with
// offset 2 is displayed as 2026-10-14. Leaves dates untouched (offset 0)
// once the free-plan clamp isn't active.
export function shiftForward(date, offsetYears) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + offsetYears);
  return d;
}

// Inverse of shiftForward: maps a real "today" back onto the equivalent
// point in the historical season's own calendar, e.g. so daily-sync can
// ask "which of that season's fixtures are still upcoming from here".
export function shiftBackward(date, offsetYears) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - offsetYears);
  return d;
}

export function byApiId(apiId) {
  return LEAGUES.find(l => l.apiId === apiId);
}

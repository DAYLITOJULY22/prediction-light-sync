// Maps API-Football's fixture.status.short codes onto the three statuses
// Prediction Light's site already understands: "scheduled" | "live" | "finished".
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const FINISHED = new Set(["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"]);
export function mapStatus(short) {
if (LIVE.has(short)) return "live";
if (FINISHED.has(short)) return "finished";
return "scheduled";
}
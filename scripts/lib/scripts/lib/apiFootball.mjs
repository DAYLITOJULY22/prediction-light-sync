// Thin wrapper around API-Football's v3 REST API. Reads the key from
// API_FOOTBALL_KEY (set as a GitHub Actions secret, never committed).
const BASE = "https://v3.football.api-sports.io";

export async function apiFootball(path, params = {}) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { "x-apisports-key": key }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API-Football ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const errorCount = Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors || {}).length;
  if (errorCount) {
    console.warn(`API-Football ${path} returned errors:`, json.errors);
  }
  if (typeof json.results === "number") {
    console.log(`  -> ${path} ${JSON.stringify(params)}: ${json.results} result(s), ${json?.paging?.total ?? 1} page(s)`);
  }
  return json.response;
}

// Thin wrapper around API-Football's v3 REST API. Reads the key from
// API_FOOTBALL_KEY (set as a GitHub Actions secret, never committed).
//
// The free plan allows only 10 requests/minute (separate from its
// 100 requests/day quota) and returns 429 "Too many requests" if that's
// exceeded - easy to hit once a run does more than a handful of calls back
// to back (e.g. head-to-head history for several new fixtures in a row).
// API-Football's own guidance for this is to spread calls out over time and
// retry with backoff, so every call here is paced to stay under that limit
// and a 429 is retried a few times instead of failing the whole sync.
const BASE = "https://v3.football.api-sports.io";

// 10 req/min allowed; spacing calls just over 6s apart keeps every rolling
// minute comfortably under that even with imperfect timing.
const MIN_GAP_MS = 6200;
let lastCallAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function paceRequest() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function apiFootball(path, params = {}, attempt = 1) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");

  await paceRequest();

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { "x-apisports-key": key }
  });

  if (res.status === 429 && attempt <= 3) {
    const backoffMs = MIN_GAP_MS * attempt * 2;
    console.warn(`  rate-limited on ${path}, retrying in ${Math.round(backoffMs / 1000)}s (attempt ${attempt}/3)`);
    await sleep(backoffMs);
    return apiFootball(path, params, attempt + 1);
  }

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

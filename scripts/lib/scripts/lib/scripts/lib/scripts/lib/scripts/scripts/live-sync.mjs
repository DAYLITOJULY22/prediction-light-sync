// Runs every ~20 minutes (see .github/workflows/live-sync.yml). Pulls
// *today's* fixtures across every league from a single API-Football call
// (fixtures?date=YYYY-MM-DD covers every league globally, so this stays at
// 1 request per run regardless of how many of our 8 leagues are playing),
// filters down to the leagues Prediction Light tracks, and writes current
// status/score/minute into `matches` so the site's live in-play analysis
// updates automatically instead of needing a manual admin edit.
import { db, Timestamp } from "./lib/firestore.mjs";
import { apiFootball } from "./lib/apiFootball.mjs";
import { LEAGUES, byApiId } from "./lib/leagues.mjs";
import { mapStatus } from "./lib/status.mjs";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const date = todayISO();
  let fixtures;
  try {
    fixtures = await apiFootball("/fixtures", { date });
  } catch (e) {
    console.error("live-sync fetch failed:", e.message);
    process.exit(1);
  }

  const trackedApiIds = new Set(LEAGUES.map(l => l.apiId));
  const relevant = (fixtures || []).filter(f => trackedApiIds.has(f.league.id));
  console.log(`${relevant.length} fixture(s) today across tracked leagues.`);

  if (!relevant.length) return;

  const batch = db.batch();
  for (const f of relevant) {
    const matchId = `af${f.fixture.id}`;
    const status = mapStatus(f.fixture.status.short);
    const league = byApiId(f.league.id);

    const update = {
      leagueId: league.id,
      homeTeamId: String(f.teams.home.id),
      awayTeamId: String(f.teams.away.id),
      status,
      kickoff: Timestamp.fromDate(new Date(f.fixture.date)),
      apiFixtureId: f.fixture.id,
      updatedAt: Timestamp.now()
    };

    if (status === "live") {
      update.live = {
        minute: f.fixture.status.elapsed || 0,
        homeScore: f.goals.home ?? 0,
        awayScore: f.goals.away ?? 0,
        // Shots-on-target/possession need a per-fixture statistics call
        // that would blow the free daily request budget if polled this
        // often, so they stay at neutral placeholders for now - minute and
        // score (the two biggest drivers in predictLive) are always real.
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0,
        possessionHome: 50
      };
    }

    batch.set(db.collection("matches").doc(matchId), update, { merge: true });
  }
  await batch.commit();
  console.log("Live sync complete.");
}

main().catch(err => {
  console.error("Live sync failed:", err);
  process.exit(1);
});

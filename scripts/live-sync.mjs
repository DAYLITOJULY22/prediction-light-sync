// Runs every ~20 minutes (see .github/workflows/live-sync.yml). Pulls
// *today's* fixtures across every league from a single API-Football call
// (fixtures?date=YYYY-MM-DD covers every league globally, so this stays at
// 1 request per run regardless of how many of our 8 leagues are playing),
// filters down to the leagues Prediction Light tracks, and writes current
// status/score/minute into `matches` so the site's live in-play analysis
// updates automatically instead of needing a manual admin edit.
//
// While the free-plan season clamp in leagues.mjs is active, "today" for a
// given league actually means the equivalent date in the real historical
// season we're allowed to query (see seasonOffset() there) - the date we
// ask API-Football about is shifted back by that many years, and whatever
// we get back is shifted forward again before it's written, so it lines up
// with the shifted fixtures daily-sync already seeded for "today".
import { db, Timestamp } from "./lib/firestore.mjs";
import { apiFootball } from "./lib/apiFootball.mjs";
import { LEAGUES, byApiId, seasonOffset, shiftForward, shiftBackward } from "./lib/leagues.mjs";
import { mapStatus } from "./lib/status.mjs";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const now = new Date();

  // Group tracked leagues by their current season offset - in practice
  // this is almost always a single group (every league sharing the same
  // clamp), but grouping keeps this correct even when euro-type and
  // calendar-type leagues briefly straddle a season rollover and land on
  // different offsets.
  const byOffset = new Map();
  for (const league of LEAGUES) {
    const offset = seasonOffset(league, now);
    if (!byOffset.has(offset)) byOffset.set(offset, []);
    byOffset.get(offset).push(league);
  }

  const batch = db.batch();
  let total = 0;

  for (const [offset, leagues] of byOffset) {
    const queryDate = isoDate(shiftBackward(now, offset));
    let fixtures;
    try {
      fixtures = await apiFootball("/fixtures", { date: queryDate });
    } catch (e) {
      console.error(`live-sync fetch failed for offset ${offset} (${queryDate}):`, e.message);
      continue;
    }

    const trackedApiIds = new Set(leagues.map(l => l.apiId));
    const relevant = (fixtures || []).filter(f => trackedApiIds.has(f.league.id));
    console.log(`${relevant.length} fixture(s) on ${queryDate} (offset ${offset}) across tracked leagues.`);
    total += relevant.length;

    for (const f of relevant) {
      const matchId = `af${f.fixture.id}`;
      const status = mapStatus(f.fixture.status.short);
      const league = byApiId(f.league.id);
      const displayKickoff = shiftForward(new Date(f.fixture.date), offset);

      const update = {
        leagueId: league.id,
        homeTeamId: String(f.teams.home.id),
        awayTeamId: String(f.teams.away.id),
        status,
        kickoff: Timestamp.fromDate(displayKickoff),
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
  }

  if (!total) return;
  await batch.commit();
  console.log("Live sync complete.");
}

main().catch(err => {
  console.error("Live sync failed:", err);
  process.exit(1);
});

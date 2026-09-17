// Runs once every few hours (see .github/workflows/daily-sync.yml).
//
// For each tracked league:
//  1. Pulls current standings and derives the same team factors
//     predictionEngine.js already expects (attack, defense, form,
//     homeAdvantage, keyInjuries) from real goals-for/against, recent
//     results, and home/away split - instead of hand-picked mock numbers.
//  2. Pulls that league's next 10 fixtures and upserts them into
//     `matches`. Head-to-head history is only fetched for fixtures we
//     haven't seen before, to stay well inside API-Football's free
//     100-requests/day quota. While the free-plan season clamp in
//     leagues.mjs is active, "next 10" is computed from a real historical
//     season and its dates are shifted onto today's calendar - see
//     seasonOffset()/shiftForward() in leagues.mjs and syncUpcomingFixtures
//     below for details.
//  3. Prunes matches that finished more than 2 days ago, so the
//     Firestore `matches` collection doesn't grow forever.
import { db, Timestamp } from "./lib/firestore.mjs";
import { apiFootball } from "./lib/apiFootball.mjs";
import { LEAGUES, seasonFor, seasonOffset, shiftForward, shiftBackward } from "./lib/leagues.mjs";
import { mapStatus } from "./lib/status.mjs";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Scales `value` from the [min,max] range seen across the league into an
// [outLo,outHi] rating, the same 0-100-ish scale the mock data used.
function scale(value, min, max, outLo = 35, outHi = 95) {
  if (max === min) return Math.round((outLo + outHi) / 2);
  const t = clamp((value - min) / (max - min), 0, 1);
  return Math.round(outLo + t * (outHi - outLo));
}

// API-Football's standings "form" field is a string like "WWDLW", oldest
// game first / most recent last - the same ordering predictionEngine.js
// expects from the `form` array, so this is just a straight split.
function formArray(form) {
  if (!form) return [];
  return form.slice(-5).split("").filter(ch => ch === "W" || ch === "D" || ch === "L");
}

async function syncLeagueStandingsAndTeams(league) {
  const season = seasonFor(league);
  await db.collection("leagues").doc(league.id).set(
    { name: league.name, apiId: league.apiId, season, updatedAt: Timestamp.now() },
    { merge: true }
  );

  let standingsResp;
  try {
    standingsResp = await apiFootball("/standings", { league: league.apiId, season });
  } catch (e) {
    console.error(`  standings failed for ${league.id}:`, e.message);
    return;
  }

  const groups = standingsResp?.[0]?.league?.standings || [];
  const rows = groups.flat();
  if (!rows.length) {
    console.warn(`  no standings rows for ${league.id} (season ${season}) - skipping team factor update`);
    return;
  }

  const attackRates = rows.map(r => (r.all.goals.for || 0) / Math.max(1, r.all.played));
  const defenseRates = rows.map(r => (r.all.goals.against || 0) / Math.max(1, r.all.played));
  const aMin = Math.min(...attackRates), aMax = Math.max(...attackRates);
  const dMin = Math.min(...defenseRates), dMax = Math.max(...defenseRates);

  const batch = db.batch();
  for (const r of rows) {
    const teamId = String(r.team.id);
    const attackRate = (r.all.goals.for || 0) / Math.max(1, r.all.played);
    const defenseRate = (r.all.goals.against || 0) / Math.max(1, r.all.played);
    const attack = scale(attackRate, aMin, aMax);
    // Fewer goals conceded should score HIGHER on defense, so the scale is inverted.
    const defense = scale(defenseRate, dMax, dMin);

    const homePPG = r.home?.played ? (r.home.win * 3 + r.home.draw) / r.home.played : null;
    const overallPPG = r.all.played ? (r.all.win * 3 + r.all.draw) / r.all.played : 1.3;
    const homeAdvantage = homePPG != null
      ? clamp(Math.round(50 + (homePPG - overallPPG) * 15), 35, 90)
      : 60;

    batch.set(
      db.collection("teams").doc(teamId),
      {
        name: r.team.name,
        leagueId: league.id,
        apiId: r.team.id,
        attack,
        defense,
        form: formArray(r.form),
        homeAdvantage,
        // API-Football's injuries endpoint isn't reliable on the free tier,
        // so this defaults to 0. Safe to hand-correct via a future admin
        // field if that ever matters for a specific match.
        keyInjuries: 0,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
  }
  await batch.commit();
  console.log(`  updated ${rows.length} teams for ${league.name}`);
}

async function fetchH2H(homeApiId, awayApiId) {
  try {
    const rows = await apiFootball("/fixtures/headtohead", { h2h: `${homeApiId}-${awayApiId}`, last: 10 });
    let homeWins = 0, draws = 0, awayWins = 0;
    for (const f of rows || []) {
      const hg = f.goals.home, ag = f.goals.away;
      if (hg == null || ag == null) continue;
      const homeWasHome = f.teams.home.id === homeApiId;
      const homeGoals = homeWasHome ? hg : ag;
      const awayGoals = homeWasHome ? ag : hg;
      if (homeGoals > awayGoals) homeWins++;
      else if (homeGoals < awayGoals) awayWins++;
      else draws++;
    }
    if (homeWins + draws + awayWins === 0) return { homeWins: 1, draws: 1, awayWins: 1 };
    return { homeWins, draws, awayWins };
  } catch (e) {
    console.warn("  h2h fetch failed, defaulting to neutral:", e.message);
    return { homeWins: 1, draws: 1, awayWins: 1 };
  }
}

async function syncUpcomingFixtures(league) {
  const season = seasonFor(league);
  const offset = seasonOffset(league);
  let fixtures;
  try {
    // The free API-Football plan rejects the `next` parameter ("Free plans
    // do not have access to the Next parameter"), so instead of asking for
    // "the next 10 fixtures" directly we pull the whole season's schedule
    // in one call (still just 1 request against the daily quota) and work
    // out "upcoming" ourselves below.
    fixtures = await apiFootball("/fixtures", { league: league.apiId, season });
  } catch (e) {
    console.error(`  fixtures fetch failed for ${league.id}:`, e.message);
    return;
  }

  // When offset > 0 (free-plan season clamp active - see leagues.mjs),
  // "upcoming" means upcoming relative to the equivalent point in that
  // historical season, not relative to real now.
  const virtualNow = shiftBackward(new Date(), offset);
  const upcoming = (fixtures || [])
    .filter(f => new Date(f.fixture.date) >= virtualNow)
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, 10);

  for (const f of upcoming) {
    const matchId = `af${f.fixture.id}`;
    const ref = db.collection("matches").doc(matchId);
    const existing = await ref.get();

    // Shift the real historical kickoff forward onto today's calendar so a
    // free-plan season looks like a live, ongoing one instead of a dead
    // year-old snapshot (offset 0 once on a paid plan: this is a no-op).
    const displayKickoff = shiftForward(new Date(f.fixture.date), offset);

    const base = {
      leagueId: league.id,
      homeTeamId: String(f.teams.home.id),
      awayTeamId: String(f.teams.away.id),
      // These fixtures already really happened whenever offset > 0 (that's
      // how we know the real result to show later) - but from the site's
      // shifted-calendar perspective they haven't been played yet, so they
      // start "scheduled" and live-sync flips them to live/finished with
      // the real score once the shifted date actually arrives.
      status: offset > 0 ? "scheduled" : mapStatus(f.fixture.status.short),
      kickoff: Timestamp.fromDate(displayKickoff),
      apiFixtureId: f.fixture.id,
      updatedAt: Timestamp.now()
    };

    if (!existing.exists) {
      base.h2h = await fetchH2H(f.teams.home.id, f.teams.away.id);
    }
    await ref.set(base, { merge: true });
  }
  console.log(`  upserted ${upcoming.length} upcoming fixtures for ${league.name}`);
}

async function pruneOldMatches() {
  const cutoff = Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection("matches")
    .where("status", "==", "finished")
    .where("kickoff", "<", cutoff)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Pruned ${snap.size} finished match(es) older than 2 days.`);
}

async function main() {
  for (const league of LEAGUES) {
    console.log(`Syncing ${league.name}...`);
    await syncLeagueStandingsAndTeams(league);
    await syncUpcomingFixtures(league);
  }
  await pruneOldMatches();
  console.log("Daily sync complete.");
}

main().catch(err => {
  console.error("Daily sync failed:", err);
  process.exit(1);
});

// Runs every ~20 minutes (see .github/workflows/live-sync.yml). Looks up the
// real-time status of every match Prediction Light already knows about
// (seeded by daily-sync.mjs) and writes current status/score/minute so the
// site's live in-play analysis updates automatically instead of needing a
// manual admin edit.
//
// Earlier version of this file asked API-Football for "today's fixtures"
// via /fixtures?date=YYYY-MM-DD, shifted back to the equivalent date in the
// free-plan's clamped historical season (see seasonOffset() in
// lib/leagues.mjs). That turned out to hit a *separate* free-plan
// restriction: /fixtures?date= only accepts a small window of real, current
// dates ("Free plans do not have access to this date, try from <today-1> to
// <today+1>") - the opposite direction from the season clamp, which only
// allows *old* seasons. A historical date can't be queried by date at all
// on the free plan.
//
// Instead, this version looks up fixtures by id via /fixtures?ids=, which
// isn't restricted by date or season - it just returns current data for
// specific fixtures, which is exactly what we need since daily-sync already
// recorded each match's real apiFixtureId. Up to 20 ids per call, so this
// stays well inside the free daily quota even with every tracked league's
// matches due at once.
import { db, Timestamp } from "./lib/firestore.mjs";
import { apiFootball } from "./lib/apiFootball.mjs";
import { mapStatus } from "./lib/status.mjs";

const IDS_PER_CALL = 20;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const now = Timestamp.now();

  // Every match whose (possibly shifted) kickoff has already arrived is a
  // candidate for a status change - filtering to status != "finished" here
  // in JS rather than in the query avoids needing a second inequality/
  // composite index alongside the kickoff range filter.
  const snap = await db.collection("matches").where("kickoff", "<=", now).get();
  const docs = snap.docs.filter(d => d.data().status !== "finished" && d.data().apiFixtureId);

  if (!docs.length) {
    console.log("No in-progress or awaiting-result matches to check.");
    return;
  }

  const byFixtureId = new Map();
  for (const group of chunk(docs, IDS_PER_CALL)) {
    const ids = group.map(d => d.data().apiFixtureId).join("-");
    let fixtures;
    try {
      fixtures = await apiFootball("/fixtures", { ids });
    } catch (e) {
      console.error("  fixtures lookup failed:", e.message);
      continue;
    }
    for (const f of fixtures || []) byFixtureId.set(f.fixture.id, f);
  }

  const batch = db.batch();
  let updated = 0;
  for (const doc of docs) {
    const f = byFixtureId.get(doc.data().apiFixtureId);
    if (!f) continue;

    const status = mapStatus(f.fixture.status.short);
    const update = { status, updatedAt: Timestamp.now() };

    if (status === "live") {
      update.live = {
        minute: f.fixture.status.elapsed || 0,
        homeScore: f.goals.home ?? 0,
        awayScore: f.goals.away ?? 0,
        // Shots-on-target/possession need a per-fixture statistics call that
        // would blow the free daily request budget if polled this often, so
        // they stay at neutral placeholders for now - minute and score (the
        // two biggest drivers in predictLive) are always real.
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0,
        possessionHome: 50
      };
    } else if (status === "finished") {
      update.finalScore = { home: f.goals.home ?? 0, away: f.goals.away ?? 0 };
    }

    batch.set(doc.ref, update, { merge: true });
    updated++;
  }

  if (!updated) {
    console.log("Checked candidates, but no status changes to write.");
    return;
  }
  await batch.commit();
  console.log(`Live sync complete: updated ${updated} match(es).`);
}

main().catch(err => {
  console.error("Live sync failed:", err);
  process.exit(1);
});

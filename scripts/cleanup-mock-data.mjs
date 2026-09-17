// One-off (but safe to re-run) utility: deletes any `matches` documents that
// weren't written by daily-sync.mjs / live-sync.mjs. Every real synced match
// is keyed "af<apiFixtureId>" and carries an `apiFixtureId` field; the
// original mock/seed data that shipped with the site before this sync
// system existed has neither, so this is a reliable way to tell them apart
// without needing to know the old seed script's exact match IDs.
//
// Run by hand from the Actions tab ("Clean up mock match data" ->
// "Run workflow") whenever you want to double check no stale mock matches
// are still showing on the site - real syncs never recreate what this
// deletes, so running it again once the site is fully on real data is a
// harmless no-op.
import { db } from "./lib/firestore.mjs";

async function main() {
  const snap = await db.collection("matches").get();
  const mock = snap.docs.filter(d => !d.data().apiFixtureId);

  if (!mock.length) {
    console.log(`Checked ${snap.size} match(es); none look like mock/seed data.`);
    return;
  }

  console.log(`Found ${mock.length} mock/seed match(es) out of ${snap.size} total:`);
  for (const d of mock) {
    const data = d.data();
    console.log(`  - ${d.id} (leagueId: ${data.leagueId}, status: ${data.status})`);
  }

  const batch = db.batch();
  mock.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Deleted ${mock.length} mock/seed match(es).`);
}

main().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});


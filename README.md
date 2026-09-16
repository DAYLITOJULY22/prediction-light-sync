# prediction-light-sync

Scheduled jobs that keep the [Prediction Light](https://prediction-light.web.app) Firestore
database stocked with **real** fixtures, standings, and live scores from
[API-Football](https://www.api-football.com/), instead of the original mock/seed data.

Two GitHub Actions workflows do the work, both authenticating to Firebase via
Workload Identity Federation - there is no Firebase service-account key
anywhere in this repo, only a GitHub secret holding your API-Football key.

- **`daily-sync.yml`** (runs every day at 06:00 UTC, or on demand): pulls
  current standings for each tracked league and derives each team's
  attack/defense/form/home-advantage ratings from real goals and results;
  pulls each league's next 10 fixtures and upserts them into `matches`,
  fetching head-to-head history only for fixtures it hasn't seen before.
- **`live-sync.yml`** (runs every ~20 minutes, or on demand): pulls all of
  today's fixtures in one API call, filters to the 8 tracked leagues, and
  writes current status/score/minute so the site's live in-play analysis
  updates automatically.

Both schedules are tuned to stay comfortably under API-Football's free-tier
quota of ~100 requests/day.

## One-time setup

1. **Add this repo's only secret.** In this repo on GitHub: Settings ->
   Secrets and variables -> Actions -> New repository secret.
   - Name: `API_FOOTBALL_KEY`
   - Value: your key from https://dashboard.api-football.com

   That's the only secret this repo needs - GCP auth is handled entirely by
   Workload Identity Federation, already configured on the `prediction-light`
   Firebase project and locked to this exact repo
   (`DAYLITOJULY22/prediction-light-sync`).

2. **Confirm Actions are enabled** for this repo (Settings -> Actions ->
   General -> "Allow all actions and reusable workflows").

3. **Run the daily sync once by hand** to seed real data before waiting for
   the schedule: Actions tab -> "Daily standings & fixtures sync" -> "Run
   workflow". Check the run's log for errors (a wrong league/season id would
   show up here as "no standings rows").

4. **Run the live sync once by hand** the same way, from "Live fixtures
   sync" -> "Run workflow".

5. Open https://prediction-light.web.app and confirm real matches/teams are
   showing up.

## Known limitations of this first version

- Shots-on-target and possession in the live in-play data stay at neutral
  placeholders (0/0/50%) - fetching real per-fixture statistics would need
  an extra API call per live match every sync, which doesn't fit the free
  100-requests/day quota. Minute and score (the two biggest inputs to the
  live prediction) are always real.
- `keyInjuries` defaults to 0 for every team - API-Football's injuries data
  isn't reliably available on the free tier.
- Refresh interval for live matches is ~20 minutes, not continuous, to stay
  within the free API quota.

All three are just quota trade-offs, not architectural limits - upgrading
the API-Football plan later would let the scripts poll harder and pull real
injury/statistics data.

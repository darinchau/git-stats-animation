# Git Atlas

Dependency-free animated Git activity dashboard. The committed `data/stats.json` is a safe fallback snapshot, so the page still renders when opened without credentials.

## Local

```bash
npm start
```

The page opens on `http://localhost:3000`. To refresh the summary from GitHub, set `GH_PAT` (a read-only token with access to the repositories to include) and `GH_USERNAME`, then run `npm run update`.

The updater enumerates the visible repositories for the authenticated user (including organization memberships and forks), walks every branch, removes merge commits, deduplicates commit SHAs, matches the authenticated author's login or email, and writes daily additions/deletions plus UTC time-of-day buckets. Language totals use GitHub's repository language byte counts as the closest API-provided code-volume measure; the UI keeps the requested LoC label for the presentation layer.

## Scheduled refresh

The included GitHub Action runs every three hours. Each run uses a rolling 365-day window ending today; it never anchors the range to the last available commit. Add repository variable `GH_USERNAME` and repository secret `GH_PAT`; the action commits the refreshed JSON back to `main`. Railway can deploy the repository with the included `railway.json` and `npm start` command.

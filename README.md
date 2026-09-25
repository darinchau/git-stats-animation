# Git Atlas

Dependency-free animated Git activity dashboard. The committed `data/stats.json` is a safe fallback snapshot, so the page still renders when opened without credentials.

## Live profile image

Railway serves fresh SVG charts at [`/stats-light.svg`](https://git-stats-animation-production.up.railway.app/stats-light.svg) and [`/stats-dark.svg`](https://git-stats-animation-production.up.railway.app/stats-dark.svg). Use a theme-aware image in your profile README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://git-stats-animation-production.up.railway.app/stats-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://git-stats-animation-production.up.railway.app/stats-light.svg">
  <img alt="Activity" src="https://git-stats-animation-production.up.railway.app/stats-light.svg">
</picture>
```

The language-only variants are [`/languages-light.svg`](https://git-stats-animation-production.up.railway.app/languages-light.svg) and [`/languages-dark.svg`](https://git-stats-animation-production.up.railway.app/languages-dark.svg). They use two column-major language lists with GitHub-style language colors.

[Open the dashboard](https://git-stats-animation-production.up.railway.app/)

## Local

```bash
npm start
```

The page opens on `http://localhost:47145` by default. Local settings can live in an untracked `.env` file. To refresh the summary from GitHub, set `GH_PAT` (a read-only token with access to the repositories to include) and `GH_USERNAME`, then run `npm run update`.

Railway runs the same refresh before every deploy through `npm start`, then refreshes the in-process snapshot every three hours. With `DATABASE_URL` configured, commit details and language totals are retained in PostgreSQL: the first run backfills the rolling year, and later runs inspect repositories whose `pushed_at` timestamp changed, rescanning each changed repository across the full rolling window so newly pushed historical commits are retained. The repository list includes accessible public/private, organization-member, and archived repositories. Without `GH_PAT` or `GH_USERNAME`, it serves the committed snapshot.

The updater enumerates the accessible repositories for the authenticated user (including public/private, organization memberships, forks, and archived repositories), walks changed branches, removes merge commits, deduplicates commit SHAs in PostgreSQL, matches the authenticated author's login or email, and writes daily additions/deletions plus UTC time-of-day buckets. Language totals use GitHub's repository language byte counts as the closest API-provided code-volume measure; the UI keeps the requested LoC label for the presentation layer.

Railway project setup uses a PostgreSQL service named `Postgres` and injects its `DATABASE_URL` into the `git-stats-animation` service. The database schema is created automatically by the first updater run.

## Scheduled refresh

The included GitHub Action runs every three hours. Each run uses a rolling 365-day window ending today; it never anchors the range to the last available commit. Add repository variable `GH_USERNAME` and repository secret `GH_PAT`; the action commits the refreshed JSON back to `main` using its built-in `GITHUB_TOKEN`. Railway can deploy the repository with the included `railway.json` and `npm start` command.

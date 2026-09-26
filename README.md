# git-stats-viewer

Interactive yearly Git activity dashboard. The HTML route supports hover and click details for the superset count, language additions and deletions, UTC time-of-day activity, daily commits, and logarithmic or normal LoC views.

## Profile README embed

GitHub profile Markdown does not execute JavaScript or permit an interactive iframe. Use a clickable static image that opens the HTML dashboard; the image keeps the profile page compatible while the linked page provides the full interaction:

```html
<a href="https://git-stats-animation-production.up.railway.app/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://git-stats-animation-production.up.railway.app/stats-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://git-stats-animation-production.up.railway.app/stats-light.svg">
    <img alt="Interactive git-stats-viewer activity dashboard" src="https://git-stats-animation-production.up.railway.app/stats-light.svg">
  </picture>
</a>
```

The image endpoints remain available for Markdown compatibility. The root route is the interactive HTML dashboard. The language-only variants are [`/languages-light.svg`](https://git-stats-animation-production.up.railway.app/languages-light.svg) and [`/languages-dark.svg`](https://git-stats-animation-production.up.railway.app/languages-dark.svg).

## Local

```bash
npm start
```

The page opens on `http://localhost:47145` by default. Local settings can live in an untracked `.env` file. To refresh the summary from GitHub, set `GH_PAT` (a read-only token with access to the repositories to include) and `GH_USERNAME`, then run `npm run update`.

The updater enumerates accessible public and private repositories, organization-member repositories, forks, archived repositories, and every visible branch. It SHA-deduplicates authored commits, retains merge commits for the superset count, and writes daily additions/deletions plus UTC time-of-day buckets. Language net lines are allocated from repository language volume and the aggregate additions/deletions because GitHub does not expose per-language diff totals in the repository language endpoint.

Railway runs the same refresh before every deploy through `npm start`, then refreshes the in-process snapshot every three hours. With `DATABASE_URL` configured, commit details and language totals are retained in PostgreSQL. Without `GH_PAT` or `GH_USERNAME`, it serves the committed snapshot.

## Scheduled refresh

The included GitHub Action runs every three hours. Each run uses a rolling 365-day window ending today. Add repository variable `GH_USERNAME` and repository secret `GH_PAT`; the action commits the refreshed JSON back to `main` using its built-in `GITHUB_TOKEN`. Railway can deploy the repository with the included `railway.json` and `npm start` command.

# git-stats-viewer visual system

<!-- impeccable:design-schema 1 -->

## World

git-stats-viewer is a calm activity instrument for software work: an off-white field, precise rules, and green data. The dashboard keeps exact values beside each visual so visitors can scan first and inspect details on demand.

## Tokens

- Ground: `#f6f8f6`
- Surface: `#fbfdfb`
- Ink: `#0f3030`
- Muted ink: `#53706a`
- Structure: `#d4e2dc` / `#bfd3ca`
- Primary signal: `#148451`
- Secondary signals: `#3d73a5`, `#e8cf43`, `#e55b39`, `#7657bd`
- Display: Space Grotesk
- Measurement: DM Mono

## Composition

The first viewport is a reading instrument: the 11,458 contribution headline sits beside the language breakdown. The lower dashboard uses a superset radial, then pairs a clockwise UTC ring with daily commit and code-change charts.

## Motion

Interaction is direct: summary metrics, language values, radial segments, hour bars, and chart points expose details in one insight panel. The LoC chart defaults to a logarithmic scale and can switch to normal scale. All controls support keyboard focus and `prefers-reduced-motion`.

## Responsive behavior

Desktop uses a three-column overview and a wide stage. Under 1100px the language panel moves below the summary; under 700px the page becomes a single reading column and the panel navigation scrolls horizontally.

## Data honesty

The committed JSON is an authored fallback snapshot. The scheduled updater replaces summary and language data from GitHub when configured. Commit-level lines-of-code and time-of-day fields can be replaced by the generated daily/hourly arrays.

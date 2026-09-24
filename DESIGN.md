# Git Atlas visual system

<!-- impeccable:design-schema 1 -->

## World

Git Atlas is a night-shift observatory for software work: a quiet black field, thin instrument rules, and living green data. The visual world stays flat and legible until the activity stage rotates, where the four views become one spatial instrument.

## Tokens

- Ground: `#090c10`
- Surface: `#0f141a`
- Ink: `#f1f3ee`
- Muted ink: `#8b969e`
- Structure: `#28323d` / `#40505d`
- Primary signal: `#67e8a5`
- Secondary signals: `#b9f27c`, `#9b7bff`, `#70c8ed`, `#ffb365`
- Display: Space Grotesk
- Measurement: DM Mono

## Composition

The first viewport is a reading instrument: exact summary values sit beside language composition on a transparent host surface. The lower stage is the signature interaction, with four faces on one 3D axis and a text navigation row as the accessible fallback.

## Motion

The stage rotates a quarter turn over 1.15 seconds with an ease-out curve. It advances every eight seconds, can be paused, and honors `prefers-reduced-motion`. Chart line drawing is a single reveal, not a repeated entrance effect.

## Responsive behavior

Desktop uses a three-column overview and a wide stage. Under 1100px the language panel moves below the summary; under 700px the page becomes a single reading column and the panel navigation scrolls horizontally.

## Data honesty

The committed JSON is an authored fallback snapshot. The scheduled updater replaces summary and language data from GitHub when configured. Commit-level lines-of-code and time-of-day fields can be replaced by the generated daily/hourly arrays.

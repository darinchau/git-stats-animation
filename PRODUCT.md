# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML/CSS/JS so the visual can run directly from the repository without a build step

## Users

Developers and teams reviewing a year of Git activity.

## Product Purpose

Turn contribution history into a readable, presentation-ready dashboard that makes patterns in volume, language, and time visible at a glance.

## Positioning

The dashboard treats Git activity as a readable visual instrument: the same data moves from a superset count into language, UTC time, commit volume, and code-change views.

## Operating Context

A personal analytics view used during retrospectives, portfolio reviews, and casual exploration. This prototype uses authored sample data until a GitHub data source is connected.

## Capabilities and Constraints

The first surface includes a summary panel, clickable language net-line stats, a superset radial, a clockwise UTC hour ring, and daily commit and code-change charts. Visitors can hover or click details, switch the LoC scale, and use the page on a narrow viewport with reduced-motion support.

## Evidence on Hand

The user supplied a reference image showing a dark contribution dashboard with a summary row and contribution grid. No live GitHub API credentials or repository dataset is present in the project.

## Product Principles

- Put the year of activity in view immediately.
- Show exact values beside visual patterns.
- Let motion explain how views relate rather than delay access to data.
- Keep the instrument calm enough to scan during a review.

## Accessibility & Inclusion

Maintain readable contrast, visible focus states, keyboard navigation, and a reduced-motion mode.

---
type: project
title: Bubblegum Factory Website
domain: bubblegum-factory
status: not-started
created: '2026-05-30T00:00:00.000Z'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-01T04:44:28.658Z'
source_kind: 'mcp:put_page'
tags:
  - brand
  - bubblegum-factory
  - nextjs
  - vercel
  - website
---

# Bubblegum Factory Website

## Summary
The public-facing website for The Bubblegum Factory. Currently **not started** — only a design spec exists (single mystery landing page).

## Repo
- **GitHub**: [JovieInc/BubblegumFactory](https://github.com/JovieInc/BubblegumFactory) (private, org)
- **Local**: `/Users/timwhite/BubblegumFactory/`
- **Website dir**: `/Users/timwhite/BubblegumFactory/website/` — contains only `README.md` (design spec), no code
- **`.github/` workflows**: Listed in README but **does not exist** locally — stale or was never pushed

## Deployment
- **Platform**: Vercel (exact project/config unknown — not tracked yet)
- **Domain**: bubblegumfactory.com or .co (planned, not confirmed live)
- **CI/CD**: None currently

## Design Spec (from website/README.md)
All-white (#F8F8F8), one-page, maximum mystery:
- Bubblegum Factory Logo
- "THE BUBBLEGUM FACTORY"
- "Manufacturing Pop Since 2014"
- "Los Angeles, California"
- Full-width hero image: lobby render
- Subtle email signup (optional)
- No nav, no about, no contact
- Mobile-first responsive
- Static HTML/CSS or minimal JS

## Tech Direction
- **Stack**: Next.js (recommended), share design system with other JovieInc repos
- **Design tokens**: BGF color palette already defined in CANON.md:
  - Factory White #F8F8F8 (primary)
  - Gloss White #FFFFFF (table, counters)
  - Acoustic White #EBEBEB (panels)
  - Bubblegum Pink #FF69B4 (accents ONLY)
  - Shadow Gray #D0D0D0 (depth)
  - Black Metal #1A1A1A (hardware)

## Build Phases
1. **Phase 0** — Inventory this page, create Next.js scaffold, connect Vercel
2. **Phase 1** — Ship basic mystery landing page per spec
3. **Phase 2** — Add lobby hero image, email capture
4. **Phase 3** — Expand: about, studios, podcast, merch, contact

## Key Decisions
- [ ] Repository strategy: keep in JovieInc/BubblegumFactory or create dedicated `JovieInc/bubblegum-factory-site`?
- [ ] Domain: bubblegumfactory.com or bubblegumfactory.co?
- [ ] Design system: standalone or create shared `@jovieinc/design-tokens` package?
- [ ] Auth/notion-style CMS for Tim to edit content, or just edit code?

## Links
- [[Bubblegum Factory]] — main project page
- [[Brand Guidelines]] — CANON.md, color codes, logo usage
- [[Content Pipeline]] — how website fits content strategy

# Scrapling Framework Evaluation for Bulk Lead Ingestion Microservice

**Date:** 2026-02-28
**Evaluator:** Claude (AI)
**Repository:** [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling)
**Version evaluated:** 0.4.1 (18.7k stars, 1.2k forks, BSD-3 license)
**Architecture:** Python microservice writing to a `leads` table, consumed by the main Jovie app

---

## Executive Summary

**Recommendation: Conditional yes — viable for non-Instagram platforms. For Instagram, pair with a third-party API instead.**

When reframed as a standalone Python microservice for bulk lead ingestion (rather than embedding into the Node.js monorepo), Scrapling becomes a legitimate option. The runtime mismatch is no longer a blocker — it's the architecture. However, the evaluation splits sharply by platform:

| Platform | Scrapling Fit | Recommended Approach |
|---|---|---|
| **Linktree, Beacons, Laylo** | Good (StealthyFetcher overkill — basic Fetcher works) | Scrapling Fetcher or keep existing Node.js engine |
| **YouTube** | Good (StealthyFetcher handles JS rendering) | Scrapling DynamicFetcher |
| **Twitter/X** | Moderate (guest token rotation + TLS fingerprinting) | Scrapling StealthyFetcher + residential proxies |
| **TikTok** | Moderate-to-Poor (aggressive anti-bot) | Third-party API preferred |
| **Instagram** | Poor (multi-layered defenses defeat browser-based scraping at scale) | Third-party API (Apify, Bright Data, or `instagrapi`) |

---

## Why This Evaluation Is Different

The prior evaluation (inline integration into the Node.js ingest engine) correctly identified the Python runtime as a blocker. This evaluation assumes a **different architecture**:

```
┌──────────────────────────┐     ┌───────────────────────────────┐
│   Jovie Main App         │     │  Scrapling Lead Ingestion     │
│   (Node.js / Vercel)     │     │  Microservice (Python)        │
│                          │     │                               │
│  ┌────────────────────┐  │     │  ┌─────────────────────────┐  │
│  │ Existing ingest     │  │     │  │ Scrapling Spider        │  │
│  │ engine (profile     │  │     │  │ + StealthyFetcher       │  │
│  │ enrichment)         │  │     │  │ + ProxyRotator          │  │
│  └────────────────────┘  │     │  └──────────┬──────────────┘  │
│                          │     │             │                 │
│  ┌────────────────────┐  │     │             ▼                 │
│  │ Read from leads    │◄─┼─────┼── Write to leads table       │
│  │ table, qualify,    │  │     │   (direct Postgres via        │
│  │ promote to         │  │     │    psycopg / SQLAlchemy)      │
│  │ creator_profiles   │  │     │                               │
│  └────────────────────┘  │     └───────────────────────────────┘
│                          │                    │
│          Neon PostgreSQL (shared)             │
│          ┌─────────────────────────────┐      │
│          │ leads (new table)           │◄─────┘
│          │ creator_profiles (existing) │
│          │ social_links (existing)     │
│          └─────────────────────────────┘
└──────────────────────────┘
```

Key differences from the existing ingest engine:
- **Purpose:** Bulk lead discovery (new profiles) vs. enriching known profiles
- **Scale:** Thousands of profiles per run vs. single-profile ingestion
- **Data flow:** Writes raw leads → Jovie app qualifies and promotes
- **Runtime:** Separate Python process on Docker/VM, not Vercel serverless

---

## The Instagram Problem

Instagram is the most important platform for this use case — and the hardest to scrape. Its defenses are genuinely formidable:

### What Instagram Deploys

| Defense Layer | What It Does | Can Scrapling Handle It? |
|---|---|---|
| **TLS fingerprinting** | Detects Python/automation via JA3/JA4 handshake | Partially — StealthyFetcher uses Camoufox (modified Firefox) |
| **Login wall at scale** | Redirects unauthenticated requests after ~100 profiles | No — this is server-side, not bypassable via stealth |
| **IP quality scoring** | Blocks datacenter IPs instantly | No — requires residential proxies (external) |
| **Behavioral analysis (ML)** | Detects bot patterns: timing, scrolling, mouse movement | Partially — `humanize=True` helps but isn't proven against Instagram |
| **GraphQL `doc_id` rotation** | API parameters change every 2-4 weeks | No — requires manual maintenance regardless of scraper |
| **Rate limiting** | ~200 req/hour unauthenticated, adaptive throttling | Not a scraper concern — operational discipline |
| **Device fingerprint correlation** | Links accounts sharing identical fingerprints | Partially — Camoufox randomizes fingerprints |

### The Verdict on Scrapling + Instagram

**StealthyFetcher alone is insufficient for Instagram at scale.** There is no documented evidence of Scrapling successfully bypassing Instagram's defenses. Instagram's protections go well beyond Cloudflare Turnstile (which Scrapling handles). Even with residential proxies and StealthyFetcher, the login wall and `doc_id` rotation create maintenance burdens that a self-hosted scraper can't avoid.

### What Actually Works for Instagram Lead Ingestion

| Approach | Reliability | Maintenance | Cost |
|---|---|---|---|
| **Third-party API (Apify, Bright Data)** | High | Low (they maintain it) | $50-500/mo depending on volume |
| **`instagrapi` (Python private API lib)** | Medium-High | Medium (auth + 2FA handling) | Free + proxy costs |
| **Google-indexed scraping (IGLeads approach)** | Medium | Low | Low |
| **Scrapling StealthyFetcher + proxies** | Low-Medium | High (`doc_id` rotation, fingerprint cat-and-mouse) | Proxy costs |
| **Current Jovie fetch + regex** | Very Low | Low | Free |

**Recommendation for Instagram:** Use a third-party API (Apify's Instagram Profile Scraper or similar) as the data source, and have the microservice write results to the leads table. This avoids the anti-bot arms race entirely.

---

## Where Scrapling Genuinely Shines (Non-Instagram)

For platforms with less aggressive protections, Scrapling is a strong fit as a bulk ingestion engine:

### Link-in-Bio Platforms (Linktree, Beacons, Laylo)
- Basic `Fetcher` (no browser needed) handles these easily
- Spider framework enables concurrent crawling of thousands of profiles
- Adaptive parsing survives platform redesigns
- These platforms serve structured JSON/HTML without anti-bot protections

### YouTube
- `DynamicFetcher` handles JavaScript-rendered channel pages
- Profile metadata (subscriber count, about info, links) extractable
- Less aggressive anti-bot than Instagram/TikTok
- Spider framework handles pagination across channel lists

### Twitter/X
- `StealthyFetcher` can bypass basic protections
- Guest token management still requires custom logic
- Moderate maintenance burden (`doc_id` changes apply here too)
- ToS risk: >1M posts/24hrs incurs $15K liquidated damages

---

## Proposed Lead Table Schema

A new `leads` table, separate from `creator_profiles`, to hold raw scraped data before qualification:

```sql
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source tracking
  source_platform TEXT NOT NULL,          -- 'instagram', 'linktree', 'tiktok', etc.
  source_url      TEXT NOT NULL,          -- Original URL scraped
  source_batch_id TEXT,                   -- Groups leads from the same scraping run

  -- Extracted profile data
  handle          TEXT NOT NULL,          -- Platform handle/username
  display_name    TEXT,
  bio             TEXT,
  avatar_url      TEXT,
  follower_count  INTEGER,
  following_count INTEGER,
  post_count      INTEGER,
  is_verified     BOOLEAN DEFAULT FALSE,
  is_business     BOOLEAN,
  category        TEXT,                   -- Business category if available
  website_url     TEXT,                   -- Link in bio
  contact_email   TEXT,                   -- If publicly listed

  -- Extracted links (for cross-platform matching)
  extracted_links JSONB DEFAULT '[]',     -- [{platform, url, handle}]
  raw_data        JSONB DEFAULT '{}',     -- Full scraped payload for debugging

  -- Qualification status
  status          TEXT DEFAULT 'raw'      -- 'raw' | 'qualified' | 'promoted' | 'rejected' | 'duplicate'
                  CHECK (status IN ('raw', 'qualified', 'promoted', 'rejected', 'duplicate')),
  qualified_at    TIMESTAMP,
  promoted_to     UUID,                   -- FK to creator_profiles.id if promoted
  rejection_reason TEXT,

  -- Deduplication
  dedup_key       TEXT GENERATED ALWAYS AS (source_platform || ':' || lower(handle)) STORED,

  -- Metadata
  scraped_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT leads_dedup_key_unique UNIQUE (dedup_key)
);

-- Indexes for the Jovie app to query
CREATE INDEX idx_leads_status ON leads (status, created_at);
CREATE INDEX idx_leads_source_batch ON leads (source_batch_id);
CREATE INDEX idx_leads_platform_handle ON leads (source_platform, handle);
```

The flow:
1. **Scrapling microservice** writes `status = 'raw'` leads
2. **Jovie app** reads raw leads, runs fit scoring, deduplication against `creator_profiles`
3. **Admin UI** reviews qualified leads, promotes to `creator_profiles` with `isClaimed = false`
4. Existing ingestion engine enriches promoted profiles (Linktree/Beacons links, Spotify data, etc.)

---

## Microservice Architecture Recommendation

### Deployment

| Component | Recommendation |
|---|---|
| **Runtime** | Python 3.12+ in Docker container |
| **Hosting** | Railway, Render, Fly.io, or a dedicated VM (NOT Vercel) |
| **Database access** | Direct PostgreSQL connection via `psycopg` or `SQLAlchemy` to Neon |
| **Browser** | Scrapling's Docker image includes Camoufox pre-installed |
| **Proxy** | Residential proxy provider (Bright Data, Smartproxy) for Instagram/TikTok |
| **Scheduling** | Cron job or task queue (Celery/RQ) for batch runs |
| **Monitoring** | Sentry Python SDK + structured logging |

### Estimated Infrastructure Cost

| Item | Monthly Cost |
|---|---|
| Container hosting (2 vCPU, 4GB RAM) | $20-40 |
| Residential proxies (10GB/mo) | $50-100 |
| Third-party Instagram API (if used) | $50-200 |
| **Total** | **$120-340/mo** |

### RLS Considerations

Jovie uses Row-Level Security with `app.clerk_user_id` session variables. The microservice should:
- Use a dedicated service role (`scrapling_ingestion`) with `INSERT`-only permissions on the `leads` table
- Not set `app.clerk_user_id` — leads are system-level data, not user-scoped
- Never write directly to `creator_profiles` or `social_links` — the Jovie app handles promotion

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Legal/ToS violation** | High | Only scrape publicly visible data; no fake accounts; no login bypass; consult legal counsel |
| **Solo maintainer (Scrapling)** | Medium | Pin version, fork if abandoned, or switch to Crawlee (TypeScript) as fallback |
| **Instagram breaks constantly** | High | Use third-party API for Instagram; Scrapling for easier platforms |
| **Operational complexity** | Medium | Docker + health checks + Sentry; keep it simple |
| **Data quality** | Medium | Dedup via `dedup_key`; human review before promotion; confidence scoring |
| **IP bans / proxy costs** | Medium | Budget for residential proxies; implement backoff; rotate IPs |

---

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Scrapling microservice** | Full control, adaptive parsing, spider framework, anti-bot | Python runtime, Instagram limitations, maintenance | Use for non-Instagram |
| **Apify (cloud platform)** | Pre-built Instagram actors, no infra to manage, handles anti-bot | Vendor lock-in, recurring cost, less control | Best for Instagram |
| **Crawlee (TypeScript)** | Same language as Jovie, Playwright integration, Apify-backed | Still need separate service for browser scraping, less anti-bot than Scrapling | Good alternative if staying in TypeScript |
| **Build custom in Node.js** | No new language, stays in monorepo | No anti-bot capabilities, significant effort to build crawler | Not recommended for bulk |
| **Buy data from a provider** | Zero engineering, immediate | Cost, data freshness, less control | Consider for MVP/validation |

---

## Recommended Implementation Plan

### Phase 1: Validate the Lead Pipeline (Week 1-2)
- Create the `leads` table via Drizzle migration
- Build a minimal Jovie admin UI to view/qualify/promote leads
- Manually import a test batch (CSV or script) to validate the pipeline end-to-end
- Don't build the microservice yet — validate that leads-to-creator-profiles works

### Phase 2: Instagram via Third-Party API (Week 3-4)
- Sign up for Apify or similar Instagram scraping API
- Write a simple Python script (or even Node.js) that calls the API and writes to `leads`
- Run a batch of 1,000 Instagram profiles to validate data quality
- This can be a cron job or manual script — doesn't need to be a full microservice yet

### Phase 3: Scrapling Microservice for Other Platforms (Week 5-8)
- Dockerized Python service with Scrapling Spider framework
- Strategies for Linktree, Beacons, YouTube, Twitter
- ProxyRotator integration for rate-limited platforms
- Write results to `leads` table
- Cron-based batch scheduling

### Phase 4: Scale and Automate (Ongoing)
- Auto-qualification rules (fit scoring on raw leads)
- Deduplication against existing `creator_profiles`
- Admin dashboard for lead review and bulk promotion
- Monitoring and alerting for scraper health

---

## Conclusion

The microservice architecture makes Scrapling viable — it's no longer fighting the Node.js runtime constraint. Its Spider framework, adaptive parsing, and StealthyFetcher are genuinely useful for bulk crawling of link-in-bio platforms and YouTube.

But for Instagram — the platform that matters most for lead generation — Scrapling alone isn't enough. Instagram's defenses (login walls, `doc_id` rotation, ML behavioral analysis) go well beyond what any single scraping library can handle. The pragmatic move is to use a third-party API for Instagram and Scrapling for everything else.

**Verdict: Adopt as part of a hybrid strategy.**
- Scrapling microservice for Linktree, Beacons, YouTube, Twitter
- Third-party API for Instagram and TikTok
- Shared `leads` table as the integration point

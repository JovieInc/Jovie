# Jovie Link Ingestion & Suggestions System

Design doc tailored to the current Jovie stack (Next.js App Router, Clerk, Neon + Drizzle, Tailwind v4). This is the single source of truth for link ingestion, enrichment, and suggestions across dashboard and admin surfaces.

## Goals (scoped to this repo)
- Reuse existing link management UX (`components/dashboard/organisms/GroupedLinksManager.tsx`, `EnhancedDashboardLinks`, `UniversalLinkInput`) instead of creating new editors.
- Normalize any pasted profile or link-in-bio URL, enrich it, and surface high-confidence suggestions without duplicating link storage.
- Make ingestion pluggable per network (Linktree first; Spotify/Instagram next) with configurable rate limits.
- Track evidence and confidence so we can auto-promote strong matches, and treat suggestions vs confirmed links differently.
- Keep everything behind a Statsig gate for gradual rollout and use only existing analytics wrappers.

Non-goals: adding non-Statsig analytics SDKs, running migrations from Edge, or building a new link manager UI.

## What we already have (must reuse)
- Data: `creator_profiles` is the canonical profile table; `social_links` holds dashboard-managed links; `profile_photos` stores uploaded avatars; `platform-detection` (`lib/utils/platform-detection.ts`) already normalizes and de-duplicates links via `canonicalIdentity`.
- UX: `/dashboard/links` renders `EnhancedDashboardLinks` + `GroupedLinksManager` + `UniversalLinkInput`; suggested pills should plug into these, not a parallel flow.
- API: `/api/dashboard/social-links` is the persistence surface; extend it instead of introducing a new endpoint.
- RLS/session: `withDbSession` / `withDbSessionTx` set `app.clerk_user_id`; background jobs must set a safe system value (e.g., `system_ingestion`) before touching Neon.
- Flags/analytics: Statsig gates in `lib/statsig/flags.ts`; `lib/analytics.ts` is the only analytics wrapper.

## Data model (Drizzle-ready, minimal duplication)

### Reuse and extend existing tables
- `creator_profiles`
  - Add: `avatar_locked_by_user boolean default false` (prevents ingested assets from overriding manual uploads).
  - Add: `display_name_locked boolean default false` (locks user/admin-edited names).
  - Optional: `ingestion_status enum('idle','pending','processing','failed')` for admin visibility.
- `social_links`
  - Add: `state enum('active','suggested','rejected') default 'active'`.
  - Add: `confidence numeric(3,2) default 1.0` (0.00–1.00).
  - Add: `source_platform text` (e.g., `linktree`, `instagram`, `spotify`).
  - Add: `source_type enum('manual','admin','ingested') default 'manual'`.
  - Add: `evidence jsonb` (compact `{ sources: string[], signals: string[] }` for debugging; no blobs).
  - Compatibility: keep `is_active` for now; map `state = 'active'` → `is_active = true`, `state = 'suggested'` → `is_active = false`. Backfill existing rows to `state = 'active'`, `confidence = 1.0`, `source_type = 'manual'`.
- `profile_photos`
  - Add: `source_platform text`, `source_type enum('manual','admin','ingested') default 'manual'`, `confidence numeric(3,2) default 1.0`, `locked_by_user boolean default false`.
  - Allow `user_id` nullable for ingested assets or add `ingestion_owner_user_id` to preserve existing semantics while storing system-fetched assets.

### New tables (small and focused)
- `social_accounts`
  - `id uuid PK`, `creator_profile_id uuid FK`, `platform text`, `handle text`, `url text`, `status enum('suspected','confirmed','rejected') default 'suspected'`, `confidence numeric(3,2)`, `is_verified_flag boolean`, `paid_flag boolean`, `raw_data jsonb`, `source_platform text`, `source_type enum('manual','admin','ingested')`, `created_at/updated_at`.
  - Indexes: `(creator_profile_id, platform)`, `(platform, handle)`.
- `ingestion_jobs`
  - `id uuid PK`, `job_type text` (e.g., `import_linktree`), `payload jsonb`, `status enum('pending','processing','succeeded','failed')`, `error text`, `attempts int default 0`, `run_at timestamp default now()`, `priority int default 0`, `created_at/updated_at`.
  - Indexes: `status`, `(job_type, status)`, `run_at` for efficient polling.
- `scraper_configs`
  - `id uuid PK`, `network text`, `strategy enum('http','browser','api')`, `max_concurrency int`, `max_jobs_per_minute int`, `enabled boolean default true`, `created_at/updated_at`.
- Optional later: `ingestion_events` (append-only evidence log) if we need auditability; start with recompute-on-write to keep schema lean.

## Confidence and evidence (shared rules)
- Confidence tiers: `<0.30` hidden, `0.30–0.70` → suggestions, `>=0.70` → auto-eligible (activate for admin prebuilds; show as “strong suggestion” for users).
- Signals (additive up to 1.0):
  - Manual add (user): +0.6, sets `state='active'`, `source_type='manual'`.
  - Manual add (admin): +0.5, `source_type='admin'`.
  - Kept after claim: +0.2.
  - Appears in Linktree: +0.2.
  - Appears in Instagram bio: +0.25.
  - Appears in Spotify profile/links: +0.3.
  - Multi-source bonus: +0.15 per distinct source after the first.
  - Handle similarity bonus: +0.1–0.2 based on `canonicalIdentity` vs `creator_profiles.username_normalized`.
- Store the rolled-up score on `social_links.confidence`, `social_accounts.confidence`, and `profile_photos.confidence`. Evidence blob is best-effort and compact.

## Avatar and name selection (no duplication)
- Inputs: `profile_photos` + any ingested assets with `source_platform` + `confidence`.
- Primary avatar selection:
  1. If any `locked_by_user = true` avatar exists → use it, skip the rest.
  2. Otherwise compute `asset_score = base_weight(source_platform) + log(resolution)*0.1 + confidence*10`.
     - Suggested base weights: spotify 100, apple_music 95, instagram 90, twitter 80, tiktok 75, linktree 60, manual 99.
  3. Write the selected URL back to `creator_profiles.avatar_url`; do not duplicate storage elsewhere.
- Display name selection:
  - If `display_name_locked` → keep current `display_name`.
  - Else prefer Spotify/Apple artist name when creator_type = artist; fall back to Linktree/Instagram name, then username.

## Scraper architecture (pluggable)
- Interface (Node-only modules under `lib/ingestion/strategies/*`):
  - `supports(url: string): boolean`
  - `fetch(ctx): Promise<RawDocument>` where `ctx` includes strategy from `scraper_configs`.
  - `extract(doc): Promise<ExtractionResult>` returning links, socialAccounts, assets, displayName.
- Linktree v1: HTTP fetch + Cheerio parse; Instagram: HTTP meta parse; Spotify: API-based.
- Each strategy returns platform IDs compatible with `detectPlatform` / `canonicalIdentity` to avoid duplicate normalization logic.

## Ingestion pipeline (end-to-end)
1. **User/admin paste** (dashboard/admin):
   - `UniversalLinkInput` normalizes via `detectPlatform`; save immediately to `social_links` as `state='active'`, `source_type='manual'`.
   - If the URL is a supported profile/link-in-bio, enqueue `ingestion_jobs` with `{ creatorProfileId, sourceUrl, depth }`.
2. **Worker** (Node runtime, cron-invoked API route or standalone script):
   - Pop jobs by `run_at`, honoring `scraper_configs` for concurrency and rate limits per network.
   - Set `SET LOCAL app.clerk_user_id = 'system_ingestion'` before DB writes to satisfy RLS.
   - Fetch + extract via the correct strategy.
   - `normalizeAndMergeExtraction(creatorProfileId, extractionResult)`:
     - Normalize URLs with `detectPlatform`; dedupe via `canonicalIdentity`.
     - Upsert `social_links` with confidence/state logic (reuse table; no parallel “suggestions” table).
     - Upsert `social_accounts` similarly.
     - Upsert `profile_photos` for assets with `source_type='ingested'`, recompute avatar.
     - Optional recursion: enqueue follow-up jobs for newly discovered profile URLs within max depth.
3. **UI surfacing**:
   - `/api/dashboard/social-links` returns both active and suggested rows; `GroupedLinksManager` renders pills for `state='suggested'` (behind Statsig gate).
   - Accept pill → set `state='active'`, bump confidence; Dismiss pill → `state='rejected'`, confidence 0.
   - Admin panel reuses the same component but can also edit `source_type` and inspect confidence.

## Performance, rate limits, and safety
- Per-network queues with `max_concurrency` and `max_jobs_per_minute` from `scraper_configs`; backpressure via `run_at`.
- Strict timeouts on fetch; cap raw payload sizes; avoid browser automation unless `strategy='browser'`.
- Deduplicate work: jobs carry a `dedup_key = canonicalIdentity(sourceUrl)`; skip if a recent succeeded job exists.
- DB indexes: `social_links(creator_profile_id, state, platform)`, `social_links(confidence)`, `ingestion_jobs(status, run_at)`, `social_accounts(creator_profile_id, platform)`.
- Runtime: ingestion routes/workers must export `runtime = 'nodejs'`; never run scraping in Edge handlers.
- Observability: log to existing logger; emit Statsig events for “job_enqueued”, “job_succeeded”, “suggestion_accepted/ dismissed” via `lib/analytics.ts` wrappers only.

## Rollout plan (mapped to current code)
1. **Phase 1 – Data + Linktree ingestion**
   - Add columns/enums above; backfill existing links.
   - Implement Linktree strategy + `ingestion_jobs` processor (Node route or script).
   - Extend `/api/dashboard/social-links` and `getProfileSocialLinks` to return state/confidence.
   - Add Statsig flag `feature_link_ingestion` (docs + `lib/statsig/flags.ts`).
2. **Phase 2 – Dashboard suggestions**
   - Update `EnhancedDashboardLinks`/`GroupedLinksManager` to render suggestion pills from `state='suggested'`.
   - Add accept/dismiss mutations that only flip `state`/`confidence`; keep existing save shape to avoid breaking clients.
3. **Phase 3 – Confidence + avatar/name resolution**
   - Implement shared confidence calculator + avatar/name selection; write canonical picks into `creator_profiles`.
   - Add admin view for alternative avatars and lock toggles.
4. **Phase 4 – More networks + recursion**
   - Add Spotify/Instagram strategies; enable recursive enqueue for newly discovered profile URLs with depth guard.
   - Expand admin `scraper_configs` editor (toggle enabled, strategy, concurrency, rate).
5. **Phase 5 – AI semantics (optional, later)**
   - Use AI only for classifying generic links/titles; keep parsing non-AI.

## Testing expectations
- Unit: confidence calculator, avatar selector, URL normalization/dedup using `platform-detection`.
- Integration: ingestion worker writing to `social_links`/`social_accounts` with RLS session set.
- E2E (happy path): paste Linktree → suggested pills show → accept/dismiss works; admin can toggle scraper configs.

## Open questions to resolve before implementation
- Should we allow `profile_photos.user_id` nullable for ingested assets or store remote assets in a new table and mirror the winner into `avatar_url` only?
- Preferred queue runtime (Vercel Cron hitting a worker route vs. a dedicated worker process); both require Node runtime and RLS session setup.
- How long to retain `ingestion_jobs` history before pruning (30/90 days)?***

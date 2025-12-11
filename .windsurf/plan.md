# Plan
1) Investigate dashboard setup checklist showing missing music link despite links present.
2) Identify data shape/queries for hasMusicLinks and align platform_type/platform filters with supported DSPs (Spotify, Apple Music, SoundCloud, etc.).
3) Patch dashboard data fetch logic to count DSP links correctly and verify UI reflects completion.

Plan: Copy external ingest avatars to our storage and reuse avatar upload pipeline
1) Inspect existing avatar upload logic/util (upload + proxy + validation) to reuse for ingestion.
2) Add ingestion-time download + re-upload flow (copy external image to our storage) and swap creator avatar URL to the new hosted URL.
3) Add guards (size/type) and fallback if copy fails; ensure DB uses hosted URL.
4) Verify by rerunning admin ingest; ensure Next/Image works with hosted URL.

Goal: Enable separate tracking for QR scans vs link clicks on tipping and surface both plus total in dashboard earnings.

- [ ] Identify current tip tracking: clickEvents shape, linkType values, tippingStats aggregation path.
- [ ] Design tracking change (UTM/source param or dedicated linkType) and adjust capture pipeline (QR generator + tip page + click logging).
- [ ] Update dashboard stats to show QR vs link counts and combined total; add tests/metrics.

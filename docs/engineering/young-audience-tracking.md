# Young-audience tracking (JOV-10083)

Decision, 2026-10-31: **extend** existing consent, profile, SettingsToggleRow and cache primitives. No new vendor/service. `lib/tracking/eligibility.ts` owns third-party policy; `creator_profiles.young_audience` owns the persistent flag.

Profile payloads include the flag; authenticated saves hard-expire profile/Redis/ISR caches. Cached HTML/RSC cannot authorize tracking: browser loaders start denied and check uncached authority on every mount/navigation. Unknown artists, invalid responses, failed lookups and missing required consent fail closed.

Meta, GA, Vercel, editorial retargeting and direct GA events consume the shared decision. Loaded opaque SDKs require a fresh document across artist routes and on consent revocation; platform-to-platform navigation remains unchanged. Server conversion delivery, retries, subscription confirmation and dashboard test events reread the flag through one dispatcher. Intake persists visitor denial for retries.

JOV-10082 supplies the separate sale/sharing choice via `TrackingVisitor.optOut`; legacy rejection already feeds it. `under16` is an explicit input without age collection. First-party metrics are separate. Regression tests cover stale payloads, retries, consent, settings rollback, invalidation and deliberately seeded bypasses.

Ship after required tests/CI. Re-evaluate when a vendor, route identity or consent source changes; extend this policy and seed a bypass. Local tests apply no production migration and certify no deployed runtime.

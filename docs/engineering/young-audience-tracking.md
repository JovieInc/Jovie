# Young-audience tracking boundary (JOV-10083)

Decision, 2026-10-31: **extend** the existing profile model, SettingsToggleRow,
consent inputs and profile-cache invalidator. No new vendor, SDK, job or service.
The product-specific gap is one artist-aware privacy decision shared by browser
loaders and conversion delivery. `lib/tracking/eligibility.ts` owns that decision.

`creator_profiles.young_audience` defaults to false. The authenticated profile
update endpoint accepts only booleans, uses existing profile authorization and
hard-expires profile/Redis/ISR caches when this field changes. The public profile
mapper includes the flag in cached payloads. Settings uses the existing optimistic
save/rollback/status pattern and refreshes server state after a successful save.

Cached HTML and the browser Router Cache are not permission authorities. Browser
loaders start denied and fetch `/api/tracking/eligibility` with `no-store` on every
mount/navigation. The endpoint reads the current flag without caching, resolves
all artist subroutes and applies server privacy signals. The browser intersects
that decision with the same policy applied to its current consent/GPC/opt-out.
Unknown artist, malformed response, lookup failure and unresolved consent fail
closed. A cached true flag can deny early; a cached false flag cannot authorize.

Meta, GA, Vercel Analytics, editorial retargeting and direct GA event dispatch
consume this policy. Once an opaque vendor SDK is loaded, navigation to another
path uses a new document; React unmount alone cannot remove vendor history
listeners. Consent changes discard that document too. SDK-free documents retain
client navigation. Subscription confirmation, inline pixel forwarding, retries,
and the dashboard test-event action use the single server dispatcher, which
re-reads the flag immediately before every vendor transport call. Intake stores
visitor denial so retry cannot turn a rejected event into a consented one.

JOV-10082 owns the separate visitor sale/sharing opt-out UX. Feed its verified
choice into `TrackingVisitor.optOut`; existing legacy rejection already maps to
that input. `under16` is also an explicit input, without collecting ages here.
First-party metrics remain separate from third-party ad/analytics delivery.

Regression coverage includes warm stale payloads, flag changes before retry,
GPC, region consent, malformed/failed authority, toggle rollback and a source
boundary scan. Seeded direct pixel calls and aliased/dynamic transport imports
must be rejected. The scan permits only policy adapters, vendor transport
implementations and inert CSP configuration. Run it with the normal Vitest path.

Ship now: additive flag and shared boundary after required tests and CI pass.
Re-evaluate when: a new vendor, public route identity, consent source or navigation
mechanism is added. Then: extend the same policy/adapters and seed a bypass before
accepting the new path. No production flag or migration is applied by local tests.

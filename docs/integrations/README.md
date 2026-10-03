# Integration contract and builder

Owner: JOV-6259. Source branch: `codex/integration-catalog-builder`.

## Product contract

The public `/integrations` page, account settings, and admin system map consume
`lib/integrations/catalog.ts`. Search and category buttons filter the same
registry immediately. A visible setup link opens the existing app-owned flow.
Explicit filtering may change the grid; typing retains focus and the search
value. Native links, buttons, labeled inputs, and pressed filter states support
keyboard and assistive technology. No animation is needed.

The request form retains text during pending, success, sign-in, network failure,
and retry. A stable status slot reports the result. Saving requires authentication.
Sign-in opens a separate tab so entered text remains available. A saved draft
means source scaffolding exists in the feedback ledger; it does not mean a
provider is connected or an implementation has been reviewed.

## Audit and consolidation

| Surface | Finding | Boundary after this change |
| --- | --- | --- |
| `lib/connectors/registry.ts` | Three OAuth manifests; UI hardcoded only two | Settings enumerate manifests, including YouTube; authorize/disconnect paths and user/profile scope belong to the manifest |
| `lib/dsp-registry.ts` | Separate music-link and enrichment registry | Composed automatically into the integration catalog; domain identifiers and aliases remain canonical |
| YouTube | Both a DSP and an OAuth connector; profile ID required by OAuth routes | One directory entry with both capabilities; settings pass the selected profile and select its account status |
| Spotify | Working artist-catalog entry point, separate from Google OAuth storage | First-class catalog integration with a direct setup route; no invented user OAuth, royalty reporting, or write capability |
| Other DSPs | MusicFetch links do not prove private-account authorization | Labeled catalog links; use existing release/link-management flow |
| Admin system map | Listed only OAuth connectors | Reads the same composed directory |
| Integration demand | No dedicated signal-to-scaffold path found in the inspected app | Authenticated endpoint and local CLI share one validated builder; persistence reuses `feedback_items` |
| Existing `tests/lib/integrations.test.ts` | Environment/import diagnostics are not provider health checks | Kept separate from behavioral verification and live provider claims |

The token vault, OAuth callbacks, enrichment pipelines, ingestion jobs, DSP
matching, and approval-gated writes retain their existing owners. The catalog
is a capability index, not a second execution runtime. New domain providers
appear in the directory on the same app build; no cron, scrape, copied JSON,
or separate marketing deployment is required. Tests enforce full provider
parity, reject duplicate definitions, and exercise setup and filtering behavior.

## Adopt-first decision: compose

Extend the existing TypeScript registries, shared vault, Next.js endpoints,
Vitest checks, and feedback ledger. Jovie-specific requirements are artist
catalog identity, MusicFetch mappings, selected-profile ownership, and honest
capability presentation. These do not require a replacement credential store.

[Eve's directory](https://eve.dev/integrations) supplies the search/category/card
reference; its connection registry is an agent framework interface, not a
migration path for Jovie's existing account records.
[Nango](https://github.com/NangoHQ/nango) is a maintained integration substrate
with cloud and self-hosted options under the Elastic License. Its
[self-hosted architecture](https://nango.dev/docs/guides/platform/self-hosting)
adds a control plane, runners, and backing services; full managed functionality
has commercial requirements. Adopting it now would require migrating credentials
and sync ownership. No credentials are transferred by this change. Plain
TypeScript/JSON manifests and provider IDs keep the new layer portable.

Ship now: compose existing owners. Re-evaluate when repeated new OAuth providers
make token/sync maintenance the measured bottleneck. Then: compare maintained
provider coverage, licensing, credential export and revocation behavior against
the shared-vault migration cost before selecting a new runtime.

## Signal-to-build entry points

`POST /api/integrations/requests` accepts an authenticated JSON signal:

```json
{
  "provider": "Example Music",
  "capability": "catalog_links",
  "useCase": "Match my releases to this service."
}
```

A supported provider/capability returns the existing setup destination. An
unsupported capability generates a disabled draft, including `manifest.json`,
`signal.json`, `adapter.ts`, and required build gates. The endpoint persists the
bundle before returning 202. SHA-256-derived UUIDs bind tenant, canonical
provider, capability, and use case; the database primary key rejects duplicate
writes across workers. Different users and use cases remain distinct. Storage
failure returns an error, never an accepted receipt. Rate limits use the
existing shared limiter. Untrusted signal text is serialized as JSON data and
never inserted into executable code.

Internal trusted producers call `submitIntegrationSignal(databaseUserId,
signal)` after establishing the actor's authority. Operators can read saved
bundles through the existing admin feedback API (`source: integration-builder`).
No new machine credential or unauthenticated webhook is introduced.

A local signal producer can generate an editable bundle using:

```sh
pnpm integrations:build signal.json /absolute/path/to/new-output-directory
```

The output directory must not exist; existing operator work is never overwritten.
The generated adapter fails closed until an implementation completes the build
gates. Demand automatically creates a scaffold, not arbitrary executable
provider access. No autonomous implementation worker is connected by this patch;
that requires identifying the intended Signal producer and its admission path.

## Verification boundaries

Use the normal `vitest.config.mts` selector with the colocated integration,
request-route, directory, request-form, and settings tests; collect v8 coverage
for changed source. Existing exact-head CI coverage owns the changed-line gate.
Run the repository typecheck and marketing route-manifest check before promotion.
Provider-backed auth/sync/disconnect and deployed route checks remain separate
from deterministic tests. Never use registry presence as a live health signal.

Brain preflight: `gbrain-unavailable` (query timed out after 300 seconds). Current
source, rather than historical Connections terminology, governed this patch.

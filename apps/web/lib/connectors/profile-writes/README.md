# Connector profile write receipts

Authenticated server callers construct `createProfileWriteService(adapter)` from
`ledger.server.ts`. Adapters select `getProfileWriteManifest(destination)` from
`manifest.ts`; they cannot maintain an independent capability map. The factory
projects the destination registry into the ledger's versioned terms, scopes,
evidence expiry, rate window and conditional restore contract.

The credential-free `catalog` in `GET /api/dsp/bio-sync` represents every
registered destination and all four fields. The operator artist-profile inventory
uses the same projection. Missing, undated, expired or invalid evidence and
blocked/planned rollout never advertise an available write. The GET response is
uncached so evidence expiry takes effect without a rebuild. Catalog readiness is
not an account grant or permission to execute.

Current DSP email paths have manual recovery and unverified write readiness;
the catalog keeps them disabled. Ingestion sources do not imply outbound write
permission. Add destination manifests in sorted order in
`artist-profile-registry.ts`, retaining connector field policies in `registry.ts`.
`node scripts/artist-profile-conformance.mjs` checks the complete source tree for
unmanifested adapters, DSP bio providers and ingestion destinations, and competing
capability metadata. The existing CI source guards run it on source and queue
heads. Only conditional restore adapters execute.

Call `propose`, show the complete destination/before/desired proposal, then call
`approve` with `confirmationFor(proposal)` from that explicit confirmation.
`execute` reloads the immutable proposal and approval, verifies current account
ownership, scopes, manifest evidence and expiry, and claims a durable start and
shared destination rate window before dispatch. Adapters must implement atomic
expected-version writes, verify durable image artifacts when managing images,
and bound their network requests using the shared HTTP timeout/retry helpers.

Execution returns success only after matching the provider mutation version to
readback and committing the outcome. Provider payloads become a SHA-256 receipt
fingerprint plus allowlisted HTTP status; request metadata contains field names
and a payload fingerprint. Credential-bearing and signed restore URLs are
refused. Provider exceptions are never copied into receipts.

`proposeRollback` restores the captured original values only while the destination
still matches the attributable after-state. It creates a fresh proposal requiring
the same confirmation, authorization, evidence, expiry, rate and audit gates.
Unknown outcomes and a durable start without an outcome require inspection;
repeated execution cannot dispatch again or manufacture success. The service
writes only the receipt ledger; destination results never write canonical fields.

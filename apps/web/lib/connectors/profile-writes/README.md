# Connector profile write receipts

Authenticated server callers construct `createProfileWriteService(adapter)` from
`ledger.server.ts`. The adapter supplies a versioned manifest with current terms,
scope and rollback evidence. Only conditional restore adapters execute. Current
DSP bio email destinations declare manual rollback; disabled API destinations
declare unsupported rollback in the existing provider catalog and discovery API.

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

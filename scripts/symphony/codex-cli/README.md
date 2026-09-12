# Symphony managed Codex dependency

This exact npm dependency is separate from the application pnpm workspace. The
existing daily Dependabot npm entry covers this directory and its lockfile. A
version change follows the existing PR checks, native merge queue and managed
activation; this does not add a timer or install a floating `latest` version.

The provider helper uses npm's maintained lockfile/SRI installer, with lifecycle
scripts disabled, an empty home and private cache. It accepts only official Codex
package URLs, exact stable versions and matching wrapper/native lock entries.
The supported target is Gem's Linux x64 native binary. Qualification checks its
exact `--version` and an unauthenticated app-server `initialize`; it neither lists
account models nor generates work. A missing/incompatible artifact fails closed.
The temporary npm tree and cache are discarded after qualification or failure.

A v2 provider generation contains both the source-reviewed `codex-rotate` and
native `codex`, with immutable launcher bindings for `SYMPHONY_CODEX_ROTATE` and
`CODEX_REAL_BIN`. Manifest hashes bind the source, lock, binary and qualification.
Source-only updates reuse the same pin from a hash-verified current generation,
so a registry outage does not prevent a router repair using an already qualified
binary. Changed pins must pass a fresh installation and compatibility check.
Shared Codex and LogYourBody installations are never update destinations.

Use the existing `update-symphony-burrito.sh --stage-provider-runtime` for isolated
preparation. `--provider-runtime-only` publishes through the existing generation
lock, atomic pointer switch and alias readback; it does not restart a service.
`--provider-runtime-rollback` restores a complete previous generation, including
old v1 generations that predate bundled Codex, independently of current source
or registry availability. Old v1 launches retain their historical shared-binary
behavior. Published generations remain retained for in-flight readers/rollback;
this helper does not delete another generation or assume a reader is finished.

The existing managed activation/restart owner remains responsible for production
gates, safe drain/restart, exact installed readback and useful-work recurrence.
CLI compatibility is not admission, model availability, restart or throughput
proof. Routing still requires the exact selected model and existing account/lease
controls; this dependency update grants no fallback or new execution authority.

Adopt-first decision: compose the existing Dependabot updater, npm SRI installer
and provider-generation transaction. Official `@openai/codex` 0.153.4 package
metadata declares Apache-2.0. Custom code is confined to immutable launch binding
and Symphony's compatibility/readback boundary. Ship this Linux x64 pin through
existing qualification. Re-evaluate when Codex changes its package layout or
initialize protocol; then update the bounded adapter and its real failure tests.

Validation: `python3 scripts/symphony/tests/run-provider-promotion-gate.py` is the
same selector invoked by `codex-recovery-ci.sh` in PR and merge-group proof CI.
It covers the transaction and installer helper at the existing 95% floor, using
offline installer/process fixtures. An owner-run official-package Linux stage
provides the separate real npm integrity, native version and initialize receipt.

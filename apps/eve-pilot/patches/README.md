# Eve package patches

## `eve@0.47.7.patch`

This is a bounded forward-port of the durable channel-delivery idempotency design from
[`vercel/eve#1843`](https://github.com/vercel/eve/pull/1843), commit
`41e34d3c99537999b67b9333f3c25c1b74ca53e9`, onto Jovie's pinned Eve `0.47.7`
source commit `4db994c06d1956f45f9185ec6d19011956423070` (Apache-2.0).

The patch adds an optional `idempotencyKey` to channel-address and fixed-session sends,
threads it through a new session-inbox wire v3, and retains the most recent 1,024 keys
per durable session. Wire v1 and v2 remain unchanged; keyed sends refuse an unsafe
downgrade to an older receiver.

This is a bounded deduplication primitive, not an exactly-once or status API. Callers
must keep permanent application receipts and conflict checks so an event older than
the in-session window cannot be re-admitted. A new deployment must start a fresh v3
session before keyed delivery is enabled.

The supplied compiled-package artifact had SHA-256
`ceb25482e6939c8d32c4b7632d02c9a5af41aae3beb366c78e78ae3047190826`.
It was normalized through pnpm's patch generator for deterministic installation; the
checked-in pnpm patch has SHA-256
`7c80ca3ebb71bc99a8c6ab3cfda832f3f6513bcbd6feaa67256aa3b88011b5f7`.

Forward-port verification on the exact `0.47.7` source passed 702 test files and
7,528 tests (one skipped), including real workflow tests for concurrent initial sends,
fixed-session duplicates, replay, and a subsequent unique key. Remove this patch after
the same public contract ships in a reviewed Eve release and the application has been
re-certified against that release.

# Dependency degradation contracts

JOV-6048 resilience audit. One section per critical dependency family; each
family ships as its own bounded PR. A contract is only "met" when the fault
was injected in an isolated environment (Vitest fault harness or equivalent)
and the run proved **no lost/duplicated work, truthful user-visible state, and
completed recovery** — never merely that processes stayed alive.

## Family: cache / Redis (idempotency locks, rate limits)

**Code under contract:** `apps/web/lib/idempotency.ts`,
`apps/web/lib/redis.ts`, `apps/web/lib/rate-limit/outage-policy.ts`.
**Fault harness:** `apps/web/tests/unit/lib/idempotency-faults.test.ts`.

### Steady state

`withIdempotency`/`tryWithIdempotency` acquire `idempotency:<key>` via Redis
`SET NX EX`, run the wrapped operation exactly once per key, and release with
`DEL`. `isLocked` reads the distributed lock.

### Failure/degradation contract

| Injected fault | Expected UX / caller result | Data invariant | Retry & cost ceiling | Recovery | Observability | Abort condition |
|---|---|---|---|---|---|---|
| Redis unavailable at acquire, `requireBackend: true` | `IdempotencyBackendUnavailableError` / `backendUnavailable: true` — "temporarily unavailable" | `fn` never runs; zero partial work | No retry at this layer; caller may surface retry-after | Automatic on Redis return | Upstash operability canary owns the standing alert | Caller sees typed error, not a hang |
| Redis unavailable at acquire, `requireBackend: false` | Operation proceeds under in-process memory lock | Same-process duplicates still blocked (`IdempotencyError`); cross-process exclusion is a documented degraded gap bounded by TTL | None added; memory fallback costs nothing | Automatic on Redis return | Existing Redis init/quota warnings | TTL expiry releases the lock |
| Redis flaps mid-operation (acquire via fallback, then recovers) | Duplicate submissions still rejected in-process | `fn` runs once; memory lock consulted before distributed acquire | — | Automatic; release clears both backends | — | TTL expiry |
| Redis `DEL` fails at release after success | Caller receives the operation's real result | Success is never masked as failure; lock expires via TTL | No retry storm: release is single-shot | Next acquire succeeds once Redis returns | `captureWarning('Idempotency lock release failed')` | Lock self-heals at TTL |
| Redis `DEL` fails at release after `fn` throws | The operation's own error propagates | Release error cannot replace the causal error | — | — | `captureWarning` fires | — |
| `isLocked` during Redis outage | Returns in-process lock state instead of throwing | Truthful answer within the process | — | Full accuracy on Redis return | — | — |

### Verified by

`idempotency-faults.test.ts` injects `ECONNREFUSED`/`ETIMEDOUT`/`socket hang up`
at acquire, mid-operation flap, and release; asserts `fn` call counts,
error types, `captureWarning` signals, and post-recovery arbitration. Run:

```sh
cd apps/web && pnpm vitest run tests/unit/lib/idempotency-faults.test.ts
```

### Known limits (Re-evaluate when)

- **Ship now:** memory fallback gives per-process exclusion only; two Vercel
  instances can double-run a non-`requireBackend` op during a Redis outage.
- **Re-evaluate when:** a money-path operation runs without
  `requireBackend: true`, or duplicate-execution incidents are observed.
- **Then:** extend the JOV-5926 attempt-ledger / durable-lock receipt to
  non-critical paths rather than adding a second locking controller.

## Adding a new family

Pick one dependency family (DB pool, Stripe webhooks, DSP providers, workers,
event delivery). Define steady state, inject the fault in an isolated harness,
assert invariants + recovery + observability signal, and record the row here.
Production chaos is out of scope without separate explicit authorization.

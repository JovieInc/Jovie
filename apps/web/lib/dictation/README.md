# Composer dictation

The web and Electron composers share the adaptive Transcriber. Provider order is
ElevenLabs realtime, ElevenLabs batch, Fish batch (not registered), browser Web
Speech (never Electron), then system dictation guidance or text. Permission
errors stop capture without failover. Account/provider caps skip the remaining
providers. Other retryable failures get one reconnect before failover. Cancel
invalidates callbacks and releases capture; graceful stop accepts final results.

## Audio accounting

`DICTATION_LIMITS` owns the approved limits: 3600 audio seconds/account/UTC day,
600 seconds/session, and 30 token mints/account/rolling hour. The existing
RateLimiter enforces token frequency. Redis atomically checks and reserves audio
seconds in one account/day bucket shared with batch. Missing/unavailable durable
storage fails closed. Token responses and errors are never cached.

A token reserves the full 600-second session before the upstream mint. Reservations
are not refunded, even on failed mints, cancellation or reconnect. Thus concurrent
requests, missing reports and forged client usage reports cannot lower reserved
usage. This deliberately overcounts short sessions; six reservations exhaust a
day. No usage endpoint accepts client claims as authoritative audio measurements.
The renderer stops capture on both its timer and PCM sample budget.

**Direct-token limitation:** ElevenLabs documents single-use tokens with a
15-minute redemption expiry, but no token-bound session duration or audio budget.
A modified client can use the token outside our renderer and bypass its 600-second
stop. Reservations alone cannot enforce the approved audio cap against that
client. Strict enforcement requires a server-mediated audio transport or a
provider-supported restricted token. Do not claim direct-token reservations are
provider-attested measured usage.

Sources checked 2026-10-24:
- https://elevenlabs.io/docs/api-reference/tokens/create
- https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime

Ship now: the internal provider contract. Re-evaluate when strict token-bound
quotas are available or a server-mediated transport is approved. Then use its
server-measured audio ledger to settle reservations without undercounting.

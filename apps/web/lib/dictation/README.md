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

## Batch recovery

MediaRecorder retains the shared microphone locally throughout streaming and its
single reconnect. If streaming was interrupted, stop reconciles the complete
recording through batch even when reconnect succeeded, recovering the connection
gap and uncommitted speech. On batch fallback, stopping capture transcribes that complete
recording and replaces the streamed text once. Cancellation aborts upload and
invalidates late callbacks. Successful streaming discards the local buffer.

The browser decodes the recorder container and resamples to mono PCM16 at 16 kHz.
Uploads are canonical WAV chunks of at most 100 seconds (3.2 MB), under the
4,000,000-byte route limit. The server reads a bounded body, validates the complete
WAV header and data length, and reserves `ceil(dataBytes / 32000)` audio seconds
before calling Scribe v2. It accepts no client duration field or remote audio URL.
Streaming reservations and batch audio share the same UTC-day account bucket;
reprocessing audio in batch is a second provider operation and consumes quota too.
No audio or transcript is persisted by this feature in Jovie.

Batch API checked 2026-10-24:
https://elevenlabs.io/docs/api-reference/speech-to-text/convert

## Electron

The existing `dictation-status` IPC and preload probe report `supported: true`,
`preferredMode: 'stream'`, the current microphone permission, and
`browserSpeech: false`. The renderer uses server streaming/batch providers even
though browser speech is forbidden. macOS system-dictation guidance appears only
when the available provider ladder is exhausted or an account cap is reached;
permission denial remains a permission error.

Trusted main-window media permission checks remain in the shell. Packaged macOS
channels declare a microphone usage description and hardened-runtime audio-input
entitlements, including helper inheritance. Source contracts verify this packaging
configuration; they are not evidence of an installed, signed app's TCC behavior.

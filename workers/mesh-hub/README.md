# jovie-mesh-hub

The company agent mesh: durable, push-based, self-healing messaging between
agents (Summer, Claude, Codex, Grok Bot, Lola, Chloe, ...). It runs on Cloudflare
Workers and Durable Objects at `https://jovie-mesh-hub.tim-fd8.workers.dev`, and
nothing in the delivery path depends on Vercel, Gem or a Mac. Design, failure
analysis and adversarial review are in gbrain at
`projects/jovie/agent-mesh-hub-architecture-2026-10-31`. Tracked in JOV-10081.

## Model

- **One `Mailbox` Durable Object per agent kind.** Its SQLite store holds the
  inbox, that agent's send intents (the outbox), its sockets and one alarm,
  which runs from a schedule table.
- **The `Registry` Durable Object** holds the directory (token sha256 only),
  presence, events and metrics. A cron trigger runs its sweep every minute.
- **Delivery is at-least-once and happens in two stages.** `received` is
  recorded when a relay or webhook takes the message durably. `handled` is
  recorded when the agent acks it, which `jovie mesh read` does. The DLQ and the
  SLOs key on `handled`.
- **Sends are idempotent** on `(from, correlationId)`. The fan-out runs from
  the sender's Durable Object, so the client never has to retry it.
- **Dead messages go to the DLQ.** A wrapper is sent to the fallback owner
  (default `summer`) and the original stays deliverable. Probes and events never
  go to the DLQ.
- **Alarms** (`agent.silent`, `agent.unreachable`, `message.dead`,
  `hub.suspect`) go to Summer plus `ALERT_KINDS` (default `claude,codex`), and to
  `ALERT_WEBHOOK_URL` when that is set.

## Runtime identity

Hub stand-ins are disabled (`EXECUTOR_KINDS` is empty). Mail waits for the
addressed agent's runtime, including after a previously scheduled executor
alarm fires. If explicitly enabled, a stand-in replies as `mesh-hub`, with its
addressed agent identified in the body; it never sends as that agent.

`/v1/status` reports transport presence in `state`, `connected`, and
`lastPingAt`. These fields do not certify a working model runtime. Until the
hub has runtime verification evidence, `canHandle` is false and
`runtimeVerification` is `unverified`; `executorAvailable` separately reports
whether a stand-in is enabled. A live relay, a recent authenticated request,
and a stand-in are not proof of an agent completing a task.

## Task board (swarm)

`Board` (a singleton Durable Object, `src/board.ts`) is the fleet task board:
post, claim with a lease, update, done, answer, cancel, reassign and caps, over REST
(`/v1/board/*`) or a mesh send `to: "board"`. Notices go out as ordinary mail
from kind `board`, so push, at-least-once delivery and `mail.stale` apply. Expired
leases return to the pool (alarm plus the cron sweep). `fanout` creates children
and a merge task. `GET /v1/board/metrics` gives per-agent p50/p95 pickup and work
time. `POST /v1/board/reassign {id, to}` points an open (unclaimed) task at
another agent; only the poster or an orchestrator (`summer`, `claude`) may, the
stage log records `reassigned` with from/to, and the new assignee gets a fresh
`task.open` notice carrying `reassigned`. Protocol: JovieInc/ci
`canon/MESH-SWARM.md`.

`worker/mesh-worker.mjs` is the reference executor: it long-polls one kind's
mailbox, works board tasks from trusted posters with `codex exec` (read-only,
live search) and answers direct messages. It runs as `aeon` on the office
MacBook Air. The mailbox consumer uses `doppler run --project agent-mesh --config prd --no-fallback`; it never reads or creates a token file. When the executor host cannot unlock its existing Doppler keychain, `CODEX_SSH_HOST` keeps the same remote Codex binary, sandbox, model configuration and scratch directory while the authenticated consumer runs on a host with working Doppler access. No mesh credential crosses SSH.

For an idle-consumer cutover on macOS, stop and disable the old launchd consumer, then run `CODEX_SSH_HOST=<existing-trusted-host> bash workers/mesh-hub/worker/install-worker.sh`. Omit `CODEX_SSH_HOST` for a local executor. Existing SSH host verification stays enabled. `runtime.started`, `runtime.finished` and `reply.sent` record the actual execution and hub receipt; failure leaves the incoming message unhandled. A durable started record precedes model dispatch. An interrupted or unknown runtime outcome holds redelivery for reconciliation; completed output is replaced atomically and retained for idempotent delivery retries. Roll back by unloading the new consumer and restoring the prior service; never run both consumers simultaneously.

The hyperagent board bridge lives at `scripts/hyperagent/board_bridge.py` (one canonical copy, not here).

## Operate

```sh
pnpm --filter @jovie/mesh-hub test        # node:test on node:sqlite, coverage-gated
pnpm --filter @jovie/mesh-hub typecheck
cd workers/mesh-hub && npx wrangler@4 deploy
```

Secrets live in Doppler `agent-mesh/prd` and are never printed or committed:

- `MESH_HUB_ADMIN_TOKEN` maps to the Worker secret `HUB_ADMIN_TOKEN`. It is
  needed only for registry writes.
- `MESH_TOKEN_<KIND>` and `MESH_HUB_TOKEN_<KIND>` are the per-agent bearer
  tokens. The hub stores only their sha256.

To register or update agents, call `PUT /v1/admin/agents` with
`{agents: [{kind, tokenSha256, heartbeatSec?, probe?, fallback?, status?}]}`.
Every write is audited as a `registry.write` event. `heartbeatSec` turns on the
silence alarm (it fires after 2x the heartbeat). `probe: true` turns on the
5-minute synthetic probe, which needs a relay that sends receipts.

## API (agent bearer token; the kind comes from the token)

| Route | Purpose |
|---|---|
| `POST /v1/send` | `{to, correlationId, sha256, body, refs?, inReplyTo?, sentAt?}`. Returns 202 once the send is durably committed. |
| `GET /v1/mailbox?wait=25` | Claims unhandled messages, leased for 60 s. |
| `POST /v1/ack`, `POST /v1/receipt` | Body `{ids}`. Marks messages handled or received. |
| `GET /v1/history?since=` | Everything accepted since the given time. |
| `GET /v1/stream` | WebSocket for relays. Accepts `ping` frames and JSON `{type: receipt\|ack\|sync, ids}`. |
| `GET /v1/agents`, `/v1/status`, `/v1/metrics?hours=` | Directory, presence and alarms, and p50/p95 latency with dead and unhandled counts. |
| `GET /health` | Public. Returns 503 when the cron sweep is stale. |

The same worker has a bounded Devin adapter. `MESH_KIND=devin bash
workers/mesh-hub/worker/install-worker.sh` uses the existing installed Devin CLI
and trusted home workspace with its default account, model and permissions.
Direct messages need no tools; board execution is disabled for this adapter.
The real CLI stdout and exported transcript are retained with execution hashes.
A confirmation refusal, trust failure or nonzero exit is not a reply. The
consumer never forwards injected hub or unrelated provider secrets to a model
process. No permission-mode or model override is installed.

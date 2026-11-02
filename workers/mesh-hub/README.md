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
adaptive synthetic probe: it is sent only after 5 minutes without any proof the
agent consumes mail (authenticated traffic, an ack or a poll), so busy agents are
never probed and worst-case time to detect a dead agent is unchanged. It needs a
relay that sends receipts.

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

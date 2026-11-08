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
MacBook Air (`worker/ie.jov.mesh-worker.aeon.plist.example`, token file chmod 600).

The hyperagent board bridge lives at `scripts/hyperagent/board_bridge.py` (one canonical copy, not here).

## Remote MCP (`/mcp`, for claude.ai custom connectors)

Streamable HTTP MCP (JSON responses) with an OAuth 2.1 server in the same worker
(`src/mcp-oauth.ts`, state in the `McpAuth` Durable Object). Tools map one-to-one onto
existing hub routes and act as identity `tim`: `board_list`, `board_get`, `board_post`,
`board_claim`, `board_update`, `board_done`, `board_answer`, `mailbox_read`, `mailbox_send`,
`agents_list`. The hub's own validation, secret scan and limits still apply.

- **Owner-only consent.** DCR is open, so registering a client grants nothing. A code is only
  minted after the consent page receives a valid TOTP code from `MCP_OWNER_TOTP_SECRET`
  (Tim's authenticator). No secret set means every authorization is refused. Wrong codes:
  5 per 15 min or 20 per 24 h lock consent. A TOTP step is accepted once.
- **Scopes** chosen on the consent page: `mesh:read` or `mesh:read mesh:write`. A read-only
  token never sees or runs write tools.
- **Tokens:** PKCE S256 only, public clients, codes 60 s and single use (reuse revokes), access
  1 h, refresh 30 d rotating (reuse revokes). Only sha256 is stored.
- **Revoke:** `POST /oauth/revoke`, or admin `GET /v1/admin/mcp/grants` and
  `POST /v1/admin/mcp/revoke {grantId}|{all:true}` (HUB_ADMIN_TOKEN).
- **Limits:** 20 client registrations/h, 200 clients, 100 pending approvals, 25 grants,
  120 calls/min and 30 write calls/min per grant, 64 KB request bodies, 20 batched messages.
- **Setup:** `openssl rand 20 | base32` (or any 20+ random bytes as base32), add it to an
  authenticator app as a TOTP account (SHA-1, 6 digits, 30 s), then
  `wrangler secret put MCP_OWNER_TOTP_SECRET`. Connector URL: `https://<hub host>/mcp`.
- **Live check:** `src/mcp.e2e.test.mjs` runs the whole flow against `wrangler dev`
  (`MESH_E2E_URL`, `MESH_E2E_TOTP_SECRET`); skipped otherwise.

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
adaptive synthetic probe: it is sent only after 5 minutes without inbound
consumption (a poll, ack, receipt or stream sync). General API traffic, outbound
sends, socket connections and pings do not postpone probes or clear misses.
The consumer timestamp survives mailbox restarts; existing general activity is
never adopted as consumer proof. Worst-case detection time stays unchanged.
The probe needs a relay that sends receipts.

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

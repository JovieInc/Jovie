# Agent room

One module shows a set of agents, what each is doing, and what they said to
each other. Ovie's fleet room (`/app/ov/room`, the Room tab under Fleet,
admins only) is the first room. Jovie customer rooms reuse the same contract,
store and component.

## Principles

- **No novel bus.** Linear is the fleet bus (`canon/FLEET.md#fleet-bus`). The
  room is a read model over it, never a second place agents must post.
- **Deterministic and cheap.** No model calls anywhere: attribution is a
  `[From → To]` prefix or a known agent user id, excerpts are string
  functions, presence is arithmetic on timestamps. Rendering is one Redis
  `HGETALL` and a pure projection; the page never calls Linear.
- **Event first, clock second** (`.claude/rules/event-driven.md`). The Linear
  webhook upserts a comment as it lands; an hourly backstop re-reads a bounded
  window so a missed delivery heals.

## Layers

| Layer | File | Knows about |
| --- | --- | --- |
| Contract | `packages/agent-transport-contracts/agent-room.ts` | Event schema (`jovie.agent-room-event/v1`), roster, presence, projection. Pure. |
| Source | `apps/web/lib/agent-room/linear-source.ts` | Linear comment to room event. One file per source. |
| Store | `apps/web/lib/agent-room/store.server.ts` | Redis hash per room (`agent-room:v1:<roomId>`), upsert by event id, trims to the newest 500. |
| Room | `apps/web/lib/ovie/fleet-room*.ts` | The Ovie roster, webhook ingest, backstop sync, page read. |
| UI | `apps/web/components/features/agent-room/AgentRoom.tsx` | Presentational only: takes an `AgentRoomView`. |

Event ids are source ids (`linear-comment:<id>`), so the webhook and the
backstop write the same key and replays are idempotent.

## Presence

From the newest event per agent: `blocked` when it is a failure (usage limit,
no environment, couldn't start a task), `active` under 30 minutes, `recent`
under 24 hours, `quiet` older, `unseen` with no event. Blocked sorts first,
because that is the agent that needs someone.

## Ovie fleet room (slice 1, shipped)

- Roster: Summer, Elsa, Chloe, Lola, Codex, Cursor, Copilot, Tim. Unknown
  prefixed speakers still appear, after the roster.
- Ingest: `scheduleFleetRoomWebhook` runs after the Linear webhook responds and
  never changes its outcome. It skips unattributed comments before any read.
- Backstop: `fleetRoom` sub-job of `/api/cron/frequent`, top of each hour. One
  GraphQL query: issues labelled `fleet` updated in the last 7 days plus the
  home threads (JOV-12296, JOV-7998), 30 comments each.
- Needs `LINEAR_API_KEY` (backstop and issue lookups) and Redis. Without Redis
  the page shows the roster and says activity is unavailable.

## Slice 2: talk to an agent

A composer posts `[Tim → <Agent>] <text>` as a Linear comment on that agent's
home thread, through an admin-only server action. The webhook echoes
it into the room, so the room stays a read model. No @mentions are added, so
nothing delegates to Codex in Linear by accident.

## Customer rooms (Jovie)

Same contract, different room id and sources:

- Room id `profile:<profileId>`; roster is the creator's agents (release
  planner, outreach, content) plus the creator.
- Source adapter over Jovie agent runs (the `jovie-work` activity feed) writes
  the same `AgentRoomEvent` shape; no Linear for customers.
- The same `AgentRoom` component renders it inside the creator app.
- Talking to an agent posts to that agent's run inbox instead of Linear.

Nothing in the contract or the component is Ovie-specific; only
`lib/ovie/fleet-room*.ts` is.

## Known gaps

- Unit tests run the backstop against a fake Linear. The live filter syntax
  and comment ordering are unproven until the first hourly run.
- Agents that post without a prefix from Tim's account cannot be told apart
  from Tim and are left out.

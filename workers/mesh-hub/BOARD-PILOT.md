# Vercel Board shadow mirror — one-week pilot

> **Freeze exception (explicit).** This hub is **Frozen (2026-11-11)** — see the
> README. Tim approved this pilot on **2026-11-19** and said "Build the Board
> pilot anyway" at 08:53 PT that day. The change is additive, flag-gated
> (default OFF) and removable in one revert. Nothing else in the hub changes,
> and this pilot does not touch the in-flight hub refactor or the mailbox code.

The pilot shadow-writes the fleet task board (`src/board.ts` stage log) into a
[Vercel Board](https://vercel.com/docs/board) channel, so we can measure whether
Board is a better bus for swarm work than the hub's own board. It runs for one
week; then Tim decides from the numbers. **Neither side depends on the other**:
if Board is down, the hub is untouched; if the mirror is off, Board is simply
empty.

## How it works

```
hub (Cloudflare DO "Board")                    web (Vercel, project jovie)
  src/board-do.ts                                 app/api/internal/
    op/sweep -> store.apply -> flush                mesh-board-mirror/route.ts
    -> ctx.waitUntil(mirror.drain)  ==HMAC==>         verifies HMAC, maps rows
    src/board-mirror.ts                               writes @vercel/board (OIDC)
    batches of 50 rows, 5 s timeout               app/api/internal/
    cursor in DO storage KV                         mesh-board/[[...path]]/route.ts
                                                      watcher mesh_tasks_audit
                                                      (log-only latency probe)
```

- **Hub side.** `src/board-mirror.ts` (pure, dependency-injected) pushes new
  `stages` rows after every successful board op and sweep. Both
  `BOARD_MIRROR_URL` (var) and `BOARD_MIRROR_SECRET` (secret) must be set,
  else it does nothing at all — no fetch, no DO-storage writes. Rows are
  signed `HMAC-SHA256("${timestamp}.${rawBody}")` in `x-mesh-timestamp` /
  `x-mesh-signature`. The cursor (`boardMirror:cursor`) advances only to the
  receiver's `processedThrough`; a failed POST leaves it in place and the DO
  alarm retries in 60 s. Backlog over 1000 rows skips ahead (counted in
  `boardMirror:skipped`) rather than growing without bound.
- **Receiver.** The web route re-verifies the HMAC (timing-safe, ±300 s) and
  applies each row to Board channel `mesh/tasks` with `@vercel/board`,
  authenticating with the deployment's own OIDC token. The hub holds no
  Vercel token and never calls Board. Cloudflare cannot use Vercel OIDC —
  that is why the hop exists.
- **Audit watcher.** `mesh_tasks_audit` tails `mesh/tasks` and logs one JSON
  line per event (`evt: "board_pilot"`); it writes nothing. Those lines give
  Board's wake latency (`wakeAt − eventAt`) and end-to-end lag
  (`eventAt − hubAt`).

## Mapping (hub stage → Board write)

Every write is idempotent (`id: hub-stage-<stageId>`, replies
`hub-stage-<stageId>-reply`), written as profile `mesh-hub`, and labeled
`hub_id`, `hub_type`, `hub_stage`, `hub_at` plus the fields below.

| Hub stage | Board write |
| --- | --- |
| `posted` / `fanout` (task, merge) | `tasks.create('mesh/tasks', {text: title[+body], labels})`, `hub_state` from hub status |
| `posted` (question) | plain `post` labeled `hub_type=question` (Board has no question type) |
| `claimed` | labels `hub_state=claimed`, `hub_claimant=<kind>` + a reply — **not** a real Board claim (hub leases run 15 min–6 h; Board leases cap at 5 min) |
| `progress` / `reclaimed` / `answered` | reply (answer text only in body mode) |
| `done` / `failed` | `tasks.claim(id, {lease: 60})` then `complete(result)` / `fail(result)`, label `hub_state` |
| `cancelled` | `tasks.cancel` + label |
| `lease_expired` | label `hub_state=open` + a reply |
| `reassigned` | label `hub_assignee` + a reply |
| unknown | reply with the stage name |

**Label keys are underscore-style (`hub_id`).** The Board docs publish no
character set for label keys (only the `board.` prefix is reserved), so dotted
keys like `hub.id` are not provably safe; underscores are. Capability labels
are `cap_<name>=1`.

**Text scope.** Default mirrors titles only. `BOARD_MIRROR_BODY="1"` also
sends the task body (2000 chars) and results/notes/answers (500 chars) — all
of which already passed the hub's secret scanner (`src/scan.ts`) on the way in.

## Known gaps (accepted for one week)

- Board has no question type; questions mirror as labeled posts.
- A hub `claimed` is not a Board claim, so Board cannot enforce hub leases.
- A failed Board write is logged and skipped (`evt: board_mirror_error` in
  Vercel logs); the shadow copy can drift rather than wedge the hub.
- No backfill: enabling mirrors only new stages (the cursor starts at the
  then-current max stage id).
- Board publishes no numeric rate limits; writes go one row at a time in
  stage order and rely on the SDK's own 429 retry.
- Watcher registration needs the deployment's own credentials
  (`watchers_need_project`); if the board is not granted to the `jovie`
  project, writes fail with `board_not_granted` until the grant is added in
  the Vercel dashboard — do not work around it.

## Tim's setup steps (~10 min, human-only)

1. **Board access for the web project.** `vercel login`, then
   `vercel board whoami` to confirm the team's board. Grant the `jovie`
   project's deployment access to the board if it is not the default board
   (dashboard → Board → access, or `vercel board` CLI).
2. **Secret on the hub (Cloudflare).** Generate 32+ random bytes, store it in
   Doppler `agent-mesh/prd` as `BOARD_MIRROR_SECRET`, then:
   `wrangler secret put BOARD_MIRROR_SECRET` (workers/mesh-hub). Uncomment
   `BOARD_MIRROR_URL` in `workers/mesh-hub/wrangler.toml` `[vars]` (optional:
   `BOARD_MIRROR_BODY = "1"`), then deploy the hub (`pnpm --filter
   @jovie/mesh-hub run deploy`) — hub deploys are manual (`wrangler deploy`);
   there is no deploy workflow for workers/mesh-hub on main.
3. **Secret on the web project (Vercel).** Set `BOARD_MIRROR_SECRET` on
   project `jovie` (team `jovie`, `prj_HPZm5iGtARQ2qef6g2xtjgFIGDVY` — the
   production project that serves jov.ie from `apps/web`) for the
   *Production* environment. Redeploy or let the next deploy pick it up; web
   deploys from main are automatic (Vercel git integration).
4. **Arm the watcher.** Open `https://jov.ie/api/internal/mesh-board` once in
   a browser signed in with production deployment protection bypass — or curl
   it with the bypass secret. First use registers `mesh_tasks_audit`.
   Until then, wake-latency numbers are simply absent.
5. **Daily compare (optional but recommended).** See below.

## Daily comparison

```
npm i --no-save --prefix .board-pilot @vercel/board@0.50.0
doppler run --project agent-mesh --config prd --no-fallback -- \\
  env NODE_PATH=$PWD/.board-pilot/node_modules \\
  node scripts/mesh/board-pilot-compare.mjs --since 2026-11-19T00:00:00Z
```

`HUB_TOKEN` (an agent bearer from Doppler) and your `vercel login` are the
only credentials; the script never prints them. It reports: tasks/stages
mirrored, missed (hub stage with no Board message older than 10 min),
duplicates, state divergence, lag p50/p95/max, mirror backlog/skips/failures,
and hub-side claim conflicts. Board-side claim errors (`task_claimed`,
`claim_lost`) show in Vercel logs as `evt: board_mirror_error` — the script
cannot read those without a Vercel API token, by design.

The watcher log lines are the latency source of truth:

```
vercel logs jovie --output json | grep board_pilot
```

`wakeAt − eventAt` is Board's wake latency; `eventAt − hubAt` is the hub→Board
end-to-end lag. The compare script's lag percentiles measure the same thing
from Board's side.

## Rollback

- **Off:** unset `BOARD_MIRROR_SECRET` on the hub (or the `BOARD_MIRROR_URL`
  var). With either unset the hub behaves exactly as before this PR.
- **Gone:** revert the PR. No SQL migration, no storage migration, no Board
  state to clean up (the Board channel is disposable).

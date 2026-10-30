# Eve (Jovie + Ovie)

Eve is the talk runtime. Ovie is Tim's door and operations presentation,
not a persona. Jovie is the artist identity. Summer is Chief of Staff
behind the door. Symphony orchestrates code on Gem Ubuntu.

Canonical program: [`docs/OVIE_PROGRAM.md`](../../docs/OVIE_PROGRAM.md)
(JOV-5214).

`Tim -> Ovie -> Eve/Summer -> durable receipt/outbox -> Linear projection -> Symphony -> identified coding worker on Gem Ubuntu`

## Split

Tim always talks through Ovie.

- Creator work and dogfood → this door drives Jovie on the same product path.
- Jovie cannot do it → Eve admits a build (engineering). No second chat.
- Feeling the product → Tim opens the Jovie app. That is taste, not talk.
- Conversational authority is Summer. Ovie is Tim's interface to Summer, not
  a second persona.
- Jovie-on-iMessage is later.

## Channels

| Channel | Identity | Notes |
|---|---|---|
| iOS / Mac / OV chat | Ovie door when `chatMode=ov` | Eve intake, then Summer. Not artist Jovie chat |
| Telegram | Ovie door | Dedicated bot. Do not reuse Hermes |
| iMessage (Photon) | Ovie door | Portable Photon creds. No Vercel Connect |
| Jovie product chat | Jovie | Artist identity only |

## Summer Vercel migration

Summer begins as an explicit `ovie-summer-shadow` identity in this Eve app.
It can observe and report engineering throughput from Ovie, but it has no
write capability during this phase. Photon, Telegram, and iMessage remain
bound to Ovie. The dedicated non-production
`jovie-eve-shadow-staging.vercel.app` deployment accepts only Jovie production
OIDC at `POST /ovie/v1/summer-shadow/events`. It writes a
private immutable Vercel Blob receipt/outbox before Eve dispatch and a second
terminal receipt before returning `202`. `SUMMER_SHADOW_ENABLED=true` in a
Vercel Preview deployment is the explicit kill-switch opt-in; every other
environment and value fails closed. Immutable reservations cap each
logical conversation at five turns and all shadow traffic at 25 turns per UTC
day. Duplicate event IDs, occupied budget slots, unsigned calls, stale events,
and persistence uncertainty fail closed. The binding conveys
`dispatchAuthority: none`; it does not expose Linear, Symphony, GitHub, GBrain,
deployment, or permission mutations. Before Summer may orchestrate mutations,
the separately gated rate-limit replay path must also pass. Linear remains the
coordination projection, not delivery truth. Hermes remains available as
rollback until that proof is complete.

`agent/lib/summer-photon-offline-proof.ts` is a test-only, zero-outbound safety
proof. It is not registered as an Eve channel and cannot reach Photon or an
iMessage recipient. Live routing remains unchanged until both existing Photon
projects and their distinct assigned lines are verified.

The accepted event contract is strict:

```json
{
  "schema": "jovie.ovie-summer-shadow.event/v1",
  "eventId": "evt_unique_identifier",
  "conversationId": "conv_stable_identifier",
  "turn": 1,
  "dailySlot": 1,
  "occurredAt": "2026-08-31T20:00:00.000Z",
  "message": "Read-only observation",
  "evidence": []
}
```

For an Ovie-originated production probe, invoke the narrow Jovie server bridge
with its existing cron authentication. That production Function obtains its
short-lived Vercel OIDC token from the request context and signs the Eve call.
The script never prints either credential:

    # The bounded dogfood probe ships in the dependent safety PR.

Telegram and iMessage fail closed without an allowlist. Groups and unknown
senders are dropped.

## Credentials (no Vercel Connect)

Set these on the Eve host, never in git:

    TELEGRAM_BOT_TOKEN=
    TELEGRAM_WEBHOOK_SECRET_TOKEN=
    OVIE_TELEGRAM_ALLOWED_USER_IDS=782165716
    OVIE_TELEGRAM_BOT_USERNAME=

    IMESSAGE_PROJECT_ID=
    IMESSAGE_PROJECT_SECRET=
    IMESSAGE_WEBHOOK_SECRET=
    OVIE_IMESSAGE_ALLOWED_SENDERS=+17326682148

Photon is the paid iMessage exception. Everything else should be an
internal extension (public repo / Composio / Eve registry) when a
capability is missing.

After the Eve host is public HTTPS:

    curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
      -H "Content-Type: application/json" \
      -d '{"url":"https://<eve-host>/eve/v1/telegram","secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'","allowed_updates":["message","callback_query"]}'

Point Photon's webhook at `https://<eve-host>/eve/v1/photon`. Then take
Summer off Photon talk so iMessage is the Ovie door, not the factory.

## Production promotion (isolated shadow project)

`jovie-eve-shadow` is not Git-linked, so production promotion is a Vercel alias
mutation, not a merge. Use the `Eve Pilot` workflow's `workflow_dispatch` job
`promote-shadow-production` with the exact READY deployment ID and the exact
40-hex commit it must carry:

    gh workflow run eve-pilot.yml --ref main \
      -f production_deployment_id=dpl_<id> \
      -f expected_sha=<40-hex>

The job fails closed: it promotes only the exact `dpl_` id in READY state,
refuses a foreign `githubCommitSha`, re-points both
`jovie-eve-shadow.vercel.app` and `jovie-eve-shadow-jovie.vercel.app`, polls
until each alias serves that deployment, and requires an unsigned
`POST /eve/v1/photon` to answer 400/401 from the app (not a Vercel SSO
redirect). Preview protection is untouched; the team-scoped
`jovie-eve-shadow-jovie.vercel.app` hostname stays SSO-protected. The signed
Photon POST 200 plus an Eve agent reply remain a founder-only iMessage canary.

First execution: JOV-5868 promoted `dpl_2wqTD2wC3uNknrka1S45wXyEsLop` (merge
`58c68e78ddc2a613546213ebba6bf1b0da9eefbd`, #17045) in run
[33805196475](https://github.com/JovieInc/Jovie/actions/runs/33805196475).

## Local verification

Node 24 or later. Isolated from the monorepo Node 22 CI runner.

    pnpm --dir apps/eve-pilot install --frozen-lockfile --ignore-workspace
    pnpm --dir apps/eve-pilot --ignore-workspace run typecheck
    pnpm --dir apps/eve-pilot --ignore-workspace run test
    pnpm --dir apps/eve-pilot --ignore-workspace run build

## What this unit does not do

- It does not replace `executeChatTurn` as Jovie web's generation path.
- It does not fall through OV turns to ordinary artist Jovie chat.
- It does not privileged-write gbrain or heal Symphony.
- It does not join LYB Eve.
- It does not revive the retired Gem OpenClaw agent.

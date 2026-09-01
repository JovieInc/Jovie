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
bound to Ovie. Before Summer may orchestrate mutations, land the durable
receipt/outbox and rate-limit replay path with event-replay tests; Linear is
the coordination projection, not delivery truth. Hermes remains available as
rollback until that proof is complete.

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

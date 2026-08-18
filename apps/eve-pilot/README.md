# Eve (Jovie + Ovie)

Eve is the talk runtime. Ovie is Tim's door. Jovie is the artist identity.
Summer on Gem is the factory behind the door.

## Split

Tim always talks to Ovie.

- Creator work and dogfood → Ovie drives Jovie on the same product path.
- Jovie cannot do it → Ovie admits a build (engineering). No second chat.
- Feeling the product → Tim opens the Jovie app. That is taste, not talk.
- Jovie-on-iMessage is later.

## Channels

| Channel | Identity | Notes |
|---|---|---|
| iOS / Mac / OV chat | Ovie when `chatMode=ov` | App is still the primary surface |
| Telegram | Ovie | Dedicated bot. Do not reuse Hermes |
| iMessage (Photon) | Ovie | Portable Photon creds. No Vercel Connect |
| Jovie product chat | Jovie | Artist identity only |

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
Summer off Photon talk so iMessage is Ovie, not the factory.

## Local verification

Node 24 or later. Isolated from the monorepo Node 22 CI runner.

    pnpm --dir apps/eve-pilot install --frozen-lockfile --ignore-workspace
    pnpm --dir apps/eve-pilot --ignore-workspace run typecheck
    pnpm --dir apps/eve-pilot --ignore-workspace run test
    pnpm --dir apps/eve-pilot --ignore-workspace run build
    pnpm --dir apps/eve-pilot --ignore-workspace exec eve eval --strict

The last command boots the real Eve session HTTP surface and grades
deterministic `defineEval` cases under `evals/` (`mockModel` only — no live
provider). It must exit 0. Use Node 24 or later (`nvm use 24`).

## What this unit does not do

- It does not replace `executeChatTurn` as Jovie web's generation path.
- It does not privileged-write gbrain or heal Symphony.
- It does not join LYB Eve.

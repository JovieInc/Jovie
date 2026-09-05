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

## Summer internal runtime

Summer Jovi is an internal operations identity; Ovie is presentation only.
Photon and all external-recipient messaging are disabled. Jovie OIDC protects
Summer routes, which accept signed projections and persist immutable receipts
and a bounded Symphony outbox. The runtime requires distinct producer, Eve,
Symphony, and receipt-signing bindings and fails closed on missing, reused,
stale, replayed, or uncertain evidence. Operational receipts expose only key
IDs and public fingerprints. The offline Photon proof cannot reach a recipient.

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

## Repository separation

See [Summer repository separation](../../docs/operations/SUMMER_REPOSITORY_SEPARATION.md) for independently buildable application exports and the private Summer destination. The existing source remains recovery material until verified cutover; this is not commissioning proof.

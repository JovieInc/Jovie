# Release channels — canonical IA (JOV-7535)

One product concept — **Release channel** — shared by Jovie web, macOS, and iOS.
This file is the canonical contract for vocabulary, platform mappings, and
Settings information architecture. The machine-readable contract lives in
`@jovie/release-channel-contracts` (`packages/release-channel-contracts`).

## Canonical vocabulary

| Channel | Meaning |
|---|---|
| **Stable** | Normal customer release. |
| **Beta / Dogfood** | Founder/team fast rail using certified builds. |
| **Nightly / Bleeding Edge** | Optional engineering-only rail; never required for normal dogfood. |

Do not invent per-platform synonyms — "staging build", "alpha", "preview",
"dev ring" — unless they map explicitly to one canonical channel here.

## Platform mappings

| Platform / adapter | Mechanism | Canonical channel |
|---|---|---|
| macOS direct (`production` updater feed) | Electron updater appcast | Stable |
| macOS direct (`staging` updater feed) | Electron updater appcast | Beta / Dogfood |
| macOS `local` dev shell | no updater feed | no published channel |
| iOS App Store install | install provenance | Stable |
| iOS TestFlight install | install provenance | Beta / Dogfood |
| iOS debug/development build | no store receipt | no published channel |
| Mac App Store (if adopted later) | distribution adapter | Stable only |

## Settings rules

### Normal customers

Settings is not an ops dashboard. Show only useful release identity:
app version/build, update status where actionable, and the channel when
useful for support/debugging. Never expose implementation details, signing
jargon, workflow names, SHAs, Sparkle/TestFlight plumbing, or internal
deployment states.

### Founder / admin / developer

A compact advanced **Updates / Release channel** surface may additionally
show: Stable vs Beta/Dogfood, exact build identity and freshness, last check
and last successful update, and one truthful next action when stale or
blocked.

### macOS direct distribution

- A channel selector may switch the canonical update feed/appcast.
- Changing channel must not create duplicate app installs or reset user state.
- Promotion means advancing a tested immutable artifact/channel pointer, not
  rebuilding it.
- Stable is the default; founder/admin defaults to Beta/Dogfood.

### iOS

- The channel is derived from install provenance (TestFlight vs App Store).
- Never offer a fake toggle implying an App Store build can self-switch into
  TestFlight.
- Admin Beta enrollment may deep-link/guide to the canonical TestFlight flow.

### Mac App Store, if adopted later

Treat it as another distribution adapter for Stable, not the release source of
truth. App Store/TestFlight mechanics replace the updater feed for that
binary; the same build-lineage/freshness receipts and Ovi status model remain
canonical. It is not a current product requirement — do not contaminate
current IA or architecture with Mac App Store-specific restrictions.

## Guardrail

Any feature that adds update/release controls must first reconcile this IA
and the existing Settings structure. No new standalone panel, duplicate
"update" section, or platform-specific concept without an explicit mapping to
the canonical model. Operational details live in Ovi Shipping, not customer
Settings. New release features fail planning/certification if they introduce
duplicate channel terminology or duplicate Settings IA.

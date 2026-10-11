# Repo publicity audit — JOV-6693 (2026-09-27)

Per the repo-publicity policy (source code is open by default; secrets, investor
material, plans/roadmaps, Eve workflows, proprietary skill files, and
competitor-sensitive text stay private), each `JovieInc` repository was audited
by full git-tree enumeration plus targeted content reads.

## Flipped to public (clean audit)

| Repo | Audit result |
| --- | --- |
| Jovie | Already public — Tim explicit |
| LogYourBody | Already public |
| symphony | Already public (fork of openai/symphony) |
| ci | Already public |
| ovie | Archived read-only Swift menu-bar launcher; README/DESIGN/LEDGER reviewed — no secrets, only published ship-ledger contract |
| gbrain | Empty placeholder (only `.gitignore`) |

## Kept private — documented reasons

| Repo | Reason |
| --- | --- |
| ios-certificates | Contains `certs/distribution/*.p12` and `*.mobileprovision` signing assets |
| Ops | Fundraising strategy, investor outreach, roadmap (`03-fundraising/`, `04-product/01-roadmap.md`) |
| lyb-knowledge | README-declared private source library: raw transcripts and `dist/quarantine/` medication material |
| summer-config | Eve workflows (`eve-release.yml`, `eve-runtime.yml`), agent source instructions — explicitly private ops boundary |
| zoe-config | **Committed live credential**: `openclaw.json` contains `gateway.auth.token` (loopback gateway token). Rotate it; repo stays private until removed from history |
| symphony-ops | README/BOUNDARY declare a private operational boundary; credential/account invariants documented there |
| symphony-control | Symphony control-plane ops: jobs, launchd units, runbooks, ported workflows — internal ops automation |
| retouching | Persona likeness configs and image-generation prompt IP (`config/characters/*.yaml`, `prompts/`, `PROMPTS`-style assets); API access via env only, but content IP stays private |
| BubblegumFactory | Proprietary prompt canon and brand-IP assets (`PROMPTS.md`, `docs/lore`, `CANON.md`) |

## GitHub Actions spending limit

Not settable via API: org billing endpoints (`/orgs/{org}/settings/billing/actions`,
`/orgs/{org}/billing/usage`) return 404/410 for OAuth tokens — the Actions
spending limit is a web-console-only setting. **Manual step required:**
set it to $0 at https://github.com/organizations/JovieInc/settings/billing —
this instantly caps paid private-repo minutes; public-repo CI stays free.
Billed-minutes figure is likewise not readable via API; read it from the same
billing page.

Residual risk until the limit is set: the private repos above retain GitHub
Actions workflows (`repository-docs-shadow.yml` is near-universal), so
private-minute billing remains possible.

## Flagged follow-up

This repo (`JovieInc/Jovie`, public) contains `docs/company/CAPITAL-STRATEGY.md`
and `docs/company/PRICING-STRATEGY.md` — strategy/pricing docs that are already
world-readable. Worth a separate decision on whether they belong in a public
tree.

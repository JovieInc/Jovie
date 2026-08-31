# Newsjack Evaluation for Chat Press-Source Inspection

**Date:** 2026-08-30 · **Issue:** [JOV-5469](https://linear.app/jovie/issue/JOV-5469/add-provenance-bound-press-source-inspection-to-chat)
**Pinned commit:** [`e3711a3305ff6faadea92a632aec130dddc9503b`](https://github.com/elvisun/newsjack/commit/e3711a3305ff6faadea92a632aec130dddc9503b) (`elvisun/newsjack`, 2026-08-05)

## Verdict

**Compose a Jovie-native source evidence inspector. Do not vendor or execute Newsjack.** Newsjack is a PR-agent skill pack plus a Go CLI that optionally wraps Medialyst. JOV-5469 only needs no-credential HTTPS inspection through `safeFetchPublicHtml`. Vendoring would add a second runtime, Playwright, optional cloud credentials, and an auto-update/install path.

| Use case | Verdict |
|---|---|
| User-supplied HTTPS article / press-release URL | **Adopt native** `inspectPressSource` |
| Live news index / journalist enrichment | **Do not vendor** — credentials + Go CLI |
| Newsjack skills, monitor cron, `origin-apply` | **Block** — out of scope |

## License

MIT. Copyright (c) 2026 Elvis Sun. This evaluation names the upstream project; it does not copy Newsjack source into Jovie.

## Trademark

Marks: "Newsjack", `newsjack.sh`. Do not use them as a product name, slash command, chat tool id, or UI label. The live tool is `inspectPressSource`.

## SBOM / dependency

Pinned-commit runtime if vendored: Go CLI, `playwright-core` `^1.61.1`, Medialyst REST client + credential. **JOV-5469 SBOM result: no new runtime dependency.**

## Update policy

Pin `e3711a3305ff6faadea92a632aec130dddc9503b`. There is no submodule and no auto-update path. Re-evaluate when a later issue needs journalist enrichment or two-source corroboration. Then re-pin a SHA; do not float `main`.

## Provenance controls

User-supplied HTTPS only via `safeFetchPublicHtml`. No credentials. Headline and body fenced as `<untrusted-source>`. Freshness is source-clock recency and does not imply factual verification. Red coverage: stale, future-dated, missing-date, prompt-injection.

## Verdict Summary

Vendor/execute Newsjack: **No**. Native inspector: **Yes**. New runtime dependency / provider credential / auto-update / queue-merge-deploy in this issue: **No**.

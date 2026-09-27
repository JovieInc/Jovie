# SEO and agent-readiness certification

Every public page (marketing, blog, docs, legal, public profiles, smart links)
is certified on three dimensions. Each dimension becomes one
`jovie.certification/v1` receipt in the `invariant_evaluation` tier, so the
certification kernel, the ledger, and Summer read one evidence envelope. There
is no second SEO registry.

| Receipt | Checks | Fails on |
|---|---|---|
| `seo.technical` | HTTP status, title, meta description, self-canonical, indexability vs sitemap and robots, OG and Twitter card, hreflang, `html lang`, one `h1` | non-200, missing title/description/canonical, noindex or robots-blocked sitemap URL, non-self canonical in the sitemap, missing `og:image`/`og:title`, non-https hreflang |
| `seo.agentic` | JSON-LD present and parseable, server-rendered words (streamed Suspense segments count) | no or broken JSON-LD, fewer than 40 words (10 on profiles and smart links) |
| `seo.copy` | `@jovie/copy` lint on title, description, and body (`jovie-marketing`; profiles and smart links use `customer-voice`, floor only) | any blocking finding. Legal pages are excluded, as in the PR copy gate |

Warnings (title or description length out of range, missing twitter card,
missing `lang`, `h1` count) never fail a page. They rank the backlog.

Site-level checks run once per sweep: the `is-agentic` score (npm `is-agentic`,
pinned 1.0.1, floor 90, no essential failures) and `llms.txt`. A missing
`is-agentic` report fails closed.

## Where it runs

- **Pull requests.** Source checks only, per the PR gate cost rules in
  [PR_FLOW](../PR_FLOW.md): the existing SEO ratchet (`pnpm --filter @jovie/web
  test:seo`) for route metadata, and the `copy-gate` lane for added copy lines.
  No live server starts from a PR event.
- **Nightly.** `.github/workflows/seo-certification-nightly.yml` sweeps every
  sitemap URL on jov.ie and uploads `seo-certification.json` (receipts per page).
  `--ratchet` fails the run only when a check fails on more pages than
  `apps/web/lib/seo/seo-certification-ratchet.json` allows, or a site check
  fails. Lower a count when a fix deploys. Never raise one to turn a run green.
- **Local.** `pnpm --filter @jovie/web seo:certify --base https://jov.ie
  --is-agentic-report <file>` (get the file with `npx is-agentic@1.0.1 jov.ie --json`).

The flagship copy judge panel (homepage, pricing, artist profiles, smart links)
runs in the authoring loop with `pnpm copy:judge --tier flagship`. The sweep
records the requirement as a warning and spends no tokens.

## Consumers

Summer reads the nightly artifact as its SEO signal. Failures that need copy or
taste go to Linear with label `seo`; mechanical ones are fixed directly.

## Decision record

**Ship now:** receipts inside the existing `invariant_evaluation` tier, a live
nightly sweep, and a count ratchet.

**Re-evaluate when:** a page family needs its own admission state, or the
ledger gains an authorized producer for nightly receipts.

**Then:** write the same receipts through the certification runtime store; do
not add a second store or tier.

# Pricing title certification, PR #24695

Observed 2026-11-09 on a local Next dev server with the secretless synthetic
configuration used by `pr-visual-review.yml`. The pricing source and all census
owners match commit `6b5ff3996f1682fe08116a08be230d085cd43010`.
This is local source evidence; it does not certify a production deployment.

The title edit changes pricing metadata and the JSON-LD page name from
`Jovie Pricing` to `Pricing | Jovie`. No rendered component or style changes.
The existing recipe, header, footer, plan cards and comparison remain mounted.
Both full-page captures were inspected for clipping and overflow.

Capture command:

```sh
node scripts/surface-recertify.mjs capture --base-url http://localhost:3917 --out /tmp/pr24695-pricing-evidence
```

`capture.json` records HTTP 200 at `/pricing`, matching viewport and scroll
widths, no browser page errors, and SHA-256 digests for the unmodified 1440px and
390px screenshots beside this file. The existing `renewGroup` validator checked
both captures before renewing the source digest.

The two failed merge-group runs were
[42547396841](https://github.com/JovieInc/Jovie/actions/runs/42547396841) and
[42550259731](https://github.com/JovieInc/Jovie/actions/runs/42550259731).
Both reported stale pricing certification. The same source-digest calculation
matches the recorded certification on `origin/main` and differs on this branch.

The affected pre-push gate now runs the existing design authority check first.
Its regression executes the shell gate with stale and current certification:
stale certification stops qualification before typecheck; current certification
continues through the existing gates.

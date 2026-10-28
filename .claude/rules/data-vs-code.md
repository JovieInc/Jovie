---
paths: ["apps/web/app/**", "apps/web/components/**", "apps/web/lib/**", "apps/web/constants/**", "apps/web/data/**", "packages/copy/**"]
---

# Data vs Code: Content and Config Are Data

Tim, 2026-10-28: "Page content as data is so obvious. Are there other places
where we're shipping code where we should just put data in the DB?" Editors are
agents (Summer) and Tim through Ovie. A deploy is the wrong unit of change for
content, and an experiment needs a variant, not a branch.

## Data when all four hold

1. It changes more than roughly monthly, or is a candidate for experiments.
2. It is content, config, or a choice among existing components, not new behavior.
3. A schema can validate it fully (zod at write time and at read time).
4. A bad value cannot break security, auth, billing correctness, or a legal guarantee.

## Code when any one holds

- It adds behavior or a new component.
- It needs tests to be safe.
- It touches auth, permissions, or entitlement enforcement.

## Where data lives

One mechanism, not one per feature: the versioned content record (schema
registry, preview, publish with audit log, instant rollback, experiment
variants) built for marketing pages. Reuse it. Do not add a second store, a
per-feature admin table, or a vendor CMS. Editing and preview happen in Ovie.
Read paths keep a repo-seeded default so a store outage degrades to the last
published value, never to an empty page.

Pick the tier:

| Tier | Use when | Publish path |
|---|---|---|
| DB data | rule 1 to 4 hold and edits are frequent or experimental | content record publish, audit log, rollback |
| Versioned repo data | schema-checked but wants review, or needs build-time proof (SEO, types) | JSON or TS in repo, fast-publish lane |
| Code | any "Code when" clause | normal PR |

## Legal and money data

Pricing, plan limits, disclosures, and consent text are data with one source of
truth: a single record read by every surface (page, checkout, emails, in-app),
an approval card before publish, and an audit log row per change. Never edit
these ad hoc, and never fork a price into per-surface copy. Enforcement logic
(who may do what at a plan) stays code and reads the record.

## Guard

`node scripts/invariants/data-vs-code/scan.mjs` flags large hardcoded
content/config literals in app code (60+ lines and 15+ string literals).
Warn-first per the invariant-validation rule: it prints findings and exits 0
until the false-positive rate is measured. A finding is a prompt to classify
the literal with the tests above, not a verdict. Add `// data-vs-code: code <reason>`
above a literal that was reviewed and should stay code.

# Investor Note Ingestion

This workflow converts local investor-note or transcript exports into a deterministic review artifact. It does not connect to Granola, call an LLM, or publish fundraising content.

## Input Boundary

Use one or more JSON files shaped like the synthetic fixtures in `apps/web/tests/fixtures/investors/`, or a plain-text file with explicit manual annotations:

```text
QUESTION | evidence | high | What customer traction is proven?
OBJECTION | strategy | critical | The initial buyer is unclear.
```

The four allowed gap classes are `communication`, `evidence`, `strategy`, and `investor-fit`. Severity is `medium`, `high`, or `critical`. Unannotated transcript text remains source context and is never interpreted as a claim.

A Granola export may use `source.kind: "granola-export"`, but it must already exist as a local file. Jovie has no Granola API integration or credentials.

## Run

From `apps/web`:

```bash
pnpm exec tsx scripts/ingest-investor-note.ts \
  tests/fixtures/investors/note-a.json \
  tests/fixtures/investors/note-b.json \
  --out=/tmp/investor-note-review.json
```

For plain text, also provide the source date:

```bash
pnpm exec tsx scripts/ingest-investor-note.ts exported-note.txt \
  --captured-at=2026-07-11 \
  --out=/tmp/investor-note-review.json
```

## Review Contract

The artifact normalizes and merges duplicate questions or objections, keeps the highest observed severity, scores frequency from occurrence count, and summarizes gaps by classification. Each candidate retains source labels and dates.

Every artifact is `manual-review-required` and declares `autoPublish: false`. Claims, numbers, the ask, and positioning are protected fields. The next step is a dedicated human-reviewed PR that updates only supported registry entries; transcript text must never be copied into investor-facing claims without separate provenance review.


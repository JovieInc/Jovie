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

Every source requires a stable `source.id`. Reusing an ID is rejected so repeated imports cannot inflate frequency. Each artifact source reference includes that ID and a SHA-256 hash of the transcript. JSON signals normally omit `line`; when a line is supplied, it must point to an exact matching annotated transcript line.

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
  --source-id=conversation-2026-07-11-example \
  --captured-at=2026-07-11 \
  --out=/tmp/investor-note-review.json
```

## Review Contract

The artifact normalizes Unicode with NFKC and merges duplicate questions or objections. It preserves every observed gap classification, chooses canonical text deterministically, keeps the highest observed severity, and sorts and deduplicates provenance. `occurrenceCount` counts mentions; frequency uses distinct conversation IDs so repetition inside one note cannot inflate it.

The CLI refuses `.env*`, `.npmrc`, `.git`, `node_modules`, and the canonical fundraising registry as input or output. Output cannot equal any input. Files are created exclusively by default; `--overwrite` is explicit and never bypasses protected-path or input-collision checks. CLI stdout and stderr are JSON.

Every artifact is `manual-review-required` and declares `autoPublish: false`. Claims, numbers, the ask, and positioning are protected fields. Candidates include deterministic next actions and proposed review targets for the portal, deck, outreach brief, or registry.

To perform the manual review, create a dedicated branch and draft PR:

```bash
git switch -c codex/jov-3739-investor-note-review
# Review the artifact; edit only source-backed risks or communication.
pnpm --filter @jovie/web exec vitest run tests/unit/investors/fundraising-registry.test.ts
gh pr create --draft --base codex/jov-3739-investor-note-ingestion \
  --title "docs(investors): review investor note signals"
```

The command is deliberately manual. The ingestion script never creates branches, edits the registry, opens PRs, or copies transcript text into investor-facing claims.

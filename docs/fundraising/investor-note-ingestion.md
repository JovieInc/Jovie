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
  --out=../../.artifacts/fundraising/investor-note-review.json
```

For plain text, also provide the source date:

```bash
pnpm exec tsx scripts/ingest-investor-note.ts exported-note.txt \
  --source-id=conversation-2026-07-11-example \
  --captured-at=2026-07-11 \
  --out=../../.artifacts/fundraising/investor-note-review.json
```

Outputs are required to be `.json` files under the repository-local
`.artifacts/fundraising/` directory. That directory is gitignored because the
artifact retains source transcripts for deterministic incremental ingestion.
The CLI resolves real paths, rejects symlink inputs and output components, and
refuses every output outside that root, including with `--overwrite`.

To add notes without losing prior frequency evidence, pass the previous artifact:

```bash
pnpm exec tsx scripts/ingest-investor-note.ts new-note.json \
  --prior=../../.artifacts/fundraising/investor-note-review.json \
  --out=../../.artifacts/fundraising/investor-note-review-next.json
```

The embedded corpus deduplicates an unchanged `source.id` plus transcript hash.
Reusing a source ID with a changed transcript hash is rejected. Sequential
ingestion therefore produces the same artifact as a single batch.

## Review Contract

The artifact normalizes Unicode with NFKC and merges duplicate questions or objections. It preserves every observed gap classification, chooses canonical text deterministically, keeps the highest observed severity, and sorts and deduplicates provenance. `occurrenceCount` counts mentions; frequency uses distinct conversation IDs so repetition inside one note cannot inflate it.

The CLI refuses `.env*`, `.npmrc`, `.git`, `node_modules`, and the canonical fundraising registry as input. Files are created exclusively by default; `--overwrite` is explicit and never bypasses containment, realpath, or symlink checks. CLI stdout and stderr are JSON.

Every artifact is `manual-review-required` and declares `autoPublish: false`. Claims, numbers, the ask, and positioning are protected fields. Candidates include deterministic next actions and proposed review targets for the portal, deck, outreach brief, or registry.

## Guarded Proposal and Draft PR

Create a proposal JSON with `proposalVersion: "1.0.0"`, a stable `slug`, a
title, and `approvedCandidates`. Each approved item must include an exact
candidate key, concrete proposed copy, action, allowed target, protected-field
review flags, and evidence references copied from that candidate's sources.
Unknown candidates, non-allowed targets, missing evidence, and mismatched
source IDs, hashes, or line references are rejected.

Preview the deterministic Markdown and git plan without writing or calling a
remote service (the default):

```bash
pnpm exec tsx scripts/create-investor-review-draft.ts \
  --proposal=proposal.json \
  --artifact=../../.artifacts/fundraising/investor-note-review.json
```

After reviewing the dry-run JSON, explicitly request the external draft stage:

```bash
pnpm exec tsx scripts/create-investor-review-draft.ts \
  --proposal=proposal.json \
  --artifact=../../.artifacts/fundraising/investor-note-review.json \
  --publish-draft
```

The opt-in command refuses dirty worktrees and local or remote branch
collisions. It creates the `codex/investor-review-*` branch in an isolated
temporary git worktree, leaving the caller's checkout and branch untouched. It
commits only the tracked proposal Markdown under
`docs/fundraising/reviews/proposals/`, pushes that branch, and opens a GitHub
**draft** PR. Pre-push failures remove the temporary worktree, artifact, and
new local branch. If draft-PR creation fails after push, the newly-created
remote branch is deleted; a failed deletion reports the exact recoverable
remote state. The command never deletes a preexisting branch, edits registry,
portal, deck, claims, numbers, ask, or positioning; marks a PR ready; merges;
or deploys.

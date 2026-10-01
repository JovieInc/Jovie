# Documentation ownership and parity

The repository owns README/AGENTS, local manifests, runtime declarations and
release workflows. [The portable company contract](company/REPOSITORY_SOURCE_CONTRACT.md)
is shared source policy; it does not change the local stack or release gates.

`repository-docs.json` selects source-owned entry points, runtime pins,
generated output and immutable shared imports. The generated
[repository source map](REPOSITORY_SOURCES.md) fingerprints those sources. Review
related prose whenever a fingerprint changes.
GitHub workflows and package manifests (`package.json`, `Package.swift`) are
deliberately not fingerprinted: they are the most frequently edited files (about a
third of main commits touch a manifest), so a projection that rendered or hashed
them went stale on nearly every dependency or workflow merge and ejected concurrent
PRs from the merge queue with conflicts in this generated file. Read the manifests
directly; workflow prose ownership stays with `.github/workflows/README.md` and
`docs/PR_FLOW.md`.
This is source evidence, not proof of deployment, current credentials or runtime.

From the repository root (Python 3.9+; no network or secrets):

```sh
python3 scripts/repository_docs.py
python3 scripts/repository_docs.py --write
```

Use `--write` after reviewing local source changes. Shared-file edits belong in
the canonical repository named by each import, followed by a reviewed full Git
revision and SHA-256 update. From the reviewed JovieInc/ci tooling checkout:

```sh
python3 scripts/repository_docs.py --root /path/to/this-repo --write \
  --upstream JovieInc/ci=/path/to/ci \
  --upstream JovieInc/Jovie=/path/to/Jovie
```

The default check verifies local copies against declared hashes offline. It does
not claim that upstream pins are latest. Update-time Git readback verifies the
exact upstream bytes. Only listed imports and generated output are written;
README/AGENTS remain local. Review changes in a separate PR per repository.
Revert the consumer commit to restore its previous pin; siblings remain usable.

CI runs the same deterministic parity tests and coverage as shared tooling, then
checks the local projection in shadow. No new required gate or branch protection
is added. Existing required checks remain enforced. JOV-6607 tracks qualification;
JOV-6555 owns shared-CI release distribution and updater integration. Promote only
with representative ship samples, correctness/pass rate, p95, throughput/cost,
failure isolation, an accountable owner and tested rollback. No approved numeric
promotion threshold is implied. No scheduler, new bot or paid service is added.

## Top-map document reviews

`pnpm doc:freshness:check` also checks every Markdown document linked directly
from `CLAUDE.md`, the router itself, and every scoped rule under `.claude/rules`.
`AGENTS.md` remains the symlinked entry point. The lint derives that set on every
run and audits an exact match with `documentReviews` in
`docs/doc-freshness-registry.json`. Findings are emitted as nonblocking
`jovie-document-review-qualification/v1` receipts, including audit duration.
Existing link, map-budget and freshness-marker failures still block. New review
findings do not change the exit code before promotion.

Each entry names its existing CODEOWNERS owner, a specific reviewed contract,
the document digest, and local source evidence with digests. JSON pointers and
Markdown sections bind only the relevant source facts; whole package manifests
and workflows are rejected to preserve the high-churn boundary above. Scalar
`documentValue` claims additionally require the selected source and prose to
agree. Changed prose, changed source, missing source, or missing ownership
is reported for source review in the same PR. CRLF and LF are equivalent.

Review the affected prose against the declared source before updating its
SHA-256 values. Do not bulk-refresh hashes to clear the lint. Use
`documentDigest` and `readDocumentSource` from `scripts/lib/doc-review.mjs` for
the same deterministic calculation; there is deliberately no automatic repair
command. Keep the claim and source selection specific to the document's job.
The existing Structural Contract runs the lint, and the existing scripts test
selector exercises missing/drifting review failures. No new job or service runs.

These bindings detect when a source review must happen; they do not mechanically
prove every sentence true, certify runtime, or renew a harness exception.
Historical sections and live facts still require their dated/runtime evidence.
H-EX-03 remains partial until representative ship-cohort and promotion receipts
meet `canon/ENGINEERING.md`: correctness/pass rate, p95, throughput/cost, failure
isolation, owner and rollback. No promotion threshold is invented by this audit.

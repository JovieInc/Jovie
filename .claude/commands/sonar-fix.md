# SonarCloud repair-to-prevention workflow

Use this command to repair current SonarCloud findings without manufacturing a
clean score. JOV-INV-036 is the executable contract. A finding is complete only
after prevention, exact-head CI, protected merge, and a fresh post-merge scan.

## 1. Resolve repository state and reuse active work

Resolve the repository and actual default/base branch. Never assume `develop`:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
BASE=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || \
  gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
git fetch origin "$BASE"
gh pr list --repo "$REPO" --state open --limit 200 \
  --json number,title,headRefName,baseRefName,isDraft,url,files
```

Inspect open PR titles, branches, files, review comments, and checks for overlap
with each source finding key. Adopt or extend an existing repair PR when it has
the same finding/root cause and single-writer ownership. Do not create a second
PR for the same files or failure class. Record the adopt/extend decision.

## 2. Collect a complete current inventory

Use the repository collector, which fails visibly on authentication, paging,
schema, or analysis-coherency errors and leaves last-known evidence untouched:

```bash
node apps/web/scripts/fetch-sonar-issues.mjs
```

Do not interpret collector failure, missing pages, a missing token, or a skipped
scan as zero findings. Bind the inventory to project, branch, analysis ID, commit,
collection time, completeness, and source finding keys.

Prioritize reliability first, then confirmed serious security. Review security
hotspots separately. Maintainability/style follows only when it does not displace
reliability or launch work.

## 3. Repair one failure class

Group findings by shared root cause, not one rule per warning. For each batch:

1. Record source finding key(s), affected scope, and root cause.
2. Preserve behavior intentionally. Deterministic canonical/hash ordering and
   locale-sensitive UI ordering are different contracts; do not prescribe
   `localeCompare` everywhere to satisfy S2871.
3. Choose the least complex faithful detector: existing Biome/ESLint rule,
   narrow structural guard, regression/property/integration test, or Sonar/native
   analysis for dataflow/security rules that cannot be expressed locally.
4. Prove the original defect fails with an original-defect-failing case, then
   prove the repaired case passes. A detector name, checklist tick, or test-file
   edit is not proof that the detector executed.
5. Reuse an existing detector only when the original defect demonstrably makes
   it fail. Do not add a second linter for numerical parity.

Deliberate-red fixtures must show the original defect is rejected, removal or
disablement of the detector is visible, and test-only exclusions cannot match
product source. Unsupported waivers cannot close a finding. An exception needs
bounded scope, rationale, independent approval, expiry, review trigger, and a
visible residual count.

## 4. Verify and ship without premature success

Run the affected detector and formatting/type checks. Run `pnpm invariants:check`
when this contract, Sonar configuration, or its consumers change. Commit and push
through `/ship`; target `$BASE` and preserve required CI and protected merge.

Track these states separately:

- `opened`: draft PR exists; no completion claim.
- `exact-head-green`: required CI ran the detector on the exact head SHA.
- `merged`: protected merge completed; not scan-confirmed.
- `scan-confirmed`: a fresh post-merge analysis on `main` reports the mapped
  finding keys resolved and no new violation in the failure class.

Any failed collector, required check, merge, or post-merge analysis is a visible
failure with an owner and next action. Do not use administrative bypasses,
baseline resets, broad suppressions, production-source exclusions, or blanket
bug-to-test waivers. Do not claim success at `opened`, CI-pending, or `merged`.

## 5. Evidence handoff

Attach to the Linear issue and PR: inventory identity, source finding key(s),
root cause, detector and proof command, original-defect-failing output, repaired
output, exact head SHA and hosted required-check URL, protected merge SHA, and
fresh post-merge analysis ID/result. Include residual findings and bounded
exceptions. This evidence is the closure receipt, not the PR description alone.

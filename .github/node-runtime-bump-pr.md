## Summary

Before: production Node is pinned to {FROM}, and Node.js has published {TO} in the same major.

After: every pin consumer names {TO}: `.nvmrc`, `.node-version`, engines, the runner image (tarball checksum from nodejs.org SHASUMS256), workflow pins, the contract tests that assert the literal, and the fingerprint records that hash those files.

How: `node scripts/node-runtime-bump.mjs --latest`, run by the daily Node Runtime Freshness workflow ({RUN_URL}). A new major still goes through the promotion path in `docs/engineering/NODE_RUNTIME_LIFECYCLE.md`.

no Linear issue — ad-hoc

## Verification

- Full PR CI and the merge queue on the combined head, including the runner-image build check that verifies the new tarball checksum offline.

<!-- customer-changelog/v1 {"releaseWorthy":false} -->
<!-- jovie-auto-ready: on-green -->

## Blast radius

- What could break: a dependency that misbehaves on the new patch, caught by the unit suite, typecheck, build and Golden Path checks before merge.
- Proof: this PR's required checks and merge-queue run; rollback is a revert, and the bounded rollback in `docs/engineering/NODE_RUNTIME_LIFECYCLE.md` keeps the prior verified deployment.

## Win

- Claim: production Node moved from {FROM} to {TO} without a hand-edited pin PR
- Area: ci
- Theme: merge-throughput
- Metric: node_pin_releases_behind | releases | lower | 1 | 0 | nodejs.org/dist/index.json vs .nvmrc | node scripts/node-runtime-policy.mjs resolve
- Verify: {RUN_URL}

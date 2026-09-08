# Symphony proof-v2 substrate

This additive source slice introduces explicit `V2_*` constants and `v2_*`
validation APIs. Legacy public gate APIs remain byte-identical. Existing
admission consumers do not use v2 until the separate consumer migration lands.
Neither source slice authorizes installation, runtime activation or deployment.

The private operator context names the source revision, runtime binary/workflow
and imported contract hashes, exact account/provider/model enrollment, and the
Codex executable path/digest. Context freshness is at most 600 seconds. A proof
row cannot attest itself: its private artifact must exactly match, including
process generation, executable digest and current account-state fingerprint.

The runtime observer uses `systemctl --user show` and verifies the service
MainPID, cgroup and start time. It finds the actual 4041 listener, requires its
binary/workflow command paths, and walks stable parent identities back to the
service MainPID. An unrelated listener, wrong cgroup or changed process generation
invalidates evidence. This supports the official Python wrapper with its child
Symphony listener; MainPID equality is not assumed.

The producer executes the canonical absolute enrolled Codex path, pins coder
profile/provider/model and account directory, and checks a randomized final-message
computation. It holds the account lock and rechecks runtime, executable, enrollment
and account state before exclusively creating a mode-0600 completion artifact.
Ledger rows, readiness alone, stale/future proofs, duplicate/contradictory seats,
substituted bindings and failed completions cannot create v2 capacity.

Context and artifacts require private same-owner filesystem permissions. This is
local filesystem provenance, not protection against a compromised same-OS-principal
writer. No provider probe or live service observation was performed by these tests.
Provider completion and process observations use explicit test fixtures, with
separate synthetic runtime and Codex files. Tests exercise the real process parser.

`python3 scripts/symphony/tests/run-proof-gate.py` runs v2-only tests and enforces
90% execution-derived line coverage separately for v2 contract functions, context,
producer and projector. A byte-equivalence test preserves the legacy contract.
Coverage is not live runtime certification. The successor wiring slice owns CI
integration, trusted interpreter invocation, recovery and admission migration.

The coordinator separately reported upstream `itstimwhite/symphony` PR2 merged
to `faeed72e5d1d20d8b5c839ef5958e66b3c84ecea`. This task did not rerun that upstream
suite, install its package or certify its running identity.

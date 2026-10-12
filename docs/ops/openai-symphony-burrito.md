# Official Symphony team-scope compatibility

Jovie's `WORKFLOW.md` uses a JOV team key and rejects `no-symphony`;
stock `openai/symphony` v0.0.3 must not be started with this workflow
because it only supports project scope.

Use the reviewed `JovieInc/symphony-ops` adapter at these immutable identities:

- integration source `fae11882085d83d8d2a58f0f864a9eb1b6e40db8`
- upstream source `1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb` (`v0.0.3`)
- overlay SHA-256 `aa7159e51fe41d3c712e3870ba82a314e93eb384e8189c649dd0f69aec1ef989`

Before installation, the runtime owner must verify the platform artifact, source
tuple, current workflow, process identity, existing claims, and known-good
rollback. An identity mismatch or malformed scope holds new dispatch; it never
authorizes a project/label fallback or duplicate poller.

Supply `LINEAR_API_KEY` through the host secret manager. Source review and merge
remain independent of adapter promotion; only the existing runtime owner may
install, restart, canary, roll back, or certify activation.

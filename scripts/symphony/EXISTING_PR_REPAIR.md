# Explicit existing-PR repair admission

Decision: **extend** the shared issue flock, complete PR discovery and native admission gates.
Reuse the host-private finite manifest pattern from c2eca121644 / PR17250, excluding its obsolete Spark/read-only/floor-one policy.

Only the trusted host operator may issue an explicitly coordinator-assigned repair.
The OS trust boundary includes same-UID processes; `authorizedBy` and `generation` are audit references, not signatures or provider proof.
Workers must never self-assign. Prepare the exact existing branch in an isolated canonical workspace.
Install the qualified controller bundle (including `existing_pr_repair.py`) and matching
standalone `~/.local/bin/symphony-lease-guard` using the existing installers.
Create `~/.config/symphony/repair-assignments` with mode 0700 under the operator UID.
The private JSON spec requires `identifier`, actual Linear `issueId`, `repository`, integer `pr`,
exact 40-hex `head`, canonical absolute `workspace`, source 40-hex `generation`, coordinator UUID
`authorizedBy`, actual `writerUnit`, Unix-second `issuedAt`/`expiresAt` (maximum 5400 seconds),
and `newIssueIntakeAllowed:false`. Invoke the installed controller explicitly:
`repair-assign --assignment-spec <private-spec-path>`. The producer derives source hashes and
real lease identity, validates fresh tracker/PR evidence, and exclusively creates a 0600 assignment.

The native repair workflow must select explicitly assigned issues, include In Review, preserve
the prepared branch, and retain routing/authentication/fleet gates. The sidecar cannot consume
operator-reserved assignments. Before-run verifies current tracker revision, head, workspace,
source and writer unit; pickup repeats validation holding FD9 and creates one exclusive claim.
Terminal fences persist. No Linear state or provider receipt is synthesized. Expiry limits admission,
not running-process lifetime. Downstream route/auth failure consumes the claim; operator disposition
is required before replacement, with no automatic replay or overwriting existing assignments/claims.

CI: `bash scripts/symphony/tests/codex-recovery-ci.sh` runs discovery and both lease gates on exact
PR/merge-group heads. Lease gates include `existing-pr-repair.test.py`, real flock/Git/install tests,
and enforced 95% coverage. Revisit this boundary for separate worker UIDs or unattended assignment.

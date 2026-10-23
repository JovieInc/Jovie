# Codex setup for Jovie

Read `canon/OPERATING_SYSTEM.md` and `AGENTS.md` first. Codex uses the same
canonical local bootstrap as humans and Claude: `bash scripts/codex-setup.sh`
delegates to `scripts/setup.sh`. The wrapper selects the source-pinned Node
runtime from nvm when already installed, including in non-interactive desktop
hook shells. Current pins are Node 24.22.1 and pnpm 9.15.9.

## Desktop worktrees and hooks

`.codex/config.toml` enables `features.hooks`. `.codex/hooks.json` runs setup
on SessionStart and a cleanup report on Stop. Hooks resolve their script from
the Git root so sessions started in a subdirectory use the same entrypoint.

`.codex/environments/environment.toml` supplies desktop worktree setup,
cleanup, and common actions using the app's `script` and `[[actions]]` schema.
The previous `local-env.toml` used unsupported `commands` and action-table
fields; it has been replaced. Platform overrides use `win32`, `darwin`, and
`linux`. Windows setup delegates to `scripts/setup.ps1`.

Codex requires review and trust of each new or changed hook definition through
`/hooks`. A checked-in hook file or feature flag is not proof that it ran.
Do not fabricate trust hashes or bypass hook review. Manual setup remains
available before trust.

The normal setup path also attempts bounded GBrain health/index maintenance.
That is best effort and does not retrieve prior decisions or prove durable
writeback. Query GBrain explicitly before exploration; write durable findings
and verify the same slug after non-trivial work. Report failures as gaps.

## Secret-free cloud coding

The existing cloud coding lane prepares dependencies without Doppler, remote
database access, service provisioning, or placeholder secrets. Set
`JOVIE_CODEX_SECRET_FREE=1` in that environment. The same setup wrapper then
runs `scripts/codex-cloud-setup.mjs`, including in SessionStart, and does not
enter the authenticated local setup or GBrain maintenance path.

Install and activate the Node and pnpm versions from `.nvmrc` and
`package.json.packageManager` before invoking the bootstrap. pnpm must be
available. The bootstrap verifies both exact pins and runs frozen dependency
installation with optional browser/ONNX downloads disabled. An install or
version failure propagates; setup never labels it as success.

Setup shell exports do not persist into later cloud command shells. Retain
the toolchain on disk and activate its PATH in the cloud Start skill. Refresh
frozen dependencies after a checkout or lockfile change. Until the checkout
contains the secret-free wrapper, use the environment's dependency-only
install script and disable repository hooks for nested CLI invocations with
`-c features.hooks=false`.

Authenticated web tests/builds, browser E2E, database/migration checks, native
builds, and release acceptance require their own environments and receipts.
A dependency bootstrap does not certify them.

## Cleanup and archive

`bash scripts/codex-cleanup.sh` defaults to a report. Stop always forces this
mode, even if optional cleanup flags or `--apply` are supplied. It preserves
worktrees, source, dependencies, runtime allocations, caches, Git packs, and
shared Git registrations. A turn ending is not an allocation release.

Explicit `--apply` can retain completed generated artifacts under their
existing policy. Optional E2E cleanup requires both `--apply` and
`CODEX_CLEANUP_E2E_USERS=1`; the legacy Clerk cleanup does not delete Better
Auth users. `CODEX_ARCHIVE_ON_STOP=1` cannot make Stop delete a workspace.
`scripts/archive.sh` reports candidates and preserves unreleased allocations.
For managed Codex worktrees, use Codex's archive operation to save a recoverable
Git snapshot before removing the checkout.

## Models and verification

Start general implementation with GPT-6.1 Sol at medium and Claude Code with
Opus 5.5 at medium. Increase effort for a measured correctness gap. Keep model
choice in user/account configuration rather than forcing it on every teammate.
CLI profiles can preserve a focused cheaper model, deeper Sol reasoning, and
an Astra option. Discover supported models and efforts from the active client;
public provider documentation alone does not prove account access.

**Ship now:** medium effort as the routine starting point. **Re-evaluate when:**
representative tasks regress in correctness or require repeated repair.
**Then:** compare a higher effort or stronger model on those same tasks.

The CI bootstrap coverage command exercises version mismatches, missing tools,
install errors/signals, environment preservation, and SessionStart JSON:
`node --test --experimental-test-coverage
--test-coverage-include=scripts/codex-cloud-setup.mjs --test-coverage-lines=90
--test-coverage-branches=90 --test-coverage-functions=100
scripts/codex-cloud-setup.test.mjs`. Source PR and structural CI use the same
gate. Existing retention tests separately exercise cleanup/archive safety.

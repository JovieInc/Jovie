# Restricted continuous governor runtime

This profile retires the expired September 8 trial under JOV-5853 and JOV-6163.
It uses the existing Symphony service and attestation timer. It is configuration,
not a controller, scheduler, execution grant, or commissioning receipt.

The operator selects `JOVIE_CONFIGURATION_PROFILE=governor-bounded` alongside
the exact reviewed `JOVIE_CONFIGURATION_SOURCE_REVISION` in the existing
`runner-source.env`. The observer compares the workflow and every required
drop-in against that immutable source. Missing, additional, or changed drop-ins
remain unhealthy. The only workflow overlay is concurrency reduced within 1..5.
The canonical profile remains the default.

The fleet installer reads this persisted selection on every rerun and upgrade.
A conflicting process override, unknown profile or untrusted profile file
fails before installation. The restricted workflow retains any lower current
concurrency ceiling; an upgrade never authorizes more capacity. The installer
verifies the selected profile, including Codex OUT and the project/label scope.
The attestation installer restores its prior source and timer activity if
preflight or publication fails, so a failed deployment cannot silently stop
future real observations.

The project, required label, workspace, one-retry ceiling and five-slot maximum
are retained. The canonical installed `before_run` verifier is restored.
Native Codex is explicitly disabled by `/usr/bin/false`; this profile cannot
authorize it through a stale route. Existing isolated execution additionally
requires an operator-bound task grant, an authenticated qualified route, cost
eligibility, and the matching class admission. Summer cannot create or renew
those grants. No provider, spend, enrollment, push or merge permission follows
from a healthy configuration observation. Preserve #17453, HOLD #17156, and
leave #17511/#17521 untouched.

The service runs continuously with its normal restart delay and source-owned
start-rate limit. Runtime lifetime is independent of finite task authorization.
The trial's `RestartSec=5` override is retired. A one-hour rehearsal is not the
operating lifetime and is not continuous commissioning proof.

Activation is owned by the existing Gem operator after normal source review and
delivery. Back up the current workflow, five drop-ins, publisher inputs and
runtime-input environment; record their hashes and the service invocation.
Install this workflow at `~/.config/symphony/WORKFLOW.md`, retire the old
`five-pr-trial.conf`, and install the five exact profile drop-ins. Preserve the
separate signing environment. Use verified Symphony release
`dae31f823850c9ef2dea121433e5b60f09af26fa`, published as
`symphony-build-dae31f823850c9ef2dea121433e5b60f09af26fa` after successful
make-all run `34870559167` (attempt 1) and release run `34870865399`.
Verify its package digest and provenance before the safe transition. Align the
other compared policy/gate/closure/unit files to the same reviewed configuration
revision through their existing delivery owner. Do not pin around a mismatch.
Update `SYMPHONY_RUNTIME_WORKFLOW` to the actual new workflow only as part of
that transition. Keep the exact runtime source and executable bindings.

Use the existing supported safe transition only after checking active work and
ownership; do not remove RefuseManualStop or restart around live work. Verify
the new process command, invocation, source, environment, restart policy and
listener. Then require two actual timer observations within 600 seconds and the
authenticated downstream projection. No timestamp edits or stale receipt reuse.

Rollback preserves the backup and evidence but must not revive the expired
trial's authority or an unverified provider route. On a failed transition,
retain non-admission and use the existing operator recovery path to restore a
reviewed restricted configuration. Source rollback is never permission to label
unhealthy runtime evidence healthy. Useful execution and unattended continuation
remain separate JOV-5853 acceptance gates.

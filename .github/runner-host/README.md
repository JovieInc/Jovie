# Gem runner host contract

These files are the versioned slice deployment source for the Gem
ephemeral-runner host. The pool remains capped at 10 containers, 2 CPUs and 4
GiB per container. The service snapshot is documentation only: model routing
and other live service state are separately managed and the installer never
copies or restarts the service.

## Failure record

GitHub jobs `87010591966` and `87010591983` completed all test assertions, then
Vitest worker creation failed with `spawn ... node EAGAIN`. At diagnosis time,
`ci-runners.slice` was at 852/1,024 tasks (later observed at 958/1,024), while
host PID/thread limits, memory, CPU and load still had headroom. The failure is
dependency/environment drift: an obsolete slice-wide `TasksMax=1024` ceiling,
not a PR-specific test failure or flaky assertion.

The 2,048 limit is intentionally conservative: it is more than twice the
observed ten-runner demand, remains far below host PID/thread limits, and does
not increase the autoscaler maximum above 10. The diagnostic reports warning at
80% and critical at 90%, before Node reaches `EAGAIN`.

## Automatic enforcement

`ci-runner-capacity-reconcile.timer` runs once per minute as root. It checks the
live autoscaler cap before changing anything. With exactly 10 runners, drifted
slice limits are converged to the reviewed 2,048 ceiling and the diagnostic is
rerun against effective state. A correct limit is a no-op. An autoscaler cap
other than 10 or an invalid limit fails closed. Before lowering an unsafe
higher limit, the reconciler also refuses to mutate the slice when live task
usage is already at/above 80% of the reviewed ceiling. Saturation at the
correct ceiling fails the immediate proof, but the installed timer remains
active and retries once per minute. The reconciler never restarts the
autoscaler or runners and never raises the limit beyond 2,048.

## Review and cutover

The installer is dry-run unless `--apply` is provided. Applying the TasksMax
property is live and does not restart the autoscaler or runner containers:

```bash
ssh gem 'cd /path/to/Jovie && sudo .github/runner-host/install-capacity-contract.sh --apply'
```

Before its first mutation, the installer runs the reconciler in preflight mode
to validate exactly one live `AUTOSCALER_MAX_RUNNERS=10` entry plus numeric
`TasksMax` and `TasksCurrent` values. It then installs the root-owned
one-shot/timer, enables the timer without starting it, runs reconciliation once
immediately, and starts the timer even if that proof reports saturation.
Setting `RUNNER_HOST_INSTALL_ROOT` stages files only and performs zero live
`systemctl` or reconciliation calls. Verify afterward with:

```bash
ssh gem 'cd /path/to/Jovie && .github/runner-host/diagnose-capacity.sh'
```

Inspect automatic enforcement with:

```bash
ssh gem 'systemctl status ci-runner-capacity-reconcile.timer ci-runner-capacity-reconcile.service'
```

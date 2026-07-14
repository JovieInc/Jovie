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

## I/O-pressure scale-up admission

The ten-runner process envelope remains the hard maximum, but a single NVMe
device and Docker overlay2 are the measured bottleneck before CPU or memory.
At 9–10 runners, `/proc/pressure/io` reported `full avg10` between 19% and 29%
while memory PSI remained near zero and jobs blocked in `jbd2`. The autoscaler
therefore stops admitting only new runners when I/O `full avg10` reaches 20%.

Admission is latched until `full avg10` is at or below 10% for three consecutive
15-second polls (45 seconds). The lower recovery threshold prevents runner
spawn oscillation around 20%. Missing or malformed PSI fails closed for scale-up
only. Existing containers keep running; the guard never stops a runner, cancels
a job, reduces the configured ten-runner maximum, or changes the existing idle
reaper. Diagnostics use `runner-io-pressure` (or
`runner-io-pressure-unavailable`) and explicitly distinguish I/O admission from
CPU, memory, EAGAIN process capacity, and GitHub scheduler starvation.

## Review and cutover

The installer is dry-run unless `--apply` is provided. Applying the TasksMax
property is live and does not restart the autoscaler or runner containers:

```bash
ssh gem 'cd /path/to/Jovie && sudo .github/runner-host/install-capacity-contract.sh --apply'
```

Verify afterward with:

```bash
ssh gem 'cd /path/to/Jovie && .github/runner-host/diagnose-capacity.sh'
```

The I/O guard has its own dry-run-default installer. `--apply` checksum-gates
the reviewed live controller and installs source only; it does not restart the
autoscaler or touch runner containers. Activation requires a separate restart
approved after primary review:

```bash
ssh gem 'cd /path/to/Jovie && sudo .github/runner-host/install-io-pressure-guard.sh'
```

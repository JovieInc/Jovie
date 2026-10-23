---
id: 2026-10-16-disk-guard-fixture-escape
status: draft
severity: sev2
detected: 2026-10-16T06:36Z
repaired: unverified
failure_classes: [pre-merge-parity-gap, serial-layer-discovery]
detectable_before_human: true
detection_gaps: [missing-invariant, coverage-gap]
replay_corpus: [scripts/tests/test_disk_guard.py]
founder_rescues: 0
incident_issue: JOV-8517
actions: [JOV-8517]
gbrain: ops/postmortems/2026-10-16-disk-guard-fixture-escape
---

# Disk-pressure qualification escaped its temporary host

Author: Codex, JOV-8517. Review: Summer. Process: [README](README.md).

## Summary

A low-disk unit fixture supplied a temporary host but inherited cleanup roots
from the operator's home. Qualification reached retained workspaces and attempted
a backup push. Fixture isolation and checkout admission controls subsequently
shipped; this record separates those repairs from the incomplete historical
integrity evidence. Incident closure remains **unverified**.

## Impact

| Measure | Value |
| --- | --- |
| Start | Qualification ran Oct 16 06:30–06:37 UTC; first leaked effect time is unverified |
| Time to detect | Unexpected owned Git child observed about 06:36 UTC; latency from first effect is unverified |
| Time to own | Existing recovery thread `01a14342`; original ownership timestamp is unverified |
| Time to contain | Birth-verified test parent and descendants contained about 06:37 UTC |
| Time to repair | Corrected qualification reportedly passed 07:38:32 UTC; complete historical integrity remains unverified |
| What was blocked | Exact-head qualification for PR #22010; retained source and remote backup state were exposed to test cleanup |

Times and original PID custody in this table are historical reports from
[JOV-8517](https://linear.app/jovie/issue/JOV-8517), not fresh process observations.
`founder_rescues: 0` records no established count; operator involvement is
unverified, not evidence that none occurred.

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Oct 16 06:30–06:37 | Head `2bec1af3` qualification failed. At about 06:36 pytest PID 4111673 had Git child 4144785 attempting a forced backup push from JOV-5572. | Issue incident report; no pass transferred |
| Oct 16 06:37 | Only birth-verified owned test processes were contained. No cleanup or push retry was authorized. | Issue containment report |
| Oct 16 06:38 | Retained path reportedly existed at `c75fcabb3a0d6f60b8de1f005488e1a79274a278`, with dirty/untracked router artifacts; backup ref lookup returned 404. | Historical issue readback |
| Oct 16 07:38:32 | Corrected head `1626bbba` reportedly passed full qualification with unchanged floors. | Issue workpad; distinct from failed head |
| Oct 16 07:49:09 | Initial fixture correction merged. | [PR #22010](https://github.com/JovieInc/Jovie/pull/22010), merge `5db1a60487c0a29dda45315d9aa5da14493d9409` |
| Oct 16 08:46:56 | Current remote backup commit records this author/committer time. It does **not** establish ref publication time. | [Commit bea66c2b](https://github.com/JovieInc/Jovie/commit/bea66c2b4ecd9c45d982c1aecbf3081f2e0fbdf3) |
| Oct 19 15:45:35 | Local remote-tracking reflog records fetching that backup ref. | Read-only `git reflog show --date=iso refs/remotes/origin/backup/gem/JOV-5572-20261016` |
| Oct 21 | Procfs identity follow-through qualified but remained draft. | [PR #22255](https://github.com/JovieInc/Jovie/pull/22255); still open/draft when checked Oct 23 |
| Oct 23 | Fresh read-only audit found the old path absent and the backup ref present. A new probe reproduced the remaining mocked host-tool cwd escape. | Read-only audit and red/green regression described below |

## Root cause

`CheckTest` mocked `free_pct=10` and created a temporary `Host`, but cleanup
separately discovered retired workspaces, runner installations, old logs,
DerivedData and host tools. The temporary host did not establish ownership of
those independent defaults. `guard.check` catches sweep exceptions and continues,
so a test can also hide boundary failures in its report unless the probe retains
them independently.

The original repair is present on current main. The remaining source gap was
`test_low_disk_preserves_shared_store_while_sweeping_host_tools`: its mocked
`xcrun` execution still used real `Path.home()` as cwd. No actual xcrun execution
is established by that observation. `CheckTest.setUp` now patches `Path.home()`
to its owned temporary root as well as retaining the earlier discovery patches.

## Contributing causes

Disk pressure selects real cleanup behavior, and host scope is not derived
exclusively from `Host.state`. A fake run function can conceal a real path in a
command's working directory. Separate qualification startup/import and process
cleanup problems required later repairs; their passes cannot certify an earlier
failed head or establish what its cleanup changed.

## Failure classes and invariants violated

| Class | Invariant that should hold | Similar surfaces |
| --- | --- | --- |
| pre-merge-parity-gap | Tests that simulate pressure own every independent cleanup/discovery root and command cwd. | Mount fixtures, runner roots, old logs, derived data and pool shedding |
| serial-layer-discovery | Qualification checks path, subprocess, import and process-custody boundaries before interpreting success. | Staged updater tests and detached-child cleanup |

## Why detection failed

The original fixture asserted sweep behavior without an independent execution
boundary. Its fake-home regression covered retained workspaces but replaced
several other sweeps. It did not enforce the host-tool cwd boundary. The new
subprocess probe catches paths and launches before effects and records every
violation even when production's fail-soft sweep catches its exception.

## Instance fix

[PR #22010](https://github.com/JovieInc/Jovie/pull/22010) isolated default roots,
logs, DerivedData and tool discovery. Subsequent
[checkout admission](https://github.com/JovieInc/Jovie/pull/22055) and
[Git/Python import isolation](https://github.com/JovieInc/Jovie/pull/22061)
protect qualification entry. Current code preserves these controls.
The Oct 23 correction confines `Path.home()` within `CheckTest`, preserving the
mocked tool assertion and the existing real sweep/path/process/mount controls.
The matching fixture digest is added to the existing qualification policy;
this is author-provided source evidence pending independent admission.

## Systemic controls

1. JOV-8517: `CheckTest` defaults use owned temporary paths; deliberate tests
   retain their explicit roots and mocked tool commands. Production behavior,
   thresholds and process/mount safety are unchanged.
2. JOV-8517: `FixtureIsolationTest` runs an isolated interpreter with filesystem
   audit hooks, stat/lstat observations and a command allowlist. It exercises real
   temporary DerivedData/log deletion, blocks actual child/network launches,
   and checks mocked command cwds. Deliberate denied launch/path controls prove
   the probe is active. No HOME environment or credentials are changed.
3. JOV-8517: preserve failed artifacts and report qualification by exact head.
   A successful corrected run is containment evidence, never historical integrity
   or production activation proof. Existing checkout admission still checks
   committed, indexed and working fixture bytes.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-8517 | Fixture containment, fail-closed probe and exact-head qualification | pre-merge-parity-gap | Source correction; independent gate pending | scripts/tests/test_disk_guard.py |
| JOV-8517 | Historical source/backup integrity and native runtime outcome | serial-layer-discovery | Bounded audit complete; full historical integrity unverified | https://linear.app/jovie/issue/JOV-8517 |

## Open questions and unverified claims

Read-only observations on Oct 23: `/home/timwhite/symphony-elixir-workspaces/JOV-5572`
is absent. GitHub's backup ref resolves to `bea66c2b4ecd9c45d982c1aecbf3081f2e0fbdf3`.
Its parent is the historically observed `c75fcabb` HEAD; the comparison contains
router modifications and three `symphony-codex-router.before-*` files, plus
package-cache network trace files. This proves a current snapshot exists, not
that it contains every dirty/untracked artifact from 06:38. Snapshot timestamp,
ref creation and directory removal are different events.

The originally attempted `6bf191cd23c3c4b9728c568d4de8fc4ef35809bb` object is absent
locally and returned GitHub HTTP 404. Neither observation proves that the earlier
push never had a side effect. The complete before-image, publication chronology,
directory-removal chronology and all earlier cleanup effects remain unverified.
No push, cleanup, process signaling, permission change or recovery retry was
performed for this audit.

The Oct 20 failed and Oct 21 passing PR #22255 qualification logs remain in
`/tmp/pr22255-qualification-push.log` and `/tmp/pr22255-push.log`. Their historical
hashes were checked Oct 23. Original Oct 16 raw artifacts were not located in the
bounded issue/date search; that is not proof they were deleted. New red/green,
audit and qualification logs use private `/tmp/jov-8517-20261023` directories.
GBrain was unreachable; mirroring and complete incident closure remain owned
by JOV-8517.

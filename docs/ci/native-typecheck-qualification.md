# Native TypeScript qualification

[JOV-8258](https://linear.app/jovie/issue/JOV-8258/evaluate-native-typescript-checking-and-ship-proven-parity)
qualifies the Cloudflare/Oxc [tsrs checker](https://github.com/oxc-project/tsrs)
against TS6 and its exact Microsoft upstream. Required TS6 checks, configuration,
coverage, cache policy and source/combined-head gates remain authoritative.

Run **Native Typecheck Qualification** manually on an exact repository ref. It
creates one bounded Linux x64/glibc job and adds no automatic PR or main jobs.
It installs only integrity-locked compiler packages into a fresh runner temp
directory with its own pnpm store and existing Node/pnpm setup. It needs no
additional service, credentials, remote cache or production permissions.

The tool aliases are `ts6` → `typescript@6.0.3`, `tsrs` →
`@tsrs/linux-x64-gnu@0.25.0-ts7.1.0-beta`, and `upstream` →
`@typescript/typescript-linux-x64@7.1.0-beta`. Native binaries use the standard
libraries adjacent to those packages. The isolated lockfile records registry SRI
for every package; no tool replaces the repository's `tsc` or dependencies.

To reproduce after installing those same standalone pinned tools:

```sh
node scripts/typecheck-native-qualification.mjs --run --tools /absolute/tool-directory --output /absolute/receipt-directory
```

With no arguments, the runner prints help and executes no checker. The workflow
checks both programs; `--program web` or `--program ui` limits a local qualification.
The workflow sets `NATIVE_TYPECHECK_EXPECTED_SHA` to its dispatched SHA. Its artifact contains
raw command logs, versions, source/config/file graph identities, cache proofs,
exit codes, durations, available memory metrics and restoration results. Job and
tool-install start/finish timestamps include setup overhead separately from
checker timings; GitHub's job/run timestamps provide queue wait and full job
elapsed time. These observations do not replace required-gate evidence.
Execution uses the existing timeout/process-group backend for these direct pinned
compilers; it does not attest global process absence or aggregate tree memory.

Qualification covers `apps/web/tsconfig.typecheck.json` and
`packages/ui/tsconfig.json`. Isolated overlays remove the TS7-removed `baseUrl`,
preserve the original absolute web type entries, relocate the UI `rootDir`, and
use separate compiler buildinfo paths. Includes, excludes and strictness retain
the original intent. Complete root/repository file identities must agree; counts
alone cannot establish coverage.

Serial cold/warm, deliberately seeded errors, representative leaf/wide edits and
revert checks compare tsrs with TS6 and its exact native reference. Cold means
absent compiler buildinfo; OS filesystem pages remain cached. Warm state is bound
to the corresponding prime. The suite permits 1,200 elapsed seconds and at most
240 seconds per invocation, within a 25-minute workflow job. Every compiler runs
on the same first two permitted CPUs through `taskset`; Go and Rayon worker
counts are also two. CPU affinity, hardware and memory allowance are recorded.
Timeout, a reduced program, missing seeded diagnostics, unexplained differences or failed
restoration prevents qualification. A faster failing checker is not a speed win.

A successful finite probe is scoped advisory evidence. Receipts always retain
`adoptionEligible: false` and `requiredGate: not-run-by-this-tool`. Tests, stories,
scripts and other packages remain outside migration eligibility until their
broader TS6-to-TS7 semantic differences and coverage are resolved.

Report checker speed, time to useful feedback, summed runner time, required-gate
completion and actual workflow elapsed time separately. This advisory workflow
does not establish a speedup in required green CI.

**Ship now:** manual, exact-head web/UI qualification. **Re-evaluate when:**
package and diagnostic coverage pass and hosted measurements show a relevant
critical-path bottleneck. **Then:** review a separate compiler migration through
normal exact-head and combined-head gates without weakening required checks.

# Repair the existing runner-source publisher

## Official upstream cutover (JOV-6484)

The legacy profiles below do not attest an official `openai/symphony` Burrito
release. Do not refresh their old inputs or relabel a governor receipt to describe
the upstream process. Preserve JOV-6163's historical acceptance separately.

`verify_upstream_burrito_payload.py` supplies a read-only prerequisite. It verifies
an operator-selected release package SHA-256 before decoding its embedded
Burrito 1.5 Linux x86_64 XZ/FOILZ payload, then compares every embedded regular file
and mode with the extracted tree. Missing, extra, changed or symlinked files fail.
Only Burrito's bounded, nonexecutable `_metadata.json` is excluded when it is not
part of the archive. Nothing is executed or extracted, and no receipt is written
by the helper. Its JSON explicitly leaves runtime identity and admission unverified.

Resolve the package digest and source commit independently from the official
release asset and peeled tag. Never select a digest merely because it matches an
installed file. For an already verified package and extracted root:

```bash
python3 scripts/symphony/verify_upstream_burrito_payload.py \
  --package "$APPROVED_PACKAGE" --sha256 "$APPROVED_PACKAGE_SHA256" \
  --extracted-root "$OBSERVED_EXTRACTED_ROOT"
```

Limits: 64 MiB package, 256 MiB decoded payload, 128 MiB XZ decoder memory,
20,000 regular files. The official v0.0.3 archive requires more than 64 MiB decoder
memory because its dictionary itself is 64 MiB. Verification reads files without
altering them; it is not an atomic filesystem snapshot or protection from a
compromised OS principal. A successful comparison alone cannot publish an
attestation. JOV-6484 still requires the serving socket/ancestry/cgroup, process
generation, approved workflow/unit/drop-in configuration, reobservation and
consumer tests before runtime-owner activation and two fresh timer observations.
The existing 600-second freshness limit and all independent admission gates remain.

Decision: extend the existing proof boundary using standard-library XZ decoding
and Burrito's documented archive layout. This small static reader fills the
package-to-extracted-files gap; it does not introduce a runtime or timer. Revisit
when upstream supplies a maintained file-manifest verification interface.
Sources: [Burrito 1.5 archive format](https://github.com/burrito-elixir/burrito/blob/v1.5.0/src/archiver.zig),
[wrapper](https://github.com/burrito-elixir/burrito/blob/v1.5.0/src/wrapper.zig),
[official Symphony release](https://github.com/openai/symphony/releases/tag/v0.0.3).
Do not use maintenance commands as a read-only substitute: wrapper initialization
can create directories or install its musl runtime before maintenance dispatch.

## Preservation-only upstream observation

`observe_upstream_preservation` in the existing emitter verifies the independently
reviewed `symphony-upstream-preservation-binding/v1` digest, typed loaded systemd
properties, exact on-disk inventory, package payload, serving process ancestry and
stable invocation before returning `symphony-upstream-preservation/v1`.
The example binding is deliberately unapproved with null effective/workflow hashes.
Unknown fields, missing approval, changed configuration and stale observations fail.
It reads no environment-file contents or process environment and claims neither.
This observer does not publish legacy health, approve admission or install anything.
The dependent activation-workflow change consumes this separate result to preserve
accepted upstream without reaching legacy mutators. Current configuration approval
and runtime-owner review remain separate from this source-only fixture proof.

## Legacy publisher

JOV-6163 is the runner-source prerequisite for JOV-5853. This replaces the
implementation behind the existing `gem-service-attestation.timer`; it does not
introduce a timer, controller, enrollment grant, or execution path. Summer cannot
select or approve the source inputs for her own trust boundary.

The operator selects the published `JovieInc/symphony` release provenance JSON
after checking its source SHA, successful make-all run, and package SHA-256
against GitHub's release asset. The installed package must match that digest,
and the official service's listener must run under the corresponding extracted
release directory. The listener's ancestry, cgroup, socket, process generation,
and current state API are measured on every observation. This is local host
provenance, not proof against a compromised operating-system principal.

Separately select an immutable Jovie configuration commit from a local Git
repository. The publisher reads that commit with `git show`, compares installed
files, and accepts only the existing single-scalar concurrency overlay. Unknown
unit overrides or other workflow changes produce `healthy: false`. Do not pin a
different revision merely to make those comparisons pass; resolve the deployment
intent and source change under its existing owner first.

Before replacement, run `emit_gem_service_attestation.py --check` with explicit
`--provenance`, `--source-root`, and `--source-revision` arguments. This neither
reads nor writes the current attestation. Exit 0 means the measured inputs match;
exit 2 reports an observed but unhealthy configuration; exit 78 means observation
could not be verified. None of these is a worker-completion receipt.

After the source change passes the normal review and delivery path, prefer the
checked-in installer (also invoked from Gem delivery-controller activation):

```bash
# Requires ~/.config/symphony/runner-source.env and a healthy --check first.
# Exit 2 = observed unhealthy config (do not pin around drift); exit 78 = unverified.
GEM_WORKSPACE="$HOME/gem-workspace" bash scripts/symphony/install-gem-service-attestation.sh
```

Manual equivalent: install `emit_gem_service_attestation.py` at the existing
`~/gem-workspace/scripts/emit-gem-service-attestation.py` path along with its
`symphony_proof_context.py` and `gem_gate_contract.py` dependencies. Install the
checked-in `systemd/gem-service-attestation.service` over that same existing user
unit. Activation verifies `configurationSourceRevision` against the Jovie
production tip; `sourceRevision` is the Symphony release SHA.

Its required `~/.config/symphony/runner-source.env` contains these nonsecret,
operator-selected values:

```text
SYMPHONY_RELEASE_PROVENANCE=/absolute/path/to/verified-release.provenance.json
JOVIE_CONFIGURATION_SOURCE_ROOT=/absolute/path/to/jovie-git-repository
JOVIE_CONFIGURATION_SOURCE_REVISION=<full-40-character-configuration-commit>
```

Preserve a rollback copy of the prior publisher and unit. Pause only the existing
attestation timer while installing; check that no publisher invocation is still
running. Do not restart Symphony. Reload user units and resume the same timer.
Confirm older refresh timers remain disabled. The fleet installer now prints a
configuration verification result and never writes a runtime attestation.

The publisher's advisory lock encloses measurement and atomic replacement, so
cooperating duplicate invocations cannot overwrite a newer observation. A failed
observation preserves the prior receipt, which expires under the unchanged
600-second consumer limit. An observed configuration mismatch publishes an
explicit unhealthy result. Do not restore a known false source claim to regain
admission; revert code only when the replacement itself malfunctions and keep the
existing admission gates closed until evidence is valid.

Verify two actual timer invocations, distinct fresh observations within 600
seconds, stable service generation/release identity, and the downstream signed
snapshot. Freshness alone does not approve new work, owned remediation, push,
provider eligibility, or downstream health; each requires its separate grant
and accepted evidence. Record the deployment and observation evidence on
JOV-6163, then resume the JOV-5853 end-to-end execution proof.

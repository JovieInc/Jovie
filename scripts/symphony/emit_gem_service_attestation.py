#!/usr/bin/env python3
"""Observe the existing official service; never mint runtime or policy authority.

The immutable release sidecar and source revision are operator-selected inputs.
A timer refresh remeasures the actual package, listener, workflow and unit files.
Unknown overrides remain unhealthy. No prior receipt is an input.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.request

import symphony_proof_context as trust

SERVICE = "symphony-elixir.service"
SHA = re.compile(r"[a-f0-9]{40}\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")
SURFACES = {
    "unit": "scripts/symphony/systemd/symphony-elixir.service",
    "policy": "scripts/symphony/gem_rehabilitation_policy.py",
    "gate": "scripts/symphony/gem-priority-gate.py",
    "closureHealth": "scripts/symphony/closure_health.py",
    "workflow": "scripts/symphony/WORKFLOW.md",
}
BOUNDED_PROFILE = "scripts/symphony/profiles/governor-bounded"
BOUNDED_OVERRIDES = {
    "90-symphony-safe-restart-guard.conf", "build-pin.conf",
    "cursor-executable.conf", "summer-bottleneck-signing.conf", "governor-restricted.conf",
}
OBSERVATION_ERRORS = (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError)
RETRY_DELAYS = (5, 15)
UPSTREAM_RELEASE = {
    "repository": "openai/symphony", "releaseTag": "v0.0.3",
    "sourceRevision": "1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb",
    "packageSha256": "ea35a04a54a6d37c0cafe3f195da871e47614a8c05765b90dbb4cac32e1435ee",
}


def upstream_effective_digest(properties: dict) -> str:
    """Hash selected typed D-Bus values; do not interpret systemd unit syntax.

    Command execution timestamps are generation-dependent and excluded. Argument
    arrays, flags, ordered environment-file paths and unique environment values
    remain bound. Environment-file contents and process environment are not read.
    """
    import symphony_official_runtime as runtime
    if set(properties) != set(runtime.ACTIVATION_PROPERTY_TYPES):
        raise ValueError("incomplete effective properties")
    normalized = {}
    for name in runtime.ACTIVATION_COMMAND_PROPERTIES:
        rows = properties[name]
        if not isinstance(rows, list):
            raise ValueError("invalid command list")
        commands = []
        for row in rows:
            if (not isinstance(row, list) or len(row) != 10 or not isinstance(row[1], list)
                    or not row[1] or any(not isinstance(arg, str) or "\0" in arg for arg in row[1])
                    or not Path(row[1][0]).is_absolute()):
                raise ValueError("invalid command")
            commands.append(row[1])
        if not runtime._activation_exec_matches(rows, commands):
            raise ValueError("unsupported command flags or metadata")
        normalized[name] = [row[:3] for row in rows]
    environment = properties["Environment"]
    if (not isinstance(environment, list) or any(not isinstance(item, str) or "\0" in item
            or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", item, re.DOTALL) for item in environment)
            or len({item.split("=", 1)[0] for item in environment}) != len(environment)):
        raise ValueError("ambiguous environment")
    files = properties["EnvironmentFiles"]
    if (not isinstance(files, list) or any(not isinstance(row, list) or len(row) != 2
            or not isinstance(row[0], str) or not Path(row[0]).is_absolute() or "\0" in row[0]
            or type(row[1]) is not bool for row in files)
            or properties["Type"] != "simple" or not isinstance(properties["WorkingDirectory"], str)
            or not Path(properties["WorkingDirectory"]).is_absolute()):
        raise ValueError("invalid effective configuration")
    normalized.update(Type=properties["Type"], WorkingDirectory=properties["WorkingDirectory"],
                      Environment=sorted(environment), EnvironmentFiles=files)
    return digest(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode())


def observe_upstream_preservation(binding_path: Path, approved_digest: str, *,
                                  home: Path | None = None, proc_root: Path = Path("/proc")) -> dict:
    """Observe separately approved upstream identity without legacy health or writes.

    The caller supplies an independently reviewed configuration binding digest.
    Neither this function nor workflow observations can approve or refresh it.
    """
    import symphony_official_runtime as runtime
    import verify_upstream_burrito_payload as payload
    started = time.monotonic()
    home = (home or Path.home()).resolve(strict=True)
    watched = {}
    def read(path):
        value = runtime._activation_read_file(path)
        watched[path] = value
        return value
    if not isinstance(approved_digest, str) or not DIGEST.fullmatch(approved_digest):
        raise ValueError("configuration approval missing")
    raw = read(binding_path)
    if digest(raw) != approved_digest:
        raise ValueError("configuration binding changed")
    binding = json.loads(raw)
    if (not isinstance(binding, dict) or binding.get("schema") != "symphony-upstream-preservation-binding/v1"
            or set(binding) != {"schema", "purpose", "service", "release", "configurationApproved",
                "unitPath", "dropInDirectory", "unitSha256", "dropIns", "effectiveConfigurationSha256",
                "packagePath", "extractedRoot", "executablePath", "workflowPath", "workflowSha256"}
            or binding.get("purpose") != "preservation-only" or binding.get("service") != SERVICE
            or binding.get("release") != UPSTREAM_RELEASE or binding.get("configurationApproved") is not True):
        raise ValueError("unapproved upstream binding")
    unit = home / ".config/systemd/user" / SERVICE
    directory = unit.with_name(unit.name + ".d")
    if binding.get("unitPath") != str(unit) or binding.get("dropInDirectory") != str(directory):
        raise ValueError("mixed configuration paths")
    fields, effective = runtime._activation_snapshot()
    if (fields["Id"] != SERVICE or fields["LoadState"] != "loaded" or fields["ActiveState"] != "active"
            or fields["SubState"] != "running" or fields["ControlPID"] != "0"
            or not re.fullmatch(r"[1-9][0-9]*", fields["MainPID"])
            or not re.fullmatch(r"[a-f0-9]{32}", fields["InvocationID"])
            or not fields["ControlGroup"].endswith("/" + SERVICE) or fields["Transient"] != "no"
            or fields["SourcePath"] or fields["NeedDaemonReload"] != "no" or fields["FragmentPath"] != str(unit)):
        raise ValueError("upstream service unavailable or stale")
    dropins = binding.get("dropIns")
    if (not isinstance(dropins, dict) or not dropins or "zz-upstream-cutover.conf" not in dropins
            or any(not isinstance(name, str) or Path(name).name != name or not name.endswith(".conf")
                   or not isinstance(value, str) or not DIGEST.fullmatch(value) for name, value in dropins.items())):
        raise ValueError("invalid approved inventory")
    paths = runtime._activation_dropin_paths(directory)
    loaded = shlex.split(fields["DropInPaths"])
    if paths != sorted(str(directory / name) for name in dropins) or sorted(loaded) != paths or len(set(loaded)) != len(loaded):
        raise ValueError("unloaded or extra configuration")
    if digest(read(unit)) != binding.get("unitSha256"):
        raise ValueError("unit differs from approval")
    for name, expected in dropins.items():
        if digest(read(directory / name)) != expected:
            raise ValueError("override differs from approval")
    if upstream_effective_digest(effective) != binding.get("effectiveConfigurationSha256"):
        raise ValueError("loaded configuration differs from approval")
    package, root, executable, workflow = (Path(binding[key]) for key in
        ("packagePath", "extractedRoot", "executablePath", "workflowPath"))
    if any(not path.is_absolute() or path.resolve(strict=True) != path for path in (package, root, executable, workflow)):
        raise ValueError("indirect upstream artifact")
    if not executable.is_relative_to(root) or executable.name != "beam.smp":
        raise ValueError("unbound upstream executable")
    if digest(read(workflow)) != binding.get("workflowSha256"):
        raise ValueError("workflow differs from approval")
    starts = effective["ExecStartEx"]
    if len(starts) != 1 or starts[0][0] != str(package) or starts[0][1][-1] != str(workflow):
        raise ValueError("upstream start command disagreement")
    proof = payload.verify(package, UPSTREAM_RELEASE["packageSha256"], root)
    process = proc_root / fields["MainPID"]
    generation = runtime._activation_process_generation(process)
    live_input = {"binaryPath": str(executable), "workflowPath": str(workflow)}
    live_generation = trust.live_runtime(live_input)
    with urllib.request.urlopen("http://127.0.0.1:4041/api/v1/state", timeout=5) as response:
        state = json.loads(response.read(1_048_577))
    observed = datetime.now(timezone.utc)
    if not isinstance(state, dict) or not isinstance(state.get("generated_at"), str):
        raise ValueError("invalid upstream state")
    state_at = datetime.fromisoformat(state["generated_at"].replace("Z", "+00:00"))
    if (state_at.tzinfo is None or not -60 <= (observed - state_at).total_seconds() <= 600
            or any(not isinstance(state.get(key), list) for key in ("running", "retrying", "blocked"))):
        raise ValueError("upstream state unavailable or stale")
    if (runtime._activation_snapshot() != (fields, effective)
            or runtime._activation_process_generation(process) != generation
            or trust.live_runtime(live_input) != live_generation
            or payload.verify(package, UPSTREAM_RELEASE["packageSha256"], root) != proof
            or runtime._activation_dropin_paths(directory) != paths
            or any(runtime._activation_read_file(path) != value for path, value in watched.items())
            or time.monotonic() - started > 30):
        raise ValueError("upstream identity changed during observation")
    return {"schema": "symphony-upstream-preservation/v1", "mode": "upstream-preserved",
            "observedAt": observed.isoformat(), "service": SERVICE, "sourceRevision": UPSTREAM_RELEASE["sourceRevision"],
            "packageSha256": proof["packageSha256"], "payloadManifestSha256": proof["payloadManifestSha256"],
            "configurationBindingSha256": approved_digest, "workflowSha256": binding["workflowSha256"],
            "invocationId": fields["InvocationID"], "runtimeGeneration": live_generation,
            "activation": "not-activated", "admission": "unverified",
            "environmentFileContents": "unverified", "processEnvironment": "unverified"}


def failure_reason(error: Exception) -> str:
    # Only source-authored labels can enter the journal; never argv, paths or
    # exception text from commands, network responses or process environment.
    if isinstance(error, subprocess.TimeoutExpired):
        return "observation-command-timeout"
    if isinstance(error, subprocess.SubprocessError):
        return "observation-command-failed"
    if isinstance(error, OSError):
        return "observation-io-failed"
    if isinstance(error, ValueError) and str(error) in {
        "official service inactive or unbound",
        "official listener ambiguous or unavailable",
        "runtime state observation stale",
        "running application does not bind the release revision",
        "runtime or configuration changed during observation",
        "runtime release provenance mismatch",
        "configuration source revision unavailable",
    }:
        return str(error).replace(" ", "-")
    return "observation-shape-invalid"


def observe_with_retry(observe_once) -> dict:
    """Remeasure after a transient restart; never reuse or redate a receipt.

    Three attempts and twenty seconds of total backoff stay inside the existing
    timer invocation and writer lock. Exhaustion leaves the old receipt intact.
    Definitively unhealthy observations are published as unhealthy immediately.
    """
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            return observe_once()
        except OBSERVATION_ERRORS as error:
            print(json.dumps({"schema": "gem-service-attestation-observation-attempt/v1",
                              "attempt": attempt + 1, "reason": failure_reason(error),
                              "retryInSeconds": RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else None}),
                  file=sys.stderr)
            if attempt == len(RETRY_DELAYS):
                raise
            time.sleep(RETRY_DELAYS[attempt])


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def command(args: list[str]) -> str:
    return subprocess.check_output(args, text=True, timeout=10).strip()


def service_fields() -> dict[str, str]:
    raw = command(["systemctl", "--user", "show", SERVICE,
                   "-p", "MainPID,ControlGroup,InvocationID,ActiveState,NeedDaemonReload,FragmentPath,DropInPaths"])
    return dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)


def source_bytes(root: Path, revision: str, path: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), "show", f"{revision}:{path}"],
                                   timeout=10, stderr=subprocess.DEVNULL)


def compare_source(root: Path, revision: str, relative: str, installed: Path) -> dict:
    actual = digest(installed.read_bytes())
    try:
        expected = digest(source_bytes(root, revision, relative))
    except subprocess.CalledProcessError:
        expected = None
    return {"sourceSha256": expected, "installedSha256": actual,
            "matches": expected is not None and expected == actual}


def compare_workflow(root: Path, revision: str, installed: Path, profile: str = "canonical") -> dict:
    relative = SURFACES["workflow"] if profile == "canonical" else BOUNDED_PROFILE + "/WORKFLOW.md"
    result = compare_source(root, revision, relative, installed)
    source = source_bytes(root, revision, relative).decode()
    target = installed.read_text()
    # Preserve the pressure controller's existing one-scalar overlay contract.
    pattern = re.compile(r"^(\s*max_concurrent_agents:\s*)([1-9][0-9]*)(\s*)$", re.MULTILINE)
    before, after = list(pattern.finditer(source)), list(pattern.finditer(target))
    same = (len(before) == len(after) == 1 and
            pattern.sub(r"\1<runtime>\3", source) == pattern.sub(r"\1<runtime>\3", target))
    if profile == "governor-bounded":
        same = same and int(after[0].group(2)) <= int(before[0].group(2))
    result.update(matches=same, matchMode="exact" if same and source == target else
                  "bounded_concurrency_overlay" if same else "invalid",
                  sourceMaxConcurrentAgents=int(before[0].group(2)) if len(before) == 1 else None,
                  installedMaxConcurrentAgents=int(after[0].group(2)) if len(after) == 1 else None)
    return result


def observe(provenance: Path, source_root: Path, source_revision: str,
            binary: Path, gem_root: Path, *, proc_root: Path = Path("/proc"),
            now: datetime | None = None, profile: str = "canonical") -> dict:
    if profile not in {"canonical", "governor-bounded"}:
        raise ValueError("unknown operator-selected configuration profile")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or not SHA.fullmatch(source_revision):
        raise ValueError("invalid observation clock or configuration revision")
    if command(["git", "-C", str(source_root), "rev-parse", f"{source_revision}^{{commit}}"] ) != source_revision:
        raise ValueError("configuration source revision unavailable")
    release = json.loads(provenance.read_text())
    if not isinstance(release, dict) or not isinstance(release.get("make_all"), dict):
        raise ValueError("invalid release provenance")
    revision = release.get("source_sha")
    package_digest = release.get("sha256")
    if (release.get("repository") != "JovieInc/symphony"
        or not isinstance(revision, str) or not SHA.fullmatch(revision)
        or release.get("target") != "linux_x86_64"
        or not isinstance(package_digest, str) or not DIGEST.fullmatch(package_digest)
        or release.get("artifact") != f"symphony-{revision}-linux_x86_64"
        or release.get("make_all", {}).get("conclusion") != "success"
        or binary.is_symlink() or digest(binary.read_bytes()) != package_digest):
        raise ValueError("runtime release provenance mismatch")
    fields = service_fields()
    pid = fields.get("MainPID", "0")
    group = fields.get("ControlGroup", "")
    if (fields.get("ActiveState") != "active" or not pid.isdigit() or int(pid) <= 0
        or not group.endswith("/symphony-elixir.service") or not fields.get("InvocationID")):
        raise ValueError("official service inactive or unbound")
    # ss is filtered to the exact port. Never print command lines or environment.
    listeners = set(re.findall(r"pid=(\d+)", command(["ss", "-ltnp", "sport = :4041"])))
    if len(listeners) != 1:
        raise ValueError("official listener ambiguous or unavailable")
    listener_pid = int(listeners.pop())
    process = proc_root / str(listener_pid)
    args = (process / "cmdline").read_bytes().decode().split("\0")
    workflow = Path(args[-2] if args[-1] == "" else args[-1])
    env = dict(part.split(b"=", 1) for part in (process / "environ").read_bytes().split(b"\0") if b"=" in part)
    install_root = Path(env.get(b"SYMPHONY_INSTALL_DIR", b"").decode())
    executable = (process / "exe").resolve(strict=True)
    if (not install_root.is_absolute() or install_root.name != revision
        or not executable.is_relative_to(install_root.resolve()) or not workflow.is_absolute()):
        raise ValueError("running application does not bind the release revision")
    live_input = {"binaryPath": str(executable), "workflowPath": str(workflow)}
    executable_digest = digest(executable.read_bytes())
    generation = trust.live_runtime(live_input)
    with urllib.request.urlopen("http://127.0.0.1:4041/api/v1/state", timeout=5) as response:
        state = json.loads(response.read(1_048_577))
    generated = datetime.fromisoformat(state["generated_at"].replace("Z", "+00:00"))
    if generated.tzinfo is None or not -60 <= (now - generated).total_seconds() <= 600:
        raise ValueError("runtime state observation stale")
    installed = {
        "unit": Path(fields["FragmentPath"]),
        "policy": gem_root / "scripts/gem_rehabilitation_policy.py",
        "gate": gem_root / "scripts/gem-priority-gate.py",
        "closureHealth": gem_root / "scripts/closure_health.py",
        "workflow": workflow,
    }
    artifacts = {name: compare_source(source_root, source_revision, relative, installed[name])
                 for name, relative in SURFACES.items()}
    artifacts["workflow"] = compare_workflow(source_root, source_revision, workflow, profile)
    overrides = []
    for name in fields.get("DropInPaths", "").split():
        path = Path(name)
        directory = ("scripts/symphony/systemd/symphony-elixir.service.d" if profile == "canonical"
                     else BOUNDED_PROFILE + "/systemd")
        relative = directory + "/" + path.name
        overrides.append({"name": path.name, **compare_source(source_root, source_revision, relative, path)})
    profile_complete = profile == "canonical" or {item["name"] for item in overrides} == BOUNDED_OVERRIDES
    # Reobserve after file and API reads to reject restarts and concurrent updates.
    if (service_fields() != fields or trust.live_runtime(live_input) != generation
        or digest(binary.read_bytes()) != package_digest
        or digest(executable.read_bytes()) != executable_digest
        or json.loads(provenance.read_text()) != release
        or any(digest(Path(name).read_bytes()) != item["installedSha256"]
               for name, item in zip(fields.get("DropInPaths", "").split(), overrides))
        or any(digest(installed[name].read_bytes()) != item["installedSha256"] for name, item in artifacts.items())):
        raise ValueError("runtime or configuration changed during observation")
    return {
        "schema": "gem-service-attestation/v1", "observedAt": now.isoformat(),
        "sourceRevision": revision, "configurationSourceRevision": source_revision,
        "configurationProfile": profile,
        "service": SERVICE, "active": True, "daemonReloaded": fields.get("NeedDaemonReload") == "no",
        "healthy": fields.get("NeedDaemonReload") == "no" and all(item["matches"] for item in artifacts.values())
                   and profile_complete and all(item["matches"] for item in overrides),
        "listener": {"port": 4041, "pid": listener_pid, "wrapperPid": int(pid),
                     "controlGroup": group, "boundToService": True},
        "runtime": {"workflowPath": str(workflow), "packageSha256": package_digest, "executableSha256": executable_digest,
                    "generation": generation, "invocationId": fields["InvocationID"],
                    "stateObservedAt": state["generated_at"], "provenanceSha256": digest(provenance.read_bytes())},
        "unitOverrides": overrides, **artifacts,
    }


def publish(destination: Path, observe_once) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Installation does not publish runtime receipts. This sole publisher's
    # lock covers measurement, so an older observation cannot win a later rename.
    with destination.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        receipt = observe_once()
        descriptor, name = tempfile.mkstemp(prefix=".service-attestation-", dir=destination.parent)
        try:
            with os.fdopen(descriptor, "w") as output:
                json.dump(receipt, output, sort_keys=True)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, destination)
        finally:
            Path(name).unlink(missing_ok=True)
        return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--profile", choices=("canonical", "governor-bounded"),
                        default=os.environ.get("JOVIE_CONFIGURATION_PROFILE", "canonical"))
    parser.add_argument("--binary", type=Path, default=Path.home() / ".local/bin/symphony")
    parser.add_argument("--gem-root", type=Path, default=Path.home() / "gem-workspace")
    parser.add_argument("--check", action="store_true", help="Observe without publishing")
    args = parser.parse_args()
    observe_once = lambda: observe(args.provenance, args.source_root, args.source_revision, args.binary, args.gem_root,
                                  profile=args.profile)
    try:
        receipt = observe_once() if args.check else publish(
            args.gem_root / "state/gem-service-attestation.json", lambda: observe_with_retry(observe_once))
        print(json.dumps(receipt, sort_keys=True))
        if receipt["healthy"]:
            return 0
        # Surface mismatch summary on stderr so CI verify steps can diagnose
        # exit 2 without relying on stdout (often redirected to /dev/null).
        mismatched = [
            name for name in ("unit", "policy", "gate", "closureHealth", "workflow")
            if isinstance(receipt.get(name), dict) and not receipt[name].get("matches", True)
        ]
        mismatched.extend(
            f"override:{item.get('name', '?')}"
            for item in receipt.get("unitOverrides", [])
            if isinstance(item, dict) and not item.get("matches", True)
        )
        print(
            json.dumps(
                {
                    "schema": "gem-service-attestation-unhealthy/v1",
                    "daemonReloaded": receipt.get("daemonReloaded"),
                    "configurationProfile": receipt.get("configurationProfile"),
                    "mismatched": mismatched,
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2
    except OBSERVATION_ERRORS as error:
        # Do not serialize exception text: subprocess errors can carry argv.
        print(json.dumps({"schema": "gem-service-attestation-observation-error/v1",
                          "reason": "runtime-or-source-observation-unverified",
                          "failureReason": failure_reason(error)}))
        return 78


if __name__ == "__main__":
    raise SystemExit(main())

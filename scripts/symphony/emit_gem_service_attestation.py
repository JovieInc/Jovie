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
import subprocess
import tempfile
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


def compare_workflow(root: Path, revision: str, installed: Path) -> dict:
    result = compare_source(root, revision, SURFACES["workflow"], installed)
    source = source_bytes(root, revision, SURFACES["workflow"]).decode()
    target = installed.read_text()
    # Preserve the pressure controller's existing one-scalar overlay contract.
    pattern = re.compile(r"^(\s*max_concurrent_agents:\s*)([1-9][0-9]*)(\s*)$", re.MULTILINE)
    before, after = list(pattern.finditer(source)), list(pattern.finditer(target))
    same = (len(before) == len(after) == 1 and
            pattern.sub(r"\1<runtime>\3", source) == pattern.sub(r"\1<runtime>\3", target))
    result.update(matches=same, matchMode="exact" if same and source == target else
                  "bounded_concurrency_overlay" if same else "invalid",
                  sourceMaxConcurrentAgents=int(before[0].group(2)) if len(before) == 1 else None,
                  installedMaxConcurrentAgents=int(after[0].group(2)) if len(after) == 1 else None)
    return result


def observe(provenance: Path, source_root: Path, source_revision: str,
            binary: Path, gem_root: Path, *, proc_root: Path = Path("/proc"),
            now: datetime | None = None) -> dict:
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
    artifacts["workflow"] = compare_workflow(source_root, source_revision, workflow)
    overrides = []
    for name in fields.get("DropInPaths", "").split():
        path = Path(name)
        relative = "scripts/symphony/systemd/symphony-elixir.service.d/" + path.name
        overrides.append({"name": path.name, **compare_source(source_root, source_revision, relative, path)})
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
        "service": SERVICE, "active": True, "daemonReloaded": fields.get("NeedDaemonReload") == "no",
        "healthy": fields.get("NeedDaemonReload") == "no" and all(item["matches"] for item in artifacts.values())
                   and all(item["matches"] for item in overrides),
        "listener": {"port": 4041, "pid": listener_pid, "wrapperPid": int(pid),
                     "controlGroup": group, "boundToService": True},
        "runtime": {"packageSha256": package_digest, "executableSha256": executable_digest,
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
    parser.add_argument("--binary", type=Path, default=Path.home() / ".local/bin/symphony")
    parser.add_argument("--gem-root", type=Path, default=Path.home() / "gem-workspace")
    parser.add_argument("--check", action="store_true", help="Observe without publishing")
    args = parser.parse_args()
    observe_once = lambda: observe(args.provenance, args.source_root, args.source_revision, args.binary, args.gem_root)
    try:
        receipt = observe_once() if args.check else publish(args.gem_root / "state/gem-service-attestation.json", observe_once)
        print(json.dumps(receipt, sort_keys=True))
        return 0 if receipt["healthy"] else 2
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        # Do not serialize exception text: subprocess errors can carry argv.
        print(json.dumps({"schema": "gem-service-attestation-observation-error/v1",
                          "reason": "runtime-or-source-observation-unverified"}))
        return 78


if __name__ == "__main__":
    raise SystemExit(main())

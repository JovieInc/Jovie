#!/usr/bin/env python3
"""Fail-closed migration of inactive Gem workspaces from root to managed SATA.

The default mode is read-only. Mutating stages require both --apply and the
per-candidate authorization token printed by ``plan``. Cleanup additionally
requires a boot-bound readback from a later boot and a minimum retention delay.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request


SCHEMA = "gem-workspace-migration/v1"
WORKSPACE_SCHEMA = "jovie-symphony-workspace/v2"
ROOTS = {
    "elixir": Path("/home/timwhite/symphony-elixir-workspaces"),
    "qualification": Path("/home/timwhite/codex-qualification"),
}
BACKING_ROOTS = {
    "elixir": (
        Path("/srv/worktrees/symphony-shards/jovie-elixir"),
        Path("/srv/models/symphony-worktrees/jovie-elixir"),
        Path("/srv/cache/symphony-worktrees/jovie-elixir"),
        Path("/srv/scratch/symphony-worktrees/jovie-elixir"),
    ),
    "qualification": (
        Path("/srv/worktrees/codex-qualification/jovie"),
        Path("/srv/models/codex-qualification/jovie"),
        Path("/srv/cache/codex-qualification/jovie"),
        Path("/srv/scratch/codex-qualification/jovie"),
    ),
}
STATE_ROOT = Path("/var/lib/jovie-symphony-workspaces")
RECEIPT_ROOT = Path("/srv/git/receipts/workspace-migrations")
QUALIFICATION_RECEIPT_ROOT = Path("/srv/git/receipts/qualification-ownership")
STORAGE_LOCK = Path("/run/lock/jovie-symphony-workspaces.lock")
API_URL = "http://127.0.0.1:4041/api/v1/state"


class Refusal(RuntimeError):
    pass


def safe_identifier(namespace: str, identifier: str) -> bool:
    if namespace == "elixir":
        return re.fullmatch(r"JOV-[0-9]+", identifier) is not None
    return re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", identifier) is not None


def candidate(namespace: str, identifier: str) -> tuple[Path, Path, int]:
    if namespace not in ROOTS or not safe_identifier(namespace, identifier):
        raise Refusal("invalid namespace or identifier")
    bucket = int(hashlib.sha256(identifier.encode()).hexdigest()[:8], 16) % 4
    return ROOTS[namespace] / identifier, BACKING_ROOTS[namespace][bucket] / identifier, bucket


def authorization_token(namespace: str, identifier: str, logical: Path, backing: Path) -> str:
    value = f"{SCHEMA}\0{namespace}\0{identifier}\0{logical}\0{backing}"
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def boot_id() -> str:
    return Path("/proc/sys/kernel/random/boot_id").read_text(encoding="utf-8").strip()


def tree_inventory(root: Path) -> dict[str, object]:
    content = hashlib.sha256()
    metadata = hashlib.sha256()
    files = 0
    logical_bytes = 0
    for path in sorted(root.rglob("*"), key=lambda item: os.fsencode(str(item.relative_to(root)))):
        relative = os.fsencode(str(path.relative_to(root)))
        info = path.lstat()
        metadata.update(relative + b"\0")
        metadata.update(f"{stat.S_IFMT(info.st_mode)}:{stat.S_IMODE(info.st_mode)}:{info.st_uid}:{info.st_gid}:{info.st_size}:{info.st_mtime_ns}".encode())
        metadata.update(b"\0")
        content.update(relative + b"\0")
        if path.is_symlink():
            target = os.fsencode(os.readlink(path))
            content.update(target)
            logical_bytes += len(target)
        elif path.is_file():
            files += 1
            logical_bytes += info.st_size
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    content.update(chunk)
        listxattr = getattr(os, "listxattr", None)
        getxattr = getattr(os, "getxattr", None)
        if listxattr is not None and getxattr is not None:
            for name in sorted(listxattr(path, follow_symlinks=False)):
                metadata.update(os.fsencode(name) + b"\0")
                metadata.update(getxattr(path, name, follow_symlinks=False))
        content.update(b"\n")
        metadata.update(b"\n")
    return {"contentDigest": content.hexdigest(), "metadataDigest": metadata.hexdigest(), "fileCount": files, "logicalBytes": logical_bytes}


def tree_digest(root: Path) -> str:
    return hashlib.sha256(json.dumps(tree_inventory(root), sort_keys=True).encode()).hexdigest()


def state_items(payload: object) -> list[dict[str, object]]:
    if not isinstance(payload, dict):
        raise Refusal("official state response is not an object")
    items: list[dict[str, object]] = []
    for key in ("running", "retrying"):
        value = payload.get(key, [])
        if not isinstance(value, list):
            raise Refusal(f"official state field is invalid: {key}")
        items.extend(item for item in value if isinstance(item, dict))
    return items


def fetch_state(url: str) -> object:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.load(response)


def official_state_clear(namespace: str, identifier: str, logical: Path, url: str) -> bool:
    for item in state_items(fetch_state(url)):
        issue = item.get("issue_identifier") or item.get("identifier")
        workspace = item.get("workspace_path") or item.get("workspace")
        if namespace == "elixir" and issue == identifier:
            return False
        if workspace and Path(str(workspace)) == logical:
            return False
    return True


def proc_references(logical: Path, backing: Path) -> list[str]:
    matches: list[str] = []
    prefixes = (str(logical), str(backing))
    for proc in Path("/proc").glob("[0-9]*"):
        links = [proc / "cwd", proc / "root", *list((proc / "fd").glob("*"))]
        for link in links:
            try:
                target = os.readlink(link).removesuffix(" (deleted)")
            except OSError:
                continue
            if any(target == prefix or target.startswith(prefix + "/") for prefix in prefixes):
                matches.append(f"{link}:{target}")
                break
    return matches


def assert_inactive_twice(namespace: str, identifier: str, logical: Path, backing: Path, url: str, pause: float) -> None:
    for attempt in range(2):
        if not official_state_clear(namespace, identifier, logical, url):
            raise Refusal("candidate is active in official Symphony state")
        refs = proc_references(logical, backing)
        if refs:
            raise Refusal("candidate has live process references")
        if attempt == 0 and pause:
            time.sleep(pause)


def assert_storage_topology(logical: Path, backing: Path) -> None:
    storage_mount = Path("/") / backing.parts[1] / backing.parts[2]
    if storage_mount not in (Path("/srv/worktrees"), Path("/srv/models"), Path("/srv/cache"), Path("/srv/scratch")):
        raise Refusal("backing is outside an allowed storage mount")
    if storage_mount.is_symlink() or not storage_mount.is_mount():
        raise Refusal("backing storage mount is absent or unsafe")
    resolved_mount = storage_mount.resolve()
    resolved_backing = backing.resolve(strict=False)
    if resolved_mount not in resolved_backing.parents:
        raise Refusal("backing resolves outside its storage mount")
    if logical.exists() and logical.stat().st_dev == storage_mount.stat().st_dev:
        raise Refusal("logical and backing roots are on the same device")


def state_path(namespace: str, identifier: str) -> Path:
    return STATE_ROOT / "migrations" / f"{namespace}--{identifier}.json"


def workspace_manifest_path(namespace: str, identifier: str) -> Path:
    return STATE_ROOT / "manifests" / f"{namespace}--{identifier}.env"


def marker_path(namespace: str, identifier: str) -> Path:
    return STATE_ROOT / "markers" / f"{namespace}--{identifier}.marker"


def atomic_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True, indent=2) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def durable_receipt(payload: dict[str, object]) -> Path:
    RECEIPT_ROOT.mkdir(parents=True, exist_ok=True)
    path = RECEIPT_ROOT / f"{time.time_ns()}-{payload['namespace']}--{payload['identifier']}--{payload['stage']}.json"
    with path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True, indent=2) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(path, 0o444)
    directory_fd = os.open(RECEIPT_ROOT, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return path


def qualification_receipt_digest(args: argparse.Namespace) -> str | None:
    if args.namespace != "qualification":
        return None
    raw = getattr(args, "qualification_owner_receipt", "")
    if not raw:
        raise Refusal("qualification migration requires a terminal owner receipt")
    path = Path(raw)
    if path.is_symlink() or not path.is_file() or path.parent.resolve() != QUALIFICATION_RECEIPT_ROOT.resolve():
        raise Refusal("qualification owner receipt path is outside the durable receipt root")
    data = path.read_bytes()
    try:
        payload = json.loads(data)
    except json.JSONDecodeError as error:
        raise Refusal("qualification owner receipt is invalid JSON") from error
    if not isinstance(payload, dict) or payload.get("schema") != "codex-qualification-terminal/v1":
        raise Refusal("qualification owner receipt schema mismatch")
    if payload.get("identifier") != args.identifier or payload.get("terminal") is not True or not payload.get("owner"):
        raise Refusal("qualification owner receipt does not prove terminal ownership")
    return hashlib.sha256(data).hexdigest()


def read_state(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise Refusal(f"migration state unavailable: {error}") from error
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise Refusal("migration state schema mismatch")
    return value


def run_checked(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, check=False, timeout=30)
    if result.returncode:
        raise Refusal(f"command failed ({command[0]}): {result.stderr.strip()}")
    return result


def runtime_readback(namespace: str, logical: Path) -> dict[str, object] | None:
    if namespace != "elixir":
        return None
    if not (logical / ".git").is_dir():
        raise Refusal("runtime readback requires a git workspace")
    head = run_checked(["git", "-C", str(logical), "rev-parse", "HEAD"]).stdout.strip()
    status_value = run_checked(["git", "-C", str(logical), "status", "--porcelain=v1", "-z"]).stdout
    refs_value = run_checked(["git", "-C", str(logical), "show-ref"]).stdout
    package_store = logical / ".symphony/package-cache/pnpm-store"
    sample_readable = False
    if package_store.is_dir():
        for directory, _directories, files in os.walk(package_store):
            if files:
                with (Path(directory) / files[0]).open("rb") as handle:
                    handle.read(1)
                sample_readable = True
                break
    return {
        "logicalPath": str(logical),
        "head": head,
        "statusDigest": hashlib.sha256(status_value.encode()).hexdigest(),
        "refsDigest": hashlib.sha256(refs_value.encode()).hexdigest(),
        "packageStoreExists": package_store.is_dir(),
        "packageStoreReadableSample": sample_readable,
    }


def write_workspace_manifest(namespace: str, identifier: str, logical: Path, backing: Path, bucket: int) -> None:
    manifest = workspace_manifest_path(namespace, identifier)
    marker = marker_path(namespace, identifier)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    marker.parent.mkdir(parents=True, exist_ok=True)
    values = {
        manifest: ("\n".join((f"schema={WORKSPACE_SCHEMA}", f"namespace={namespace}", f"issue={identifier}", f"logical={logical}", f"backing={backing}", f"bucket={bucket}", "state=active", "")), 0o644),
        marker: (f"issue={identifier}\nbacking={backing}\n", 0o444),
    }
    for path, (content, mode) in values.items():
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        with temporary.open("x", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    directory_fd = os.open(manifest.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def plan(args: argparse.Namespace, logical: Path, backing: Path, bucket: int, token: str) -> dict[str, object]:
    refs = proc_references(logical, backing)
    try:
        api_clear: bool | None = official_state_clear(args.namespace, args.identifier, logical, args.api_url)
    except Exception:
        api_clear = None
    try:
        qualification_owner_receipt = qualification_receipt_digest(args)
    except Refusal:
        qualification_owner_receipt = None
    return {
        "schema": SCHEMA,
        "stage": "plan",
        "namespace": args.namespace,
        "identifier": args.identifier,
        "logical": str(logical),
        "backing": str(backing),
        "bucket": bucket,
        "authorizationToken": token,
        "logicalExists": logical.is_dir() and not logical.is_symlink(),
        "backingExists": backing.exists(),
        "officialStateClear": api_clear,
        "processReferenceCount": len(refs),
        "qualificationOwnerReceiptDigest": qualification_owner_receipt,
        "mutationPerformed": False,
    }


def require_apply(args: argparse.Namespace, token: str) -> None:
    if not args.apply or args.authorization_token != token:
        raise Refusal("mutation requires --apply and the exact plan authorization token")


def copy_stage(args: argparse.Namespace, logical: Path, backing: Path, bucket: int, token: str, state_file: Path) -> dict[str, object]:
    require_apply(args, token)
    if not logical.is_dir() or logical.is_symlink() or backing.exists() or state_file.exists():
        raise Refusal("copy precondition failed")
    assert_storage_topology(logical, backing)
    owner_receipt_digest = qualification_receipt_digest(args)
    assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    backing.parent.mkdir(parents=True, exist_ok=True)
    backing.mkdir(mode=0o700)
    try:
        run_checked(["rsync", "-aHAX", "-S", "--numeric-ids", "--one-file-system", f"{logical}/", f"{backing}/"])
        source_inventory = tree_inventory(logical)
        backing_inventory = tree_inventory(backing)
        if source_inventory != backing_inventory:
            raise Refusal("copy digest mismatch")
        metadata_readback = run_checked(["rsync", "-aHAXn", "-S", "--delete", "--numeric-ids", "--one-file-system", "--itemize-changes", f"{logical}/", f"{backing}/"])
        if metadata_readback.stdout.strip():
            raise Refusal("copy metadata readback mismatch")
        assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    except Exception:
        raise
    payload = {
        "schema": SCHEMA,
        "stage": "copied",
        "namespace": args.namespace,
        "identifier": args.identifier,
        "logical": str(logical),
        "backing": str(backing),
        "bucket": bucket,
        "sourceInventory": source_inventory,
        "destinationInventory": backing_inventory,
        "qualificationOwnerReceiptDigest": owner_receipt_digest,
        "copiedAt": int(time.time()),
        "authorizationToken": token,
    }
    atomic_json(state_file, payload)
    payload["receipt"] = str(durable_receipt(payload))
    return payload


def switch_stage(args: argparse.Namespace, logical: Path, backing: Path, bucket: int, token: str, state_file: Path) -> dict[str, object]:
    require_apply(args, token)
    payload = read_state(state_file)
    if payload.get("stage") != "copied" or payload.get("authorizationToken") != token:
        raise Refusal("switch requires matching copied state")
    if qualification_receipt_digest(args) != payload.get("qualificationOwnerReceiptDigest"):
        raise Refusal("qualification owner receipt changed after copy")
    assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    if tree_inventory(logical) != payload.get("sourceInventory") or tree_inventory(backing) != payload.get("destinationInventory"):
        raise Refusal("pre-switch digest mismatch")
    source_backup = logical.with_name(f".{logical.name}.migration-source-{token}")
    if source_backup.exists() or workspace_manifest_path(args.namespace, args.identifier).exists():
        raise Refusal("switch destination or managed manifest already exists")
    os.rename(logical, source_backup)
    logical.mkdir(mode=stat.S_IMODE(source_backup.stat().st_mode))
    try:
        run_checked(["mount", "--bind", str(backing), str(logical)])
        if logical.stat().st_dev != backing.stat().st_dev or logical.stat().st_ino != backing.stat().st_ino:
            raise Refusal("bind readback inode mismatch")
        if tree_inventory(logical) != payload.get("destinationInventory"):
            raise Refusal("post-switch readback digest mismatch")
        runtime_proof = runtime_readback(args.namespace, logical)
        write_workspace_manifest(args.namespace, args.identifier, logical, backing, bucket)
    except Exception:
        subprocess.run(["umount", str(logical)], capture_output=True, check=False)
        workspace_manifest_path(args.namespace, args.identifier).unlink(missing_ok=True)
        marker_path(args.namespace, args.identifier).unlink(missing_ok=True)
        if logical.exists() and not any(logical.iterdir()):
            logical.rmdir()
        if not logical.exists():
            os.rename(source_backup, logical)
        raise
    payload.update({"stage": "switched", "sourceBackup": str(source_backup), "switchBootId": boot_id(), "switchedAt": int(time.time()), "runtimeReadback": runtime_proof})
    atomic_json(state_file, payload)
    payload["receipt"] = str(durable_receipt(payload))
    return payload


def readback_stage(args: argparse.Namespace, logical: Path, backing: Path, token: str, state_file: Path) -> dict[str, object]:
    require_apply(args, token)
    payload = read_state(state_file)
    if payload.get("stage") not in ("switched", "boot_verified"):
        raise Refusal("readback requires switched state")
    if qualification_receipt_digest(args) != payload.get("qualificationOwnerReceiptDigest"):
        raise Refusal("qualification owner receipt changed before readback")
    if boot_id() == payload.get("switchBootId"):
        raise Refusal("boot proof requires a later boot")
    if logical.stat().st_dev != backing.stat().st_dev or logical.stat().st_ino != backing.stat().st_ino:
        raise Refusal("restored bind mount inode mismatch")
    if tree_inventory(logical) != payload.get("destinationInventory"):
        raise Refusal("restored tree digest mismatch")
    if runtime_readback(args.namespace, logical) != payload.get("runtimeReadback"):
        raise Refusal("restored runtime readback mismatch")
    assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    source_backup = Path(str(payload.get("sourceBackup", "")))
    cleanup_token = hashlib.sha256(f"cleanup\0{token}\0{source_backup}".encode()).hexdigest()[:24]
    payload.update({"stage": "boot_verified", "bootVerifiedAt": int(time.time()), "bootVerifiedId": boot_id(), "cleanupToken": cleanup_token})
    atomic_json(state_file, payload)
    payload["receipt"] = str(durable_receipt(payload))
    return payload


def rollback_stage(args: argparse.Namespace, logical: Path, backing: Path, token: str, state_file: Path) -> dict[str, object]:
    require_apply(args, token)
    payload = read_state(state_file)
    source_backup = Path(str(payload.get("sourceBackup", "")))
    if payload.get("stage") not in ("switched", "boot_verified") or not source_backup.is_dir():
        raise Refusal("rollback source is unavailable")
    if qualification_receipt_digest(args) != payload.get("qualificationOwnerReceiptDigest"):
        raise Refusal("qualification owner receipt changed before rollback")
    assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    run_checked(["umount", str(logical)])
    if any(logical.iterdir()):
        raise Refusal("rollback logical mountpoint is not empty")
    logical.rmdir()
    os.rename(source_backup, logical)
    workspace_manifest_path(args.namespace, args.identifier).unlink(missing_ok=True)
    marker_path(args.namespace, args.identifier).unlink(missing_ok=True)
    payload.update({"stage": "rolled_back", "rolledBackAt": int(time.time())})
    atomic_json(state_file, payload)
    payload["receipt"] = str(durable_receipt(payload))
    return payload


def cleanup_stage(args: argparse.Namespace, logical: Path, backing: Path, token: str, state_file: Path) -> dict[str, object]:
    require_apply(args, token)
    payload = read_state(state_file)
    source_backup = Path(str(payload.get("sourceBackup", "")))
    verified_at = int(payload.get("bootVerifiedAt", 0))
    if payload.get("stage") != "boot_verified" or not source_backup.is_dir():
        raise Refusal("cleanup requires boot-verified retained source")
    if qualification_receipt_digest(args) != payload.get("qualificationOwnerReceiptDigest"):
        raise Refusal("qualification owner receipt changed before cleanup")
    if int(time.time()) - verified_at < args.retention_seconds:
        raise Refusal("cleanup retention delay has not elapsed")
    if args.cleanup_token != hashlib.sha256(f"cleanup\0{token}\0{source_backup}".encode()).hexdigest()[:24]:
        raise Refusal("cleanup requires the candidate-specific cleanup token")
    assert_inactive_twice(args.namespace, args.identifier, logical, backing, args.api_url, args.probe_pause_seconds)
    source_real = str(source_backup.resolve())
    for line in Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if len(fields) > 4:
            mountpoint = fields[4].replace("\\040", " ")
            if mountpoint == source_real or mountpoint.startswith(source_real + "/"):
                raise Refusal("cleanup source contains a mountpoint")
    shutil.rmtree(source_backup)
    payload.update({"stage": "source_cleaned", "sourceCleanedAt": int(time.time())})
    atomic_json(state_file, payload)
    payload["receipt"] = str(durable_receipt(payload))
    return payload


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=("plan", "copy", "switch", "readback", "rollback", "cleanup"))
    parser.add_argument("namespace", choices=tuple(ROOTS))
    parser.add_argument("identifier")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--authorization-token", default="")
    parser.add_argument("--cleanup-token", default="")
    parser.add_argument("--qualification-owner-receipt", default="")
    parser.add_argument("--api-url", default=API_URL)
    parser.add_argument("--probe-pause-seconds", type=float, default=2.0)
    parser.add_argument("--retention-seconds", type=int, default=86400)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        logical, backing, bucket = candidate(args.namespace, args.identifier)
        token = authorization_token(args.namespace, args.identifier, logical, backing)
        state_file = state_path(args.namespace, args.identifier)
        lock_path = Path("/run/lock") / f"gem-workspace-migrate-{args.namespace}-{args.identifier}.lock"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        STORAGE_LOCK.parent.mkdir(parents=True, exist_ok=True)
        with STORAGE_LOCK.open("w", encoding="utf-8") as storage_lock, lock_path.open("w", encoding="utf-8") as lock:
            fcntl.flock(storage_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.stage == "plan":
                payload = plan(args, logical, backing, bucket, token)
            elif args.stage == "copy":
                payload = copy_stage(args, logical, backing, bucket, token, state_file)
            elif args.stage == "switch":
                payload = switch_stage(args, logical, backing, bucket, token, state_file)
            elif args.stage == "readback":
                payload = readback_stage(args, logical, backing, token, state_file)
            elif args.stage == "rollback":
                payload = rollback_stage(args, logical, backing, token, state_file)
            else:
                payload = cleanup_stage(args, logical, backing, token, state_file)
        print(json.dumps(payload, sort_keys=True))
        return 0
    except (OSError, Refusal, urllib.error.URLError) as error:
        print(f"refused: {error}", file=sys.stderr)
        return 78


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

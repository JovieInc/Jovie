#!/usr/bin/env python3
"""Recompute the grok proof-seat row after the live-principal identity change.

Dry-run unless --write. --write copies the context to a sibling backup, then
replaces it atomically as mode 0600. The grok CLI auth file is never written.
Kimi and other non-grok rows keep their existing profile hashes.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import symphony_proof_context as trust


def _backup(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = path.with_name(f"{path.name}.bak-grok-reenroll-{stamp}")
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(path.read_bytes())
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        os.unlink(dest)
        raise
    return dest


def _atomic_write(path: Path, payload: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    os.chmod(path, 0o600)


def reenroll(context_path: Path, codex: Path | None, *, write: bool) -> dict:
    if context_path.is_symlink():
        raise ValueError("untrusted proof context")
    original = trust.private_json(context_path)
    if not isinstance(original, dict):
        raise ValueError("context must be an object")
    accounts = original.get("accounts")
    if not isinstance(accounts, list):
        raise ValueError("missing enrollment")
    indexes = [
        index for index, row in enumerate(accounts)
        if isinstance(row, dict) and row.get("provider") == "grok"
    ]
    if len(indexes) != 1:
        raise ValueError("expected exactly one grok enrollment")
    index = indexes[0]
    row = accounts[index]
    if not isinstance(row, dict) or not isinstance(row.get("accountPath"), str):
        raise ValueError("malformed grok enrollment")
    profile = trust.profile_identity(Path(row["accountPath"]))
    if codex is not None:
        codex_path = codex.expanduser()
    elif isinstance(original.get("codexPath"), str):
        codex_path = Path(original["codexPath"]).expanduser()
    else:
        raise ValueError("untrusted completion executable")
    if codex_path.is_symlink() or not codex_path.is_file():
        raise ValueError("untrusted completion executable")
    codex_sha = trust.digest(codex_path)
    new_row = dict(row)
    new_row["profile"] = profile
    new_accounts = []
    for item_index, item in enumerate(accounts):
        if item_index == index:
            new_accounts.append(new_row)
        elif isinstance(item, dict):
            new_accounts.append(dict(item))
        else:
            new_accounts.append(item)
    updated = dict(original)
    updated["accounts"] = new_accounts
    updated["codexPath"] = str(codex_path)
    updated["codexSha256"] = codex_sha
    report = {
        "backup": None,
        "codexChanged": original.get("codexPath") != str(codex_path) or original.get("codexSha256") != codex_sha,
        "codexPath": str(codex_path),
        "codexSha256": codex_sha,
        "dryRun": not write,
        "grok": new_row,
        "previousCodexPath": original.get("codexPath"),
        "previousCodexSha256": original.get("codexSha256"),
        "previousProfile": row.get("profile"),
        "profileChanged": row.get("profile") != profile,
        "wrote": False,
    }
    if not write:
        return report
    backup = _backup(context_path)
    _atomic_write(context_path, json.dumps(updated, indent=2, sort_keys=True) + "\n")
    report["backup"] = str(backup)
    report["dryRun"] = False
    report["wrote"] = True
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Recompute the grok proof-seat row. Dry-run unless --write.")
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--codex", type=Path)
    parser.add_argument("--write", action="store_true", help="backup, then atomically replace the context")
    args = parser.parse_args(argv)
    try:
        report = reenroll(args.context, args.codex, write=args.write)
    except (OSError, ValueError) as exc:
        print(f"reenroll_grok_proof_seat: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

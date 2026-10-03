#!/usr/bin/env python3
"""Derive a redacted capacity receipt from execution-proven useful turns.

Codex account directories are inventoried only as enrolled; this process never
reads credentials, refreshes OAuth, or probes a provider.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import tempfile
from datetime import datetime, timezone

from provider_useful_turns import build_capacity_receipt, profile_identity


DEFAULT_LEDGER = pathlib.Path(
    "/home/timwhite/gem-workspace/state/provider-useful-turns.jsonl"
)
DEFAULT_OUT = pathlib.Path("/home/timwhite/gem-workspace/state/concurrency.json")


def enrollment_inventory(root: pathlib.Path | None = None) -> dict[str, list[str]]:
    accounts_root = root or pathlib.Path(
        os.environ.get("CODEX_ACCOUNTS_ROOT", pathlib.Path.home() / ".codex-accounts")
    )
    try:
        enrolled = sorted(
            profile_identity("openai", path.name)
            for path in accounts_root.iterdir()
            if path.is_dir()
            and (path / "auth.json").is_file()
            and (path / "config.toml").is_file()
        )
    except OSError:
        enrolled = []
    return {"openai": enrolled}


def atomic_write(path: pathlib.Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ledger",
        type=pathlib.Path,
        default=pathlib.Path(os.environ.get("GEM_PROVIDER_TURN_LEDGER", DEFAULT_LEDGER)),
    )
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=pathlib.Path(os.environ.get("GEM_CONCURRENCY_EVIDENCE", DEFAULT_OUT)),
    )
    args = parser.parse_args()
    receipt = build_capacity_receipt(
        args.ledger, datetime.now(timezone.utc), enrollment_inventory()
    )
    atomic_write(args.out, receipt)
    print(
        json.dumps(
            {
                "schema": receipt["schema"],
                "source": receipt["source"],
                "observedAt": receipt["observedAt"],
                "target": receipt["target"],
                "approved": receipt["approved"],
                "acceptedSeats": receipt["ledger"]["acceptedSeats"],
                "rejectedRows": receipt["ledger"]["rejectedRows"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

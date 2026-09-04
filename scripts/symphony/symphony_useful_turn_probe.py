#!/usr/bin/env python3
"""On-demand authenticated computation probe. Does not enroll or recover accounts."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

from gem_gate_contract import V2_PROOF_SCHEMA, V2_PROOF_SOURCE
from symphony_proof_context import load_context, profile_identity


def produce(context_path: Path, account_path: Path, codex: Path, *, timeout: int = 30) -> dict:
    now = lambda: datetime.now(timezone.utc)
    context = load_context(now(), context_path)
    if codex.is_symlink() or codex.resolve() != context["codexPath"]:
        raise ValueError("completion executable not enrolled")
    rows = [r for r in context["accounts"] if Path(r["accountPath"]).resolve() == account_path.resolve()]
    if len(rows) != 1:
        raise ValueError("account not uniquely enrolled")
    row = rows[0]
    locks = account_path.parent / "locks"
    locks.mkdir(exist_ok=True)
    with (locks / f"{account_path.name}.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_path = account_path.parent / "state.json"
        state = json.loads(state_path.read_text())
        cooldown = (state.get("cooldowns") or {}).get(account_path.name, 0)
        if type(cooldown) is not int or cooldown > now().timestamp():
            raise ValueError("account cooling or state invalid")
        nonce = secrets.token_hex(32)
        numbers = [secrets.randbelow(10000) for _ in range(6)]
        expected = {"nonce": nonce, "sorted": sorted(numbers), "sum": sum(numbers)}
        env = os.environ.copy()
        env["CODEX_HOME"] = str(account_path.resolve())
        env["JOVIE_AGENT_PROFILE"] = "coder"
        prompt = f"Compute the sum and sorted ascending list of {numbers}. Return only JSON with keys nonce, sorted, sum; nonce must be {nonce}."
        with tempfile.TemporaryDirectory(prefix="symphony-useful-") as directory:
            output = Path(directory) / "completion.json"
            result = subprocess.run([str(context["codexPath"]), "exec", "--sandbox", "read-only", "--skip-git-repo-check",
                "--model", row["model"], "--config", f'model_provider="{row["provider"]}"',
                "--output-last-message", str(output), prompt], env=env, capture_output=True,
                timeout=timeout, check=False)
            raw = output.read_bytes() if output.is_file() else b""
            if result.returncode != 0 or not raw or json.loads(raw) != expected:
                raise ValueError("authenticated useful completion unproven")
        current = load_context(now(), context_path)
        if (current["runtime"] != context["runtime"] or current["runtimeGeneration"] != context["runtimeGeneration"] or current["codexSha256"] != context["codexSha256"] or current["accounts"] != context["accounts"]
            or profile_identity(account_path) != row["profile"]
            or json.loads(state_path.read_text()) != state):
            raise ValueError("binding or cooldown changed during probe")
        proof = {"accountStateSha256": row["accountStateSha256"], "runtimeGeneration": context["runtimeGeneration"], "codexSha256": context["codexSha256"], "schema": V2_PROOF_SCHEMA, "producer": V2_PROOF_SOURCE, "agentProfile": "coder",
            "probeId": nonce, "attested": True, "runtime": context["runtime"],
            "contractSha256": context["runtime"]["contractSha256"],
            "provider": row["provider"], "profile": row["profile"], "model": row["model"],
            "rc": 0, "useful": True, "completedAt": now().isoformat().replace("+00:00", "Z"),
            "outputDigest": hashlib.sha256(raw).hexdigest(), "outputBytes": len(raw), "outputTokens": 0}
        # Exclusive creation prevents replay/overwrite. Ledger rows alone have no authority.
        target = context["attestationDir"] / f"{nonce}.json"
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(proof, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        return proof


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--account", required=True, type=Path)
    parser.add_argument("--codex", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(produce(args.context, args.account, args.codex), sort_keys=True))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print("authenticated useful completion unproven", file=__import__("sys").stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Local projection of canonical execution facts; never execution authority."""
import fcntl
import json
import os
from pathlib import Path


def mirror_rows(text: str) -> list[dict]:
    """Drop only a torn final append; interior corruption still fails closed."""
    lines = text.split("\n")
    if lines[-1] == "":
        lines.pop()
    else:
        try:
            json.loads(lines[-1])
        except json.JSONDecodeError:
            lines.pop()
    return [json.loads(line) for line in lines if line]


def ends_open(path: Path) -> bool:
    if not path.exists() or not path.stat().st_size:
        return False
    with open(path, "rb") as handle:
        handle.seek(-1, os.SEEK_END)
        return handle.read(1) != b"\n"


def file_locked(path: Path, fn, read_rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(f"{path}.lock", "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        result, additions = fn(read_rows(path))
        if additions:
            if ends_open(path):
                data = path.read_bytes()
                path.write_bytes(data[:data.rfind(b"\n") + 1])
            with open(path, "a") as ledger:
                ledger.writelines(json.dumps(row, sort_keys=True) + "\n" for row in additions)
                ledger.flush()
                os.fsync(ledger.fileno())
        return result


def remember_stops(path: Path, rows: list[dict], terminal, read_rows) -> str | None:
    """Cache verified stops once. Cache failure cannot replace the canonical stop."""
    stops = [row for row in rows if row.get("terminalState") in terminal or row.get("event") == "completion_fenced"]

    def key(row):
        return json.dumps({name: value for name, value in row.items() if name != "_remote"}, sort_keys=True)

    def append_missing(local):
        seen = {key(row) for row in local}
        return None, [row for row in stops if key(row) not in seen]

    try:
        file_locked(path, append_missing, read_rows)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError) as error:
        return type(error).__name__
    return None

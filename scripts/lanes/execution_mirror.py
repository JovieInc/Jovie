"""Reconstruct capability checkpoints from the verified coordinator under its mirror lock."""
import json
from atomic_state import atomic_write_text


def mirror_capability_chain(select, locked, path, ident, canonical):
    if not any(row.get("event") == "capability_checkpoint" for row in canonical):
        return False
    ids = [row.get("_remote", {}).get("eventId") for row in canonical]
    if not all(ids) or len(ids) != len(set(ids)):
        raise RuntimeError("capability-mirror-canonical-order-unverified")
    def mirror(local):
        current = select(local, ident)
        current_ids = [row.get("_remote", {}).get("eventId") for row in current]
        if current_ids == ids[:len(current_ids)]:
            return None, canonical[len(current_ids):]
        if any(event_id not in ids for event_id in current_ids):
            raise RuntimeError("capability-mirror-ahead-of-readback")
        # A hole cannot be repaired by appending an older checkpoint after a newer one.
        # Under the existing mirror lock, replace only this identity with verified order.
        others = [row for row in local if row["identityDigest"] != ident["identityDigest"]]
        atomic_write_text(path, "".join(json.dumps(row, sort_keys=True) + "\n" for row in [*others, *canonical]), durable=True)
        return None, []
    locked(path, mirror)
    return True



def mirror_rows(text: str) -> list[dict]:
    """A crash or full disk can tear the last append. The local file mirrors the GitHub ledger,
    so a torn final line (no newline) is dropped, never fatal: one torn line failed every
    fix-red claim on Gem from 2026-10-26 07:30Z. Interior corruption still raises."""
    lines = text.split("\n")
    if lines[-1] == "": lines.pop()
    else:
        try: json.loads(lines[-1])
        except json.JSONDecodeError: lines.pop()
    return [json.loads(line) for line in lines if line]

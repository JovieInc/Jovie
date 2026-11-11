"""Existing account flocks plus durable remote occupancy, shared by local and cloud runs."""
import fcntl
import json
import os
import re
from pathlib import Path


def receipt(slot):
    if not slot.exists() or not slot.stat().st_size:
        return None
    text = slot.read_text()
    if not text.endswith("\n"):
        raise ValueError("occupancy-slot-torn")
    rows = [json.loads(line) for line in text.splitlines()]
    for row in rows:
        if (not isinstance(row, dict) or set(row) != {"journal", "reservation"} or
                not isinstance(row["journal"], str) or not Path(row["journal"]).is_absolute() or
                not isinstance(row["reservation"], str) or not re.fullmatch(r"[0-9a-f]{32}", row["reservation"])):
            raise ValueError("occupancy-slot-invalid")
    return rows[-1]


def bind(handle, journal, reservation):
    """Append custody to the existing flock inode before the journal/provider mutation.

    Missing or torn journal writes then leave the slot occupied across restart.
    Never replace/truncate this inode: inherited local leases must keep their lock.
    """
    handle.write(json.dumps({"journal": str(journal.resolve()), "reservation": reservation}) + "\n")
    handle.flush()
    os.fsync(handle.fileno())
    directory = os.open(Path(handle.name).parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def occupied(name, slot):
    from codex_cloud_occupancy import reservations
    import cloud_lane_state as journal
    try:
        pointer = receipt(slot)
        rows = reservations(journal.read(pointer["journal"] if pointer else None))
        if pointer:
            row = rows.get(pointer["reservation"])
            if not row or row["account"] != name or row["slot"] != slot.name:
                return True
        return any(row["account"] == name and row["slot"] == slot.name and row["phase"] != "completed"
                   for row in rows.values())
    except (OSError, ValueError, KeyError, TypeError):
        return True


def lease(lane, name):
    profile = lane.subscription_profiles()[name] if lane.subscription_pool_mode() else None
    if profile is not None:
        lane.update_state(lambda state: lane.bind_subscription_alias(state, name, profile))
    (lane.STATE.parent / "codex-locks").mkdir(parents=True, exist_ok=True)
    for path in lane._slot_paths(name):
        handle = open(path, "a")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            handle.close()
            continue
        if occupied(name, path):
            handle.close()
            continue
        if profile is not None:
            handle.subscription_name, handle.subscription_profile = name, profile
        return handle
    return None


def free_slots(lane, name):
    free = 0
    for path in lane._slot_paths(name):
        if occupied(name, path):
            continue
        if not path.exists():
            free += 1
            continue
        with path.open("a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                if not occupied(name, path):
                    free += 1
            except BlockingIOError:
                pass
    return free

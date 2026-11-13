"""Durable state persistence, preserving outbox denial history on corruption."""
import json
from pathlib import Path
from atomic_state import atomic_write_text


def read_state(path: Path, schema: str, *, strict=False) -> dict:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        return {"schema": schema}
    except (OSError, ValueError):
        if strict:
            raise ValueError("linear-outbox-unreadable-preserve-delivery-history") from None
        return {"schema": schema}
    if strict and (not isinstance(data, dict) or data.get("schema") != schema):
        raise ValueError("linear-outbox-schema-invalid-preserve-delivery-history")
    return data if isinstance(data, dict) and data.get("schema") == schema else {"schema": schema}


def write_state(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, json.dumps(data, separators=(",", ":")), durable=True)

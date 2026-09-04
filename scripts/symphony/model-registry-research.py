#!/usr/bin/env python3
"""Apply researched model prices, quality, and strengths to the live registry.

Snapshots are the only write path. A human or a harvest job records observed
prices and evals; this adapter validates the snapshot against the cost-routing
policy and applies the allowed fields. It never invents a ranking.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve()
_SPEC = importlib.util.spec_from_file_location("model_router", HERE.parent / "model-router.py")
model_router = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(model_router)

ALLOWED_UPDATE_FIELDS = (
    "list_price_in",
    "list_price_out",
    "quality",
    "strengths",
    "weaknesses",
    "capabilities",
    "sub_monthly_usd",
    "sub_included_multiplier",
    "notes",
)
SNAPSHOT_SCHEMA = "model-research/v1"


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_snapshot(path):
    payload = json.loads(pathlib.Path(path).read_text())
    if payload.get("schema") != SNAPSHOT_SCHEMA:
        raise ValueError("unsupported research snapshot schema")
    updates = payload.get("updates")
    if not isinstance(updates, list) or not updates:
        raise ValueError("snapshot updates missing")
    return payload


def apply_snapshot(registry, snapshot, now=None):
    models = {model["id"]: model for model in registry["models"]}
    applied = []
    rejected = []
    for update in snapshot["updates"]:
        if not isinstance(update, dict) or not isinstance(update.get("id"), str):
            rejected.append({"id": None, "reason": "malformed_update"})
            continue
        mid = update["id"]
        if mid not in models:
            rejected.append({"id": mid, "reason": "unknown_model"})
            continue
        if mid in model_router.FORBIDDEN_MODEL_IDS or "claude" in mid or "composer" in mid:
            rejected.append({"id": mid, "reason": "forbidden_model"})
            continue
        changes = {}
        for field in ALLOWED_UPDATE_FIELDS:
            if field not in update:
                continue
            value = update[field]
            if field in {"list_price_in", "list_price_out", "quality", "sub_monthly_usd", "sub_included_multiplier"}:
                if not isinstance(value, (int, float)) or value < 0:
                    rejected.append({"id": mid, "reason": f"invalid_{field}"})
                    break
            if field in {"strengths", "weaknesses", "capabilities"}:
                if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
                    rejected.append({"id": mid, "reason": f"invalid_{field}"})
                    break
            if field == "notes" and not isinstance(value, str):
                rejected.append({"id": mid, "reason": "invalid_notes"})
                break
            if models[mid].get(field) != value:
                changes[field] = value
        else:
            if changes:
                models[mid].update(changes)
                applied.append({"id": mid, "changes": sorted(changes)})
    if applied:
        registry["updated_at"] = (now or _now())[:10]
        registry["research_applied_at"] = now or _now()
        registry["research_source"] = snapshot.get("source")
    model_router.validate_registry(registry)
    return {"applied": applied, "rejected": rejected, "registry": registry}


def write_registry(path, registry):
    target = pathlib.Path(path)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(registry, indent=2) + "\n")
    tmp.replace(target)


def harvest_dir(directory):
    root = pathlib.Path(directory)
    snapshots = sorted(root.glob("*.json"))
    if not snapshots:
        raise ValueError(f"no research snapshots in {root}")
    return snapshots[-1]


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    validate = sub.add_parser("validate")
    validate.add_argument("--config")
    apply = sub.add_parser("apply")
    apply.add_argument("--snapshot", required=True)
    apply.add_argument("--config")
    apply.add_argument("--write", action="store_true")
    harvest = sub.add_parser("harvest")
    harvest.add_argument("--dir", required=True)
    harvest.add_argument("--config")
    harvest.add_argument("--write", action="store_true")
    args = ap.parse_args()
    if args.cmd == "validate":
        cfg, path = model_router.load(args.config)
        print(json.dumps({"ok": True, "config": str(path), "models": len(cfg["models"])}))
        return 0
    snapshot_path = args.snapshot if args.cmd == "apply" else harvest_dir(args.dir)
    snapshot = load_snapshot(snapshot_path)
    cfg, path = model_router.load(args.config)
    result = apply_snapshot(cfg, snapshot)
    if args.write:
        write_registry(path, result["registry"])
    print(json.dumps({
        "ok": True,
        "snapshot": str(snapshot_path),
        "source": snapshot.get("source"),
        "applied": result["applied"],
        "rejected": result["rejected"],
        "wrote": bool(args.write),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

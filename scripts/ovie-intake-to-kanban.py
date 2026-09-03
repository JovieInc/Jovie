#!/usr/bin/env python3
"""Land persisted Ovie receipts onto the Summer-owned Kanban.

Never creates Linear issues. Engineering receipts are left for Summer's Linear
intake and never copied into the operations Kanban. Receipt-only mode keeps
operations cards and last status while disabling downstream routing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


COMPANY_LANES = frozenset({"flash", "heavy"})
SHIPPING_LANES = frozenset({"engineering"})
PERSONAL_LANES = frozenset({"personal"})
TASTE_LANES = frozenset({"taste"})


def task_matches_ovie_item(task: dict[str, Any], work_id: str, key: str) -> bool:
    if task.get("created_by") != "ovie":
        return False
    return task.get("id") == work_id or task.get("idempotency_key") == key


def remove_legacy_shipping_task(tasks: list[dict[str, Any]], work_id: str, key: str) -> bool:
    kept = [task for task in tasks if not task_matches_ovie_item(task, work_id, key)]
    removed = len(kept) != len(tasks)
    tasks[:] = kept
    return removed


def load_board(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"owner": "summer", "tasks": []}
    with path.open(encoding="utf-8") as handle:
        board = json.load(handle)
    if not isinstance(board, dict):
        raise ValueError("kanban board must be an object")
    board.setdefault("owner", "summer")
    board.setdefault("tasks", [])
    if not isinstance(board["tasks"], list):
        raise ValueError("kanban tasks must be a list")
    return board


def load_pending(path: Path | None) -> list[dict[str, Any]]:
    raw = sys.stdin.read() if path is None else path.read_text(encoding="utf-8")
    payload = json.loads(raw)
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        items = payload.get("initiatives") or payload.get("items") or []
        return [item for item in items if isinstance(item, dict)]
    raise ValueError("pending payload must be an object or list")


def upsert_company_task(
    board: dict[str, Any], item: dict[str, Any], *, receipt_only: bool
) -> str:
    work_id = str(item.get("id") or item.get("workId") or "").strip()
    if not work_id:
        raise ValueError("pending item missing durable id")
    key = str(item.get("idempotency_key") or item.get("idempotencyKey") or f"ovie-{work_id}")
    lane = str(item.get("lane") or "")
    tasks: list[dict[str, Any]] = board["tasks"]
    if lane in PERSONAL_LANES or lane in TASTE_LANES:
        return "skipped-non-company"
    if lane in SHIPPING_LANES:
        if remove_legacy_shipping_task(tasks, work_id, key):
            return "removed-shipping-linear"
        return "skipped-shipping-linear"
    if lane not in COMPANY_LANES:
        return "skipped-non-company"

    existing = next(
        (task for task in tasks if task.get("id") == work_id or task.get("idempotency_key") == key),
        None,
    )
    status = "unavailable" if receipt_only else str(
        item.get("routingState") or item.get("status") or "queued"
    )
    card = {
        "id": work_id,
        "idempotency_key": key,
        "created_by": "ovie",
        "owner": "summer",
        "title": str(item.get("title") or item.get("text") or work_id)[:120],
        "lane": lane,
        "status": status,
        "linear": None,
    }
    if existing is None:
        tasks.append(card)
        return "inserted"
    existing.update(card)
    return "updated"


def land(pending: list[dict[str, Any]], board: dict[str, Any], *, receipt_only: bool) -> dict[str, Any]:
    results: list[dict[str, str]] = []
    for item in pending:
        action = upsert_company_task(board, item, receipt_only=receipt_only)
        results.append({"id": str(item.get("id") or ""), "action": action})
    return {
        "owner": "summer",
        "receipt_only": receipt_only,
        "created_linear": 0,
        "results": results,
        "tasks": board["tasks"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--board", type=Path, required=True)
    parser.add_argument("--pending", type=Path, default=None)
    parser.add_argument("--receipt-only", action="store_true")
    args = parser.parse_args(argv)

    pending = load_pending(args.pending)
    board = load_board(args.board)
    result = land(pending, board, receipt_only=args.receipt_only)
    args.board.parent.mkdir(parents=True, exist_ok=True)
    with args.board.open("w", encoding="utf-8") as handle:
        json.dump({"owner": "summer", "tasks": board["tasks"]}, handle, indent=2)
        handle.write("\n")
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

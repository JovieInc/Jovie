#!/usr/bin/env python3
"""Write a Gem independent-review receipt for the exact current main head.

The fleet gate requires `jovie-independent-review/v1` for promotion. This
writer is the Gem observer: it accepts a head only when Main Release Ready
completed successfully on that exact SHA, then writes the typed receipt the
gate already knows how to validate.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import importlib.util


def load_gate():
    gate_path = Path(__file__).resolve().with_name("gem-priority-gate.py")
    spec = importlib.util.spec_from_file_location("gem_priority_gate", gate_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load gem-priority-gate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    default_state = Path(
        os.environ.get(
            "GEM_PRIORITY_GATE_STATE_DIR",
            "/home/timwhite/gem-workspace/state/gem-priority-gate",
        )
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=os.environ.get("GEM_PRIORITY_GATE_REPO") or "JovieInc/Jovie")
    parser.add_argument(
        "--destination",
        type=Path,
        default=Path(
            os.environ.get("JOVIE_INDEPENDENT_REVIEW_RECEIPT")
            or default_state.parent / "independent-review.json"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    gate = load_gate()
    now = gate.utc_now()
    main_signal = gate.observe_main(args.repo)
    observed = gate.refresh_independent_review_receipt(args.destination, main_signal, now)
    result = {
        "written": bool(observed.get("accepted") and args.destination.exists()),
        "reason": observed.get("writeReason") or observed.get("reason"),
        "headSha": observed.get("headSha"),
        "reviewId": observed.get("reviewId"),
        "path": str(args.destination),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["written"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

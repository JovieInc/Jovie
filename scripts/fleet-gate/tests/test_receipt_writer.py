#!/usr/bin/env python3
"""Fleet Gate Refresh writes the canonical receipt only when the emitter is stale."""

from __future__ import annotations

import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/fleet-gate"))

import receipt_writer as writer  # noqa: E402

NOW = datetime(2026, 10, 13, 3, 0, tzinfo=timezone.utc)
WORKFLOW = ROOT / ".github/workflows/fleet-gate-refresh.yml"


class ReceiptWriterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.workspace = self.tmp.name
        self.canonical = writer.canonical_dir(self.workspace)
        self.canonical.mkdir(parents=True)
        self.fence = str(pathlib.Path(self.workspace, "state", writer.SCRATCH_DIR_NAME))

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_receipt(self, age_seconds: float, schema: str = writer.SCHEMA) -> None:
        observed = (NOW - timedelta(seconds=age_seconds)).isoformat().replace("+00:00", "Z")
        (self.canonical / "latest.json").write_text(
            json.dumps({"schema": schema, "observedAt": observed}), encoding="utf-8"
        )

    def test_fresh_emitter_receipt_keeps_refresh_in_its_fence(self) -> None:
        self.write_receipt(60)
        result = writer.choose(self.workspace, self.fence, NOW)
        self.assertEqual(result, {"mode": "emitter", "state_dir": self.fence, "age_seconds": "60"})

    def test_receipt_at_the_stale_bound_still_belongs_to_the_emitter(self) -> None:
        self.write_receipt(writer.STALE_AFTER_SECONDS)
        self.assertEqual(writer.choose(self.workspace, self.fence, NOW)["mode"], "emitter")

    def test_stale_receipt_makes_refresh_the_canonical_writer(self) -> None:
        self.write_receipt(writer.STALE_AFTER_SECONDS + 1)
        result = writer.choose(self.workspace, self.fence, NOW)
        self.assertEqual(result["mode"], "fallback")
        self.assertEqual(result["state_dir"], str(self.canonical))
        self.assertEqual(result["age_seconds"], str(writer.STALE_AFTER_SECONDS + 1))

    def test_missing_or_malformed_receipt_falls_back_to_canonical(self) -> None:
        self.assertEqual(writer.choose(self.workspace, self.fence, NOW)["mode"], "fallback")
        self.write_receipt(60, schema="other/v1")
        self.assertEqual(writer.choose(self.workspace, self.fence, NOW)["mode"], "fallback")
        (self.canonical / "latest.json").write_text("{not json", encoding="utf-8")
        self.assertEqual(writer.choose(self.workspace, self.fence, NOW)["age_seconds"], "unknown")
        self.write_receipt(-60)  # observedAt in the future is not trusted
        self.assertEqual(writer.choose(self.workspace, self.fence, NOW)["mode"], "fallback")

    def test_fresh_receipt_never_writes_canonical_even_when_unfenced(self) -> None:
        self.write_receipt(30)
        for fence in ("", str(self.canonical)):
            result = writer.choose(self.workspace, fence, NOW)
            self.assertEqual(result["mode"], "emitter")
            self.assertNotEqual(pathlib.Path(result["state_dir"]).resolve(), self.canonical.resolve())

    def test_main_prints_github_output_lines(self) -> None:
        self.write_receipt(10)
        out = io.StringIO()
        with redirect_stdout(out):
            writer.main({"GEM_WORKSPACE": self.workspace, "GEM_PRIORITY_GATE_STATE_DIR": self.fence}, NOW)
        self.assertEqual(out.getvalue().splitlines(), ["mode=emitter", f"state_dir={self.fence}", "age_seconds=10"])


class WorkflowWiringTests(unittest.TestCase):
    def test_refresh_persists_where_the_writer_choice_says(self) -> None:
        content = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("python3 scripts/fleet-gate/receipt_writer.py", content)
        self.assertIn("GEM_PRIORITY_GATE_STATE_DIR: ${{ steps.writer.outputs.state_dir }}", content)
        # The dead remediate hop (retired :4041 feed, 90 s timeout on every run) stays gone.
        self.assertNotIn("Remediate JOV backlog", content)
        self.assertNotIn('backlog-orchestrator.mjs" remediate', content)


if __name__ == "__main__":
    unittest.main()

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

    def test_fresh_receipt_snapshots_the_exact_bytes_for_stack_actions(self) -> None:
        self.write_receipt(45)
        snapshot_dir = pathlib.Path(self.workspace, "runner-temp")
        result = writer.choose(self.workspace, self.fence, NOW, str(snapshot_dir))
        self.assertEqual(result["mode"], "emitter")
        snapshot = pathlib.Path(result["receipt_path"])
        self.assertEqual(snapshot.parent, snapshot_dir)
        self.assertEqual(snapshot.read_text(encoding="utf-8"), (self.canonical / "latest.json").read_text(encoding="utf-8"))

    def test_stale_receipt_takes_no_snapshot(self) -> None:
        self.write_receipt(writer.STALE_AFTER_SECONDS + 60)
        result = writer.choose(self.workspace, self.fence, NOW, str(pathlib.Path(self.workspace, "runner-temp")))
        self.assertNotIn("receipt_path", result)

    def test_main_prints_github_output_lines(self) -> None:
        self.write_receipt(10)
        out = io.StringIO()
        with redirect_stdout(out):
            writer.main({"GEM_WORKSPACE": self.workspace, "GEM_PRIORITY_GATE_STATE_DIR": self.fence}, NOW)
        self.assertEqual(out.getvalue().splitlines(), ["mode=emitter", f"state_dir={self.fence}", "age_seconds=10"])


    def write_receipt_with_capacity(self, age_seconds: float, main_sha: str) -> None:
        observed = (NOW - timedelta(seconds=age_seconds)).isoformat().replace("+00:00", "Z")
        (self.canonical / "latest.json").write_text(
            json.dumps(
                {
                    "schema": writer.SCHEMA,
                    "observedAt": observed,
                    "capacity": {
                        "schema": "jovie-capacity-workpad/v1",
                        "selected": ["JOV-1", "JOV-2"],
                        "reason": "capacity-available",
                        "mainSha": main_sha,
                        "observedAt": observed,
                    },
                }
            ),
            encoding="utf-8",
        )

    def test_capacity_receipt_schema_carries_selected_and_main_sha(self) -> None:
        """The emitter-written receipt must carry the Linear backlog cohort
        (capacity.selected[], from backlog-remediation.mjs — NOT green-ready
        PRs) plus the mainSha it was computed against."""
        import importlib.util

        gate_path = ROOT / "scripts/fleet-gate/gem-priority-gate.py"
        spec = importlib.util.spec_from_file_location("gem_priority_gate", gate_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        def fake_run(command, **kwargs):
            class Result:
                returncode = 0
                stdout = json.dumps(
                    {
                        "cohort": {
                            "selected": [
                                {"identifier": "JOV-8001"},
                                {"identifier": "JOV-8002"},
                            ]
                        },
                        "capacity": {"reason": "capacity-available"},
                    }
                )
                stderr = ""

            return Result()

        observed = module.observe_capacity_workpad(
            runner=gate_path,  # any existing file; run is faked
            main_sha_value="a" * 40,
            run=fake_run,
        )
        self.assertEqual(observed["schema"], "jovie-capacity-workpad/v1")
        self.assertEqual(observed["selected"], ["JOV-8001", "JOV-8002"])
        self.assertEqual(observed["reason"], "capacity-available")
        self.assertEqual(observed["mainSha"], "a" * 40)
        self.assertEqual(observed["status"], "fresh")
        self.assertIsNone(observed["failureReason"])

    def test_capacity_receipt_fails_closed_when_the_runner_fails(self) -> None:
        import importlib.util

        gate_path = ROOT / "scripts/fleet-gate/gem-priority-gate.py"
        spec = importlib.util.spec_from_file_location("gem_priority_gate", gate_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class Result:
            returncode = 1
            stdout = ""
            stderr = "boom"

        observed = module.observe_capacity_workpad(
            runner=gate_path,
            main_sha_value="a" * 40,
            run=lambda command, **kwargs: Result(),
        )
        self.assertEqual(observed["selected"], [])
        self.assertEqual(observed["status"], "stale")
        self.assertEqual(observed["failureReason"], "capacity-workpad-runner-nonzero")

    def test_capacity_receipt_is_stale_when_main_sha_differs_from_tip(self) -> None:
        """The consumer marks the receipt STALE when mainSha != current tip."""
        tip = "b" * 40
        self.write_receipt_with_capacity(60, main_sha="a" * 40)
        stale = writer.capacity_receipt_stale(self.canonical / "latest.json", tip, NOW)
        self.assertIs(stale, True)

        self.write_receipt_with_capacity(60, main_sha=tip)
        fresh = writer.capacity_receipt_stale(self.canonical / "latest.json", tip, NOW)
        self.assertIs(fresh, False)

        # missing capacity block fails closed (None), never silently fresh
        self.write_receipt(60)
        self.assertIsNone(
            writer.capacity_receipt_stale(self.canonical / "latest.json", tip, NOW)
        )


def refresh_steps(content: str) -> list[str]:
    job = content.split("\n  refresh:\n", 1)[1].split("\n  assess:\n", 1)[0]
    return job.split("\n      - name: ")[1:]


class WorkflowWiringTests(unittest.TestCase):
    def test_fresh_receipt_makes_zero_gate_or_token_calls(self) -> None:
        """Every step that mints the Jovie Bot token or runs the gate is gated
        on the fallback choice, so a fresh emitter receipt spends no API calls."""
        steps = refresh_steps(WORKFLOW.read_text(encoding="utf-8"))
        callers = [
            step for step in steps
            if "evaluate-fleet-gate" in step or "create-github-app-token" in step
        ]
        self.assertEqual(len(callers), 2)
        for step in callers:
            condition = step.split("        if: ", 1)[1].split("\n", 1)[0]
            self.assertIn("steps.writer.outputs.mode == 'fallback'", condition, step.splitlines()[0])
        names = [step.splitlines()[0] for step in steps]
        writer_index = next(i for i, name in enumerate(names) if name.startswith("Choose receipt writer"))
        for step in callers:
            self.assertGreater(steps.index(step), writer_index)
        stack = next(step for step in steps if step.startswith("Persist stack policy repair actions"))
        self.assertIn("steps.writer.outputs.mode == 'emitter' && steps.writer.outputs.receipt_path != ''", stack)
        self.assertIn("steps.refresh.outputs.receipt_path || steps.writer.outputs.receipt_path", stack)

    def test_refresh_persists_where_the_writer_choice_says(self) -> None:
        content = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("python3 scripts/fleet-gate/receipt_writer.py", content)
        self.assertIn("GEM_PRIORITY_GATE_STATE_DIR: ${{ steps.writer.outputs.state_dir }}", content)
        # The dead remediate hop (retired :4041 feed, 90 s timeout on every run) stays gone.
        self.assertNotIn("Remediate JOV backlog", content)
        self.assertNotIn('backlog-orchestrator.mjs" remediate', content)


if __name__ == "__main__":
    unittest.main()

import importlib.util
import subprocess
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "mac_tick", Path(__file__).resolve().parents[1] / "mac-tick" / "mac_tick.py")
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)

T = lambda i, m=5: {"id": i, "everyMin": m, "argv": ["x"]}


class Result:
    def __init__(self, code):
        self.returncode = code


class MacTickTest(unittest.TestCase):
    def test_due_first_run_interval_and_jitter(self):
        self.assertTrue(mt.is_due(T("a"), {}, 0))
        self.assertTrue(mt.is_due(T("a"), {"a": {"lastRunAt": 0}}, 5 * 60 - 10))
        self.assertFalse(mt.is_due(T("a"), {"a": {"lastRunAt": 0}}, 3 * 60))

    def test_failing_task_is_recorded_and_does_not_stop_the_others(self):
        calls = []

        def run(argv, **kw):
            calls.append(argv[0])
            if argv[0] == "bad":
                raise OSError("boom")
            return Result(0)

        tasks = [{"id": "bad", "everyMin": 5, "argv": ["bad"]}, {"id": "good", "everyMin": 5, "argv": ["good"]}]
        state = mt.tick(tasks, {}, {}, 1000.0, run)
        self.assertEqual(calls, ["bad", "good"])
        self.assertEqual(state["bad"]["failures"], 1)
        self.assertIsNone(state["bad"]["lastOkAt"])
        self.assertEqual(state["good"]["lastOkAt"], 1000.0)

    def test_negative_control_silent_task_is_overdue_never_healthy(self):
        tasks = [T("a")]
        self.assertEqual(mt.overdue(tasks, {}, 0), ["a"], "never ran is overdue")
        state = {"a": {"lastOkAt": 0}}
        self.assertEqual(mt.overdue(tasks, state, 10 * 60), [])
        self.assertEqual(mt.overdue(tasks, state, 20 * 60), ["a"], "no success for 3 intervals")

    def test_ok_codes_treat_a_capacity_alarm_exit_as_a_successful_run(self):
        task = {"id": "c", "everyMin": 5, "argv": ["x"], "okCodes": [0, 2]}
        self.assertTrue(mt.run_task(task, {}, lambda *a, **k: Result(2))[0])
        self.assertFalse(mt.run_task(task, {}, lambda *a, **k: Result(1))[0])
        self.assertFalse(mt.run_task(T("a"), {}, lambda *a, **k: Result(2))[0])

    def test_timeout_counts_as_failure(self):
        def run(argv, **kw):
            raise subprocess.TimeoutExpired(argv, 1)

        ok, _ = mt.run_task(T("a"), {}, run)
        self.assertFalse(ok)

    def test_task_kill_switch_file_skips_the_task(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            switch = Path(d) / "disabled"
            task = {**T("a"), "disabledFile": "{state}/disabled"}
            ctx = {"state": d}
            ran = []
            run = lambda argv, **kw: ran.append(argv) or Result(0)
            self.assertFalse(mt.task_disabled(task, ctx))
            switch.touch()
            self.assertTrue(mt.task_disabled(task, ctx))
            state = mt.tick([task], {}, ctx, 1000.0, run)
            self.assertEqual(ran, [])
            self.assertEqual(state, {})

    def test_shipped_tasks_declare_switches_and_disk_guard_outlives_its_sweep(self):
        import json
        tasks = {t["id"]: t for t in json.loads(
            (Path(mt.__file__).with_name("tasks.json")).read_text())["tasks"]}
        self.assertIn("capacity/disabled", tasks["mac:capacity-collector"]["disabledFile"])
        self.assertIn("mac-disk-guard/disabled", tasks["mac:disk-guard"]["disabledFile"])
        # a low-disk sweep can run pnpm store prune (1800s) before it writes its ledger
        self.assertGreaterEqual(tasks["mac:disk-guard"]["timeoutS"], 2100)


if __name__ == "__main__":
    unittest.main()

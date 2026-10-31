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

    def test_timeout_counts_as_failure(self):
        def run(argv, **kw):
            raise subprocess.TimeoutExpired(argv, 1)

        ok, _ = mt.run_task(T("a"), {}, run)
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()

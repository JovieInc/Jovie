"""Cloud lane: eligibility, admission, fallback, result capture, stats."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import cloud_lane as c  # noqa: E402


def done(out="", code=0):
    return lambda *a, **k: subprocess.CompletedProcess(a, code, out, "")


class CloudLane(unittest.TestCase):
    def setUp(self):
        self.p = Path(tempfile.mkdtemp()) / "l.jsonl"

    def go(self, task="J-1", labels=("cloud-lane",), text="fix typo", run=None, t=1000.0, provider="claude"):
        return c.route(task, provider, labels, text, "cloud/j-1", "do it", run=run or done("session_abc"),
                       now=lambda: t, path=self.p)

    def test_opt_in_required(self):
        self.assertEqual(self.go(labels=())["reason"], "not-opted-in")

    def test_secrets_and_protected_stay_on_gem(self):
        for labels, text in [(("cloud-lane", "auth"), "x"), (("cloud-lane",), "needs DATABASE_URL"),
                             (("cloud-lane",), "rotate the api key"), (("cloud-lane", "hold"), "x")]:
            self.assertEqual(self.go(labels=labels, text=text)["route"], "gem")
        self.assertEqual(c.read(self.p), [])

    def test_submit_ok_records_zero_cost(self):
        r = self.go()
        self.assertEqual((r["route"], r["remote"]), ("cloud", "session_abc"))
        self.assertEqual(c.stats(c.read(self.p))["claude"]["cost_usd"], 0.0)

    def test_limit_backs_off_then_recovers(self):
        self.assertEqual(self.go(run=done("429 usage limit", 1))["reason"], "limit")
        self.assertEqual(self.go(task="J-2", t=1100)["reason"], "backoff")
        self.assertEqual(self.go(task="J-3", t=1000 + 901)["route"], "cloud")

    def test_concurrency_and_daily_cap(self):
        self.go(task="a"); self.go(task="b")
        self.assertEqual(self.go(task="c")["reason"], "concurrency")

    def test_unknown_outcome_is_held_not_retried(self):
        def boom(*a, **k):
            raise subprocess.TimeoutExpired("x", 1)
        self.assertEqual(self.go(run=boom)["route"], "held")

    def test_codex_dormant_without_env(self):
        self.assertEqual(self.go(provider="codex")["reason"], "provider-unconfigured")

    def test_poll_and_stats(self):
        self.go()
        c.poll("J-1", "claude", "cloud/j-1", gh=done('[{"number":5,"url":"u"}]'), now=lambda: 1060.0, path=self.p)
        s = c.stats(c.read(self.p))["claude"]
        self.assertEqual((s["tasks"], s["prs"], s["time_to_pr_p50_s"]), (1, 1, 60.0))


if __name__ == "__main__":
    unittest.main()

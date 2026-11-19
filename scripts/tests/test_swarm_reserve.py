"""Reserve-then-admit: N parallel selectors can never admit more model spend than the daily cap."""
import os
import sys
import threading
import types
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "swarm"), str(HERE.parent), str(HERE.parent / "lanes")]
for name, attrs in (("fix_red_classes", {"AGENT": "agent", "RERUN": "rerun", "RENUMBER": "renumber",
                                         "REGISTER_DOMAIN": "register-domain", "BIOME_FORMAT": "biome",
                                         "WIRE_CI_FAST": "wire-ci-fast", "classify": None,
                                         "owner_handoff_reason": lambda cls: None}), ("model_pool_calls", {"request_refusal": lambda *a, **k: None}),
                    ("apiclient", {}), ("apiclient.gh", {"run_gh": None})):
    try:
        __import__(name)
    except ImportError:
        sys.modules[name] = types.SimpleNamespace(**attrs)
import pr_remediation_swarm as sw  # noqa: E402


class FakeIssue:
    """Comments on the ledger issue with GitHub's monotonically increasing ids; thread-safe."""

    def __init__(self, rows=()):
        self.lock, self.rows, self.next = threading.Lock(), [], 1000
        for body in rows:
            self.post(body)

    def post(self, body):
        with self.lock:
            self.next += 1
            self.rows.append({"id": self.next, "body": body, "user": {"login": sw.LEDGER_AUTHOR}})

    def gh(self, args, **_kw):
        if "-f" in args:
            self.post(args[args.index("-f") + 1][len("body="):])
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    def gh_json(self, args, **_kw):
        with self.lock:
            return list(self.rows) if "page=1&" in args[1] else []


class ReserveThenAdmit(unittest.TestCase):
    def setUp(self):
        self.today = sw.iso()

    def _run(self, issue, runs, cents, cap_cents, barrier=True):
        results = {}
        gate = threading.Barrier(len(runs)) if barrier else None

        def one(run):
            if gate:
                gate.wait()  # every selector read "spent" before anyone wrote: the bypass on main
            results[run] = sw.reserve("1", run, cents, cap_cents)
        with mock.patch.object(sw, "gh", issue.gh), mock.patch.object(sw, "gh_json", issue.gh_json):
            ts = [threading.Thread(target=one, args=(r,)) for r in runs]
            [t.start() for t in ts]
            [t.join() for t in ts]
        return results

    def test_fifty_parallel_runs_admit_at_most_the_cap(self):
        issue = FakeIssue()
        res = self._run(issue, [str(i) for i in range(50)], cents=10, cap_cents=500)
        self.assertEqual(sum(res.values()), 50)  # 50 x 10c = exactly the $5 cap
        res2 = self._run(issue, [str(i) for i in range(50, 60)], cents=10, cap_cents=500)
        self.assertEqual(sum(res2.values()), 0, "the 51st+ attempts are refused")

    def test_prior_spend_counts_and_final_rows_replace_reservations(self):
        issue = FakeIssue([f"🤖 swarm-ledger run=7 cents=40 at={self.today} kind=reserve",
                           f"🤖 swarm-ledger run=7 cents=3 at={self.today}",
                           f"🤖 swarm-ledger run=8 cents=490 at={self.today}"])
        with mock.patch.object(sw, "gh_json", issue.gh_json):
            self.assertEqual(sw.day_spend_cents("1"), 493)
        res = self._run(issue, ["9"], cents=10, cap_cents=500, barrier=False)
        self.assertFalse(res["9"], "493 + 10 > 500")

    def test_unwritable_ledger_admits_nothing(self):
        issue = FakeIssue()
        with mock.patch.object(sw, "gh", lambda *a, **k: types.SimpleNamespace(returncode=1)), \
                mock.patch.object(sw, "gh_json", issue.gh_json):
            self.assertFalse(sw.reserve("1", "1", 10, 500))


if __name__ == "__main__":
    unittest.main()

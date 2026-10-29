"""Deploy-health loop (Jovie + LogYourBody): deliberate-red cases and a replay of the real LogYourBody history."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deploy_health as dh  # noqa: E402
import doctor  # noqa: E402

LYB = "JovieInc/LogYourBody"
# Real LogYourBody `deploy.yml` runs on main, newest first (created_at, conclusion), read 2026-10-25T06:40Z.
# 15 consecutive failures from 2026-10-23T16:14:55Z; last success 2026-10-23T16:03:00Z.
LYB_HISTORY = [
    ("2026-10-25T06:32:38Z", "failure"),
    ("2026-10-25T04:49:54Z", "failure"),
    ("2026-10-25T02:51:31Z", "failure"),
    ("2026-10-25T01:23:37Z", "failure"),
    ("2026-10-25T01:05:03Z", "failure"),
    ("2026-10-24T16:03:57Z", "failure"),
    ("2026-10-24T08:35:47Z", "failure"),
    ("2026-10-23T23:31:35Z", "failure"),
    ("2026-10-23T23:15:04Z", "failure"),
    ("2026-10-23T22:45:36Z", "failure"),
    ("2026-10-23T21:36:14Z", "failure"),
    ("2026-10-23T20:28:13Z", "failure"),
    ("2026-10-23T19:07:41Z", "failure"),
    ("2026-10-23T17:00:31Z", "failure"),
    ("2026-10-23T16:14:55Z", "failure"),
    ("2026-10-23T16:03:00Z", "success"),
    ("2026-10-23T15:56:47Z", "success"),
    ("2026-10-23T15:44:34Z", "success"),
    ("2026-10-23T15:24:10Z", "success"),
    ("2026-10-23T04:33:16Z", "success"),
    ("2026-10-23T02:21:02Z", "success"),
    ("2026-10-23T00:40:49Z", "success"),
    ("2026-10-22T21:34:40Z", "success"),
    ("2026-10-22T20:43:23Z", "success"),
    ("2026-10-22T20:08:39Z", "success"),
    ("2026-10-22T19:54:31Z", "success"),
    ("2026-10-22T19:40:38Z", "success"),
    ("2026-10-22T17:53:43Z", "success"),
    ("2026-10-22T04:51:46Z", "success"),
    ("2026-10-22T03:27:42Z", "success"),
    ("2026-10-21T23:36:01Z", "success"),
    ("2026-10-21T20:48:32Z", "success"),
    ("2026-10-21T15:30:27Z", "success"),
    ("2026-10-21T05:15:49Z", "success"),
    ("2026-10-21T03:45:52Z", "success"),
    ("2026-10-21T03:45:35Z", "success"),
    ("2026-10-21T03:04:04Z", "success"),
    ("2026-10-21T02:57:45Z", "success"),
    ("2026-10-21T02:52:10Z", "success"),
    ("2026-10-21T02:50:48Z", "success"),
    ("2026-10-21T02:46:17Z", "cancelled"),
    ("2026-10-21T02:45:45Z", "success"),
    ("2026-10-21T02:42:19Z", "cancelled"),
    ("2026-10-21T02:40:38Z", "success"),
    ("2026-10-21T02:28:21Z", "success"),
    ("2026-10-20T20:46:36Z", "success"),
    ("2026-10-19T12:17:30Z", "success"),
    ("2026-10-19T09:35:55Z", "success"),
    ("2026-10-19T09:16:44Z", "success"),
    ("2026-10-18T23:50:09Z", "success"),
    ("2026-10-18T11:05:02Z", "success"),
    ("2026-10-18T01:22:17Z", "success"),
    ("2026-10-17T05:01:24Z", "success"),
    ("2026-10-17T04:47:17Z", "success"),
    ("2026-10-17T04:03:37Z", "success"),
    ("2026-10-17T03:27:59Z", "success"),
    ("2026-10-17T03:08:54Z", "success"),
    ("2026-10-17T02:50:18Z", "success"),
    ("2026-10-17T02:28:27Z", "success"),
    ("2026-10-17T01:04:10Z", "success")
]


def epoch(text: str) -> float:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def runs_until(rows, now: float) -> list[dict]:
    return [{"created_at": created, "conclusion": conclusion, "head_sha": f"sha-{created}", "html_url": f"https://run/{created}"}
            for created, conclusion in rows if epoch(created) <= now]


def state_at(rows, now: float, compare=None) -> dict:
    return dh.evaluate(LYB, runs_until(rows, now), compare, now)


class RealLogYourBodyHistoryTest(unittest.TestCase):
    FIRST_FAILURE = "2026-10-23T16:14:55Z"

    def test_the_loop_raises_one_incident_at_the_first_failed_deploy_and_not_before(self):
        before = epoch(self.FIRST_FAILURE) - 1
        self.assertEqual(dh.judge({"observedAt": before, "repos": {LYB: state_at(LYB_HISTORY, before)}}, before), {})
        # Latency bound: a 5 min sample cache plus the 5 min doctor tick is the worst case after a run completes.
        self.assertLessEqual(dh.REFRESH_S + 300, 600)
        after = epoch(self.FIRST_FAILURE) + 1
        alerts = dh.judge({"observedAt": after, "repos": {LYB: state_at(LYB_HISTORY, after)}}, after)
        self.assertEqual(list(alerts), ["production-deploy:lyb"])
        self.assertIn("1 consecutive production deploy failure", alerts["production-deploy:lyb"])

    def test_the_incident_stays_one_key_for_all_fifteen_failures_and_names_the_streak(self):
        end = epoch("2026-10-25T06:40:00Z")
        state = state_at(LYB_HISTORY, end)
        self.assertEqual((state["status"], state["failedStreak"], state["failingSince"], state["lastSuccessAt"]),
                         ("failing", 15, self.FIRST_FAILURE, "2026-10-23T16:03:00Z"))
        alerts = dh.judge({"observedAt": end, "repos": {LYB: state}}, end)
        self.assertEqual(list(alerts), ["production-deploy:lyb"])
        self.assertIn("15 consecutive", alerts["production-deploy:lyb"])

    def test_the_next_successful_deploy_clears_it(self):
        end = epoch("2026-10-25T06:40:00Z")
        fixed = [("2026-10-25T06:50:00Z", "success"), *LYB_HISTORY]
        later = epoch("2026-10-25T06:51:00Z")
        state = state_at(fixed, later)
        self.assertEqual((state["status"], state["failedStreak"]), ("ok", 0))
        self.assertEqual(dh.judge({"observedAt": later, "repos": {LYB: state}}, later), {})

    def test_cancelled_runs_do_not_hide_or_reset_a_failure_streak(self):
        end = epoch("2026-10-25T06:40:00Z")
        with_cancel = [("2026-10-25T06:39:00Z", "cancelled"), *LYB_HISTORY]
        self.assertEqual(state_at(with_cancel, end)["failedStreak"], 15)


JOVIE = "JovieInc/Jovie"
# Real Jovie `production-controller.yml` runs on main, 2026-10-25 (created_at, conclusion). The 04:46:39Z failure was
# followed by no completed run until the queue behind it started at 06:36Z (production blocked by a visual-review
# failure counted as a journey failure).
JOVIE_HISTORY = [
    ("2026-10-25T04:46:39Z", "failure"),
    ("2026-10-25T04:39:57Z", "success"),
    ("2026-10-25T03:57:25Z", "success"),
    ("2026-10-25T03:17:43Z", "success"),
    ("2026-10-25T03:17:09Z", "success"),
    ("2026-10-25T03:16:34Z", "success"),
    ("2026-10-25T03:00:51Z", "success"),
]


class RealJovieControllerHistoryTest(unittest.TestCase):
    def state(self, at: str) -> dict:
        now = epoch(at)
        return dh.evaluate(JOVIE, runs_until(JOVIE_HISTORY, now), None, now)

    def test_the_production_controller_failure_raises_the_jovie_incident_and_it_persists_through_the_stall(self):
        quiet = epoch("2026-10-25T04:45:00Z")
        self.assertEqual(dh.judge({"observedAt": quiet, "repos": {JOVIE: self.state("2026-10-25T04:45:00Z")}}, quiet), {})
        for at in ("2026-10-25T04:47:00Z", "2026-10-25T05:41:00Z", "2026-10-25T06:40:00Z"):
            now = epoch(at)
            alerts = dh.judge({"observedAt": now, "repos": {JOVIE: self.state(at)}}, now)
            self.assertEqual(list(alerts), ["production-deploy:jovie"], at)
            self.assertIn("since 2026-10-25T04:46:39Z", alerts["production-deploy:jovie"])

    def test_measured_limits_are_per_repo(self):
        self.assertEqual((dh.REPOS[JOVIE]["behindCommits"], dh.REPOS[LYB]["behindCommits"]), (6, 5))


class LagTest(unittest.TestCase):
    NOW = epoch("2026-10-25T12:00:00Z")

    def sample(self, behind, oldest_age):
        compare = {"ahead_by": behind, "commits": [{"commit": {"committer": {"date": datetime.fromtimestamp(
            self.NOW - oldest_age, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}}}]}
        state = dh.evaluate(LYB, runs_until([("2026-10-25T11:00:00Z", "success")], self.NOW), compare, self.NOW)
        return {"observedAt": self.NOW, "repos": {LYB: state}}

    def test_more_than_the_commit_limit_or_two_hours_raises_the_same_key(self):
        quiet = dh.judge(self.sample(dh.REPOS[LYB]["behindCommits"], 600), self.NOW)
        self.assertEqual(quiet, {})
        spec = dh.REPOS[LYB]
        by_count = dh.judge(self.sample(spec["behindCommits"] + 1, 600), self.NOW)
        by_age = dh.judge(self.sample(2, spec["behindMaxAgeS"] + 60), self.NOW)
        self.assertEqual((list(by_count), list(by_age)), (["production-deploy:lyb"], ["production-deploy:lyb"]))
        self.assertIn("commits behind", by_count["production-deploy:lyb"])
        self.assertIn("min old", by_age["production-deploy:lyb"])

    def test_old_age_with_nothing_unshipped_is_not_lag(self):
        self.assertEqual(dh.judge(self.sample(0, dh.REPOS[LYB]["behindMaxAgeS"] + 600), self.NOW), {})


class SamplerTest(unittest.TestCase):
    def runner(self, rows, ahead=0, fail_for=None):
        calls = []
        def run(args, **_):
            path = args[1]
            calls.append(path)
            if fail_for and fail_for in path:
                return SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
            if "/compare/" in path:
                return SimpleNamespace(returncode=0, stdout=json.dumps({"ahead_by": ahead, "commits": []}), stderr="")
            return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": runs_until(rows, epoch("2026-10-25T06:40:00Z"))}), stderr="")
        return run, calls

    def test_deliberate_red_a_failing_deploy_raises_and_a_success_clears_through_the_tracker(self):
        now = epoch("2026-10-25T06:40:00Z")
        repos = {LYB: dh.REPOS[LYB]}
        with tempfile.TemporaryDirectory() as raw:
            run, calls = self.runner(LYB_HISTORY)
            data, error = dh.sample(Path(raw), now, run, repos)
            self.assertIsNone(error)
            alerts = dh.judge(data, now)
            self.assertEqual(list(alerts), ["production-deploy:lyb"])
            cached_calls = len(calls)
            dh.sample(Path(raw), now + 60, run, repos)
            self.assertEqual(len(calls), cached_calls, "five minute cache")

            opened, closed = [], []
            class Tracker:
                def open(self, key, text, condition=None):
                    opened.append(key)
                    return "issue-1"
                def close(self, issue_id, key=None):
                    closed.append(issue_id)
                    return True
                def reopen(self, *a, **k):
                    return True
            first = doctor.reconcile(alerts, {}, Tracker(), now)
            second = doctor.reconcile(alerts, first, Tracker(), now + 300)
            self.assertEqual(opened, ["production-deploy:lyb"], "one incident, deduped across ticks")
            fixed_rows = [("2026-10-25T06:50:00Z", "success"), *LYB_HISTORY]
            fixed_run, _ = self.runner(fixed_rows)
            later = epoch("2026-10-25T06:56:00Z")
            def fixed_run_later(args, **kw):
                result = fixed_run(args, **kw)
                if "/compare/" not in args[1]:
                    body = json.loads(result.stdout)
                    body["workflow_runs"] = runs_until(fixed_rows, later)
                    return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")
                return result
            data2, _ = dh.sample(Path(raw), later, fixed_run_later, repos)
            self.assertEqual(dh.judge(data2, later), {})
            doctor.reconcile(dh.judge(data2, later), second, Tracker(), later)
            self.assertEqual(closed, ["issue-1"], "the next successful deploy closes the incident")

    def test_an_unreadable_repo_keeps_its_last_failing_state_and_the_sample_goes_stale(self):
        now = epoch("2026-10-25T06:40:00Z")
        repos = {LYB: dh.REPOS[LYB]}
        with tempfile.TemporaryDirectory() as raw:
            run, _ = self.runner(LYB_HISTORY)
            dh.sample(Path(raw), now, run, repos)
            bad, _ = self.runner(LYB_HISTORY, fail_for="actions/workflows")
            data, error = dh.sample(Path(raw), now + 400, bad, repos)
            self.assertIn("502", error)
            self.assertEqual(dh.judge(data, now + 400)["production-deploy:lyb"][:20], "JovieInc/LogYourBody")
            stale = dh.judge(data, now + dh.STALE_S + 600)
            self.assertIn("deploy-health-stale", stale)

    def test_feed_block_is_the_tile_and_dead_man_source(self):
        now = epoch("2026-10-25T06:40:00Z")
        block = dh.feed_block({"observedAt": now, "repos": {LYB: state_at(LYB_HISTORY, now)}}, now)
        self.assertEqual((block["healthy"], block["repos"][LYB]["failedStreak"], block["observedAt"]), (False, 15, "2026-10-25T06:40:00Z"))
        self.assertIsNone(dh.feed_block(None, now))


if __name__ == "__main__":
    unittest.main()


class SupersessionStarvationAlarmTest(unittest.TestCase):
    """2026-10-29: production sat on 836f596a while superseded Production Controller runs concluded `success`."""

    NOW = epoch("2026-10-29T06:00:00Z")
    LIVE = "8" * 40
    SUPERSEDED = "6" * 40
    NEWER = "9" * 40

    def compare(self, behind, oldest_age, newest_age=None):
        stamp = lambda age: datetime.fromtimestamp(self.NOW - age, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
        commits = [{"commit": {"committer": {"date": stamp(oldest_age)}}}]
        if newest_age is not None:
            commits.append({"commit": {"committer": {"date": stamp(newest_age)}}})
        return {"ahead_by": behind, "commits": commits}

    def judge_jovie(self, behind, oldest_age, limit_commits=40, limit_age=6 * 3600):
        runs = [{"created_at": "2026-10-29T05:45:27Z", "conclusion": "success", "head_sha": self.SUPERSEDED}]
        state = {**dh.evaluate(JOVIE, runs, self.compare(behind, oldest_age), self.NOW),
                 "limitCommits": limit_commits, "limitAgeS": limit_age}
        return dh.judge({"observedAt": self.NOW, "repos": {JOVIE: state}}, self.NOW)

    def test_caps_page_at_sixty_minutes_or_fifteen_commits_even_when_measured_p95_drifted_higher(self):
        self.assertEqual(self.judge_jovie(5, 59 * 60), {})
        self.assertIn("16 commits behind main (limit 15)", self.judge_jovie(16, 600)["production-deploy:jovie"])
        self.assertIn("(limit 60)", self.judge_jovie(3, 61 * 60)["production-deploy:jovie"])

    def runner(self, calls):
        def run(args, **_):
            path = args[1]
            calls.append(path)
            if "/compare/" in path:
                base = path.split("/compare/")[1].split("...")[0]
                if base == self.LIVE and path.endswith("...main"):
                    body = self.compare(17, 70 * 60)
                elif path.endswith(f"...{self.LIVE}"):
                    body = self.compare(4, 50 * 60, newest_age=30 * 60)
                else:
                    body = {"ahead_by": 0, "commits": []}
                return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")
            runs = [{"id": 2, "created_at": "2026-10-29T05:45:27Z", "updated_at": "2026-10-29T05:47:24Z",
                     "conclusion": "success", "head_sha": self.SUPERSEDED}]
            return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": runs}), stderr="")
        return run

    def test_deliberate_red_measures_from_the_served_sha_not_the_last_green_controller_run(self):
        repos = {JOVIE: dh.REPOS[JOVIE]}
        with tempfile.TemporaryDirectory() as raw:
            calls = []
            # Old behaviour: the superseded `success` run reads as current production; nothing alarms.
            blind, _ = dh.sample(Path(raw), self.NOW, self.runner(calls), repos, build_info=lambda url: None)
            self.assertEqual(blind["repos"][JOVIE]["measuredFrom"], "controller-run")
            self.assertEqual(dh.judge(blind, self.NOW), {})
        with tempfile.TemporaryDirectory() as raw:
            calls = []
            live = {"sha": self.LIVE, "deployedAt": self.NOW - 3600}
            data, error = dh.sample(Path(raw), self.NOW, self.runner(calls), repos, build_info=lambda url: live)
            self.assertIsNone(error)
            self.assertIn(f"repos/{JOVIE}/compare/{self.LIVE}...main", calls)
            alert = dh.judge(data, self.NOW)["production-deploy:jovie"]
            self.assertIn("17 commits behind main", alert)
            self.assertIn("70 min old (limit 60)", alert)

    def test_each_release_records_merge_to_production_lead_time_into_the_stage_feed(self):
        import stage_timings
        repos = {JOVIE: dh.REPOS[JOVIE]}
        with tempfile.TemporaryDirectory() as raw:
            calls = []
            old = {"sha": self.SUPERSEDED, "deployedAt": self.NOW - 7200}
            dh.sample(Path(raw), self.NOW - 600, self.runner(calls), repos, build_info=lambda url: old)
            new = {"sha": self.LIVE, "deployedAt": self.NOW - 60}
            data, error = dh.sample(Path(raw), self.NOW, self.runner(calls), repos, build_info=lambda url: new)
            self.assertIsNone(error)
            self.assertIn(f"repos/{JOVIE}/compare/{self.SUPERSEDED}...{self.LIVE}", calls)
            lead = data["lag"][JOVIE]["releaseLeadTime"]
            self.assertEqual((lead["n"], lead["p50Min"], lead["oldestP50Min"]), (1, 29, 49))
            stage = stage_timings.compute(raw, self.NOW)["stages"][stage_timings.RELEASE_STAGE]
            self.assertEqual((stage["count"], stage["p50S"]), (1, 1740.0))

    def test_unreadable_build_info_is_none_not_a_guess(self):
        class Body:
            def __init__(self, text):
                self.text = text
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
            def read(self, _n):
                return self.text
        good = json.dumps({"commitSha": self.LIVE, "deployedAt": 1793253557390}).encode()
        self.assertEqual(dh.read_build_info("https://jov.ie/x", opener=lambda r, timeout: Body(good)),
                         {"sha": self.LIVE, "deployedAt": 1793253557.39})
        self.assertIsNone(dh.read_build_info("https://jov.ie/x", opener=lambda r, timeout: Body(b'{"commitSha":"main"}')))
        def boom(r, timeout):
            raise OSError("down")
        self.assertIsNone(dh.read_build_info("https://jov.ie/x", opener=boom))

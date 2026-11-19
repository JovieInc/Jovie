"""Router behavior against a fake GitHub: which worker gets the red event, and what it may do."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from noabandon import ledger as L  # noqa: E402
from noabandon import route as R  # noqa: E402

NOW = 1_795_110_000.0
HEAD = "00ea61c9e17d4ef47584af3d5df7781816370350"
REPO = "JovieInc/Jovie"


class FakeGH:
    def __init__(self, *, comments=(), jobs=(), notes=(), swarm_state="active", files=(), fail_writes=False):
        self.comments, self.jobs, self.notes = list(comments), list(jobs), list(notes)
        self.swarm_state, self.files, self.fail_writes, self.calls = swarm_state, list(files), fail_writes, []

    def __call__(self, args):
        self.calls.append(args)
        path = next((a for a in args if a.startswith("repos/")), "")
        if "-X" in args or path.endswith("/dispatches"):
            if self.fail_writes:
                return 1, ""
            if path.endswith("/comments") and "POST" in args:
                body = next(a[5:] for a in args if a.startswith("body="))
                self.comments.append({"id": 7, "body": body})
            return 0, "{}"
        if "/issues/" in path and path.split("?")[0].endswith("/comments"):
            return 0, json.dumps(self.comments)
        if "/jobs" in path:
            return 0, json.dumps({"jobs": self.jobs})
        if "/annotations" in path:
            return 0, json.dumps(self.notes)
        if "/actions/workflows/" in path:
            return 0, json.dumps({"state": self.swarm_state})
        if path.split("?")[0].endswith("/files"):
            return 0, json.dumps([{"filename": f} for f in self.files])
        return 1, ""

    def writes(self):
        return [a for a in self.calls if "-X" in a or any(x.endswith("/dispatches") for x in a)]


def event(**kw):
    base = {"repo": REPO, "pr": 25253, "head": HEAD, "branch": "codex/jov-1-x", "run_id": 11, "run_attempt": 1,
            "kind": "ci_red", "merge_base": "1813089c", "item": "JOV-1"}
    base.update(kw)
    return base


RED_JOB = [{"id": 5, "name": "Affected Unit Tests (4/4)", "conclusion": "failure", "html_url": "u"}]
RED_NOTE = [{"annotation_level": "failure", "message": "expected 1 to be 2"}]


class Routing(unittest.TestCase):
    def setUp(self):
        os.environ.pop("LINEAR_API_KEY", None)

    def test_first_red_goes_to_original_worker_via_linear(self):
        gh = FakeGH(jobs=RED_JOB, notes=RED_NOTE)
        r = R.route(event(), gh, now=NOW)
        self.assertEqual(r["lane"], "codex")
        self.assertEqual(r["delivery"], "linear")
        self.assertEqual(r["linear"], "skipped:no-key")  # reported, never silently "delivered"
        self.assertTrue(r["lease_written"])

    def test_holder_exhausted_goes_to_swarm_dispatch(self):
        lease = L.grant(None, lane="codex", worker_id="w", head=HEAD, now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        sig = L.signature("Affected Unit Tests (4/4)", "expected 1 to be 2", "1813089c")
        for _ in range(2):
            lease = L.record_attempt(lease, {"lane": "codex", "sig": sig, "head": HEAD, "outcome": "red", "at": NOW})
        gh = FakeGH(comments=[{"id": 3, "body": L.render_lease(lease)}], jobs=RED_JOB, notes=RED_NOTE)
        r = R.route(event(), gh, now=NOW)  # this red is codex's 3rd on (head, sig)
        self.assertEqual(r["lane"], "swarm")  # deterministic was n/a (not infra, not behind)
        self.assertTrue(any(a[1].endswith("/dispatches") for a in gh.writes()))

    def test_disabled_swarm_is_skipped_to_lanes(self):
        lease = L.grant(None, lane="codex", worker_id="w", head=HEAD, now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        lease, _ = L.release(lease, "quota", NOW, {})
        gh = FakeGH(comments=[{"id": 3, "body": L.render_lease(lease)}], jobs=RED_JOB, notes=RED_NOTE,
                    swarm_state="disabled_manually")
        r = R.route(event(), gh, now=NOW, cooldowns={"codex": NOW + 3600})
        self.assertEqual(r["lane"], "lanes")
        self.assertFalse(r["swarm_receiver_enabled"])
        self.assertFalse(any(a[1].endswith("/dispatches") for a in gh.writes()))

    def test_infra_red_gets_one_free_rerun(self):
        lease = L.grant(None, lane="codex", worker_id="w", head=HEAD, now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        lease, _ = L.release(lease, "gave_up", NOW, {})
        gh = FakeGH(comments=[{"id": 3, "body": L.render_lease(lease)}], jobs=RED_JOB,
                    notes=[{"annotation_level": "failure", "message": "The runner has received a shutdown signal"}])
        r = R.route(event(), gh, now=NOW)
        self.assertEqual(r["lane"], "deterministic")
        self.assertTrue(any("rerun-failed-jobs" in a[3] for a in gh.writes() if len(a) > 3))

    def test_workflow_paths_never_reach_swarm(self):
        lease = L.grant(None, lane="codex", worker_id="w", head=HEAD, now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        lease, _ = L.release(lease, "gave_up", NOW, {})
        gh = FakeGH(comments=[{"id": 3, "body": L.render_lease(lease)}], jobs=RED_JOB, notes=RED_NOTE,
                    files=[".github/workflows/ci.yml"])
        r = R.route(event(), gh, now=NOW)
        self.assertEqual(r["lane"], "lanes")

    def test_failed_lease_write_takes_no_action(self):  # S4: no lease, no fixer
        lease = L.grant(None, lane="codex", worker_id="w", head=HEAD, now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        lease, _ = L.release(lease, "gave_up", NOW, {})
        gh = FakeGH(comments=[{"id": 3, "body": L.render_lease(lease)}], jobs=RED_JOB, notes=RED_NOTE,
                    fail_writes=True)
        r = R.route(event(), gh, now=NOW)
        self.assertFalse(r["lease_written"])
        self.assertIsNone(r["acted"])

    def test_new_lease_is_labeled_once_for_the_relay_sweep(self):
        gh = FakeGH(jobs=RED_JOB, notes=RED_NOTE)
        first = R.route(event(), gh, now=NOW)
        self.assertTrue(first["labeled"])
        self.assertTrue(any("/labels" in " ".join(a) for a in gh.writes()))
        second = R.route(event(), gh, now=NOW + 60)  # same holder keeps the lease: no extra label call
        self.assertIsNone(second["labeled"])
        self.assertEqual(sum(1 for a in gh.writes() if "/labels" in " ".join(a)), 1)

    def test_kill_switch_makes_no_calls(self):
        os.environ["NOABANDON_ENABLED"] = "false"
        self.assertEqual(R.main(), 0)
        os.environ.pop("NOABANDON_ENABLED")

    def test_linear_delivery_reports_success(self):
        os.environ["LINEAR_API_KEY"] = "test-not-a-secret"
        try:
            self.assertEqual(R.notify("JOV-1", {"x": 1}, post=lambda d: {"data": {"commentCreate": {"success": True}}}), "ok")
            self.assertEqual(R.notify("repo#1", {"x": 1}, post=lambda d: {}), "skipped:no-item")
        finally:
            os.environ.pop("LINEAR_API_KEY")

    def test_item_key_from_title_or_branch(self):
        self.assertEqual(R.item_key("fix(x): y (JOV-13034)", ""), "JOV-13034")
        self.assertEqual(R.item_key("", "tim/jov-12739-symphony"), "JOV-12739")


if __name__ == "__main__":
    unittest.main()

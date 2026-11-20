"""Adapter behavior (PR-4b non-workflow halves) against fakes: dry-run by default, writes only on flag."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from noabandon import adapters as A  # noqa: E402
from noabandon import ledger as L  # noqa: E402

NOW = 1_795_110_000.0
H = 3600
REPO = "JovieInc/Jovie"


class FakeQL:
    """Records graphql traffic; answers from the query text so tests stay literal."""

    def __init__(self, issues=()):
        self.issues = dict(issues)  # title -> identifier
        self.calls = []

    def graphql(self, query, variables):
        self.calls.append((query, variables))
        if query.startswith("query($key:String!,$label"):
            return {"team": {"id": "team-1", "labels": {"nodes": [{"id": "label-1"}]}}}
        if query.startswith("query($team:String!,$title"):
            title = variables["title"]
            return {"issues": {"nodes": [{"id": f"uuid-{title}", "identifier": self.issues[title],
                                          "title": title}] if title in self.issues else []}}
        if query.startswith("query($id:String!){issue"):
            return {"issue": {"id": "uuid-x", "identifier": variables["id"], "state": {"name": "In Progress"}}}
        if query.startswith("mutation"):
            return {"issueCreate": {"issue": {"id": "uuid-new", "identifier": "JOV-999",
                                              "title": variables.get("title")}},
                    "commentCreate": {"success": True},
                    "issueUpdate": {"issue": {"id": "uuid-x", "identifier": "JOV-1"}}}
        if query.startswith("query($key:String!){team"):
            return {"team": {"states": {"nodes": [{"id": "st-done", "name": "Done", "type": "completed"},
                                                  {"id": "st-todo", "name": "Todo", "type": "unstarted"}]}}}
        raise AssertionError(f"unexpected query {query[:60]}")


class FakeGH:
    def __init__(self, search_items=(), pulls=()):
        self.search_items, self.pulls, self.calls = list(search_items), list(pulls), []

    def __call__(self, args):
        self.calls.append(args)
        path = next((a for a in args if a.startswith("repos/") or a.startswith("search/")), args[1] if len(args) > 1 else "")
        if "search/issues" in " ".join(args):
            import json
            return 0, json.dumps({"items": self.search_items})
        if "/commits/" in path and "/pulls" in path:
            import json
            return 0, json.dumps(self.pulls)
        if "/issues/" in path and path.split("?")[0].endswith("/comments"):
            import json
            return 0, json.dumps([{"id": 9, "body": self._lease_body()}] if self._lease_body() else [])
        return 0, "{}"

    def _lease_body(self):
        return getattr(self, "lease_body", None)


def dead_lease(item="JOV-1", pr=25253):
    lease = L.grant(None, lane="codex", worker_id="w", head="h", now=NOW - 72 * H, next_kind="ci_result",
                    item=item, pr=pr)
    return lease


def leased_pr(pr, item, lease):
    from noabandon import route as R
    return {"number": pr, "title": f"fix(x): y ({item})", "body": ""}, L.render_lease(lease)


class DryRun(unittest.TestCase):
    def setUp(self):
        os.environ.pop("NOABANDON_LINEAR_WRITES", None)

    def test_check_leased_dry_run_prints_and_never_mutates(self):
        lease = dead_lease()
        gh = FakeGH(search_items=[leased_pr(25253, "JOV-1", lease)[0]])
        gh.lease_body = L.render_lease(lease)
        ql = FakeQL()
        receipts = A.check_leased(gh, ql, REPO, now=NOW, dry_run=None)  # default env: dry-run
        self.assertEqual(receipts[0]["action"], "dry-run")
        self.assertEqual(receipts[0]["title"], "abandon:JOV-1")
        self.assertEqual(ql.calls, [])  # no Linear traffic at all in dry-run

    def test_writes_flag_turns_the_upsert_on(self):
        os.environ["NOABANDON_LINEAR_WRITES"] = "true"
        try:
            lease = dead_lease()
            gh = FakeGH(search_items=[leased_pr(25253, "JOV-1", lease)[0]])
            gh.lease_body = L.render_lease(lease)
            ql = FakeQL(issues={"abandon:JOV-1": "JOV-8800"})
            receipts = A.check_leased(gh, ql, REPO, now=NOW)
            self.assertEqual(receipts[0]["action"], "commented")
            self.assertEqual(receipts[0]["issue"], "JOV-8800")
        finally:
            os.environ.pop("NOABANDON_LINEAR_WRITES")

    def test_live_lease_produces_no_finding(self):
        lease = L.grant(None, lane="codex", worker_id="w", head="h", now=NOW - 60, next_kind="ci_result",
                        item="JOV-1", pr=25253)
        gh = FakeGH(search_items=[leased_pr(25253, "JOV-1", lease)[0]])
        gh.lease_body = L.render_lease(lease)
        self.assertEqual(A.check_leased(gh, FakeQL(), REPO, now=NOW), [])

    def test_shared_red_groups_open_one_fingerprint(self):
        sig = "s4"
        red_by_pr_prs = []
        for pr in (11, 12, 13):
            lease = dead_lease(pr=pr)
            lease = L.record_attempt(lease, {"lane": "codex", "sig": sig, "head": "h", "outcome": "red", "at": NOW})
            entry, body = leased_pr(pr, f"JOV-{pr}", lease)
            red_by_pr_prs.append((entry, body, L.render_lease(lease)))

        class ThreeGH(FakeGH):
            def __call__(self, args):
                if "search/issues" in " ".join(args):
                    import json
                    return 0, json.dumps({"items": [e for e, _, _ in red_by_pr_prs]})
                return FakeGH.__call__(self, args)

        gh = ThreeGH()
        gh.lease_body = None  # per-pr bodies below

        class PerPrGH(ThreeGH):
            def __call__(self, args):
                if "/issues/" in " ".join(args) and "/comments" in " ".join(args):
                    import json
                    pr = int(args[1].split("/issues/")[1].split("/")[0])
                    body = next(b for e, b, _ in red_by_pr_prs if e["number"] == pr)
                    return 0, json.dumps([{"id": 9, "body": body}])
                return ThreeGH.__call__(self, args)

        ql = FakeQL()
        receipts = A.shared_red_check(PerPrGH(), ql, REPO, dry_run=True)
        self.assertEqual([r["title"] for r in receipts], [f"shared-red:{sig}"])


class Verify(unittest.TestCase):
    def test_verify_dry_run_has_no_pr_note(self):
        gh = FakeGH(pulls=[])
        out = A.verify_from_merge(gh, FakeQL(), REPO, "abc", "success", dry_run=True)
        self.assertEqual(out["action"], "no-pr")

    def test_verify_success_posts_receipt(self):
        gh = FakeGH(pulls=[{"number": 7, "title": "fix(x): y (JOV-1)"}])
        ql = FakeQL()
        out = A.verify_from_merge(gh, ql, REPO, "abc", "success", dry_run=False)
        self.assertEqual(out["action"], "receipt-posted")
        self.assertEqual(out["verify"]["schema"], "noabandon.verified/v1")
        self.assertTrue(any("verify:JOV-1:abc" in str(v.get("title", "")) for _, v in ql.calls))


class Sweep(unittest.TestCase):
    def test_stale_in_progress_moves_to_todo_and_clears_claim(self):
        ql = FakeQL()
        rows = [{"issue": {"id": "JOV-8470", "state": "In Progress", "progress_at": NOW - 711 * H}, "pr": None}]
        out = A.sweep_reconcile(ql, rows, now=NOW, dry_run=False)
        self.assertEqual(out[0]["to"], "Todo")
        self.assertTrue(out[0]["clear_assignee"])
        moved = [(q, v) for q, v in ql.calls if q.startswith("mutation($id:String!,$state:String!)")]
        self.assertTrue(any(v.get("state") == "st-todo" for _, v in moved))

    def test_sweep_dry_run_moves_nothing(self):
        ql = FakeQL()
        rows = [{"issue": {"id": "JOV-8470", "state": "In Progress", "progress_at": NOW - 711 * H}, "pr": None}]
        out = A.sweep_reconcile(ql, rows, now=NOW, dry_run=True)
        self.assertEqual(out[0]["action"], "dry-run")
        self.assertEqual([c for c in ql.calls if c[0].startswith("mutation")], [])


if __name__ == "__main__":
    unittest.main()

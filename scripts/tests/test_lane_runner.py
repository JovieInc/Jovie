"""Regression tests for scripts/lanes/lane_runner.py (provider-agnostic shipping lanes).

Run with:
    python3 -m pytest scripts/tests/test_lane_runner.py -v
"""
from __future__ import annotations

import importlib.util
import concurrent.futures
import io
import signal
import shutil
import threading
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from email.message import EmailMessage
from unittest.mock import patch, Mock
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)

# Positive flow fixtures declare healthy capacity. Real low/critical admission
# remains exercised by the explicit free_pct overrides and test_disk_guard.py;
# these unit tests must neither depend on host capacity nor sweep host caches.
_disk_capacity_fixture = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
_devin_free_fixture = patch.object(lane.devin_free_policy, "admission_open", return_value=True)
def setUpModule():
    _disk_capacity_fixture.start()
    _devin_free_fixture.start()
def tearDownModule():
    _devin_free_fixture.stop()
    _disk_capacity_fixture.stop()


def issue(identifier="JOV-1", priority=2, created="2026-09-01T00:00:00Z", labels=()):
    # Distinct titles: identical titles are one unit of work (pool_rejections).
    return lane.Issue("id-" + identifier, identifier, f"Tab indicator collapses {identifier}", "body",
                      priority, created, list(labels))


def gate_proof(head, verdict="landing", sensitive=False):
    return {"schema": lane.GATE_RESULT_SCHEMA, "headSha": head, "verdict": verdict,
            "completedAt": lane.now_iso(), "policyDigest": lane.GATE_POLICY_DIGEST,
            "sensitive": sensitive, "reasons": []}


def publication_response(args):
    if len(args) > 1 and Path(args[1]).name == "source_admission.mjs":
        return json.dumps({"schema": "jovie-source-admission/v1", "allowed": True, "blockers": [],
                           "prNumber": int(args[-2]), "headSha": args[-1]})
    if "check-reenroll" in args:
        return json.dumps({"number": int(args[-1]), "reenrollable": True})
    return ""


class HostConfigurationTest(unittest.TestCase):
    def test_gate_timeout_defaults_to_one_hour_on_macos_only(self):
        for platform, expected in (("darwin", 3600), ("linux", 2400)):
            with self.subTest(platform=platform), patch.object(lane.sys, "platform", platform), \
                    patch.dict(os.environ, {}, clear=True):
                self.assertEqual(lane.Host().gate_timeout, expected)

    def test_gate_timeout_environment_override_wins_on_macos(self):
        with patch.object(lane.sys, "platform", "darwin"), \
                patch.dict(os.environ, {"LANES_GATE_TIMEOUT_S": "3000"}):
            self.assertEqual(lane.Host().gate_timeout, 3000)


def repair_target_page(pr, **overrides):
    checks = [{"__typename": "CheckRun", **check} for check in pr.get("statusCheckRollup", [])]
    live = {"state": "OPEN", "isDraft": False, "isCrossRepository": False, "isInMergeQueue": False,
            "mergeStateStatus": "BLOCKED", "reviewDecision": None,
            **pr, "labels": {"pageInfo": {"hasNextPage": False}, "nodes": pr.get("labels", [])},
            "commits": {"nodes": [{"commit": {"oid": pr["headRefOid"], "statusCheckRollup": {
                "contexts": {"pageInfo": {"hasNextPage": False}, "nodes": checks}}}}]}, **overrides}
    live.pop("statusCheckRollup", None)
    return {"data": {"repository": {"pullRequest": live}}}


class ContextManifestTest(unittest.TestCase):
    def test_repository_formatting_is_accepted_but_malformed_or_missing_contract_is_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "context-manifest.json"
            self.assertFalse(lane.context_manifest_matches(path))
            path.write_text(json.dumps(json.loads(lane.context_manifest_json()), separators=(",", ":")))
            self.assertTrue(lane.context_manifest_matches(path))
            path.write_text("not JSON")
            self.assertFalse(lane.context_manifest_matches(path))

    def test_manifest_binds_exact_prompt_and_inputs_without_copying_private_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "issue.prompt.md"
            inputs = {"issue": "private issue", "gbrain": "prior private decision", "branch": "devin/jov-1"}
            first = lane.write_agent_prompt(path, "exact prompt\n", "issue", "devin", inputs)
            body = Path(first["path"]).read_bytes()
            receipt = json.loads(body)
            self.assertEqual(path.read_text(), "exact prompt\n")
            self.assertEqual(receipt["prompt"]["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertNotIn(b"private", body)
            self.assertEqual(receipt["inputs"]["gbrain"]["sha256"], hashlib.sha256(inputs["gbrain"].encode()).hexdigest())
            self.assertEqual(receipt["inputs"]["gbrain"]["status"], "present")
            repeated = lane.write_agent_prompt(path, "exact prompt\n", "issue", "devin", inputs)
            self.assertEqual(first["sha256"], repeated["sha256"])
            self.assertTrue(first["qualification"]["ok"])
            self.assertEqual(first["qualification"]["mode"], "qualification-only")
            self.assertGreaterEqual(first["qualification"]["durationMs"], 0)
            self.assertEqual(body, Path(first["path"]).read_bytes())
            changed = lane.write_agent_prompt(path, "different prompt", "issue", "devin", inputs)
            self.assertNotEqual(first["sha256"], changed["sha256"])

    def test_missing_context_and_drift_are_explicit_nonblocking_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "issue.prompt.md"
            inputs = {"issue": "task", "gbrain": "", "branch": "codex/jov-1"}
            receipt = lane.write_agent_prompt(path, "prompt", "issue", "codex", inputs)
            self.assertEqual(json.loads(Path(receipt["path"]).read_text())["inputs"]["gbrain"]["status"], "unavailable")
            with patch.object(lane, "HERE", Path(tmp)):
                for contract in [None, '{}', 'malformed']:
                    if contract is not None:
                        (Path(tmp) / "context-manifest.json").write_text(contract)
                    drift = lane.write_agent_prompt(path, "still runs", "issue", "codex", inputs)
                    self.assertEqual(path.read_text(), "still runs")
                    self.assertFalse(drift["qualification"]["ok"])
                    self.assertIn("context-manifest-drift", drift["qualification"]["findings"][0])
                    self.assertIsNone(drift["path"])
                with patch.object(lane.sys.stderr, "write", side_effect=OSError("closed log")):
                    self.assertFalse(lane.write_agent_prompt(path, "still runs", "issue", "codex", inputs)["qualification"]["ok"])
            for kind, data in [("issue", {"gbrain": ""}), ("unknown", inputs),
                               ("issue", {**inputs, "issue": None})]:
                failed = lane.write_agent_prompt(path, "still runs", kind, "codex", data)
                self.assertFalse(failed["qualification"]["ok"])
                self.assertIsNone(failed["sha256"])

    def test_generator_does_not_load_credentials_or_query_services(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(lane, "HERE", Path(tmp)), \
                patch.object(lane, "load_github_env", side_effect=AssertionError("credential access")):
            self.assertEqual(lane.main(["context-manifest", "--write"]), 0)
            self.assertEqual(lane.main(["context-manifest"]), 0)
            (Path(tmp) / "context-manifest.json").write_text('{}')
            self.assertEqual(lane.main(["context-manifest"]), 1)


class SelectionTest(unittest.TestCase):
    def test_dispatch_next_precedes_aged_product_and_compounding_work(self):
        now = datetime(2026, 10, 5, tzinfo=timezone.utc).timestamp()
        target = issue("JOV-7896", priority=2, created="2026-10-05T00:00:00Z",
                       labels=["agent-ready", "dispatch-next"])
        target.title = "Repair account to claim conversion"
        old = issue("JOV-4258", priority=1, created="2026-09-01T00:00:00Z")
        old.title = "Strict typography audit"
        ci = issue("JOV-CI", priority=1, created="2026-09-01T00:00:00Z")
        ci.title = "Fix CI throughput"
        for pool in ([old, ci, target], [target, ci, old]):
            self.assertIs(lane.pick_issue(pool, {}, now=now), target)
        target.labels.remove("dispatch-next")
        self.assertIs(lane.pick_issue([old, ci, target], {}, now=now), ci)

    def test_dispatch_next_preserves_admission_and_lane_routing(self):
        now = 10000.0
        target = issue("JOV-PIN", labels=["agent-ready", "dispatch-next"])
        other = issue("JOV-OTHER", priority=1)
        for kwargs, failures in [
            ({"in_flight": frozenset({"jov-pin"})}, {}),
            ({"held_back": frozenset({"JOV-PIN"})}, {}),
            ({}, {"JOV-PIN": 3}),
            ({}, {"JOV-PIN": {"count": 1, "at": 9990}}),
        ]:
            with self.subTest(kwargs=kwargs, failures=failures):
                self.assertIs(lane.pick_issue([target, other], failures, now=now, **kwargs), other)
        for label in ("no-symphony", "type:epic", "auth"):
            target.labels = ["agent-ready", "dispatch-next", label]
            self.assertIs(lane.pick_issue([target, other], {}, now=now, provider="devin"), other)
        target.labels = ["agent-ready", "dispatch-next", "devin"]
        self.assertIs(lane.pick_issue([target, other], {}, now=now, provider="codex",
            route=lambda task: {"chosen": {"lane": "devin" if task is target else "codex"}}), other)

    def test_dispatch_next_without_pool_admission_keeps_default_order(self):
        unadmitted = issue("JOV-PIN", priority=4, labels=["dispatch-next"])
        urgent = issue("JOV-URGENT", priority=1)
        self.assertIs(lane.pick_issue([unadmitted, urgent], {}, now=10000), urgent)

    def test_rejection_reasons_match_final_worker_admission(self):
        red = issue("JOV-RED")
        red.title = "Rotate production credentials"
        failures = {"JOV-EXHAUSTED": 3, "JOV-BACKOFF": {"count": 1, "at": 9990}}
        cases = [(issue(labels=["Type:Epic"]), "excluded-label:type:epic"),
                 (red, "sensitive-text"), (issue(labels=["AUTH"]), "sensitive-provider"),
                 (issue("JOV-EXHAUSTED"), "retry-exhausted"),
                 (issue("JOV-BACKOFF"), "retry-backoff"),
                 (issue("JOV-OWNED"), "in-flight-pr"), (issue("JOV-GOOD"), None)]
        for task, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(lane.admission_rejection(task, failures, 10000,
                                 frozenset({"jov-owned"}), "devin"), expected)
                self.assertEqual(lane.pick_issue([task], failures, now=10000,
                                 in_flight=frozenset({"jov-owned"}), provider="devin"),
                                 task if expected is None else None)
        self.assertIsNone(lane.admission_rejection(issue(labels=["AUTH"]), {}, 10000, provider="codex"))
        # Exactly one reason per candidate, preserving the existing gate precedence.
        self.assertEqual(lane.admission_rejection(issue(labels=["Type:Epic", "auth"]), {}, 10000,
                         provider="devin"), "excluded-label:type:epic")

    def test_orders_like_symphony_priority_then_age_with_none_last(self):
        now = datetime(2026, 9, 4, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-3", priority=0),
            issue("JOV-2", priority=1, created="2026-09-03T00:00:00Z"),
            issue("JOV-1", priority=1, created="2026-09-02T00:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-1")

    def test_newer_urgent_work_stays_ahead_of_work_inside_aging_window(self):
        now = datetime(2026, 9, 3, 12, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-03T11:00:00Z"),
            issue("JOV-2", priority=2, created="2026-09-02T13:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-1")

    def test_aged_work_eventually_precedes_a_sustained_urgent_stream(self):
        now = datetime(2026, 9, 5, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-04T23:00:00Z"),
            issue("JOV-4", priority=4, created="2026-09-01T00:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-4")

    def test_unprioritized_work_ages_without_malformed_dates_jumping_the_queue(self):
        now = datetime(2026, 9, 6, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-05T23:00:00Z"),
            issue("JOV-0", priority=0, created="2026-09-01T00:00:00Z"),
            issue("JOV-BAD", priority=0, created="not-a-date"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-0")

    def test_skips_excluded_and_exhausted_work_but_drains_the_shared_pool(self):
        picked = lane.pick_issue([
            issue("JOV-1", labels=["no-symphony"]),
            issue("JOV-2", labels=["Area:Auth"]),
            issue("JOV-3", labels=[lane.SHARED_LABEL]),
            issue("JOV-4", priority=1),
        ], {"JOV-4": 3})
        self.assertEqual(picked.identifier, "JOV-3")

    def test_remediation_label_is_not_skipped_for_no_symphony(self):
        self.assertIsNone(lane.pick_issue([issue("JOV-7540", labels=["no-symphony"])], {}))
        picked = lane.pick_issue([
            issue("JOV-7540", labels=["no-symphony", "remediation:router"]),
            issue("JOV-7551", labels=["no-symphony", "remediation:billing-health"]),
        ], {})
        self.assertEqual(picked.identifier, "JOV-7540")
        self.assertIsNone(lane.admission_rejection(
            issue("JOV-7540", labels=["no-symphony", "remediation:router"]), {}, 10000))
        self.assertEqual(lane.admission_rejection(
            issue("JOV-1", labels=["no-symphony", "remediation:router", "type:epic"]), {}, 10000),
            "excluded-label:type:epic")
        self.assertEqual(lane.admission_rejection(
            issue("JOV-1", labels=["no-symphony", "remediation"]), {}, 10000),
            "excluded-label:no-symphony")
        os.environ["LANES_ESCALATION"] = "0"
        try:
            self.assertEqual(lane.admission_rejection(
                issue("JOV-7540", labels=["no-symphony", "remediation:router"]), {}, 10000),
                "excluded-label:no-symphony")
        finally:
            os.environ.pop("LANES_ESCALATION", None)

    def test_issues_with_an_open_lane_pr_anywhere_are_skipped(self):
        picked = lane.pick_issue([issue("JOV-1", priority=1), issue("JOV-2", priority=2)], {},
                                 in_flight=frozenset({"JOV-1"}))
        self.assertEqual(picked.identifier, "JOV-2")
        self.assertIsNone(lane.pick_issue([issue("JOV-1")], {}, in_flight=frozenset({"jov-1"})))

    def test_lane_branches_name_their_issue_and_lane(self):
        found = lane.LANE_BRANCH.match("codex/jov-6544-20260926t123210")
        self.assertEqual((found.group("lane"), found.group("issue")), ("codex", "jov-6544"))
        self.assertIsNone(lane.LANE_BRANCH.match("tim/jov-6544-fix"))
        self.assertIsNone(lane.LANE_BRANCH.match("devin/other-work"))

    def test_recent_failures_back_off_before_retry(self):
        failures = {"JOV-1": {"count": 1, "at": 1000.0}}
        self.assertIsNone(lane.pick_issue([issue("JOV-1")], failures, now=1000.0 + 60))
        self.assertEqual(lane.pick_issue([issue("JOV-1")], failures, now=1000.0 + 1801).identifier, "JOV-1")
        self.assertIsNone(lane.pick_issue([issue("JOV-9", labels=["infra"])], {}))

    def test_only_codex_guarded_lane_admits_sensitive_work(self):
        sensitive = issue("JOV-9", labels=["infra", lane.SHARED_LABEL])
        self.assertIsNone(lane.pick_issue([sensitive], {}, provider="devin"))
        self.assertEqual(lane.pick_issue([sensitive], {}, provider="codex").identifier, "JOV-9")

    def test_codex_lane_never_runs_review_only_tasks(self):
        # JOV-6896: codex bills review turns; adopt/gate claims go to other lanes.
        for kind in lane.REVIEW_ONLY_KINDS:
            self.assertFalse(lane.provider_may_run("codex", kind), kind)
            self.assertTrue(lane.provider_may_run("devin", kind), kind)
        self.assertTrue(lane.provider_may_run("codex", "issue"))
        self.assertTrue(lane.provider_may_run("codex", "fix-red"))

    def test_guarded_lane_still_rejects_red_lines(self):
        secret = issue("JOV-9", labels=["infra"])
        secret.title = "Rotate production credentials"
        pricing = issue("JOV-10", labels=["billing"])
        pricing.description = "Change live pricing for annual plans"
        self.assertIsNone(lane.pick_issue([secret, pricing], {}, provider="codex"))

    def test_pricing_page_fixture_is_not_a_live_price_change(self):
        task = issue("JOV-7259", labels=["agent-ready"])
        task.title = "Validate public JSON-LD certification"
        task.description = "The live `/pricing` schema fixture retains its nested Product/Offer graph."
        self.assertEqual(lane.pick_issue([task], {}, provider="devin"), task)
        for instruction in (
            "Change live pricing for annual plans",
            "Change live `/pricing` to $199",
            "Rotate production credentials",
            "Revoke production API keys",
        ):
            with self.subTest(instruction=instruction):
                task.description = f"{instruction}.\nThe live `/pricing` schema fixture must match."
                self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))
                task.description = f"The live `/pricing` schema fixture must match.\n{instruction}."
                self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))
        task.description = "Change live `/pricing` schema fixture and pricing to $199"
        self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))


class WorkstreamAdmissionTest(unittest.TestCase):
    """JOV-7514 / JOV-5555 / JOV-7423: one workstream rule for intake and backlog."""

    def titled(self, identifier, title, priority=3, created="2026-10-01T00:00:00Z", labels=()):
        task = issue(identifier, priority=priority, created=created, labels=labels)
        task.title = title
        return task

    def test_exact_duplicate_titles_admit_only_the_oldest_canonical(self):
        now = datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp()
        older = self.titled("JOV-20", "Bug: Fix redirect-only route", created="2026-09-30T00:00:00Z")
        newer = self.titled("JOV-10", "fix redirect only route!", priority=1, created="2026-10-01T23:00:00Z")
        self.assertEqual(lane.pool_rejections([older, newer]), {"JOV-10": "duplicate-candidate:JOV-20"})
        self.assertEqual(lane.pick_issue([newer, older], {}, now=now).identifier, "JOV-20")
        # The canonical stays claimable alone; a duplicate never resurrects once it is gone.
        self.assertEqual(lane.pick_issue([newer], {}, now=now).identifier, "JOV-10")

    def test_near_duplicates_and_tagged_variants_are_not_collapsed(self):
        cases = [self.titled("JOV-1", "[web-053] Redirect only route"),
                 self.titled("JOV-2", "[web-054] Redirect only route"),
                 self.titled("JOV-3", "Fix it"), self.titled("JOV-4", "fix it"),
                 self.titled("JOV-5", "Redirect only route regression")]
        self.assertEqual(lane.pool_rejections(cases), {})

    def test_compounding_infrastructure_precedes_non_urgent_product_work(self):
        now = datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp()
        product = self.titled("JOV-1", "Sidebar jank on profile", priority=2, created="2026-10-01T20:00:00Z")
        ci = self.titled("JOV-2", "Stabilize flaky Playwright CI shard", priority=3, created="2026-10-01T21:00:00Z")
        throughput = self.titled("JOV-3", "Symphony lane admission singleflight", priority=3,
                                 created="2026-10-01T20:30:00Z")
        # A lower-priority throughput fix still beats higher-priority product work.
        self.assertEqual(lane.pick_issue([product, throughput], {}, now=now).identifier, "JOV-3")
        # Same tier and priority: CI outranks throughput even when younger.
        self.assertEqual(lane.pick_issue([product, throughput, ci], {}, now=now).identifier, "JOV-2")
        # Inside tier 0, aged priority still comes before workstream rank.
        throughput.priority = 2
        self.assertEqual(lane.pick_issue([product, throughput, ci], {}, now=now).identifier, "JOV-3")

    def test_urgent_work_still_precedes_compounding_work(self):
        now = datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp()
        urgent = self.titled("JOV-1", "Sidebar jank on profile", priority=1, created="2026-10-01T23:00:00Z")
        ci = self.titled("JOV-2", "Stabilize flaky CI shard", priority=2, created="2026-10-01T22:00:00Z")
        self.assertEqual(lane.pick_issue([ci, urgent], {}, now=now).identifier, "JOV-1")
        # Work that has aged to P1 joins the urgent band, where CI rank then leads.
        ci.created_at = "2026-09-30T22:00:00Z"
        self.assertEqual(lane.pick_issue([urgent, ci], {}, now=now).identifier, "JOV-2")

    def test_explicit_workstream_label_overrides_and_ranks(self):
        self.assertEqual(lane.workstreams.classify("Sidebar jank", ["ws:ci"]), "ci")
        self.assertEqual(lane.workstreams.classify("Sidebar jank", []), "ui-ia")
        self.assertEqual(lane.workstreams.classify("Stabilize CI", ["needs-human"]), "human-decision")
        self.assertEqual(lane.workstreams.classify("", ["ws:not-a-stream"]), "general")
        self.assertEqual(lane.workstreams.KEYS[:2], ("ci", "symphony-throughput"))
        self.assertEqual(lane.workstreams.KEYS[-1], "human-decision")


class HotspotAdmissionTest(unittest.TestCase):
    """JOV-7708: an issue aimed at a hotspot an open PR holds waits instead of conflicting."""

    def titled(self, identifier, title, description="body", labels=()):
        task = issue(identifier, labels=labels)
        task.title, task.description = title, description
        return task

    def open_pr(self, number, *paths, labels=()):
        return {"number": number, "files": [{"path": path} for path in paths],
                "labels": [{"name": name} for name in labels]}

    def test_seed_and_shared_files_are_hotspots_held_by_the_oldest_active_pr(self):
        prs = [self.open_pr(30, "apps/web/lib/flags/code-flags.ts", "apps/web/a.ts"),
               self.open_pr(20, "apps/web/a.ts"),
               self.open_pr(10, "scripts/lanes/hud.py", labels=["lane-fix-exhausted"]),
               self.open_pr(11, "scripts/lanes/doctor.py", labels=["hold"]),
               self.open_pr(40, "apps/web/b.ts")]
        self.assertEqual(lane.hotspot_holds(prs), {"apps/web/lib/flags/code-flags.ts": 30,
                                                   "apps/web/a.ts": 20})

    def test_predicted_touch_prefers_named_files_then_the_workstream_area(self):
        named = self.titled("JOV-1", "Lane cooldown", "Edit `lane_runner.py` and lib/flags/code-flags.ts.")
        self.assertEqual(lane.predicted_touch(named), frozenset({"lane_runner.py", "lib/flags/code-flags.ts"}))
        area = self.titled("JOV-2", "Symphony lanes admission singleflight", "no paths here")
        self.assertEqual(lane.predicted_touch(area), lane.LANES_HARNESS)
        self.assertEqual(lane.predicted_touch(self.titled("JOV-3", "Sidebar jank on profile")), frozenset())

    def test_held_hotspot_rejects_only_issues_that_would_touch_it(self):
        holds = {"apps/web/lib/flags/code-flags.ts": 30, "scripts/lanes/lane_runner.py": 41}
        flag = self.titled("JOV-1", "Add a flag", "Register it in lib/flags/code-flags.ts")
        lanes_work = self.titled("JOV-2", "Symphony lane cooldown shared across hosts")
        product = self.titled("JOV-3", "Sidebar jank on profile")
        self.assertEqual(lane.pool_rejections([flag, lanes_work, product], holds),
                         {"JOV-1": "hotspot-held:apps/web/lib/flags/code-flags.ts#30",
                          "JOV-2": "hotspot-held:scripts/lanes/lane_runner.py#41"})
        self.assertEqual(lane.pick_issue([flag, lanes_work, product], {}, holds=holds).identifier, "JOV-3")
        # No holds (or an unreadable read) admits as before.
        self.assertEqual(lane.pool_rejections([flag, lanes_work, product], {}), {})
        self.assertEqual(lane.pick_issue([lanes_work, product], {}).identifier, "JOV-2")

    def test_a_suffix_hint_never_matches_a_different_file(self):
        holds = {"apps/web/lib/commands/registry.ts": 7}
        self.assertIsNone(lane.held_hotspot(frozenset({"data/product-truth/registry.ts"}), holds))
        self.assertIsNone(lane.held_hotspot(frozenset({"istry.ts"}), holds))
        self.assertEqual(lane.held_hotspot(frozenset({"registry.ts"}), holds),
                         ("apps/web/lib/commands/registry.ts", 7))

    def test_open_hotspot_holds_fails_open_when_github_is_unreadable(self):
        with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=1, stdout="", stderr="502")):
            self.assertEqual(lane.open_hotspot_holds(), {})
        listed = json.dumps([self.open_pr(5, "scripts/lanes/hud.py")])
        with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=listed, stderr="")):
            self.assertEqual(lane.open_hotspot_holds(), {"scripts/lanes/hud.py": 5})


class RebuildInFlightTest(unittest.TestCase):
    """JOV-7708: a parked PR the sweep requeued stays open but releases its issue."""

    def test_rebuild_labeled_pr_does_not_hold_its_issue(self):
        listed = json.dumps([
            {"headRefName": "devin/jov-7-20261001t0900", "body": "", "labels": [{"name": "lane-rebuild"}]},
            {"headRefName": "codex/jov-8-20261001t0900", "body": "", "labels": [{"name": "lane-fix-exhausted"}]},
            {"headRefName": "tim/x", "body": "linear-issue-id: JOV-9", "labels": []}])
        with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=listed, stderr="")):
            self.assertEqual(lane.in_flight_issues(), frozenset({"JOV-8", "JOV-9"}))


class PromptTest(unittest.TestCase):
    def test_contract_names_branch_issue_and_independent_gate(self):
        prompt = lane.render_prompt(issue("JOV-42"), "devin/jov-42-x", "prior decision: use tokens")
        for needle in ("devin/jov-42-x", "JOV-42", "prior decision: use tokens", "--no-verify",
                       "Do not mark it ready or merge it", "NOT-SHIPPABLE"):
            self.assertIn(needle, prompt)

    def test_native_issue_link_is_nonclosing_before_the_agent_opens_a_pr(self):
        for labels in ([], ["commissioning"], ["parent"]):
            with self.subTest(labels=labels):
                prompt = lane.render_prompt(issue("JOV-42", labels=labels), "devin/jov-42-x", "")
                self.assertIn("Refs JOV-42.", prompt)
                self.assertIn("linear-issue-identifier:JOV-42", prompt)
                self.assertIn("normal implementation", prompt)

    def test_contract_forbids_interactive_skill_workflows(self):
        prompt = lane.render_prompt(issue(), "codex/jov-1", "")
        self.assertIn("Never stop to ask", prompt)
        self.assertIn("Do not run gstack", prompt)
        self.assertIn("gh pr create --draft", prompt)

    def test_contract_states_reviewable_diff_cap_for_every_run(self):
        for labels in ([], ["area:auth"]):
            prompt = lane.render_prompt(issue(labels=labels), "codex/jov-1", "")
            self.assertIn(f"at or under {lane.MAX_REVIEWABLE_LINES} lines", prompt)
            self.assertIn("ship one coherent slice per PR", prompt)

    def test_codex_contract_forbids_posting_pr_reviews(self):
        prompt = lane.render_prompt(issue(), "codex/jov-1", "", provider="codex")
        self.assertIn("implementation-only", prompt)
        self.assertIn("gh pr review", prompt)
        self.assertNotIn("implementation-only", lane.render_prompt(issue(), "devin/jov-1", "", provider="devin"))
        sensitive = lane.render_prompt(issue(labels=["area:auth"]), "codex/jov-1", "", provider="codex")
        self.assertIn("implementation-only", sensitive)
        self.assertIn("llm-review", sensitive)

    def test_sensitive_contract_names_guarded_gates_and_red_lines(self):
        prompt = lane.render_prompt(issue(labels=["area:auth"]), "codex/jov-1", "")
        for needle in ("500 lines", "Migration Guard", "security scan", "boundary", "llm-review",
                       "Do not rotate", "live billing pricing"):
            self.assertIn(needle, prompt)

    def test_reports_missing_gbrain_instead_of_inventing_context(self):
        self.assertIn("GBrain unavailable", lane.render_prompt(issue(), "b", ""))

    def test_context_pack_is_bounded_and_fails_soft(self):
        ok = lambda *a, **k: SimpleNamespace(returncode=0, stdout="x" * 9000)
        self.assertEqual(len(lane.context_pack(issue(), run=ok)), 4000)
        empty = lambda *a, **k: SimpleNamespace(returncode=0, stdout="0 results. clean miss")
        self.assertEqual(lane.context_pack(issue(), run=empty), "")

        def boom(*a, **k):
            raise OSError("no gbrain")
        self.assertEqual(lane.context_pack(issue(), run=boom), "")


class DependencyOnlyGateTest(unittest.TestCase):
    """Actual git blobs distinguish version chores from source/configuration changes."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.manifests = ["apps/web/package.json", "packages/ui/package.json"]
        self.original = {"name": "fixture", "scripts": {"test": "vitest"},
                         "dependencies": {"@radix-ui/react-tabs": "^1.1.21", "local": "workspace:*"}}
        for path in self.manifests:
            self.write(path, self.original)
        self.write("pnpm-lock.yaml", "lockfileVersion: 9.0\n")
        self.base = self.commit("chore: fixture base")
        self.git("update-ref", "refs/remotes/origin/main", self.base)
        self.pr = {"number": 7, "title": "deps(deps): bump Radix Tabs", "body": "Dependency chore",
                   "headRefName": "dependabot/npm_and_yarn/radix-tabs", "labels": [], "state": "OPEN"}

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True,
                              text=True).stdout.strip()

    def write(self, path, value):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value) if isinstance(value, dict) else value)

    def commit(self, subject="chore(deps): update Radix Tabs"):
        self.git("add", "-A")
        # These model-free fixtures never execute a user's global hooks.
        self.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", subject)
        return self.git("rev-parse", "HEAD")

    def bump(self, extra=None, subject="chore(deps): update Radix Tabs"):
        for path in self.manifests:
            value = json.loads(json.dumps(self.original))
            value["dependencies"]["@radix-ui/react-tabs"] = "^1.1.22"
            if extra:
                extra(value)
            self.write(path, value)
        self.write("pnpm-lock.yaml", "lockfileVersion: 9.0\n# updated\n")
        self.pr["headRefOid"] = self.commit(subject)
        return self.changes()

    def changes(self):
        return lane.parse_numstat(self.git("diff", "--numstat", f"{self.base}...HEAD"))

    def classify(self, changes=None, pr=None):
        changes = self.changes() if changes is None else changes
        pr = self.pr if pr is None else pr
        return lane.dependency_diff.classify(self.repo, pr.get("headRefOid"), [c.path for c in changes], pr)

    def test_version_chore_proves_exact_base_head_and_immutable_manifests(self):
        changes = self.bump()
        versions = self.classify(changes)
        self.assertEqual((versions["baseSha"], versions["headSha"]), (self.base, self.pr["headRefOid"]))
        self.assertEqual(len(versions["manifests"]), 2)
        self.assertEqual(lane.gate_rules(changes), ["code-change-without-test"])
        self.assertEqual(lane.gate_rules(changes, worktree=self.repo, pr=self.pr), [])
        self.write(self.manifests[0], {"scripts": {"postinstall": "untrusted working tree"}})
        self.assertEqual(self.classify(changes), versions)
        self.assertIn(lane.CANONICAL_GATE, lane.check_commands([c.path for c in changes], self.pr))

    def test_configuration_changes_and_json_type_changes_are_not_version_chores(self):
        for key, value in [("scripts", {"test": "skip"}), ("exports", "./new.js"), ("engines", {"node": "30"}),
                           ("packageManager", "pnpm@10"), ("pnpm", {"overrides": {"dep": "1.0.0"}}),
                           ("overrides", {"dep": "1.0.0"}), ("name", "new"), ("version", "2.0.0")]:
            with self.subTest(key=key):
                changes = self.bump(lambda value_, key=key, value=value: value_.update({key: value}))
                self.assertIsNone(self.classify(changes))
                self.assertIn("code-change-without-test", lane.gate_rules(changes, worktree=self.repo, pr=self.pr))
        self.original["private"] = True
        for path in self.manifests:
            self.write(path, self.original)
        self.commit("chore: boolean base")
        self.base = self.git("rev-parse", "HEAD")
        self.git("update-ref", "refs/remotes/origin/main", self.base)
        self.bump(lambda value: value.update(private=1))
        self.assertIsNone(self.classify())

    def test_dependency_add_remove_map_changes_and_unsafe_specifiers_fail_closed(self):
        changes = self.bump(lambda value: value["dependencies"].update(new="1.0.0"))
        self.assertIsNone(self.classify(changes))
        changes = self.bump(lambda value: value["dependencies"].pop("local"))
        self.assertIsNone(self.classify(changes))
        for spec in [False, None, {}, "", "file:../src", "workspace:^", "git+https://example.invalid/repo", "npm:other@1.2.3", "latest"]:
            with self.subTest(spec=spec):
                changes = self.bump(lambda value, spec=spec: value["dependencies"].update({"@radix-ui/react-tabs": spec}))
                self.assertIsNone(self.classify(changes))
        self.bump(lambda value: value.update(dependencies=["1.1.22"]))
        self.assertIsNone(self.classify())
        self.bump(lambda value: value.update(devDependencies={"added": "1.0.0"}))
        self.assertIsNone(self.classify())

    def test_duplicate_keys_invalid_json_nonobjects_and_nonnumbers_fail_closed(self):
        self.bump()
        for raw in ['{"dependencies":{"dep":"1.0.0","dep":"2.0.0"}}', "{broken", "[]", "null",
                    '{"dependencies":{"dep":"1.0.0"},"other":NaN}']:
            with self.subTest(raw=raw):
                self.write(self.manifests[0], raw); self.pr["headRefOid"] = self.commit()
                self.assertIsNone(self.classify())

    def test_oversized_format_only_and_malformed_git_evidence_fail_closed(self):
        self.bump()
        self.write(self.manifests[0], {**self.original, "large": "x" * (1024 * 1024)})
        self.pr["headRefOid"] = self.commit()
        self.assertIsNone(self.classify())
        self.git("reset", "--hard", self.base)
        self.bump()
        self.write(self.manifests[0], '{"deep":' + '[' * 10000 + '0' + ']' * 10000 + '}')
        self.pr["headRefOid"] = self.commit()
        self.assertIsNone(self.classify())
        self.assertIn("code-change-without-test", lane.gate_rules(self.changes(), worktree=self.repo, pr=self.pr))
        self.git("reset", "--hard", self.base)
        self.bump()
        self.write(self.manifests[0], json.dumps(self.original, indent=2))
        self.pr["headRefOid"] = self.commit()
        self.assertIsNone(self.classify())
        self.git("reset", "--hard", self.base)
        self.bump()
        git = lane.dependency_diff._git
        for verb, output in [("merge-base", "unknown"), ("diff", "unreadable\0")]:
            with self.subTest(verb=verb):
                def read(repo, *args):
                    return output if args[0] == verb else git(repo, *args)
                with patch.object(lane.dependency_diff, "_git", read):
                    self.assertIsNone(self.classify())

    def test_mixed_source_workflow_secret_and_lockfile_only_changes_keep_existing_guards(self):
        for path in ["apps/web/lib/runtime.ts", ".github/workflows/ci.yml", "apps/web/.env.local"]:
            with self.subTest(path=path):
                self.bump(); self.write(path, "changed\n"); self.pr["headRefOid"] = self.commit()
                changes = self.changes()
                self.assertIsNone(self.classify(changes))
                reasons = lane.gate_rules(changes, worktree=self.repo, pr=self.pr)
                self.assertIn("code-change-without-test", reasons)
                if ".env" in path:
                    self.assertIn("secret-like-file-changed", reasons)
                self.git("reset", "--hard", self.base)
        self.write("pnpm-lock.yaml", "only lock\n"); self.pr["headRefOid"] = self.commit()
        self.assertIsNone(self.classify())
        self.assertIn("lockfile-without-manifest", lane.gate_rules(self.changes(), worktree=self.repo, pr=self.pr))

    def test_renamed_symlink_executable_and_new_manifests_cannot_earn_exemption(self):
        for kind in ["rename", "symlink", "executable", "new"]:
            with self.subTest(kind=kind):
                self.git("reset", "--hard", self.base); self.bump()
                target = self.repo / self.manifests[0]
                if kind == "rename": target.rename(target.with_name("renamed.json"))
                elif kind == "symlink": target.unlink(); target.symlink_to("../ui/package.json")
                elif kind == "executable": target.chmod(0o755)
                else: self.write("apps/new/package.json", self.original)
                self.pr["headRefOid"] = self.commit()
                self.assertIsNone(self.classify())

    def test_unreadable_refs_wrong_head_and_incomplete_diff_evidence_fail_closed(self):
        changes = self.bump()
        for head in [None, "not-a-sha", self.base]:
            self.assertIsNone(self.classify(changes, {**self.pr, "headRefOid": head}))
        self.assertIsNone(self.classify(changes[:-1]))
        self.assertIsNone(self.classify(changes + changes[:1]))
        self.git("update-ref", "-d", "refs/remotes/origin/main")
        self.assertIsNone(self.classify(changes))
        with patch.object(lane.dependency_diff, "_git", side_effect=subprocess.TimeoutExpired("git", 30)):
            self.assertIsNone(self.classify(changes))
        with patch.object(lane.dependency_diff, "_git", side_effect=UnicodeError("unreadable")):
            self.assertIsNone(self.classify(changes))

    def test_bugfix_signals_or_unreadable_metadata_require_changed_regression_test(self):
        changes = self.bump()
        for metadata in [{"title": "fix(deps): Radix bug"}, {"headRefName": "fix/radix"},
                         {"headRefName": "codex/fix-radix"},
                         {"body": "- [x] Bug fix (non-breaking change which fixes an issue)"},
                         {"title": None}, {"body": None}, {"title": "refactor: dependency behavior"}]:
            with self.subTest(metadata=metadata):
                pr = {**self.pr, **metadata}
                self.assertIsNone(self.classify(changes, pr))
                self.assertIn("code-change-without-test", lane.gate_rules(changes, worktree=self.repo, pr=pr))
        self.git("reset", "--hard", self.base)
        self.bump(subject="fix(deps): regression")
        self.assertIsNone(self.classify())

    def test_size_cap_and_completed_proof_metadata_remain_authoritative(self):
        changes = self.bump()
        self.assertIn("diff-too-large:2000", lane.gate_rules(
            [lane.Change(c.path, 1000, 0) if c.path != "pnpm-lock.yaml" else c for c in changes],
            lane.SENSITIVE_REVIEWABLE_LINES, worktree=self.repo, pr=self.pr))
        proof = {**gate_proof(self.pr["headRefOid"]), "dependencyVersionDiff": self.classify()}
        key = f"7:{self.pr['headRefOid']}"
        self.assertIs(lane.terminal_gate(self.pr, {key: proof}), proof)
        self.assertIsNone(lane.terminal_gate({**self.pr, "body": "changed"}, {key: proof}))
        self.assertIsNone(lane.terminal_gate(self.pr, {key: {**proof, "dependencyVersionDiff": {}}}))

    def test_classifier_policy_change_invalidates_completed_receipt(self):
        self.bump()
        proof = {**gate_proof(self.pr["headRefOid"]), "dependencyVersionDiff": self.classify()}
        real_read = Path.read_bytes
        helper = Path(lane.dependency_diff.__file__)
        def changed_read(path):
            return real_read(path) + (b"\n# changed policy" if path == helper else b"")
        with patch.object(Path, "read_bytes", changed_read):
            changed_digest = lane.gate_policy_digest()
        self.assertNotEqual(changed_digest, lane.GATE_POLICY_DIGEST)
        with patch.object(lane, "GATE_POLICY_DIGEST", changed_digest):
            self.assertIsNone(lane.terminal_gate(self.pr, {f"7:{self.pr['headRefOid']}": proof}))

    def test_incomplete_live_metadata_cannot_inherit_cached_chore_authority(self):
        self.bump()
        for field in ["title", "body", "headRefName"]:
            for missing in [True, False]:
                with self.subTest(field=field, missing=missing):
                    live = repair_target_page(self.pr)["data"]["repository"]["pullRequest"]
                    if missing:
                        live.pop(field)
                    else:
                        live[field] = None
                    fresh = lane.repair_target_node(self.pr, live)
                    if fresh is not None:
                        self.assertIsNone(lane.dependency_diff.metadata_digest(fresh))
                        self.assertIsNone(self.classify(pr=fresh))

    def test_lost_diff_proof_or_new_bugfix_metadata_after_qualification_holds(self):
        self.bump()
        versions = self.classify()
        for fault in ["read-failed", "bugfix"]:
            with self.subTest(fault=fault):
                host = lane.Host(state=Path(self.tmp.name) / fault)
                calls = []
                def shell(args, **kwargs):
                    calls.append(args)
                    if args[:2] == ["git", "fetch"]:
                        return SimpleNamespace(returncode=0, stdout="", stderr="")
                    if args[0] == "git":
                        return subprocess.run(args, cwd=self.repo, capture_output=True, text=True)
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                reads = 0
                def target(*args, **kwargs):
                    nonlocal reads
                    reads += 1
                    body = "- [x] Bug fix (non-breaking change which fixes an issue)"
                    return {**self.pr, **({"body": body} if fault == "bugfix" and reads > 1 else {})}
                with (self.repo / "gate.log").open("w+") as log, patch.object(lane, "sh", shell), \
                     patch.object(lane, "reconcile_fix_target", side_effect=target), \
                     patch.object(lane, "claimed_elsewhere", return_value=False), \
                     patch.object(lane, "publication_revocation", return_value=None), \
                     patch.object(lane, "publish_verified") as publish:
                    if fault == "read-failed":
                        with patch.object(lane.dependency_diff, "classify", side_effect=[versions, None]) as prove:
                            result = lane.gate_pr(host, self.pr, self.repo, log)
                            self.assertEqual(prove.call_count, 2)
                    else:
                        result = lane.gate_pr(host, self.pr, self.repo, log)
                    publish.assert_not_called()
                self.assertEqual(result["verdict"], "held")
                self.assertEqual(result["dependencyVersionDiff"], versions)
                self.assertIn("dependency-version-evidence-changed", result["reasons"])
                self.assertIn("code-change-without-test", result["reasons"])
                self.assertEqual(calls.count(lane.CANONICAL_GATE), 1)
                self.assertFalse((host.state / "fix-attempts.json").exists())

    def test_dependency_chore_still_runs_canonical_gate_and_cannot_publish_on_failure(self):
        self.bump()
        host = lane.Host(state=Path(self.tmp.name) / "state")
        calls = []
        def shell(args, **kwargs):
            calls.append(args)
            if args[:2] == ["git", "fetch"]:
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if args[0] == "git":
                return subprocess.run(args, cwd=self.repo, capture_output=True, text=True)
            return SimpleNamespace(returncode=1 if args == lane.CANONICAL_GATE else 0, stdout="", stderr="")
        with (self.repo / "gate.log").open("w+") as log, patch.object(lane, "sh", shell), \
             patch.object(lane, "reconcile_fix_target", return_value=dict(self.pr)), \
             patch.object(lane, "claimed_elsewhere", return_value=False), \
             patch.object(lane, "publication_revocation", return_value=None), \
             patch.object(lane, "publish_verified") as publish:
            result = lane.gate_pr(host, self.pr, self.repo, log)
            publish.assert_not_called()
        self.assertEqual(result["verdict"], "held")
        self.assertNotIn("code-change-without-test", result["reasons"])
        self.assertTrue(any(reason.startswith("check-failed:") for reason in result["reasons"]))
        self.assertEqual(calls.count(lane.CANONICAL_GATE), 1)
        self.assertFalse(any(args[:3] == ["gh", "pr", "merge"] for args in calls))
        self.assertFalse((host.state / "fix-attempts.json").exists())


class GateTest(unittest.TestCase):
    def change(self, path, added=10, deleted=0):
        return lane.Change(path, added, deleted)

    def test_empty_diff_fails(self):
        self.assertEqual(lane.gate_rules([]), ["empty-diff"])

    def test_code_needs_a_test_but_docs_do_not(self):
        self.assertEqual(lane.gate_rules([self.change("apps/web/lib/a.ts")]), ["code-change-without-test"])
        self.assertEqual(lane.gate_rules([self.change("apps/web/lib/a.ts"),
                                          self.change("apps/web/lib/a.test.ts")]), [])
        self.assertEqual(lane.gate_rules([self.change("docs/agents.md")]), [])
        self.assertEqual(lane.gate_rules([self.change(".cursor/rules/general.mdc")]), [])

    def test_xcode_tests_directory_counts_as_test(self):
        changes = [self.change("apps/ios/Jovie/Core/ChatRepository.swift"),
                   self.change("apps/ios/JovieTests/ChatRepositoryTests.swift")]
        self.assertEqual(lane.gate_rules(changes), [])
        self.assertEqual(lane.gate_rules([self.change("apps/ios/Jovie/Core/A.swift")]),
                         ["code-change-without-test"])

    def test_secrets_lockfile_and_size_guards(self):
        self.assertIn("secret-like-file-changed", lane.gate_rules([self.change("apps/web/.env.local")]))
        self.assertIn("lockfile-without-manifest", lane.gate_rules([self.change("pnpm-lock.yaml")]))
        big = [self.change("apps/web/lib/a.ts", 1400, 200), self.change("apps/web/lib/a.test.ts")]
        self.assertIn("diff-too-large:1610", lane.gate_rules(big))

    def test_generated_snapshots_do_not_count_toward_size(self):
        changes = [self.change("apps/web/drizzle/migrations/meta/0108_snapshot.json", 37716),
                   self.change("apps/web/lib/profile/catalog.ts", 112),
                   self.change("apps/web/lib/profile/catalog.test.ts", 180)]
        self.assertEqual(lane.gate_rules(changes), [])

    def test_sensitive_diff_uses_the_smaller_review_cap(self):
        changes = [self.change("apps/web/lib/a.ts", 400), self.change("apps/web/lib/a.test.ts", 101)]
        self.assertIn("diff-too-large:501", lane.gate_rules(changes, lane.SENSITIVE_REVIEWABLE_LINES))

    def test_sensitive_review_fails_closed_without_an_explicit_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = lane.Host(state=root)
            fake = FakeShell([])
            original = lane.sh
            lane.sh = fake
            try:
                passed, reasons = lane.sensitive_review(host, {"number": 7, "headRefOid": "abc"}, root, None)
            finally:
                lane.sh = original
        self.assertFalse(passed)
        self.assertTrue(reasons[0].startswith("llm-review-failed"))

    def test_context_drift_does_not_replace_the_sensitive_review_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = lane.Host(state=root)
            for verdict, expected in [("LLM-REVIEW: FAIL", False), ("LLM-REVIEW: PASS", True)]:
                def review(*args, **kwargs):
                    (root / ".codex-last-message.txt").write_text(verdict)
                    return SimpleNamespace(returncode=0)
                with patch.object(lane, "context_manifest_matches", return_value=False), \
                        patch.object(lane, "sh", side_effect=review) as reviewer:
                    passed, _ = lane.sensitive_review(host, {"number": 7, "headRefOid": "abc"}, root, None)
                self.assertEqual(passed, expected)
                reviewer.assert_called_once()

    def test_numstat_parsing_handles_binary(self):
        changes = lane.parse_numstat("3\t1\ta.ts\n-\t-\timg.png\nnoise\n")
        self.assertEqual([(c.path, c.added, c.deleted) for c in changes], [("a.ts", 3, 1), ("img.png", 0, 0)])

    def test_code_changes_run_the_one_canonical_gate(self):
        self.assertEqual(lane.check_commands(["apps/web/lib/a.ts", "docs/readme.md"]), [lane.CANONICAL_GATE])
        self.assertEqual(lane.check_commands(["docs/readme.md"]), [])
        pr = {"number": 7, "headRefOid": "a" * 40, "headRefName": "feat/x"}
        self.assertEqual(lane.check_commands(["apps/web/app/claim/page.tsx"], pr),
                         [lane.CANONICAL_GATE,
                          ["node", "scripts/funnel-judge/preview-gate.mjs", "--pr", "7",
                           "--sha", "a" * 40, "--ref", "feat/x"]])
        self.assertEqual(lane.check_commands(["docs/readme.md"], pr), [])

    @unittest.skipUnless((ROOT / "scripts/automation-verify.sh").exists(), "release copy has no repo gates")
    def test_canonical_gate_carries_the_ci_component_contract(self):
        self.assertIn("affected)", (ROOT / lane.CANONICAL_GATE[1]).read_text())
        self.assertIn("component-ship-gate", (ROOT / "scripts/automation-verify.sh").read_text())


class FakeShell:
    """Canned `sh` so the verify/land path runs without GitHub."""
    def __init__(self, prs, numstat="3\t0\tapps/web/lib/a.ts\n2\t0\tapps/web/lib/a.test.ts\n", ahead="0",
                 failing=()):
        self.prs, self.numstat, self.ahead, self.failing, self.calls = prs, numstat, ahead, failing, []

    def __call__(self, args, cwd=None, timeout=600, env=None, log=None, stream=False, pass_fds=()):
        self.calls.append(args)
        out, code = publication_response(args), 0
        if any(token in args for token in getattr(self, "hanging", ())):
            raise subprocess.TimeoutExpired(args, timeout)
        if args[:3] == ["gh", "pr", "list"]:
            out = json.dumps(self.prs)
        elif args[:3] == ["gh", "pr", "view"]:
            out = json.dumps({**self.prs[0], "state": "OPEN"})
        elif args[:3] == ["gh", "api", "graphql"] and "query=" + lane.REPAIR_TARGET_QUERY in args:
            number = int(next(value.removeprefix("number=") for value in args if value.startswith("number=")))
            target = next(pr for pr in self.prs if pr["number"] == number)
            out = json.dumps(repair_target_page(target))
        elif args[:2] == ["git", "diff"]:
            out = self.numstat
        elif args == ["git", "rev-parse", "HEAD"]:
            out = self.prs[0]["headRefOid"]
        elif args[:2] == ["git", "rev-list"]:
            out = self.ahead
        elif any(token in args for token in self.failing):
            code = 1
        return SimpleNamespace(returncode=code, stdout=out, stderr="")


class VerifyAndLandTest(unittest.TestCase):
    def setUp(self):
        self.real = lane.sh
        self.started = datetime(2026, 9, 25, 21, 0, tzinfo=timezone.utc).timestamp()
        self.pr = {"number": 7, "headRefName": "devin/jov-1", "headRefOid": "abc", "url": "u",
                   "createdAt": "2026-09-25T21:05:00Z", "isDraft": True}

    def tearDown(self):
        lane.sh = self.real

    def run_gate(self, fake):
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:  # never this host's live gate seats
            return lane.verify_and_land(lane.Host(state=Path(tmp)), issue(), "devin/jov-1", Path("/tmp"), None, self.started)

    def test_green_diff_is_marked_ready_and_queued(self):
        fake = FakeShell([self.pr])
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "landing")
        self.assertIn(["gh", "pr", "ready", "7", "--repo", lane.REPO_SLUG], fake.calls)
        self.assertIn(["gh", "pr", "merge", "7", "--repo", lane.REPO_SLUG, "--auto", "--match-head-commit", self.pr["headRefOid"]], fake.calls)

    def test_failed_queue_records_retry_under_inventory_lock(self):
        fake = FakeShell([self.pr], failing=("merge",))
        update = lane.update_json; observed = []
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); path = host.state / "requeue.json"
            path.write_text(json.dumps({"9": "concurrent"}))
            def synchronized(path, change):
                contender = lane.Locked(host.state / "claim.lock", blocking=False)
                try:
                    if path.name == "requeue.json": observed.append(contender.held)
                finally: contender.release()
                update(path, change)
            with patch.object(lane, "sh", side_effect=fake), patch.object(lane, "update_json", side_effect=synchronized):
                result = lane.gate_pr(host, self.pr, Path("/tmp"), None)
            self.assertEqual(result["verdict"], "verified-not-queued")
            self.assertTrue(observed); self.assertFalse(any(observed))
            self.assertEqual(json.loads(path.read_text()), {"9": "concurrent", "7": self.pr["headRefOid"]})

    def test_failing_check_holds_the_pr_as_draft(self):
        fake = FakeShell([self.pr], failing=("scripts/hooks/pre-push-gate.sh",))
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "held")
        self.assertTrue(any(r.startswith("check-failed") for r in result["reasons"]))
        self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))

    def test_gate_timeout_is_transient_until_it_repeats(self):
        fake = FakeShell([self.pr])
        fake.hanging = ("scripts/hooks/pre-push-gate.sh",)
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.sh = fake
            verdicts = [lane.gate_pr(host, self.pr, Path("/tmp"), None)["verdict"]
                        for _ in range(lane.MAX_GATE_TIMEOUTS)]
        self.assertEqual(verdicts, ["gate-timeout"] * (lane.MAX_GATE_TIMEOUTS - 1) + ["held"])
        self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))
        # every attempt released its gate seat, so the seat is free again
        seat = lane.Locked(host.state / "slots" / "gate.0.lock", blocking=False)
        self.assertTrue(seat.held)
        seat.release()

    def test_gate_wait_time_is_recorded_on_the_receipt(self):
        result = self.run_gate(FakeShell([self.pr]))
        self.assertIsInstance(result["gateWaitS"], int)
        self.assertGreaterEqual(result["gateWaitS"], 0)

    def test_gate_slot_reports_the_time_spent_queued_for_a_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), gate_slots=1)
            seat = lane.Locked(host.state / "slots" / "gate.0.lock", blocking=False)
            self.assertTrue(seat.held)
            clock = iter([1000.0, 1030.0])
            real_time = lane.time
            lane.time = SimpleNamespace(time=lambda: next(clock), sleep=lambda _s: seat.release())
            try:
                lock, waited = lane.gate_slot(host)
            finally:
                lane.time = real_time
            self.assertEqual(waited, 30)
            self.assertTrue(lock.held)
            lock.release()

    def test_a_new_head_resets_the_timeout_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            self.assertEqual(lane.gate_timeouts(host, self.pr, change=1), 1)
            self.assertEqual(lane.gate_timeouts(host, self.pr, change=1), 2)
            self.assertEqual(lane.gate_timeouts(host, {**self.pr, "headRefOid": "new"}), 0)

    def test_older_prs_for_the_same_issue_are_ignored(self):
        stale = {**self.pr, "createdAt": "2026-09-20T00:00:00Z"}
        self.assertEqual(self.run_gate(FakeShell([stale]))["verdict"], "pr-readback-pending")

    def test_fallback_pr_is_nonclosing_from_creation_and_retains_merge_sync_identity(self):
        fake = FakeShell([], ahead="2")
        self.run_gate(fake)
        creations = [call for call in fake.calls if call[:3] == ["gh", "pr", "create"]]
        self.assertEqual(len(creations), 1)
        body = creations[0][creations[0].index("--body") + 1]
        self.assertTrue(body.startswith("Refs JOV-1.\n"))
        self.assertIn("<!-- linear-issue-id:id-JOV-1 -->", body)
        self.assertIn("<!-- linear-issue-identifier:JOV-1 -->", body)
        self.assertNotIn("Closes", body)

    def test_unavailable_or_malformed_inventory_is_not_empty(self):
        for code, out, err in [(1, "", "gh: github-budget-floor: 523 < 600 private-token"),
                               (1, "[]", "transport failure"), (0, "", ""),
                               (0, "not-json", ""), (0, "null", ""),
                               (0, json.dumps([{"number": 21010}]), "")]:
            with self.subTest(code=code, out=out):
                fake = FakeShell([], ahead="2")
                def shell(args, **kwargs):
                    result = fake(args, **kwargs)
                    return SimpleNamespace(returncode=code, stdout=out, stderr=err) if args[:3] == ["gh", "pr", "list"] else result
                result = self.run_gate(shell)
                self.assertEqual(result["verdict"], "pr-readback-pending")
                self.assertEqual(result["prReadback"]["state"], "unknown")
                self.assertNotIn("private-token", json.dumps(result))
                self.assertFalse(any(call[:2] == ["git", "push"] or call[:3] == ["gh", "pr", "create"] for call in fake.calls))

    def test_inventory_timeout_retains_unknown_without_publication(self):
        fake = FakeShell([], ahead="2"); fake.hanging = ("list",)
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "pr-readback-pending")
        self.assertEqual(len(fake.calls), 1)

    def test_wrong_branch_and_ambiguous_inventory_cannot_adopt_or_create(self):
        for prs in ([{**self.pr, "headRefName": "another-owner"}], [self.pr, self.pr]):
            with self.subTest(prs=prs):
                fake = FakeShell(prs, ahead="2")
                result = self.run_gate(fake)
                self.assertEqual(result["verdict"], "pr-readback-pending")
                self.assertEqual(len(fake.calls), 1)

    def test_already_exists_then_refused_read_is_pending_not_definitive_failure(self):
        fake = FakeShell([], ahead="2"); reads = []
        def shell(args, **kwargs):
            result = fake(args, **kwargs)
            if args[:3] == ["gh", "pr", "list"]:
                reads.append(args)
                if len(reads) == 2:
                    return SimpleNamespace(returncode=1, stdout="", stderr="github-budget-floor")
            if args[:3] == ["gh", "pr", "create"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="already exists: https://github.com/JovieInc/Jovie/pull/21010")
            return result
        result = self.run_gate(shell)
        self.assertEqual(result["verdict"], "pr-readback-pending")
        self.assertEqual(result["prReadback"]["branch"], "devin/jov-1")
        self.assertNotIn("pr", result)  # create output is not authoritative readback
        self.assertEqual(sum(call[:3] == ["gh", "pr", "create"] for call in fake.calls), 1)

    def test_same_branch_existing_pr_recovered_only_from_authoritative_read(self):
        fake = FakeShell([], ahead="2")
        def shell(args, **kwargs):
            if args[:3] == ["gh", "pr", "create"]:
                fake.prs = [self.pr]
                result = fake(args, **kwargs)
                return SimpleNamespace(returncode=1, stdout="", stderr="already exists, untrusted private payload")
            return fake(args, **kwargs)
        result = self.run_gate(shell)
        self.assertEqual(result["verdict"], "landing")
        self.assertEqual(result["pr"], 7)
        self.assertEqual(sum(call[:3] == ["gh", "pr", "create"] for call in fake.calls), 1)

    def test_failed_push_does_not_create_a_pr(self):
        fake = FakeShell([], ahead="2", failing=("push",))
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "pr-readback-pending")
        self.assertFalse(any(call[:3] == ["gh", "pr", "create"] for call in fake.calls))

    def test_create_applied_then_timed_out_recovers_existing_pr_without_resend(self):
        fake = FakeShell([], ahead="2")
        def shell(args, **kwargs):
            result = fake(args, **kwargs)
            if args[:3] == ["gh", "pr", "create"]:
                fake.prs = [self.pr]
                raise subprocess.TimeoutExpired(args, 600, output="private-payload")
            return result
        result = self.run_gate(shell)
        self.assertEqual((result["verdict"], result["pr"]), ("landing", 7))
        self.assertEqual(sum(call[:3] == ["gh", "pr", "create"] for call in fake.calls), 1)

    def test_ambiguous_transport_preserves_pending_when_authoritative_read_is_unavailable(self):
        for step, error in [("push", OSError("private-payload")), ("create", subprocess.TimeoutExpired(["gh"], 600))]:
            with self.subTest(step=step):
                fake = FakeShell([], ahead="2"); reads = []
                def shell(args, **kwargs):
                    result = fake(args, **kwargs)
                    if args[:3] == ["gh", "pr", "list"]:
                        reads.append(args)
                        if len(reads) > 1: return SimpleNamespace(returncode=1, stdout="", stderr="budget-floor")
                    if step in args: raise error
                    return result
                result = self.run_gate(shell)
                self.assertEqual(result["verdict"], "pr-readback-pending")
                self.assertEqual(result["prReadback"]["state"], "unknown")
                self.assertNotIn("private-payload", json.dumps(result))
                self.assertLessEqual(sum(call[:3] == ["gh", "pr", "create"] for call in fake.calls), 1)

    def test_pr_creation_failure_does_not_loop(self):
        result = self.run_gate(FakeShell([], ahead="2"))
        self.assertEqual(result["verdict"], "pr-readback-pending")
        self.assertEqual(result["reasons"], ["pr-create-readback-unconfirmed"])


class ProviderAndLockTest(unittest.TestCase):
    def test_provider_specs_are_complete_and_devin_stays_free(self):
        providers = lane.load_providers()
        for name, spec in providers.items():
            self.assertEqual(spec["label"], name)
            self.assertTrue(any("{prompt" in arg for arg in spec["cmd"]), name)
            self.assertTrue(spec["health"])
        self.assertTrue(providers["devin"]["model"].startswith("swe-2"))
        self.assertEqual(providers["codex"]["reasoningEffort"], "xhigh")
        self.assertIn("xhigh", providers["codex"]["cmd"])
        # Tim 2026-10-03 (JOV-7706): Claude Code and Hyperagent join Devin and Codex as regular lanes.
        enabled = {name for name, spec in providers.items() if spec.get("enabled", True)}
        self.assertEqual(enabled, {"devin", "codex", "claude", "hyperagent"})
        # Claude rides the subscription wrapper with a routed model; never a bare `claude` with API env.
        claude = providers["claude"]
        self.assertIn("{here}/claude_lane.py", claude["cmd"])
        self.assertEqual(claude["cmd"][claude["cmd"].index("--model") + 1], "{model}")
        self.assertEqual({route["model"] for route in claude["routes"]}, {"claude-opus-5-5", "claude-sonnet-5-5"})
        # Every lane run is a fresh worktree; Devin refuses untrusted dirs unless told not to.
        cmd = providers["devin"]["cmd"]
        self.assertEqual(cmd[cmd.index("--respect-workspace-trust") + 1], "false")

    def test_template_substitutes_prompt(self):
        self.assertEqual(lane.template(["x", "{prompt_file}"], {"prompt": "p", "prompt_file": "/f"}), ["x", "/f"])

    def test_slot_lock_is_exclusive_and_released(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "slot.lock"
            with patch.object(lane, "now_iso", return_value="2026-10-06T23:02:30Z"):
                first = lane.Locked(path, blocking=False)
            self.assertTrue(first.held)
            owner = json.loads(path.read_text())
            contender = lane.Locked(path, blocking=False)
            self.assertFalse(contender.held)
            self.assertEqual(json.loads(path.read_text()), owner, "a contender must preserve the owner's receipt")
            contender.release()
            self.assertEqual(owner, {"pid": os.getpid(), "host": lane.HOST,
                                     "acquiredAt": "2026-10-06T23:02:30Z"})
            first.release()
            next_owner = lane.Locked(path, blocking=False)
            self.assertTrue(next_owner.held)
            next_owner.release()

    def test_needs_update_only_on_a_new_tree(self):
        self.assertTrue(lane.needs_update(None, "t1"))
        self.assertFalse(lane.needs_update("t1", "t1"))
        self.assertFalse(lane.needs_update("t1", ""))


class FakeLinear:
    def __init__(self, issues):
        self.issues, self.moves, self.comments, self.triaged = issues, [], [], []
        self.issue_state = {"name": "Todo", "type": "unstarted"}

    def gql(self, query, variables):
        # The issue-lookup used for terminal dispositions (pr_events.linear_issue).
        number = int(variables.get("n") or 0)
        issue_id = f"id-JOV-{number}"
        comments = [{"body": body} for iid, body in self.comments if iid == issue_id]
        node = {"id": issue_id, "state": self.issue_state, "comments": {"nodes": comments}}
        return {"issues": {"nodes": [] if self.missing_issue(number) else [node]}}

    def missing_issue(self, number):
        return number in getattr(self, "missing", set())

    def create_triage(self, title, description, dedupe=None):
        if dedupe and any(dedupe in open_title for open_title in getattr(self, "open_titles", [])):
            return "existing-id"
        self.triaged.append(title)
        return "triage-id"

    def lane_issues(self, label):
        return self.issues

    def move(self, issue_id, state):
        self.moves.append((issue_id, state))

    def state_of(self, issue_id):
        return getattr(self, "states", {}).get(issue_id, "Todo")

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))


class LinearClientTest(unittest.TestCase):
    def test_unknown_graphql_code_and_private_message_are_not_retained(self):
        error = lane.LinearRequestError({"message": "secret-token", "extensions": {"code": "secret-token", "statusCode": "secret-token"}})
        self.assertEqual(error.diagnostic, {"class": "linear-graphql", "code": "UNKNOWN"})
        self.assertEqual(str(error), "linear: request rejected")
        missing = lane.LinearRequestError({"message": "Entity not found: Comment"})
        self.assertEqual(str(missing), "linear: Entity not found: Comment")

    def test_graphql_error_diagnostics_retain_only_allowlisted_metadata(self):
        client = lane.Linear.__new__(lane.Linear); client.key = "test-only-no-live-credential"
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return json.dumps({"errors": [{"message": "private payload secret-token", "extensions": {"code": "FORBIDDEN", "statusCode": 403, "payload": "secret-token"}}]}).encode()
        with patch.object(lane, "linear_cooldown_until", return_value=None), patch.object(lane, "record_linear_budget"), patch.object(lane.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaises(lane.LinearRequestError) as caught:
                client.gql("mutation", {"body": "private payload"})
        self.assertEqual(caught.exception.diagnostic, {"class": "linear-graphql", "code": "FORBIDDEN", "httpStatus": 403})
        self.assertNotIn("secret-token", str(caught.exception))

    def test_comment_rejects_malformed_success_payloads_as_known_failure(self):
        for payload in (None, {"commentCreate": None}, {"commentCreate": []}, {"commentCreate": {"success": None}}):
            with self.subTest(payload=payload), patch.object(lane.Linear, "gql", return_value=payload):
                with self.assertRaises(RuntimeError): lane.Linear.__new__(lane.Linear).comment("id-JOV-3", "held")

    def test_claim_comment_shape_errors_are_diagnostic_and_operator_stop_propagates(self):
        import io
        client = lane.Linear.__new__(lane.Linear)
        with patch.object(client, "comment", side_effect=AttributeError("private-shape-message")), patch("sys.stderr", new_callable=io.StringIO) as diagnostic:
            lane.notify_issue_claim(client, issue(), "devin", {"model": "m"})
            self.assertEqual(diagnostic.getvalue(), "lane claim comment unavailable: AttributeError\n")
        with patch.object(client, "comment", side_effect=KeyboardInterrupt("operator-stop")):
            with self.assertRaises(KeyboardInterrupt): lane.notify_issue_claim(client, issue(), "devin", {"model": "m"})

    def test_comment_rejects_false_success(self):
        with patch.object(lane.Linear, "gql", return_value={"commentCreate": {"success": False}}):
            with self.assertRaises(RuntimeError): lane.Linear.__new__(lane.Linear).comment("id-JOV-3", "held")

    def test_reads_key_and_maps_lane_issues(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "linear.env"
            env.write_text('export LINEAR_API_KEY="lin_api_x"\n')
            client = lane.Linear(env)
            self.assertEqual(client.key, "lin_api_x")
            payload = {"data": {"issues": {"pageInfo": {"hasNextPage": False}, "nodes": [{
                "id": "i1", "identifier": "JOV-5", "title": "t", "description": None, "priority": 2,
                "createdAt": "2026-09-01T00:00:00Z", "labels": {"nodes": [{"name": "devin"}]}}]}}}
            real = lane.urllib.request.urlopen

            class Response:
                def __init__(self, body):
                    self.body = body

                def __enter__(self):
                    return self

                def __exit__(self, *exc):
                    return False

                def read(self):
                    return json.dumps(self.body).encode()

            seen = []

            def capture(request, timeout):
                seen.append(json.loads(request.data))
                return Response(payload)
            lane.urllib.request.urlopen = capture
            try:
                [found] = client.lane_issues("devin")
                self.assertEqual(seen[0]["variables"]["labels"], ["devin", lane.SHARED_LABEL])
                self.assertEqual((found.identifier, found.description, found.labels), ("JOV-5", "", ["devin"]))
                lane.urllib.request.urlopen = lambda request, timeout: Response({"errors": [{"message": "nope"}]})
                with self.assertRaises(RuntimeError):
                    client.gql("q", {})
            finally:
                lane.urllib.request.urlopen = real

    def test_lane_issue_reads_paginate_the_whole_todo_pool(self):
        client = lane.Linear.__new__(lane.Linear)
        node = lambda n: {"id": f"i{n}", "identifier": f"JOV-{n}", "title": "t", "description": None,
                          "priority": 2, "createdAt": "2026-09-01T00:00:00Z", "labels": {"nodes": []}}
        pages = [{"issues": {"pageInfo": {"hasNextPage": True, "endCursor": "c1"}, "nodes": [node(1)]}},
                 {"issues": {"pageInfo": {"hasNextPage": False, "endCursor": "c2"}, "nodes": [node(2)]}}]
        seen = []
        client.gql = lambda query, variables: (seen.append(variables["after"]), pages.pop(0))[1]
        self.assertEqual([i.identifier for i in client.lane_issues("codex")], ["JOV-1", "JOV-2"])
        self.assertEqual(seen, [None, "c1"])
        endless = {"issues": {"pageInfo": {"hasNextPage": True, "endCursor": "c"}, "nodes": [node(3)]}}
        client.gql = lambda query, variables: endless
        with self.assertRaises(lane.LaneInventoryUnknown):
            client.lane_issues("codex")

    def test_missing_key_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "linear.env"
            env.write_text("OTHER=1\n")
            with self.assertRaises(SystemExit):
                lane.Linear(env)


class NativeInventoryBoundaryTest(unittest.TestCase):
    def client(self, pages):
        client = lane.Linear.__new__(lane.Linear)
        calls = []
        def gql(query, variables):
            calls.append((query, variables["after"]))
            page = pages[len(calls) - 1]
            if isinstance(page, Exception):
                raise page
            return page
        client.gql = gql
        return client, calls

    def node(self, index):
        return {"id": str(index), "identifier": f"JOV-{index}", "title": "task", "description": "",
                "priority": 2, "createdAt": "2026-09-01T00:00:00Z", "labels": {"nodes": []}}

    def test_complete_native_candidate_and_ownership_scans_include_page101_and_dedupe(self):
        for method in ("lane_issues", "active_lane_issues"):
            first = [self.node(i) for i in range(100)]
            client, calls = self.client([
                {"issues": {"nodes": first, "pageInfo": {"hasNextPage": True, "endCursor": "next"}}},
                {"issues": {"nodes": [first[-1], self.node(100)], "pageInfo": {"hasNextPage": False}}},
            ])
            rows = getattr(client, method)("codex" if method == "lane_issues" else ["codex"])
            self.assertEqual(len(rows), 101)
            self.assertEqual([after for _, after in calls], [None, "next"])

    def test_native_scans_reject_unknown_coverage_without_increasing_request_cap(self):
        cases = [
            [{"issues": {"nodes": [self.node(1)]}}],
            [{"issues": {"nodes": [], "pageInfo": {"hasNextPage": True}}}],
            [{"issues": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "same"}}}] * 2,
            [{"issues": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": str(i)}}}
             for i in range(lane.LANE_ISSUE_PAGES)],
            [{"issues": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "next"}}}, RuntimeError("read failed")],
        ]
        for method in ("lane_issues", "active_lane_issues"):
            for pages in cases:
                with self.subTest(method=method, pages=len(pages)):
                    client, calls = self.client(pages)
                    with self.assertRaises(RuntimeError):
                        getattr(client, method)("codex" if method == "lane_issues" else ["codex"])
                    self.assertLessEqual(len(calls), lane.LANE_ISSUE_PAGES)
                    self.assertTrue(all(query.startswith("query(") for query, _ in calls))

    def test_partial_cross_host_inventory_is_unknown_and_old_cache_cannot_admit(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "cache-fixture"}), \
                patch.object(lane, "SHARED_CACHE_DIR", Path(tmp)), \
                patch.object(lane.file_overlap, "guard_mode", return_value="enforce"), \
                patch.object(lane.file_overlap, "local_tasks", return_value=[]), \
                patch.object(lane, "overlap_prs_summary", return_value=[]), \
                patch.object(lane, "load_providers", return_value={"codex": {"label": "codex"}}):
            (Path(tmp) / "file-overlap-tasks.json").write_text(json.dumps({"at": time.time(), "value": []}))
            (Path(tmp) / "claim-lane-issues-codex.json").write_text(json.dumps({"at": time.time(), "value": []}))
            pages = [{"issues": {"nodes": [self.node(1)], "pageInfo": {"hasNextPage": True}}}]
            client, calls = self.client(pages)
            self.assertIsNone(lane.overlap_inventory(SimpleNamespace(state=Path(tmp)), client))
            self.assertEqual(len(calls), 1)
            self.assertFalse((Path(tmp) / "file-overlap-tasks-v2.json").exists())
            client, calls = self.client(pages)
            with self.assertRaises(lane.LaneInventoryUnknown):
                client.lane_issues("codex")
            self.assertEqual(len(calls), 1)
            self.assertFalse((Path(tmp) / "claim-lane-issues-v2-codex.json").exists())


class LinearRateLimitTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        previous = os.environ.get("LANES_STATE")
        os.environ["LANES_STATE"] = str(self.state)
        def restore_state():
            if previous is None:
                os.environ.pop("LANES_STATE", None)
            else:
                os.environ["LANES_STATE"] = previous
        self.addCleanup(restore_state)
        self.env = self.state / "linear.env"
        self.env.write_text('export LINEAR_API_KEY="lin_api_test_secret"\n')
        self.client = lane.Linear(self.env)
        self.real_open = lane.urllib.request.urlopen
        self.addCleanup(lambda: setattr(lane.urllib.request, "urlopen", self.real_open))

    def headers(self, **extra):
        message = EmailMessage()
        message["X-RateLimit-Requests-Remaining"] = extra.pop("remaining", "100")
        message["X-RateLimit-Requests-Limit"] = extra.pop("limit", "2500")
        message["X-RateLimit-Requests-Reset"] = extra.pop("reset", "1730000000000")
        for name, value in extra.items():
            message[name] = value
        return message

    def response(self, payload, headers):
        raw = json.dumps(payload).encode()

        class Handle:
            def read(self):
                return raw

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        handle = Handle()
        handle.headers = headers
        return handle

    def http_error(self, status, body, headers):
        return lane.urllib.error.HTTPError(lane.LINEAR_API_URL, status, "limited", headers, io.BytesIO(body))

    def test_429_and_400_ratelimited_open_a_hashed_cooldown(self):
        bodies = {
            429: b"",
            400: json.dumps({"errors": [{"message": "slow", "extensions": {"code": "RATELIMITED"}}]}).encode(),
        }
        for status, body in bodies.items():
            with self.subTest(status=status):
                os.environ["LANES_STATE"] = str(self.state / str(status))
                client = lane.Linear(self.env)
                lane.urllib.request.urlopen = lambda request, timeout, status=status, body=body: (_ for _ in ()).throw(
                    self.http_error(status, body, self.headers(remaining="0")))
                with patch.object(lane.random, "random", return_value=0), self.assertRaises(lane.LinearRateLimited):
                    client.gql("query", {})
                path = lane.linear_cooldown_path(client.key)
                record = json.loads(path.read_text())
                scope = hashlib.sha256(f"{lane.LINEAR_API_URL}\0{client.key}".encode()).hexdigest()
                self.assertEqual(path.parent.name, scope)
                self.assertRegex(path.name, r"^\d+-[0-9a-f-]+\.json$")
                self.assertNotIn(client.key, path.read_text())
                self.assertNotIn(client.key, str(path))
                self.assertEqual(record["schema"], 1)
                self.assertAlmostEqual(record["resetAt"] / 1000, time.time() + lane.LINEAR_RATE_LIMIT_BASE_S, delta=2)
                budget = json.loads((Path(os.environ["LANES_STATE"]) / "api-budget.json").read_text())
                self.assertEqual((budget["remaining"], budget["limit"]), (0, 2500))
                self.assertIsNotNone(budget["rateLimitedAt"])

    def test_js_and_python_root_precedence_agree_for_the_existing_backoff_override(self):
        backoff = Path(self.tmp.name) / "backoff-override"
        default = Path(self.tmp.name) / "default-lanes"
        with patch.dict(os.environ, {"LINEAR_BACKOFF_STATE_DIR": str(backoff)}, clear=True), \
                patch.object(lane, "lane_state_dir", side_effect=lambda: Path(os.environ.get("LANES_STATE", str(default)))):
            self.assertEqual(lane.linear_cooldown_root(), backoff)
            os.environ["LANES_STATE"] = str(self.state)
            self.assertEqual(lane.linear_cooldown_root(), self.state / "linear-cooldown")
            os.environ["LINEAR_COOLDOWN_STATE_DIR"] = str(default / "explicit")
            self.assertEqual(lane.linear_cooldown_root(), default / "explicit")

    def test_cooldown_is_shared_across_workers_and_expires(self):
        headers = self.headers(remaining="0")
        headers["Retry-After"] = "90"
        lane.urllib.request.urlopen = lambda request, timeout: (_ for _ in ()).throw(self.http_error(429, b"", headers))
        with self.assertRaises(lane.LinearRateLimited):
            self.client.gql("query", {})
        calls = []
        lane.urllib.request.urlopen = lambda request, timeout: calls.append(request) or self.response({"data": {"ok": True}}, self.headers())
        other = lane.Linear(self.env)
        with self.assertRaises(lane.LinearRateLimited) as caught:
            other.gql("query", {})
        self.assertEqual(calls, [], "a second worker must honor the cooldown file")
        self.assertGreater(caught.exception.reset_at, time.time() + 60)
        scope = lane.linear_cooldown_scope(self.client.key)
        for child in scope.iterdir():
            child.unlink()
        expired = int((time.time() - 5) * 1000)
        record = scope / f"{expired}-dead.json"
        record.write_text(json.dumps({"schema": 1, "resetAt": expired}))
        record.chmod(0o644)
        self.assertEqual(lane._scan_scope(scope, int(time.time() * 1000)), 0)
        self.assertTrue(record.exists(), "cleanup must preserve nonprivate records")
        record.chmod(0o600)
        self.assertEqual(other.gql("query", {})["ok"], True)
        self.assertEqual(len(calls), 1)
        self.assertFalse(record.exists())

    def test_later_cooldown_is_kept_when_a_shorter_one_arrives(self):
        long_headers = self.headers()
        long_headers["Retry-After"] = "180"
        short_headers = self.headers()
        short_headers["Retry-After"] = "1"
        with patch.object(lane.random, "random", return_value=0):
            first = lane.publish_linear_cooldown(self.client.key, long_headers, now=1_000_000)
            second = lane.publish_linear_cooldown(self.client.key, short_headers, now=1_000_010)
        self.assertEqual(second, first)
        self.assertGreater(first, 1_000_000 + 120)

    def test_ordinary_400_does_not_cool_down(self):
        body = json.dumps({"errors": [{"message": "nope", "extensions": {"code": "INPUT_ERROR"}}]}).encode()
        lane.urllib.request.urlopen = lambda request, timeout: (_ for _ in ()).throw(
            self.http_error(400, body, self.headers()))
        with self.assertRaises(lane.urllib.error.HTTPError):
            self.client.gql("query", {})
        self.assertIsNone(lane.linear_cooldown_path(self.client.key) and lane.linear_cooldown_until(self.client.key))
        self.assertFalse((self.state / "linear-cooldown").exists())

    def test_http_200_ratelimited_opens_the_same_cooldown(self):
        payload = {"errors": [{"message": "slow", "extensions": {"code": "RATELIMITED", "statusCode": 429}}]}
        lane.urllib.request.urlopen = lambda request, timeout: self.response(payload, self.headers(remaining="0"))
        with patch.object(lane.random, "random", return_value=0), self.assertRaises(lane.LinearRateLimited) as caught:
            self.client.gql("query", {})
        self.assertGreater(caught.exception.reset_at, time.time() + 59)
        self.assertIsNotNone(lane.linear_cooldown_until(self.client.key))
        calls = []
        lane.urllib.request.urlopen = lambda request, timeout: calls.append(1) or self.response({"data": {"ok": True}}, self.headers())
        with self.assertRaises(lane.LinearRateLimited):
            lane.Linear(self.env).gql("query", {})
        self.assertEqual(calls, [])

    def test_legacy_single_file_and_orchestrator_directory_are_honored(self):
        now_ms = int((time.time() + 90) * 1000)
        root = self.state / "linear-cooldown"
        root.mkdir()
        legacy = root / f"{hashlib.sha256(self.client.key.encode()).hexdigest()}.json"
        legacy.write_text(json.dumps({"schema": 1, "resetAt": now_ms}))
        calls = []
        lane.urllib.request.urlopen = lambda request, timeout: calls.append(1) or self.response({"data": {"ok": True}}, self.headers())
        with self.assertRaises(lane.LinearRateLimited):
            self.client.gql("query", {})
        self.assertEqual(calls, [])
        legacy.unlink()
        scope = hashlib.sha256(f"{lane.LINEAR_API_URL}\0{self.client.key}".encode()).hexdigest()
        old = Path(self.tmp.name) / "jovie-linear-backoff" / scope
        old.mkdir(parents=True)
        (old / f"{now_ms}-abcd.json").write_text(json.dumps({"schema": 1, "resetAt": now_ms}))
        previous = os.environ.get("LINEAR_BACKOFF_STATE_DIR")
        os.environ["LINEAR_BACKOFF_STATE_DIR"] = str(Path(self.tmp.name) / "jovie-linear-backoff")
        try:
            with self.assertRaises(lane.LinearRateLimited):
                self.client.gql("query", {})
        finally:
            if previous is None:
                os.environ.pop("LINEAR_BACKOFF_STATE_DIR", None)
            else:
                os.environ["LINEAR_BACKOFF_STATE_DIR"] = previous
        self.assertEqual(calls, [])

    def test_budget_headers_reach_api_budget_and_doctor_json(self):
        (self.state / "doctor.json").write_text(json.dumps({"schema": "keep-me", "alerts": []}))
        lane.urllib.request.urlopen = lambda request, timeout: self.response(
            {"data": {"ok": 1}}, self.headers(remaining="2400", limit="2500", reset="1730000000000"))
        self.assertEqual(self.client.gql("query", {})["ok"], 1)
        budget = json.loads((self.state / "api-budget.json").read_text())
        self.assertEqual((budget["remaining"], budget["limit"], budget["reset"], budget["rateLimitedAt"]),
                         (2400, 2500, 1730000000000, None))
        doctor = json.loads((self.state / "doctor.json").read_text())
        self.assertEqual(doctor["schema"], "keep-me")
        self.assertEqual(doctor["linearBudget"]["remaining"], 2400)
        report = {}
        lane.doctor.apply_linear_budget(report, self.state)
        self.assertEqual(report["linearBudget"]["limit"], 2500)
        lane.doctor.apply_linear_budget(report, self.state / "missing")
        self.assertEqual(report["linearBudget"]["limit"], 2500)

    def test_failed_budget_write_never_raises(self):
        lane.urllib.request.urlopen = lambda request, timeout: self.response({"data": {"ok": 1}}, self.headers())
        with patch.object(lane, "_write_state_json", side_effect=OSError("read-only state dir")):
            self.assertEqual(self.client.gql("query", {})["ok"], 1)
        headers = self.headers(remaining="0")
        lane.urllib.request.urlopen = lambda request, timeout: (_ for _ in ()).throw(self.http_error(429, b"", headers))
        with patch.object(lane, "_write_state_json", side_effect=OSError("read-only state dir")):
            with self.assertRaises(lane.LinearRateLimited):
                self.client.gql("query", {})

    def test_doctor_observe_skips_linear_during_a_cooldown(self):
        os.environ["LANES_SELFTEST"] = "1"
        self.addCleanup(lambda: os.environ.pop("LANES_SELFTEST", None))
        with patch.object(lane.random, "random", return_value=0):
            lane.publish_linear_cooldown(self.client.key, self.headers(), now=time.time())
        host = lane.Host()
        host.state = self.state
        host.linear_env = self.env
        called = []

        def boom(*_args, **_kwargs):
            called.append(1)
            raise AssertionError("linear pool read")

        with patch.object(lane.doctor, "qualified_pool", boom), \
                patch.object(lane.doctor, "host_capacity", lambda *_a, **_k: {}), \
                patch.object(lane, "load_github_env", lambda: None), \
                patch.object(lane, "graphql_budget", lambda: None):
            obs = lane.doctor.observe(host, lane, SimpleNamespace(status=lambda: {"accounts": {}}))
        self.assertEqual(called, [])
        self.assertEqual(obs["linearSkipped"], "cooldown")
        self.assertIsNone(obs["linearError"])


class HeldPruneTest(unittest.TestCase):
    def test_drops_terminal_and_expired_heads_and_stops_at_the_bound(self):
        now = 1_700_000_000.0
        held = {
            "1": {"sha": "aaa", "at": now - 10},
            "2": {"sha": "old", "at": now - lane.HELD_STALE_HEAD_S - 5},
            "3": {"sha": "bbb", "at": now - 10},
            "4": {"sha": "recent", "at": now - 10},
            "nope": {"sha": "x"},
        }
        open_prs = [
            {"number": 1, "headRefOid": "aaa"},
            {"number": 2, "headRefOid": "new"},
            {"number": 4, "headRefOid": "newer"},
        ]
        self.assertEqual(lane.held_drop_keys(held, open_prs, now, complete=False), ["nope"])
        self.assertEqual(set(lane.held_drop_keys(held, open_prs, now, complete=True)), {"2", "3", "nope"})
        crowded = {str(number): {"sha": "x", "at": now - number} for number in range(300)}
        self.assertEqual(len(lane.held_drop_keys(crowded, open_prs, now, complete=True)), lane.HELD_PRUNE_LIMIT)
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host()
            host.state = Path(tmp)
            (host.state / "held.json").write_text(json.dumps(held))
            dropped = lane.prune_held(host, open_prs, now, complete=True)
            left = set(json.loads((host.state / "held.json").read_text()))
        self.assertEqual(dropped, 3)
        self.assertEqual(left, {"1", "4"})


class ClaimScanCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.saved = (lane.SHARED_CACHE_DIR, os.environ.pop("LANES_EXECUTION_BACKEND", None), lane.sh,
                      lane.lane_prs, lane.repo_prs)
        lane.SHARED_CACHE_DIR = Path(self.tmp.name)
        self.summary = dict(lane._SUMMARY)
        lane._SUMMARY.update(at=0.0, prs=[], readable=False)
        self.clock = {"now": 1_700_000_000.0}
        self.counts = {"issues": 0, "fix": 0, "flight": 0, "queued": 0}

    def tearDown(self):
        lane.SHARED_CACHE_DIR, backend, lane.sh, lane.lane_prs, lane.repo_prs = self.saved
        if backend is None:
            os.environ.pop("LANES_EXECUTION_BACKEND", None)
        else:
            os.environ["LANES_EXECUTION_BACKEND"] = backend
        lane._SUMMARY.clear()
        lane._SUMMARY.update(self.summary)
        self.tmp.cleanup()

    def test_cache_hits_within_ttl_and_refreshes_after_it(self):
        self.assertLessEqual(lane.CLAIM_SCAN_TTL_S, 60)

        def gql(query, variables):
            self.counts["issues"] += 1
            after = variables.get("after")
            node = lambda n: {"id": f"i{n}", "identifier": f"JOV-{n}", "title": "t", "description": None,
                              "priority": 2, "createdAt": "2026-09-01T00:00:00Z", "labels": {"nodes": []}}
            if after is None:
                return {"issues": {"pageInfo": {"hasNextPage": True, "endCursor": "c1"}, "nodes": [node(1)]}}
            return {"issues": {"pageInfo": {"hasNextPage": False, "endCursor": "c2"}, "nodes": [node(2)]}}

        client = lane.Linear.__new__(lane.Linear)
        client.gql = gql
        lane.lane_prs = lambda name, providers=None, fields="": self.counts.__setitem__("fix", self.counts["fix"] + 1) or [
            {"number": 1, "headRefName": "devin/jov-1-20260901", "isDraft": False}]
        lane.repo_prs = lambda: []

        def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
            if "--search" in args:
                self.counts["queued"] += 1
            else:
                self.counts["flight"] += 1
            return SimpleNamespace(returncode=0, stdout="[]")
        lane.sh = fake_sh

        def read_all():
            issues = client.lane_issues("codex")
            fixes = lane.fix_candidates("codex")
            flight = lane.in_flight_issues()
            queued = lane.pr_events.queued_prs(lane, ("red",))
            return issues, fixes, flight, queued

        def inventory(_module):
            self.counts["queued"] += 1
            return []
        with patch.object(lane.time, "time", lambda: self.clock["now"]), \
                patch.object(lane.pr_events, "open_prs_state", side_effect=inventory):
            issues, fixes, flight, queued = read_all()
            self.assertEqual([item.identifier for item in issues], ["JOV-1", "JOV-2"])
            self.assertEqual(fixes[0]["number"], 1)
            self.assertEqual(flight, frozenset())
            self.assertEqual(queued, [])
            self.assertEqual(self.counts, {"issues": 2, "fix": 1, "flight": 1, "queued": 1})
            read_all()
            self.assertEqual(self.counts, {"issues": 2, "fix": 1, "flight": 1, "queued": 1},
                             "a second worker inside the TTL must not scan again")
            self.clock["now"] += lane.CLAIM_SCAN_TTL_S + 1
            read_all()
            self.assertEqual(self.counts, {"issues": 4, "fix": 2, "flight": 2, "queued": 2})

    def test_pagination_runs_only_as_the_cache_fill(self):
        calls = []
        client = lane.Linear.__new__(lane.Linear)
        client.gql = lambda *args, **kwargs: calls.append(1)
        saved = lane.shared

        def cached(key, ttl, fetch):
            self.assertEqual(key, "claim-lane-issues-v2-codex")
            self.assertLessEqual(ttl, 60)
            self.assertEqual(calls, [], "pagination must not run before the cache fill")
            return [{"id": "i", "identifier": "JOV-9", "title": "t", "description": "", "priority": 1,
                     "created_at": "2026-09-01T00:00:00Z", "labels": ["codex"]}]
        lane.shared = cached
        try:
            found = client.lane_issues("codex")
        finally:
            lane.shared = saved
        self.assertEqual(calls, [])
        self.assertEqual((found[0].identifier, found[0].labels), ("JOV-9", ["codex"]))

    def test_hud_reason_queue_and_sweep_state_share_one_minute(self):
        import hud
        import reason_lane
        import lane_runner as reason_cache
        calls = {"hud": 0, "reason": 0, "state": 0}

        class Client:
            def gql(self, query, variables):
                if "labels:{name:{eq:$l}}" in query:
                    calls["reason"] += 1
                    return {"issues": {"nodes": [{"id": "i", "identifier": "JOV-1", "title": "t",
                                                  "description": "", "createdAt": "1"}]}}
                calls["hud"] += 1
                return {"pool": {"nodes": []}, "triage": {"nodes": []}}

            def state_of(self, issue_id):
                calls["state"] += 1
                return "In Progress"

        client = Client()
        saved = hud.lane.Linear, hud.lane.SHARED_CACHE_DIR, reason_cache.SHARED_CACHE_DIR
        hud.lane.Linear = lambda env: client
        # Full CI collection can load another lane_runner module. Isolate the
        # module queued_jobs actually imports as well as the HUD's module.
        hud.lane.SHARED_CACHE_DIR = lane.SHARED_CACHE_DIR
        reason_cache.SHARED_CACHE_DIR = lane.SHARED_CACHE_DIR
        try:
            with patch.object(lane.time, "time", lambda: self.clock["now"]), \
                    patch.object(hud.lane.time, "time", lambda: self.clock["now"]):
                self.assertEqual(reason_lane.queued_jobs(client, "reasoning-job")[0]["identifier"], "JOV-1")
                reason_lane.queued_jobs(client, "reasoning-job")
                self.assertEqual(lane.cached_issue_state(client, "JOV-9"), "In Progress")
                lane.cached_issue_state(client, "JOV-9")
                self.assertTrue(hud.linear_model(Path("/x"))["ok"])
                hud.linear_model(Path("/x"))
                self.assertEqual(calls, {"hud": 1, "reason": 1, "state": 1})
                self.clock["now"] += lane.CLAIM_SCAN_TTL_S + 1
                reason_lane.queued_jobs(client, "reasoning-job")
                lane.cached_issue_state(client, "JOV-9")
                hud.linear_model(Path("/x"))
                self.assertEqual(calls, {"hud": 2, "reason": 2, "state": 2})
        finally:
            hud.lane.Linear, hud.lane.SHARED_CACHE_DIR, reason_cache.SHARED_CACHE_DIR = saved


class HostHandoffAdmissionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))

    def test_host_disabled_handoffs_are_not_probed_or_selected(self):
        providers = {"claude": {"slots": 2}, "hyperagent": {"slots": 2}}
        with patch.dict(os.environ, {"LANES_SLOTS_CLAUDE": "0", "LANES_SLOTS_HYPERAGENT": "0"}), \
                patch.object(lane, "provider_healthy", return_value=True) as healthy:
            self.assertIsNone(lane.next_provider(self.host, set(), providers))
            healthy.assert_not_called()

    def test_effective_nonpositive_slots_exclude_handoffs(self):
        providers = {"codex": {"slots": 3}}
        for slots in (0, -1):
            with self.subTest(slots=slots), patch.object(self.host, "slots", return_value=slots), \
                    patch.object(lane, "provider_healthy", return_value=True) as healthy:
                self.assertIsNone(lane.next_provider(self.host, set(), providers))
                healthy.assert_not_called()

    def test_host_limits_preserve_deterministic_router_order(self):
        providers = {"claude": {"slots": 2, "tier": 0},
                     "codex": {"slots": 3, "tier": 2},
                     "devin": {"slots": 2, "tier": 1}}
        with patch.dict(os.environ, {"LANES_SLOTS_CLAUDE": "0", "LANES_SLOTS_CODEX": "3",
                                     "LANES_SLOTS_DEVIN": "2", "SYMPHONY_AUTOSCALE": "0"}), \
                patch.object(lane, "provider_healthy", return_value=True):
            self.assertEqual(lane.next_provider(self.host, set(), providers)[0], "devin")
            self.assertEqual(lane.next_provider(self.host, {"devin"}, providers)[0], "codex")
            self.assertIsNone(lane.next_provider(self.host, {"devin", "codex"}, providers))

    def test_zero_slot_worker_does_not_claim_a_new_issue(self):
        with patch.dict(os.environ, {"LANES_SLOTS_CLAUDE": "0"}), \
                patch.object(lane, "load_providers", return_value={"claude": {"slots": 2}}), \
                patch.object(lane, "worker_with_slot") as work:
            self.assertEqual(lane.worker(self.host, "claude"), 0)
            work.assert_not_called()
        self.assertFalse((self.host.state / "slots").exists())

    def test_reexec_preserves_explicit_host_limits_in_the_current_release(self):
        current = self.host.state / "current"
        current.mkdir()
        bounds = {"LANES_SLOTS_DEVIN": "2", "LANES_SLOTS_CODEX": "3",
                  "LANES_SLOTS_CLAUDE": "0", "LANES_SLOTS_HYPERAGENT": "0",
                  "LANES_SLOTS_GROK": "0", "LANES_SLOTS_KIMI": "0", "SYMPHONY_AUTOSCALE": "0"}
        (current / "lane_runner.py").write_text(
            "import json, os, sys\n"
            "print(json.dumps({'argv': sys.argv[1:], 'bounds': "
            "{key: os.environ.get(key) for key in " + repr(list(bounds)) + "}}))\n")
        script = ("import sys; from pathlib import Path; "
                  f"sys.path.insert(0, {str(ROOT / 'scripts/lanes')!r}); "
                  "import lane_runner as lane; "
                  f"lane.reexec(lane.Host(state=Path({str(self.host.state)!r})), 'codex')")
        result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True,
                                timeout=10, env={**lane.selftest_env(self.host.state), **bounds})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout),
                         {"argv": ["worker", "--provider", "codex"], "bounds": bounds})


class RunIssueTest(unittest.TestCase):
    def setUp(self):
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        self.real_sh, self.real_verify, self.real_pack = lane.sh, lane.verify_and_land, lane.context_pack
        self.real_next = lane.next_provider
        lane.next_provider = lambda *a, **k: None  # no live provider health checks in unit tests
        lane.context_pack = lambda issue: "ctx"
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))

        def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.sh = fake_sh

    def tearDown(self):
        lane.sh, lane.verify_and_land, lane.context_pack = self.real_sh, self.real_verify, self.real_pack
        lane.next_provider = self.real_next
        self.tmp.cleanup()

    def ledger(self):
        return [json.loads(line) for line in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()]

    def test_success_writes_prompt_log_and_receipt(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
        receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"], "model": "swe-2-medium"},
                                 FakeLinear([]), issue("JOV-8"))
        self.assertEqual((receipt["verdict"], receipt["agentExit"], receipt["pr"]), ("landing", 0, 9))
        self.assertEqual(self.ledger()[0]["runId"], receipt["runId"])
        prompt = next((self.host.state / "runs").glob("*.prompt.md")).read_text()
        self.assertIn("ctx", prompt)
        self.assertEqual(receipt["origin"], "autonomous-lane")
        self.assertEqual(receipt["linearIssueId"], "id-JOV-8")
        self.assertEqual(receipt["offer"], {"eligible": True, "accepted": True})
        self.assertEqual(receipt["attribution"]["category"], "autonomous-created")
        self.assertTrue(receipt["branch"].startswith("devin/jov-8-"))
        self.assertIn(receipt["runId"], receipt["worktree"])
        self.assertEqual(receipt["result"], {"verdict": "landing", "commit": None, "pr": 9, "prUrl": None})
        manifest = receipt["contextManifests"][0]
        body = Path(manifest["path"]).read_bytes()
        context = json.loads(body)
        self.assertEqual(manifest["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual(context["provider"], "devin")
        self.assertEqual(context["prompt"]["sha256"], hashlib.sha256(prompt.encode()).hexdigest())
        self.assertEqual(self.ledger()[0]["contextManifests"], receipt["contextManifests"])

    def test_unknown_pr_readback_preserves_source_and_failed_unknown_attempt(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "pr-readback-pending", "reasons": ["pr-inventory-unavailable"],
                                               "prReadback": {"state": "unknown", "branch": "existing-branch"}}
        with patch.object(lane, "remove_worktree") as remove:
            receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue("JOV-8034"))
        remove.assert_not_called()
        self.assertTrue(Path(receipt["preservedWorktree"]).is_dir())
        self.assertEqual(receipt["result"]["prReadback"]["state"], "unknown")
        self.assertEqual(receipt["execution"]["result"], "failed_unknown")
        self.assertEqual(receipt["execution"]["retryDecision"], "stop")
        self.assertEqual(self.ledger()[-1]["result"], receipt["result"])

    def test_deferred_or_reused_gate_does_not_quarantine_completed_implementation(self):
        for index, verdict in enumerate(("gate-in-progress", "gate-deferred", "gate-already-completed")):
            with self.subTest(verdict=verdict):
                lane.verify_and_land = lambda *a, **k: {"verdict": verdict, "pr": 9, "reasons": []}
                receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]},
                                         FakeLinear([]), issue(f"JOV-{100 + index}"))
                self.assertEqual(receipt["execution"]["terminalState"], "succeeded")
                self.assertEqual(receipt["verdict"], verdict)

    def test_context_contract_drift_does_not_prevent_agent_execution(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
        with patch.object(lane, "context_manifest_json", return_value="drift"), \
                patch.object(lane, "run_agent", wraps=lane.run_agent) as agent:
            receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        self.assertEqual(receipt["verdict"], "landing")
        self.assertIn("context-manifest-drift", receipt["contextManifests"][0]["qualification"]["findings"][0])
        agent.assert_called_once()
        self.assertEqual(self.ledger()[0]["contextManifests"], receipt["contextManifests"])

    def test_context_receipt_failure_is_isolated_but_prompt_write_failure_still_blocks(self):
        original = Path.write_bytes
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
        for index, (suffix, verdict) in enumerate([(".context.json", "landing"), (".prompt.md", "failed")]):
            def write(path, data):
                if path.name.endswith(suffix):
                    raise OSError("volume unavailable")
                return original(path, data)
            with patch.object(Path, "write_bytes", write), \
                    patch.object(lane, "run_agent", wraps=lane.run_agent) as agent:
                receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue(f"JOV-{index + 1}"))
            self.assertEqual(receipt["verdict"], verdict)
            if suffix == ".context.json":
                agent.assert_called_once()
                context = receipt["contextManifests"][0]
                self.assertIsNone(context["path"])
                self.assertIn("volume unavailable", context["qualification"]["findings"][0])
            else:
                agent.assert_not_called()
                self.assertIn("volume unavailable", receipt["reasons"][0])

    def test_agent_that_never_worked_is_a_provider_error(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        receipt = lane.run_issue(self.host, "devin", {"cmd": ["false"]}, FakeLinear([]), issue())
        self.assertEqual((receipt["verdict"], receipt["reasons"]), ("provider-error", ["agent-exit:1"]))

    def test_hyperagent_without_actual_dispatch_proof_holds_before_any_provider_process(self):
        for api in ({"__name__": "hyperagent"}, {"mcp_call": None}, ["invalid-api"]):
            with self.subTest(api=api), patch("runpy.run_path", return_value=api), \
                    patch.object(lane.shutil, "which", return_value="/fake/hyperagent"):
                receipt = lane.run_issue(self.host, "hyperagent", {"cmd": ["false"], "model": "z-ai/glm-5.3"},
                                         FakeLinear([]), issue("JOV-6871"))
                self.assertEqual(receipt["verdict"], "remote-held")
                self.assertEqual(receipt["reasons"], ["remote-preflight-unverified"])
                self.assertNotIn("agentExit", receipt)
                self.assertFalse((self.host.state / "worktrees").exists())
                self.assertEqual(self.ledger()[-1]["verdict"], "remote-held")

    def test_an_exhausted_provider_hands_off_to_the_next_lane_on_the_same_worktree(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 11, "reasons": []}
        seen = []

        def nxt(host, exclude, providers=None):
            seen.append(set(exclude))
            return ("devin", {"cmd": [sys.executable, "-c", "import os; open('done.txt','w').write(os.getcwd())"]}) \
                if "devin" not in exclude else None
        lane.next_provider = nxt
        receipt = lane.run_issue(self.host, "codex", {"cmd": [sys.executable, "-c", "raise SystemExit(75)"]},
                                 FakeLinear([]), issue("JOV-9"))
        self.assertEqual(receipt["verdict"], "landing")
        self.assertEqual(receipt["handoffs"], [{"from": "codex", "to": "devin", "exit": 75, "reason": "provider-error"}])
        self.assertEqual(receipt["finishedBy"], "devin")
        self.assertEqual(receipt["agentExit"], 0)
        self.assertEqual(seen[0], {"codex"})
        self.assertTrue(lane.cooling(self.host, "codex"))
        handoff = next((self.host.state / "runs").glob("*.handoff1.prompt.md")).read_text()
        self.assertIn("Do not start over", handoff)
        self.assertIn("ctx", handoff)
        self.assertEqual(len(receipt["contextManifests"]), 2)
        context = json.loads(Path(receipt["contextManifests"][1]["path"]).read_text())
        self.assertEqual((context["kind"], context["provider"]), ("handoff", "devin"))
        self.assertEqual(context["prompt"]["sha256"], hashlib.sha256(handoff.encode()).hexdigest())

    def test_next_provider_takes_the_cheapest_enabled_healthy_uncooled_lane(self):
        providers = {
            "devin": {"health": ["echo", "ok"], "healthy": "ok"},
            "codex": {"health": ["echo", "ok"], "healthy": "ok"},
            "claude": {"health": ["echo", "ok"], "healthy": "ok", "enabled": False},
            "grok": {"health": ["false"], "healthy": "ok"},
            "sakana": {"health": ["echo", "ok"], "healthy": "ok"},
        }
        lane.cool_down(self.host, "codex")
        pick = self.real_next(self.host, {"devin"}, providers)
        self.assertEqual(pick[0], "sakana")  # codex cooling, claude off, grok unhealthy
        self.assertIsNone(self.real_next(self.host, {"devin", "sakana"}, providers))

    def test_handoffs_are_capped_and_then_report_the_provider_error(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        order = iter(["devin", "claude", "hyperagent"])
        lane.next_provider = lambda host, exclude, providers=None: (next(order), {"cmd": ["false"]})
        receipt = lane.run_issue(self.host, "codex", {"cmd": ["false"]}, FakeLinear([]), issue())
        self.assertEqual(len(receipt["handoffs"]), lane.PROVIDER_HANDOFFS)
        self.assertEqual(receipt["verdict"], "provider-error")

    def test_explicit_decline_becomes_not_shippable(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        spec = {"cmd": [sys.executable, "-c", "print('NOT-SHIPPABLE: already fixed on main by #18196')"]}
        receipt = lane.run_issue(self.host, "claude", spec, FakeLinear([]), issue())
        self.assertEqual(receipt["verdict"], "not-shippable")
        self.assertEqual(receipt["reasons"], ["already fixed on main by #18196"])

    def test_a_crashing_harness_still_leaves_a_failed_receipt(self):
        def crash(*a, **k):
            raise ValueError("gh down")
        lane.verify_and_land = crash
        receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        self.assertEqual(receipt["verdict"], "failed")
        self.assertIn("harness-error:ValueError", receipt["reasons"][0])
        self.assertEqual(len(self.ledger()), 1)

    def test_a_claim_crash_still_leaves_a_failed_receipt(self):
        # JOV-7191: a coordinator error used to kill the worker before any receipt
        # existed, so every spawned worker looked like spawn-exit to the doctor.
        real_claim = lane.execution_attempt.claim

        def crash(*a, **k):
            raise RuntimeError("coordinator down")
        lane.execution_attempt.claim = crash
        try:
            receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        finally:
            lane.execution_attempt.claim = real_claim
        self.assertEqual(receipt["verdict"], "failed")
        self.assertIn("claim-error:RuntimeError:coordinator down", receipt["reasons"][0])
        self.assertEqual(self.ledger()[0]["runId"], receipt["runId"])

    def test_an_unadmitted_claim_still_leaves_a_receipt(self):
        real_claim = lane.execution_attempt.claim
        lane.execution_attempt.claim = lambda *a, **k: {"admitted": False, "reason": "duplicate_active"}
        try:
            receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        finally:
            lane.execution_attempt.claim = real_claim
        self.assertEqual((receipt["verdict"], receipt["reasons"]), ("duplicate-active", ["duplicate_active"]))
        self.assertEqual(self.ledger()[0]["runId"], receipt["runId"])
        self.assertEqual(receipt["result"], {"verdict": "duplicate-active", "commit": None,
                                           "pr": None, "prUrl": None})


class CapacityHorizonTest(unittest.TestCase):
    def test_one_receipt_covers_deadlines_routes_value_gaps_and_idle_incident(self):
        now = 1_000.0

        def account(remaining=50, deadline=None, *, credits=None, access=None, payment=False, available=True, observed="1970-01-01T00:16:40Z"):
            lease = {
                "provider": "openai", "planType": "pro", "usableCapacityRemaining": {"primary": {"remainingPercent": remaining}},
                "compatibility": {"cli": "codex", "harness": "symphony"},
                "nextNaturalResetAt": deadline, "earliestAccessLossAt": access,
                "credits": {"availableCount": len(credits or []), "details": credits or []},
                "subscription": {"paymentFailure": payment}, "usableBeforeUnavailability": 20,
                "throughput": {"estimatedDrainTimeS": 600, "sustainablePercentPerHour": 12,
                               "concurrency": 2, "fresh": True, "confidence": "observed"},
                "sources": {"capacity": {"observedAt": observed}},
            }
            return {"available": available, "capacityLease": lease}

        accounts = {
            "private@example.com": account(deadline=2000),
            "banked": account(deadline=2100, credits=[{"kind": "bankedReset"}, {"kind": "bankedReset"}]),
            "grace": account(deadline=4000, access=1500, payment=True),
            "promo": account(deadline=4000, credits=[{"kind": "promotional", "capacityLossAt": 1200}]),
            "inaccessible": account(deadline=1300, available=False),
            "unknown": account(deadline=None),
            "stale": account(deadline=1100, observed="1969-12-31T20:00:00Z"),
        }
        route = {"schema": "jovie.capacity-route-receipt/v1", "selectedJob": "JOV-9",
                 "selectedRoute": "codex", "selectedLeaseId": "codex:private@example.com",
                 "alternativesConsidered": [], "marginalValue": None,
                 "expectedCertifiedOutcome": "draft-pr-passing-repository-gate", "drainMode": "fast",
                 "modeTrigger": "deadline-risk", "reason": "highest compatible value",
                 "replanConditions": ["forecast-change"], "sourceGaps": []}
        horizon = lane.capacity_horizon(
            {"accounts": accounts}, [{"capacityRouteReceipt": route, "verdict": "landing"}],
            ["JOV-9"], idle_seconds=301, now=now)

        self.assertEqual((horizon["schema"], horizon["controls"]),
                         ("jovie.capacity-horizon/v1", "show-only"))
        self.assertEqual({row["event"]["kind"] for row in horizon["leases"]},
                         {"natural-reset", "access-loss", "promo-expiry", "unknown"})
        self.assertIn("payment grace ends", [row["event"]["label"] for row in horizon["leases"]])
        self.assertNotIn("private@example.com", json.dumps(horizon))
        selected = next(row for row in horizon["leases"] if row["route"])
        self.assertEqual((selected["mode"], selected["forecast"]["projectedUnused"],
                          selected["outcomes"]["certified"], selected["subscriptionStatus"],
                          selected["forecast"]["sustainablePercentPerHour"]), ("fast", 30, 1, "active", 12))
        self.assertEqual([row["kind"] for row in horizon["incidents"]].count("idle-with-qualified-work"), 1)
        self.assertEqual([row["kind"] for row in horizon["incidents"]].count("source-contract"), 1)
        stale = next(row for row in horizon["leases"] if row["freshness"]["status"] == "stale")
        self.assertIsNone(stale["event"]["countdownSeconds"])


class AttributionAndThroughputTest(unittest.TestCase):
    def test_receipts_outrank_branch_prefixes_and_preserve_distinct_roles(self):
        merged = {"number": 9, "headRefName": "codex/manual-looking", "createdAt": "2026-09-28T10:00:00Z",
                  "mergedAt": "2026-09-28T11:00:00Z"}
        receipts = [
            {"runId": "create", "issue": "JOV-9", "pr": 9, "provider": "devin",
             "startedAt": "2026-09-28T10:00:00Z"},
            {"runId": "review", "kind": "adopt", "pr": 9, "provider": "codex", "endedAt": "2026-09-28T10:30:00Z"},
            {"runId": "fix", "kind": "fix-red", "pr": 9, "provider": "codex", "verdict": "fix-pushed",
             "endedAt": "2026-09-28T10:45:00Z"},
        ]
        attributed = lane.pr_attribution(merged, receipts)
        self.assertEqual(attributed["category"], "cross-provider-finalizer")
        self.assertEqual((attributed["origin"], attributed["originProvider"], attributed["finalProvider"]),
                         ("autonomous-lane", "devin", "codex"))
        self.assertIn({"provider": "codex", "category": "review-only", "runId": "review"},
                      attributed["roles"])

    def test_unreceipted_codex_branches_are_not_counted_as_autonomous(self):
        recent = {"number": 1, "headRefName": "codex/manual", "createdAt": "2026-09-28T10:00:00Z",
                  "mergedAt": "2026-09-28T11:00:00Z"}
        old = {**recent, "number": 2, "createdAt": "2026-09-20T10:00:00Z"}
        self.assertEqual(lane.pr_attribution(recent, [])["category"], "manual-codex-app-created")
        self.assertEqual(lane.pr_attribution(old, [])["category"], "old-codex-branch-landed-later")
        self.assertNotEqual(lane.pr_attribution(recent, [])["origin"], "autonomous-lane")

    def test_provider_metrics_count_only_receipted_origin_as_landed_output(self):
        rows = [{"runId": "r", "issue": "JOV-9", "pr": 9, "provider": "codex", "agentExit": 0,
                 "startedAt": "2026-09-28T10:00:00Z", "endedAt": "2026-09-28T10:10:00Z",
                 "verdict": "landing", "execution": {"event": "attempt_finished"},
                 "providerEvidence": [{"provider": "codex", "event": "account-leased"}]}]
        merged = [{"number": 9, "headRefName": "codex/jov-9-x", "createdAt": "2026-09-28T10:00:00Z",
                   "mergedAt": "2026-09-28T10:30:00Z"},
                  {"number": 10, "headRefName": "codex/manual", "createdAt": "2026-09-28T10:00:00Z",
                   "mergedAt": "2026-09-28T10:20:00Z"}]
        report = lane.provider_throughput(rows, ["codex", "devin"], merged)
        codex = report["providers"]["codex"]
        self.assertEqual((codex["eligibleWorkOffered"], codex["workerStarts"], codex["productiveRuns"],
                          codex["prsCreated"], codex["firstPassGreen"], codex["accountLeases"],
                          codex["landedOutput"]), (1, 1, 1, 1, 1, 1, 1))
        self.assertEqual(codex["issueToPrSecondsP50"], 600)
        self.assertEqual(codex["issueToMergeSecondsP50"], 1800)
        self.assertEqual(report["landedByAttribution"],
                         {"autonomous-created": 1, "manual-codex-app-created": 1})


class WorkerTest(unittest.TestCase):
    def test_blocked_last_overlap_candidate_never_runs_or_claims_the_issue(self):
        self.linear.issues[0].description = "Edit `scripts/lanes/lane_runner.py`."
        existing = {"number": 1, "files": ["scripts/lanes/lane_runner.py"], "isDraft": False}
        with patch.object(lane, "overlap_inventory", return_value=([existing], [])), \
                patch.object(lane, "open_hotspot_holds", return_value={}), \
                patch.object(lane, "run_issue") as run, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            lane.worker(self.host, "devin")
        run.assert_not_called()
        self.assertEqual(self.linear.moves, [])

    def test_event_cleanup_waits_until_all_productive_selections_decline(self):
        for chosen in ("event", "poll", "adopt", "issue", "idle"):
            with self.subTest(chosen=chosen):
                self.linear.issues = [issue("JOV-3")] if chosen == "issue" else []
                with patch.object(lane.pr_events, "claim_event_pr", return_value={"number": 5} if chosen == "event" else None), \
                     patch.object(lane, "claim_red_pr", return_value={"number": 5} if chosen == "poll" else None), \
                     patch.object(lane, "claim_adoptable_pr", return_value=SimpleNamespace(pr={"number": 5}) if chosen == "adopt" else None), \
                     patch.object(lane, "fix_red_pr"), patch.object(lane, "adopt_pr"), \
                     patch.object(lane, "run_issue", return_value={"verdict": "landing", "prUrl": "u"}), \
                     patch.object(lane.pr_events, "cleanup_one_event") as cleanup:
                    lane.worker(self.host, "devin")
                    self.assertEqual(cleanup.call_count, int(chosen == "idle"))

    def test_pending_readback_does_not_reclaim_downgrade_or_charge_generic_retry(self):
        lane.run_issue = lambda *args: {"verdict": "pr-readback-pending", "reasons": ["pr-inventory-unavailable"]}
        self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertEqual(self.execs, [])
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertFalse(lane.failures_path(self.host).exists())
        seat = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        try: self.assertTrue(seat.held)
        finally: seat.release()

    def test_notification_error_releases_the_slot_even_while_traceback_is_retained(self):
        lane.run_issue = lambda *args: {"verdict": "landing", "prUrl": "u"}
        error = RuntimeError("notification unavailable")
        with patch.object(self.linear, "comment", side_effect=error):
            try: lane.worker(self.host, "devin")
            except RuntimeError as caught: retained = caught
            else: self.fail("notification failure must remain visible")
        self.assertIs(retained, error)
        contender = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        try: self.assertTrue(contender.held)
        finally: contender.release()

    def setUp(self):
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        self.saved = (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
                      lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
                      lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
                      lane.pr_events.claim_event_pr, lane.sweep_lane_prs, lane.read_new_issue_budget)
        lane.sweep_lane_prs = lambda host, name, linear, now=None: None
        lane.pr_events.queued_prs = lambda module, kinds: []
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: None
        lane.claim_red_pr = lambda host, name, prs=None: None
        lane.claim_adoptable_pr = lambda host, name, prs, repair_candidates=None: None
        lane.lane_prs = lambda name, fields="": []
        lane.read_new_issue_budget = lambda name, slots: lane.new_issue_budget(name, slots, lane.lane_prs(name, fields=lane.LIGHT_PR_FIELDS))
        lane.in_flight_issues = lambda: frozenset()  # never GitHub from a unit test
        lane.fix_candidates = lambda name: []
        lane.escalate_exhausted = lambda host, prs, linear: None
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name), linear_env=Path("unused"))
        self.linear = FakeLinear([issue("JOV-3")])
        lane.Linear = lambda env: self.linear
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "model": "m", "cmd": ["true"]}}
        self.execs = []
        lane.os.execv = lambda exe, args: self.execs.append(args)

    def tearDown(self):
        (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
         lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
         lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
         lane.pr_events.claim_event_pr, lane.sweep_lane_prs, lane.read_new_issue_budget) = self.saved
        self.tmp.cleanup()

    def test_initial_claim_failure_is_nonfatal_without_fabricating_delivery(self):
        import io
        client = self.saved[0].__new__(self.saved[0]); comment = self.linear.comment
        for failure in (None, OSError("private-network-message")):
            with self.subTest(failure=type(failure).__name__), patch.object(client, "gql", side_effect=failure, return_value={"commentCreate": {"success": False}}), patch.object(self.linear, "comment", side_effect=lambda ident, body: client.comment(ident, body) if "claimed this issue" in body else comment(ident, body)), patch.object(lane, "run_issue", return_value={"verdict": "landing", "prUrl": "u"}) as run, patch("sys.stderr", new_callable=io.StringIO) as diagnostic:
                lane.worker(self.host, "devin"); run.assert_called_once()
                self.assertEqual(diagnostic.getvalue(), f"lane claim comment unavailable: {'OSError' if failure else 'RuntimeError'}\n")
                self.assertFalse(any("claimed this issue" in body for _, body in self.linear.comments))
                slot = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
                try: self.assertTrue(slot.held)
                finally: slot.release()

    def test_verified_enqueue_retry_is_reported_without_false_queue_claim(self):
        lane.run_issue = lambda *args: {"verdict": "verified-not-queued", "prUrl": "u"}
        lane.worker(self.host, "devin")
        self.assertTrue(any("verified; enqueue retry pending" in body for _, body in self.linear.comments))
        self.assertFalse(any("is queued;" in body for _, body in self.linear.comments))

    def test_landing_claims_comments_and_pulls_the_next_issue(self):
        lane.run_issue = lambda *a: {"verdict": "landing", "prUrl": "u"}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertIn("passed the lane gate", self.linear.comments[-1][1])
        self.assertEqual(self.execs[0][-3:], ["worker", "--provider", "devin"])

    def test_rearming_publishes_outside_claim_lock_then_refreshes_admission(self):
        pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-7-20261002t0000",
              "state": "OPEN", "isDraft": False, "mergeStateStatus": "CLEAN", "labels": [],
              "statusCheckRollup": [{"name": "PR Ready", "status": "COMPLETED", "conclusion": "SUCCESS"}]}
        (self.host.state / "verified.json").write_text(json.dumps({"7:abc": gate_proof("abc")}))
        real_lock, scans, policies, calls, selected = lane.Locked, [], [], [], []
        def checked_lock(path, blocking):
            if path == self.host.state / "claim.lock" and blocking:
                probe = real_lock(path, False)
                try: self.assertTrue(probe.held, "nested claim acquisition would deadlock publication")
                finally: probe.release()
            return real_lock(path, blocking)
        def candidates(name):
            probe = real_lock(self.host.state / "claim.lock", False)
            try: self.assertFalse(probe.held, "cache scans remain serialized")
            finally: probe.release()
            scans.append(name)
            return [pr] if len(scans) == 1 else []
        def policy(pr, **kwargs):
            probe = real_lock(self.host.state / "claim.lock", False)
            try: self.assertTrue(probe.held, "slow policy runs outside the global claim lock")
            finally: probe.release()
            policies.append(kwargs["before_ready"])
            return None
        def shell(cmd, **kwargs):
            calls.append(cmd)
            return SimpleNamespace(returncode=0, stdout=publication_response(cmd), stderr="")
        lane.run_issue = lambda *args: {"verdict": "landing", "prUrl": "u"}
        lane.fix_candidates = candidates
        lane.claim_red_pr = lambda host, name, prs=None: selected.append(prs)
        with patch.object(lane, "Locked", side_effect=checked_lock), \
                patch.object(lane.remediation, "escalation_enabled", return_value=True), \
                patch.object(lane, "reconcile_fix_target", return_value=pr), \
                patch.object(lane, "claimed_elsewhere", return_value=False), \
                patch.object(lane, "source_publication_authority", side_effect=policy), \
                patch.object(lane, "sh", side_effect=shell):
            lane.worker(self.host, "devin")
        self.assertEqual(scans, ["devin", "devin"])
        self.assertEqual(policies, [True, False])
        self.assertEqual(selected, [[]], "admission uses the refreshed candidate inventory")
        writes = [cmd for cmd in calls if cmd[:3] == ["gh", "pr", "merge"]]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][-2:], ["--match-head-commit", "abc"])
        self.assertFalse(any("DELETE" in cmd for cmd in calls))

    def test_disk_cleanup_requires_a_slot_and_denial_releases_it_without_claiming(self):
        held = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        with patch.object(lane.disk_guard, "check") as check:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
            check.assert_not_called()
        held.release()
        def deny(host, *, sweep=False):
            self.assertTrue(sweep)
            contender = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
            self.assertFalse(contender.held, "the worker already owns its slot before cleanup")
            contender.release()
            return {"admitted": False, "reason": "disk-critical"}
        with patch.object(lane.disk_guard, "check", side_effect=deny):
            self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertEqual(self.linear.moves, [])
        self.assertEqual(self.execs, [])
        lock = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        self.assertTrue(lock.held)
        lock.release()

    def test_disk_failure_does_not_spend_issue_retries_or_reexec(self):
        lane.run_issue = lambda *args: {"verdict": "disk-held", "reasons": ["disk-critical"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Todo"))
        self.assertFalse(lane.failures_path(self.host).exists())
        self.assertEqual(self.execs, [])

    def test_recovery_handoff_keeps_an_accountable_disposition_without_spending_retries(self):
        handoff = lane.RecoveryHandoff("preserved-issue-needs-execution-reconciliation", Path("/retained"), "JOV-3")
        lane.run_issue = lambda *args: {"verdict": "recovery-handoff", "recovery": handoff.evidence}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Backlog"))
        self.assertIn("/retained", self.linear.comments[-1][1])
        self.assertIn("Recovery owner: JOV-3", self.linear.comments[-1][1])
        self.assertFalse(lane.failures_path(self.host).exists())
        self.assertEqual(len(self.execs), 1)

    def test_recovery_handoff_loop_backs_off_and_comments_once_jov_7690(self):
        # Replays JOV-7658 (2026-10-03): 95 claim -> recovery-handoff -> reexec cycles about
        # 2 s apart, one Linear move and comment each, until Linear rate-limited the pool.
        handoff = lane.RecoveryHandoff("preserved-issue-needs-execution-reconciliation", Path("/retained"), "JOV-3")
        runs = []
        lane.run_issue = lambda *args: runs.append(args[-1].identifier) or {
            "verdict": "recovery-handoff", "recovery": handoff.evidence}
        cooldowns = lane.handoff_cooldown_path(self.host)
        for _ in range(5):  # the hot loop: every reexec rescans immediately
            lane.worker(self.host, "devin")
        self.assertEqual(runs, ["JOV-3"], "a cooling issue is not re-claimed")
        row = json.loads(cooldowns.read_text())["JOV-3"]
        self.assertEqual(row["count"], 1)
        self.assertAlmostEqual(row["until"] - time.time(), lane.HANDOFF_BACKOFF_S, delta=30)
        spans = []
        # Freeze the clock: the span is the backoff the note wrote, not worker wall time.
        with patch("time.time", return_value=1_000_000_000.0):
            for _ in range(5):  # each cooldown expiry admits exactly one more claim
                data = json.loads(cooldowns.read_text()); before = data["JOV-3"]["count"]
                data["JOV-3"]["until"] = 0; cooldowns.write_text(json.dumps(data))
                start = time.time()
                lane.worker(self.host, "devin"); lane.worker(self.host, "devin")
                row = json.loads(cooldowns.read_text())["JOV-3"]
                self.assertEqual(row["count"], before + 1)
                spans.append(round(row["until"] - start, -1))
        self.assertEqual(len(runs), 6)
        self.assertEqual(spans, [600, 1200, 2400, 4800, 9600])
        self.assertEqual(lane.HANDOFF_BACKOFF_CAP_S, 21600)
        handoff_comments = [body for _, body in self.linear.comments if "Preserved work retained" in body]
        self.assertEqual(len(handoff_comments), 2, "first handoff and the Nth, never one per loop")
        self.assertIn(f"Handed back {lane.HANDOFF_COMMENT_AT} times", handoff_comments[1])
        self.assertFalse(lane.failures_path(self.host).exists())
        self.assertEqual(lane.note_recovery_handoff(self.host, "JOV-9", now=0)["until"], 300)
        for _ in range(20): capped = lane.note_recovery_handoff(self.host, "JOV-9", now=0)
        self.assertEqual(capped["until"], lane.HANDOFF_BACKOFF_CAP_S)

    def test_preserved_work_holds_its_issue_out_of_every_claim_path_jov_7690(self):
        worktrees = self.host.state / "worktrees"
        named = worktrees / "20261003T163759Z-JOV-7658-devin-0816ea"
        unnamed = worktrees / "20261003T183421Z-JOV-7632-devin-50b668"  # marker issue: null
        for path, marker_issue in ((named, "JOV-7658"), (unnamed, None)):
            path.mkdir(parents=True)
            (path / lane.disk_guard.PRESERVED_REPAIR).write_text(json.dumps(
                {"schema": "jovie-preserved-repair/v1", "runId": path.name, "pr": None, "issue": marker_issue}))
        (worktrees / "20261003T000000Z-JOV-5-devin-aaaaaa").mkdir()  # no marker: claimable
        held = lane.held_back_issues(self.host)
        self.assertEqual(held, frozenset({"JOV-7658", "JOV-7632"}))
        pool = [issue("JOV-7658", priority=1), issue("JOV-7632", priority=1), issue("JOV-5", priority=3)]
        self.assertEqual(lane.pick_issue(pool, {}, held_back=held).identifier, "JOV-5")
        self.assertEqual(lane.pick_issue(pool, {}).identifier, "JOV-7658", "default stays unchanged")
        lane.save_escalation(self.host, {"events": {"disk-low": {
            "status": "claimed", "lane": "devin", "running": False, "issueId": "id-JOV-7658",
            "identifier": "JOV-7658", "title": "t"}}})
        self.assertIsNone(lane.claim_labeled_event(self.host, "devin", self.linear))
        self.assertFalse(lane.load_escalation(self.host)["events"]["disk-low"].get("running"))

    def test_failures_retry_then_return_to_triage(self):
        lane.run_issue = lambda *a: {"verdict": "held", "reasons": ["code-change-without-test"]}
        for _ in range(3):
            lane.worker(self.host, "devin")
            failures = json.loads((self.host.state / "failures.json").read_text())
            failures["JOV-3"]["at"] = 0  # skip the retry backoff between attempts
            (self.host.state / "failures.json").write_text(json.dumps(failures))
        self.assertEqual([m[1] for m in self.linear.moves if m[1] != "In Progress"], ["Todo", "Todo", "Backlog"])
        self.assertEqual(json.loads((self.host.state / "failures.json").read_text())["JOV-3"]["count"], 3)

    def test_not_shippable_gets_a_terminal_disposition_without_a_failure(self):
        lane.run_issue = lambda *a: {"verdict": "not-shippable", "reasons": ["already fixed"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Backlog"))
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(len(self.execs), 1)

    def test_provider_error_cools_the_lane_without_charging_the_issue(self):
        lane.run_issue = lambda *a: {"verdict": "provider-error", "reasons": ["agent-exit:2"]}
        self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertTrue(lane.cooling(self.host, "devin"))
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Backlog"))
        self.assertEqual(self.execs, [])

    def test_red_prs_are_fixed_before_new_issues_are_claimed(self):
        fixed = []
        lane.claim_red_pr = lambda host, name, prs=None: {"number": 5}
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, self.linear.moves), ([5], []))
        self.assertEqual(len(self.execs), 1)

    def test_event_queued_prs_are_fixed_first_and_escalated_once(self):
        fixed, escalated = [], []
        lane.fix_candidates = lambda name: [{"number": 5}, {"number": 6}]
        lane.pr_events.queued_prs = lambda module, kinds: [{"number": 6, "eventKinds": ["red"]}]
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: prs[0]
        lane.claim_red_pr = lambda host, name, prs=None: self.fail("the event queue goes first")
        lane.escalate_exhausted = lambda host, prs, linear: escalated.append(sorted(pr["number"] for pr in prs))
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, escalated), ([6], [[5, 6]]))

    def test_late_remote_drafts_are_adopted_and_gated(self):
        adopted = []
        lane.claim_adoptable_pr = lambda host, name, prs, repair_candidates=None: SimpleNamespace(pr={"number": 8})
        lane.adopt_pr = lambda host, name, pr, **kwargs: adopted.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((adopted, self.linear.moves), ([8], []))

    def test_a_held_pr_keeps_its_issue_instead_of_retrying_a_new_pr(self):
        lane.run_issue = lambda *a: {"verdict": "held", "pr": 7, "prUrl": "u", "reasons": ["check-failed:x"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertIn("will fix it on that branch", self.linear.comments[-1][1])
        self.assertFalse((self.host.state / "failures.json").exists())

    def test_deferred_or_completed_duplicate_gate_does_not_charge_issue_retries(self):
        for verdict in ("gate-in-progress", "gate-deferred", "gate-already-completed"):
            with self.subTest(verdict=verdict):
                self.linear.moves.clear()
                lane.run_issue = lambda *a: {"verdict": verdict, "pr": 7, "prUrl": "u"}
                lane.worker(self.host, "devin")
                self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
                self.assertFalse(lane.failures_path(self.host).exists())
                self.assertIn("no new certification", self.linear.comments[-1][1])

    def test_an_issue_taken_by_another_host_meanwhile_is_not_started(self):
        started = []
        lane.run_issue = lambda *a, **k: started.append(a) or {"verdict": "landing"}
        self.linear.states = {"id-JOV-3": "In Progress"}
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual((self.linear.moves, started), ([], []))

    def test_a_disabled_lane_worker_exits_at_its_next_reexec(self):
        saved = lane.load_providers
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "enabled": False}}
        try:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        finally:
            lane.load_providers = saved
        self.assertFalse(list((self.host.state / "slots").glob("*.lock")) if (self.host.state / "slots").exists() else [])

    def test_unreadable_in_flight_set_claims_nothing(self):
        lane.in_flight_issues = lambda: None
        lane.run_issue = lambda *a: self.fail("an unknown in-flight set must not open a PR")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])

    def test_an_issue_with_an_open_pr_is_not_claimed_again(self):
        lane.in_flight_issues = lambda: frozenset({"JOV-3"})
        lane.run_issue = lambda *a: self.fail("duplicate PR for JOV-3")
        self.assertEqual(lane.worker(self.host, "devin"), 0)

    def test_a_clean_exit_at_the_claim_scan_is_recorded_for_the_doctor(self):
        """The doctor's spawn-exit rule trusts this marker to mean 'nothing claimable',
        not 'died on claim'; it must exist and name why the worker stopped."""
        lane.in_flight_issues = lambda: frozenset({"JOV-3"})
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        record = json.loads((self.host.state / "worker-idle.json").read_text())["devin"]
        self.assertEqual(record["reason"], "none-eligible")
        self.assertTrue(record["at"].endswith("Z"))

    def test_over_budget_and_unknown_in_flight_exits_name_their_reason(self):
        lane.lane_prs = lambda name, fields="": [{"number": 1, "headRefName": "devin/jov-1-20261002", "isDraft": True},
                                                 {"number": 2, "headRefName": "devin/jov-2-20261002", "isDraft": True}]
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(json.loads((self.host.state / "worker-idle.json").read_text())
                         ["devin"]["reason"], "over-budget")
        lane.lane_prs = lambda name, fields="": []
        lane.in_flight_issues = lambda: None
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(json.loads((self.host.state / "worker-idle.json").read_text())
                         ["devin"]["reason"], "in-flight-unknown")

    def test_a_crash_before_the_scan_leaves_no_idle_record(self):
        lane.lane_prs = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        self.assertRaises(RuntimeError, lane.worker, self.host, "devin")
        self.assertFalse((self.host.state / "worker-idle.json").exists())
        self.assertEqual(self.linear.moves, [])

    def test_a_lane_over_its_open_pr_budget_claims_nothing_new(self):
        red = [{"number": n, "headRefName": f"devin/jov-{n}-20260927t000000", "isDraft": True} for n in (1, 2)]
        lane.lane_prs = lambda name, fields="": red if fields else []  # slots=1 -> budget 2 non-green
        lane.run_issue = lambda *a: self.fail("over budget: fix/adopt only")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])

    def test_new_issue_budget_uses_base_slots_not_autoscaled(self):
        """JOV-7514: parked-PR caps stay on configured slots as autoscale capacity rises."""
        seen = []
        lane.read_new_issue_budget = lambda name, slots: seen.append(slots) or {"allowed": True}
        lane.run_issue = lambda *a: {"verdict": "landing", "prUrl": "u"}
        with patch.object(self.host, "base_slots", return_value=2), \
                patch.object(lane.autoscale, "effective_slots", return_value=5):
            lane.worker(self.host, "devin")
        self.assertEqual(seen, [2])

    def test_unknown_budget_defers_without_claim_or_failure_charge(self):
        lane.read_new_issue_budget = lambda name, slots: lane.new_issue_budget(name, slots, None)
        lane.run_issue = lambda *a: self.fail("unknown inventory cannot authorize new work")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])
        self.assertFalse(lane.failures_path(self.host).exists())
        self.assertEqual(json.loads((self.host.state / "worker-idle.json").read_text())["devin"]["reason"],
                         "pr-inventory-unavailable")

    def test_existing_repair_never_consults_new_issue_budget(self):
        lane.claim_red_pr = lambda *a: {"number": 9}
        fixed = []
        lane.fix_red_pr = lambda *a: fixed.append(a[-1]["number"])
        lane.read_new_issue_budget = lambda *a: self.fail("maintenance must not depend on new-issue read")
        lane.worker(self.host, "devin")
        self.assertEqual(fixed, [9])
        self.assertEqual(self.linear.moves, [])

    def test_subscription_slot_reaches_existing_repair_adapter_without_new_intake(self):
        # Exercise the real provider command with a model-free CLI. Repair target
        # admission remains the existing claim seam; no remote assignment is made.
        root = self.host.state
        cli = root / "fake-codex"
        cli.write_text(f"#!{sys.executable}\nimport json,sys\nfrom pathlib import Path\n"
                       "if sys.argv[1:]==['login','status']:\n print('Logged in using ChatGPT'); sys.exit(0)\n"
                       f"Path({str(root / 'repair-launch.json')!r}).write_text(json.dumps(sys.argv))\n"
                       "sys.stdin.read(); print('repair completed')\n")
        cli.chmod(0o700)
        spec = json.loads((ROOT / "scripts/lanes/providers.json").read_text())["codex"]
        spec = {**spec, "slots": 1}
        lane.load_providers = lambda: {"codex": spec}
        lane.claim_red_pr = lambda *a: {"number": 9}
        lane.read_new_issue_budget = lambda *a: self.fail("repair must precede new-intake budget")
        prompt = root / "repair.prompt"
        prompt.write_text("Repair the admitted existing PR")
        receipt = root / "provider.jsonl"
        def repair(host, name, provider, pr):
            self.assertEqual((name, pr["number"]), ("codex", 9))
            command = lane.template(provider["cmd"], {"prompt_file": str(prompt),
                                    "provider_receipt": str(receipt), "cwd": str(root)})
            command[0] = sys.executable
            result = subprocess.run(command, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
        lane.fix_red_pr = repair
        with patch.dict(os.environ, {"CODEX_LANE_AUTH_MODE": "current-login",
                        "CODEX_LANE_CLI": str(cli), "CODEX_HOME": str(root / "existing-login"),
                        "LANES_STATE": str(root), "LANES_SLOTS_CODEX": "0"}):
            self.assertEqual(lane.worker(self.host, "codex"), 0)
            self.assertFalse(receipt.exists(), "an inactive adapter cannot restore repair throughput")
            os.environ["LANES_SLOTS_CODEX"] = "1"
            self.assertEqual(lane.worker(self.host, "codex"), 0)
        rows = [json.loads(row) for row in receipt.read_text().splitlines()]
        self.assertEqual([(row["event"], row["account"]) for row in rows],
                         [("account-leased", "current-login"), ("cli-launch", "current-login")])
        argv = json.loads((root / "repair-launch.json").read_text())
        self.assertIn('forced_login_method="chatgpt"', argv)
        self.assertEqual(self.linear.moves, [], "repair does not create another issue assignment")

    def test_terminal_publication_precedes_the_unchanged_new_issue_budget(self):
        pr = {"number": 9, "headRefOid": "h", "headRefName": "devin/jov-9-20261005",
              "state": "OPEN", "isDraft": True, "mergeStateStatus": "DIRTY", "labels": []}
        record = {"sha": "h", "count": 2, "lane": "devin", "at": time.time() - 2,
                  "endedAt": time.time() - 1, "pushed": False, "repairVerdict": "failed",
                  "repairRunId": "run", "repairBranch": pr["headRefName"], "repairHeadBefore": "h"}
        (self.host.state / "fix-attempts.json").write_text(json.dumps({"9": record}))
        other = {**pr, "number": 10, "headRefName": "devin/jov-10-20261005", "labels": []}
        lane.fix_candidates = lambda name: [pr]
        lane.read_new_issue_budget = lambda name, slots: lane.new_issue_budget(name, slots, [pr, other])
        claimed = []
        lane.run_issue = lambda host, name, spec, linear, issue: claimed.append(issue.identifier) or {"verdict": "landing"}
        def publish(number, kind, sh):
            pr["labels"].append({"name": "lane-fix-exhausted"})
            return True
        with patch.object(lane, "reconcile_fix_target", return_value=pr), \
                patch.object(lane.pr_events, "claim_active", return_value=False), \
                patch.object(lane.pr_events, "add_label", side_effect=publish):
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(claimed, ["JOV-3"])
        self.assertEqual(json.loads((self.host.state / "fix-attempts.json").read_text())["9"], record)

    def test_busy_slots_and_empty_queue_exit_quietly(self):
        held = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        held.release()
        self.linear.issues = []
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])


class ExhaustedRepairPublicationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name), repo=ROOT, linear_env=Path("unused"))
        self.pr = {"number": 20590, "headRefName": "devin/jov-7596-20261004t090735",
                   "headRefOid": "h", "state": "OPEN", "isDraft": True,
                   "mergeStateStatus": "DIRTY", "labels": [{"name": "lane-fix-conflict"}]}
        self.record = {"sha": "h", "count": 2, "lane": "devin", "at": 100,
                       "endedAt": 200, "pushed": False, "repairRunId": "ended-run",
                       "repairBranch": self.pr["headRefName"], "repairHeadBefore": "h", "repairVerdict": "failed"}
        self.save(self.record)

    def save(self, record):
        (self.host.state / "fix-attempts.json").write_text(json.dumps({"20590": record}))

    def test_finished_exhaustion_publishes_terminal_label_and_unblocks_original_budget(self):
        rows = [self.pr, {**self.pr, "number": 20672, "headRefName": "devin/jov-2135-20261005", "labels": []}]
        self.assertFalse(lane.new_issue_budget("devin", 1, rows)["allowed"])
        def publish(number, kind, sh):
            self.assertEqual((number, kind), (20590, "exhausted"))
            self.pr["labels"].append({"name": "lane-fix-exhausted"})
            return True
        with patch.object(lane, "reconcile_fix_target", return_value=dict(self.pr)), \
                patch.object(lane.pr_events, "claim_active", return_value=False), \
                patch.object(lane.pr_events, "add_label", side_effect=publish) as published:
            self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", rows, now=300), 1)
            self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", rows, now=300), 0)
        result = lane.new_issue_budget("devin", 1, rows)
        self.assertEqual((result["allowed"], result["used"], result["cap"], result["terminal"],
                          result["terminalCap"]), (True, 1, 2, 1, 4))
        self.assertEqual(published.call_count, 1)
        self.assertEqual(json.loads((self.host.state / "fix-attempts.json").read_text())["20590"], self.record)

    def test_missing_or_unfinished_provenance_never_authorizes_publication(self):
        cases = [{**self.record, key: value} for key, value in [
            ("sha", "other"), ("count", 1), ("count", True), ("pushed", True),
            ("endedAt", None), ("endedAt", 301), ("endedAt", 50), ("at", float("nan")),
            ("repairRunId", None), ("repairBranch", "other"), ("repairHeadBefore", "other"),
            ("lane", "codex"), ("repairVerdict", None), ("repairVerdict", "cancelled"),
            ("repairVerdict", "disk-held")]]
        for record in cases:
            with self.subTest(record=record), patch.object(lane, "reconcile_fix_target") as fresh, \
                    patch.object(lane.pr_events, "add_label") as published:
                self.save(record)
                self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
                fresh.assert_not_called(); published.assert_not_called()

    def test_fresh_head_queue_holds_and_cross_host_claims_remain_protected(self):
        cases = [None, {**self.pr, "headRefOid": "new"}, {**self.pr, "state": "MERGED"},
                 {**self.pr, "headRefName": "other"}, {**self.pr, "isCrossRepository": True},
                 {**self.pr, "isInMergeQueue": True}, {**self.pr, "mergeStateStatus": "CLEAN", "isDraft": False},
                 {**self.pr, "labels": [{"name": "tim-hold"}]},
                 {**self.pr, "labels": [{"name": "lane-fix-escalating"}]}]
        for live in cases:
            with self.subTest(live=live), patch.object(lane, "reconcile_fix_target", return_value=live), \
                    patch.object(lane.pr_events, "claim_active", return_value=False), \
                    patch.object(lane.pr_events, "add_label") as published:
                self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
                published.assert_not_called()
        for claims in [(True, False), (False, True)]:
            with patch.object(lane, "reconcile_fix_target", return_value=self.pr), \
                    patch.object(lane.pr_events, "claim_active", side_effect=claims), \
                    patch.object(lane.pr_events, "add_label") as published:
                self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
                published.assert_not_called()

    def test_failed_label_write_keeps_the_same_receipt_retryable(self):
        with patch.object(lane, "reconcile_fix_target", return_value=self.pr), \
                patch.object(lane.pr_events, "claim_active", return_value=False), \
                patch.object(lane.pr_events, "add_label", side_effect=[False, True]) as published:
            self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
            self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 1)
        self.assertEqual(published.call_count, 2)
        self.assertEqual(json.loads((self.host.state / "fix-attempts.json").read_text())["20590"], self.record)

    def test_running_local_repair_or_gate_prevents_publication(self):
        for kind in ("repair", "gate"):
            lock = (lane.Locked(self.host.state / "locks/repair-pr-20590.lock", blocking=False)
                    if kind == "repair" else lane.reserve_gate(self.host, self.pr).lock)
            try:
                with patch.object(lane, "reconcile_fix_target") as fresh, \
                        patch.object(lane.pr_events, "add_label") as published:
                    self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
                    fresh.assert_not_called(); published.assert_not_called()
            finally:
                lock.release()

    def test_receipt_verdict_is_recorded_without_resetting_attempts(self):
        old = {key: value for key, value in self.record.items() if key != "repairVerdict"}
        self.save(old)
        lane.end_local_fix_attempt(self.host, self.pr, {"verdict": "failed", "runId": "ended-run",
                                   "branch": self.pr["headRefName"], "headBefore": "h"})
        saved = json.loads((self.host.state / "fix-attempts.json").read_text())["20590"]
        self.assertEqual((saved["repairVerdict"], saved["count"], saved["sha"], saved["pushed"]),
                         ("failed", 2, "h", False))

    def test_unreadable_claim_does_not_fabricate_terminal_publication(self):
        with patch.object(lane, "reconcile_fix_target", return_value=self.pr), \
                patch.object(lane.pr_events, "claim_active", side_effect=subprocess.TimeoutExpired("gh", 30)), \
                patch.object(lane.pr_events, "add_label") as published:
            self.assertEqual(lane.publish_exhausted_repairs(self.host, "devin", [self.pr], now=300), 0)
            published.assert_not_called()


class NewIssueBudgetTest(unittest.TestCase):
    def row(self, number=1, branch=None, draft=True, state="CLEAN"):
        return {"number": number, "headRefName": branch or f"codex/jov-{number}-20261002",
                "isDraft": draft, "mergeStateStatus": state}

    def test_dated_ownership_and_each_head_count_once_without_issue_collapse(self):
        rows = [self.row(n, branch=f"codex/jov-7-20261002t00000{n}") for n in range(1, 7)]
        rows += [self.row(8, branch="codex/manual-repair"), self.row(9, branch="devin/jov-9-20261002"),
                 self.row(10, draft=False), self.row(11, draft=False, state="HAS_HOOKS")]
        result = lane.new_issue_budget("codex", 3, rows)
        self.assertEqual((result["used"], result["cap"], result["reason"]), (6, 6, "over-budget"))
        self.assertFalse(result["allowed"])
        self.assertTrue(lane.new_issue_budget("codex", 4, rows)["allowed"])
        self.assertEqual(lane.new_issue_budget("codex", 0, None)["reason"], "provider-disabled")

    def test_terminal_prs_cannot_pin_the_lane_idle(self):
        """JOV-7514 live shape: codex held 7 hold/exhausted PRs + 1 advanceable -> idle forever."""
        terminal = [["hold", "lane-fix-exhausted"], ["lane-fix-exhausted"], ["hold"],
                    ["lane-fix-exhausted", "queue-poison"], ["lane-fix-red", "lane-fix-exhausted"],
                    ["lane-fix-exhausted"], ["hold", "queue-poison"]]
        rows = [{**self.row(n), "labels": [{"name": name} for name in labels]}
                for n, labels in enumerate(terminal, start=1)]
        rows.append({**self.row(99), "labels": []})
        rows.append({**self.row(50), "labels": [{"name": "lane-fix-escalating"}]})
        result = lane.new_issue_budget("codex", 3, rows)
        self.assertEqual((result["used"], result["terminal"], result["reason"]), (1, 8, "within-budget"))
        self.assertTrue(result["allowed"])
        # Parked work is still bounded: slots x TERMINAL_PRS_PER_SLOT.
        parked = [{**self.row(n), "labels": [{"name": "hold"}]} for n in range(1, 13)]
        result = lane.new_issue_budget("codex", 3, parked)
        self.assertEqual((result["used"], result["terminal"], result["terminalCap"], result["reason"]),
                         (0, 12, 12, "terminal-pr-backlog"))
        self.assertFalse(result["allowed"])
        # Active non-green work keeps its original cap and precedence.
        active = [self.row(n) for n in range(20, 26)]
        self.assertEqual(lane.new_issue_budget("codex", 3, parked + active)["reason"], "over-budget")

    def test_failed_malformed_and_truncated_reads_cannot_certify_empty_inventory(self):
        cases = [(1, "[]"), (1, json.dumps([self.row()])), (0, ""), (0, "{}"), (0, "null"),
                 (0, json.dumps([self.row(n, branch=f"codex/manual-{n}") for n in range(1, 201)])),
                 (0, json.dumps([self.row(), self.row()]))]
        for field, value in [("number", True), ("number", 0), ("headRefName", ""),
                             ("isDraft", 1), ("mergeStateStatus", None)]:
            row = self.row(branch="codex/manual")
            row[field] = value
            cases.append((0, json.dumps([row])))
        for code, output in cases:
            with self.subTest(code=code, output=output[:80]), patch.object(
                    lane, "sh", return_value=subprocess.CompletedProcess([], code, output, "")):
                result = lane.read_new_issue_budget("codex", 3)
                self.assertEqual(result["reason"], "pr-inventory-unavailable")
                self.assertIsNone(result["used"])
                self.assertFalse(result["allowed"])
        with patch.object(lane, "sh", return_value=subprocess.CompletedProcess([], 0, "[]", "")):
            result = lane.read_new_issue_budget("codex", 3)
            self.assertTrue(result["allowed"])
            self.assertEqual(result["used"], 0)


class RunAgentTest(unittest.TestCase):
    def test_cancellation_does_not_signal_a_reused_root_process_group(self):
        original = {10: (1, 10, "S", "original")}
        reused = {10: (1, 10, "S", "replacement"), 11: (10, 10, "S", "unrelated")}
        proc = Mock(pid=10)
        proc.wait.side_effect = subprocess.TimeoutExpired("agent", 0)
        proc.poll.return_value = 0
        guard = Mock(side_effect=[None, lane.DiskAdmissionError("disk-critical")])
        with patch.object(lane.subprocess, "Popen", return_value=proc), \
                patch.object(lane, "process_snapshot", side_effect=[original] + [reused] * 10), \
                patch.object(lane.os, "kill") as kill, \
                patch.object(lane.os, "killpg", side_effect=ProcessLookupError) as killpg:
            with self.assertRaises(lane.DiskAdmissionError):
                lane.run_agent(["agent"], Path("."), None, timeout=30, guard=guard, guard_interval=0)
        kill.assert_not_called()
        killpg.assert_not_called()

    def test_snapshot_failure_still_signals_the_live_unreaped_leader(self):
        proc = Mock(pid=10)
        proc.poll.return_value = None
        with patch.object(lane.subprocess, "Popen", return_value=proc), \
                patch.object(lane, "process_snapshot", side_effect=RuntimeError("snapshot-unavailable")), \
                patch.object(lane.os, "killpg", side_effect=ProcessLookupError) as killpg:
            with self.assertRaisesRegex(RuntimeError, "snapshot-unavailable"):
                lane.run_agent(["agent"], Path("."), None, timeout=30)
        self.assertEqual(killpg.call_count, 1)
        self.assertEqual(killpg.call_args.args[0], 10)

    def test_process_identity_survives_reparenting_but_reused_pids_are_not_owned(self):
        snapshots = [
            {10: (1, 10, "S", "start-a"), 11: (10, 11, "S", "start-b"), 99: (1, 99, "S", "other")},
            {11: (1, 11, "S", "start-b"), 12: (11, 12, "S", "start-c")},
            {10: (1, 10, "S", "reused-root"), 11: (1, 11, "S", "reused-child"),
             13: (10, 10, "S", "unrelated-child")},
        ]
        with patch.object(lane, "process_snapshot", side_effect=snapshots):
            owned = lane.AgentProcesses(10)
            self.assertEqual(set(owned.observe()), {10, 11})
            self.assertEqual(set(owned.observe()), {11, 12})
            self.assertEqual(owned.observe(), {})
        with patch.object(lane.subprocess, "run", return_value=SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(RuntimeError, "process-ownership-unavailable"):
                lane.process_snapshot()

    def test_permission_denied_group_check_requires_membership_evidence(self):
        with patch.object(lane.os, "killpg", side_effect=PermissionError):
            for listing, expected in (("99 S\n", True), ("99 Z\n", False), ("100 S\n", False)):
                with patch.object(lane.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=listing)):
                    self.assertEqual(lane.process_group_alive(99), expected)
            with patch.object(lane.subprocess, "run", return_value=SimpleNamespace(returncode=1)):
                with self.assertRaises(PermissionError):
                    lane.process_group_alive(99)

    def test_guard_cancellation_kills_child_even_when_leader_exits_on_term(self):
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            child_script = Path(tmp) / "child.py"
            child_script.write_text("import os,signal,time,pathlib\n"
                                    "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                                    "pathlib.Path('child.pid').write_text(str(os.getpid()))\n"
                                    "while True:\n pathlib.Path('heartbeat').write_text(str(time.monotonic())); time.sleep(.01)\n")
            pidfile = Path(tmp) / "child.pid"
            command = [sys.executable, "-c", "import subprocess,sys,time; subprocess.Popen([sys.executable,'child.py']); time.sleep(60)"]
            def guard():
                if pidfile.exists():
                    raise lane.DiskAdmissionError("disk-critical")
            try:
                with self.assertRaises(lane.DiskAdmissionError):
                    lane.run_agent(command, Path(tmp), log, timeout=30, guard=guard, guard_interval=.05)
                heartbeat = (Path(tmp) / "heartbeat").read_text()
                time.sleep(.15)
                self.assertEqual((Path(tmp) / "heartbeat").read_text(), heartbeat,
                                 "the SIGTERM-resistant child must stop even after the leader exits")
            finally:
                if pidfile.exists():
                    import signal
                    try:
                        os.kill(int(pidfile.read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_cancellation_reaps_detached_descendants_but_not_an_unrelated_group(self):
        import signal
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            path = Path(tmp)
            unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True)
            child_code = "import os,pathlib,time; pathlib.Path('child.pid').write_text(str(os.getpid())); time.sleep(30)"
            command = [sys.executable, "-c", "import subprocess,sys,time; "
                       f"subprocess.Popen([sys.executable,'-c',{child_code!r}], start_new_session=True); time.sleep(30)"]
            def guard():
                if (path / "child.pid").exists():
                    raise lane.DiskAdmissionError("disk-critical")
            try:
                with self.assertRaises(lane.DiskAdmissionError):
                    lane.run_agent(command, path, log, timeout=10, guard=guard, guard_interval=.1)
                child = int((path / "child.pid").read_text())
                self.assertFalse(lane.process_group_alive(child), "setsid descendants must not survive cancellation")
                self.assertIsNone(unrelated.poll(), "another session must remain running")
            finally:
                unrelated.kill()
                unrelated.wait()
                if (path / "child.pid").exists():
                    try:
                        os.kill(int((path / "child.pid").read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_mid_run_guard_stops_the_process_and_propagates_the_hold(self):
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            pidfile = Path(tmp) / "pid"
            command = [sys.executable, "-c", "import os,time,pathlib; pathlib.Path('pid').write_text(str(os.getpid())); time.sleep(30)"]
            def guard():
                if pidfile.exists():
                    raise lane.DiskAdmissionError("disk-critical")
            with self.assertRaises(lane.DiskAdmissionError):
                lane.run_agent(command, Path(tmp), log, timeout=10, guard=guard, guard_interval=0.05)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pidfile.read_text()), 0)
    def test_run_agent_kills_the_whole_process_group_on_timeout(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp) / "log", "w") as log:
            script = Path(tmp) / "agent.sh"
            script.write_text("#!/bin/sh\nsleep 30 &\necho $! > child.pid\nwait\n")
            script.chmod(0o755)
            with self.assertRaises(lane.subprocess.TimeoutExpired):
                lane.run_agent([str(script)], Path(tmp), log, timeout=4)  # generous: CI hosts fork slowly
            child = int((Path(tmp) / "child.pid").read_text())
            for _ in range(20):  # the group kill is asynchronous; give the kernel a moment
                time.sleep(0.1)
                try:
                    os.kill(child, 0)
                except ProcessLookupError:
                    break
            else:
                self.fail("background child of the timed-out agent is still alive")

    def test_run_agent_returns_the_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp) / "log", "w") as log:
            self.assertEqual(lane.run_agent(["sh", "-c", "echo hi; exit 3"], Path(tmp), log, timeout=10).returncode, 3)

    def test_run_agent_forces_shared_store_hardlink_imports(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp) / "log", "w") as log:
            output = Path(tmp) / "import-method"
            command = [sys.executable, "-c",
                       "import os, pathlib; pathlib.Path('import-method').write_text("
                       "os.environ.get('npm_config_package_import_method', ''))"]
            self.assertEqual(lane.run_agent(command, Path(tmp), log, timeout=10).returncode, 0)
            self.assertEqual(output.read_text(), "hardlink")


class PublicationRevocationTest(unittest.TestCase):
    """JOV-5060: a stopped run writes an immutable revocation receipt before the kill is
    acked, and every publication boundary revalidates it."""

    def test_receipt_is_written_before_the_owned_tree_is_killed(self):
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            root = Path(tmp)
            host = lane.Host(state=root)
            pidfile = root / "pid"
            command = [sys.executable, "-c",
                       "import os,time,pathlib; pathlib.Path('pid').write_text(str(os.getpid())); time.sleep(30)"]

            def guard():
                if pidfile.exists():
                    raise lane.DiskAdmissionError("disk-critical")

            observed = []

            def on_kill(error):
                # The agent must still be alive when the revocation lands: receipt first,
                # then the kill is acknowledged.
                os.kill(int(pidfile.read_text()), 0)
                observed.append(type(error).__name__)
                lane.revoke_publication(host, branch="devin/jov-1-1", run_id="run-1",
                                        issue="JOV-1", reason="test-stop")

            with self.assertRaises(lane.DiskAdmissionError):
                lane.run_agent(command, root, log, timeout=10, guard=guard,
                               guard_interval=0.05, on_kill=on_kill)
            self.assertEqual(observed, ["DiskAdmissionError"])
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pidfile.read_text()), 0)
            revoked = lane.publication_revocation(host, "devin/jov-1-1")
            self.assertEqual(revoked["schema"], lane.PUBLICATION_REVOCATION_SCHEMA)
            self.assertEqual(revoked["reason"], "test-stop")
            self.assertEqual(revoked["runId"], "run-1")

    def test_sigterm_is_a_stop_that_revokes_before_kill(self):
        import signal
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            root = Path(tmp)
            host = lane.Host(state=root)
            pidfile = root / "pid"
            # Startup may exceed the old 0.5s timer on a loaded installer host.
            command = [sys.executable, "-c",
                       "import os,time,pathlib; time.sleep(0.75); pathlib.Path('pid').write_text(str(os.getpid())); time.sleep(30)"]

            def signal_when_ready():
                if pidfile.exists():
                    os.kill(os.getpid(), signal.SIGTERM)

            observed = []

            def on_kill(error):
                # Preserve receipt-before-kill proof for a real SIGTERM too.
                os.kill(int(pidfile.read_text()), 0)
                observed.append(type(error).__name__)
                lane.revoke_publication(host, branch="devin/jov-9-1", reason="run-stopped")

            with self.assertRaises(lane.RunStopped):
                lane.run_agent(command, root, log, timeout=30,
                               guard=signal_when_ready, guard_interval=0.05, on_kill=on_kill)
            self.assertEqual(observed, ["RunStopped"])
            self.assertIsNotNone(lane.publication_revocation(host, "devin/jov-9-1"))
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pidfile.read_text()), 0)

    def test_unreadable_ledger_fails_closed_as_revoked(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            self.assertIsNone(lane.publication_revocation(host, "devin/jov-1-1"))
            lane.revocations_path(host).parent.mkdir(parents=True)
            lane.revocations_path(host).write_text("not-json\n")
            self.assertEqual(lane.publication_revocation(host, "devin/jov-1-1")["reason"],
                             "revocation-ledger-corrupt")
            with self.assertRaises(lane.PublicationRevoked):
                lane.require_publishable(host, "devin/jov-1-1", "before-push")


class VerifyAndLandRevocationTest(unittest.TestCase):
    def setUp(self):
        self.real = lane.sh

    def tearDown(self):
        lane.sh = self.real

    def test_revoked_branch_never_pushes_or_opens_a_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.revoke_publication(host, branch="devin/jov-1", reason="run-stopped")
            fake = FakeShell([], ahead="2")
            lane.sh = fake
            with self.assertRaises(lane.PublicationRevoked):
                lane.verify_and_land(host, issue(), "devin/jov-1", Path("/tmp"), None, 0)
            self.assertFalse(any(call[:2] == ["git", "push"] for call in fake.calls))
            self.assertFalse(any(call[:3] == ["gh", "pr", "create"] for call in fake.calls))

    def test_a_stop_during_long_pre_push_hooks_still_bars_the_pr_open(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            fake = FakeShell([], ahead="2")

            def push_revokes(args, **kwargs):
                if args[:2] == ["git", "push"]:  # the stop lands while the hooks run
                    lane.revoke_publication(host, branch="devin/jov-1", reason="run-stopped")
                return fake(args, **kwargs)

            lane.sh = push_revokes
            with self.assertRaises(lane.PublicationRevoked):
                lane.verify_and_land(host, issue(), "devin/jov-1", Path("/tmp"), None, 0)
            self.assertTrue(any(call[:2] == ["git", "push"] for call in fake.calls))
            self.assertFalse(any(call[:3] == ["gh", "pr", "create"] for call in fake.calls))

    def test_gate_never_marks_a_revoked_branch_ready_or_enqueues_it(self):
        started = datetime(2026, 9, 25, 21, 0, tzinfo=timezone.utc).timestamp()
        pr = {"number": 7, "headRefName": "devin/jov-1", "headRefOid": "abc", "url": "u",
              "createdAt": "2026-09-25T21:05:00Z", "isDraft": True}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.revoke_publication(host, branch="devin/jov-1", reason="run-stopped")
            fake = FakeShell([pr])
            lane.sh = fake
            self.assertEqual(lane.gate_pr(host, pr, Path("/tmp"), None)["verdict"], "revoked")
            self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))
            self.assertFalse(any(call[:3] == ["gh", "pr", "merge"] for call in fake.calls))
        self.assertIsInstance(started, float)

    def test_requeue_verified_preserves_revoked_entries_without_enrolling(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.revoke_publication(host, branch="devin/jov-1", reason="run-stopped")
            lane.update_json(host.state / "requeue.json",
                             lambda requeue: requeue.update({"7": "abc"}))
            fake = FakeShell([])
            lane.sh = fake
            lane.requeue_verified(host, [{"number": 7, "headRefOid": "abc",
                                          "headRefName": "devin/jov-1"}])
            self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))
            self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {"7": "abc"})


class DispatchTest(unittest.TestCase):
    def setUp(self):
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        # Host-independent tests must never contact production from Gem's test gate.
        clock = patch.object(lane.continuity_clock, "tick", return_value={"status": "current"})
        clock.start()
        self.addCleanup(clock.stop)

    def test_coding_dispatch_continues_when_coordinator_reasoning_and_alerts_are_unavailable(self):
        # Summer/Gateway failure affects optional reasoning and observability, not
        # the independently admitted coding lane. Keep all existing disk/slot gates.
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_AUTOSCALE": "off", "LANES_SLOTS_CODEX": "1"}), \
                patch.object(lane.autoscale, "mode", return_value="off"), \
                patch.object(lane.disk_guard, "check", return_value={"freePct": 50, "admitted": True}), \
                patch.object(lane.worktree_sweep, "maybe_spawn", return_value="not-due"), \
                patch.object(lane, "ensure_full_history"), \
                patch.object(lane, "load_providers", return_value={"codex": {"slots": 1}}), \
                patch.object(lane, "provider_healthy", return_value=True), \
                patch.object(lane, "claim_remediation_events", side_effect=RuntimeError("coordinator offline")), \
                patch.object(lane.pr_events, "tick", return_value={}), \
                patch.object(lane.reason_lane, "tick", side_effect=RuntimeError("credits unavailable")), \
                patch.object(lane.doctor, "run", side_effect=RuntimeError("coordinator offline")), \
                patch.object(lane.subprocess, "Popen") as spawn:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            lane._save_event_delivery(host, {
                "schema": lane.EVENT_DELIVERY_SCHEMA,
                "actions": {"delivery": {"key": "delivery", "kind": "comments", "status": "failed",
                                         "nextAt": 123, "createdAt": 100}},
            })
            self.assertEqual(lane.dispatch(host), 0)
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(spawn.call_args.args[0][-1], "codex")
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual(tick["spawned"], ["codex"])
            self.assertIsNone(tick["error"])
            self.assertEqual(tick["remediationEvents"]["deliveryFailed"], 1)
            self.assertEqual(tick["remediationEvents"]["deliveryNextAt"], 123)
            self.assertIn("reasonError", tick)
            self.assertIn("doctorError", tick)

    def test_critical_or_unknown_disk_blocks_all_dispatch_and_installs(self):
        for pct in (None, 4.0):
            with self.subTest(pct=pct), tempfile.TemporaryDirectory() as tmp, \
                    patch.object(lane.disk_guard, "free_pct", return_value=pct), \
                    patch.object(lane, "ensure_full_history") as history, \
                    patch.object(lane.subprocess, "Popen") as spawn, \
                    patch.object(lane.pr_events, "tick") as events, \
                    patch.object(lane.reason_lane, "tick") as reasoning, \
                    patch.object(lane.doctor, "run") as doctor, \
                    patch.object(lane, "sh") as shell:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 1)
                history.assert_not_called()
                spawn.assert_not_called()
                events.assert_not_called()
                reasoning.assert_not_called()
                doctor.assert_called_once()
                with self.assertRaises(lane.DiskAdmissionError):
                    lane.install_dependencies(host, Path(tmp), None)
                shell.assert_not_called()
                tick = json.loads((host.state / "tick.json").read_text())
                self.assertFalse(tick["disk"]["admitted"])

    def test_disk_denial_is_backpressure_not_a_tick_error(self):
        # JOV-8024: a denied tick is deliberate backpressure the disk-critical/disk-low
        # alert already names; recording it as a tick error opens a duplicate,
        # unactionable doctor issue.
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(lane.disk_guard, "free_pct", return_value=4.0), \
                patch.object(lane.doctor, "run"):
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            self.assertEqual(lane.dispatch(host), 1)
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertIsNone(tick["error"])
            self.assertEqual(tick["admissionDenied"], "disk-critical")
            self.assertNotIn("tick-error", lane.doctor.judge({"tick": tick, "now": 0.0}))

    def test_critical_disk_still_starts_the_worktree_sweep(self):
        # JOV-7704: admission denial must not also deny the cleanup that would end it.
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(lane.disk_guard, "free_pct", return_value=4.0), \
                patch.object(lane.worktree_sweep, "maybe_spawn", return_value="spawned") as sweep, \
                patch.object(lane.doctor, "run"):
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            self.assertEqual(lane.dispatch(host), 1)
            sweep.assert_called_once_with(host.state, host.repo, 4.0)
            self.assertEqual(json.loads((host.state / "tick.json").read_text())["worktreeSweep"], "spawned")

    def test_spawns_one_worker_per_slot_without_cleanup_on_the_dispatch_tick(self):
        saved = (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check)
        spawned = []
        lane.load_providers = lambda: {"a": {"slots": 2}, "b": {"slots": 3}, "c": {"slots": 1, "enabled": False}, "d": {"slots": 4}}
        lane.provider_healthy = lambda spec: self.fail("host-scoped-off provider was probed") if spec["slots"] == 4 else spec["slots"] == 2
        lane.subprocess.Popen = lambda args, **kw: spawned.append(args[-1])
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.doctor.run = lambda *a, **k: {}
        lane.disk_guard.check = lambda host: {"freePct": 50.0, "low": False, "critical": False, "admitted": True}
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "worktrees/old"
            old.mkdir(parents=True)
            os.utime(old, (0, 0))
            os.environ["LANES_SLOTS_D"] = "0"  # d is scoped off this host
            try:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 0)
            finally:
                os.environ.pop("LANES_SLOTS_D", None)
                (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check) = saved
            self.assertTrue(old.exists(), "cleanup belongs after slot acquisition, not on each dispatch tick")
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual((tick["unhealthy"], tick["spawned"], tick["error"]), (["b"], ["a", "a"], None))
        self.assertEqual(spawned, ["a", "a"])

    def test_only_the_best_pr_per_issue_gets_lane_effort(self):
        prs = [
            {"number": 1, "headRefName": "devin/jov-7-20260926t0900", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "a"},
            {"number": 2, "headRefName": "devin/jov-7-20260926t1000", "isDraft": False, "mergeStateStatus": "DIRTY", "headRefOid": "b"},
            {"number": 3, "headRefName": "codex/jov-7-20260926t1100", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "c"},
            {"number": 4, "headRefName": "devin/jov-8-20260926t1100", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "d"},
        ]
        self.assertEqual([pr["number"] for pr in lane.best_per_issue(prs)], [2, 4], "ready outranks drafts even when conflicted")
        drafts = [prs[0], prs[2], prs[3]]
        self.assertEqual([pr["number"] for pr in lane.best_per_issue(drafts)], [3, 4], "newest draft wins")
        # the adopt loop never spends a gate on the losing duplicates
        self.assertEqual(lane.unverified_pr(drafts, {})["number"], 3)
        self.assertEqual(lane.unverified_pr(drafts, {"3:c": gate_proof("c")})["number"], 4)
        self.assertIsNone(lane.unverified_pr(drafts, {"3:c": gate_proof("c"), "4:d": gate_proof("d")}))

    def test_a_crashing_tick_leaves_its_error_for_the_doctor(self):
        saved = (lane.ensure_full_history, lane.doctor.run)
        lane.ensure_full_history = lambda host: (_ for _ in ()).throw(RuntimeError("git exploded"))
        lane.doctor.run = lambda *a, **k: {}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                self.assertEqual(lane.dispatch(host), 1)
            finally:
                lane.ensure_full_history, lane.doctor.run = saved
            self.assertIn("git exploded", json.loads((host.state / "tick.json").read_text())["error"])

    def test_unprotected_worktree_removal_does_not_kill_processes_by_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = FakeShell([])
            with patch.object(lane, "sh", side_effect=fake):
                lane.remove_worktree(lane.Host(state=Path(tmp), repo=Path(tmp)), Path(tmp))
            self.assertEqual(fake.calls, [["lsof", "-nP", "-a", "-d", "cwd", "-F", "pn"],
                                          ["git", "status", "--porcelain"],
                                          ["git", "rev-list", "--count", "HEAD", "--not", "--all"],
                                          ["git", "worktree", "remove", "--force", tmp]])

    def test_removal_is_journaled_before_the_remove_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            path = Path(tmp) / "worktrees/done"
            path.mkdir(parents=True)
            os.utime(path, (0, 0))
            journal = host.state / "runs/worktree-removals.jsonl"

            def shell(args, **kwargs):
                if args[:3] == ["git", "worktree", "remove"]:
                    self.assertTrue(journal.exists(), "the receipt precedes the destructive call")
                if args[:2] == ["git", "rev-list"]:
                    return SimpleNamespace(returncode=0, stdout="0", stderr="")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            with patch.object(lane, "sh", side_effect=shell):
                lane.prune_worktrees(host)
            rows = [json.loads(line) for line in journal.read_text().splitlines()]
            self.assertEqual(rows[-1]["verdict"], "removed")
            self.assertEqual(rows[-1]["worktree"], str(path))

    def test_a_recycled_worktree_is_journaled_and_never_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            path = Path(tmp) / "worktrees/done"
            path.mkdir(parents=True)
            calls = []

            def shell(args, **kwargs):
                calls.append(args)
                if args[:2] == ["git", "rev-list"]:
                    return SimpleNamespace(returncode=0, stdout="0", stderr="")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            with patch.object(lane, "sh", side_effect=shell), \
                 patch.object(lane.worktree_pool, "recycle", return_value="slot-1") as recycle:
                lane.remove_worktree(host, path)
            recycle.assert_called_once_with(host.repo, path)
            self.assertNotIn(["git", "worktree", "remove", "--force", str(path)], calls)
            row = json.loads((host.state / "runs/worktree-removals.jsonl").read_text().splitlines()[-1])
            self.assertEqual((row["verdict"], row["reason"]), ("recycled", "slot-1"))

    def test_prune_keeps_a_worktree_while_a_process_runs_inside(self):
        """PID reuse cannot fake this: liveness is a live cwd, not a remembered PID."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worktrees/live"
            path.mkdir(parents=True)
            (path / "wip.py").write_text("unfinished")
            os.utime(path, (0, 0))

            def shell(args, **kwargs):
                if args[0] == "lsof":
                    return SimpleNamespace(returncode=0, stdout=f"p4242\nn{path}\n", stderr="")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            with patch.object(lane, "sh", side_effect=shell) as mocked:
                lane.prune_worktrees(host)
            self.assertEqual((path / "wip.py").read_text(), "unfinished")
            self.assertTrue((path / lane.disk_guard.PRESERVED_REPAIR).exists())
            self.assertFalse(any("remove" in call.args[0] for call in mocked.call_args_list))
            journal = (host.state / "runs/worktree-removals.jsonl").read_text()
            self.assertIn("process-still-running", journal)

    def test_prune_keeps_a_worktree_while_its_index_is_locked(self):
        with tempfile.TemporaryDirectory() as tmp:
            gitdir = Path(tmp) / "repo/.git/worktrees/locked"
            gitdir.mkdir(parents=True)
            path = Path(tmp) / "worktrees/locked"
            path.mkdir(parents=True)
            (path / ".git").write_text(f"gitdir: {gitdir}\n")
            (gitdir / "index.lock").write_text("")
            os.utime(path, (0, 0))
            host = lane.Host(state=Path(tmp), repo=Path(tmp) / "repo")
            with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")) as mocked:
                lane.prune_worktrees(host)
            self.assertTrue(path.exists())
            self.assertTrue((path / lane.disk_guard.PRESERVED_REPAIR).exists())
            self.assertFalse(any("remove" in call.args[0] for call in mocked.call_args_list))

    def test_remove_preserves_unpublished_commits(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            path = Path(tmp) / "worktrees/wip"
            path.mkdir(parents=True)

            def shell(args, **kwargs):
                if args[:2] == ["git", "rev-list"]:
                    return SimpleNamespace(returncode=0, stdout="2", stderr="")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            with patch.object(lane, "sh", side_effect=shell) as mocked:
                lane.remove_worktree(host, path)
            self.assertTrue((path / lane.disk_guard.PRESERVED_REPAIR).exists())
            self.assertFalse(any("remove" in call.args[0] for call in mocked.call_args_list))
            self.assertIn("unpublished-work",
                          (host.state / "runs/worktree-removals.jsonl").read_text())

    def test_pruning_dirty_or_unreadable_source_retains_it(self):
        for code, output in ((0, "?? dirty.py"), (1, "")):
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "worktrees/old"
                path.mkdir(parents=True)
                (path / "dirty.py").write_text("precious source")
                os.utime(path, (0, 0))
                with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=code, stdout=output)) as shell:
                    lane.prune_worktrees(lane.Host(state=Path(tmp), repo=Path(tmp)))
                self.assertEqual((path / "dirty.py").read_text(), "precious source")
                self.assertTrue((path / lane.disk_guard.PRESERVED_REPAIR).exists())
                self.assertFalse(any("remove" in call.args[0] for call in shell.call_args_list))

    def test_cleanup_never_removes_a_preserved_tree_or_kills_by_path(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(lane, "sh") as shell:
            path = Path(tmp) / "worktrees/retained"
            path.mkdir(parents=True)
            (path / lane.disk_guard.PRESERVED_REPAIR).write_text('{}')
            (path / "dirty.py").write_text('valuable work')
            os.utime(path, (0, 0))
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            lane.remove_worktree(host, path)
            lane.prune_worktrees(host)
            self.assertEqual((path / "dirty.py").read_text(), 'valuable work')
            self.assertFalse(any(call.args[0][0] == "pkill" or "remove" in call.args[0]
                                 for call in shell.call_args_list))

    def test_prune_survives_a_worktree_removed_mid_scan(self):
        real = lane.sh
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "worktrees"
            (root / "gone").mkdir(parents=True)
            real_iterdir = Path.iterdir

            def vanishing(self):
                entries = list(real_iterdir(self))
                for entry in entries:
                    if entry.name == "gone":
                        entry.rmdir()
                return iter(entries)
            Path.iterdir = vanishing
            try:
                lane.prune_worktrees(lane.Host(state=Path(tmp), repo=Path(tmp)))
            finally:
                Path.iterdir, lane.sh = real_iterdir, real

    def test_shallow_clones_are_unshallowed_before_gating(self):
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            out = "true\n" if args[:2] == ["git", "rev-parse"] else ""
            return SimpleNamespace(returncode=0, stderr="", stdout=out)
        real = lane.sh
        lane.sh = fake
        try:
            lane.ensure_full_history(lane.Host(repo=Path("/tmp")))
        finally:
            lane.sh = real
        self.assertIn(["git", "fetch", "-q", "--unshallow", "origin"], calls)

    def test_health_check_matches_output_and_survives_missing_binaries(self):
        ok = [sys.executable, "-c", "print('Logged in (via Devin).')"]
        self.assertTrue(lane.provider_healthy({"health": ok, "healthy": "Logged in"}))
        self.assertFalse(lane.provider_healthy({"health": ok, "healthy": "Not logged"}))
        self.assertFalse(lane.provider_healthy({"health": ["/nonexistent/binary"]}))


class PreservedRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.host = lane.Host(state=Path(self.temp.name) / "state", repo=Path(self.temp.name) / "repo")
        self.host.repo.mkdir()
        self.git(self.host.repo, "init", "-q")
        self.git(self.host.repo, "config", "user.name", "Recovery test")
        self.git(self.host.repo, "config", "user.email", "recovery@example.test")
        self.git(self.host.repo, "config", "commit.gpgsign", "false")
        self.git(self.host.repo, "commit", "--allow-empty", "-qm", "initial")
        head = self.git(self.host.repo, "rev-parse", "HEAD")
        self.git(self.host.repo, "update-ref", "refs/remotes/origin/devin/jov-1", head)
        self.pr = {"number": 5, "headRefName": "devin/jov-1", "headRefOid": head, "isDraft": True,
                   "title": "repair", "state": "OPEN", "statusCheckRollup": [],
                   "isInMergeQueue": False, "isCrossRepository": False}
        self.live, self.calls, self.active = dict(self.pr), [], ""
        real = lane.sh
        def shell(args, **kwargs):
            self.calls.append(args)
            if args[:2] == ["git", "fetch"] or args[0] == "gh":
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stdout=self.live["headRefOid"], stderr="")
            if args[0] == "lsof":
                return SimpleNamespace(returncode=0, stdout=self.active, stderr="")
            return real(args, **kwargs)
        for patcher in (patch.object(lane, "sh", side_effect=shell),
                        patch.object(lane, "reconcile_fix_target", side_effect=lambda _: dict(self.live)),
                        patch.object(lane, "install_dependencies"), patch.object(lane, "failure_excerpt", return_value=""),
                        patch.object(lane.disk_guard, "free_pct", return_value=50)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()

    def hold(self, reason="disk-held"):
        def agent(cmd, cwd, log, timeout, **kwargs):
            (cwd / "repair.txt").write_text("preserved useful edit")
            if reason == "disk-held":
                raise lane.DiskAdmissionError("agent-running:disk-critical")
            raise lane.RepairStopped("target-state-unavailable", None, "agent-running")
        with patch.object(lane, "run_agent", side_effect=agent):
            prior = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(prior["verdict"], reason)
        self.path = Path(prior["preservedWorktree"])
        self.calls.clear()
        return prior

    def retain_with_source_safe_marker(self, prior):
        lane.preserve_repair(self.path, {
            "runId": prior["runId"],
            "reasons": ["cleanup-source-unverified"],
        })
        marker = json.loads((self.path / lane.disk_guard.PRESERVED_REPAIR).read_text())
        self.assertIsNone(marker["pr"], "source-safe cleanup has no target binding to copy")

    def test_disk_hold_resumes_dirty_work_in_the_same_budget(self):
        self.assert_resume("disk-held")

    def test_a_revoked_branch_is_never_repaired_or_enrolled(self):
        lane.revoke_publication(self.host, branch=self.pr["headRefName"], reason="run-stopped")
        with patch.object(lane, "run_agent", side_effect=AssertionError("agent must not run")):
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "revoked")
        self.assertTrue(any("before-checkout" in reason or "publication-revoked" in reason
                            for reason in receipt["reasons"]))
        self.assertFalse(any(call[:3] == ["gh", "pr", "merge"] for call in self.calls))
        self.assertFalse(any(call[:2] == ["git", "push"] for call in self.calls))

    def test_unreadable_target_has_observation_diagnosis_without_refunding_work(self):
        receipt = self.hold("reconcile-unavailable")
        event = receipt["execution"]
        self.assertEqual(event["result"], "failed_known")
        self.assertEqual(event["failureClass"], "target_state_unavailable")
        self.assertEqual(event["confidence"], "unknown")
        self.assertEqual(event["dependencies"], ["codex", "github-target-state"])
        self.assertEqual(event["failureFingerprint"], lane.execution_attempt.digest(["target-state-unavailable"]))
        self.assertEqual(event["evidenceDigest"], lane.execution_attempt.digest({
            "before": self.pr["headRefOid"], "after": None,
            "targetObservation": {"reason": "target-state-unavailable", "stage": "agent-running", "observedState": "UNKNOWN"}}))
        self.assertEqual((event["attempt"], event["retryDecision"], event["terminalState"]), (1, "retry", None))
        self.assertEqual(event["remainingBudgets"]["attempts"], 1)
        self.assertEqual(event["remainingBudgets"]["spend"], 1)
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
        rows = [json.loads(line) for line in (self.host.state / "runs/execution-attempts.jsonl").read_text().splitlines()]
        start = next(row for row in rows if row["event"] == "attempt_started")
        self.assertEqual(event["fencingToken"], start["fencingToken"])
        self.assertEqual(start["policy"]["attempts"], lane.MAX_FIX_ATTEMPTS)
        self.assertEqual(start["policy"]["concurrency"], 1)

    def test_transient_read_hold_resumes_dirty_work_in_the_same_budget(self):
        self.assert_resume("reconcile-unavailable")

    def test_source_safe_marker_recovers_through_its_ended_ledger_receipt(self):
        prior = self.hold()
        self.retain_with_source_safe_marker(prior)
        def agent(cmd, cwd, log, timeout, **kwargs):
            self.assertEqual(cwd, self.path)
            self.assertEqual((cwd / "repair.txt").read_text(), "preserved useful edit")
            raise lane.DiskAdmissionError("agent-running:disk-critical")
        with patch.object(lane, "run_agent", side_effect=agent):
            resumed = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(resumed["verdict"], "disk-held")
        self.assertEqual(resumed["resumedFrom"], prior["runId"])
        self.assertEqual(resumed["execution"]["identityDigest"], prior["execution"]["identityDigest"])
        self.assertEqual(resumed["execution"]["attempt"], 2)
        self.assertFalse(any(args[:3] == ["git", "worktree", "add"] for args in self.calls))
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")

    def test_live_source_safe_predecessor_refuses_before_checkout_or_claim(self):
        prior = self.hold()
        self.retain_with_source_safe_marker(prior)
        self.active = f"p123\nn{self.path}\n"
        with patch.object(lane.execution_attempt, "claim") as claim, patch.object(lane, "run_agent") as agent:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "recovery-handoff")
        self.assertEqual(receipt["recovery"]["reason"], "preserved-process-still-running")
        self.assertFalse(any(args[:3] == ["git", "worktree", "add"] for args in self.calls))
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
        claim.assert_not_called()
        agent.assert_not_called()

    def test_stale_source_safe_predecessor_uses_canonical_handoff(self):
        def predecessor(cmd, cwd, log, timeout, **kwargs):
            (cwd / "repair.txt").write_text("preserved useful edit")
            return SimpleNamespace(returncode=0)
        with patch.object(lane, "run_agent", side_effect=predecessor):
            prior = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(prior["verdict"], "fix-no-change")
        self.path = Path(prior["worktree"])
        marker = json.loads((self.path / lane.disk_guard.PRESERVED_REPAIR).read_text())
        self.assertIsNone(marker["pr"], "source-safe cleanup retained the checkout without a target binding")
        self.assertNotIn("preservedWorktree", prior)
        self.calls.clear()
        with patch.object(lane.execution_attempt, "claim") as claim, patch.object(lane, "run_agent") as agent:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "recovery-handoff")
        self.assertEqual(receipt["recovery"]["reason"], "preserved-target-needs-reconciliation")
        self.assertFalse(any(args[:3] == ["git", "worktree", "add"] for args in self.calls))
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
        claim.assert_not_called()
        agent.assert_not_called()

    def test_competing_checkout_after_reconciliation_is_refused_safely(self):
        competitor = self.host.state / "worktrees/competing-owner"
        add_worktree = lane.add_worktree
        def race(host, args, log):
            self.git(host.repo, "worktree", "add", "-q", "-b", self.pr["headRefName"],
                     str(competitor), f"origin/{self.pr['headRefName']}")
            add_worktree(host, args, log)
        with patch.object(lane, "add_worktree", side_effect=race), patch.object(lane, "run_agent") as agent:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "skipped")
        self.assertIn("already used by worktree", receipt["reasons"][0])
        self.assertTrue(competitor.exists())
        self.assertFalse((competitor / lane.disk_guard.PRESERVED_REPAIR).exists())
        agent.assert_not_called()

    def assert_resume(self, reason):
        prior = self.hold(reason)
        def agent(cmd, cwd, log, timeout, **kwargs):
            self.assertEqual(cwd, self.path)
            self.assertEqual((cwd / "repair.txt").read_text(), "preserved useful edit")
            self.git(cwd, "add", "repair.txt")
            self.git(cwd, "commit", "-qm", "finish preserved repair")
            self.live["headRefOid"] = self.git(cwd, "rev-parse", "HEAD")
            return SimpleNamespace(returncode=0)
        with patch.object(lane, "run_agent", side_effect=agent):
            resumed = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(resumed["verdict"], "fix-pushed")
        self.assertEqual(resumed["resumedFrom"], prior["runId"])
        self.assertEqual(resumed["execution"]["identityDigest"], prior["execution"]["identityDigest"])
        self.assertEqual(resumed["execution"]["attempt"], 2)
        self.assertFalse(any(args[:3] == ["git", "worktree", "add"] for args in self.calls))
        self.assertEqual(self.git(self.host.repo, "show", f"{self.live['headRefOid']}:repair.txt"), "preserved useful edit")
        self.assertFalse(self.path.exists(), "published clean recovery must not leave a stale blocking marker")
        self.assertEqual(resumed["recoveryCleanup"]["status"], "removed")
        self.git(self.host.repo, "update-ref", "refs/remotes/origin/devin/jov-1", self.live["headRefOid"])
        with patch.object(lane, "run_agent", return_value=SimpleNamespace(returncode=0)):
            later = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, dict(self.live))
        self.assertNotEqual(later["verdict"], "recovery-handoff")

    def test_unrelated_corrupt_marker_does_not_block_recovery(self):
        import io
        damaged = self.host.state / "worktrees/unknown-unrelated"
        damaged.mkdir(parents=True)
        (damaged / lane.disk_guard.PRESERVED_REPAIR).write_text("{")
        (damaged / "source.py").write_text("retain unrelated source")
        with patch.object(lane.sys, "stderr", new_callable=io.StringIO) as warnings:
            self.assert_resume("disk-held")
        self.assertIn("preserved-marker-unreadable", warnings.getvalue())
        self.assertEqual((damaged / "source.py").read_text(), "retain unrelated source")

    def test_corrupt_target_marker_keeps_its_handoff_from_ledger_or_run_name(self):
        prior = self.hold()
        canonical = self.path
        self.path = self.path.parent / "renamed-preserved-work"
        self.git(self.host.repo, "worktree", "move", str(canonical), str(self.path))
        prior["preservedWorktree"] = str(self.path)
        (self.host.state / "runs/ledger.jsonl").write_text(json.dumps(prior) + "\n{truncated unrelated row\n")
        (self.path / lane.disk_guard.PRESERVED_REPAIR).write_text("{")
        for ledger_available in (True, False):
            if not ledger_available:
                self.git(self.host.repo, "worktree", "move", str(self.path), str(canonical))
                self.path = canonical
                (self.host.state / "runs/ledger.jsonl").unlink()
            with patch.object(lane.execution_attempt, "claim") as claim:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
            self.assertEqual(receipt["verdict"], "recovery-handoff")
            self.assertEqual(receipt["recovery"]["reason"], "preserved-marker-unreadable")
            claim.assert_not_called()
            self.assertTrue(self.path.exists())

    def test_recovery_race_after_claim_preserves_the_handoff_evidence(self):
        self.hold()
        qualify = lane.qualify_preserved_pr
        calls = []
        def recheck(*args):
            calls.append(1)
            if len(calls) == 2:
                raise lane.RecoveryHandoff("preserved-process-still-running", self.path)
            return qualify(*args)
        with patch.object(lane, "qualify_preserved_pr", side_effect=recheck), patch.object(lane, "run_agent") as agent:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "recovery-handoff")
        self.assertEqual(receipt["recovery"]["reason"], "preserved-process-still-running")
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
        agent.assert_not_called()

    def test_successful_push_keeps_unpublished_followup(self):
        self.hold()
        def agent(cmd, cwd, log, timeout, **kwargs):
            self.git(cwd, "add", "repair.txt")
            self.git(cwd, "commit", "-qm", "published repair")
            self.live["headRefOid"] = self.git(cwd, "rev-parse", "HEAD")
            (cwd / "followup.py").write_text("unpublished followup")
            return SimpleNamespace(returncode=0)
        with patch.object(lane, "run_agent", side_effect=agent):
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "fix-pushed")
        self.assertEqual((self.path / "followup.py").read_text(), "unpublished followup")
        self.assertTrue((self.path / lane.disk_guard.PRESERVED_REPAIR).exists())

    def test_completed_recovery_cleanup_requires_idle_clean_and_published_source(self):
        self.hold()
        self.git(self.path, "add", "repair.txt")
        self.git(self.path, "commit", "-qm", "repair")
        head = self.git(self.path, "rev-parse", "HEAD")
        shell = lane.sh
        for mode in ("live", "warning", "status-error", "unpublished-commit", "remove-failed"):
            with self.subTest(mode=mode):
                receipt = {"runId": "cleanup", "verdict": "fix-pushed", "headAfter": head}
                self.active = f"p123\nn{self.path}\n" if mode == "live" else ""
                if mode == "unpublished-commit":
                    receipt["headAfter"] = self.pr["headRefOid"]
                def guarded(args, **kwargs):
                    if mode == "warning" and args[0] == "lsof":
                        return SimpleNamespace(returncode=0, stdout="", stderr="WARNING: cannot stat mount")
                    if mode == "status-error" and args[:2] == ["git", "status"]:
                        return SimpleNamespace(returncode=1, stdout="", stderr="unavailable")
                    if mode == "remove-failed" and args[:3] == ["git", "worktree", "remove"]:
                        return SimpleNamespace(returncode=1, stdout="", stderr="busy")
                    return shell(args, **kwargs)
                with patch.object(lane, "sh", side_effect=guarded):
                    self.assertFalse(lane.retire_completed_repair(self.host, self.path, receipt))
                self.assertTrue((self.path / lane.disk_guard.PRESERVED_REPAIR).exists())
                self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")

    def test_malformed_ledger_records_produce_a_handoff_instead_of_crashing(self):
        prior = self.hold()
        for record in (None, [], "invalid"):
            (self.host.state / "runs/ledger.jsonl").write_text(json.dumps(record) + "\n")
            with patch.object(lane.execution_attempt, "claim") as claim:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
            self.assertEqual(receipt["verdict"], "recovery-handoff")
            self.assertEqual(receipt["recovery"]["reason"], "preserved-ledger-unreadable")
            claim.assert_not_called()
        prior["execution"] = None
        (self.host.state / "runs/ledger.jsonl").write_text(json.dumps(prior) + "\n")
        with patch.object(lane.execution_attempt, "claim") as claim:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["recovery"]["reason"], "preserved-execution-unverified")
        claim.assert_not_called()

    def test_malformed_path_fields_are_bounded_handoffs_for_direct_and_sparse_markers(self):
        prior = self.hold()
        original_marker = (self.path / lane.disk_guard.PRESERVED_REPAIR).read_text()
        for sparse in (False, True):
            for field in ("worktree", "preservedWorktree"):
                for malformed in ([], {}, 123, ""):
                    with self.subTest(sparse=sparse, field=field, malformed=malformed):
                        (self.path / lane.disk_guard.PRESERVED_REPAIR).write_text(original_marker)
                        if sparse:
                            self.retain_with_source_safe_marker(prior)
                        damaged = {**prior, field: malformed}
                        (self.host.state / "runs/ledger.jsonl").write_text(json.dumps(damaged) + "\n")
                        with patch.object(lane, "run_agent") as agent, patch.object(lane.execution_attempt, "claim") as claim:
                            with self.assertRaises(lane.RecoveryHandoff) as caught:
                                lane.preserved_run(self.host, pr=self.pr["number"])
                        self.assertEqual(caught.exception.evidence["reason"], "preserved-ledger-path-invalid")
                        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
                        agent.assert_not_called()
                        claim.assert_not_called()


    def test_active_process_changed_head_and_missing_terminal_receipt_are_handoffs(self):
        prior = self.hold()
        for mode, reason in (("process", "preserved-process-still-running"),
                             ("head", "preserved-head-superseded"),
                             ("ledger", "preserved-owner-not-terminal")):
            self.active = f"p123\nn{self.path}\n" if mode == "process" else ""
            current = dict(self.pr)
            if mode == "head":
                self.live["headRefOid"] = current["headRefOid"] = "changed-head"
            else:
                self.live = dict(self.pr)
            if mode == "ledger":
                marker = self.path / lane.disk_guard.PRESERVED_REPAIR
                data = json.loads(marker.read_text())
                data["runId"] = "still-running"
                marker.write_text(json.dumps(data))
            with patch.object(lane, "run_agent") as agent, patch.object(lane.execution_attempt, "claim") as claim:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, current)
            self.assertEqual(receipt["verdict"], "recovery-handoff")
            self.assertEqual(receipt["recovery"]["reason"], reason)
            self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
            claim.assert_not_called()
            agent.assert_not_called()

    def test_live_execution_lease_and_terminal_budget_are_not_bypassed(self):
        prior = self.hold()
        execution = prior["execution"]
        ident = {key: execution[key] for key in ("identityDigest", "workKey", "executionGeneration")}
        ledger = self.host.state / "runs/execution-attempts.jsonl"
        policy = json.loads(ledger.read_text().splitlines()[0])["policy"]
        coordination = lane.execution_coordination(self.pr["headRefOid"])
        active = lane.execution_attempt.claim(ledger, ident, {"owner": "another worker"}, policy,
                                               {"triggerId": "other"}, coordination=coordination)
        self.assertTrue(active["admitted"])
        # A different current failure shape must not create a fresh budget/identity.
        self.live["reviewDecision"] = "CHANGES_REQUESTED"
        for reason in ("duplicate_active", "generation_terminal"):
            with patch.object(lane, "run_agent") as agent:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
            self.assertEqual(receipt["reasons"], [reason])
            self.assertEqual(receipt["recovery"]["worktree"], str(self.path))
            agent.assert_not_called()
            if reason == "duplicate_active":
                lane.execution_attempt.finish(ledger, ident, active["fencingToken"], "failed_known",
                    {"failureClass": "repair_incomplete", "failureFingerprint": "other"}, coordination=coordination)
        self.assertFalse(any(args[:3] == ["git", "worktree", "add"] for args in self.calls))

    def test_failed_observations_keep_source_and_do_not_claim_a_retry(self):
        self.hold()
        shell = lane.sh
        for command, reason in (("worktree", "preserved-worktree-unregistered"),
                                ("lsof", "preserved-process-state-unavailable"),
                                ("merge-base", "preserved-head-diverged"),
                                ("timeout", "preserved-read-unavailable:TimeoutExpired")):
            def fail(args, **kwargs):
                if command == "timeout":
                    raise subprocess.TimeoutExpired(args, 30)
                if command in args:
                    return SimpleNamespace(returncode=2, stdout="", stderr="unavailable")
                return shell(args, **kwargs)
            with patch.object(lane, "sh", side_effect=fail), patch.object(lane.execution_attempt, "claim") as claim:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
            self.assertEqual(receipt["recovery"]["reason"], reason)
            claim.assert_not_called()
            self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")

    def test_preserved_issue_requires_reconciliation_without_spending_or_spawning(self):
        self.hold()
        marker = self.path / lane.disk_guard.PRESERVED_REPAIR
        data = json.loads(marker.read_text())
        data["issue"] = "JOV-1"
        marker.write_text(json.dumps(data))
        with patch.object(lane.execution_attempt, "claim") as claim, patch.object(lane, "run_agent") as agent:
            receipt = lane.run_issue(self.host, "codex", {"cmd": ["true"]}, None, issue("JOV-1"))
        self.assertEqual(receipt["verdict"], "recovery-handoff")
        self.assertEqual(receipt["recovery"]["owner"], "JOV-1")
        self.assertEqual((self.path / "repair.txt").read_text(), "preserved useful edit")
        claim.assert_not_called()
        agent.assert_not_called()

    def test_terminal_target_and_branch_owner_prevent_recovery(self):
        self.hold()
        self.live["state"] = "MERGED"
        with patch.object(lane.execution_attempt, "claim") as claim:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
            self.assertEqual(receipt["reasons"], ["target-pr-merged"])
            claim.assert_not_called()
        self.live["state"] = "OPEN"
        lock = lane.Locked(self.host.state / "locks/repair-pr-5.lock", blocking=False)
        try:
            with patch.object(lane.execution_attempt, "claim") as claim:
                receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
                self.assertEqual(receipt["recovery"]["reason"], "repair-owner-active")
                claim.assert_not_called()
            self.live["state"] = "MERGED"
            with patch.object(lane, "end_local_fix_attempt") as finish:
                lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
                finish.assert_not_called()
        finally:
            lock.release()


class FixRedTest(unittest.TestCase):
    def setUp(self):
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        self.real_reconcile_fix_target = lane.reconcile_fix_target
        lane.reconcile_fix_target = lambda pr: {**pr, "state": "OPEN", "mergedAt": None}
        self.addCleanup(setattr, lane, "reconcile_fix_target", self.real_reconcile_fix_target)

    def pr(self, number=5, sha="h1", checks=None):
        return {"number": number, "title": "t", "headRefName": "devin/jov-1", "headRefOid": sha,
                "isInMergeQueue": False, "isCrossRepository": False, "isDraft": False,
                "statusCheckRollup": checks if checks is not None else [
                    {"name": "ci-fast (remaining)", "status": "COMPLETED", "conclusion": "FAILURE",
                     "detailsUrl": "https://github.com/x/actions/runs/1/job/42"}]}

    def test_unreadable_or_partial_open_state_is_not_treated_as_an_authorized_target(self):
        for payload in ("not json", "[]", '{"state":"OPEN"}', '{"state":"OPEN","headRefOid":"h1","headRefName":""}'):
            with self.subTest(payload=payload), patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=payload)):
                self.assertIsNone(self.real_reconcile_fix_target(self.pr()))
        with patch.object(lane, "sh", side_effect=subprocess.TimeoutExpired("gh", 30)):
            self.assertIsNone(self.real_reconcile_fix_target(self.pr()))

    def test_repair_head_requires_creation_in_its_own_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            def git(*args):
                return subprocess.run(["git", *args], cwd=path, check=True, capture_output=True, text=True).stdout.strip()
            git("init", "-q")
            git("config", "user.name", "Lane regression")
            git("config", "user.email", "lane@example.test")
            git("config", "commit.gpgsign", "false")
            git("commit", "--allow-empty", "-qm", "initial")
            initial = git("rev-parse", "HEAD")
            git("commit", "--allow-empty", "-qm", "repair")
            repair = git("rev-parse", "HEAD")
            self.assertTrue(lane.repair_created_head(path, repair))
            git("commit", "--allow-empty", "-qm", "next local repair")
            self.assertTrue(lane.repair_created_head(path, repair, allow_local_progress=True),
                            "an earlier own push remains valid while the agent prepares its next commit")
            self.assertFalse(lane.repair_created_head(path, repair), "completion must preserve unpushed follow-up")
            self.assertFalse(lane.repair_created_head(path, initial))
            external = git("commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "external writer")
            git("reset", "--hard", external)
            self.assertFalse(lane.repair_created_head(path, external), "resetting to external work is not provenance")
            with patch.object(lane, "sh", side_effect=subprocess.TimeoutExpired("git", 30)):
                self.assertFalse(lane.repair_created_head(path, external))

    def test_external_push_during_or_after_agent_cancels_without_claiming_the_push(self):
        for stage in ("agent-running", "after-agent", "after-remote-read"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                changed, calls = [], []
                def live(pr):
                    return {**pr, "state": "OPEN", "headRefOid": "external" if changed and stage != "after-remote-read" else "h1"}
                def shell(args, **kwargs):
                    calls.append(args)
                    if args[:3] == ["git", "worktree", "add"]:
                        Path(args[-2]).mkdir(parents=True)
                    output = "external\trefs/heads/devin/jov-1\n" if args[:2] == ["git", "ls-remote"] else ""
                    return SimpleNamespace(returncode=0, stdout=output, stderr="")
                def agent(cmd, cwd, log, timeout, **kwargs):
                    (cwd / "distinct.py").write_text("retain this repair")
                    changed.append(True)
                    if stage == "agent-running":
                        kwargs["guard"]()
                    return SimpleNamespace(returncode=0)
                with patch.object(lane, "reconcile_fix_target", side_effect=live), \
                        patch.object(lane, "sh", side_effect=shell), patch.object(lane, "run_agent", side_effect=agent), \
                        patch.object(lane, "failure_excerpt", return_value=""), \
                        patch.object(lane.disk_guard, "free_pct", return_value=50.0):
                    receipt = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, self.pr())
                self.assertEqual(receipt["verdict"], "cancelled")
                self.assertEqual(receipt["cancellation"]["stage"], stage)
                self.assertEqual((Path(receipt["preservedWorktree"]) / "distinct.py").read_text(), "retain this repair")
                self.assertFalse(any(cmd[:3] == ["gh", "pr", "merge"] or "DELETE" in cmd for cmd in calls))

    def test_own_pushed_head_is_accepted_but_external_head_is_not(self):
        with patch.object(lane, "reconcile_fix_target", return_value={**self.pr(), "state": "OPEN", "headRefOid": "h2"}), \
                patch.object(lane, "repair_created_head", return_value=True) as owned:
            self.assertEqual(lane.require_fix_target(self.pr(), "agent-running", worktree=Path("repair"))["headRefOid"], "h2")
            owned.assert_called_once_with(Path("repair"), "h2", allow_local_progress=True)
        with patch.object(lane, "reconcile_fix_target", return_value={**self.pr(), "state": "OPEN", "headRefOid": "h2"}), \
                patch.object(lane, "repair_created_head", return_value=False):
            with self.assertRaises(lane.RepairStopped):
                lane.require_fix_target(self.pr(), "after-agent", worktree=Path("repair"))

    def test_target_merging_after_checkout_cancels_before_install_and_preserves_source(self):
        for terminal in ("MERGED", "CLOSED", "UNKNOWN", "SUPERSEDED", "QUEUED", "QUEUE_UNKNOWN"):
            with self.subTest(terminal=terminal), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                checked_out, calls = [], []
                def live(pr):
                    if not checked_out:
                        return {**pr, "state": "OPEN"}
                    if terminal == "UNKNOWN":
                        return None
                    if terminal in ("QUEUED", "QUEUE_UNKNOWN"):
                        return {**pr, "state": "OPEN", "isInMergeQueue": True if terminal == "QUEUED" else None}
                    return {**pr, "state": "OPEN" if terminal == "SUPERSEDED" else terminal,
                            "headRefOid": "other" if terminal == "SUPERSEDED" else pr["headRefOid"]}
                def shell(args, **kwargs):
                    calls.append(args)
                    if args[:3] == ["git", "worktree", "add"]:
                        path = Path(args[-2])
                        path.mkdir(parents=True)
                        (path / "follow-up.py").write_text("distinct source")
                        checked_out.append(path)
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                with patch.object(lane, "reconcile_fix_target", side_effect=live), \
                        patch.object(lane, "sh", side_effect=shell), \
                        patch.object(lane, "run_agent") as agent, \
                        patch.object(lane.disk_guard, "free_pct", return_value=50.0):
                    receipt = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, self.pr())
                    self.assertEqual(receipt["cancellation"]["stage"], "before-install")
                    self.assertEqual(receipt["verdict"], "reconcile-unavailable" if terminal == "UNKNOWN" else "cancelled")
                    self.assertEqual((checked_out[0] / "follow-up.py").read_text(), "distinct source")
                    self.assertTrue((checked_out[0] / lane.disk_guard.PRESERVED_REPAIR).exists())
                    os.utime(checked_out[0], (0, 0))
                    lane.prune_worktrees(host)
                    self.assertTrue(checked_out[0].exists(), "later garbage collection must retain cancelled source")
                    agent.assert_not_called()
                self.assertFalse(any(cmd[:2] == ["pnpm", "install"] or cmd[:2] == ["git", "push"] for cmd in calls))
                ledger = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
                self.assertEqual(ledger[-1]["preservedWorktree"], str(checked_out[0]))

    def test_merge_after_agent_preserves_its_patch_and_never_rearms(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            merged, calls = [], []
            def live(pr):
                return {**pr, "state": "MERGED" if merged else "OPEN"}
            def shell(args, **kwargs):
                calls.append(args)
                if args[:3] == ["git", "worktree", "add"]:
                    Path(args[-2]).mkdir(parents=True)
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            def agent(cmd, cwd, log, timeout, **kwargs):
                (cwd / "distinct.py").write_text("keep me")
                merged.append(True)
                return SimpleNamespace(returncode=0)
            with patch.object(lane, "reconcile_fix_target", side_effect=live), \
                    patch.object(lane, "sh", side_effect=shell), patch.object(lane, "run_agent", side_effect=agent), \
                    patch.object(lane, "failure_excerpt", return_value=""), \
                    patch.object(lane.disk_guard, "free_pct", return_value=50.0):
                receipt = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, self.pr())
            self.assertEqual(receipt["cancellation"]["stage"], "after-agent")
            self.assertEqual((Path(receipt["preservedWorktree"]) / "distinct.py").read_text(), "keep me")
            self.assertFalse(any(cmd[:3] == ["gh", "pr", "merge"] for cmd in calls))

    def test_red_pr_waits_for_settled_checks_and_caps_attempts(self):
        pending = self.pr(checks=[{"status": "IN_PROGRESS"}, {"conclusion": "FAILURE"}])
        green = self.pr(checks=[{"status": "COMPLETED", "conclusion": "SUCCESS"}])
        self.assertIsNone(lane.red_pr([pending, green], {}))
        self.assertEqual(lane.red_pr([self.pr()], {})["number"], 5)
        self.assertIsNone(lane.red_pr([self.pr()], {"5": {"sha": "h1", "count": 1, "at": time.time()}}),
                          "a fix still running on this head holds it")
        self.assertEqual(lane.red_pr([self.pr()], {"5": {"sha": "h1", "count": 1, "at": time.time(),
                                                         "endedAt": time.time()}})["number"], 5,
                         "an attempt that ended without moving the head never parks the PR")
        # The spent head and the head our own fix pushed stay terminal; a head nobody here
        # pushed is new authoritative evidence and re-enters a fresh bounded generation (JOV-7089).
        self.assertIsNone(lane.red_pr([self.pr(sha="h2")], {"5": {"sha": "h2", "count": 2}}))
        self.assertIsNone(lane.red_pr([self.pr(sha="h2")],
                                      {"5": {"sha": "h1", "count": 2, "pushed": True, "pushedHead": "h2"}}))
        self.assertEqual(lane.red_pr([self.pr(sha="h2")], {"5": {"sha": "h1", "count": 2}})["number"], 5,
                         "an external head is re-entry evidence, not part of the dead generation")
        self.assertEqual(lane.red_pr([self.pr(sha="h2")], {"5": {"sha": "h1", "count": 1}})["number"], 5)

    def test_red_pr_leaves_dependabot_bumps_to_dependabot_auto_merge(self):
        bump = {**self.pr(), "headRefName": "dependabot/npm_and_yarn/dev-patch-8cf5366741"}
        self.assertIsNone(lane.red_pr([bump], {}), "a fix run cannot change what a version bump breaks")
        self.assertEqual(lane.red_pr([bump, self.pr(number=6)], {})["number"], 6)

    def test_red_pr_never_takes_a_held_pr(self):
        held = {**self.pr(), "labels": [{"name": "Hold"}]}
        self.assertIsNone(lane.red_pr([held], {}), "fixing a held PR re-arms auto-merge and re-enqueues it")
        self.assertEqual(lane.red_pr([held, self.pr(number=6)], {})["number"], 6)
        poison = {**self.pr(), "labels": [{"name": "queue-poison"}]}
        self.assertEqual(lane.red_pr([poison], {})["number"], 5, "queue-poison alone still goes to remediation")

    def test_gate_held_prs_go_to_the_fix_loop_with_the_gate_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.record_held(host, 5, "h1", ["check-failed:pnpm", "[component-ship-gate] FAIL - needs stories"])
            green = self.pr(checks=[{"status": "IN_PROGRESS"}])
            real = lane.sh
            lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
            try:
                claimed = lane.claim_red_pr(host, "devin", [{**green, "headRefName": "devin/jov-1-20260925204809"}])
            finally:
                lane.sh = real
            self.assertEqual(claimed["number"], 5)
            self.assertIn("component-ship-gate", lane.render_fix_prompt(claimed, ""))
            moved = {**green, "headRefOid": "h2", "headRefName": "devin/jov-1-20260925204809"}
            self.assertIsNone(lane.red_pr([moved], {}, json.loads((host.state / "held.json").read_text())))

    def test_an_unfixable_gate_hold_never_reaches_the_fix_loop(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.record_held(host, 5, "h1", ["diff-too-large:2000"])
            held = json.loads((host.state / "held.json").read_text())
            self.assertIsNone(lane.red_pr([self.pr()], {}, held),
                              "diff-too-large needs a human split, not MAX_FIX_ATTEMPTS model calls")
            self.assertEqual(lane.exhausted_prs([self.pr()], {}, held)[0]["number"], 5,
                             "the hold escalates to intake on the first pass")
            self.assertEqual(lane.exhausted_prs([self.pr()], {"5": {"escalated": True}}, held), [])

    def test_a_fixable_gate_hold_still_reaches_the_fix_loop(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.record_held(host, 5, "h1", ["code-change-without-test"])
            held = json.loads((host.state / "held.json").read_text())
            self.assertEqual(lane.red_pr([self.pr(checks=[])], {}, held)["number"], 5)
            self.assertEqual(lane.exhausted_prs([self.pr()], {}, held), [])

    def test_merge_conflicts_count_as_stuck_even_with_green_checks(self):
        dirty = {**self.pr(checks=[{"status": "COMPLETED", "conclusion": "SUCCESS"}]),
                 "mergeStateStatus": "DIRTY"}
        self.assertEqual(lane.red_pr([dirty], {})["number"], 5)
        prompt = lane.render_fix_prompt(dirty, "")
        self.assertIn("conflicts with main", prompt)
        self.assertIn("renumber yours", prompt)

    def test_a_pushed_fix_records_pending_intent_without_publishing_unverified_head(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        lane.failure_excerpt = lambda pr: ""
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            if args[:2] == ["git", "rev-parse"]:
                return SimpleNamespace(returncode=0, stdout="h9\n")
            if args[:2] == ["git", "reflog"]:
                return SimpleNamespace(returncode=0, stdout="h9\0commit: repair\n")
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h9\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                attempts = host.state / "fix-attempts.json"
                attempts.write_text(json.dumps({"5": {"sha": "h1", "count": 2, "at": time.time() - 1}}))
                with patch.object(lane, "run_agent", return_value=SimpleNamespace(returncode=0)):
                    receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, {
                        **self.pr(), "isDraft": False,
                        "labels": [{"name": "lane-fix-conflict"}, {"name": "lane-fix-red"}],
                    })
                self.assertEqual(receipt["verdict"], "fix-pushed")
                self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {"5": "h9"})
                record = json.loads(attempts.read_text())["5"]
                self.assertEqual((record["count"], record["pushedHead"], record["repairRunId"]),
                                 (2, "h9", receipt["runId"]))
                self.assertFalse((host.state / "verified.json").exists())
            finally:
                lane.sh, lane.failure_excerpt = real, real_excerpt
        self.assertFalse(any(call[:3] == ["gh", "pr", "merge"] for call in calls))
        deleted = {call[-1] for call in calls if call[:3] == ["gh", "api", "-X"] and "DELETE" in call}
        self.assertIn(f"repos/{lane.REPO_SLUG}/issues/5/labels/lane-fix-conflict", deleted)
        self.assertIn(f"repos/{lane.REPO_SLUG}/issues/5/labels/lane-fix-red", deleted)

    def test_a_pr_merged_before_its_fix_run_installs_nothing_and_records_cancellation(self):
        real_sh, real_agent = lane.sh, lane.run_agent
        calls = []
        lane.reconcile_fix_target = self.real_reconcile_fix_target

        def fake(args, **kw):
            calls.append(args)
            payload = {"number": 5, "state": "MERGED", "mergedAt": "2026-09-30T17:42:50Z",
                       "headRefName": "devin/jov-1", "headRefOid": "h1", "url": "https://x/pr/5",
                       "statusCheckRollup": []}
            return SimpleNamespace(returncode=0, stdout=json.dumps(repair_target_page(payload)), stderr="")
        lane.sh = fake
        lane.run_agent = lambda *a, **kw: self.fail("a merged target must not start an agent")
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                request = {**self.pr(), "eventKinds": ["dequeued"],
                           "gateEvidence": ["check-failed:ci-fast"],
                           "queueFailure": "source merge-group failure"}
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, request)
            finally:
                lane.sh, lane.run_agent = real_sh, real_agent
            ledger = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
        self.assertEqual((receipt["verdict"], receipt["reasons"]), ("cancelled", ["target-pr-merged"]))
        self.assertEqual(receipt["cancellation"]["mergedAt"], "2026-09-30T17:42:50Z")
        self.assertEqual(receipt["cancellation"]["requestSource"]["eventKinds"], ["dequeued"])
        self.assertEqual(receipt["cancellation"]["requestSource"]["queueFailure"], "source merge-group failure")
        self.assertEqual(ledger, [json.loads(json.dumps(receipt))],
                         "the cancellation and its original source are durable")
        self.assertFalse(any(cmd and cmd[0] in {"git", "pnpm"} for cmd in calls),
                         "a merged target performs zero checkout, install, or push work")

    def test_a_lockfile_only_conflict_skips_the_agent_and_records_gate_intent(self):
        real, real_resolve, real_agent = lane.sh, lane.resolve_generated_conflict, lane.run_agent
        lane.resolve_generated_conflict = lambda worktree, branch, log, **kwargs: True
        lane.run_agent = lambda *a, **k: self.fail("a lockfile-only conflict needs no model")
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            if args[:2] == ["git", "rev-parse"]:
                return SimpleNamespace(returncode=0, stdout="h9\n")
            if args[:2] == ["git", "reflog"]:
                return SimpleNamespace(returncode=0, stdout="h9\0commit: repair\n")
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h9\trefs/heads/devin/jov-1\n")
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]},
                                          {**self.pr(), "isDraft": False, "mergeStateStatus": "DIRTY"})
                pending = json.loads((host.state / "requeue.json").read_text())
            finally:
                lane.sh, lane.resolve_generated_conflict, lane.run_agent = real, real_resolve, real_agent
        self.assertEqual((receipt["verdict"], receipt["resolution"]), ("fix-pushed", "generated-regenerated"))
        self.assertNotIn(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], calls)
        self.assertEqual(pending, {"5": "h9"})
        self.assertFalse(any(c[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]) for c in calls))

    def test_excerpt_keeps_failing_lines_and_prompt_forbids_new_prs(self):
        real = lane.sh
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout=(
            "job\tstep\tall good\njob\tstep\t[component-ship-gate] FAIL - needs stories\n"))
        try:
            excerpt = lane.failure_excerpt(self.pr())
        finally:
            lane.sh = real
        self.assertIn("component-ship-gate] FAIL", excerpt)
        self.assertNotIn("all good", excerpt)
        prompt = lane.render_fix_prompt(self.pr(), excerpt)
        self.assertIn("Do not open a new PR", prompt)
        self.assertIn("devin/jov-1", prompt)

    def test_claims_are_visible_across_hosts_through_the_pr(self):
        real = lane.sh
        posted, comments = [], []

        def fake(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            if args[:2] == ["gh", "api"]:
                return SimpleNamespace(returncode=0, stdout="\n".join(comments), stderr="")
            if args[:3] == ["gh", "pr", "comment"]:
                posted.append(args[-1])
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.sh = fake
        try:
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"))
            comments.append(f"🤖 lane claim kind=fix sha=h1 host=other at={lane.now_iso()}")
            self.assertTrue(lane.claimed_elsewhere(5, "h1", "fix"))
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "gate"))
            self.assertFalse(lane.claimed_elsewhere(5, "h2", "fix"))
            comments[:] = [f"🤖 lane claim kind=fix sha=h1 host={lane.HOST} at={lane.now_iso()}"]
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"), "our own claim never blocks us")
            comments[:] = ["🤖 lane claim kind=fix sha=h1 host=other at=2020-01-01T00:00:00Z"]
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"), "stale claims expire")
            broken = lane.sh
            lane.sh = lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
            self.assertTrue(lane.claimed_elsewhere(5, "h1", "fix"), "an unreadable claim list fails closed")
            lane.sh = broken
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                draft = {**self.pr(), "isDraft": True}
                reservation = lane.claim_adoptable_pr(host, "devin", [draft])
                self.addCleanup(reservation.lock.release)
                self.assertEqual(reservation.pr["number"], 5)
                self.assertTrue(posted and posted[-1].startswith("🤖 lane claim kind=gate sha=h1"))
                comments[:] = [f"🤖 lane claim kind=gate sha=h1 host=other at={lane.now_iso()}"]
                host2 = lane.Host(state=Path(tmp) / "b")
                host2.state.mkdir()
                self.assertIsNone(lane.claim_adoptable_pr(host2, "devin", [draft]))
                self.assertFalse((host2.state / "verified.json").exists(), "a head another host owns is not marked ours")
                comments[:] = []
                reservation = lane.claim_adoptable_pr(host2, "devin", [draft])
                self.addCleanup(reservation.lock.release)
                self.assertEqual(reservation.pr["number"], 5, "retried once the claim is gone")
        finally:
            lane.sh = real

    def test_changes_requested_counts_as_red_and_every_repo_pr_is_a_candidate(self):
        human = {**self.pr(number=42), "headRefName": "tim/jov-1-manual", "isDraft": False,
                 "reviewDecision": "CHANGES_REQUESTED", "statusCheckRollup": [{"conclusion": "SUCCESS"}]}
        self.assertEqual(lane.red_pr([human], {})["number"], 42)
        clean = {**human, "reviewDecision": "APPROVED"}
        self.assertIsNone(lane.red_pr([clean], {}))
        real = lane.open_prs_summary
        lane.open_prs_summary = lambda: [{**human, "isCrossRepository": False},
                                         {**human, "number": 43, "isCrossRepository": True},
                                         {**human, "number": 44, "isDraft": True}]
        try:
            self.assertEqual([pr["number"] for pr in lane.repo_prs()], [42], "fork and draft PRs are not candidates")
        finally:
            lane.open_prs_summary = real

    def test_summary_lists_red_prs_without_per_check_rollups(self):
        """2026-09-27: per-check rollups for 45 devin PRs hit GitHub's secondary limit, so the
        lane saw zero red PRs. The aggregate state alone must still mark PRs red or pending."""
        saved = (lane.pr_events.open_prs_state, dict(lane._SUMMARY))
        states = {1: "FAILURE", 2: "PENDING", 3: "SUCCESS", 4: None}
        lane.pr_events.open_prs_state = lambda _lane: [
            {**self.pr(number=n), "headRefName": f"devin/jov-{n}-20260927", "rollup": state} for n, state in states.items()]
        lane._SUMMARY.update(at=0.0, prs=[])
        try:
            prs = lane.lane_prs("devin", providers={"devin": {}})
            self.assertEqual([pr["number"] for pr in prs], [1, 2, 3, 4])
            self.assertEqual(lane.red_pr(prs, {})["number"], 1)
            self.assertIsNone(lane.red_pr([pr for pr in prs if pr["number"] != 1], {}),
                              "pending, green and unchecked heads are not red")
            lane.pr_events.open_prs_state = lambda _lane: self.fail("the summary is cached for a minute")
            self.assertEqual(len(lane.open_prs_summary()), 4)
        finally:
            lane.pr_events.open_prs_state = saved[0]
            lane._SUMMARY.clear()
            lane._SUMMARY.update(saved[1])

    def test_claimed_pr_gets_its_real_checks(self):
        synthetic = {**self.pr(number=8), "statusCheckRollup": [{"name": "rollup", "synthetic": True,
                                                                 "conclusion": "FAILURE"}]}
        real_checks = [{"name": "ci-fast", "conclusion": "FAILURE", "detailsUrl": "https://x/job/9"}]
        saved = lane.sh
        calls = []
        lane.sh = lambda args, **k: calls.append(args) or SimpleNamespace(
            returncode=0, stderr="", stdout=json.dumps({"statusCheckRollup": real_checks}))
        try:
            self.assertEqual(lane.with_checks(synthetic)["statusCheckRollup"], real_checks)
            already = {**synthetic, "statusCheckRollup": real_checks}
            self.assertIs(lane.with_checks(already), already)
        finally:
            lane.sh = saved
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:4], ["gh", "pr", "view", "8"])

    def test_stuck_pr_escalation_stays_off_unless_the_flag_is_on(self):
        stuck = {**self.pr(number=7), "headRefName": "devin/jov-7-20260928000000",
                 "isDraft": False, "mergeStateStatus": "DIRTY", "title": "stuck one"}
        os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        real = lane.sh
        calls = []
        lane.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        linear = FakeLinear([])
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                (host.state / "fix-attempts.json").write_text(json.dumps(
                    {"7": {"sha": "h1", "count": lane.MAX_FIX_ATTEMPTS}}))
                lane.escalate_exhausted(host, [stuck], linear)
                self.assertFalse((host.state / "escalation.json").exists())
        finally:
            lane.sh = real
        self.assertEqual(calls, [])
        self.assertEqual(linear.moves, [])
        self.assertEqual(linear.comments, [])

    def test_exhausted_heads_get_one_terminal_disposition_not_queue_inventory(self):
        stuck = {**self.pr(number=7), "headRefName": "devin/jov-7-20260928000000",
                 "isDraft": False, "mergeStateStatus": "DIRTY", "title": "stuck one"}
        attempts = {"7": {"sha": "h1", "count": lane.MAX_FIX_ATTEMPTS}}
        self.assertEqual([pr["number"] for pr in lane.exhausted_prs([stuck], attempts)], [7])
        self.assertEqual([pr["number"] for pr in lane.exhausted_prs(
            [{**stuck, "headRefOid": "h2"}],
            {"7": {**attempts["7"], "pushed": True, "pushedHead": "h2"}})], [7],
            "the head the last fix pushed is still stuck: spent attempts escalate, never wait silently")
        self.assertEqual(lane.exhausted_prs([{**stuck, "headRefOid": "h2"}], attempts), [],
                         "a head nobody here pushed is new evidence: the fix loop owns re-entry")
        green = {**stuck, "headRefOid": "h2", "mergeStateStatus": "CLEAN",
                 "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}]}
        self.assertEqual(lane.exhausted_prs([green], attempts), [], "a head that went green is not escalated")
        self.assertEqual(lane.exhausted_prs([stuck], {"7": {**attempts["7"], "escalated": True}}), [])
        real = lane.sh
        posted = []
        lane.sh = lambda args, **k: posted.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        linear = FakeLinear([])
        real_healthy = lane.provider_healthy
        lane.provider_healthy = lambda spec: bool(spec.get("enabled", True))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            (host.state / "fix-attempts.json").write_text(json.dumps(attempts))
            os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
            try:
                lane.escalate_exhausted(host, [stuck], linear)
                fresh = json.loads((host.state / "fix-attempts.json").read_text())["7"]
                self.assertEqual(fresh["count"], lane.MAX_FIX_ATTEMPTS)
                self.assertNotIn("escalated", fresh)
                self.assertEqual(fresh["escalations"][0]["rung"], "update-branch")
                self.assertEqual(fresh["escalations"][0]["kind"], "deterministic")
                self.assertEqual(linear.moves, [], "a deterministic rung is not a terminal disposition")
                fresh["escalations"] += [
                    {"kind": "model", "rung": "escalate", "lane": "devin", "head": "h1", "at": 1},
                    {"kind": "model", "rung": "top-rung", "lane": "codex", "head": "h1", "at": 2, "topRung": True},
                ]
                (host.state / "fix-attempts.json").write_text(json.dumps({"7": fresh}))
                lane.escalate_exhausted(host, [stuck], linear)
                lane.escalate_exhausted(host, [stuck], linear)
            finally:
                lane.sh = real
                lane.provider_healthy = real_healthy
                os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
            self.assertEqual(linear.triaged, [], "a terminal outcome is not generic Triage inventory (JOV-7089)")
            self.assertEqual(linear.moves, [("id-JOV-7", "Backlog")],
                             "the owning issue gets exactly one explicit disposition")
            self.assertEqual(len(linear.comments), 1, "one durable disposition receipt")
            self.assertIn("terminal-disposition pr=7 head=h1", linear.comments[0][1])
            self.assertIn("jovie-terminal-disposition/v1", linear.comments[0][1])
            self.assertEqual(len([p for p in posted if p[:3] == ["gh", "pr", "comment"]]), 1)
            self.assertTrue(json.loads((host.state / "fix-attempts.json").read_text())["7"]["escalated"])
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text())["7"]["count"],
                             lane.MAX_FIX_ATTEMPTS)

    def test_terminal_disposition_dedupes_on_the_issue_when_local_flag_is_lost(self):
        stuck = {**self.pr(number=19246), "headRefName": "devin/jov-46-20260928000000",
                 "isDraft": False, "mergeStateStatus": "DIRTY", "title": "stuck"}
        real = lane.sh
        lane.sh = lambda args, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
        linear = FakeLinear([])
        # The disposition receipt for this head already exists on the owning issue.
        linear.comments.append(("id-JOV-46", "🤖 lanes terminal-disposition pr=19246 head=h1: …"))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            # A later attempt rewrote the record without `escalated` (the duplicate-issue bug).
            (host.state / "fix-attempts.json").write_text(json.dumps({"19246": {
                "sha": "h1", "count": lane.MAX_FIX_ATTEMPTS,
                "escalations": [
                    {"kind": "deterministic", "rung": "update-branch", "head": "h1", "at": 1},
                    {"kind": "model", "rung": "escalate", "lane": "devin", "head": "h1", "at": 2},
                    {"kind": "model", "rung": "top-rung", "lane": "codex", "head": "h1", "at": 3, "topRung": True},
                ]}}))
            os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
            try:
                lane.escalate_exhausted(host, [stuck], linear)
            finally:
                lane.sh = real
                os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        self.assertEqual(linear.triaged, [], "no queue inventory for a terminal generation")
        self.assertEqual(linear.moves, [], "a receipted disposition is not applied twice")

    def test_claim_records_attempt_before_work(self):
        real = lane.open_prs_summary, lane.sh
        lane.open_prs_summary = lambda: [{**self.pr(number=4), "headRefName": "devin/jov-6525-auto-merge-default"},
                                         {**self.pr(), "headRefName": "devin/jov-1-20260925204809"},
                                         {**self.pr(number=6), "headRefName": "claude/x"}]
        # No GitHub from tests: claimed_elsewhere/post_claim would read and comment on real PRs.
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="[]")
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_red_pr(host, "devin")["number"], 5)
                self.assertIsNone(lane.claim_red_pr(host, "devin"))
            finally:
                lane.open_prs_summary, lane.sh = real
            record = json.loads((host.state / "fix-attempts.json").read_text())["5"]
            self.assertEqual((record["sha"], record["count"], record["lane"]), ("h1", 1, "devin"))
            self.assertAlmostEqual(record["at"], time.time(), delta=60)

    def test_shared_cache_serves_every_worker_one_read_per_ttl(self):
        calls = []
        fetch = lambda: calls.append(1) or (None if len(calls) == 1 else ["pr"])
        saved = lane.SHARED_CACHE_DIR, os.environ.pop("LANES_EXECUTION_BACKEND")
        with tempfile.TemporaryDirectory() as tmp:
            lane.SHARED_CACHE_DIR = Path(tmp)
            try:
                self.assertIsNone(lane.shared("k", 60, fetch), "a failed read is returned")
                self.assertEqual(lane.shared("k", 60, fetch), ["pr"], "and never cached")
                self.assertEqual(lane.shared("k", 60, fetch), ["pr"])
                self.assertEqual(len(calls), 2, "fresh value served from the file")
                self.assertEqual(lane.shared("k", 0, fetch), ["pr"])
                self.assertEqual(len(calls), 3, "expired value is re-read")
            finally:
                lane.SHARED_CACHE_DIR, os.environ["LANES_EXECUTION_BACKEND"] = saved

    def test_shared_cache_serializes_concurrent_expired_fills(self):
        start = threading.Barrier(4)
        calls = []
        def fetch():
            calls.append(1)
            time.sleep(.05)
            return [{"number": 1, "headRefOid": "exact-head"}]
        def reader():
            start.wait()
            return lane.shared("open-prs", 60, fetch)
        with tempfile.TemporaryDirectory() as tmp, patch.object(lane, "SHARED_CACHE_DIR", Path(tmp)), patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "fixture"}):
            (Path(tmp)/'open-prs.json').write_text(json.dumps({"at": time.time()-61, "value": [{"headRefOid": "stale"}]}))
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(lambda _: reader(), range(4)))
            self.assertEqual(len(calls), 1)
            self.assertEqual(results, [[{"number": 1, "headRefOid": "exact-head"}]]*4)

    def test_shared_cache_rejects_future_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(lane, "SHARED_CACHE_DIR", Path(tmp)), patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "fixture"}):
            (Path(tmp)/'open-prs.json').write_text(json.dumps({"at": time.time()+60, "value": ['unverified-future']}))
            self.assertEqual(lane.shared('open-prs', 60, lambda: ['fresh']), ['fresh'])

    def test_a_head_claimed_elsewhere_is_skipped_not_a_stop(self):
        first, second = {**self.pr(number=4), "headRefName": "devin/jov-4-20260925204809"}, \
            {**self.pr(), "headRefName": "devin/jov-1-20260925204809"}
        saved = (lane.claimed_elsewhere, lane.post_claim)
        lane.claimed_elsewhere = lambda number, sha, kind: number == 4
        lane.post_claim = lambda *a, **k: None
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_red_pr(host, "devin", [first, second])["number"], 5)
                third = {**self.pr(number=6), "headRefName": "devin/jov-2-20260925204809"}
                drafts = [{**pr, "isDraft": True} for pr in (first, second, third)]
                reservation = lane.claim_adoptable_pr(host, "devin", drafts)
                self.addCleanup(reservation.lock.release)
                self.assertEqual(reservation.pr["number"], 6, "the already claimed repair stays with its owner")
            finally:
                lane.claimed_elsewhere, lane.post_claim = saved
            self.assertNotIn("4", json.loads((host.state / "fix-attempts.json").read_text()))

    def test_unverified_drafts_are_adopted_once_per_head(self):
        draft = {**self.pr(), "isDraft": True, "headRefName": "hyperagent/jov-6438-20260925t213221"}
        ready = {**self.pr(number=9), "isDraft": False}
        self.assertEqual(lane.unverified_pr([ready, draft], {})["number"], 5)
        self.assertIsNone(lane.unverified_pr([draft], {"5:h1": gate_proof("h1")}))
        saved = (lane.claimed_elsewhere, lane.post_claim)
        lane.claimed_elsewhere, lane.post_claim = (lambda *a, **k: False), (lambda *a, **k: None)  # no GitHub in CI
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                claim = lane.claim_adoptable_pr(host, "hyperagent", [draft])
                self.addCleanup(claim.lock.release)
                self.assertEqual(claim.pr["number"], 5)
                self.assertFalse((host.state / "verified.json").exists())
                self.assertIsNone(lane.claim_adoptable_pr(host, "hyperagent", [draft]))
            finally:
                lane.claimed_elsewhere, lane.post_claim = saved

    def test_adopt_gates_the_pr_head_and_leaves_a_receipt(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        target = patch.object(lane, "require_fix_target", side_effect=lambda pr, stage: pr)
        target.start()
        self.addCleanup(target.stop)
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.gate_pr = lambda host, pr, worktree, log, **kwargs: {
            "verdict": "landing", "pr": pr["number"], "reasons": []
        }
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.adopt_pr(host, "hyperagent", self.pr())
            finally:
                lane.sh, lane.gate_pr = real_sh, real_gate
            self.assertEqual((receipt["kind"], receipt["verdict"]), ("adopt", "landing"))

    def test_a_timed_out_adopt_is_not_counted_as_verified(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        target = patch.object(lane, "require_fix_target", side_effect=lambda pr, stage: pr)
        target.start()
        self.addCleanup(target.stop)
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")  # claim list reads as empty
        lane.gate_pr = lambda host, pr, worktree, log, **kwargs: {"verdict": "gate-timeout", "pr": pr["number"],
                                                        "reasons": ["gate-timeout:2400s:x1"]}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                draft = {**self.pr(), "isDraft": True}
                claimed = lane.claim_adoptable_pr(host, "devin", [draft])
                self.assertEqual(claimed.pr["number"], 5)
                lane.adopt_pr(host, "devin", claimed.pr, claim=claimed)
                self.assertFalse((host.state / "verified.json").exists())
                reservation = lane.claim_adoptable_pr(host, "devin", [draft])
                self.addCleanup(reservation.lock.release)
                self.assertEqual(reservation.pr["number"], 5)
            finally:
                lane.sh, lane.gate_pr = real_sh, real_gate

    def test_fix_run_reports_a_pushed_head_and_leaves_a_receipt(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        lane.failure_excerpt = lambda pr: "err"
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            if args[:2] == ["git", "rev-parse"]:
                return SimpleNamespace(returncode=0, stdout="h2\n")
            if args[:2] == ["git", "reflog"]:
                return SimpleNamespace(returncode=0, stdout="h2\0commit: repair\n")
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h2\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.pr())
            finally:
                lane.sh, lane.failure_excerpt = real, real_excerpt
            self.assertEqual((receipt["verdict"], receipt["headAfter"]), ("fix-pushed", "h2"))
            self.assertIn("fix-red", (host.state / "runs/ledger.jsonl").read_text())
        self.assertIn(lane.WORKTREE_INSTALL, calls)
        self.assertIn("--package-import-method=hardlink", lane.WORKTREE_INSTALL)
    def test_non_pushing_fix_runs_the_configured_second_attempt(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h1\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            if args[:2] == ["git", "rev-list"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="0\n")
            if args[:3] == ["git", "worktree", "remove"]:
                Path(args[-1]).rmdir()
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh, lane.failure_excerpt = fake, lambda pr: "err"
        self.addCleanup(lambda: (setattr(lane, "sh", real), setattr(lane, "failure_excerpt", real_excerpt)))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            first = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.pr())
            second = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, self.pr())
        self.assertEqual((first["execution"]["terminalState"], first["execution"]["retryDecision"],
                          second["verdict"], second["execution"]["attempt"]), (None, "retry", "fix-no-change", 2))

    def test_non_lockfile_conflict_preserves_the_second_agent_attempt(self):
        real_sh, real_excerpt, real_resolve = lane.sh, lane.failure_excerpt, lane.resolve_generated_conflict

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h1\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            if args[:2] == ["git", "rev-list"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="0\n")
            if args[:3] == ["git", "worktree", "remove"]:
                Path(args[-1]).rmdir()
            return SimpleNamespace(returncode=0, stderr="", stdout="")

        lane.sh, lane.failure_excerpt = fake, lambda pr: "err"
        lane.resolve_generated_conflict = lambda worktree, branch, log: False
        self.addCleanup(lambda: (setattr(lane, "sh", real_sh),
                                 setattr(lane, "failure_excerpt", real_excerpt),
                                 setattr(lane, "resolve_generated_conflict", real_resolve)))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            dirty = {**self.pr(), "mergeStateStatus": "DIRTY"}
            first = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, dirty)
            second = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, dirty)
        self.assertEqual((first["execution"]["retryDecision"], second["execution"]["attempt"],
                          second["execution"]["terminalState"]), ("retry", 2, "quarantined"))

@unittest.skipIf(os.environ.get("LANES_SELFTEST") == "1", "running inside a release self-test")
class UpdateTest(unittest.TestCase):
    def git(self, *args, cwd):
        subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)

    def test_release_selftest_never_sees_host_tuning(self):
        knobs = {"LANES_SLOTS_DEVIN": "2", "SYMPHONY_FILE_OVERLAP_GUARD": "flag", "LANES_PARKED_RETIRE": "0",
                 "CODEX_LANE_AUTH_MODE": "current-login", "CODEX_LANE_CLI": "/host/codex"}
        with patch.dict(os.environ, {**knobs, "PATH": "/bin"}):
            env = lane.selftest_env(Path("/scratch"))
        self.assertFalse(set(knobs) & set(env))
        self.assertEqual((env["PATH"], env["LANES_SELFTEST"], env["LANES_STATE"]), ("/bin", "1", "/scratch"))

    def test_mesh_dependency_root_falls_back_to_an_installed_pool_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp).resolve()
            repo, pool = tmp / "repo", tmp / "pool"
            repo.mkdir()
            slot = pool / "slot-a"
            for pin in lane.MESH_DEPENDENCY_PINS:
                (slot / pin).parent.mkdir(parents=True)
                (slot / pin).write_text("{}")
            (pool / "slot-a.ready").write_text("")
            (pool / "slot-b").mkdir()  # ready but not installed: skipped
            (pool / "slot-b.ready").write_text("")
            host = lane.Host(state=tmp / "state", repo=repo)
            with patch.object(lane.worktree_pool, "pool_dir", return_value=pool):
                self.assertEqual(lane.mesh_dependency_root(host), slot)
                for pin in lane.MESH_DEPENDENCY_PINS:
                    (repo / pin).parent.mkdir(parents=True)
                    (repo / pin).write_text("{}")
                self.assertEqual(lane.mesh_dependency_root(host), repo, "an installed host repo wins")
            with patch.object(lane.worktree_pool, "pool_dir", return_value=tmp / "missing"):
                self.assertIsNone(lane.mesh_dependency_root(lane.Host(state=tmp / "state", repo=tmp / "bare")))

    def test_prove_staging_names_the_refusal_and_the_cli_reports_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp).resolve()
            staging = tmp / "staging"
            (staging / "scripts/lanes").mkdir(parents=True)  # no mesh-runtime-bundle.mjs: node fails
            host = lane.Host(state=tmp / "state", repo=tmp / "repo")
            (tmp / "repo").mkdir()
            with patch.object(lane.worktree_pool, "pool_dir", return_value=tmp / "no-pool"):
                self.assertEqual(lane.prove_staging(host, staging), "mesh runtime dependency closure failed")
            self.assertTrue((staging / ".selftest-state").is_dir(), "scratch state lives under staging only")
            with patch.object(lane, "load_github_env"), patch.object(lane, "Host", return_value=host), \
                    patch.object(lane, "prove_staging", return_value="release tests failed") as proved, \
                    patch("sys.stdout", new_callable=io.StringIO) as out:
                self.assertEqual(lane.guarded_main(["prove-staging", str(staging)]), 1)
            self.assertEqual(out.getvalue().strip(), "release tests failed")
            self.assertEqual(proved.call_args.args[1], staging)
            with patch.object(lane, "load_github_env"), patch.object(lane, "Host", return_value=host), \
                    patch.object(lane, "prove_staging", return_value=None):
                self.assertEqual(lane.guarded_main(["prove-staging", str(staging)]), 0)

    def test_update_installs_tested_release_and_only_moves_the_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp).resolve()  # macOS /var -> /private/var must match .resolve() below
            origin, clone = tmp / "origin.git", tmp / "clone"
            self.git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
            self.git("clone", "-q", str(origin), str(clone), cwd=tmp)
            files = [p.relative_to(ROOT) for p in (ROOT / "scripts/lanes").iterdir() if p.is_file()]
            for rel in [*files, *map(Path, lane.LANE_TESTS), *map(Path, lane.RELEASE_EXTRAS)]:
                (clone / rel).parent.mkdir(parents=True, exist_ok=True)
                (clone / rel).write_text((ROOT / rel).read_text())
            self.git("add", "-A", cwd=clone)
            self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "lanes", cwd=clone)
            self.git("push", "-q", "origin", "HEAD:main", cwd=clone)
            host = lane.Host(state=tmp / "state", repo=clone)
            old_env = os.environ.get("LANES_SELFTEST")
            os.environ["LANES_SELFTEST"] = "1"
            try:
                # Reproduce the old updater's archive contract: its selector carries
                # only the HUD extra. New release tests must refuse that incomplete
                # bundle and leave the prior running release intact.
                legacy = host.state / "releases/legacy/scripts/lanes"
                legacy.mkdir(parents=True)
                (legacy / ".tree").write_text("legacy")
                (host.state / "current").symlink_to(legacy)
                with patch.object(lane, "RELEASE_EXTRAS", ["scripts/promotion-loss-metrics.mjs"]), \
                     patch.object(lane, "LANE_TESTS", [p for p in lane.LANE_TESTS
                                                     if p != "scripts/tests/test_lane_source_admission.py"]):
                    self.assertEqual(lane.update(host), 1)
                self.assertEqual((host.state / "current").resolve(), legacy)
                # Complete source without restored pins is still inadmissible.
                self.assertEqual(lane.update(host), 1)
                self.assertEqual((host.state / "current").resolve(), legacy)
                refused = json.loads((host.state / "update-refused.json").read_text())
                self.assertEqual(refused["why"], "mesh runtime dependency closure failed")
                # Supply only the actual existing pinned dependency route, then
                # advance the fixture clock past preserved normal backoff.
                for rel in ["apps/desktop/node_modules", "packages/agent-transport-contracts/node_modules"]:
                    (clone / rel).parent.mkdir(parents=True, exist_ok=True)
                    (clone / rel).symlink_to((ROOT / rel).resolve(), target_is_directory=True)
                with patch.object(lane.time, "time", return_value=refused["at"] + lane.UPDATE_RETRY_S + 1):
                    self.assertEqual(lane.update(host), 0)
                current = (host.state / "current").resolve()
                self.assertTrue((current / "lane_runner.py").exists())
                self.assertTrue((current.parent / "promotion-loss-metrics.mjs").exists())  # HUD PROMOTION line
                mesh = json.loads((current / ".mesh-runtime/manifest.json").read_text())
                self.assertTrue(mesh["isolatedImportPassed"])
                self.assertFalse(mesh["recipientAdmission"])
                for name, proof in mesh["outputs"].items():
                    self.assertEqual(hashlib.sha256((current / ".mesh-runtime" / name).read_bytes()).hexdigest(),
                                     proof["sha256"])
                manifest = json.loads((current / ".release.json").read_text())
                self.assertEqual(manifest["bundleDigest"], (current / ".bundle").read_text())
                self.assertEqual(manifest["objects"]["scripts/lanes"], (current / ".tree").read_text())
                for name in lane.RELEASE_EXTRAS:
                    self.assertTrue((current.parents[1] / name).exists(), name)
                # A running worker's release is never removed or rewritten by a no-op update.
                self.assertEqual(lane.update(host), 0)
                self.assertEqual((host.state / "current").resolve(), current)
                (clone / "unrelated.txt").write_text("unrelated main change")
                self.git("add", "unrelated.txt", cwd=clone)
                self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "unrelated", cwd=clone)
                self.git("push", "-q", "origin", "HEAD:main", cwd=clone)
                self.assertEqual(lane.update(host), 0)
                self.assertEqual((host.state / "current").resolve(), current)
                policy = clone / "scripts/lib/source-admission-policy.mjs"
                policy.write_text(policy.read_text() + "\n// policy-only activation regression\n")
                self.git("add", str(policy), cwd=clone)
                self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "policy", cwd=clone)
                self.git("push", "-q", "origin", "HEAD:main", cwd=clone)
                self.assertEqual(lane.update(host), 0)
                newer = (host.state / "current").resolve()
                self.assertNotEqual(newer, current, "policy-only change must activate a new bundle")
                self.assertTrue(current.exists(), "existing workers retain their old immutable bundle")
                self.assertEqual((newer.parent / "lib/source-admission-policy.mjs").read_text(), policy.read_text())
            finally:
                if old_env is None:
                    os.environ.pop("LANES_SELFTEST", None)
                else:
                    os.environ["LANES_SELFTEST"] = old_env


class ManagedMeshArchiveTest(unittest.TestCase):
    def test_managed_archive_retains_exact_verified_portable_closure(self):
        required = [".nvmrc", "pnpm-lock.yaml", "packages/agent-transport-contracts/work-order.ts",
                    "scripts/backlog-orchestrator/summer-triage-assessment-client.mjs"]
        self.assertTrue(set(required) <= set(lane.RELEASE_EXTRAS))
        if os.environ.get("LANES_SELFTEST") != "1":
            return  # Real archive verification runs inside every updater self-test.
        runtime = ROOT / "scripts/lanes/.mesh-runtime"
        proof = json.loads((runtime / "manifest.json").read_text())
        self.assertEqual(proof["schema"], "jovie.mesh-managed-runtime/v1")
        self.assertTrue(proof["isolatedImportPassed"])
        self.assertFalse(proof["recipientAdmission"])
        self.assertEqual(set(proof["outputs"]), {"receiver.mjs", "terminal.mjs"})
        self.assertEqual(proof["lockfileSha256"], hashlib.sha256((ROOT / "pnpm-lock.yaml").read_bytes()).hexdigest())
        expected = {"scripts/lanes/mesh-host-ack.mjs", "scripts/lanes/mesh-native-terminal.mjs",
                    "packages/agent-transport-contracts/work-order.ts",
                    "scripts/backlog-orchestrator/summer-triage-assessment-client.mjs"}
        self.assertEqual(set(proof["sourceFiles"]), expected)
        for path, digest in proof["sourceFiles"].items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), digest)
        for name, output in proof["outputs"].items():
            self.assertEqual(hashlib.sha256((runtime / name).read_bytes()).hexdigest(), output["sha256"])


class UpdateBackoffTest(unittest.TestCase):
    def test_a_refused_tree_backs_off_instead_of_stalling_every_dispatch_tick(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp) / "state", repo=Path(tmp) / "no-repo")
            host.state.mkdir()
            real = lane.sh
            lane.sh = lambda cmd, **k: SimpleNamespace(returncode=0, stderr="", stdout="t1\n" if "rev-parse" in cmd else "")
            identity = patch.object(lane, "release_identity", return_value={"bundleDigest": "t1", "sourceCommit": "a" * 40})
            identity.start()
            try:
                refused = host.state / "update-refused.json"
                refused.write_text(json.dumps({"tree": "t1", "at": time.time(), "why": "self-test timeout"}))
                self.assertEqual(lane.install_release(host), 1)
                self.assertFalse((host.state / "releases").exists(), "no self-test ran inside the backoff window")
                refused.write_text(json.dumps({"tree": "t1", "at": time.time() - lane.UPDATE_RETRY_S - 1}))
                with self.assertRaises(Exception):  # past the window it tries again (git archive here fails)
                    lane.install_release(host)
                self.assertTrue((host.state / "releases").exists())
            finally:
                identity.stop()
                lane.sh = real


class GateCommandAuthorityTest(unittest.TestCase):
    def test_authority_lost_while_waiting_never_starts_expensive_checks(self):
        faults = ("head", "merged", "unreadable", "hold", "repair", "spent", "sensitive", "revoked",
                  "owner", "owner-error", "owner-timeout", "local-head", "local-read", "bad-held", "bad-attempts")
        for fault in faults:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1", "isDraft": True}
                live = {**pr, "state": "OPEN"}; fake = FakeShell([pr]); waited = [False]
                baseline = {}
                def acquire(_host):
                    seat = lane.Locked(host.state / "slots/gate.0.lock", blocking=False)
                    self.assertTrue(seat.held); waited[0] = True
                    if fault == "head": live["headRefOid"] = "moved"
                    elif fault == "merged": live["state"] = "MERGED"
                    elif fault in ("hold", "sensitive"):
                        live["labels"] = [{"name": "hold" if fault == "hold" else lane.SENSITIVE_PR_LABEL}]
                    elif fault in ("repair", "spent"):
                        record = {"sha": "abc", "count": 1, "at": time.time()}
                        if fault == "spent": record.update(count=lane.MAX_FIX_ATTEMPTS, endedAt=time.time())
                        (host.state / "fix-attempts.json").write_text(json.dumps({"7": record}))
                    elif fault == "bad-held": (host.state / "held.json").write_text("[]")
                    elif fault == "bad-attempts": (host.state / "fix-attempts.json").write_text("not-json")
                    elif fault == "revoked": lane.revoke_publication(host, branch=pr["headRefName"], reason="operator-stop")
                    baseline.update({p.name: p.read_bytes() for p in host.state.glob("*.json")})
                    return seat, 1200
                def owner(*args, **kwargs):
                    self.assertEqual(kwargs["timeout"], 30)
                    if fault == "owner-error": raise OSError("unreadable")
                    if fault == "owner-timeout": raise lane.subprocess.TimeoutExpired("owner-read", 30)
                    return fault == "owner"
                def read_target(_pr):
                    return None if waited[0] and fault == "unreadable" else dict(live)
                def shell(args, **kwargs):
                    if waited[0] and args == ["git", "rev-parse", "HEAD"]:
                        self.assertEqual(kwargs["timeout"], 30)
                        if fault == "local-read": raise OSError("checkout unreadable")
                        if fault == "local-head": return SimpleNamespace(returncode=0, stdout="other", stderr="")
                    return fake(args, **kwargs)
                with patch.object(lane, "gate_slot", side_effect=acquire), patch.object(lane, "sh", side_effect=shell), \
                     patch.object(lane, "reconcile_fix_target", side_effect=read_target), \
                     patch.object(lane, "claimed_elsewhere", side_effect=owner):
                    result = lane.gate_pr(host, pr, Path(tmp), None)
                self.assertEqual(result["verdict"], "revoked" if fault == "revoked" else "gate-deferred")
                self.assertEqual((result["gateWaitS"], result["stage"]), (1200, "before-gate-command"))
                self.assertEqual(fake.calls.count(lane.CANONICAL_GATE), 0)
                self.assertFalse(any(c[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]) for c in fake.calls))
                self.assertEqual({p.name: p.read_bytes() for p in host.state.glob("*.json")}, baseline)
                seat = lane.Locked(host.state / "slots/gate.0.lock", blocking=False)
                self.assertTrue(seat.held); seat.release()
                claim = lane.reserve_gate(host, pr); self.assertIsNotNone(claim); claim.lock.release()

    def test_owner_read_is_followed_by_fresh_target_and_local_head(self):
        for change in ("head", "hold"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp)); pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1"}
                live = {**pr, "state": "OPEN"}; fake = FakeShell([pr]); order = []
                def owner(number, sha, kind, **kwargs):
                    order.append(kind)
                    if kind == "gate":
                        if change == "head": live["headRefOid"] = "moved"
                        else: live["labels"] = [{"name": "hold"}]
                    return False
                def target(_): order.append("target"); return dict(live)
                with patch.object(lane, "sh", fake), patch.object(lane, "reconcile_fix_target", side_effect=target), \
                     patch.object(lane, "claimed_elsewhere", side_effect=owner):
                    result = lane.gate_pr(host, pr, Path(tmp), None)
                self.assertEqual(result["verdict"], "gate-deferred")
                self.assertEqual(order[-3:], ["fix", "gate", "target"])
                self.assertNotIn(lane.CANONICAL_GATE, fake.calls)

    def test_changes_after_first_command_block_second_command_and_sensitive_review(self):
        for extra in ("command", "sensitive"):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp)); pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1"}
                live = {**pr, "state": "OPEN"}; fake = FakeShell([pr]); second = ["node", "second-check.mjs"]
                def shell(args, **kwargs):
                    if args == lane.CANONICAL_GATE: live["labels"] = [{"name": "hold"}]
                    return fake(args, **kwargs)
                commands = [lane.CANONICAL_GATE, second] if extra == "command" else [lane.CANONICAL_GATE]
                with patch.object(lane, "sh", side_effect=shell), patch.object(lane, "check_commands", return_value=commands), \
                     patch.object(lane, "reconcile_fix_target", side_effect=lambda _: dict(live)), \
                     patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "sensitive_review") as review:
                    result = lane.gate_pr(host, pr, Path(tmp), None, sensitive=extra == "sensitive")
                    review.assert_not_called()
                self.assertEqual(result["verdict"], "gate-deferred")
                self.assertEqual(fake.calls.count(lane.CANONICAL_GATE), 1); self.assertNotIn(second, fake.calls)
                self.assertFalse((host.state / "verified.json").exists())

    def test_sensitive_only_path_rechecks_authority_without_acquiring_a_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1"}
            live = {**pr, "state": "OPEN"}; fake = FakeShell([pr])
            def shell(args, **kwargs):
                if args[:2] == ["git", "diff"]: live["headRefOid"] = "moved"
                return fake(args, **kwargs)
            with patch.object(lane, "sh", side_effect=shell), patch.object(lane, "check_commands", return_value=[]), \
                 patch.object(lane, "reconcile_fix_target", side_effect=lambda _: dict(live)), \
                 patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "gate_slot") as seat, \
                 patch.object(lane, "sensitive_review") as review:
                result = lane.gate_pr(host, pr, Path(tmp), None, sensitive=True)
                seat.assert_not_called(); review.assert_not_called()
            self.assertEqual((result["verdict"], result["stage"]), ("gate-deferred", "before-sensitive-review"))

    def test_caller_reservation_and_operator_stop_keep_existing_lifetimes(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1"}
            claim = lane.reserve_gate(host, pr); fake = FakeShell([pr]); self.assertIsNotNone(claim)
            def shell(args, **kwargs):
                if args == lane.CANONICAL_GATE:
                    self.assertEqual(kwargs["pass_fds"][0], claim.lock.handle.fileno())
                    raise lane.RunStopped()
                return fake(args, **kwargs)
            try:
                with patch.object(lane, "sh", side_effect=shell), patch.object(lane, "claimed_elsewhere", return_value=False), \
                     self.assertRaises(lane.RunStopped):
                    lane.gate_pr(host, pr, Path(tmp), None, claim=claim)
                self.assertIsNone(lane.reserve_gate(host, pr), "caller still owns its reservation")
                seat = lane.Locked(host.state / "slots/gate.0.lock", blocking=False)
                self.assertTrue(seat.held); seat.release()
                self.assertFalse((host.state / "gate-timeouts.json").exists())
                self.assertFalse((host.state / "verified.json").exists())
            finally: claim.lock.release()

    def test_gate_projection_keeps_wait_stage_without_enclosing_run_identity(self):
        projected = lane.gate_outcome({"runId": "not-the-parent", "provider": "other", "verdict": "gate-deferred",
                                      "gateWaitS": 1200, "stage": "before-gate-command", "reasons": ["held"]})
        self.assertEqual(projected, {"verdict": "gate-deferred", "gateWaitS": 1200,
                                     "stage": "before-gate-command", "reasons": ["held"]})


class GateSingleflightTest(unittest.TestCase):
    def test_original_run_receives_the_actual_completed_gate_proof(self):
        with patch.object(lane, "sh", self.fake):
            result = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
        proof = json.loads((self.host.state / "verified.json").read_text())["7:abc"]
        self.assertEqual(result["gateResult"], proof)
        self.assertEqual(proof["policyDigest"], lane.GATE_POLICY_DIGEST)
        self.assertEqual(proof["reasons"], [])
        self.assertEqual(result["verdict"], "landing")
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name))
        self.pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1", "isDraft": True}
        self.fake = FakeShell([self.pr])

    def test_ended_manual_repair_before_final_ledger_can_gate_without_new_attempt(self):
        target = {**self.pr, "headRefName": "tim/manual-repair", "isDraft": False, "state": "OPEN"}
        before = {**target, "headRefOid": "old"}
        path = self.host.state / "fix-attempts.json"
        path.write_text(json.dumps({"7": {"sha": "old", "count": 2, "at": time.time() - 1}}))
        (self.host.state / "requeue.json").write_text(json.dumps({"7": "abc"}))
        lane.end_local_fix_attempt(self.host, before, {"verdict": "fix-pushed", "headAfter": "abc",
            "runId": "producing-repair", "branch": target["headRefName"], "headBefore": "old"})
        history = json.loads(path.read_text())
        self.assertFalse((self.host.state / "runs/ledger.jsonl").exists(), "exercise completion/ledger crash gap")
        with patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "post_claim"), \
             patch.object(lane, "sh", self.fake), \
             patch.object(lane, "reconcile_fix_target", return_value=target):
            self.assertIsNone(lane.claim_adoptable_pr(self.host, "devin", [], []), "existing inventory bounds selection")
            owner = lane.Locked(self.host.state / "locks/repair-pr-7.lock", blocking=False)
            try:
                self.assertIsNone(lane.claim_adoptable_pr(self.host, "devin", [], [target]))
            finally:
                owner.release()
            claim = lane.claim_adoptable_pr(self.host, "devin", [], [target])
            self.assertIsNotNone(claim)
            try:
                self.assertEqual(lane.gate_pr(self.host, target, Path("/tmp"), None, claim=claim)["verdict"], "landing")
            finally:
                claim.lock.release()
        self.assertEqual(self.fake.calls.count(lane.CANONICAL_GATE), 1)
        self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in self.fake.calls))
        self.assertEqual(json.loads(path.read_text()), history, "promotion does not restore repair attempts")

    def test_claim_is_not_proof_and_live_reservation_skips_to_next_pr(self):
        with patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "post_claim"):
            claim = lane.claim_adoptable_pr(self.host, "devin", [self.pr])
            self.addCleanup(claim.lock.release)
            self.assertFalse((self.host.state / "verified.json").exists())
            other = {**self.pr, "number": 8, "headRefName": "devin/jov-2"}
            next_claim = lane.claim_adoptable_pr(self.host, "devin", [self.pr, other])
            self.addCleanup(next_claim.lock.release)
            self.assertEqual(next_claim.pr["number"], 8)

    def test_legacy_claim_and_wrong_head_policy_or_sensitive_mode_are_not_proof(self):
        self.assertEqual(lane.unverified_pr([self.pr], {"7": "abc"}), self.pr)
        for proof in [gate_proof("other"), {**gate_proof("abc"), "policyDigest": "old"},
                      {**gate_proof("abc"), "verdict": "gate-timeout"}]:
            self.assertEqual(lane.unverified_pr([self.pr], {"7:abc": proof}), self.pr)
        sensitive = {**self.pr, "labels": [{"name": lane.SENSITIVE_PR_LABEL}]}
        self.assertEqual(lane.unverified_pr([sensitive], {"7:abc": gate_proof("abc")}), sensitive)

    def test_parallel_original_and_adopter_execute_full_gate_once(self):
        entered, finish = threading.Event(), threading.Event()
        calls = []
        def shell(args, **kwargs):
            if args == lane.CANONICAL_GATE:
                calls.append(args)
                entered.set()
                self.assertTrue(finish.wait(3))
            return self.fake(args, **kwargs)
        with patch.object(lane, "sh", side_effect=shell), concurrent.futures.ThreadPoolExecutor() as pool:
            original = pool.submit(lane.gate_pr, self.host, self.pr, Path("/tmp"), None)
            self.assertTrue(entered.wait(3))
            try:
                adopted = lane.adopt_pr(self.host, "devin", self.pr)
                duplicate = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
                self.assertEqual(adopted["verdict"], "gate-in-progress")
                self.assertEqual(duplicate["verdict"], "gate-in-progress")
                self.assertFalse((self.host.state / "worktrees").exists())
                self.assertFalse((self.host.state / "verified.json").exists())
            finally:
                finish.set()
            self.assertEqual(original.result()["verdict"], "landing")
            self.assertEqual(len(calls), 1)
            again = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
            self.assertEqual(again["verdict"], "gate-already-completed")
            self.assertEqual(len(calls), 1)
        proof = json.loads((self.host.state / "verified.json").read_text())["7:abc"]
        self.assertEqual(proof["verdict"], "landing")
        self.assertTrue(proof["completedAt"])
        self.assertIn("--match-head-commit", next(c for c in self.fake.calls if c[:3] == ["gh", "pr", "merge"]))

    def test_reserved_adopter_prevents_original_from_taking_heavy_seat(self):
        claim = lane.reserve_gate(self.host, self.pr)
        try:
            with patch.object(lane, "gate_slot") as seat, patch.object(lane, "sh") as shell:
                result = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
            self.assertEqual(result["verdict"], "gate-in-progress")
            seat.assert_not_called()
            shell.assert_not_called()
        finally:
            claim.lock.release()
        with patch.object(lane, "sh", self.fake):
            self.assertEqual(lane.gate_pr(self.host, self.pr, Path("/tmp"), None)["verdict"], "landing")

    def test_head_changed_during_gate_cannot_publish_or_record_terminal_proof(self):
        live = {**self.pr, "state": "OPEN"}
        def shell(args, **kwargs):
            if args == lane.CANONICAL_GATE:
                live["headRefOid"] = "new"
            return self.fake(args, **kwargs)
        with patch.object(lane, "reconcile_fix_target", side_effect=lambda _: dict(live)), patch.object(lane, "sh", shell):
            result = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
        self.assertEqual(result["verdict"], "gate-deferred")
        self.assertEqual(self.fake.calls.count(lane.CANONICAL_GATE), 1)
        # The moved head is caught before the next gate command (the funnel gate) runs.
        self.assertEqual(result["stage"], "before-gate-command")
        self.assertFalse(any("scripts/funnel-judge/preview-gate.mjs" in c for c in self.fake.calls))
        self.assertIn("gateWaitS", result)
        self.assertFalse((self.host.state / "verified.json").exists())
        self.assertFalse(any(c[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]) for c in self.fake.calls))

    def test_wrong_checkout_or_unreadable_target_cannot_be_certified(self):
        for fault in ("checkout", "unreadable"):
            with self.subTest(fault=fault):
                def shell(args, **kwargs):
                    if fault == "checkout" and args == ["git", "rev-parse", "HEAD"]:
                        return SimpleNamespace(returncode=0, stdout="wrong", stderr="")
                    if fault == "unreadable" and args[:3] == ["gh", "api", "graphql"] \
                            and f"query={lane.REPAIR_TARGET_QUERY}" in args:
                        return SimpleNamespace(returncode=1, stdout="", stderr="unavailable")
                    return self.fake(args, **kwargs)
                with patch.object(lane, "sh", side_effect=shell):
                    result = lane.gate_pr(self.host, self.pr, Path("/tmp"), None)
                self.assertEqual(result["verdict"], "gate-deferred")
                self.assertFalse((self.host.state / "verified.json").exists())

    def test_new_sensitive_mode_and_revocation_are_checked_after_work(self):
        for change in ("sensitive", "revoked"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                live = {**self.pr, "state": "OPEN"}
                def shell(args, **kwargs):
                    if args == lane.CANONICAL_GATE:
                        if change == "sensitive":
                            live["labels"] = [{"name": lane.SENSITIVE_PR_LABEL}]
                        else:
                            lane.revoke_publication(host, branch=self.pr["headRefName"], reason="stopped")
                    return self.fake(args, **kwargs)
                with patch.object(lane, "reconcile_fix_target", side_effect=lambda _pr: dict(live)), \
                     patch.object(lane, "sh", side_effect=shell):
                    result = lane.gate_pr(host, self.pr, Path("/tmp"), None)
                self.assertEqual(result["verdict"], "gate-deferred" if change == "sensitive" else "revoked")
                self.assertFalse((host.state / "verified.json").exists())

    def test_terminal_hold_and_timeout_budget_survive_reentry(self):
        self.fake.hanging = ("scripts/hooks/pre-push-gate.sh",)
        with patch.object(lane, "sh", self.fake):
            results = [lane.gate_pr(self.host, self.pr, Path("/tmp"), None)["verdict"] for _ in range(4)]
        self.assertEqual(results, ["gate-timeout", "gate-timeout", "held", "gate-already-completed"])
        proofs = json.loads((self.host.state / "verified.json").read_text())
        self.assertIsNone(lane.unverified_pr([self.pr], proofs))
        self.assertEqual(proofs["7:abc"]["verdict"], "held")
        self.assertEqual(lane.gate_timeouts(self.host, self.pr), lane.MAX_GATE_TIMEOUTS)

    def test_legacy_held_spent_or_claimed_fix_generations_cannot_be_adopted_or_regated(self):
        for disposition in ("held", "spent", "fix-running", "hold-label"):
            with self.subTest(disposition=disposition), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                pr = dict(self.pr)
                (host.state / "verified.json").write_text(json.dumps({"7": "abc"}))
                if disposition == "held":
                    lane.record_held(host, 7, "abc", ["check-failed:old-gate"])
                elif disposition == "hold-label":
                    pr["labels"] = [{"name": "tim-hold"}]
                else:
                    entry = {"sha": "abc", "count": 2 if disposition == "spent" else 1,
                             "at": time.time(), "endedAt": None if disposition == "fix-running" else time.time()}
                    (host.state / "fix-attempts.json").write_text(json.dumps({"7": entry}))
                with patch.object(lane, "sh", FakeShell([pr])) as shell, \
                     patch.object(lane, "post_claim") as posted, patch.object(lane, "claimed_elsewhere", return_value=False):
                    self.assertIsNone(lane.claim_adoptable_pr(host, "devin", [pr]))
                    result = lane.gate_pr(host, pr, Path("/tmp"), None)
                    self.assertEqual(result["verdict"], "gate-deferred")
                    self.assertNotIn(lane.CANONICAL_GATE, shell.calls)
                    posted.assert_not_called()
                self.assertEqual(json.loads((host.state / "verified.json").read_text()), {"7": "abc"})

    def test_authority_changed_during_ready_cannot_enqueue_despite_completed_gate_proof(self):
        for change in ("sensitive", "revoked", "held"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                live = {**self.pr, "state": "OPEN"}
                def shell(args, **kwargs):
                    if args[:3] == ["gh", "pr", "ready"]:
                        if change == "revoked":
                            lane.revoke_publication(host, branch=self.pr["headRefName"], reason="stopped")
                        else:
                            live["labels"] = [{"name": lane.SENSITIVE_PR_LABEL if change == "sensitive" else "tim-hold"}]
                    return self.fake(args, **kwargs)
                self.fake.calls.clear()
                with patch.object(lane, "reconcile_fix_target", side_effect=lambda _pr: dict(live)), \
                     patch.object(lane, "sh", side_effect=shell):
                    result = lane.gate_pr(host, self.pr, Path("/tmp"), None)
                self.assertEqual(result["verdict"], "verified-not-queued")
                self.assertTrue(result["promotion"].startswith("held:"))
                proof = json.loads((host.state / "verified.json").read_text())["7:abc"]
                self.assertEqual(proof["verdict"], "verified-not-queued")
                self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {"7": "abc"})
                self.assertFalse(any(c[:3] == ["gh", "pr", "merge"] for c in self.fake.calls))

    def test_successful_final_repair_push_may_receive_its_first_gate_without_resetting_budget(self):
        attempt = {"sha": "old", "pushedHead": "abc", "pushed": True, "count": 2, "endedAt": time.time()}
        path = self.host.state / "fix-attempts.json"
        path.write_text(json.dumps({"7": attempt}))
        with patch.object(lane, "sh", self.fake):
            self.assertEqual(lane.gate_pr(self.host, self.pr, Path("/tmp"), None)["verdict"], "landing")
            self.assertEqual(lane.gate_pr(self.host, self.pr, Path("/tmp"), None)["verdict"], "gate-already-completed")
        self.assertEqual(json.loads(path.read_text()), {"7": attempt})
        self.assertEqual(self.fake.calls.count(lane.CANONICAL_GATE), 1)

    def test_legacy_timeout_budget_is_carried_into_first_structured_hold(self):
        path = self.host.state / "gate-timeouts.json"
        path.write_text(json.dumps({"7": {"sha": "abc", "count": 2}}))
        self.fake.hanging = ("scripts/hooks/pre-push-gate.sh",)
        with patch.object(lane, "sh", self.fake):
            self.assertEqual(lane.gate_pr(self.host, self.pr, Path("/tmp"), None)["verdict"], "held")
        self.assertEqual(lane.gate_timeouts(self.host, self.pr), 3)

    def test_parallel_state_writers_and_late_head_results_do_not_erase_each_other(self):
        def write(index):
            pr = {**self.pr, "headRefOid": str(index)}
            lane.gate_timeouts(self.host, pr, 1)
            lane.update_json(self.host.state / "verified.json",
                             lambda rows: rows.update({f"7:{index}": gate_proof(str(index))}))
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(write, range(12)))
        self.assertEqual(len(json.loads((self.host.state / "verified.json").read_text())), 12)
        for index in range(12):
            self.assertEqual(lane.gate_timeouts(self.host, {**self.pr, "headRefOid": str(index)}), 1)

    @unittest.skipUnless(sys.platform == "linux", "Linux worker-death lock inheritance")
    def test_worker_death_does_not_release_a_surviving_gate_childs_locks(self):
        child_code = "import os,time; print(os.getpid(), flush=True); time.sleep(30)"
        worker_code = (f"import sys; sys.path.insert(0, {str(ROOT / 'scripts/lanes')!r}); import lane_runner as l; "
                       f"from pathlib import Path; h=l.Host(state=Path({str(self.host.state)!r})); "
                       f"c=l.reserve_gate(h, {self.pr!r}); s,_=l.gate_slot(h); "
                       f"l.sh([sys.executable,'-c',{child_code!r}], log=sys.stdout, stream=True, "
                       "pass_fds=(c.lock.handle.fileno(),s.handle.fileno()))")
        worker = subprocess.Popen([sys.executable, "-u", "-c", worker_code], stdout=subprocess.PIPE, text=True)
        child = None
        try:
            worker.stdout.readline()  # command log
            child = int(worker.stdout.readline())
            worker.kill()
            worker.wait(timeout=3)
            self.assertIsNone(lane.reserve_gate(self.host, self.pr))
            seat = lane.Locked(self.host.state / "slots/gate.0.lock", blocking=False)
            self.assertFalse(seat.held)
            seat.release()
        finally:
            if worker.poll() is None:
                worker.kill()
                worker.wait(timeout=3)
            if child:
                os.killpg(child, signal.SIGKILL)
            worker.stdout.close()
        for _ in range(100):
            claim = lane.reserve_gate(self.host, self.pr)
            if claim:
                claim.lock.release()
                break
            time.sleep(0.01)
        else:
            self.fail("dead worker and child left a non-reclaimable reservation")

    @unittest.skipUnless(sys.platform == "linux", "Linux detached process ownership")
    def test_gate_timeout_drains_detached_close_fds_descendants_before_return(self):
        pidfile = self.host.state / "descendant.pid"
        child = f"import os,time,pathlib; pathlib.Path({str(pidfile)!r}).write_text(str(os.getpid())); time.sleep(30)"
        wrapper = ("import subprocess,sys,time; "
                   f"subprocess.Popen([sys.executable,'-c',{child!r}], start_new_session=True, close_fds=True, "
                   "stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(30)")
        claim = lane.reserve_gate(self.host, self.pr)
        seat, _ = lane.gate_slot(self.host)
        try:
            with self.assertRaises(subprocess.TimeoutExpired):
                lane.sh([sys.executable, "-c", wrapper], timeout=2,
                        pass_fds=(claim.lock.handle.fileno(), seat.handle.fileno()))
            pid = int(pidfile.read_text())
            self.assertTrue(pid not in lane.process_snapshot() or lane.process_snapshot()[pid][2].startswith("Z"))
        finally:
            claim.lock.release()
            seat.release()

    @unittest.skipUnless(sys.platform == "linux", "Linux worker-death lock lifetime helper")
    def test_worker_death_retains_locks_across_close_fds_wrapper_until_helper_drains(self):
        pidfile = self.host.state / "descendant.pid"
        child = f"import os,time,pathlib; pathlib.Path({str(pidfile)!r}).write_text(str(os.getpid())); time.sleep(30)"
        wrapper = ("import subprocess,sys,time; "
                   f"subprocess.Popen([sys.executable,'-c',{child!r}], start_new_session=True, close_fds=True, "
                   "stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(30)")
        worker_code = (f"import sys; sys.path.insert(0, {str(ROOT / 'scripts/lanes')!r}); import lane_runner as l; "
                       f"from pathlib import Path; h=l.Host(state=Path({str(self.host.state)!r})); "
                       f"c=l.reserve_gate(h, {self.pr!r}); s,_=l.gate_slot(h); "
                       f"l.sh([sys.executable,'-c',{wrapper!r}], timeout=3, log=sys.stdout, stream=True, "
                       "pass_fds=(c.lock.handle.fileno(),s.handle.fileno()))")
        with open(self.host.state / "worker.log", "w") as log:
            worker = subprocess.Popen([sys.executable, "-u", "-c", worker_code], stdout=log, stderr=log)
            try:
                for _ in range(200):
                    if pidfile.exists():
                        break
                    time.sleep(.01)
                self.assertTrue(pidfile.exists())
                time.sleep(.2)  # allow the existing process observer to see the detached child
                worker.kill()
                worker.wait(timeout=3)
                self.assertIsNone(lane.reserve_gate(self.host, self.pr))
                seat = lane.Locked(self.host.state / "slots/gate.0.lock", blocking=False)
                self.assertFalse(seat.held)
                seat.release()
                for _ in range(600):
                    claim = lane.reserve_gate(self.host, self.pr)
                    if claim:
                        claim.lock.release()
                        break
                    time.sleep(.01)
                else:
                    self.fail("helper did not complete timeout drainage")
                pid = int(pidfile.read_text())
                rows = lane.process_snapshot()
                self.assertTrue(pid not in rows or rows[pid][2].startswith("Z"))
            finally:
                if worker.poll() is None:
                    worker.kill()
                    worker.wait(timeout=3)


class RequeueTest(unittest.TestCase):
    def test_partial_inventory_retains_unknown_and_reconciles_exact_publishable_head(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); path = host.state / "requeue.json"
            pr = {"number": 5, "state": "OPEN", "headRefOid": "head-A", "headRefName": "devin/jov-3-retry", "isDraft": True}
            (host.state / "verified.json").write_text(json.dumps({"5:head-A": gate_proof("head-A")}))
            for live in (None, {**pr, "state": "CLOSED"}, {**pr, "headRefOid": "head-B"}, pr):
                with self.subTest(live=live), patch.object(lane, "reconcile_fix_target", return_value=live), \
                        patch.object(lane, "claimed_elsewhere", return_value=False), \
                        patch.object(lane, "source_publication_authority", return_value=None), \
                        patch.object(lane, "sh", side_effect=lambda cmd, **kwargs: SimpleNamespace(returncode=0, stdout=json.dumps({"number": 5, "reenrollable": True}))) as command:
                    path.write_text(json.dumps({"5": "head-A"})); lane.requeue_verified(host, [])
                    self.assertEqual(json.loads(path.read_text()), {"5": "head-A"} if live is None else {})
                    if live == pr:
                        self.assertEqual([call.args[0] for call in command.call_args_list if call.args[0][0] == "gh"], [
                            ["gh", "pr", "ready", "5", "--repo", lane.REPO_SLUG],
                            ["gh", "pr", "merge", "5", "--repo", lane.REPO_SLUG, "--auto", "--match-head-commit", "head-A"]])
                    else: command.assert_not_called()
            lane.revoke_publication(host, branch=pr["headRefName"], reason="run-stopped")
            with patch.object(lane, "reconcile_fix_target", return_value=pr), patch.object(lane, "sh") as command:
                path.write_text(json.dumps({"5": "head-A"})); lane.requeue_verified(host, []); command.assert_not_called()
                self.assertEqual(json.loads(path.read_text()), {"5": "head-A"})

    def test_a_failed_enqueue_is_retried_until_queued_and_dropped_when_the_head_moves(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            path = host.state / "requeue.json"
            path.write_text(json.dumps({"5": "h1", "6": "h1", "7": "h1"}))
            (host.state / "verified.json").write_text(json.dumps({f"{n}:h1": gate_proof("h1") for n in (5, 6)}))
            calls = []
            def fake_sh(cmd, **kwargs):
                calls.append(cmd)
                if cmd[:3] == ["gh", "api", "graphql"] and f"query={lane.REPAIR_TARGET_QUERY}" in cmd:
                    number = int(next(arg.split("=", 1)[1] for arg in cmd if arg.startswith("number=")))
                    return SimpleNamespace(returncode=0, stdout=json.dumps(repair_target_page(
                        {"number": number, "headRefOid": "h2" if number == 7 else "h1", "headRefName": "devin/jov-1", "state": "OPEN"})))
                # PR 6 is still rate-limited; everything else enqueues.
                return SimpleNamespace(returncode=1 if cmd[1:4] == ["pr", "merge", "6"] else 0,
                                       stdout=publication_response(cmd), stderr="")
            real, lane.sh = lane.sh, fake_sh
            try:
                lane.requeue_verified(host, [{"number": 5, "headRefOid": "h1"}, {"number": 6, "headRefOid": "h1"},
                                             {"number": 7, "headRefOid": "h2"}])
            finally:
                lane.sh = real
            self.assertEqual(json.loads(path.read_text()), {"6": "h1"})
            self.assertNotIn("7", [c[3] for c in calls if c[:3] == ["gh", "pr", "merge"]])
            self.assertIn(["gh", "pr", "merge", "5", "--repo", lane.REPO_SLUG, "--auto", "--match-head-commit", "h1"], calls)


    def test_retained_head_push_race_retains_retry_without_queueing_unverified_head(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); path = host.state / "requeue.json"
            path.write_text(json.dumps({"5": "head-A"})); live = {"head": "head-A"}; queued = []
            (host.state / "verified.json").write_text(json.dumps({"5:head-A": gate_proof("head-A")}))
            def command(cmd, **kwargs):
                if cmd[:3] == ["gh", "pr", "ready"]: live["head"] = "head-B"
                pin = cmd[cmd.index("--match-head-commit") + 1] if "--match-head-commit" in cmd else None
                rejected = cmd[:3] == ["gh", "pr", "merge"] and pin != live["head"] and pin is not None
                if cmd[:3] == ["gh", "pr", "merge"] and not rejected: queued.append(live["head"])
                return SimpleNamespace(returncode=int(rejected), stdout="", stderr="")
            pr = {"number": 5, "headRefOid": "head-A", "headRefName": "devin/jov-5", "state": "OPEN", "isDraft": True}
            with patch.object(lane, "sh", side_effect=command), \
                    patch.object(lane, "claimed_elsewhere", return_value=False), \
                    patch.object(lane, "source_publication_authority", return_value=None), \
                    patch.object(lane, "reconcile_fix_target", side_effect=lambda _pr: {**pr, "headRefOid": live["head"]}):
                lane.requeue_verified(host, [pr])
            self.assertEqual(live["head"], "head-B"); self.assertEqual(queued, [])
            self.assertEqual(json.loads(path.read_text()), {"5": "head-A"})
    def test_requeue_rechecks_authority_changed_during_ready(self):
        for change in ("revoked", "sensitive", "head", "unreadable", "held"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-1", "state": "OPEN", "isDraft": True}
                (host.state / "verified.json").write_text(json.dumps({"7:abc": gate_proof("abc")}))
                path = host.state / "requeue.json"
                path.write_text(json.dumps({"7": "abc"}))
                live = dict(pr)
                fake = FakeShell([pr])
                def shell(args, **kwargs):
                    if args[:3] == ["gh", "pr", "ready"]:
                        if change == "revoked":
                            lane.revoke_publication(host, branch=pr["headRefName"], reason="stopped")
                        elif change == "head":
                            live["headRefOid"] = "new"
                        elif change == "unreadable":
                            live.clear()
                        else:
                            live["labels"] = [{"name": lane.SENSITIVE_PR_LABEL if change == "sensitive" else "tim-hold"}]
                    return fake(args, **kwargs)
                with patch.object(lane, "reconcile_fix_target", side_effect=lambda _pr: dict(live) or None), \
                     patch.object(lane, "sh", side_effect=shell):
                    lane.requeue_verified(host, [pr])
                self.assertFalse(any(c[:3] == ["gh", "pr", "merge"] for c in fake.calls))
                self.assertEqual(json.loads(path.read_text()), {"7": "abc"})



class RepairCheckPaginationTest(unittest.TestCase):
    def target(self):
        return {"number": 5, "headRefName": "devin/jov-1-20260926t0900", "headRefOid": "h1",
                "isDraft": False, "isCrossRepository": False, "isInMergeQueue": False,
                "state": "OPEN", "labels": [], "statusCheckRollup": []}

    def page(self, start=0, count=100, *, more=True, cursor="page-1"):
        page = repair_target_page(self.target())
        contexts = page["data"]["repository"]["pullRequest"]["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"]
        contexts.update(pageInfo={"hasNextPage": more, "endCursor": cursor}, nodes=[
            {"__typename": "CheckRun", "id": f"check-{index}", "name": f"required-{index}",
             "status": "COMPLETED", "conclusion": "SUCCESS"} for index in range(start, start + count)])
        contexts.update(totalCount=101, checkRunCount=101, statusContextCount=0,
                        checkRunCountsByState=[{"state": "SUCCESS", "count": 101}],
                        statusContextCountsByState=[])
        return page

    def contexts(self, page):
        return page["data"]["repository"]["pullRequest"]["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"]

    def census(self, pages):
        groups = ({}, {})
        for page in pages:
            for row in self.contexts(page)["nodes"]:
                index = 0 if row["__typename"] == "CheckRun" else 1
                state = (row.get("conclusion") if row["status"] == "COMPLETED" else row["status"]) \
                    if index == 0 else row["state"]
                groups[index][state] = groups[index].get(state, 0) + 1
        totals = [sum(group.values()) for group in groups]
        for page in pages:
            self.contexts(page).update(totalCount=sum(totals), checkRunCount=totals[0],
                statusContextCount=totals[1],
                checkRunCountsByState=[{"state": key, "count": count} for key, count in groups[0].items()],
                statusContextCountsByState=[{"state": key, "count": count} for key, count in groups[1].items()])

    def read(self, pages, *, census=True):
        if census and all(page.get("data", {}).get("repository", {}).get("pullRequest", {}).get("state") == "OPEN" for page in pages):
            self.census(pages)
        responses = [SimpleNamespace(returncode=0, stdout=json.dumps(page), stderr="") for page in pages]
        with patch.object(lane, "sh", side_effect=responses) as command:
            result = lane.reconcile_fix_target(self.target())
        return result, command

    def test_required_failure_beyond_first_hundred_is_complete_repair_evidence(self):
        first, second = self.page(), self.page(100, 1, more=False)
        self.contexts(second)["nodes"][0]["conclusion"] = "FAILURE"
        live, command = self.read([first, second])
        self.assertEqual(len(live["statusCheckRollup"]), 101)
        self.assertEqual(lane.red_pr([live], {})["number"], 5)
        self.assertNotIn("cursor=page-1", command.call_args_list[0].args[0])
        self.assertIn("cursor=page-1", command.call_args_list[1].args[0])
        self.assertTrue(all(call.kwargs["timeout"] == 30 for call in command.call_args_list))

    def test_complete_sixth_page_failure_selects_repair(self):
        for total in (503, 506):
            with self.subTest(total=total):
                pages = [self.page(start, min(100, total - start), more=start + 100 < total,
                                   cursor=f"page-{start // 100 + 1}")
                         for start in range(0, total, 100)]
                self.contexts(pages[-1])["nodes"][-1]["conclusion"] = "FAILURE"
                live, command = self.read(pages)
                self.assertIsNotNone(live, "a complete 503/506-context read must not stop at 500")
                self.assertEqual(len(live["statusCheckRollup"]), total)
                self.assertEqual(lane.red_pr([live], {})["number"], self.target()["number"])
                self.assertEqual(command.call_count, 6)
                for call in command.call_args_list:
                    self.assertIn("owner=JovieInc", call.args[0])
                    self.assertIn("name=Jovie", call.args[0])
                    self.assertEqual(call.kwargs["timeout"], 30)

    def test_complete_cancelled_only_inventory_does_not_manufacture_source_failure(self):
        for total in (503, 506):
            with self.subTest(total=total):
                pages = [self.page(start, min(100, total - start), more=start + 100 < total,
                                   cursor=f"page-{start // 100 + 1}")
                         for start in range(0, total, 100)]
                self.contexts(pages[0])["nodes"][0]["conclusion"] = "CANCELLED"
                for index, context in enumerate(("jovie-queue-failure-hold/v1", "jovie-queue-failure-retry/v1",
                                                 "jovie-queue-admission-recovery/v1")):
                    self.contexts(pages[-1])["nodes"][index] = {
                        "__typename": "StatusContext", "id": f"native-{index}",
                        "context": context, "state": "SUCCESS"}
                live, command = self.read(pages)
                self.assertIsNotNone(live)
                self.assertEqual(len(live["statusCheckRollup"]), total)
                self.assertEqual(command.call_count, 6)
                self.assertIsNone(lane.red_pr([live], {}))

    def test_six_page_resource_ceiling_refuses_601_contexts_after_one_read(self):
        self.assertEqual(lane.REPAIR_CHECK_PAGES, 6)
        page = self.page()
        self.contexts(page).update(totalCount=601, checkRunCount=601,
            checkRunCountsByState=[{"state": "SUCCESS", "count": 601}])
        live, command = self.read([page], census=False)
        self.assertIsNone(live)
        self.assertEqual(command.call_count, 1)

    def test_dependency_metadata_transition_cannot_splice_paginated_authority(self):
        for field in ["title", "body"]:
            first, second = self.page(), self.page(100, 1, more=False)
            for page in [first, second]:
                page["data"]["repository"]["pullRequest"].update(title="chore(deps): bump", body="Dependency chore")
            second["data"]["repository"]["pullRequest"][field] = "fix(deps): regression"
            live, command = self.read([first, second])
            self.assertIsNone(live)
            self.assertEqual(command.call_count, 2)

    def test_pending_on_later_page_cannot_be_hidden_by_earlier_failure(self):
        for state in ("IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED", "UNKNOWN"):
            first, second = self.page(), self.page(100, 1, more=False)
            self.contexts(first)["nodes"][0]["conclusion"] = "FAILURE"
            self.contexts(second)["nodes"][0].update(status=state, conclusion=None)
            live, _ = self.read([first, second])
            with self.subTest(state=state): self.assertIsNone(lane.red_pr([live], {}))

    def test_legacy_pending_on_later_page_suppresses_repair_without_expanding_red_policy(self):
        for state in ("PENDING", "EXPECTED", "ERROR", "FAILURE"):
            first, second = self.page(), self.page(100, 1, more=False)
            self.contexts(second)["nodes"] = [{"__typename": "StatusContext", "id": "legacy",
                                              "context": "legacy", "state": state}]
            live, _ = self.read([first, second])
            self.assertIsNone(lane.red_pr([live], {}), "legacy failures alone retain their original authority")
            self.contexts(first)["nodes"][0]["conclusion"] = "FAILURE"
            live, _ = self.read([first, second])
            self.assertEqual(lane.red_pr([live], {}) is None, state in {"PENDING", "EXPECTED"})

    def test_changed_global_count_or_pending_state_census_refuses_partial_snapshot(self):
        for fault in ("inserted-before-cursor", "pending-earlier-page", "missing-counts", "wrong-length", "malformed-count"):
            first, second = self.page(), self.page(100, 1, more=False)
            self.census([first, second])
            connection = self.contexts(second)
            if fault == "inserted-before-cursor":
                connection.update(totalCount=102, checkRunCount=102,
                                  checkRunCountsByState=[{"state": "SUCCESS", "count": 102}])
            if fault == "pending-earlier-page":
                connection["checkRunCountsByState"] = [{"state": "SUCCESS", "count": 100}, {"state": "IN_PROGRESS", "count": 1}]
            if fault == "missing-counts": self.contexts(first).pop("checkRunCountsByState")
            if fault == "wrong-length":
                for page in (first, second):
                    self.contexts(page).update(totalCount=102, checkRunCount=102,
                        checkRunCountsByState=[{"state": "SUCCESS", "count": 102}])
            if fault == "malformed-count": self.contexts(first)["totalCount"] = True
            with self.subTest(fault=fault): self.assertIsNone(self.read([first, second], census=False)[0])

    def test_stable_but_wrong_state_census_cannot_certify_stale_earlier_page(self):
        first, second = self.page(), self.page(100, 1, more=False)
        self.census([first, second])
        for page in (first, second):
            self.contexts(page)["checkRunCountsByState"] = [
                {"state": "SUCCESS", "count": 100}, {"state": "QUEUED", "count": 1}]
        self.assertIsNone(self.read([first, second], census=False)[0])

    def test_changed_head_queue_review_or_hold_never_splices_page_authority(self):
        for field, value in (("headRefOid", "h2"), ("headRefName", "other-branch"),
                             ("isInMergeQueue", True), ("isCrossRepository", True),
                             ("isDraft", True), ("mergeStateStatus", "DIRTY"),
                             ("reviewDecision", "CHANGES_REQUESTED")):
            first, second = self.page(), self.page(100, 1, more=False)
            node = second["data"]["repository"]["pullRequest"]
            node[field] = value
            if field == "headRefOid":
                node["commits"]["nodes"][0]["commit"]["oid"] = value
            with self.subTest(field=field):
                self.assertIsNone(self.read([first, second])[0])
        first, second = self.page(), self.page(100, 1, more=False)
        second["data"]["repository"]["pullRequest"]["labels"]["nodes"] = [{"name": "hold"}]
        self.assertIsNone(self.read([first, second])[0])

    def test_partial_error_duplicate_cursor_or_context_refuses_repair(self):
        for fault in ("cursor", "missing-cursor", "duplicate-id", "missing-id", "empty", "errors"):
            first, second = self.page(), self.page(100, 1, more=False)
            connection = self.contexts(second)
            if fault == "cursor": connection["pageInfo"].update(hasNextPage=True, endCursor="page-1")
            if fault == "missing-cursor": self.contexts(first)["pageInfo"].pop("endCursor")
            if fault == "duplicate-id": connection["nodes"][0]["id"] = "check-0"
            if fault == "missing-id": connection["nodes"][0].pop("id")
            if fault == "empty": connection["nodes"] = []
            if fault == "errors": second["errors"] = [{"message": "partial response"}]
            with self.subTest(fault=fault): self.assertIsNone(self.read([first, second])[0])
        for failure in (OSError("unavailable"), subprocess.TimeoutExpired("gh", 30),
                        SimpleNamespace(returncode=75, stdout="", stderr="budget floor")):
            with self.subTest(failure=type(failure).__name__), patch.object(lane, "sh", side_effect=[
                    SimpleNamespace(returncode=0, stdout=json.dumps(self.page())), failure]):
                self.assertIsNone(lane.reconcile_fix_target(self.target()))

    def test_fixed_page_limit_refuses_overflow_without_more_reads(self):
        pages = [self.page(index * 100, cursor=f"page-{index + 1}")
                 for index in range(lane.REPAIR_CHECK_PAGES)]
        live, command = self.read(pages)
        self.assertIsNone(live)
        self.assertEqual(command.call_count, 6)
        self.contexts(pages[-1])["pageInfo"]["hasNextPage"] = False
        live, command = self.read(pages)
        self.assertEqual(len(live["statusCheckRollup"]), 600)
        self.assertEqual(command.call_count, 6)

    def test_positive_terminal_evidence_on_later_page_still_cancels_work(self):
        terminal = {"data": {"repository": {"pullRequest": {"number": 5, "state": "MERGED"}}}}
        live, command = self.read([self.page(), terminal])
        self.assertEqual(live["state"], "MERGED")
        self.assertEqual(command.call_count, 2)


class RepairCheckOverflowDiagnosticTest(unittest.TestCase):
    contexts = RepairCheckPaginationTest.contexts

    def target(self):
        return {"number": 5, "headRefName": "devin/jov-1-20260926t0900", "headRefOid": "a" * 40,
                "isDraft": False, "isCrossRepository": False, "isInMergeQueue": False,
                "state": "OPEN", "labels": [], "statusCheckRollup": []}

    def pages(self, total=607):
        page = repair_target_page(self.target(), title="fix(lanes): reader", body="private body",
                                  url="https://github.com/JovieInc/Jovie/pull/5",
                                  updatedAt="2026-10-10T12:00:00Z")
        self.contexts(page).update(totalCount=total, checkRunCount=total, statusContextCount=0,
            checkRunCountsByState=[{"state": "SUCCESS", "count": total}], statusContextCountsByState=[],
            pageInfo={"hasNextPage": True, "endCursor": "opaque-prefix"}, nodes=[
                {"__typename": "CheckRun", "id": f"check-{index}", "name": f"required-{index}",
                 "status": "COMPLETED", "conclusion": "SUCCESS"} for index in range(100)])
        final = json.loads(json.dumps(page))
        self.contexts(final).pop("nodes")
        self.contexts(final).pop("pageInfo")
        return page, final

    def read(self, pages, *, clock=100, target=None):
        responses = [page if isinstance(page, (BaseException, SimpleNamespace)) else SimpleNamespace(
            returncode=0, stdout=json.dumps(page), stderr="") for page in pages]
        stderr = io.StringIO()
        clock_args = {"side_effect": clock} if isinstance(clock, list) else {"return_value": clock}
        with patch.object(lane, "sh", side_effect=responses) as command, \
                patch.object(lane.time, "monotonic", **clock_args), patch("sys.stderr", stderr):
            result = lane.reconcile_fix_target(target or self.target())
        receipts = [json.loads(line) for line in stderr.getvalue().splitlines()]
        return result, command, receipts

    def test_oversized_negative_census_is_diagnostic_not_detailed_repair_authority(self):
        for total in (601, 607, 610, 100000):
            with self.subTest(total=total):
                live, command, receipts = self.read(self.pages(total))
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 2)
                self.assertTrue(all(call.kwargs["timeout"] == 30 for call in command.call_args_list))
                self.assertNotIn("cursor=opaque-prefix", command.call_args_list[1].args[0])
                query = next(arg for arg in command.call_args_list[1].args[0] if arg.startswith("query="))
                self.assertNotIn("nodes{__typename", query)
                self.assertEqual(len(receipts), 1)
                receipt = receipts[0]
                self.assertEqual(receipt["schema"], "jovie.repair-check-overflow-negative/v1")
                self.assertIs(receipt["predicateComplete"], True)
                self.assertIs(receipt["contextsComplete"], False)
                self.assertIs(receipt["repairAuthorized"], False)
                self.assertEqual(receipt["totalCount"], total)
                self.assertEqual(receipt["headSha"], self.target()["headRefOid"])
                self.assertEqual(receipt["sampleCount"], 100)
                self.assertNotIn("statusCheckRollup", receipt)
                self.assertNotIn("private body", json.dumps(receipt))

    def test_positive_or_pending_overflow_refuses_before_an_extra_read(self):
        for state in ("FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "IN_PROGRESS", "PENDING",
                      "QUEUED", "WAITING", "COMPLETED", "REQUESTED", "UNKNOWN"):
            first, _ = self.pages()
            self.contexts(first)["checkRunCountsByState"] = [
                {"state": "SUCCESS", "count": 606}, {"state": state, "count": 1}]
            with self.subTest(state=state):
                live, command, receipts = self.read([first])
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(receipts, [])
        for state in ("PENDING", "EXPECTED"):
            first, _ = self.pages()
            self.contexts(first).update(checkRunCount=606, statusContextCount=1,
                checkRunCountsByState=[{"state": "SUCCESS", "count": 606}],
                statusContextCountsByState=[{"state": state, "count": 1}])
            self.assertEqual(self.read([first])[2], [])

    def test_contradictory_or_malformed_prefix_cannot_be_rescued_by_second_census(self):
        faults = ("failure", "timeout", "startup", "pending", "requested", "unconcluded", "unknown-conclusion",
                  "unknown-type", "null-row", "missing-id", "blank-id", "duplicate-id", "blank-name",
                  "short", "long", "empty", "false-next", "missing-next", "blank-cursor", "missing-cursor",
                  "sample-bucket-exceeds-total", "sample-type-exceeds-total", "unknown-zero-bucket")
        for fault in faults:
            first, final = self.pages()
            connection = self.contexts(first); rows = connection["nodes"]
            if fault in ("failure", "timeout", "startup"):
                rows[0]["conclusion"] = {"failure": "FAILURE", "timeout": "TIMED_OUT", "startup": "STARTUP_FAILURE"}[fault]
            if fault in ("pending", "requested"): rows[0].update(status=fault.upper(), conclusion=None)
            if fault == "unconcluded": rows[0]["conclusion"] = None
            if fault == "unknown-conclusion": rows[0]["conclusion"] = "FUTURE"
            if fault == "unknown-type": rows[0]["__typename"] = "FutureContext"
            if fault == "null-row": rows[0] = None
            if fault == "missing-id": rows[0].pop("id")
            if fault == "blank-id": rows[0]["id"] = " "
            if fault == "duplicate-id": rows[1]["id"] = rows[0]["id"]
            if fault == "blank-name": rows[0]["name"] = " "
            if fault == "short": rows.pop()
            if fault == "long": rows.append({**rows[-1], "id": "extra"})
            if fault == "empty": connection["nodes"] = []
            if fault == "false-next": connection["pageInfo"]["hasNextPage"] = False
            if fault == "missing-next": connection["pageInfo"].pop("hasNextPage")
            if fault == "blank-cursor": connection["pageInfo"]["endCursor"] = " "
            if fault == "missing-cursor": connection["pageInfo"].pop("endCursor")
            if fault == "sample-bucket-exceeds-total":
                connection["checkRunCountsByState"] = [{"state": "SUCCESS", "count": 99}, {"state": "CANCELLED", "count": 508}]
            if fault == "sample-type-exceeds-total":
                connection.update(checkRunCount=99, statusContextCount=508,
                    checkRunCountsByState=[{"state": "SUCCESS", "count": 99}],
                    statusContextCountsByState=[{"state": "SUCCESS", "count": 508}])
            if fault == "unknown-zero-bucket": connection["checkRunCountsByState"].append({"state": "FUTURE", "count": 0})
            with self.subTest(fault=fault):
                live, command, receipts = self.read([first, final])
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(receipts, [])

    def test_cancelled_and_legacy_failure_keep_their_separate_policies(self):
        first, _ = self.pages()
        rows = self.contexts(first)["nodes"]
        rows[0]["conclusion"] = "CANCELLED"
        rows[1] = {"__typename": "StatusContext", "id": "legacy-error", "context": "legacy", "state": "ERROR"}
        rows[2] = {"__typename": "StatusContext", "id": "legacy-failure", "context": "legacy-2", "state": "FAILURE"}
        self.contexts(first).update(checkRunCount=605, statusContextCount=2,
            checkRunCountsByState=[{"state": "SUCCESS", "count": 604}, {"state": "CANCELLED", "count": 1}],
            statusContextCountsByState=[{"state": "ERROR", "count": 1}, {"state": "FAILURE", "count": 1}])
        final = json.loads(json.dumps(first));self.contexts(final).pop("nodes");self.contexts(final).pop("pageInfo")
        live, command, receipts = self.read([first, final])
        self.assertIsNone(live)
        self.assertEqual(command.call_count, 2)
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0]["census"]["checkRunCountsByState"]["CANCELLED"], 1)

    def test_second_read_moving_authority_census_or_transport_cannot_emit_negative(self):
        for fault in ("head", "branch", "queue", "draft", "cross-repo", "review", "conflict", "labels",
                      "metadata", "counts", "unknown-state", "partial", "null-rollup", "wrong-commit", "transport"):
            first, final = self.pages()
            node = final["data"]["repository"]["pullRequest"]
            if fault == "head": node["headRefOid"] = "b" * 40
            if fault == "branch": node["headRefName"] = "other-branch"
            if fault == "queue": node["isInMergeQueue"] = True
            if fault == "draft": node["isDraft"] = True
            if fault == "cross-repo": node["isCrossRepository"] = True
            if fault == "review": node["reviewDecision"] = "CHANGES_REQUESTED"
            if fault == "conflict": node["mergeStateStatus"] = "DIRTY"
            if fault == "labels": node["labels"]["nodes"] = [{"name": "hold"}]
            if fault == "metadata": node["body"] = "new dependency contract"
            if fault == "counts": self.contexts(final)["totalCount"] += 1
            if fault == "unknown-state": self.contexts(final)["checkRunCountsByState"] = [{"state": "FUTURE", "count": 607}]
            if fault == "partial": final["errors"] = [{"message": "private read failure"}]
            if fault == "null-rollup": node["commits"]["nodes"][0]["commit"]["statusCheckRollup"] = None
            if fault == "wrong-commit": node["commits"]["nodes"][0]["commit"]["oid"] = "b" * 40
            if fault == "transport": final = subprocess.TimeoutExpired("gh", 30)
            with self.subTest(fault=fault):
                live, command, receipts = self.read([first, final])
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 2)
                self.assertEqual(receipts, [])

    def test_nonfinite_clock_cannot_emit_or_extend_overflow_reads(self):
        for clock in (float("nan"), float("inf"), -1, True):
            with self.subTest(clock=clock):
                live, command, receipts = self.read(self.pages(), clock=clock)
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(receipts, [])

    def test_elapsed_or_rollback_clock_refuses_without_fallback(self):
        for clock, calls in (([100, 99], 1), ([100, 131], 1), ([100, 100, 99], 2),
                             ([100, 100, 131], 2), ([100, 100, float("nan")], 2)):
            with self.subTest(clock=clock):
                live, command, receipts = self.read(self.pages(), clock=clock)
                self.assertIsNone(live)
                self.assertEqual(command.call_count, calls)
                self.assertEqual(receipts, [])

    def test_diagnostic_never_charges_polling_event_or_execution_entry(self):
        for positive in (False, True):
            for boundary in ("polling", "event", "execution"):
                with self.subTest(positive=positive, boundary=boundary), tempfile.TemporaryDirectory() as tmp:
                    host = lane.Host(state=Path(tmp), repo=Path(tmp))
                    candidate = {**self.target(), "mergeStateStatus": "BLOCKED", "reviewDecision": None,
                        "eventKinds": ["review"], "statusCheckRollup": [
                            {"name": "ci", "status": "COMPLETED", "conclusion": "FAILURE"}]}
                    first, final = self.pages()
                    if positive:
                        self.contexts(first)["checkRunCountsByState"] = [
                            {"state": "SUCCESS", "count": 606}, {"state": "FAILURE", "count": 1}]
                    responses = [SimpleNamespace(returncode=0, stdout=json.dumps(page), stderr="")
                                 for page in (first, final)]
                    with patch.object(lane, "sh", side_effect=responses) as command, \
                            patch.object(lane.time, "monotonic", return_value=100), patch("sys.stderr", io.StringIO()), \
                            patch.object(lane, "load_providers", return_value={"codex": {}}), \
                            patch.object(lane.pr_events, "cost_order", return_value=["codex"]), \
                            patch.object(lane.pr_events, "may_take", return_value=True), \
                            patch.object(lane, "claimed_elsewhere", return_value=False), \
                            patch.object(lane.pr_events, "charge_reentry") as charge, \
                            patch.object(lane, "post_claim") as post, \
                            patch.object(lane.execution_attempt, "claim") as execution, \
                            patch.object(lane, "run_agent") as provider:
                        if boundary == "polling":
                            self.assertIsNone(lane.claim_red_pr(host, "codex", [candidate]))
                        elif boundary == "event":
                            self.assertIsNone(lane.pr_events.claim_event_pr(host, lane.THIS, "codex", [candidate]))
                        else:
                            with self.assertRaises(lane.RepairStopped) as stopped:
                                lane.require_fix_target(candidate, "before-install", repair=True)
                            self.assertEqual(str(stopped.exception), "target-state-unavailable")
                        self.assertEqual(command.call_count, 1 if positive else 2)
                        charge.assert_not_called();post.assert_not_called()
                        execution.assert_not_called();provider.assert_not_called()
                    self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_other_repair_causes_and_native_hold_input_are_preserved(self):
        for cause in ("conflict", "review", "gate", "dequeued", "stale"):
            first, final = self.pages()
            for page in (first, final):
                node = page["data"]["repository"]["pullRequest"]
                node["labels"]["nodes"] = [{"name": "jovie-queue-failure-hold/v1"}]
                if cause == "conflict": node["mergeStateStatus"] = "DIRTY"
                if cause == "review": node["reviewDecision"] = "CHANGES_REQUESTED"
            before = json.dumps((first, final), sort_keys=True)
            target = self.target()
            target.update(eventKinds=[cause], gateEvidence=["existing same-head local gate hold"],
                          queueFailure="original unclassified native failure")
            with self.subTest(cause=cause):
                live, command, receipts = self.read([first, final], target=target)
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 2)
                self.assertEqual(len(receipts), 1)
                self.assertEqual(json.dumps((first, final), sort_keys=True), before)
                self.assertEqual(target["eventKinds"], [cause])
                self.assertEqual(target["queueFailure"], "original unclassified native failure")

    def test_quota_floor_and_read_errors_get_no_inline_retry(self):
        for failure in (SimpleNamespace(returncode=75, stdout="", stderr="github-budget-floor"),
                        SimpleNamespace(returncode=0, stdout="not json", stderr=""),
                        OSError("private read failure")):
            first, _ = self.pages()
            with self.subTest(failure=type(failure).__name__):
                live, command, receipts = self.read([first, failure])
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 2)
                self.assertEqual(receipts, [])
                live, command, receipts = self.read([failure])
                self.assertIsNone(live)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(receipts, [])

    def test_second_read_terminal_evidence_still_cancels_work(self):
        for state in ("MERGED", "CLOSED"):
            first, _ = self.pages()
            terminal = {"data": {"repository": {"pullRequest": {"number": 5, "state": state}}}}
            live, command, receipts = self.read([first, terminal])
            self.assertEqual(live["state"], state)
            self.assertEqual(command.call_count, 2)
            self.assertEqual(receipts, [])


class RepairQueueAuthorityTest(unittest.TestCase):
    def target(self):
        return {"number": 5, "headRefName": "devin/jov-1-20260926t0900", "headRefOid": "h1",
                "isDraft": False, "isCrossRepository": False, "isInMergeQueue": False,
                "state": "OPEN", "labels": [], "statusCheckRollup": []}

    def read(self, payload):
        with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(payload))) as command:
            result = lane.reconcile_fix_target(self.target())
            self.assertEqual(command.call_count, 1)
            self.assertEqual(command.call_args.args[0][:3], ["gh", "api", "graphql"])
            return result

    def test_single_read_binds_ownership_checks_and_head(self):
        target = self.target()
        target["statusCheckRollup"] = [{"name": "ci", "status": "COMPLETED", "conclusion": "FAILURE"}]
        result = self.read(repair_target_page(target))
        self.assertIs(result["isInMergeQueue"], False)
        self.assertEqual(result["statusCheckRollup"][0]["conclusion"], "FAILURE")
        self.assertEqual(result["labels"], [])
        page = repair_target_page(self.target())
        page["data"]["repository"]["pullRequest"]["commits"]["nodes"][0]["commit"]["statusCheckRollup"] = None
        self.assertEqual(self.read(page)["statusCheckRollup"], [])

    def test_incomplete_or_malformed_target_never_authorizes_repair(self):
        mutations = [
            lambda p: p.pop("isInMergeQueue"),
            lambda p: p.update(isInMergeQueue=None),
            lambda p: p.update(isInMergeQueue=0),
            lambda p: p.update(isInMergeQueue="false"),
            lambda p: p.pop("isCrossRepository"),
            lambda p: p.update(number=6),
            lambda p: p.update(state="UNKNOWN"),
            lambda p: p.update(headRefOid=""),
            lambda p: p.update(labels={"pageInfo": {"hasNextPage": True}, "nodes": []}),
            lambda p: p.update(labels={"pageInfo": {"hasNextPage": False}, "nodes": [{}]}),
            lambda p: p.update(commits={"nodes": []}),
            lambda p: p["commits"]["nodes"][0]["commit"].update(oid="other-head"),
            lambda p: p["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"]["pageInfo"].update(hasNextPage=True),
            lambda p: p["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"].update(nodes=[{"__typename": "Unknown"}]),
            lambda p: p["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"].update(nodes=[None]),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutations.index(mutate)):
                page = repair_target_page(self.target());mutate(page["data"]["repository"]["pullRequest"])
                self.assertIsNone(self.read(page))
        self.assertIsNone(self.read({**repair_target_page(self.target()), "errors": [{"message": "partial"}]}))
        for error in (OSError("unavailable"), subprocess.TimeoutExpired("gh", 30)):
            with patch.object(lane, "sh", side_effect=error):
                self.assertIsNone(lane.reconcile_fix_target(self.target()))

    def test_terminal_evidence_survives_deleted_branch_connections(self):
        for state in ("MERGED", "CLOSED"):
            terminal = {"number": 5, "state": state, "commits": None, "labels": None}
            self.assertEqual(self.read({"data": {"repository": {"pullRequest": terminal}}})["state"], state)

    def test_check_union_preserves_pending_and_legacy_red_policy(self):
        contexts = [
            {"__typename": "CheckRun", "name": "required", "status": "IN_PROGRESS", "conclusion": None},
            {"__typename": "StatusContext", "context": "legacy", "state": "ERROR", "targetUrl": ""},
        ]
        page = repair_target_page(self.target())
        connection = page["data"]["repository"]["pullRequest"]["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"]
        connection["nodes"] = contexts
        live = self.read(page)
        self.assertEqual(live["statusCheckRollup"], contexts)
        self.assertIsNone(lane.red_pr([live], {}), "legacy ERROR does not expand existing CheckRun RED authority")
        contexts[0].pop("conclusion")
        self.assertIsNone(self.read(page), "missing conclusion is not explicit pending/null")

    def test_failed_command_and_non_object_envelopes_refuse_authority(self):
        for code, out in ((1, json.dumps(repair_target_page(self.target()))), (0, "not json"),
                          (0, "[]"), (0, "null"), (0, '{"data":null}')):
            with self.subTest(code=code, out=out), patch.object(lane, "sh", return_value=SimpleNamespace(returncode=code, stdout=out)):
                self.assertIsNone(lane.reconcile_fix_target(self.target()))

    def test_missing_fresh_decisions_never_inherit_stale_repair_reasons(self):
        for key, old in (("mergeStateStatus", "DIRTY"), ("reviewDecision", "CHANGES_REQUESTED")):
            target = {**self.target(), key: old};page = repair_target_page(target)
            page["data"]["repository"]["pullRequest"].pop(key)
            with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(page))):
                self.assertIsNone(lane.reconcile_fix_target(target))

    def test_queue_refusal_is_repair_only_and_precedes_self_push_exception(self):
        for queued in (True, None):
            live = {**self.target(), "isInMergeQueue": queued}
            with patch.object(lane, "reconcile_fix_target", return_value=live):
                self.assertEqual(lane.require_fix_target(self.target(), "before-gate"), live)
                with self.assertRaises(lane.RepairStopped):
                    lane.require_fix_target(self.target(), "before-install", repair=True)
            with patch.object(lane, "reconcile_fix_target", return_value={**live, "headRefOid": "own-push"}), \
                    patch.object(lane, "repair_created_head", return_value=True) as provenance:
                with self.assertRaises(lane.RepairStopped):
                    lane.require_fix_target(self.target(), "agent-running", worktree=Path("repair"), repair=True)
                provenance.assert_not_called()

    def test_queued_initial_target_has_no_execution_claim_checkout_install_or_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            history = {"5": {"sha": "h1", "count": 1, "at": 1}}
            (host.state / "fix-attempts.json").write_text(json.dumps(history))
            with patch.object(lane, "reconcile_fix_target", return_value={**self.target(), "isInMergeQueue": True}), \
                    patch.object(lane.execution_attempt, "claim") as claim, patch.object(lane, "sh") as shell, \
                    patch.object(lane, "install_dependencies") as install, patch.object(lane, "run_agent") as agent:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.target())
                claim.assert_not_called();shell.assert_not_called();install.assert_not_called();agent.assert_not_called()
            self.assertEqual(receipt["reasons"], ["target-pr-queued"])
            self.assertNotIn("execution", receipt)
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text())["5"]["count"], 1)

class LifecycleOwnershipTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.host = lane.Host(state=self.state)
        self.lock = self.state / "lifecycle.lock"

    def exclusive(self):
        handle = self.lock.open("a+")
        try:
            lane.fcntl.flock(handle, lane.fcntl.LOCK_EX | lane.fcntl.LOCK_NB)
        except BaseException:
            handle.close()
            raise
        return handle

    def assert_activation_held(self):
        with self.assertRaises(BlockingIOError):
            self.exclusive()

    def test_exclusive_fence_denies_all_controller_effects(self):
        handle = self.exclusive()
        try:
            for command in (["update"], ["dispatch"], ["worker", "--provider", "codex"],
                            ["gate-command", "--timeout", "1", "--", "true"]):
                with self.subTest(command=command), patch.object(lane, "Host", return_value=self.host), \
                        patch.object(lane, "load_github_env") as identity, \
                        patch.object(lane, "guarded_main") as effects:
                    self.assertEqual(lane.main(command), 75)
                    identity.assert_not_called()
                    effects.assert_not_called()
            with patch.dict(sys.modules, {"lane_runner": lane}), \
                    patch.object(lane, "Host", return_value=self.host), \
                    patch.object(lane.reason_lane, "guarded_main") as reason, \
                    patch.object(lane.yc_corpus, "refresh") as corpus, \
                    patch.object(lane.worktree_sweep, "guarded_main") as sweep:
                self.assertEqual(lane.reason_lane.main(["drain"]), 75)
                self.assertEqual(lane.yc_corpus.main(["refresh", "--state", str(self.state / "yc.json")]), 75)
                self.assertEqual(lane.worktree_sweep.main(["--state", str(self.state)]), 75)
                for effect in (reason, corpus, sweep):
                    effect.assert_not_called()
        finally:
            handle.close()

    def test_controller_guard_precedes_identity_and_work(self):
        for command, target in ((["update"], "update"), (["dispatch"], "dispatch"),
                                (["worker", "--provider", "codex"], "worker")):
            with self.subTest(command=command), patch.object(lane, "Host", return_value=self.host), \
                    patch.object(lane, "load_github_env", side_effect=self.assert_activation_held), \
                    patch.object(lane, target, side_effect=lambda *args: self.assert_activation_held() or 0):
                self.assertEqual(lane.main(command), 0)
            with self.exclusive():
                pass

    def test_forged_closed_and_wrong_inode_descriptors_fail_closed(self):
        other = self.state / "other.lock"
        with other.open("a+") as handle:
            for value in ("not-a-fd", "2", "999999", str(handle.fileno())):
                with self.subTest(value=value), patch.dict(os.environ, {lane.lifecycle.FD_ENV: value}):
                    with self.assertRaises(lane.lifecycle.AdmissionHeld):
                        with lane.lifecycle.Guard(self.state):
                            self.fail("forged descriptor admitted")
            self.assertEqual(os.fstat(handle.fileno()).st_ino, other.stat().st_ino)

    def test_unlocked_canonical_descriptor_does_not_bypass_exclusive_owner(self):
        with self.exclusive(), self.lock.open("r") as handle, \
                patch.dict(os.environ, {lane.lifecycle.FD_ENV: str(handle.fileno())}):
            with self.assertRaises(lane.lifecycle.AdmissionHeld):
                with lane.lifecycle.Guard(self.state):
                    self.fail("exclusive fence bypassed")

    def test_symlink_and_replaced_canonical_lock_fail_closed(self):
        other = self.state / "other.lock"
        other.touch()
        self.lock.symlink_to(other)
        with self.assertRaises(lane.lifecycle.AdmissionHeld):
            with lane.lifecycle.Guard(self.state):
                pass
        self.lock.unlink()
        with lane.lifecycle.Guard(self.state):
            self.lock.unlink()
            self.lock.touch()
            with self.assertRaises(lane.lifecycle.AdmissionHeld):
                lane.lifecycle.spawn_kwargs()

    def child_script(self, gate_fd):
        return ("import os,sys; from pathlib import Path; "
                f"sys.path.insert(0, {str(ROOT / 'scripts/lanes')!r}); import lifecycle; "
                "print('waiting', flush=True); "
                f"os.read({gate_fd},1); "
                f"guard=lifecycle.Guard(Path({str(self.state)!r})); guard.__enter__(); "
                "print('admitted',flush=True); guard.__exit__()")

    def test_delayed_detached_spawn_retains_guard_after_parent_close(self):
        read, write = os.pipe()
        process = None
        try:
            with lane.lifecycle.Guard(self.state):
                process = subprocess.Popen([sys.executable, "-u", "-c", self.child_script(read)],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True,
                    **lane.lifecycle.spawn_kwargs(pass_fds=(read,)))
                self.assertEqual(process.stdout.readline().strip(), "waiting")
            self.assert_activation_held()
            os.write(write, b"1")
            stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, stderr)
            self.assertEqual(stdout.strip(), "admitted")
            with self.exclusive():
                pass
        finally:
            os.close(read); os.close(write)
            if process is not None and process.poll() is None:
                process.kill(); process.communicate(timeout=10)

    def test_actual_exec_retains_guard_before_new_generation_adopts_it(self):
        read, write = os.pipe()
        process = None
        try:
            script = ("import os,sys; from pathlib import Path; "
                      f"sys.path.insert(0,{str(ROOT / 'scripts/lanes')!r}); import lifecycle; "
                      f"guard=lifecycle.Guard(Path({str(self.state)!r})); guard.__enter__(); "
                      "lifecycle.prepare_reexec(); "
                      f"os.set_inheritable({read},True); "
                      f"os.execv(sys.executable,[sys.executable,'-u','-c',{self.child_script(read)!r}])")
            process = subprocess.Popen([sys.executable, "-u", "-c", script], pass_fds=(read,),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                env=lane.selftest_env(self.state))
            self.assertEqual(process.stdout.readline().strip(), "waiting")
            self.assert_activation_held()
            os.write(write, b"1")
            stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, stderr)
            self.assertEqual(stdout.strip(), "admitted")
            with self.exclusive():
                pass
        finally:
            os.close(read); os.close(write)
            if process is not None and process.poll() is None:
                process.kill(); process.communicate(timeout=10)

    def test_owned_detached_controllers_inherit_the_same_guard(self):
        repo = self.state / "repo"
        (repo / ".git").mkdir(parents=True)
        with lane.lifecycle.Guard(self.state) as guard, \
                patch.object(lane.reason_lane, "queued_jobs", return_value=[{}]), \
                patch.object(lane.worktree_sweep.subprocess, "Popen") as sweep, \
                patch.object(lane.worktree_pool, "enabled", return_value=True):
            reason = Mock(); corpus = Mock()
            lane.reason_lane.tick(self.host, lane, Mock(), config={"label": "reasoning-job"}, spawn=reason)
            lane.yc_corpus.tick(self.state, spawn=corpus, now=time.time())
            lane.worktree_sweep.maybe_spawn(self.state, repo, 50, now=time.time())
            sweep_call = sweep.call_args
            lane.worktree_pool.refill_in_background(repo, self.state / "fill.log")
            for call in (reason.call_args, corpus.call_args, sweep_call, sweep.call_args):
                self.assertIn(guard.fd, call.kwargs["pass_fds"])
                self.assertEqual(call.kwargs["env"][lane.lifecycle.FD_ENV], str(guard.fd))
                self.assertEqual(call.kwargs["env"]["LANES_STATE"], str(self.state.resolve()))

    def test_pool_refill_rejects_forged_inheritance_before_git_or_install(self):
        with patch.dict(os.environ, {lane.lifecycle.FD_ENV: "999999", "LANES_STATE": str(self.state)}), \
                patch.object(lane.worktree_pool, "guarded_main") as effects:
            self.assertEqual(lane.worktree_pool.main(["--fill"]), 75)
            effects.assert_not_called()

    def test_standalone_pool_utility_keeps_its_existing_behavior(self):
        with patch.dict(os.environ, {}, clear=False), \
                patch.object(lane.worktree_pool, "guarded_main", return_value=0) as effects:
            os.environ.pop(lane.lifecycle.FD_ENV, None)
            self.assertEqual(lane.worktree_pool.main(["--status"]), 0)
            effects.assert_called_once_with(["--status"])

    def test_gate_child_retains_guard_after_parent_closes(self):
        started = self.state / "gate-started"
        done = self.state / "gate-done"
        command = ("from pathlib import Path; import time; "
                   f"Path({str(started)!r}).touch(); "
                   f"deadline=time.monotonic()+8\nwhile not Path({str(done)!r}).exists():\n"
                   " if time.monotonic()>deadline: raise RuntimeError('test gate not released')\n"
                   " time.sleep(.01)\n")
        results = []
        with (self.state / "gate-owner.lock").open("a+") as owner:
            with lane.lifecycle.Guard(self.state):
                thread = threading.Thread(target=lambda: results.append(
                    lane.sh([sys.executable, "-c", command], timeout=10, pass_fds=(owner.fileno(),))))
                thread.start()
                deadline = time.monotonic() + 8
                while not started.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(started.exists(), "gate command did not start")
            try:
                self.assert_activation_held()
            finally:
                done.touch()
                thread.join(timeout=12)
            self.assertFalse(thread.is_alive())
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].returncode, 0, results[0].stderr)
            with self.exclusive():
                pass

    def test_worker_death_leaves_live_provider_under_helper_guard(self):
        started = self.state / "provider-started"
        done = self.state / "provider-done"
        agent = ("from pathlib import Path; import os,time; "
                 "os.fstat(int(os.environ['LANES_LIFECYCLE_FD'])); "
                 f"Path({str(started)!r}).touch(); "
                 f"deadline=time.monotonic()+10\nwhile not Path({str(done)!r}).exists():\n"
                 " if time.monotonic()>deadline: raise RuntimeError('test provider not released')\n"
                 " time.sleep(.01)\n")
        worker = ("import sys; from pathlib import Path; "
                  f"sys.path.insert(0,{str(ROOT / 'scripts/lanes')!r}); import lane_runner as lane; "
                  f"guard=lane.lifecycle.Guard(Path({str(self.state)!r})); guard.__enter__(); "
                  f"lane.run_agent([sys.executable,'-c',{agent!r}],Path({str(self.state)!r}),sys.stdout,15)")
        process = subprocess.Popen([sys.executable, "-u", "-c", worker],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=lane.selftest_env(self.state))
        try:
            deadline = time.monotonic() + 8
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue(started.exists(), "fake provider did not start")
            process.kill()  # this test-created parent; no real provider/assignment
            process.wait(timeout=5)
            self.assert_activation_held()
            done.touch()
            deadline = time.monotonic() + 10
            while True:
                try:
                    with self.exclusive():
                        break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        self.fail("fake provider helper did not drain")
                    time.sleep(.01)
        finally:
            done.touch()
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)

    def test_owned_command_preserves_stdin_streams_exit_and_child_state(self):
        child_state = self.state / "scratch"
        command = [sys.executable, "-c", "import os,sys; print(sys.stdin.read()); "
                   "print(os.environ['LANES_STATE']); print('diagnostic',file=sys.stderr); sys.exit(124)"]
        with lane.lifecycle.Guard(self.state):
            result = lane.lifecycle.run(command, input="payload", capture_output=True, text=True,
                env={**os.environ, "LANES_STATE": str(child_state)}, timeout=5)
            self.assertEqual(result.args, command)
            self.assertEqual(result.returncode, 124)
            self.assertEqual(result.stdout.splitlines(), ["payload", str(child_state)])
            self.assertEqual(result.stderr, "diagnostic\n")
            with self.assertRaises(subprocess.CalledProcessError) as error:
                lane.lifecycle.run([sys.executable, "-c", "raise SystemExit(7)"],
                                   capture_output=True, text=True, check=True, timeout=5)
            self.assertEqual(error.exception.returncode, 7)
        with self.exclusive():
            pass

    def test_owned_missing_command_releases_without_a_child(self):
        with lane.lifecycle.Guard(self.state):
            started = time.monotonic()
            with self.assertRaises(FileNotFoundError):
                lane.lifecycle.run([str(self.state / "absent-command")],
                                   capture_output=True, text=True, timeout=1)
            self.assertLess(time.monotonic() - started, 5)
        with self.exclusive():
            pass

    def test_owned_timeout_reports_only_after_child_drain(self):
        marker = self.state / "started"
        command = [sys.executable, "-c", "import time; from pathlib import Path; "
                   f"Path({str(marker)!r}).touch(); time.sleep(20)"]
        with lane.lifecycle.Guard(self.state):
            with self.assertRaises(subprocess.TimeoutExpired) as error:
                lane.lifecycle.run(command, capture_output=True, text=True, timeout=.3)
            self.assertEqual(error.exception.cmd, command)
            self.assertTrue(marker.exists())
        with self.exclusive():
            pass

    def test_ordinary_command_helper_survives_controller_death(self):
        started, done = self.state / "started", self.state / "done"
        child = ("import os,time; from pathlib import Path; "
                 f"Path({str(started)!r}).touch(); deadline=time.monotonic()+10\n"
                 f"while not Path({str(done)!r}).exists():\n"
                 " if time.monotonic()>deadline: raise RuntimeError('fixture not released')\n"
                 " time.sleep(.01)\n")
        worker = ("import sys; from pathlib import Path; "
                  f"sys.path.insert(0,{str(ROOT / 'scripts/lanes')!r}); import lane_runner as lane; "
                  f"guard=lane.lifecycle.Guard(Path({str(self.state)!r})); guard.__enter__(); "
                  f"lane.sh([sys.executable,'-c',{child!r}],timeout=15)")
        process = subprocess.Popen([sys.executable, "-u", "-c", worker],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=lane.selftest_env(self.state))
        try:
            deadline = time.monotonic() + 8
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue(started.exists(), "ordinary command fixture did not start")
            process.kill()  # only this fake controller
            process.wait(timeout=5)
            self.assert_activation_held()
            done.touch()
            deadline = time.monotonic() + 10
            while True:
                try:
                    with self.exclusive():
                        break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        self.fail("ordinary command helper did not drain")
                    time.sleep(.01)
        finally:
            done.touch()
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)

    def test_drain_request_blocks_new_controller_before_any_effect(self):
        (self.state / "lifecycle-drain.json").write_text("{malformed")
        for command in (["update"], ["dispatch"], ["worker", "--provider", "codex"],
                        ["gate-command", "--timeout", "1", "--", "true"]):
            with self.subTest(command=command), patch.object(lane, "Host", return_value=self.host), \
                    patch.object(lane, "guarded_main") as effects:
                self.assertEqual(lane.main(command), 75)
                effects.assert_not_called()

    def test_drain_request_allows_admitted_command_to_finish(self):
        with lane.lifecycle.Guard(self.state):
            (self.state / "lifecycle-drain.json").write_text("operator hold")
            result = lane.lifecycle.run([sys.executable, "-c", "print('completed')"],
                                        capture_output=True, text=True, timeout=5)
            self.assertEqual((result.returncode, result.stdout), (0, "completed\n"))
            with patch.object(lane.os, "execv") as execute:
                self.assertEqual(lane.reexec(self.host, "codex"), 0)
                execute.assert_not_called()
        with self.exclusive():
            pass
        self.assertTrue(lane.lifecycle.draining(self.state))

    def test_inherited_non_gate_controllers_cannot_start_during_drain(self):
        commands = [("reason_lane.py", ["drain"]),
                    ("yc_corpus.py", ["refresh", "--state", str(self.state / "yc.json")]),
                    ("worktree_sweep.py", ["--state", str(self.state)]),
                    ("worktree_pool.py", ["--repo", str(self.state), "--fill"])]
        with lane.lifecycle.Guard(self.state):
            (self.state / "lifecycle-drain.json").write_text("hold")
            for script, args in commands:
                with self.subTest(script=script):
                    process = subprocess.run([sys.executable, str(ROOT / "scripts/lanes" / script), *args],
                        capture_output=True, text=True, timeout=5, **lane.lifecycle.spawn_kwargs())
                    self.assertEqual(process.returncode, 75, process.stderr)
        self.assertFalse((self.state / "yc.json").exists())
        self.assertFalse((self.state / "worktree-sweep.json").exists())

    def test_broken_symlink_drain_request_remains_held(self):
        (self.state / "lifecycle-drain.json").symlink_to(self.state / "absent")
        self.assertTrue(lane.lifecycle.draining(self.state))
        with self.assertRaises(lane.lifecycle.AdmissionHeld):
            with lane.lifecycle.Guard(self.state):
                self.fail("broken hold resumed admission")

    def test_dispatch_worker_spawn_retains_controller_guard(self):
        with lane.lifecycle.Guard(self.state) as guard, \
                patch.object(lane, "load_providers", return_value={"codex": {"slots": 1}}), \
                patch.object(self.host, "slots", return_value=1), \
                patch.object(lane.disk_guard, "check", return_value={"admitted": True}), \
                patch.object(lane.autoscale, "mode", return_value="off"), \
                patch.object(lane.worktree_sweep, "maybe_spawn"), \
                patch.object(lane, "ensure_full_history"), \
                patch.object(lane, "claim_remediation_events"), \
                patch.object(lane, "provider_healthy", return_value=True), \
                patch.object(lane.pr_events, "tick"), \
                patch.object(lane.reason_lane, "tick"), \
                patch.object(lane.yc_corpus, "tick"), \
                patch.object(lane, "finish_dispatch", return_value=0), \
                patch.object(lane.subprocess, "Popen") as spawn:
            self.assertEqual(lane.dispatch(self.host), 0)
            spawn.assert_called_once()
            self.assertIn(guard.fd, spawn.call_args.kwargs["pass_fds"])
            self.assertEqual(spawn.call_args.kwargs["env"][lane.lifecycle.FD_ENV], str(guard.fd))


if __name__ == "__main__":
    unittest.main()



class EscalationQueueAuthorityTest(unittest.TestCase):
    def run_case(self, fault, *, human_hold=False, top=False):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            pr = {"number": 7, "headRefOid": "head-A", "headRefName": "codex/jov-7648-20261003",
                  "state": "OPEN", "isDraft": False, "isCrossRepository": False, "isInMergeQueue": False,
                  "mergeStateStatus": "DIRTY", "labels": [], "statusCheckRollup": []}
            if human_hold:
                pr.update(labels=[{"name": "hold"}], holdNote={"author": "itstimwhite",
                          "body": "use computeRatePercent from @/lib/analytics/metrics and remove hold"})
            live = json.loads(json.dumps(pr))
            record = {"sha": "head-A", "pushedHead": "head-A", "count": lane.MAX_FIX_ATTEMPTS,
                      "lane": "devin", "at": 1, "endedAt": 2, "reentry": {"keep": True},
                      "priorEscalations": [{"rung": "retained"}], "escalations": [],
                      "pendingEscalation": {"lane": "codex", "head": "head-A", "dossier": "existing authority",
                                            "cls": "fixable-by-model" if human_hold else "needs-rebase",
                                            "subtype": "human-hold" if human_hold else "semantic", "topRung": top}}
            if fault == "pending-head": record["pendingEscalation"]["head"] = "head-B"
            if fault == "malformed-dossier": record["pendingEscalation"]["dossier"] = {"invalid": True}
            if fault == "empty-dossier": record["pendingEscalation"]["dossier"] = "  "
            malformed_history = {"rungs-string": ("escalations", "bad"), "rungs-object": ("escalations", {"old": {"kind": "model"}}),
                                 "rungs-mixed": ("escalations", [{"kind": "model"}, "bad"]),
                                 "prior-string": ("priorEscalations", "bad"), "count-string": ("count", "bad"),
                                 "count-bool": ("count", True), "count-negative": ("count", -1)}
            if fault in malformed_history:
                field, value = malformed_history[fault]; record[field] = value
            if fault == "cached-queued": pr["isInMergeQueue"] = True
            if fault == "cached-unknown": pr.pop("isInMergeQueue")
            if fault == "active-recorded-head":
                record.update(sha="old-local-head", at=1000); record.pop("endedAt")
            path = host.state / "fix-attempts.json"
            path.write_text(json.dumps({"7": record, "9": {"count": 1}}))
            held = host.state / "held.json"
            held.write_text("{}")
            held_faults = {"legacy-secret": ["secret-like-file-changed:file"], "empty-diff": ["empty-diff"],
                           "exhausted-secret": ["fix-exhausted", "secret-like-file-changed:file"],
                           "exhausted-size": ["fix-exhausted", "diff-too-large:100"],
                           "legacy-lockfile": ["lockfile-without-manifest"], "only-exhausted": ["fix-exhausted"]}
            if fault in held_faults:
                held.write_text(json.dumps({"7": {"sha": "head-A", "evidence": held_faults[fault]}}))
            if fault == "declared-empty-diff":
                held.write_text(json.dumps({"7": {"sha": "head-A", "reason": "empty-diff"}}))
            summary = host.state / "escalation.json"
            summary.write_text(json.dumps({"events": {"existing": {"status": "claimed"}}, "attempts": []}))
            bad_summaries = {"summary-corrupt": "[", "summary-list": "[]", "summary-null": "null",
                             "summary-attempts-null": '{"attempts":null}', "summary-attempts-string": '{"attempts":"bad"}'}
            order = []
            expected = json.loads(path.read_text())
            summary_expected = json.loads(summary.read_text())

            def mutate():
                if fault in {"attempt-race", "pending-race", "unrelated-race", "late-CAS-race"}:
                    current = json.loads(path.read_text())
                    if fault == "pending-race": current["7"]["pendingEscalation"]["dossier"] = "new prescription"
                    elif fault == "unrelated-race": current["10"] = {"count": 2, "keep": True}
                    else: current["7"]["escalations"].append({"rung": "concurrent"})
                    path.write_text(json.dumps(current)); expected.clear(); expected.update(current)
                if fault in {"new-held", "changed-held-prescription"}:
                    held.write_text(json.dumps({"7": lane.pr_events.held_record("head-A", ["diff-too-large:100"])}))
                if fault == "corrupt-held": held.write_text("[")
                if fault == "malformed-held": held.write_text("[]")
                if fault == "revoked": lane.revoke_publication(host, branch=pr["headRefName"], reason="new-revocation")
                if fault == "summary-race":
                    current = json.loads(summary.read_text()); current["events"]["concurrent"] = {"keep": True}
                    current["attempts"].append({"pr": 99})
                    summary.write_text(json.dumps(current)); summary_expected.clear(); summary_expected.update(current)
                if fault in bad_summaries: summary.write_text(bad_summaries[fault])

            def owner(*args, **kwargs):
                self.assertEqual(kwargs, {"timeout": 30}); order.append("owner")
                return fault == "owner"

            def target(_):
                order.append("target")
                if fault == "unreadable": return None
                if fault == "queued": live["isInMergeQueue"] = True
                if fault == "unknown": live["isInMergeQueue"] = None
                if fault == "missing-queue": live.pop("isInMergeQueue")
                if fault == "head": live["headRefOid"] = "head-B"
                if fault == "branch": live["headRefName"] = "foreign/branch"
                if fault == "fork": live["isCrossRepository"] = True
                if fault == "closed": live["state"] = "CLOSED"
                if fault == "merged": live["state"] = "MERGED"
                if fault == "new-hold": live["labels"].append({"name": "tim-hold"})
                if fault == "human-decision": live["labels"].append({"name": "needs-human"})
                if fault == "changed-note": live["holdNote"] = {"body": "new human decision"}
                if fault == "foreign-draft": live["isDraft"] = True
                if fault in {"ready-green", "ready-pending"}:
                    live.update(mergeStateStatus="CLEAN", statusCheckRollup=[{
                        "name": "ci", "status": "COMPLETED" if fault == "ready-green" else "IN_PROGRESS",
                        "conclusion": "SUCCESS" if fault == "ready-green" else None}])
                if fault == "changed-class":
                    live.update(mergeStateStatus="CLEAN", statusCheckRollup=[{
                        "name": "ci", "status": "COMPLETED", "conclusion": "FAILURE"}])
                if fault == "changed-subtype": live["conflictFiles"] = ["pnpm-lock.yaml"]
                if fault != "late-CAS-race": mutate()
                return live

            if fault == "foreign-draft":
                pr["headRefName"] = live["headRefName"] = "devin/jov-7648-20261003"
            original_update = lane.update_json
            original_replace = lane.os.replace

            def replace(src, dst):
                if Path(dst) == summary and fault == "summary-write-fails": raise OSError("fixture summary I/O failure")
                return original_replace(src, dst)

            def update(file, change):
                if file == path and fault == "late-CAS-race": mutate()
                return original_update(file, change)

            with patch.object(lane, "claimed_elsewhere", side_effect=owner), \
                 patch.object(lane, "reconcile_fix_target", side_effect=target), \
                 patch.object(lane, "post_claim") as posted, patch.object(lane, "sh", side_effect=AssertionError("no external command")), \
                 patch.object(lane, "load_providers", return_value={"codex": {"enabled": True}, "devin": {"enabled": True}}), \
                 patch.object(lane, "update_json", side_effect=update), patch.object(lane.os, "replace", side_effect=replace), \
                 patch.object(lane.time, "time", return_value=1000):
                if fault == "summary-write-fails":
                    with self.assertRaisesRegex(OSError, "summary I/O failure"):
                        lane.claim_escalation_pr(host, "codex", [pr])
                    selected = None
                else: selected = lane.claim_escalation_pr(host, "codex", [pr])
            charged = fault in {"none", "cached-unknown", "unrelated-race", "summary-race", "only-exhausted"}
            after = json.loads(path.read_text())
            self.assertEqual(bool(selected), charged, fault)
            if charged:
                updated = after.pop("7"); before = expected.pop("7")
                self.assertEqual(after, expected)
                for key, value in before.items():
                    if key not in {"pendingEscalation", "escalations"}: self.assertEqual(updated[key], value, key)
                self.assertNotIn("pendingEscalation", updated)
                self.assertEqual(len(updated["escalations"]), 1)
                self.assertEqual(updated["escalations"][0]["topRung"], top)
                self.assertEqual(selected["liftHold"], human_hold)
                self.assertEqual(selected["dossier"], "existing authority")
                posted.assert_called_once_with(7, "head-A", "fix")
                summary_expected["attempts"].append({"pr": 7, "at": 1000, "lane": "codex"})
            elif fault == "summary-write-fails":
                self.assertEqual(after["7"]["count"], record["count"])
                self.assertEqual(len(after["7"]["escalations"]), 1)
                self.assertNotIn("pendingEscalation", after["7"])
                posted.assert_not_called()
            else:
                self.assertEqual(after, expected); posted.assert_not_called()
            if fault in bad_summaries: self.assertEqual(summary.read_text(), bad_summaries[fault])
            else: self.assertEqual(json.loads(summary.read_text()), summary_expected)
            self.assertEqual(order, [] if fault in {"pending-head", "cached-queued", "malformed-dossier", "empty-dossier", *malformed_history} else
                             ["owner"] if fault == "owner" else ["owner", "target"])

    def test_refused_targets_retain_pending_history_and_claims(self):
        for fault in ("pending-head", "cached-queued", "owner", "queued", "unknown", "missing-queue", "unreadable",
                      "head", "branch", "fork", "closed", "merged", "new-hold", "human-decision", "foreign-draft",
                      "active-recorded-head", "attempt-race", "pending-race", "late-CAS-race", "new-held",
                      "corrupt-held", "malformed-held", "revoked", "legacy-secret", "empty-diff", "exhausted-secret",
                      "exhausted-size", "legacy-lockfile", "declared-empty-diff", "ready-green", "ready-pending",
                      "summary-corrupt", "summary-list", "summary-null", "summary-attempts-null", "summary-attempts-string",
                      "summary-write-fails", "changed-class", "changed-subtype", "malformed-dossier", "empty-dossier",
                      "rungs-string", "rungs-object", "rungs-mixed", "prior-string", "count-string", "count-bool", "count-negative"):
            with self.subTest(fault=fault): self.run_case(fault)

    def test_separate_rung_budget_and_concurrent_unrelated_history_survive(self):
        for fault in ("none", "cached-unknown", "unrelated-race", "summary-race", "only-exhausted"):
            with self.subTest(fault=fault): self.run_case(fault, top=True)

    def test_prescribed_human_hold_does_not_authorize_new_preservation(self):
        for fault in ("none", "new-hold", "changed-note", "changed-held-prescription", "human-decision"):
            with self.subTest(fault=fault): self.run_case(fault, human_hold=True)


class OnePrPerIssueTest(unittest.TestCase):
    """JOV-6833: one open PR per Linear key; slots count open non-green PRs."""
    NOW = 1_800_000_000

    def pr(self, number, issue="jov-7", draft=True, state="BLOCKED", pushed_ago=0, lane_name="devin"):
        return {"number": number, "headRefName": f"{lane_name}/{issue}-20260927t0{number:05d}", "isDraft": draft,
                "isInMergeQueue": False, "isCrossRepository": False,
                "mergeStateStatus": state, "url": f"u{number}", "pushedAgo": pushed_ago, "headRefOid": f"h{number}", "labels": []}

    def test_in_flight_reads_branches_and_markers_and_fails_closed(self):
        saved = lane.sh
        try:
            lane.sh = lambda args, **k: SimpleNamespace(returncode=0, stderr="", stdout=json.dumps([
                {"headRefName": "devin/jov-12-20260927t101010", "body": ""},
                {"headRefName": "feat/anything", "body": "<!-- linear-issue-id:JOV-34 -->"},
                {"headRefName": "fix/x", "body": "mentions JOV-56 only"}]))
            self.assertEqual(lane.in_flight_issues(), frozenset({"JOV-12", "JOV-34"}))
            lane.sh = lambda args, **k: SimpleNamespace(returncode=1, stdout="", stderr="rate limited")
            self.assertIsNone(lane.in_flight_issues())
        finally:
            lane.sh = saved

    def test_budget_counts_only_own_non_green_prs(self):
        prs = [self.pr(1), self.pr(2, draft=False, state="CLEAN"), self.pr(3, lane_name="codex")]
        self.assertFalse(lane.over_budget("devin", prs, slots=1))
        self.assertTrue(lane.over_budget("devin", prs + [self.pr(4, issue="jov-8")], slots=1))

    def test_sweep_supersedes_duplicates_and_closes_stale_red_drafts(self):
        day = lane.STALE_DRAFT_S
        prs = [{**self.pr(1), "labels": [{"name": "duplicate"}]}, self.pr(2, draft=False, state="CLEAN"),          # jov-7: keep the green one
               {**self.pr(3, issue="jov-8", pushed_ago=day + 1), "labels": [{"name": "duplicate"}]},                # stale red draft
               self.pr(4, issue="jov-9", pushed_ago=day - 60),               # recent: keep
               self.pr(5, issue="jov-10", draft=False, pushed_ago=day * 3)]  # ready PRs are not stale
        prs.append(self.pr(6, issue="jov-11", pushed_ago=day * 3))
        pushes = {pr["number"]: self.NOW - pr.pop("pushedAgo") for pr in prs}
        superseded, stale = lane.sweep_plan(prs, self.NOW, pushes)
        self.assertEqual([(pr["number"], keep) for pr, keep in superseded], [(1, 2)])
        self.assertEqual([pr["number"] for pr in stale], [3])

    def test_sweep_closes_moves_only_owned_issues_and_is_throttled(self):
        saved = (lane.sh, lane.lane_prs)
        calls = []
        stale_at = datetime.fromtimestamp(self.NOW - lane.STALE_DRAFT_S * 2, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        def fake_sh(args, **k):
            calls.append(args)
            out = ""
            if args[:3] == ["gh", "api", "graphql"]:
                if any("pullRequest(number:" in str(arg) for arg in args):
                    number = int(next(arg.split("=", 1)[1] for arg in args if str(arg).startswith("number=")))
                    live = {**self.pr(number, issue={3: "jov-8", 4: "jov-9"}.get(number, "jov-7")),
                            "headRefOid": "h", "state": "OPEN", "isCrossRepository": False,
                            "isInMergeQueue": False,
                            "labels": {"nodes": [{"name": "duplicate"}], "pageInfo": {"hasNextPage": False}}}
                    out = json.dumps({"data": {"repository": {"pullRequest": live}}})
                else:
                    out = f"3 {stale_at}\n4 {stale_at}\n1 {stale_at}"
            return SimpleNamespace(returncode=0, stdout=out, stderr="")
        lane.sh = fake_sh
        lane.lane_prs = lambda name, fields="": [{**pr, "headRefOid": "h", "labels": [{"name": "duplicate"}]} for pr in [self.pr(1), self.pr(2),
                                                   self.pr(3, issue="jov-8", pushed_ago=lane.STALE_DRAFT_S * 2),
                                                   self.pr(4, issue="jov-9", pushed_ago=lane.STALE_DRAFT_S * 2)]]
        linear = FakeLinear([])
        linear.states = {"JOV-8": "In Progress", "JOV-9": "Done"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp), repo=Path(tmp), linear_env=Path("unused"))
                lane.sweep_lane_prs(host, "devin", linear, now=self.NOW)
                lane.sweep_lane_prs(host, "devin", linear, now=self.NOW + 60)  # throttled: no-op
        finally:
            lane.sh, lane.lane_prs = saved
        closed = [args[3] for args in calls if args[:3] == ["gh", "pr", "close"]]
        self.assertEqual(closed, ["1", "3", "4"])
        self.assertIn("superseded by #2", next(a for a in calls if a[:3] == ["gh", "pr", "close"])[-1])
        self.assertEqual(linear.moves, [("JOV-8", "Todo")])


    def test_sweep_preserves_terminal_holds_and_active_repairs_before_any_close(self):
        targets = [self.pr(1), self.pr(2, draft=False, state="CLEAN"),
                   self.pr(3, issue="jov-8"), self.pr(4, issue="jov-9"),
                   self.pr(5, issue="jov-10"), self.pr(6, issue="jov-11")]
        targets[2]["labels"] = [{"name": "lane-fix-exhausted"}]
        targets[3]["labels"] = [{"name": "Tim:Hold"}]
        attempts = {"1": {"sha": "h1", "count": 2},
                    "5": {"sha": "h5", "count": 1, "at": self.NOW - 1}}
        calls = []
        def shell(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0,stdout="",stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            host=lane.Host(state=Path(tmp))
            (host.state/"fix-attempts.json").write_text(json.dumps(attempts))
            with patch.dict(sys.modules, {"lane_runner": SimpleNamespace()}), \
                 patch.object(lane,"sh",side_effect=shell), patch.object(lane,"lane_prs",return_value=targets), \
                 patch.object(lane,"last_pushes",return_value={p["number"]:self.NOW-lane.STALE_DRAFT_S-1 for p in targets}), \
                 patch.object(lane,"claimed_elsewhere",side_effect=lambda n,*args:n==6):
                lane.sweep_lane_prs(host,"devin",FakeLinear([]),now=self.NOW)
            self.assertEqual(json.loads((host.state/"fix-attempts.json").read_text()),attempts)
        self.assertFalse(any(c[:3]==["gh","pr","close"] for c in calls))

    def test_red_selector_blocks_exhaustion_without_history_and_missing_head(self):
        target={**self.pr(1),"mergeStateStatus":"DIRTY","labels":[{"name":"lane-fix-exhausted"}]}
        self.assertIsNone(lane.red_pr([target],{}))
        self.assertIsNone(lane.red_pr([{**target,"labels":[],"headRefOid":""}],{}))
        history={"1":{"sha":"external-before","count":2,"endedAt":1}}
        self.assertEqual(lane.red_pr([target],history),target,"a proven external dirty head still enters the existing claim path")


    def test_red_claim_writes_linked_receipt_before_consuming_exhaustion(self):
        target={**self.pr(1),"mergeStateStatus":"DIRTY","labels":[{"name":"lane-fix-exhausted"}]}
        with tempfile.TemporaryDirectory() as tmp:
            host=lane.Host(state=Path(tmp));path=host.state/"fix-attempts.json"
            path.write_text(json.dumps({"1":{"sha":"h0","count":2,"endedAt":1}}))
            calls=[]
            def shell(args,**kwargs):
                calls.append(args)
                if args[-1].endswith("/lane-fix-exhausted"):
                    receipt=json.loads(path.read_text())["1"]
                    self.assertEqual(receipt["count"],1)
                    self.assertEqual(receipt["reentry"]["fromGeneration"]["head"],"h0")
                    self.assertEqual(receipt["reentry"]["toGeneration"]["head"],"h1")
                return SimpleNamespace(returncode=0,stdout="",stderr="")
            with patch.dict(sys.modules, {"lane_runner": SimpleNamespace()}), \
                 patch.object(lane,"sh",side_effect=shell), patch.object(lane,"load_providers",return_value={"devin":{"slots":4}}), \
                 patch.object(lane,"claimed_elsewhere",return_value=False), patch.object(lane,"post_claim"), \
                 patch.object(lane,"reconcile_fix_target",side_effect=lambda pr:{**pr,"state":"OPEN"}):
                self.assertEqual(lane.claim_red_pr(host,"devin",[target])["number"],1)
            self.assertTrue(any(c[-1].endswith("/lane-fix-exhausted") for c in calls))


    def test_red_claim_rejects_stale_head_or_unreadable_reentry_without_spending(self):
        target={**self.pr(1),"headRefOid":"cached-h1","mergeStateStatus":"DIRTY", "labels":[{"name":"lane-fix-exhausted"}]}
        history={"1":{"sha":"current-h2","count":2,"endedAt":1}}
        for observed in [None,{**target,"headRefOid":"current-h2","state":"OPEN"},
                         {**target,"state":"OPEN","labels":[{"name":"hold"}]}]:
            with self.subTest(observed=observed), tempfile.TemporaryDirectory() as tmp:
                host=lane.Host(state=Path(tmp));path=host.state/"fix-attempts.json";path.write_text(json.dumps(history))
                with patch.object(lane,"load_providers",return_value={"devin":{"slots":4}}), \
                     patch.object(lane,"claimed_elsewhere",return_value=False), patch.object(lane,"reconcile_fix_target",return_value=observed), \
                     patch.object(lane,"sh") as writes,patch.object(lane,"post_claim") as claims:
                    self.assertIsNone(lane.claim_red_pr(host,"devin",[target]))
                self.assertEqual(json.loads(path.read_text()),history)
                writes.assert_not_called();claims.assert_not_called()

    def test_red_claim_rechecks_fresh_clean_state_before_spending(self):
        target = {**self.pr(1), "mergeStateStatus": "DIRTY", "labels": [{"name": "lane-fix-exhausted"}]}
        history = {"1": {"sha": "h0", "count": 2, "endedAt": 1}}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            path = host.state / "fix-attempts.json"
            path.write_text(json.dumps(history))
            live = {**target, "state": "OPEN", "mergeStateStatus": "CLEAN", "statusCheckRollup": []}
            with patch.object(lane, "load_providers", return_value={"devin": {"slots": 4}}), \
                 patch.object(lane, "claimed_elsewhere", return_value=False), \
                 patch.object(lane, "reconcile_fix_target", return_value=live), \
                 patch.object(lane, "sh") as writes, patch.object(lane, "post_claim") as claims:
                self.assertIsNone(lane.claim_red_pr(host, "devin", [target]))
            self.assertEqual(json.loads(path.read_text()), history)
            writes.assert_not_called()
            claims.assert_not_called()


class LockfileConflictTest(unittest.TestCase):
    """JOV-6837/JOV-7594: a generated-file-only conflict is resolved without a model; anything else is not."""

    def test_rechecks_target_immediately_before_runner_owned_install_and_push(self):
        for conflict in (True, False):
            calls = []
            def shell(args, **kwargs):
                calls.append(args)
                return SimpleNamespace(returncode=1 if args[:2] == ["git", "merge"] and conflict else 0,
                                       stdout="pnpm-lock.yaml\n" if args[:2] == ["git", "diff"] else "", stderr="")
            guard = Mock(side_effect=[None, lane.RepairStopped("target-pr-merged", {"state": "MERGED"}, "command")])
            with self.subTest(conflict=conflict), patch.object(lane, "sh", side_effect=shell):
                with self.assertRaises(lane.RepairStopped):
                    lane.resolve_generated_conflict(Path("/not-used"), "branch", None, guard=guard)
            self.assertFalse(any(cmd[:2] == ["pnpm", "install"] or cmd[:2] == ["git", "push"] for cmd in calls))

    def git(self, *args, cwd):
        return subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=cwd,
                              check=True, capture_output=True, text=True).stdout.strip()

    def repo(self, tmp: Path, pr_changes: dict, main_changes: dict | None = None):
        origin, work = tmp / "origin.git", tmp / "work"
        self.git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
        self.git("clone", "-q", str(origin), str(work), cwd=tmp)
        for name, text in {"package.json": "{}\n", "pnpm-lock.yaml": "base\n", "a.ts": "a\n"}.items():
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "base", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "-b", "devin/jov-1-20260927", cwd=work)
        for name, text in pr_changes.items():
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "pr", cwd=work)
        self.git("push", "-q", "origin", "HEAD:devin/jov-1-20260927", cwd=work)
        self.git("checkout", "-q", "main", cwd=work)
        for name, text in (main_changes or {"pnpm-lock.yaml": "main\n", "a.ts": "main\n"}).items():
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "main moves", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "devin/jov-1-20260927", cwd=work)
        self.git("fetch", "-q", "origin", cwd=work)
        return origin, work

    def run_resolve(self, work: Path):
        real, calls = lane.sh, []

        def sh(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            calls.append(args)
            if args[:2] == ["pnpm", "install"]:
                (Path(cwd) / "pnpm-lock.yaml").write_text("regenerated\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if args == ["pnpm", "ci:topology:write"]:
                target = Path(cwd) / ".github/workflow-topology.gen.yml"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("regenerated\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return real(args, cwd=cwd, timeout=timeout, env=env)
        lane.sh = sh
        try:
            with open(os.devnull, "w") as log:
                env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
                saved = dict(os.environ)
                os.environ.update(env)
                try:
                    return lane.resolve_generated_conflict(work, "devin/jov-1-20260927", log), calls
                finally:
                    os.environ.clear()
                    os.environ.update(saved)
        finally:
            lane.sh = real

    def test_lockfile_only_conflict_is_regenerated_and_pushed(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            pushed = self.git("show", "devin/jov-1-20260927:pnpm-lock.yaml", cwd=origin)
            self.assertEqual(pushed, "regenerated")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_generated_topology_conflict_is_regenerated_and_pushed(self):
        """JOV-7594: a generated-file conflict regenerates instead of hand-merging."""
        path = ".github/workflow-topology.gen.yml"
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {path: "pr\n"},
                                     main_changes={path: "main\n", "a.ts": "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertIn(["pnpm", "ci:topology:write"], calls)
            self.assertNotIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            self.assertEqual(self.git("show", f"devin/jov-1-20260927:{path}", cwd=origin), "regenerated")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_mixed_generated_conflicts_run_each_resolver_once(self):
        topology = ".github/workflow-topology.gen.yml"
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n", topology: "pr\n"},
                                     main_changes={"pnpm-lock.yaml": "main\n", topology: "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertEqual(calls.count(["pnpm", "install", "--lockfile-only", "--ignore-scripts"]), 1)
            self.assertEqual(calls.count(["pnpm", "ci:topology:write"]), 1)

    def test_a_source_conflict_is_left_to_the_agent_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n", "a.ts": "pr\n"})
            before = self.git("rev-parse", "devin/jov-1-20260927", cwd=origin)
            ok, calls = self.run_resolve(work)
            self.assertFalse(ok)
            self.assertNotIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            self.assertFalse((work / ".git" / "MERGE_HEAD").exists(), "merge aborted")
            self.assertEqual(self.git("rev-parse", "devin/jov-1-20260927", cwd=origin), before)


class GateOutcomeTest(unittest.TestCase):
    real_adopt = lane.adopt_pr

    @staticmethod
    def produce(adopt, host, name, pr, *, sensitive=False, verdict="verified-not-queued"):
        # Execute the real producer and its ledger append; mock only expensive/external edges.
        outcome = {"verdict": verdict, "pr": pr["number"], "prUrl": pr.get("url"),
                   "headSha": pr["headRefOid"], "changedFiles": 2, "gateWaitS": 4, "reasons": []}
        with patch.object(lane, "require_disk"), patch.object(lane, "reconcile_fix_target", return_value={**pr, "state": "OPEN", "labels": [], "isCrossRepository": False}), patch.object(lane, "sh"), patch.object(lane, "add_worktree"), patch.object(lane, "install_dependencies"), patch.object(lane, "remove_worktree"), patch.object(lane, "gate_pr", return_value=outcome):
            return adopt(host, name, pr, sensitive=sensitive)

    def test_real_adoption_envelope_preserves_enclosing_identity_and_links_distinct_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            pr = {"number": 7, "headRefOid": "a" * 40, "headRefName": "devin/jov-7", "url": "https://github.com/JovieInc/Jovie/pull/7"}
            adopted = self.produce(lane.adopt_pr, host, "devin", pr)
            execution = {"fencingToken": "source-fence"}; qualification = {"fencingToken": "gate-fence"}
            adopted.update(execution=execution, qualificationExecution=qualification, sourceFencingToken="source-fence", remoteThreadId="thread-1", gateSensitive=False, revocation={"reason": "fixture"}, dependencies=["fixture"], next_action="retry")
            identity = {"runId": "issue-run", "kind": "issue", "provider": "source", "startedAt": "source-start", "branch": "source-branch", "worktree": "source-tree", "issue": "JOV-7", "attribution": {"category": "autonomous-created"}}
            outer = {**identity, **lane.gate_outcome(adopted)}
            for key, value in identity.items(): self.assertEqual(outer[key], value)
            self.assertEqual(outer["adoptRunId"], adopted["runId"])
            for key in ("verdict", "pr", "prUrl", "headSha", "changedFiles", "gateWaitS", "reasons", "execution", "qualificationExecution", "sourceFencingToken", "remoteThreadId", "gateSensitive", "revocation", "dependencies", "next_action"):
                self.assertEqual(outer[key], adopted[key])
            self.assertNotIn("result", outer); self.assertNotIn("endedAt", outer)
            first = lane.qualification_receipt("source", issue("JOV-7"), adopted)
            second = lane.qualification_receipt("source", issue("JOV-7"), adopted)
            self.assertEqual(first["kind"], "qualification"); self.assertEqual(first["adoptRunId"], adopted["runId"])
            self.assertEqual(len({first["runId"], second["runId"], adopted["runId"]}), 3)
            self.assertEqual(json.loads((host.state / "runs/ledger.jsonl").read_text())["runId"], adopted["runId"])


class DeferredRequeueTest(unittest.TestCase):
    def test_mixed_deferred_scan_never_publishes_or_refreshes_under_claim_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            path = host.state / "requeue.json"
            rows = {"5": "head-A", "6": "head-A", "9": "unknown"}
            path.write_text(json.dumps(rows))
            prs = [{"number": n, "headRefOid": "head-A", "state": "OPEN"} for n in (5, 6)]
            with patch.object(lane, "publish_verified") as publish, \
                    patch.object(lane, "reconcile_fix_target") as refresh:
                claim = lane.Locked(host.state / "claim.lock", blocking=True)
                try:
                    self.assertEqual(lane.requeue_verified(host, prs, defer=lambda pr: pr["number"] == 6), prs[1])
                    self.assertIsNone(lane.requeue_verified(host, prs, defer=lambda pr: False))
                finally:
                    claim.release()
                publish.assert_not_called(); refresh.assert_not_called()
            self.assertEqual(json.loads(path.read_text()), rows)

    def test_unrecognized_branch_retains_the_exact_retry_without_crashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            pr = {"number": 5, "headRefOid": "head-A", "headRefName": "feature/manual"}
            slot = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
            with patch.object(lane, "run_deferred_requeue", return_value=None):
                self.assertIsNone(lane.finish_deferred_retry(host, "devin", pr, Mock(), lambda pr: {"active": True}, slot=slot))
            self.assertTrue(slot.handle.closed)
            self.assertEqual(json.loads((host.state / "worker-idle.json").read_text())["devin"]["deferredRequeue"]["5"]["pr"], pr)

    def test_legacy_deferred_markers_without_terminal_are_transient(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            path = host.state / "worker-idle.json"
            path.write_text(json.dumps({"devin": {"deferredRequeue": {"5": {"pr": {"headRefOid": "a"}}}}}))
            lane.record_idle_exit(host, "devin", "ordinary-scan")
            self.assertNotIn("deferredRequeue", json.loads(path.read_text())["devin"])
            path.write_text(json.dumps({"devin": {"deferredRequeue": {"5": {"pr": {"headRefOid": "a"}}}}}))
            lane.yield_deferred_requeues(host, "devin")
            self.assertEqual(json.loads(path.read_text())["devin"]["deferredRequeue"], {})

    @staticmethod
    def concurrent_update(test, host, values):
        claim = lane.Locked(host.state / "claim.lock", blocking=False)
        try:
            test.assertTrue(claim.held, "qualification must permit other workers to claim")
            lane.update_json(host.state / "requeue.json", lambda rows: rows.update(values))
        finally: claim.release()


    def test_deferred_dispositions_yield_transient_holds_and_retain_exact_terminal_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); queue = host.state / "requeue.json"
            prs = [{"number": n, "headRefOid": "head-A", "headRefName": f"devin/jov-{n}"} for n in (5, 6)]
            queue.write_text(json.dumps({"5": "head-A", "6": "head-A"}))
            context = {"active": True, "digest": "generation-A"}
            for pr, terminal in zip(prs, (False, True)):
                lane.record_idle_exit(host, "devin", "fixture", deferred={"pr": pr, "issue": f"JOV-{pr['number']}", "context": context, "terminal": terminal})
            inactive = lambda pr: {"active": False, "digest": "generation-A"} if pr["number"] == 6 else context
            self.assertEqual(set(lane.deferred_requeue_blocks(host, "devin", inactive)), {"5", "6"})
            self.assertEqual(set(lane.deferred_requeue_blocks(host, "devin", lambda pr: context)), {"5"})
            self.assertEqual(set(lane.deferred_requeue_blocks(host, "devin", lambda pr: {"active": True, "digest": "generation-B"})), set())
            lock = lane.Locked(host.state / "claim.lock", blocking=True)
            try: lane.yield_deferred_requeues(host, "devin")
            finally: lock.release()
            self.assertEqual(set(lane.deferred_requeue_blocks(host, "devin", inactive)), {"6"})
            queue.write_text(json.dumps({"6": "head-B"}))
            self.assertFalse(lane.deferred_requeue_blocks(host, "devin", inactive))
            self.assertEqual(json.loads((host.state / "worker-idle.json").read_text())["devin"]["deferredRequeue"]["6"]["pr"]["headRefOid"], "head-A")

    def test_deferred_held_errors_and_operator_stop_release_the_slot_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); pr = {"number": 5, "state": "OPEN", "headRefOid": "head-A", "headRefName": "devin/jov-5-20260930t123000"}
            (host.state / "requeue.json").write_text(json.dumps({"5": "head-A"}))
            for result in (None, {"verdict": "remote-held"}, RuntimeError("fixture"), KeyboardInterrupt(), lane.subprocess.TimeoutExpired("gh", 600), lane.subprocess.CalledProcessError(1, "gh")):
                with self.subTest(result=type(result).__name__), patch.object(lane, "reconcile_fix_target", return_value=pr), patch.object(lane, "sh") as command:
                    slot = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
                    with patch.object(slot, "release", wraps=slot.release) as release:
                        retry = Mock(side_effect=result) if isinstance(result, BaseException) else Mock(return_value=(issue("JOV-5"), result))
                        if isinstance(result, KeyboardInterrupt):
                            with self.assertRaises(KeyboardInterrupt): lane.finish_deferred_retry(host, "devin", pr, retry, lambda pr: {"active": True}, slot=slot)
                        else:
                            self.assertIsNone(lane.finish_deferred_retry(host, "devin", pr, retry, lambda pr: {"active": True}, slot=slot))
                            self.assertEqual(json.loads((host.state / "worker-idle.json").read_text())["devin"]["reason"], "deferred-held")
                        release.assert_called_once()
                    command.assert_not_called(); self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {"5": "head-A"})
                    contender = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
                    try: self.assertTrue(contender.held)
                    finally: contender.release()

    def test_selects_one_exact_target_and_removes_only_unchanged_landed_head(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); path = host.state / "requeue.json"
            prs = [{"number": n, "state": "OPEN", "headRefOid": "head-A", "headRefName": f"devin/jov-{n}"} for n in (5, 6)]
            for moved in (False, True):
                with self.subTest(moved=moved), patch.object(lane, "sh") as command, patch.object(lane, "reconcile_fix_target", side_effect=lambda pr: dict(pr)):
                    path.write_text(json.dumps({"5": "head-A", "6": "head-A"}))
                    claim = lane.Locked(host.state / "claim.lock", blocking=True)
                    try:
                        selected = lane.requeue_verified(host, prs, defer=lambda pr: True)
                        self.assertEqual(selected, prs[0]); command.assert_not_called()
                        self.assertEqual(json.loads(path.read_text()), {"5": "head-A", "6": "head-A"})
                    finally: claim.release()
                    def retry(pr):
                        self.concurrent_update(self, host, {"9": "concurrent", **({"5": "head-B"} if moved else {})})
                        return {"verdict": "landing"}
                    self.assertEqual(lane.run_deferred_requeue(host, selected, retry), {"verdict": "landing"})
                    self.assertEqual(json.loads(path.read_text()), {"6": "head-A", "9": "concurrent", **({"5": "head-B"} if moved else {})})
                    command.assert_not_called()

    def test_deferred_unknown_moved_closed_revoked_and_held_do_not_remove_or_enqueue(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); path = host.state / "requeue.json"
            pr = {"number": 5, "state": "OPEN", "headRefOid": "head-A", "headRefName": "devin/jov-5"}
            for live in (None, {**pr, "state": "CLOSED"}, {**pr, "headRefOid": "head-B"}, {**pr, "headRefName": "other"}, pr):
                with self.subTest(live=live), patch.object(lane, "reconcile_fix_target", return_value=live), patch.object(lane, "sh") as command, patch.object(lane, "publication_revocation", return_value=None):
                    path.write_text(json.dumps({"5": "head-A"}))
                    for outcome in (None, {"verdict": "remote-held"}):
                        with patch("builtins.print"), patch.object(lane, "gate_pr") as gate:
                            retry = unittest.mock.Mock(return_value=outcome)
                            result = lane.run_deferred_requeue(host, pr, retry)
                            self.assertEqual(result, outcome if live == pr else None)
                            self.assertEqual(retry.call_count, int(live == pr)); gate.assert_not_called()
                    self.assertEqual(json.loads(path.read_text()), {"5": "head-A"}); command.assert_not_called()
            lane.revoke_publication(host, branch=pr["headRefName"], reason="run-stopped")
            with patch.object(lane, "reconcile_fix_target", return_value=pr):
                retry = unittest.mock.Mock(); self.assertIsNone(lane.run_deferred_requeue(host, pr, retry)); retry.assert_not_called()

    def test_deferred_error_and_operator_stop_release_owned_slot_and_propagate(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp)); pr = {"number": 5, "state": "OPEN", "headRefOid": "head-A", "headRefName": "devin/jov-5"}
            for error in (RuntimeError("fixture"), KeyboardInterrupt()):
                with self.subTest(error=type(error).__name__), patch.object(lane, "reconcile_fix_target", return_value=pr):
                    slot = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
                    with self.assertRaises(type(error)):
                        lane.run_deferred_requeue(host, pr, unittest.mock.Mock(side_effect=error), slot=slot)
                    contender = lane.Locked(host.state / "slots/devin.0.lock", blocking=False)
                    try: self.assertTrue(contender.held)
                    finally: contender.release()
class TimerInstallerNodePathTests(unittest.TestCase):
    def test_generated_timers_use_installer_node_and_keep_current_receipts(self):
        import plistlib

        source = (Path(__file__).resolve().parents[1] / "lanes/install.sh").read_text()
        for platform, with_gbrain in ((p, g) for p in ("Linux", "Darwin") for g in (False, True)):
            with self.subTest(platform=platform, with_gbrain=with_gbrain), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                bin_dir = root / "selected-node-bin"
                bin_dir.mkdir()
                units = root / "units"
                units.mkdir()
                plist = root / "lanes.plist"
                # Redirect only service output destinations; keep HOME and the
                # actual installer logic intact. No host timer is installed.
                script = source.replace("$HOME/.config/systemd/user", str(units))
                # Keep the installer algorithm real while preventing this host's
                # CLI aliases from satisfying or shadowing the fixture lookup.
                script = script.replace("$HOME/.local/bin", str(root / "local-bin"))
                script = script.replace("$HOME/.npm-global/bin", str(root / "npm-bin"))
                script = script.replace("$HOME/Library/LaunchAgents/com.jovie.lanes.plist", str(plist))
                installer = root / "install.sh"
                installer.write_text(script)
                commands = root / "commands.log"

                def stub(name, body):
                    path = bin_dir / name
                    path.write_text(body)
                    path.chmod(0o755)

                brain_bin = root / "installed-gbrain-bin"
                brain_bin.mkdir()
                brain = brain_bin / "gbrain"
                if with_gbrain:
                    brain.write_text("#!/bin/sh\nprintf 'fixture-retrieval-ok\\n'\n")
                    brain.chmod(0o755)
                stub("node", "#!/bin/sh\nprintf 'v24.21.0\\n'\n")
                stub("uname", f"#!/bin/sh\nprintf '{platform}\\n'\n")
                stub("git", "#!/bin/sh\nprintf '" + "c" * 40 + "\\n'\n")
                for name in ("systemctl", "launchctl"):
                    stub(name, f'#!/bin/sh\nprintf "{name} %s\\n" "$*" >> "$INSTALL_COMMAND_LOG"\n')
                stub("python3", '''#!/usr/bin/python3
import os, pathlib, sys, json
if sys.argv[1] == '-c':
    code = sys.argv[2]
    sys.argv = [sys.argv[0], *sys.argv[3:]]
    exec(code, {'__name__': '__main__'})
    sys.exit(0)
state = pathlib.Path(os.environ['LANES_STATE'])
current = state / 'current'
current.mkdir(parents=True, exist_ok=True)
(current / '.tree').write_text('a' * 40)
(current / '.release.json').write_text(json.dumps({'sourceCommit': 'b' * 40, 'objects': {'scripts/lanes': 'a' * 40}}))
(current / '.release.json').write_text(json.dumps({'sourceCommit': 'c' * 40, 'objects': {'scripts/lanes': 'a' * 40}}))
with open(os.environ['INSTALL_COMMAND_LOG'], 'a') as log:
    log.write('python3 ' + ' '.join(sys.argv[1:]) + '\\n')
''')
                result = subprocess.run(
                    ["/bin/bash", str(installer)], capture_output=True, text=True,
                    env={**os.environ, "PATH": f"{bin_dir}:{brain_bin}:/usr/bin:/bin",
                         "LANES_STATE": str(root / "state"), "LANES_REPO": str(root / "repo"),
                         "LANES_HUD": "0", "INSTALL_COMMAND_LOG": str(commands)},
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                if platform == "Darwin":
                    config = plistlib.loads(plist.read_bytes())
                    timer_path = config["EnvironmentVariables"]["PATH"]
                    tick = config["ProgramArguments"][-1]
                    self.assertEqual(config["EnvironmentVariables"]["CODEX_LEDGER_CADENCE_S"], "3600")
                else:
                    service = (units / "jovie-lanes.service").read_text()
                    timer_path = next(line.removeprefix("Environment=PATH=") for line in service.splitlines() if line.startswith("Environment=PATH="))
                    tick = service
                    self.assertIn("KillMode=process", service)
                    self.assertIn("Environment=CODEX_LEDGER_CADENCE_S=3600", service)
                self.assertEqual(timer_path.split(":")[0], str(bin_dir))
                if with_gbrain:
                    self.assertEqual(shutil.which("gbrain", path=timer_path), str(brain))
                    retrieval = subprocess.run(["gbrain", "query", "fixture"],
                                               env={"PATH": timer_path}, capture_output=True, text=True)
                    self.assertEqual(retrieval.stdout.strip(), "fixture-retrieval-ok")
                    self.assertEqual(timer_path.split(":").count(str(brain_bin)), 1)
                else:
                    self.assertNotIn(str(brain_bin), timer_path.split(":"))
                self.assertIn("codex_lane.py reconcile --if-due 3600", tick)
                self.assertIn("lane_runner.py dispatch", tick)
                log = commands.read_text()
                self.assertIn("install-receipt --source-commit " + "c" * 40, log)
                self.assertNotIn("install-receipt --source-commit " + "b" * 40, log)
                self.assertIn("--source-tree " + "a" * 40, log)
                self.assertIn("--cadence 3600", log)


class TerminalPublicationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name))
        self.pr = {"number": 7, "headRefOid": "abc", "headRefName": "devin/jov-7-20261002t0000",
                   "state": "OPEN", "isDraft": True, "mergeStateStatus": "CLEAN", "labels": []}
        self.live = dict(self.pr)
        self.calls = []
        def shell(cmd, **kwargs):
            self.calls.append(cmd)
            return SimpleNamespace(returncode=0, stdout=publication_response(cmd), stderr="")
        for patcher in [patch.object(lane, "sh", side_effect=shell),
                        patch.object(lane, "reconcile_fix_target", side_effect=lambda _: dict(self.live) if self.live else None),
                        patch.object(lane, "claimed_elsewhere", return_value=False)]:
            patcher.start(); self.addCleanup(patcher.stop)

    def proof(self, record=None):
        (self.host.state / "verified.json").write_text(json.dumps({"7:abc": gate_proof("abc") if record is None else record}))

    def armable(self):
        self.pr.update(isDraft=False, statusCheckRollup=[
            {"name": "PR Ready", "status": "COMPLETED", "conclusion": "SUCCESS"}])
        self.live = dict(self.pr)
        return self.pr

    def test_rearming_requires_terminal_proof_and_preserves_signal_history(self):
        pr = self.armable()
        history = {"7": {"sha": "abc", "count": 2, "at": 0}}
        path = self.host.state / "fix-attempts.json"
        path.write_text(json.dumps(history))
        for proof in (None, "abc", gate_proof("abc", "held"), gate_proof("other"),
                      {**gate_proof("abc"), "policyDigest": "old"}):
            with self.subTest(proof=proof), patch.object(lane.remediation, "escalation_enabled", return_value=True):
                (self.host.state / "verified.json").unlink(missing_ok=True)
                if proof is not None: self.proof(proof)
                lane.arm_ready_prs(self.host, [pr])
                self.assertEqual(self.calls, [])
                self.assertEqual(json.loads(path.read_text()), history)

    def test_rearming_obeys_spent_hold_revocation_and_owner_authority(self):
        pr = self.armable()
        self.proof()
        paths = [self.host.state / "fix-attempts.json", lane.held_path(self.host), lane.revocations_path(self.host)]
        for mode in ("spent", "held", "revoked", "foreign-owner", "active-gate", "fresh-hold", "moved"):
            with self.subTest(mode=mode), patch.object(lane.remediation, "escalation_enabled", return_value=True):
                for path in paths: path.unlink(missing_ok=True)
                self.live = dict(pr); self.calls.clear()
                if mode == "spent": paths[0].write_text(json.dumps({"7": {"sha": "abc", "count": 2, "at": 0}}))
                if mode == "held": paths[1].write_text(json.dumps({"7": {"sha": "abc", "reason": "unfixable"}}))
                if mode == "revoked": lane.revoke_publication(self.host, branch=pr["headRefName"], reason="fixture-stop")
                if mode == "fresh-hold": self.live["labels"] = [{"name": "hold"}]
                if mode == "moved": self.live["headRefOid"] = "new-head"
                before = {str(path): path.read_bytes() for path in paths if path.exists()}
                claim = lane.reserve_gate(self.host, pr) if mode == "active-gate" else None
                try:
                    with patch.object(lane, "claimed_elsewhere", return_value=mode == "foreign-owner"):
                        lane.arm_ready_prs(self.host, [pr])
                finally:
                    if claim: claim.lock.release()
                self.assertEqual(self.calls, [])
                self.assertEqual({str(path): path.read_bytes() for path in paths if path.exists()}, before)

    def test_rearming_uses_exact_head_consumer_and_never_blindly_deletes_labels(self):
        pr = self.armable(); self.proof()
        for failed in (False, True):
            with self.subTest(enqueue_failed=failed), patch.object(lane.remediation, "escalation_enabled", return_value=True):
                self.calls.clear()
                def shell(cmd, **kwargs):
                    self.calls.append(cmd)
                    return SimpleNamespace(returncode=int(failed and cmd[:3] == ["gh", "pr", "merge"]),
                                           stdout=publication_response(cmd), stderr="")
                with patch.object(lane, "sh", side_effect=shell): lane.arm_ready_prs(self.host, [pr])
                writes = [cmd for cmd in self.calls if cmd[:3] == ["gh", "pr", "merge"]]
                self.assertEqual(len(writes), 1)
                self.assertEqual(writes[0][-2:], ["--match-head-commit", "abc"])
                self.assertFalse(any("DELETE" in cmd for cmd in self.calls))
                self.assertFalse(any(cmd[:3] == ["gh", "pr", "ready"] for cmd in self.calls))
                if failed: self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {"7": "abc"})

    def test_rearming_preserves_classifier_and_disabled_switch(self):
        pr = self.armable(); self.proof()
        with patch.object(lane.remediation, "escalation_enabled", return_value=False), \
                patch.object(lane, "publish_verified") as publish:
            lane.arm_ready_prs(self.host, [pr]); publish.assert_not_called()
        with patch.object(lane.remediation, "escalation_enabled", return_value=True), \
                patch.object(lane, "publish_verified") as publish:
            lane.arm_ready_prs(self.host, [{**pr, "isDraft": True}, {**pr, "mergeStateStatus": "DIRTY"}])
            publish.assert_not_called()

    def test_policy_reads_release_inventory_lock_and_cleanup_preserves_concurrent_head(self):
        self.proof()
        path = self.host.state / "requeue.json"
        path.write_text(json.dumps({"7": "abc"}))
        observed = []
        def policy(pr, **kwargs):
            claim = lane.Locked(self.host.state / "claim.lock", blocking=False)
            try:
                self.assertTrue(claim.held, "canonical policy must run outside the inventory lock")
                if not kwargs["before_ready"]:
                    lane.update_json(path, lambda rows: rows.update({"7": "new-head", "9": "other-writer"}))
                observed.append(kwargs["before_ready"])
            finally:
                claim.release()
            return None
        with patch.object(lane, "source_publication_authority", side_effect=policy):
            lane.requeue_verified(self.host, [self.pr])
        self.assertEqual(observed, [True, False])
        self.assertEqual(json.loads(path.read_text()), {"7": "new-head", "9": "other-writer"})

    def test_failure_hold_or_queue_history_refusal_cannot_be_overridden_by_terminal_proof(self):
        self.proof()
        for stage in ("source", "history"):
            calls = []
            def shell(cmd, **kwargs):
                calls.append(cmd)
                out = publication_response(cmd)
                code = 0
                if stage == "source" and Path(cmd[1]).name == "source_admission.mjs":
                    out = json.dumps({"schema": "jovie-source-admission/v1", "prNumber": 7,
                                      "headSha": "abc", "allowed": False,
                                      "blockers": ["tombstone:jovie-queue-failure-hold/v1"]})
                    code = 1
                if "check-reenroll" in cmd:
                    self.assertEqual(kwargs["env"]["REPO"], lane.REPO_SLUG)
                    out = json.dumps({"number": 7, "reenrollable": False})
                    code = 1
                return SimpleNamespace(returncode=code, stdout=out, stderr="")
            with self.subTest(stage=stage), patch.dict(os.environ, {"REPO": "wrong/repository"}), \
                    patch.object(lane, "sh", side_effect=shell):
                self.assertTrue(lane.publish_verified(self.host, self.pr).startswith("held:"))
            self.assertFalse(any(c[:3] == ["gh", "pr", "merge"] for c in calls))
            self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {"7": "abc"})

    def test_missing_claim_time_held_wrong_head_policy_or_incomplete_proof_never_publishes(self):
        invalid = [None, "abc", gate_proof("abc", "held"), gate_proof("wrong"),
                   {**gate_proof("abc"), "policyDigest": "old"}]
        invalid += [{**gate_proof("abc"), "completedAt": value} for value in [None, 123, "bad", "2999-01-01T00:00:00Z"]]
        for proof in invalid:
            with self.subTest(proof=proof):
                path = self.host.state / "verified.json"
                if proof is None:
                    path.unlink(missing_ok=True)
                else:
                    self.proof(proof)
                self.assertEqual(lane.publish_verified(self.host, self.pr), "held:gate-proof")
                self.assertEqual(self.calls, [])
                self.assertFalse((self.host.state / "requeue.json").exists())
                claim = lane.reserve_gate(self.host, self.pr)
                self.assertIsNotNone(claim)
                claim.lock.release()

    def test_active_gate_and_foreign_owner_cannot_publish_even_with_terminal_proof(self):
        self.proof()
        claim = lane.reserve_gate(self.host, self.pr)
        try:
            self.assertEqual(lane.publish_verified(self.host, self.pr), "held:gate-active")
        finally:
            claim.lock.release()
        with patch.object(lane, "claimed_elsewhere", return_value=True):
            self.assertEqual(lane.publish_verified(self.host, self.pr), "held:publication-owner-active")
        self.assertEqual(self.calls, [])

    def test_sensitive_proof_is_required_and_non_draft_skips_ready(self):
        self.proof()
        self.live.update(isDraft=False, labels=[{"name": lane.SENSITIVE_PR_LABEL}])
        self.assertTrue(lane.publish_verified(self.host, self.pr).startswith("held:"))
        self.assertEqual(self.calls, [])
        self.proof(gate_proof("abc", sensitive=True))
        self.assertEqual(lane.publish_verified(self.host, self.pr), "landing")
        writes = [c for c in self.calls if c[0] == "gh"]
        self.assertEqual([c[:3] for c in writes], [["gh", "pr", "merge"]])
        self.assertEqual(writes[0][-2:], ["--match-head-commit", "abc"])

    def test_failed_ready_retains_intent_and_head_move_during_ready_cannot_enqueue(self):
        self.proof()
        def failed_ready(cmd, **kwargs):
            return SimpleNamespace(returncode=1 if cmd[:3] == ["gh", "pr", "ready"] else 0,
                                   stdout=publication_response(cmd), stderr="failed")
        with patch.object(lane, "sh", side_effect=failed_ready) as shell:
            self.assertEqual(lane.publish_verified(self.host, self.pr), "held:ready-failed")
            self.assertEqual(sum(c.args[0][:3] == ["gh", "pr", "ready"] for c in shell.call_args_list), 1)
        self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {"7": "abc"})
        def move(cmd, **kwargs):
            self.calls.append(cmd)
            if cmd[:3] == ["gh", "pr", "ready"]:
                self.live["headRefOid"] = "new"
            return SimpleNamespace(returncode=0,stdout=publication_response(cmd),stderr="")
        with patch.object(lane, "sh", side_effect=move):
            self.assertTrue(lane.publish_verified(self.host, self.pr).startswith("held:"))
        self.assertFalse(any(c[:3] == ["gh", "pr", "merge"] for c in self.calls))

    def test_partial_or_unreadable_inventory_retains_pending_but_positive_closed_cleans_it(self):
        path = self.host.state / "requeue.json"
        path.write_text(json.dumps({"7": "abc", "8": "other"}))
        self.live.clear()
        lane.requeue_verified(self.host, None)
        self.assertEqual(json.loads(path.read_text()), {"7": "abc", "8": "other"})
        with patch.object(lane, "reconcile_fix_target", side_effect=lambda pr: {**pr,"state":"MERGED"} if pr["number"]==7 else None):
            lane.requeue_verified(self.host, [])
        self.assertEqual(json.loads(path.read_text()), {"8": "other"})
        self.assertEqual(self.calls, [])

    def test_confirmed_enqueue_does_not_erase_concurrently_changed_pending_head(self):
        self.proof()
        path = self.host.state / "requeue.json"
        def shell(cmd, **kwargs):
            if cmd[:3] == ["gh", "pr", "merge"]:
                lane.update_json(path, lambda pending: pending.update({"7":"new", "9":"untouched"}))
            return SimpleNamespace(returncode=0,stdout=publication_response(cmd),stderr="")
        with patch.object(lane,"sh",side_effect=shell):
            self.assertEqual(lane.publish_verified(self.host, self.pr), "landing")
        self.assertEqual(json.loads(path.read_text()), {"7":"new", "9":"untouched"})

    def test_invalid_terminal_timestamp_and_pending_non_draft_stay_adoptable(self):
        for value in [None, 123, "bad", "2999-01-01T00:00:00Z"]:
            proof = {**gate_proof("abc"), "completedAt": value}
            self.assertEqual(lane.unverified_pr([self.pr], {"7:abc":proof}), self.pr)
        ready = {**self.pr, "isDraft":False}
        self.assertEqual(lane.unverified_pr([ready], {}, {"7":"abc"}), ready)
        self.assertIsNone(lane.unverified_pr([ready], {}, {"7":"old"}))
        self.assertIsNone(lane.unverified_pr([{**ready,"headRefName":"tim/manual"}], {}, {"7":"abc"}))

    def test_canonical_denials_and_incomplete_receipts_cannot_borrow_terminal_proof(self):
        self.proof()
        allowed = json.loads(publication_response(['node', 'source_admission.mjs', '7', 'abc']))
        cases = [(1, {**allowed, 'allowed': False, 'blockers': ['tombstone:jovie-queue-failure-hold/v1']}),
                 (0, {**allowed, 'headSha': 'other'}), (0, {**allowed, 'prNumber': 8}),
                 (1, allowed), (0, {**allowed, 'allowed': False}), (0, {**allowed, 'allowed': 1}), (0, {}), (0, [])]
        for code, receipt in cases:
            with self.subTest(receipt=receipt):
                def shell(cmd, **kwargs):
                    self.calls.append(cmd)
                    return SimpleNamespace(returncode=code, stdout=json.dumps(receipt), stderr='')
                self.calls.clear()
                with patch.object(lane, 'sh', side_effect=shell):
                    self.assertTrue(lane.publish_verified(self.host, self.pr).startswith('held:source-admission'))
                self.assertFalse(any(c[0] == 'gh' for c in self.calls))

    def test_draft_only_is_allowed_only_before_ready_and_queue_repository_is_pinned(self):
        self.proof()
        def shell(cmd, **kwargs):
            self.calls.append(cmd)
            output, code = publication_response(cmd), 0
            if Path(cmd[1]).name == 'source_admission.mjs' and self.live['isDraft']:
                output = json.dumps({'schema': 'jovie-source-admission/v1', 'prNumber': 7,
                                     'headSha': 'abc', 'allowed': False, 'blockers': ['draft']})
                code = 1
            if cmd[:3] == ['gh', 'pr', 'ready']:
                self.live['isDraft'] = False
            if 'check-reenroll' in cmd:
                self.assertEqual(kwargs['env']['REPO'], lane.REPO_SLUG)
            return SimpleNamespace(returncode=code, stdout=output, stderr='')
        with patch.dict(os.environ, {'REPO': 'wrong/repository'}), patch.object(lane, 'sh', side_effect=shell):
            self.assertEqual(lane.publish_verified(self.host, self.pr), 'landing')
        for after_ready in (False, True):
            result = SimpleNamespace(returncode=1, stdout=json.dumps({'schema': 'jovie-source-admission/v1',
                'prNumber': 7, 'headSha': 'abc', 'allowed': False, 'blockers': ['draft']}))
            with patch.object(lane, 'sh', return_value=result):
                self.assertIsNotNone(lane.source_publication_authority(self.live, before_ready=after_ready))

    def test_local_stop_during_slow_policy_or_history_read_prevents_the_next_write(self):
        for phase in ('source_admission.mjs', 'check-reenroll'):
            with self.subTest(phase=phase):
                self.proof()
                self.calls.clear()
                self.live['labels'] = []
                def shell(cmd, **kwargs):
                    self.calls.append(cmd)
                    if phase in cmd or Path(cmd[1]).name == phase:
                        self.live['labels'] = [{'name': 'tim-hold'}]
                    return SimpleNamespace(returncode=0, stdout=publication_response(cmd), stderr='')
                with patch.object(lane, 'sh', side_effect=shell):
                    self.assertTrue(lane.publish_verified(self.host, self.pr).startswith('held:'))
                self.assertFalse(any(c[:3] == ['gh', 'pr', 'merge'] for c in self.calls))
                if phase == 'source_admission.mjs':
                    self.assertFalse(any(c[0] == 'gh' for c in self.calls))


class PublicationBundlePrerequisitesTest(unittest.TestCase):
    def test_promotion_metrics_imports_from_only_declared_release_files(self):
        # Import from a standalone bundle so checkout files cannot hide missing dependencies.
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp)
            for name in lane.RELEASE_EXTRAS:
                destination = bundle / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, destination)
            code = '''import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const denied = () => { throw new Error('transport forbidden in bundle import'); };
for (const name of ['execFileSync', 'execSync', 'spawnSync', 'execFile', 'exec', 'spawn', 'fork'])
  childProcess[name] = denied;
globalThis.fetch = denied;
syncBuiltinESMExports();
const metrics = await import(process.argv[1]);
process.stdout.write(JSON.stringify({ loaded: typeof metrics.computeMetrics === 'function' }));
'''
            result = subprocess.run(['node', '--input-type=module', '-e', code,
                                     (bundle / 'scripts/promotion-loss-metrics.mjs').as_uri()],
                                    cwd=bundle, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {'loaded': True})

    def test_legacy_archive_cannot_activate_without_canonical_policy_dependencies(self):
        # Kept in the legacy selector so an old updater cannot skip this check.
        for path in lane.RELEASE_EXTRAS:
            self.assertTrue((ROOT / path).is_file(), path)
        result = subprocess.run(['node', str(ROOT / 'scripts/lanes/source_admission.mjs')],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['blockers'], ['evidence-unavailable'])


class EventDeliveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.host = lane.Host(state=root, repo=root)
        self.events = {'fp': {'issueId': 'issue', 'status': 'exhausted', 'attempts': [{'kind': 'model', 'lane': 'codex'}], 'noted': ['signal-1']}}
        lane.save_escalation(self.host, {'events': self.events})
        self.issue = {'id': 'issue', 'state': {'id': 'done', 'name': 'Done'}, 'labels': {'nodes': []}}
        self.comments, self.writes, self.transport_error, self.false = {}, [], None, False
        self.missing_comment_error = False
        self.linear = SimpleNamespace(gql=self.gql)

    def gql(self, query, variables):
        if query.startswith('query'):
            if 'comment(' in query:
                comment = self.comments.get(variables['id'])
                if comment is None and self.missing_comment_error:
                    raise RuntimeError('linear: Entity not found: Comment')
                return {'comment': comment}
            return {'issue': json.loads(json.dumps(self.issue))}
        self.writes.append((query, variables))
        if self.false:
            field = 'commentCreate' if 'commentCreate' in query else 'issueUpdate' if 'issueUpdate' in query else 'issueAddLabel'
            return {field: {'success': False}}
        if 'commentCreate' in query:
            value = variables['i']
            self.comments[value['id']] = {'id': value['id'], 'body': value['body'], 'issue': {'id': value['issueId']}}
            field = 'commentCreate'
        elif 'issueUpdate' in query:
            self.issue['state'] = {'id': variables['s'], 'name': 'Todo'}
            field = 'issueUpdate'
        else:
            self.issue['labels']['nodes'].append({'id': variables['l']})
            field = 'issueAddLabel'
        if self.transport_error:
            raise self.transport_error
        return {field: {'success': True}}

    def intent(self, **actions):
        plan = {'events': self.events, **actions}
        data = lane._event_delivery_state(self.host)
        lane._queue_event_delivery(data, plan, [self.issue], {'fp'}, 100)
        lane._save_event_delivery(self.host, data)
        return data

    def drain(self, now=100):
        return lane._apply_event_plan(self.linear, {}, self.host, lane._event_delivery_state(self.host), now)

    def test_intent_survives_restart_before_send_and_readback_is_required(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        report = self.drain()
        self.assertEqual(report['deliveryAcknowledged'], 1)
        self.assertEqual(len(self.writes), 1)
        row = next(iter(lane._event_delivery_state(self.host)['actions'].values()))
        self.assertEqual(row['history'][-1]['outcome'], 'authoritative-readback')
        self.drain(200)
        self.assertEqual(len(self.writes), 1)
        self.assertEqual(lane.load_escalation(self.host)['events'], self.events)

    def test_linear_missing_comment_error_is_the_absent_preimage_before_send(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        self.missing_comment_error = True
        report = self.drain()
        self.assertEqual(report['deliveryAcknowledged'], 1)
        self.assertEqual(report['deliveryFailed'], 0)
        self.assertEqual(len(self.writes), 1)

    def test_timeout_after_remote_acceptance_is_read_back_without_duplicate_send(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        self.transport_error = TimeoutError('remote timeout')
        self.assertEqual(self.drain()['deliveryFailed'], 1)
        self.assertEqual(self.drain(120)['deliveryFailed'], 1)  # backoff
        self.transport_error = None
        self.assertEqual(self.drain(160)['deliveryAcknowledged'], 1)
        self.assertEqual(len(self.writes), 1)

    def test_rejection_is_durable_and_transport_cap_never_resets_model_attempts(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        self.false = True
        for now in [100, 160, 460, 1000]:
            report = self.drain(now)
        self.assertEqual(report['deliveryExhausted'], 1)
        self.assertEqual(len(self.writes), 3)
        self.assertEqual(lane.load_escalation(self.host)['events'], self.events)
        row = next(iter(lane._event_delivery_state(self.host)['actions'].values()))
        self.assertTrue(any(x.get('error') == 'event-mutation-rejected' for x in row['history']))
        self.assertEqual(row['attempts'], 3)

    def test_comment_send_failure_records_safe_phase_without_reset_or_fake_ack(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        original = self.linear.gql
        def rejected(query, variables):
            if query.startswith('mutation'):
                self.writes.append((query, variables))
                raise lane.LinearRequestError({'message': 'secret-token private payload', 'extensions': {'code': 'FORBIDDEN', 'statusCode': 403}})
            return original(query, variables)
        self.linear.gql = rejected
        for now in [100, 160, 460]: self.drain(now)
        before = lane._event_delivery_state(self.host)
        row = next(iter(before['actions'].values()))
        self.assertEqual((row['attempts'], row['status']), (3, 'exhausted'))
        self.assertEqual(row['diagnostic'], {'phase': 'send', 'operation': 'comments', 'class': 'linear-graphql', 'code': 'FORBIDDEN', 'httpStatus': 403})
        self.assertEqual(row['history'][-1]['diagnostic'], row['diagnostic'])
        self.assertNotIn('secret-token', json.dumps(before))
        self.drain(1000)
        after = next(iter(lane._event_delivery_state(self.host)['actions'].values()))
        self.assertEqual((after['attempts'], after['commentId'], after['deadline']), (3, row['commentId'], row['deadline']))
        self.assertEqual(len(self.writes), 3)
        self.assertNotEqual(after['status'], 'acknowledged')
        self.assertEqual(lane.load_escalation(self.host)['events'], self.events)

    def test_readback_failure_classification_never_serializes_provider_messages(self):
        cases = [(lane.LinearRateLimited(1000), "linear-rate-limited"),
                 (TimeoutError("private-payload"), "transport-timeout"),
                 (subprocess.TimeoutExpired(["private-command"], 10), "transport-timeout"),
                 (lane.urllib.error.URLError("private-payload"), "transport-unavailable"),
                 (OSError("private-payload"), "transport-unavailable"),
                 (RuntimeError("event-private-payload"), "controller-error")]
        for index, (error, expected) in enumerate(cases):
            with self.subTest(expected=expected):
                self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
                self.linear.gql = lambda *args, error=error: (_ for _ in ()).throw(error)
                self.drain(100 + 600 * index)
                row = next(iter(lane._event_delivery_state(self.host)['actions'].values()))
                self.assertEqual(row['diagnostic']['class'], expected)
                self.assertEqual(row['attempts'], 0)
                self.assertNotIn('private-payload', json.dumps(row))

    def test_readback_errors_log_safe_http_status_and_no_attempt(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        error = lane.urllib.error.HTTPError('private-url', 403, 'secret-token', {}, None)
        self.linear.gql = lambda *args: (_ for _ in ()).throw(error)
        self.drain()
        row = next(iter(lane._event_delivery_state(self.host)['actions'].values()))
        self.assertEqual(row['attempts'], 0)
        self.assertEqual(row['diagnostic'], {'phase': 'readback', 'operation': 'comments', 'class': 'linear-http', 'httpStatus': 403})
        self.assertNotIn('secret-token', json.dumps(row))

    def test_partial_plan_retries_only_unacknowledged_actions(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}], labels=[{'id': 'issue', 'labelId': 'label'}])
        self.assertEqual(self.drain()['deliveryAcknowledged'], 1)
        self.false = True
        self.assertEqual(self.drain(101)['deliveryFailed'], 1)
        self.false = False
        self.assertEqual(self.drain(161)['deliveryAcknowledged'], 2)
        self.assertEqual(sum('commentCreate' in q for q, _ in self.writes), 1)
        self.assertEqual(sum('issueAddLabel' in q for q, _ in self.writes), 2)

    def test_changed_owner_preimage_produces_zero_mutations_and_preserves_caps(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        current = json.loads(json.dumps(self.events));current['fp']['attempts'].append({'kind': 'model', 'lane': 'devin'})
        lane.save_escalation(self.host, {'events': current})
        self.assertEqual(self.drain()['deliveryFailed'], 1)
        self.assertEqual(self.writes, [])
        self.assertEqual(lane.load_escalation(self.host)['events'], current)

    def test_remote_state_changed_at_local_write_fence_is_revalidated(self):
        self.intent(reopens=[{'id': 'issue', 'stateId': 'todo'}])
        original = lane._event_escalation
        def changed(host):
            self.issue['state'] = {'id': 'active', 'name': 'In Progress'}
            return original(host)
        with patch.object(lane, '_event_escalation', side_effect=changed):
            self.assertEqual(self.drain()['deliveryFailed'], 1)
        self.assertEqual(self.writes, [])
        self.assertEqual(self.issue['state']['name'], 'In Progress')

    def test_comment_id_survives_reopen_state_change_between_hosts(self):
        first = self.intent(reopens=[{'id': 'issue', 'stateId': 'todo'}], comments=[{'id': 'issue', 'body': 'same intent'}])
        self.drain();self.drain(101)
        comment = [row for row in first['actions'].values() if row['kind'] == 'comments'][0]
        data = {'schema': lane.EVENT_DELIVERY_SCHEMA, 'actions': {}}
        lane._queue_event_delivery(data, {'events': self.events, 'comments': [{'id': 'issue', 'body': 'same intent'}]}, [self.issue], {'fp'}, 200)
        later = next(iter(data['actions'].values()))
        self.assertEqual(comment['commentId'], later['commentId'])
        lane._apply_event_plan(self.linear, {}, self.host, data, 200)
        self.assertEqual(sum('commentCreate' in q for q, _ in self.writes), 1)

    def test_changed_remote_state_is_not_downgraded(self):
        self.intent(reopens=[{'id': 'issue', 'stateId': 'todo'}])
        self.issue['state'] = {'id': 'active', 'name': 'In Progress'}
        self.assertEqual(self.drain()['deliveryFailed'], 1)
        self.assertEqual(self.writes, [])

    def test_reopen_already_applied_is_acknowledged_after_restart(self):
        self.intent(reopens=[{'id': 'issue', 'stateId': 'todo'}])
        self.issue['state'] = {'id': 'todo', 'name': 'Todo'}
        self.assertEqual(self.drain()['deliveryAcknowledged'], 1)
        self.assertEqual(self.writes, [])

    def test_corrupt_journal_is_preserved_and_fails_closed(self):
        path = self.host.state / 'event-delivery.json';path.write_text('{broken')
        with self.assertRaises(ValueError):
            self.drain()
        self.assertEqual(path.read_text(), '{broken')
        self.assertEqual(self.writes, [])

    def test_missing_readback_is_not_delivery_and_pending_reopen_blocks_worker(self):
        data = self.intent(reopens=[{'id': 'issue', 'stateId': 'todo'}])
        self.linear.gql = lambda *_: {}
        self.assertEqual(self.drain()['deliveryFailed'], 1)
        self.events['fp'].update(status='claimed', lane='codex', startedStateId='started')
        lane.save_escalation(self.host, {'events': self.events})
        self.assertIsNone(lane.claim_labeled_event(self.host, 'codex', self.linear))
        self.assertFalse(lane.load_escalation(self.host)['events']['fp'].get('running', False))

    def test_cross_host_stable_id_and_remote_readback_deduplicate_comment(self):
        first = self.intent(comments=[{'id': 'issue', 'body': 'same intent'}])
        self.drain()
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp));lane.save_escalation(host, {'events': self.events})
            data = lane._event_delivery_state(host)
            lane._queue_event_delivery(data, {'events': self.events, 'comments': [{'id': 'issue', 'body': 'same intent'}]}, [self.issue], {'fp'}, 200)
            lane._save_event_delivery(host, data)
            self.assertEqual(set(first['actions']), set(data['actions']))
            report = lane._apply_event_plan(self.linear, {}, host, data, 200)
            self.assertEqual(report['deliveryAcknowledged'], 1)
            self.assertEqual(len(self.writes), 1)

    def test_crash_after_intent_persistence_sends_nothing(self):
        self.intent(comments=[{'id': 'issue', 'body': 'one receipt'}])
        with patch.object(lane, '_save_event_delivery', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError):
                self.drain()
        self.assertEqual(self.writes, [])

    def test_losing_planner_enqueues_no_actions(self):
        data = lane._event_delivery_state(self.host)
        lane._queue_event_delivery(data, {'events': self.events, 'comments': [{'id': 'issue', 'body': 'one receipt'}]}, [self.issue], set(), 100)
        self.assertEqual(data['actions'], {})


class RemediationEventRecoveryTest(unittest.TestCase):
    def setUp(self):
        from scripts.tests.test_remediation import linear_issue, providers
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.host = lane.Host(state=root, repo=root)
        self.issue = linear_issue('JOV-1', 'delivery-stalled', title='Gem delivery stalled')
        self.remote_state = {'id': 'todo-JOV', 'name': 'Todo'}
        def gql(query, variables):
            if query.startswith('query') and 'issue(' in query:
                return {'issue': {'id': self.issue['id'], 'state': self.remote_state, 'labels': {'nodes': []}}}
            if query.startswith('mutation') and 'issueUpdate' in query:
                self.remote_state = {'id': variables['s'], 'name': 'In Progress'}
                return {'issueUpdate': {'success': True}}
            return {}
        self.linear = SimpleNamespace(gql=gql, comment=lambda *_: None)
        for target, value in [('fetch_labeled_events', [self.issue]), ('load_providers', providers()),
                              ('cooling', False), ('provider_healthy', True)]:
            mock = patch.object(lane, target, return_value=value)
            mock.start()
            self.addCleanup(mock.stop)

    def test_completed_event_recurrence_dispatches_one_owner_after_restart(self):
        lane.save_escalation(self.host, {'events': {'delivery-stalled': {
            'issueId': self.issue['id'], 'status': 'done', 'attempts': []}}})
        report = lane.claim_remediation_events(self.host, self.linear)
        self.assertEqual(report['eventsClaimed'], 1)
        first = lane.claim_labeled_event(self.host, 'codex', self.linear)
        self.assertEqual(first.identifier, 'JOV-1')
        before = lane.load_escalation(self.host)['events']['delivery-stalled']
        lane.claim_remediation_events(self.host, self.linear)
        self.assertIsNone(lane.claim_labeled_event(self.host, 'codex', self.linear))
        after = lane.load_escalation(self.host)['events']['delivery-stalled']
        self.assertEqual(after['attempts'], before['attempts'])
        self.assertEqual(after['claimedAt'], before['claimedAt'])

    def test_rejected_unknown_or_failed_start_never_admits_model_or_erases_attempts(self):
        event = {'issueId': self.issue['id'], 'identifier': 'JOV-1', 'status': 'claimed', 'lane': 'codex',
                 'startedStateId': 'ip-JOV', 'attempts': [{'kind': 'model', 'lane': 'codex'}]}
        for failure in [False, TimeoutError('transport unavailable'), {}]:
            with self.subTest(failure=failure):
                lane.save_escalation(self.host, {'events': {'delivery-stalled': event.copy()}})
                def gql(query, variables):
                    if query.startswith('query'):
                        return {'issue': {'id': self.issue['id'], 'state': {'id': 'todo', 'name': 'Todo'}}}
                    if isinstance(failure, Exception):
                        raise failure
                    return {'issueUpdate': {'success': failure}} if failure is False else failure
                self.assertIsNone(lane.claim_labeled_event(self.host, 'codex', SimpleNamespace(gql=gql)))
                row = lane.load_escalation(self.host)['events']['delivery-stalled']
                self.assertFalse(row.get('running', False))
                self.assertEqual(row['attempts'], event['attempts'])
                self.assertEqual(row['startDelivery']['status'], 'failed')

    def test_rejected_or_timeout_start_cannot_adopt_other_host_after_restart(self):
        for failure in [False, TimeoutError("transport unknown")]:
            with self.subTest(failure=failure):
                event = {"issueId": self.issue["id"], "identifier": "JOV-1", "status": "claimed", "lane": "codex",
                         "startedStateId": "ip-JOV", "attempts": [{"kind": "model", "lane": "codex", "at": 1}]}
                lane.save_escalation(self.host, {"events": {"delivery-stalled": event}})
                state = {"id": "todo-JOV", "name": "Todo"}
                writes = []
                def gql(query, variables):
                    if query.startswith("query"):
                        return {"issue": {"id": self.issue["id"], "state": state}}
                    writes.append(variables)
                    if isinstance(failure, Exception):
                        raise failure
                    return {"issueUpdate": {"success": failure}}
                client = SimpleNamespace(gql=gql)
                with patch.object(lane.time, "time", return_value=100):
                    self.assertIsNone(lane.claim_labeled_event(self.host, "codex", client))
                # A different writer starts the issue before this process restarts.
                state = {"id": "ip-JOV", "name": "In Progress"}
                with patch.object(lane.time, "time", return_value=161):
                    self.assertIsNone(lane.claim_labeled_event(self.host, "codex", client))
                row = lane.load_escalation(self.host)["events"]["delivery-stalled"]
                self.assertFalse(row.get("running", False))
                self.assertEqual(row["attempts"], event["attempts"])
                self.assertEqual(row["startDelivery"]["attempts"], 1)
                self.assertEqual(row["startDelivery"]["error"], "event-start-ownership-unproven")
                self.assertEqual(len(writes), 1)

    def test_contradicted_success_cannot_survive_rejected_retry_and_other_host_start(self):
        event = {"issueId": self.issue["id"], "identifier": "JOV-1", "status": "claimed", "lane": "codex",
                 "startedStateId": "ip-JOV", "attempts": [{"kind": "model", "at": 1}]}
        lane.save_escalation(self.host, {"events": {"delivery-stalled": event}})
        state = {"id": "todo-JOV", "name": "Todo"}
        results = iter([True, False]); writes = []
        def gql(query, variables):
            if query.startswith("query"):
                return {"issue": {"id": self.issue["id"], "state": state}}
            writes.append(variables)
            return {"issueUpdate": {"success": next(results)}}
        client = SimpleNamespace(gql=gql)
        for now in [100, 161]:
            with patch.object(lane.time, "time", return_value=now):
                self.assertIsNone(lane.claim_labeled_event(self.host, "codex", client))
            self.assertNotIn("mutationReceipt", lane.load_escalation(self.host)["events"]["delivery-stalled"]["startDelivery"])
        state = {"id": "ip-JOV", "name": "In Progress"}
        with patch.object(lane.time, "time", return_value=222):
            self.assertIsNone(lane.claim_labeled_event(self.host, "codex", client))
        row = lane.load_escalation(self.host)["events"]["delivery-stalled"]
        self.assertFalse(row.get("running", False))
        self.assertEqual(row["startDelivery"]["attempts"], 2)
        self.assertEqual(row["attempts"], event["attempts"])
        self.assertEqual(len(writes), 2)

    def test_paired_commit_crash_recovers_original_attempt_without_replanning_generation(self):
        original = lane._save_event_json
        def crash(host, filename, data):
            if filename == "escalation.json":
                raise OSError("simulated crash between paired files")
            return original(host, filename, data)
        with patch.object(lane, "_save_event_json", side_effect=crash), patch.object(lane.time, "time", return_value=100):
            with self.assertRaises(OSError):
                lane.claim_remediation_events(self.host, self.linear)
        journal = lane._event_delivery_state(self.host)
        planned = json.loads(json.dumps(journal["prepared"]["rows"]["delivery-stalled"]["after"]))
        self.assertEqual(planned["attempts"][0]["at"], 100)
        self.assertEqual(lane.load_escalation(self.host).get("events", {}), {})
        with patch.object(lane.time, "time", return_value=200):
            lane.claim_remediation_events(self.host, self.linear)
        current = lane.load_escalation(self.host)["events"]["delivery-stalled"]
        self.assertEqual(current["attempts"], planned["attempts"])
        recovered = lane._event_delivery_state(self.host)
        self.assertNotIn("prepared", recovered)
        self.assertTrue(recovered["commits"])
        self.assertFalse(any(row.get("error") == "event-owner-preimage-changed" for row in recovered["actions"].values()))

    def test_prepared_recovery_preserves_concurrent_winner_and_suppresses_old_intent(self):
        before = {"issueId": "old", "attempts": []}
        after = {"issueId": "old", "attempts": [{"kind": "model", "at": 100}], "noted": ["x"]}
        winner = {"issueId": "new", "attempts": [{"kind": "model", "at": 90}, {"kind": "model", "at": 110}], "running": True}
        lane.save_escalation(self.host, {"events": {"fp": winner}})
        journal = lane._event_delivery_state(self.host)
        lane._queue_event_delivery(journal, {"events": {"fp": after}, "comments": [{"id": "old", "body": "old intent"}]}, [], {"fp"}, 100)
        journal["prepared"] = {"id": "transaction", "rows": {"fp": {"before": before, "after": after}}}
        lane._save_event_delivery(self.host, journal)
        lane._recover_event_preparation(self.host, journal)
        self.assertEqual(lane.load_escalation(self.host)["events"]["fp"], winner)
        self.assertEqual(next(iter(journal["actions"].values()))["status"], "superseded")
        self.assertEqual(journal["commits"][-1]["conflicts"], ["fp"])

    def test_concurrent_terminal_receipt_and_attempts_win_whole_row(self):
        lane.save_escalation(self.host, {'events': {'delivery-stalled': {
            'issueId': self.issue['id'], 'status': 'done', 'attempts': []}}})
        terminal = {'issueId': self.issue['id'], 'status': 'exhausted', 'running': False,
                    'attempts': [{'kind': 'model', 'lane': 'codex', 'head': 'delivery-stalled'}],
                    'receipt': 'newer-worker-finish'}
        planner = lane.remediation.plan_labeled_events
        def finish(*args, **kwargs):
            plan = planner(*args, **kwargs)
            lane.save_escalation(self.host, {'events': {'delivery-stalled': terminal,
                                  'other': {'status': 'claimed', 'running': True}}})
            return plan
        with patch.object(lane.remediation, 'plan_labeled_events', side_effect=finish):
            report = lane.claim_remediation_events(self.host, self.linear)
        self.assertEqual(lane.load_escalation(self.host)['events']['delivery-stalled'], terminal)
        self.assertTrue(lane.load_escalation(self.host)['events']['other']['running'])
        self.assertEqual(report['eventsExhausted'], 1)
        self.assertIsNone(lane.claim_labeled_event(self.host, 'codex', self.linear))

    def test_exhausted_attempts_are_not_reset_by_recurrence(self):
        attempts = [{'kind': 'model', 'lane': name, 'head': 'delivery-stalled', 'at': 1}
                    for name in ('codex', 'devin')]
        lane.save_escalation(self.host, {'events': {'delivery-stalled': {
            'issueId': self.issue['id'], 'status': 'done', 'attempts': attempts}}})
        report = lane.claim_remediation_events(self.host, self.linear)
        self.assertEqual(report['eventsExhausted'], 1)
        self.assertEqual(lane.load_escalation(self.host)['events']['delivery-stalled']['attempts'], attempts)
        self.assertIsNone(lane.claim_labeled_event(self.host, 'codex', self.linear))


class BundledAdmissionTest(unittest.TestCase):
    def test_transport_keeps_canonical_holds_pagination_and_fail_closed_reads(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required by the managed lane release")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shim = root / "gh"
            shim.write_text("#!" + sys.executable + "\n" + '''import json, os, sys
case = os.environ['ADMISSION_CASE']
path = sys.argv[-1]
assert sys.argv[1:5] == ['api', '--method', 'GET', '--include']
assert not os.environ.get('GH_TOKEN') and not os.environ.get('GITHUB_TOKEN')
with open(os.environ['ADMISSION_LOG'], 'a') as log: log.write(path + '\\n')
if case == 'failed-read': sys.exit(1)
headers = 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json'
hold = {'context': 'jovie-queue-failure-hold/v1', 'state': 'success',
        'description': 'class=deterministic-source;n=1;run=123;try=1',
        'creator': {'type': 'Bot', 'login': 'jovie-bot[bot]'},
        'target_url': 'https://github.com/JovieInc/Jovie/actions/runs/123'}
if '/statuses?' in path:
    data = [hold] if case == 'revision-hold' or (case == 'later-page-hold' and '&page=2' in path) else []
    if case == 'later-page-hold' and '&page=1' in path:
        headers += '\\r\\nlInK: <https://api.github.com' + path.replace('&page=1', '&page=2') + '>; rel="next"'
elif '/files?' in path: data = [{'filename': 'scripts/lanes/lane_runner.py'}]
elif '/reviews?' in path: data = []
else:
    data = {'number': 5, 'title': 'repair controller', 'body': 'releaseWorthy: false',
            'state': 'open', 'draft': case == 'draft-only', 'labels': [], 'mergeable': True,
            'head': {'sha': 'a' * 40, 'ref': 'codex/repair', 'repo': {'fork': False}},
            'base': {'ref': 'main'}, 'changed_files': 1}
if case == 'missing-headers': print(json.dumps(data)); sys.exit(0)
if case == 'bad-json': print(headers + '\\r\\n\\r\\nnot-json'); sys.exit(0)
if case == 'ambiguous-header': headers += '\\r\\ncontent-type: other'
print(headers + '\\r\\n\\r\\n' + json.dumps(data))
''')
            shim.chmod(0o755)
            env = {k: v for k, v in os.environ.items() if k not in ("GH_TOKEN", "GITHUB_TOKEN")}
            env.update(PATH=str(root) + os.pathsep + env.get("PATH", ""), ADMISSION_LOG=str(root / "requests"))
            for case, blocker in [("allowed", None), ("draft-only", "draft"),
                                  ("revision-hold", "tombstone:jovie-queue-failure-hold/v1"),
                                  ("later-page-hold", "tombstone:jovie-queue-failure-hold/v1"),
                                  ("failed-read", "evidence-unavailable"), ("missing-headers", "evidence-unavailable"),
                                  ("bad-json", "evidence-unavailable"), ("ambiguous-header", "evidence-unavailable")]:
                with self.subTest(case=case):
                    result = subprocess.run([node, str(ROOT / "scripts/lanes/source_admission.mjs"),
                                             "JovieInc/Jovie", "5", ("a" * 40)], cwd=root,
                                            env={**env, "ADMISSION_CASE": case}, text=True, capture_output=True, timeout=30)
                    receipt = json.loads(result.stdout)
                    self.assertEqual(receipt["allowed"], blocker is None, result.stderr)
                    self.assertEqual(result.returncode, 0 if blocker is None else 1)
                    self.assertEqual(receipt["blockers"], [] if blocker is None else [blocker])
                    if blocker != "evidence-unavailable":
                        self.assertEqual((receipt["headSha"], receipt["prNumber"]), (("a" * 40), 5))
            self.assertIn("page=2", (root / "requests").read_text())

"""Regression tests for scripts/lanes/lane_runner.py (provider-agnostic shipping lanes).

Run with:
    python3 -m pytest scripts/tests/test_lane_runner.py -v
"""
from __future__ import annotations

import importlib.util
import multiprocessing
import contextlib
import copy
import dataclasses
import fcntl
import concurrent.futures
import io
import signal
import socket
import shutil
import threading
import hashlib
import json
import os
import re
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
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import git_housekeeping  # noqa: E402

git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)

# Positive flow fixtures declare healthy capacity. Real low/critical admission
# remains exercised by the explicit free_pct overrides and test_disk_guard.py;
# these unit tests must neither depend on host capacity nor sweep host caches.
_disk_capacity_fixture = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
_devin_free_fixture = patch.object(lane.devin_free_policy, "admission_open", return_value=True)
# These lifecycle fixtures have synthetic heads/trees. Real checkout safety and
# command-entry refusal are exercised in test_qualification_guard.py.
_qualification_fixture = patch.object(lane.qualification_guard, "check",
    return_value={"fixtureSha256": "synthetic-isolated-checkout"})
_qualification_prepare_fixture = patch.object(lane.qualification_guard, "prepare_checkout",
    return_value={"fixtureSha256": "synthetic-isolated-checkout"})
def setUpModule():
    _qualification_prepare_fixture.start()
    _disk_capacity_fixture.start()
    _devin_free_fixture.start()
    _qualification_fixture.start()
def tearDownModule():
    _qualification_prepare_fixture.stop()
    _qualification_fixture.stop()
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
            "latestOpinionatedReviews": {"totalCount": 0, "pageInfo": {"hasNextPage": False}, "nodes": []},
            "reviewThreads": {"totalCount": 0, "pageInfo": {"hasNextPage": False}, "nodes": []},
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
            inputs = {"issue": "private issue", "gbrain": "prior private decision", "branch": "devin/jov-1", "prior_attempts": "previous attempt"}
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
            inputs = {"issue": "task", "gbrain": "", "branch": "codex/jov-1", "prior_attempts": ""}
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
                patch.object(lane, "Host", return_value=lane.Host(state=Path(tmp) / "state")), \
                patch.object(lane, "load_github_env", side_effect=AssertionError("credential access")):
            self.assertEqual(lane.main(["context-manifest", "--write"]), 0)
            self.assertEqual(lane.main(["context-manifest"]), 0)
            (Path(tmp) / "context-manifest.json").write_text('{}')
            self.assertEqual(lane.main(["context-manifest"]), 1)


class SelectionTest(unittest.TestCase):
    def test_dispatch_next_breaks_ties_inside_explicit_urgency(self):
        now = datetime(2026, 10, 5, tzinfo=timezone.utc).timestamp()
        target = issue("JOV-7896", priority=1, created="2026-10-05T00:00:00Z",
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

    def test_explicit_urgent_precedes_aged_or_designated_lower_priority(self):
        now = datetime(2026, 10, 16, tzinfo=timezone.utc).timestamp()
        urgent = issue("JOV-URGENT", priority=1, created="2026-10-15T23:00:00Z")
        low = issue("JOV-LOW", priority=4, created="2026-09-01T00:00:00Z",
                    labels=["agent-ready", "dispatch-next", "ws:ci"])
        for pool in ([low, urgent], [urgent, low]):
            self.assertIs(lane.pick_issue(pool, {}, now=now), urgent)
        # A fresh priority edit is consumed by the same picker without restart state.
        low.priority = 1
        self.assertIs(lane.pick_issue([urgent, low], {}, now=now), low)

    def test_priority_edits_survive_replay_and_serialized_restart(self):
        now = datetime(2026, 10, 16, tzinfo=timezone.utc).timestamp()
        a = issue("JOV-A", priority=1, created="2026-10-15T23:00:00Z")
        b = issue("JOV-B", priority=4, created="2026-09-01T00:00:00Z", labels=["ws:ci"])
        for priority, expected in [(4, "JOV-A"), (1, "JOV-B"), (2, "JOV-A")]:
            b.priority = priority
            snapshot = json.dumps([dataclasses.asdict(a), dataclasses.asdict(b)])
            for replay in range(3):
                pool = [lane.Issue(**row) for row in json.loads(snapshot)]
                self.assertEqual(lane.pick_issue(pool, {}, now=now).identifier, expected)
                self.assertEqual(json.dumps([dataclasses.asdict(row) for row in pool]), snapshot)

    def test_missing_or_invalid_priority_never_acquires_explicit_urgency(self):
        now = datetime(2026, 10, 16, tzinfo=timezone.utc).timestamp()
        urgent = issue("JOV-URGENT", priority=1, created="2026-10-15T23:00:00Z")
        for priority in [None, 0, -1, 5, 99, True, False, "1", 1.0]:
            with self.subTest(priority=priority):
                invalid = issue("JOV-INVALID", priority=priority, created="2026-09-01T00:00:00Z",
                                labels=["agent-ready", "dispatch-next", "ws:ci"])
                self.assertIs(lane.pick_issue([invalid, urgent], {}, now=now), urgent)

    def test_dispatch_next_preserves_admission_and_lane_routing(self):
        now = 10000.0
        target = issue("JOV-PIN", priority=1, labels=["agent-ready", "dispatch-next"])
        other = issue("JOV-OTHER", priority=1)
        for kwargs, failures in [
            ({"in_flight": frozenset({"jov-pin"})}, {}),
            ({"held_back": frozenset({"JOV-PIN"})}, {}),
            ({}, {"JOV-PIN": 3}),
        ]:
            with self.subTest(kwargs=kwargs, failures=failures):
                self.assertIs(lane.pick_issue([target, other], failures, now=now, **kwargs), other)
        for label in ("hold", "auth"):
            target.labels = ["agent-ready", "dispatch-next", label]
            self.assertIs(lane.pick_issue([target, other], {}, now=now, provider="devin"), other)
        target.labels = ["agent-ready", "dispatch-next", "devin"]
        self.assertIs(lane.pick_issue([target, other], {}, now=now, provider="codex",
            route=lambda task: {"chosen": {"lane": "devin" if task is target else "codex"}}), other)

    def test_dispatch_next_without_pool_admission_keeps_default_order(self):
        unadmitted = issue("JOV-PIN", priority=2, labels=["dispatch-next"])
        other = issue("JOV-OTHER", priority=2, created="2026-08-31T00:00:00Z")
        self.assertIs(lane.pick_issue([unadmitted, other], {}, now=10000), other)

    def test_rejection_reasons_match_final_worker_admission(self):
        red = issue("JOV-RED")
        red.title = "Rotate production credentials"
        failures = {"JOV-EXHAUSTED": 3, "JOV-RECENT": {"count": 1, "at": 9990},
                    "JOV-OLD-RELEASE": {"count": 3, "at": 9990, "release": "older-tree"}}
        cases = [(issue(labels=["Hold"]), "excluded-label:hold"),
                 (red, "sensitive-text"), (issue(labels=["AUTH"]), "sensitive-provider"),
                 (issue("JOV-EXHAUSTED"), "retry-exhausted"),
                 (issue("JOV-RECENT"), None),  # no fixed backoff (Tim 2026-10-12)
                 (issue("JOV-OLD-RELEASE"), None),  # a new release is the exhausted issue's exit
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
        self.assertEqual(lane.admission_rejection(issue(labels=["Hold", "auth"]), {}, 10000,
                         provider="devin"), "excluded-label:hold")

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

    def test_aging_breaks_ties_within_nonurgent_work(self):
        now = datetime(2026, 9, 5, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=2, created="2026-09-04T23:00:00Z"),
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
        self.assertEqual(picked.identifier, "JOV-1")

    def test_skips_excluded_and_exhausted_work_but_drains_the_shared_pool(self):
        picked = lane.pick_issue([
            issue("JOV-1", labels=["hold"]),
            issue("JOV-2", labels=["Area:Auth"]),
            issue("JOV-3", labels=[lane.SHARED_LABEL]),
            issue("JOV-4", priority=1),
        ], {"JOV-4": 3})
        self.assertEqual(picked.identifier, "JOV-3")

    def test_only_a_hold_excludes_and_other_legacy_labels_route(self):
        # Tim 2026-10-11: no-symphony, codex-blocked, reasoning-job and type:epic all have a way to land.
        for labels in (["no-symphony"], ["no-symphony", "remediation"], ["reasoning-job"]):
            with self.subTest(labels=labels):
                self.assertIsNone(lane.admission_rejection(issue(labels=labels), {}, 10000, provider="devin"))
        summer = issue(labels=["reasoning-job"])
        summer.description = 'Summer asks.\n```json\n{"schema": "summer.reasoning-job/v1"}\n```'
        self.assertEqual(lane.admission_rejection(summer, {}, 10000, provider="claude"), "reason-lane-job")
        blocked = issue(labels=["codex-blocked"])
        self.assertEqual(lane.admission_rejection(blocked, {}, 10000, provider="codex"), "codex-blocked")
        self.assertIsNone(lane.admission_rejection(blocked, {}, 10000, provider="claude"))
        epic = issue(labels=["Type:Epic"])
        self.assertIsNone(lane.admission_rejection(epic, {}, 10000, provider="claude"))
        self.assertEqual(lane.admission_rejection(epic, {}, 10000, provider="hyperagent"),
                         "epic-local-lanes-only")
        providers = {"codex": {}, "claude": {}, "hyperagent": {}}
        self.assertEqual(lane.lane_restriction(blocked, providers), {"claude", "hyperagent"})
        self.assertEqual(lane.lane_restriction(epic, providers), {"codex", "claude"})
        self.assertEqual(lane.lane_restriction(issue(labels=["auth", "codex-blocked"]), providers), set())
        self.assertIsNone(lane.lane_restriction(issue(), providers))

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

    def test_failures_retry_without_a_timer_and_reopen_on_a_new_release(self):
        failures = {"JOV-1": {"count": 1, "at": 1000.0}}
        self.assertEqual(lane.pick_issue([issue("JOV-1")], failures, now=1000.0 + 60).identifier, "JOV-1")
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            (Path(tmp) / "current").mkdir(); (Path(tmp) / "current" / ".tree").write_text("tree-a\n")
            parked = {"JOV-1": {"count": 3, "at": 1000.0, "release": "tree-a"}}
            self.assertIsNone(lane.pick_issue([issue("JOV-1")], parked, now=1000.0 + 86400))
            (Path(tmp) / "current" / ".tree").write_text("tree-b\n")
            self.assertEqual(lane.pick_issue([issue("JOV-1")], parked, now=1000.0 + 60).identifier, "JOV-1")
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

    def pricing_comparison_issue(self):
        task = issue("JOV-7863", labels=["agent-ready"])
        task.title = 'Marketing header shows "Request access" and /pricing renders the compact footer'
        task.description = (
            "Found in the studio header/footer certification pass "
            "([JOV-6180](https://linear.app/jovie/issue/JOV-6180/certify-against-live-pen)), "
            "comparing live [jov.ie/pricing](<http://jov.ie/pricing>) at 1440 on 2026-10-04 "
            "against Pen's canonical eoUUU and CCDnQ.\n\n"
            "The /pricing header CTA reads Request access. Every claim enters /start. "
            "Marketing pages must render the full SEO footer. Acceptance asserts the "
            "header label, destination and full footer at 1440 and 390."
        )
        return task

    def test_uncertified_route_comparison_retains_the_existing_hold(self):
        task = self.pricing_comparison_issue()
        self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))

    def test_route_observation_cannot_mask_a_requested_mutation(self):
        task = self.pricing_comparison_issue()
        evidence = task.description
        for instruction in (
            "Change it to $199.",
            "Set that amount to 199.",
            "Lower it to 199.",
            "Reduce that amount to 199.",
            "Bump that amount to 199.",
            "Synchronize that amount with the paid plan.",
            "Update the footer label.",  # Ambiguous mutation context stays conservative.
            "Rotate production credentials.",
            "Revoke production API keys.",
            "Change live production prices.",
        ):
            for description in (instruction + "\n\n" + evidence, evidence + "\n\n" + instruction):
                with self.subTest(instruction=instruction, prefix=description.startswith(instruction)):
                    task.description = description
                    self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))

    def test_generic_references_and_credential_negation_keep_the_existing_hold(self):
        task = issue("JOV-7863", labels=["agent-ready"])
        task.title = "Marketing header and compact footer layout"
        for description in (
            "Inspect live /pricing, then change it to $199.",
            "Compare live `/pricing`, then change it to $199.",
            "Compare live [revoke API keys /pricing](https://jov.ie/pricing).",
            "Verify live [change production prices /pricing](https://jov.ie/pricing).",
            "Change live [pricing](https://jov.ie/pricing) to $199.",
            "Change live [jov.ie/pricing](https://jov.ie/pricing) to $199.",
            "Do not rotate credentials.",
            "Do not rotate credentials. No token revocation.",
            "Unless the login fails, do not rotate credentials.",
            "Unless the login fails,\ndo not rotate credentials.",
            "In the event of an outage:\n\nDo not rotate credentials.",
            "Only during deployment:\n\nDo not rotate credentials.",
        ):
            with self.subTest(description=description):
                task.description = description
                self.assertIsNone(lane.pick_issue([task], {}, provider="codex"))

    def reviewed(self, issue_, reviewer="claude-code lanes agent", text_of=None):
        digest = lane.issue_text_digest(text_of or issue_)
        receipt = {"sha256": digest, "reviewer": reviewer, "at": "2026-10-20",
                   "reason": "product feature that builds revoke controls; no live credential is touched"}
        return f"Reviewed.\n<!-- sensitive-text-reviewed:v1 {json.dumps(receipt)} -->"

    def test_a_reviewed_false_positive_is_released_only_with_label_and_bound_receipt(self):
        task = issue("JOV-6597", labels=["agent-ready"])
        task.title = "Minimize OAuth scopes and add connected-account token hygiene"
        task.description = "Encrypt refresh tokens, show connected apps/accounts with revoke controls."
        self.assertTrue(lane.issue_hits_red_line(task))
        receipt = [self.reviewed(task)]
        with patch.object(lane, "SENSITIVE_REVIEW_READER", return_value=receipt) as reader:
            self.assertEqual(lane.admission_rejection(task, {}, 0), "sensitive-text")  # receipt alone
            reader.assert_not_called()
            task.labels.append("sensitive-text-reviewed")
            self.assertIsNone(lane.admission_rejection(task, {}, 0))  # label + bound receipt
        for bodies in ([], None, ["<!-- sensitive-text-reviewed:v1 {not json} -->"],
                       [self.reviewed(task, reviewer=" ")]):
            with self.subTest(bodies=bodies), patch.object(lane, "SENSITIVE_REVIEW_READER", return_value=bodies):
                self.assertEqual(lane.admission_rejection(task, {}, 0), "sensitive-text")
        with patch.object(lane, "SENSITIVE_REVIEW_READER", side_effect=RuntimeError("linear down")):
            self.assertEqual(lane.admission_rejection(task, {}, 0), "sensitive-text")

    def test_an_edit_after_review_voids_the_receipt(self):
        task = issue("JOV-6866", labels=["agent-ready", "sensitive-text-reviewed"])
        task.title = "Agent auth: JOVIE_API_KEY"
        task.description = "A settings UI to mint/revoke. Keys lift the anonymous rate limit."
        receipt = [self.reviewed(task)]
        with patch.object(lane, "SENSITIVE_REVIEW_READER", return_value=receipt):
            self.assertIsNone(lane.admission_rejection(task, {}, 0))
            task.description += "\nAlso revoke production API keys."
            self.assertEqual(lane.admission_rejection(task, {}, 0), "sensitive-text")
            task.title = "Agent auth: JOVIE_API_KEY (edited)"
            self.assertEqual(lane.admission_rejection(task, {}, 0), "sensitive-text")

    def test_unreviewed_true_positives_and_the_pricing_comparison_stay_held(self):
        held = self.pricing_comparison_issue()  # JOV-7863 per #22106: no review
        with patch.object(lane, "SENSITIVE_REVIEW_READER", return_value=[]):
            self.assertEqual(lane.admission_rejection(held, {}, 0), "sensitive-text")
        secret = issue("JOV-7390", labels=["sensitive-text-reviewed"])
        secret.title = "Provision SUMMER_COMPOSIO_API_KEY"
        secret.description = "Do not rotate or touch any other secrets."
        other = issue("JOV-6597")
        other.title, other.description = "Other issue", "revoke controls for tokens"
        # A receipt bound to another issue's text never releases this one.
        with patch.object(lane, "SENSITIVE_REVIEW_READER", return_value=[self.reviewed(other)]):
            self.assertEqual(lane.admission_rejection(secret, {}, 0), "sensitive-text")

    def test_plural_production_prices_are_held(self):
        task = issue("JOV-9", labels=["agent-ready"])
        task.title = "Update annual plan"
        for description in ("Change live prices.", "Reduce production prices.",
                            "Adjust prices in prod."):
            with self.subTest(description=description):
                task.description = description
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
        # Aging never promotes a lower explicit priority above current Urgent.
        ci.created_at = "2026-09-30T22:00:00Z"
        self.assertEqual(lane.pick_issue([urgent, ci], {}, now=now).identifier, "JOV-1")

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

    def test_stale_unleased_draft_stops_holding_hotspots(self):
        # Gem 2026-10-20: green draft #22253, untouched since 10-17, held six lanes issues.
        now = lane.created_at_epoch("2026-10-20T16:00:00Z")
        def pr(number, path, draft, updated):
            return {**self.open_pr(number, path), "isDraft": draft, "updatedAt": updated}
        idle = pr(22253, "scripts/lanes/doctor.py", True, "2026-10-17T18:58:04Z")
        self.assertEqual(lane.hotspot_holds([idle], now=now), {})
        # Kept: a live repair lease, recent activity, a ready PR, or unreadable evidence.
        self.assertEqual(lane.hotspot_holds([idle], now=now, leased=lambda n: n == 22253),
                         {"scripts/lanes/doctor.py": 22253})
        for kept in (pr(1, "scripts/lanes/doctor.py", True, "2026-10-19T09:35:10Z"),
                     pr(2, "scripts/lanes/doctor.py", False, "2026-10-01T00:00:00Z"),
                     pr(3, "scripts/lanes/doctor.py", True, None),
                     self.open_pr(4, "scripts/lanes/doctor.py")):
            with self.subTest(pr=kept["number"]):
                self.assertEqual(lane.hotspot_holds([kept], now=now), {"scripts/lanes/doctor.py": kept["number"]})
        lanes_work = self.titled("JOV-8253", "Enforce daily redacted receipts, incident dedupe, and soak accounting",
                                 labels=["ws:symphony-throughput"])
        self.assertEqual(lane.pool_rejections([lanes_work], lane.hotspot_holds([idle], now=now)), {})

    def test_repair_lease_probe_never_takes_or_rewrites_the_lease(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            self.assertFalse(lane.repair_leased(7))
            path = Path(tmp) / "locks" / "repair-pr-7.lock"
            holder = lane.Locked(path, blocking=False)
            receipt = path.read_text()
            try:
                self.assertTrue(lane.repair_leased(7))
                self.assertEqual(path.read_text(), receipt)
            finally:
                holder.release()
            self.assertFalse(lane.repair_leased(7))

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
        listed = json.dumps([self.open_pr(5, "scripts/lanes/hud.py"),
                             {**self.open_pr(6, "scripts/lanes/doctor.py"), "isDraft": True,
                              "updatedAt": "2020-01-01T00:00:00Z"}])
        with patch.object(lane, "sh", return_value=SimpleNamespace(returncode=0, stdout=listed, stderr="")) as sh:
            self.assertEqual(lane.open_hotspot_holds(), {"scripts/lanes/hud.py": 5})
        self.assertIn("isDraft", sh.call_args.args[0][-1])


class TargetFileAdmissionTest(unittest.TestCase):
    def fixture(self, number=21824):
        fingerprint = f"remediation:pr-{number}-conflict"
        task = issue(f"JOV-{number}", labels=[fingerprint])
        task.title = f"PR #{number} has carried lane-fix-exhausted for more than 24h ({fingerprint})"
        task.description = f"https://github.com/JovieInc/Jovie/pull/{number}\nFingerprint: `{fingerprint}`"
        row = {"schema": lane.pr_events.TARGET_FILES_SCHEMA, "source": "graphql-inline",
               "repository": "JovieInc/Jovie", "number": number, "state": "OPEN", "headRefOid": "a"*40,
               "baseRefName": "main", "baseRefOid": "b"*40, "baseTipOid": "c"*40,
               "paths": [f"apps/web/lib/product-{number}.ts"], "totalCount": 1,
               "observedAt": 9998, "sourceAt": 9999, "confirmedAt": 10000}
        return task, {number: row}

    def test_four_generated_cards_are_selected_by_public_worker_predicate(self):
        holds = {"scripts/lanes/lane_runner.py": 21724}
        for number in (21824, 21810, 21793, 21770):
            with self.subTest(number=number):
                task, witness = self.fixture(number)
                self.assertIsNone(lane.pick_issue([task], {}, now=10000, holds=holds))
                self.assertIs(lane.pick_issue([task], {}, now=10000, holds=holds, target_files=witness), task)
                self.assertEqual(lane.predicted_touch(task, witness, 10000), frozenset(witness[number]["paths"]))

    def test_declared_scope_real_hotspots_and_all_other_admission_guards_remain(self):
        task, witness = self.fixture(); holds = {"scripts/lanes/lane_runner.py": 21724}
        task.description += " Edit scripts/lanes/lane_runner.py."
        self.assertIsNone(lane.pick_issue([task], {}, now=10000, holds=holds, target_files=witness))
        task, witness = self.fixture(); witness[21824]["paths"] = ["scripts/lanes/lane_runner.py"]
        self.assertIsNone(lane.pick_issue([task], {}, now=10000, holds=holds, target_files=witness))
        task, witness = self.fixture()
        for kwargs in ({"held_back": frozenset({task.identifier})}, {"in_flight": frozenset({task.identifier})}):
            self.assertIsNone(lane.pick_issue([task], {}, now=10000, holds=holds, target_files=witness, **kwargs))
        self.assertIsNone(lane.pick_issue([task], {task.identifier: 3}, now=10000, holds=holds, target_files=witness))
        self.assertIsNone(lane.pick_issue([task], {}, now=10061, holds=holds, target_files=witness))


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

    def test_capability_ia_packet_survives_provider_handoff_and_compaction_recall(self):
        # Real prompt/manifest functions, fake provider I/O: transport proof only,
        # never a claim that a live model obeyed the policy.
        decision = 'planningDecisions: decisionRef=linear:renderer-v1; IA=Files; unresolved=offline index'
        for provider in ("codex", "claude", "devin", "hyperagent"):
            with self.subTest(provider=provider), tempfile.TemporaryDirectory() as tmp:
                task = issue("JOV-6212")
                task.description = decision
                prompt = lane.render_prompt(task, "codex/jov-6212", "", provider=provider,
                                            prior_attempts="compaction handoff: " + decision)
                inputs = {"issue": task.description, "gbrain": "", "branch": "codex/jov-6212", "prior_attempts": decision}
                path = Path(tmp) / "issue.prompt.md"
                first = lane.write_agent_prompt(path, prompt, "issue", provider, inputs)
                self.assertTrue(first["qualification"]["ok"])
                handoff = Path(tmp) / "handoff.prompt.md"
                note = "Retain exact decision scope and unresolved evidence: " + decision
                second = lane.write_agent_prompt(handoff, note + prompt, "handoff", provider,
                                                 {"previous_prompt": prompt, "handoff_note": note})
                self.assertTrue(second["qualification"]["ok"])
                self.assertIn(decision, handoff.read_text())
                self.assertIn("Integrate > consolidate > replace > extend > add", handoff.read_text())
                self.assertIn("official vendor integration indexes", path.read_text())
                self.assertIn("remain nonblocking", path.read_text())
                self.assertIn("planningDecisions", lane.render_fix_prompt(
                    {"number": 1, "headRefName": "codex/jov-6212", "mergeStateStatus": "BLOCKED"}, "offline"))

    def test_native_issue_link_is_nonclosing_before_the_agent_opens_a_pr(self):
        for labels in ([], ["commissioning"], ["parent"]):
            with self.subTest(labels=labels):
                prompt = lane.render_prompt(issue("JOV-42", labels=labels), "devin/jov-42-x", "")
                self.assertIn("Refs JOV-42.", prompt)
                self.assertIn("linear-issue-identifier:JOV-42", prompt)
                self.assertIn("normal implementation", prompt)

    def test_prompt_defaults_pr_body_to_internal_changelog_decision(self):
        prompt = lane.render_prompt(issue("JOV-42"), "codex/jov-42-x", "")
        self.assertIn('<!-- customer-changelog/v1 {"releaseWorthy":false} -->', prompt)
        self.assertIn("docs/CHANGELOG_PUBLICATION.md", prompt)

    def test_contract_forbids_interactive_skill_workflows(self):
        prompt = lane.render_prompt(issue(), "codex/jov-1", "")
        self.assertIn("Never stop to ask", prompt)
        self.assertIn("do not run gstack or other skill", prompt)
        self.assertIn("gh pr create --draft", prompt)

    def test_issue_runs_get_a_goal_and_definition_of_done_and_may_autoplan(self):
        plain = lane.render_prompt(issue("JOV-42"), "codex/jov-42", "")
        for needle in ("## Goal", "Ship JOV-42", "## Definition of done", "A test fails without",
                       "/autoplan", "Never wait for a plan", "plan-approved"):
            self.assertIn(needle, plain)
        stated = lane.Issue("id-JOV-43", "JOV-43", "Tab stays put", "Fix it.\n\n## Acceptance criteria\n"
                            "- [ ] Tab stays put\n- [ ] Snapshot updated\n\n## Notes\nunrelated",
                            2, "2026-09-01T00:00:00Z", [])
        prompt = lane.render_prompt(stated, "codex/jov-43", "")
        done = prompt.split("## Definition of done", 1)[1].split("## Planning", 1)[0]
        self.assertIn("- [ ] Tab stays put", done)
        self.assertIn("- [ ] Snapshot updated", done)
        self.assertNotIn("unrelated", done)
        self.assertNotIn("A test fails without", done)

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


class SessionContinuityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name))
        self.runs = self.host.state / "runs"
        self.runs.mkdir()
        self.task = issue("JOV-4302", labels=["ws:memory-gbrain"])
        self.linear = Mock()
        self.linear.gql.return_value = {"issue": {"comments": {
            "nodes": [{"id": "comment-1", "createdAt": "2026-10-14T12:00:00Z",
                       "body": "Jovie session handoff: fix exists at abc123; runtime still stale."}],
            "pageInfo": {"hasNextPage": False}}}}

    def write_runs(self, rows):
        (self.runs / "ledger.jsonl").write_text("\n".join(json.dumps(row) for row in rows))

    def row(self, **changes):
        return {"schema": "jovie-lane-run/v1", "repository": lane.REPO_SLUG,
                "runId": "prior-run", "issue": self.task.identifier,
                "startedAt": "2026-10-14T11:00:00Z", "verdict": "held",
                "branch": "codex/prior-attempt", "headSha": "abc123", "prUrl": "https://example.com/pr/1",
                "reasons": ["runtime-stale"], **changes}

    def test_fresh_session_retrieves_prior_attempt_and_handoff_without_gbrain(self):
        self.write_runs([self.row()])
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        prompt = lane.render_prompt(self.task, "codex/new-session", "", prior_attempts=recalled)
        for evidence in ("prior-run", "abc123", "runtime-stale", "comment-1", "fix exists at abc123"):
            self.assertIn(evidence, prompt)
        self.assertIn("GBrain unavailable", prompt)
        self.assertIn("git log", prompt)
        self.assertIn("why it reverted", prompt)
        self.assertIn("Jovie session handoff", prompt)
        self.assertIn("Never copy secrets", prompt)
        self.linear.gql.assert_called_once()
        self.assertIn("comments(first:5,orderBy:createdAt)", self.linear.gql.call_args.args[0])
        self.assertEqual(self.linear.gql.call_args.args[1], {"id": self.task.id})

    def test_same_area_history_is_reused_but_other_repositories_and_unrelated_runs_are_excluded(self):
        self.write_runs([self.row(issue="JOV-1", runId="same-area", workstream="memory-gbrain"),
                         self.row(issue="JOV-2", runId="unrelated", workstream="native-apps"),
                         self.row(repository="Other/Repo", runId="foreign"),
                         self.row(repository=None, runId="unknown-repository"),
                         self.row(runId="same-issue")])
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        self.assertIn("same-area", recalled)
        self.assertIn("same-issue", recalled)
        for omitted in ("unrelated", "foreign", "unknown-repository"):
            self.assertNotIn(omitted, recalled)
        self.assertLess(recalled.index("same-issue"), recalled.index("same-area"))

    def test_bounds_and_corrupt_rows_do_not_hide_the_latest_matching_attempt(self):
        rows = [self.row(runId=f"attempt-{i}", reasons=["x" * 2000]) for i in range(20)]
        self.write_runs(rows)
        path = self.runs / "ledger.jsonl"
        path.write_bytes(b"x" * 300000 + b"\n{}\nnull\ninvalid\n" + path.read_bytes())
        self.linear.gql.return_value["issue"]["comments"]["nodes"] = [
            {"id": str(i), "createdAt": "2026-10-14", "body": "y" * 10000} for i in range(5)]
        self.linear.gql.return_value["issue"]["comments"]["pageInfo"]["hasNextPage"] = True
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        self.assertIn("attempt-19", recalled)
        self.assertNotIn('"attempt-15"', recalled)
        self.assertIn("older comments omitted", recalled)
        self.assertLessEqual(len(recalled), lane.PRIOR_ATTEMPTS_CHARS)
        self.assertNotIn("x" * 1000, recalled)
        self.assertNotIn("y" * 1000, recalled)

    def test_large_receipts_cannot_crowd_out_cross_host_handoffs(self):
        self.write_runs([self.row(**{key: "z" * 5000 for key in
                         ("runId", "startedAt", "endedAt", "branch", "headSha", "prUrl", "verdict")},
                         reasons=["z" * 5000] * 3) for _ in range(4)])
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        self.assertIn("comment-1", recalled)
        self.assertIn("runtime still stale", recalled)
        self.assertLessEqual(len(recalled), lane.PRIOR_ATTEMPTS_CHARS)

    def test_missing_and_unavailable_are_distinct_and_never_expose_exception_text(self):
        self.linear.gql.side_effect = RuntimeError("private credential")
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        self.assertIn("local history unavailable", recalled)
        self.assertIn("Linear history unavailable", recalled)
        self.assertNotIn("private credential", recalled)
        self.write_runs([])
        self.linear.gql.side_effect = None
        self.linear.gql.return_value = {"issue": {"comments": {"nodes": [], "pageInfo": {"hasNextPage": False}}}}
        recalled = lane.prior_attempts_context(self.host, self.linear, self.task)
        self.assertIn("no matching attempts in bounded ledger tail", recalled)
        self.assertIn("no comments", recalled)
        self.linear.gql.return_value = {"issue": None}
        self.assertIn("Linear history unavailable", lane.prior_attempts_context(self.host, self.linear, self.task))


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
        # Fixture commits must not detach maintenance. The structural lane runs
        # Git 2.55, whose default is to keep writing `.git/objects` after commit returns.
        return subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True,
                              text=True, env=git_housekeeping.apply_fixture_env(os.environ)).stdout.strip()

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
                    if args[:6] == ["git", "-c", "core.hooksPath=" + os.devnull, "-c", "core.fsmonitor=false", "fetch"]:
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
            if args[:6] == ["git", "-c", "core.hooksPath=" + os.devnull, "-c", "core.fsmonitor=false", "fetch"]:
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

    def test_committed_feedback_reference_repair_needs_no_new_test(self):
        # PR #22434 repairs a stale test reference, not the test it names.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def git(*args):
                return subprocess.run(
                    ["git", "-c", "core.hooksPath=" + os.devnull,
                     "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                     "-c", "commit.gpgSign=false", *args], cwd=root, check=True,
                    capture_output=True, text=True,
                    env=git_housekeeping.apply_fixture_env(os.environ)).stdout.strip()
            git("init", "-q")
            inventory = {"schema": "jovie.feedback-guards/v1", "reviewedOn": "2026-10-17",
                         "lessons": [{"fingerprint": "Protected deployment evidence must be one fail-closed boundary",
                                      "lessonSha256": "9be675f44c4d687b00743acd245f48d1aaba53e5aad3960d1f4a75da95429411",
                                      "guards": [{
                             "kind": "test", "path": "apps/web/tests/unit/ci/deploy-workflow.test.ts",
                             "anchor": "binds the exact project deployment before cookie-only canary and auth smoke",
                             "reason": "Checks exact deployment binding and canonical protected probe ownership."
                         }]}]}
            reference = root / "LESSONS.guards.json"
            reference.write_text(json.dumps(inventory, indent=2) + "\n")
            (root / "LESSONS.md").write_text("# Lessons\n")
            git("add", ".")
            git("commit", "-qm", "docs: original feedback reference")
            base = git("rev-parse", "HEAD")
            inventory["reviewedOn"] = "2026-10-21"
            inventory["lessons"][0]["guards"][0].update(
                path="apps/web/tests/unit/ci/canary-health-gate.test.ts",
                anchor="binds the exact deployment, then probes it cookie-only without redirects",
                reason="Executes the shipped canary shell against a modeled preview and checks the exact deployment URL, bounded cookie-only requests and no redirects.")
            reference.write_text(json.dumps(inventory, indent=2) + "\n")
            (root / "LESSONS.md").write_text("# Lessons\n\nReviewed the repaired canary reference.\n")
            git("add", ".")
            git("commit", "-qm", "docs: repair feedback reference")
            changes = lane.parse_numstat(git("diff", "--numstat", base + "...HEAD"))
            self.assertEqual([c.path for c in changes], ["LESSONS.guards.json", "LESSONS.md"])
            self.assertEqual((changes[0].added, changes[0].deleted), (4, 4))
            self.assertEqual(lane.gate_assessment(changes), ([], None))
            # Classification must not skip the existing canonical qualification commands.
            self.assertEqual(lane.check_commands([c.path for c in changes]), [lane.CANONICAL_GATE])

    def test_feedback_inventory_is_not_a_test_or_a_general_json_exemption(self):
        inventory = self.change("LESSONS.guards.json")
        for path in ["apps/web/lib/a.ts", "scripts/invariants/feedback-linkage.mjs",
                     "package.json", "other.json", "nested/LESSONS.guards.json",
                     "LESSONS.guards.json.mjs", "lessons.guards.json"]:
            with self.subTest(path=path):
                self.assertEqual(lane.gate_rules([inventory, self.change(path)]),
                                 ["code-change-without-test"])
        self.assertIn("secret-like-file-changed", lane.gate_rules([
            inventory, self.change(".env.local")]))
        self.assertIn("lockfile-without-manifest", lane.gate_rules([
            inventory, self.change("pnpm-lock.yaml")]))
        self.assertEqual(lane.gate_rules([self.change("LESSONS.guards.json", 1501)]),
                         ["diff-too-large:1501"])

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

    def test_generated_inventory_is_excluded_but_source_and_tests_keep_the_size_cap(self):
        generated = self.change("docs/product/generated/artist-launch-inventory.json", 7336)
        code = self.change("scripts/artist-launch-contract.mjs", 1000)
        tests = self.change("scripts/artist-launch-contract.test.mjs", 500)
        self.assertEqual(lane.gate_rules([generated, code, tests]), [])
        tests.added += 1
        self.assertEqual(lane.gate_rules([generated, code, tests]), ["diff-too-large:1501"])
        for path in ["apps/web/lib/generated/unsafe.ts", "scripts/generated/task.mjs"]:
            with self.subTest(path=path):
                self.assertEqual(lane.gate_rules([self.change(path)]), ["code-change-without-test"])
        for path in ["docs/product/generated-notes.md", "scripts/generated-helper.mjs"]:
            with self.subTest(path=path):
                self.assertIn("diff-too-large:2501", lane.gate_rules([self.change(path, 2000), tests]))

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

    def test_green_diff_is_marked_ready_and_left_to_green_enroll(self):
        fake = FakeShell([self.pr])
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "landing")
        self.assertIn(["gh", "pr", "ready", "7", "--repo", lane.REPO_SLUG], fake.calls)
        # Merge Queue Green Enroll is the sole queue writer: lanes never arm or enqueue.
        self.assertFalse(any(c[:3] == ["gh", "pr", "merge"] or "enqueuePullRequest" in " ".join(c)
                             for c in fake.calls))

    def test_failed_ready_records_retry_under_inventory_lock(self):
        fake = FakeShell([self.pr], failing=("ready",))
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
        self.assertEqual(enabled, {"devin", "codex", "claude", "hyperagent", "grok"})
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
    def setUp(self):
        budget = patch.object(lane.Linear, "_snapshot_budget_admitted", return_value=True)
        budget.start()
        self.addCleanup(budget.stop)

    def test_unknown_graphql_code_and_private_message_are_not_retained(self):
        error = lane.LinearRequestError({"message": "secret-token", "extensions": {"code": "secret-token", "statusCode": "secret-token"}})
        self.assertEqual(error.diagnostic, {"class": "linear-graphql", "code": "UNKNOWN"})
        self.assertEqual(str(error), "linear: request rejected")
        missing = lane.LinearRequestError({"message": "Entity not found: Comment"})
        self.assertEqual(str(missing), "linear: Entity not found: Comment")

    def test_graphql_error_diagnostics_retain_only_allowlisted_metadata(self):
        client = lane.Linear.__new__(lane.Linear); client.key = "linear-app:test"; client.app = ("test", "fixture")
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return json.dumps({"errors": [{"message": "private payload secret-token", "extensions": {"code": "FORBIDDEN", "statusCode": 403, "payload": "secret-token"}}]}).encode()
        with patch.object(lane, "linear_cooldown_until", return_value=None), patch.object(lane, "record_linear_budget"), \
                patch.object(lane.linear_app_token, "token", return_value="fixture-token"), \
                patch.object(lane.urllib.request, "urlopen", return_value=Response()):
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

    def test_reads_key_and_maps_lane_issues_from_the_local_mirror(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            app_env = Path(tmp) / "linear-app.env"
            app_env.write_text('LINEAR_CLIENT_ID=cid\nLINEAR_CLIENT_SECRET=sec\n')
            client = lane.Linear(app_env=app_env)
            self.assertEqual(client.key, "linear-app:cid")
            lane.linear_sync.apply(Path(tmp), "JOV", [{
                "id": "i1", "identifier": "JOV-5", "title": "t", "description": None, "priority": 2,
                "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-10-11T00:00:00.000Z",
                "state": {"name": "Todo", "type": "unstarted"},
                "labels": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": "devin"}]}}])
            # Dispatch reads the mirror: no Linear request, at any mirror age.
            with patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("no Linear read")):
                [found] = client.lane_issues("devin")
            self.assertEqual((found.identifier, found.description, found.labels), ("JOV-5", "", ["devin"]))

    def test_missing_key_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "linear.env"
            env.write_text("OTHER=1\n")
            # #22378: no personal-key fallback; a RuntimeError the doctor and watchdog degrade on.
            with self.assertRaises(lane.LinearAppCredentialMissing):
                lane.Linear(env)


class LinearProtectedBudgetTest(unittest.TestCase):
    def test_snapshot_refresh_protects_both_dimensions_and_full_request_page_bound(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            now = time.time()
            budget = {"dimensions": {"requests": {"remaining": 700, "limit": 2500, "observedAt": now},
                                    "complexity": {"remaining": 1000000, "limit": 3000000, "observedAt": now}}}
            path = Path(tmp) / "api-budget.json"
            client = lane.Linear.__new__(lane.Linear)
            path.write_text(json.dumps(budget))
            self.assertTrue(client._snapshot_budget_admitted(5))
            self.assertFalse(client._snapshot_budget_admitted(100))
            for name in ("requests", "complexity"):
                for changes in ({"remaining": 0}, {"remaining": None}, {"limit": True},
                                {"observedAt": now - 61}, {"observedAt": now + 10}):
                    altered = json.loads(json.dumps(budget))
                    altered["dimensions"][name].update(changes)
                    path.write_text(json.dumps(altered))
                    self.assertFalse(client._snapshot_budget_admitted(1), (name, changes))
            path.write_text(json.dumps({"remaining": 2500, "limit": 2500, "observedAt": now}))
            self.assertFalse(client._snapshot_budget_admitted(1))
            self.assertFalse(any(Path(tmp).glob("linear-usage*")))

    def test_mirror_admission_probes_once_per_window_when_a_quiet_host_has_no_evidence(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            path, client = Path(tmp) / "api-budget.json", lane.Linear.__new__(lane.Linear)
            def answer(remaining):
                def gql(query, variables):
                    path.write_text(json.dumps({"dimensions": {name: {"remaining": remaining * scale, "limit": 5000 * scale,
                                                                      "observedAt": time.time()}
                                                               for name, scale in (("requests", 1), ("complexity", 400))}}))
                    return {"viewer": {"id": "app"}}
                return gql
            with patch.object(client, "gql", side_effect=answer(4000)) as read:
                self.assertTrue(client.admit(2))  # no evidence at all: one probe, then the gate
                self.assertTrue(client.admit(2))
                self.assertEqual(read.call_count, 1)
            path.unlink()
            with patch.object(client, "gql", side_effect=answer(100)) as read:
                self.assertFalse(client.admit(2), "fresh evidence below the reserve still refuses")
                self.assertFalse(client.admit(2))
                self.assertEqual(read.call_count, 1, "fresh refusing evidence is not re-probed")

    def test_stale_but_healthy_evidence_is_reobserved_before_the_scan_spends_it(self):
        # Gem: evidence 39 s old at worker admission was 82 s old when the scan ran 43 s later,
        # so the 60 s gate refused and a quiet host never made the call that would refresh it.
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": tmp}):
            path, client = Path(tmp) / "api-budget.json", lane.Linear.__new__(lane.Linear)
            def budget(remaining, at):
                path.write_text(json.dumps({"dimensions": {
                    "requests": {"remaining": remaining, "limit": 2500, "observedAt": at},
                    "complexity": {"remaining": 2900000, "limit": 3000000, "observedAt": at}}}))
            def probe(remaining):
                def answer(query, variables):
                    self.assertEqual((query, variables), ("query{viewer{id}}", {}))
                    budget(remaining, time.time())  # the probe's own response headers
                    return {"viewer": {"id": "u"}}
                return answer
            budget(2000, time.time() - 82)
            with patch.object(client, "gql", side_effect=probe(1999)) as read:
                self.assertTrue(client._refresh_budget_evidence(5))
                self.assertEqual(read.call_count, 1)
            budget(2000, time.time() - 82)
            with patch.object(client, "gql", side_effect=probe(600)) as read:
                self.assertFalse(client._refresh_budget_evidence(5), "fresh evidence below the reserve still refuses")
            for remaining, age in ((630, 82), (2000, 601)):
                budget(remaining, time.time() - age)
                with patch.object(client, "gql") as read:
                    self.assertFalse(client._refresh_budget_evidence(5), (remaining, age))
                    read.assert_not_called()
            budget(2000, time.time() - 82)
            with patch.object(client, "gql", side_effect=lane.LinearRateLimited(time.time() + 60)):
                self.assertFalse(client._refresh_budget_evidence(5))

    def test_write_queue_bound_preserves_unresolved_intents_and_deduplicates(self):
        now = time.time()
        plan = {"events": {"fp": {"issueId": "id", "noted": []}}, "comments": [{"id": "id", "body": "safe"}]}
        data = {"actions": {}}
        lane._queue_event_delivery(data, plan, [], {"fp"}, now)
        before = json.loads(json.dumps(data))
        lane._queue_event_delivery(data, plan, [], {"fp"}, now + 1)
        self.assertEqual(data, before)
        crowded = {"actions": {str(n): {"status": "exhausted"} for n in range(lane.EVENT_DELIVERY_PENDING_CAP)}}
        before = json.loads(json.dumps(crowded))
        with self.assertRaisesRegex(RuntimeError, "event-delivery-capacity-held"):
            lane._queue_event_delivery(crowded, plan, [], {"fp"}, now)
        self.assertEqual(crowded, before)
        crowded["actions"]["0"]["status"] = "acknowledged"
        lane._queue_event_delivery(crowded, plan, [], {"fp"}, now)
        self.assertEqual(len(crowded["actions"]), lane.EVENT_DELIVERY_PENDING_CAP + 1)
        self.assertIn("0", crowded["actions"])


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
        self.env = self.state / "linear-app.env"
        self.env.write_text('LINEAR_CLIENT_ID=cid\nLINEAR_CLIENT_SECRET=lin_api_test_secret\n')
        for patcher in (patch.object(lane.linear_app_token, "token", return_value="lin_api_test_secret"),
                        patch.object(lane.linear_app_token, "default_path", return_value=self.env)):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = lane.Linear(app_env=self.env)
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

    def test_unwritable_state_dir_falls_back_and_reports(self):
        """A read-only shared dir must not silently lose the cooldown (JOV-7577)."""
        readonly = self.state / "readonly-cooldown"
        readonly.mkdir()
        readonly.chmod(0o555)
        self.addCleanup(lambda: readonly.chmod(0o700))
        scope_id = hashlib.sha256(f"{lane.LINEAR_API_URL}\0{self.client.key}".encode()).hexdigest()
        tmp_scope = lane._tmp_cooldown_root() / scope_id
        self.addCleanup(lambda: shutil.rmtree(tmp_scope, ignore_errors=True))
        self.addCleanup(lambda: lane._PROCESS_LINEAR_COOLDOWNS.pop(scope_id, None))
        self.addCleanup(lambda: setattr(lane, "_COOLDOWN_UNWRITABLE_EVENT_FIRED", False))
        lane._COOLDOWN_UNWRITABLE_EVENT_FIRED = False
        events = []
        stderr = io.StringIO()
        # _chmod_private no-op keeps 0o555: a dir the lane cannot repair.
        with patch.dict(os.environ, {"LINEAR_COOLDOWN_STATE_DIR": str(readonly)}), \
                patch.object(lane, "_chmod_private", lambda *args: None), \
                patch.object(lane.pr_events, "upsert_intake", lambda event: events.append(event) or 1), \
                patch.object(lane.random, "random", return_value=0), \
                patch("sys.stderr", stderr), \
                self.assertRaises(lane.LinearRateLimited):
            lane.urllib.request.urlopen = lambda request, timeout: (_ for _ in ()).throw(
                self.http_error(429, b"", self.headers(remaining="0")))
            self.client.gql("query", {})
        self.assertIn("linear-cooldown-unwritable", stderr.getvalue())
        self.assertEqual([event["fingerprint"] for event in events], ["linear-cooldown-unwritable"])
        self.assertFalse(any(readonly.iterdir()), "the unwritable root must stay untouched")
        records = [path for path in tmp_scope.iterdir() if path.is_file()]
        self.assertTrue(records, "tmp fallback must persist the deadline for siblings")
        calls = []
        lane.urllib.request.urlopen = lambda request, timeout: calls.append(1) or self.response(
            {"data": {"ok": True}}, self.headers())
        with self.assertRaises(lane.LinearRateLimited):
            lane.Linear(self.env).gql("query", {})
        self.assertEqual(calls, [], "the fallback cooldown must keep siblings off Linear")
        lane._PROCESS_LINEAR_COOLDOWNS.pop(scope_id, None)
        self.assertIsNotNone(lane.linear_cooldown_until(self.client.key),
                             "the tmp record alone still cools the credential")

    def test_doctor_observe_keeps_the_mirror_pool_during_a_cooldown(self):
        os.environ["LANES_SELFTEST"] = "1"
        self.addCleanup(lambda: os.environ.pop("LANES_SELFTEST", None))
        with patch.object(lane.random, "random", return_value=0):
            lane.publish_linear_cooldown(self.client.key, self.headers(), now=time.time())
        host = lane.Host()
        host.state = self.state
        host.linear_env = self.env
        called = []

        def pool(*_args, **_kwargs):
            called.append(1)
            return {}, 0, {}, {}, {}

        with patch.object(lane.doctor, "qualified_pool", pool), \
                patch.object(lane.doctor, "host_capacity", lambda *_a, **_k: {}), \
                patch.object(lane, "load_github_env", lambda: None), \
                patch.object(lane, "graphql_budget", lambda: None):
            obs = lane.doctor.observe(host, lane, SimpleNamespace(status=lambda: {"accounts": {}}))
        # The pool is local (mirror); only the doctor's own Linear writes wait out the cooldown.
        self.assertEqual(called, [1])
        self.assertEqual((obs["pool"], obs["linearSkipped"]), (0, "cooldown"))
        self.assertIsNone(obs["linearError"])
        self.assertEqual(obs["linearSync"]["outbox"]["depth"], 0)


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


def repair_inventory_pr():
    return {'number': 999999, 'title': 'offline repair fixture', 'url': 'https://example.invalid/999999',
            'state': 'OPEN', 'headRefName': 'grok/jov-999999-20261014', 'headRefOid': 'a'*40,
            'isInMergeQueue': False, 'isCrossRepository': False, 'isDraft': False,
            'mergeStateStatus': 'BLOCKED', 'labels': [], 'labelsComplete': True,
            'filesComplete': True, 'rollup': 'FAILURE', 'updatedAt': '2026-10-14T23:00:00Z',
            'statusCheckRollup': [{'name': 'fixture', 'status': 'COMPLETED', 'conclusion': 'FAILURE'}]}

def repair_inventory_process(root, role, entered, release, preclaim, done, output, scenario="bulk"):
    try:
        os.environ.update(LANES_STATE=root, LANES_EXECUTION_BACKEND='offline-claim-audit',
                          SYMPHONY_AUTOSCALE='off', PYTHONDONTWRITEBYTECODE='1')
        # A separate process summary and actual current definitions: no inherited test stubs.
        spec = importlib.util.spec_from_file_location('claim_inventory_fixture', ROOT/'scripts/lanes/lane_runner.py')
        lane = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = lane
        spec.loader.exec_module(lane)
        state = Path(root); lane.SHARED_CACHE_DIR = state/'cache'
        providers = {x: {'enabled': True, 'repairs': True, 'model': 'offline', 'slots': 1,
                         'label': x} for x in ('codex', 'grok')}
        pr = repair_inventory_pr(); rows = [pr] if role == 'grok' else []
        clock = [time.time()]
        lane._SUMMARY.update(at=clock[0], sourceAt=None if scenario == 'unknown' else clock[0],
                             prs=rows, readable=scenario != 'unknown')
        if scenario == 'stale':
            lane._SUMMARY['sourceAt'] -= lane.CLAIM_SCAN_TTL_S
        calls=[]; dispatch=[]; publication=[]
        actual_lock = lane.Locked
        def locked(path, *args, **kwargs):
            result = actual_lock(path, *args, **kwargs)
            if Path(path).name == 'claim.lock' and scenario == 'wait':
                clock[0] += lane.CLAIM_SCAN_TTL_S
            return result
        def target(pr):
            if scenario == 'positive-aged':
                clock[0] += lane.CLAIM_SCAN_TTL_S + 1
            if scenario == 'local-changed':
                (state/'fix-attempts.json').write_text(json.dumps({str(pr['number']): {
                    'sha': pr['headRefOid'], 'count': 1, 'lane': 'other', 'at': clock[0]}}))
            return {**pr, 'headRefOid': 'b'*40} if scenario == 'head-changed' else copy.deepcopy(pr)
        def forbidden(*a, **k):
            raise AssertionError('unexpected external fixture effect')
        def before_claim(*a, **k):
            if role == 'codex' and scenario == 'bulk':
                lane._SUMMARY['at'] = time.time() - lane.SUMMARY_TTL_S - 1
            if scenario == 'same-key':
                lane._SUMMARY['at'] = 0
            preclaim.set()
        def offline_sh(args, **kwargs):
            assert role == 'codex' and args[:3] == ['gh', 'api', 'graphql'], args
            assert any(str(x).startswith('query=') and lane.pr_events.OPEN_PRS_QUERY in str(x) for x in args)
            calls.append({'kind': 'actual-open-prs-graphql', 'timeout': kwargs.get('timeout')})
            entered.set(); assert release.wait(10), 'bounded offline read barrier timed out'
            return SimpleNamespace(returncode=0, stdout=json.dumps({'data': {'repository': {
                'pullRequests': {'nodes': [], 'pageInfo': {'hasNextPage': False, 'endCursor': None}}}}}), stderr='')
        def execute(host, name, spec, picked):
            attempts=json.loads((state/'fix-attempts.json').read_text())
            assert attempts[str(picked['number'])]['count'] == 1
            dispatch.append({'number': picked['number'], 'head': picked['headRefOid']})
        with contextlib.ExitStack() as stack:
            patches=[(lane.disk_guard,'check',{'return_value':{'admitted':True}}),
                     (lane.bindings,'work',{'return_value':None}),
                     (lane,'load_providers',{'return_value':providers}),
                     (lane,'requeue_verified',{'side_effect':before_claim}),
                     (lane,'sh',{'side_effect':offline_sh}),
                     (lane.lifecycle,'run',{'side_effect':forbidden}),
                     (lane,'provider_may_run',{'return_value':False}),
                     (lane,'claimed_elsewhere',{'return_value':scenario == 'unknown-owner'}),
                     (lane,'reconcile_fix_target',{'side_effect':target}),
                     (lane,'Locked',{'side_effect':locked}),
                     (lane.time,'time',{'side_effect':lambda:clock[0]}),
                     (lane,'post_claim',{'side_effect':lambda *a:publication.append(a)}),
                     (lane,'fix_red_pr',{'side_effect':execute}),
                     (lane,'reexec',{'return_value':0}), (lane,'Linear',{'side_effect':forbidden}),
                     (lane,'record_maintenance_demand',{}), (lane,'publish_exhausted_repairs',{}),
                     (lane,'sweep_execution_statuses',{}), (lane,'revisit_terminal_prs',{}),
                     (lane,'yield_deferred_requeues',{}), (lane,'claim_escalation_pr',{'return_value':None}),
                     (lane.pr_events,'claim_event_pr',{'return_value':None}),
                     (lane.pr_events,'cleanup_one_event',{}),
                     (socket.socket,'connect',{'side_effect':forbidden})]
            for obj,name,opts in patches:stack.enter_context(patch.object(obj,name,**opts))
            host=lane.Host(state=state,repo=state,linear_env=state/'nonexistent')
            slot=lane.Locked(state/'slots'/f'{role}.0.lock',blocking=False);assert slot.held
            result=lane.worker_with_slot(host,role,providers[role],slot,maintenance_only=True)
            attempts=json.loads((state/'fix-attempts.json').read_text()) if (state/'fix-attempts.json').exists() else {}
            output.put({'role':role,'result':result,'fixtureReads':calls,'repairDispatch':dispatch,
                        'claimPublications':len(publication),'attempts':attempts,
                        'slotReleased':slot.handle.closed,
                        'idle':json.loads((state/'worker-idle.json').read_text()) if (state/'worker-idle.json').exists() else {}})
        done.set()
    except BaseException as error:
        output.put({'role':role,'error':f'{type(error).__name__}: {error}'})
        done.set();raise


class ClaimScanCacheTest(unittest.TestCase):
    def test_repair_receipt_copies_same_call_rows_without_later_metadata_donation(self):
        now = self.clock['now']
        rows = [repair_inventory_pr()]
        lane._SUMMARY.update(at=now, sourceAt=now, prs=rows, readable=True)
        with patch.object(lane.time, 'time', side_effect=lambda: self.clock['now']):
            receipt = lane.capture_repair_inventory('codex')
            self.assertTrue(lane.repair_inventory_valid(receipt, 'codex'))
            self.clock['now'] += lane.CLAIM_SCAN_TTL_S
            lane._SUMMARY.update(at=self.clock['now'], sourceAt=self.clock['now'], prs=copy.deepcopy(rows))
            self.assertFalse(lane.repair_inventory_valid(receipt, 'codex'))
            self.assertEqual(receipt['summary']['sourceAt'], now)
            self.assertTrue(lane.repair_inventory_valid(lane.capture_repair_inventory('codex'), 'codex'))
            rows[0]['headRefOid'] = 'changed'
            self.assertEqual(receipt['prs'][0]['headRefOid'], 'a'*40)
            self.assertEqual(receipt['prs'], receipt['summary']['prs'])

    def test_repair_receipt_qualifies_raw_cache_value_before_rollup_normalization(self):
        now = self.clock['now']
        raw = [{'number': 7, 'rollup': 'FAILURE'}]
        with patch.object(lane.time, 'time', return_value=now), \
                patch.object(lane, 'shared', return_value=copy.deepcopy(raw)), \
                patch.object(lane, 'maintenance_json', return_value={'at': now-1, 'value': raw}):
            receipt = lane.capture_repair_inventory('codex')
        self.assertEqual(receipt['summary']['sourceAt'], now-1)
        self.assertTrue(receipt['prs'][0]['statusCheckRollup'][0]['synthetic'])
        self.assertEqual(receipt['prs'], receipt['summary']['prs'])
        lane._SUMMARY['at'] = 0
        with patch.object(lane.time, 'time', return_value=now), \
                patch.object(lane, 'shared', return_value=copy.deepcopy(raw)), \
                patch.object(lane, 'maintenance_json', return_value={'at': now, 'value': [{'number': 99}]}):
            self.assertIsNone(lane.capture_repair_inventory('codex')['summary']['sourceAt'])

    def _inventory_cache(self, size=None, **overrides):
        """Write the real shared inventory file; pad a PR body so the file is exactly `size` bytes."""
        row = repair_inventory_pr()
        path = lane.SHARED_CACHE_DIR / 'open-prs-labels-v2.json'
        doc = {'at': self.clock['now'], 'value': [row], **overrides}
        if size is not None:
            row['body'] = ''
            base = len(json.dumps(doc))
            row['body'] = 'x' * (size - base)
            doc['value'] = [row]
        path.write_text(json.dumps(doc))
        if size is not None:
            self.assertEqual(path.stat().st_size, size)
        return path, copy.deepcopy(doc['value'])

    def _capture_from_cache(self, rows, name='codex'):
        lane._SUMMARY.update(at=0, prs=[], readable=False)
        lane._SUMMARY.pop('sourceAt', None)
        with patch.object(lane.time, 'time', side_effect=lambda: self.clock['now']), \
                patch.object(lane, 'shared', return_value=copy.deepcopy(rows)), \
                contextlib.redirect_stderr(io.StringIO()):
            receipt = lane.capture_repair_inventory(name)
            return receipt, lane.repair_inventory_valid(receipt, name)

    def test_inventory_over_one_mib_is_qualified_with_a_finite_source_stamp(self):
        _, rows = self._inventory_cache(size=1_615_098)
        receipt, valid = self._capture_from_cache(rows)
        self.assertEqual(receipt['summary']['sourceAt'], self.clock['now'])
        self.assertNotIn('sourceAtReason', receipt['summary'])
        self.assertTrue(valid)

    def test_inventory_limit_boundary_passes_at_the_limit_and_names_oversize_above_it(self):
        limit = lane.REPAIR_INVENTORY_MAX_BYTES
        _, rows = self._inventory_cache(size=limit)
        receipt, valid = self._capture_from_cache(rows)
        self.assertTrue(valid, 'a file exactly at the limit is accepted')
        _, rows = self._inventory_cache(size=limit + 1)
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid)
        self.assertIsNone(receipt['summary']['sourceAt'])
        self.assertEqual(receipt['summary']['sourceAtReason'], 'inventory-oversize')
        self.assertEqual(receipt['summary']['sourceAtBytes'], limit + 1)

    def test_inventory_that_is_stale_malformed_missing_or_mismatched_still_fails_closed(self):
        path, rows = self._inventory_cache(size=2 * 1024 * 1024, at=self.clock['now'] - lane.CLAIM_SCAN_TTL_S)
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid, 'stale at is refused even for a large file')
        self.assertNotIn('sourceAtReason', receipt['summary'])
        path.write_text('{not json' + ' ' * (2 * 1024 * 1024))
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid)
        self.assertEqual(receipt['summary']['sourceAtReason'], 'inventory-unreadable')
        path.unlink()
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid)
        self.assertEqual(receipt['summary']['sourceAtReason'], 'inventory-unreadable')
        self._inventory_cache(size=2 * 1024 * 1024)
        receipt, valid = self._capture_from_cache([{**rows[0], 'headRefOid': 'b' * 40}])
        self.assertFalse(valid)
        self.assertEqual(receipt['summary']['sourceAtReason'], 'inventory-mismatch')

    def test_inventory_symlink_or_special_file_is_refused_regardless_of_size(self):
        path, rows = self._inventory_cache(size=2 * 1024 * 1024)
        target = lane.SHARED_CACHE_DIR / 'real.json'
        path.rename(target)
        path.symlink_to(target)
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid)
        self.assertIsNone(receipt['summary']['sourceAt'])
        self.assertNotEqual(receipt['summary'].get('sourceAtReason'), 'inventory-oversize')
        path.unlink(); target.unlink()
        os.mkfifo(path)
        receipt, valid = self._capture_from_cache(rows)
        self.assertFalse(valid)
        self.assertNotEqual(receipt['summary'].get('sourceAtReason'), 'inventory-oversize')

    def test_other_maintenance_json_callers_keep_the_one_mib_default(self):
        path = lane.SHARED_CACHE_DIR / 'other.json'
        path.write_text(json.dumps({'pad': 'x' * (1024 * 1024)}))
        with self.assertRaisesRegex(ValueError, 'maintenance-state-not-bounded-regular-file'):
            lane.maintenance_json(path)

    def test_repair_receipt_refuses_unknown_malformed_stale_and_cross_scope_pairs(self):
        now = self.clock['now']
        lane._SUMMARY.update(at=now, sourceAt=now, prs=[], readable=True)
        with patch.object(lane.time, 'time', return_value=now):
            good = lane.capture_repair_inventory('codex')
            self.assertTrue(lane.repair_inventory_valid(good, 'codex'), 'known empty is qualified')
            for stamp in (None, True, float('nan'), float('inf'), now+1, now-lane.CLAIM_SCAN_TTL_S):
                with self.subTest(stamp=stamp):
                    receipt = copy.deepcopy(good); receipt['summary']['sourceAt'] = stamp
                    self.assertFalse(lane.repair_inventory_valid(receipt, 'codex'))
            for key, value in (('repository', 'other/repo'), ('provider', 'other'), ('cacheKey', 'other'),
                               ('cacheRoot', 'other'), ('sameCallRows', False), ('prs', None)):
                with self.subTest(key=key):
                    receipt = {**good, key: value}
                    self.assertFalse(lane.repair_inventory_valid(receipt, 'codex'))
            for summary in (None, [], {**good['summary'], 'readable': False},
                            {**good['summary'], 'prs': [repair_inventory_pr()]}):
                self.assertFalse(lane.repair_inventory_valid({**good, 'summary': summary}, 'codex'))
            self.assertFalse(lane.repair_inventory_valid(None, 'codex'))
            for rows in ([None], [{**repair_inventory_pr(), 'labelsComplete': False}]):
                partial = {**good, 'prs': rows, 'summary': {**good['summary'], 'prs': rows}}
                self.assertFalse(lane.repair_inventory_valid(partial, 'codex'))
            for error in (OSError('offline'), ValueError('corrupt'), TypeError('malformed'), KeyError('prs')):
                with self.subTest(error=type(error).__name__), patch.object(lane, 'open_prs_summary', side_effect=error):
                    self.assertFalse(lane.repair_inventory_valid(lane.capture_repair_inventory('codex'), 'codex'))
            for paired in ([], [{'readable': True, 'sourceAt': now, 'prs': [repair_inventory_pr()]}]):
                def malformed(*, capture):
                    capture.extend(paired)
                    return []
                with patch.object(lane, 'open_prs_summary', side_effect=malformed):
                    self.assertFalse(lane.repair_inventory_valid(lane.capture_repair_inventory('codex'), 'codex'))

    def test_partial_bulk_read_cannot_borrow_previous_success_provenance(self):
        lane._SUMMARY.update(at=0, sourceAt=self.clock['now'], prs=[repair_inventory_pr()], readable=True)
        page = {'data': {'repository': {'pullRequests': {
            'nodes': [], 'pageInfo': {'hasNextPage': True, 'endCursor': 'more'}}}}}
        with patch.object(lane.time, 'time', return_value=self.clock['now']), \
                patch.object(lane, 'sh', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(page))) as shell:
            receipt = lane.capture_repair_inventory('codex')
        self.assertEqual(shell.call_count, 10)
        self.assertFalse(receipt['summary']['readable'])
        self.assertIsNone(receipt['summary']['sourceAt'])
        self.assertEqual(receipt['prs'], [])
        self.assertFalse((lane.SHARED_CACHE_DIR/'open-prs-labels-v2.json').exists())

    def test_supplied_repair_projection_does_not_refill_any_inventory_cache(self):
        providers = {'codex': {'enabled': True}, 'grok': {'enabled': True}}
        rows = [repair_inventory_pr()]
        with patch.object(lane, 'open_prs_summary', side_effect=AssertionError('unexpected reader')), \
                patch.object(lane, 'shared', side_effect=AssertionError('unexpected derived cache')), \
                patch.object(lane, 'load_providers', return_value=providers):
            self.assertEqual(lane.fix_candidates('grok', inventory=[]), [])
            with self.assertRaisesRegex(ValueError, 'supplied-inventory-fields'):
                lane.lane_prs('grok', fields=lane.PR_FIELDS, inventory=[])
            selected = lane.fix_candidates('grok', inventory=rows)
        self.assertEqual([pr['number'] for pr in selected], [999999])
        self.assertEqual(rows, [repair_inventory_pr()])

    def test_initial_repair_holds_release_both_locks_without_nested_idle_deadlock(self):
        ctx = multiprocessing.get_context('spawn')
        for scenario in ('unknown', 'stale', 'wait'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as tmp:
                output, done = ctx.Queue(), ctx.Event()
                release = ctx.Event(); release.set()
                entered, preclaim = ctx.Event(), ctx.Event()
                process = ctx.Process(target=repair_inventory_process, args=(
                    tmp, 'codex', entered, release, preclaim, done, output, scenario))
                try:
                    process.start(); process.join(8)
                    self.assertFalse(process.is_alive(), 'idle recording must occur after global lock release')
                    self.assertEqual(process.exitcode, 0)
                    row = output.get(timeout=2)
                    self.assertTrue(row['slotReleased'])
                    self.assertEqual(row['attempts'], {})
                    self.assertEqual(row['claimPublications'], 0)
                    self.assertEqual(row['idle']['codex']['reason'], 'repair-inventory-unknown-or-stale')
                    lock = lane.Locked(Path(tmp)/'claim.lock', blocking=False)
                    try: self.assertTrue(lock.held)
                    finally: lock.release()
                finally:
                    if process.is_alive(): process.terminate(); process.join(2)
                    output.close(); output.join_thread()

    def test_current_target_owner_and_local_preimage_fences_survive_inventory_move(self):
        ctx = multiprocessing.get_context('spawn')
        for scenario in ('positive-aged', 'head-changed', 'unknown-owner', 'local-changed'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as tmp:
                output, done = ctx.Queue(), ctx.Event()
                release = ctx.Event(); release.set()
                entered, preclaim = ctx.Event(), ctx.Event()
                process = ctx.Process(target=repair_inventory_process, args=(
                    tmp, 'grok', entered, release, preclaim, done, output, scenario))
                try:
                    process.start(); process.join(8)
                    self.assertFalse(process.is_alive()); self.assertEqual(process.exitcode, 0)
                    row = output.get(timeout=2)
                    if scenario == 'positive-aged':
                        self.assertEqual(row['claimPublications'], 1)
                        self.assertEqual(row['attempts']['999999']['count'], 1)
                        self.assertEqual(len(row['repairDispatch']), 1)
                    else:
                        self.assertEqual(row['claimPublications'], 0)
                        self.assertEqual(row['repairDispatch'], [])
                        self.assertEqual(row['attempts'].get('999999', {}).get('lane'),
                                         'other' if scenario == 'local-changed' else None)
                finally:
                    if process.is_alive(): process.terminate(); process.join(2)
                    output.close(); output.join_thread()

    def test_independent_same_key_readers_coalesce_the_bulk_fill(self):
        ctx = multiprocessing.get_context('spawn')
        entered, release, output = ctx.Event(), ctx.Event(), ctx.Queue()
        processes = []
        try:
            for name in ('codex', 'grok'):
                preclaim, done = ctx.Event(), ctx.Event()
                process = ctx.Process(target=repair_inventory_process, args=(
                    self.tmp.name, name, entered, release, preclaim, done, output, 'same-key'))
                process.start(); processes.append(process)
                if name == 'codex':
                    self.assertTrue(entered.wait(10))
                else:
                    self.assertTrue(preclaim.wait(10))
                    self.assertFalse(done.is_set(), 'same-key reader must await the existing fill')
            release.set()
            for process in processes:
                process.join(10)
                self.assertFalse(process.is_alive())
                self.assertEqual(process.exitcode, 0)
            rows = [output.get(timeout=2) for _ in processes]
            self.assertEqual(sum(len(row['fixtureReads']) for row in rows), 1)
            self.assertTrue(all(row['slotReleased'] and not row['attempts'] for row in rows))
        finally:
            release.set()
            for process in processes:
                process.join(2)
                if process.is_alive(): process.terminate(); process.join(2)
            output.close(); output.join_thread()

    def test_expired_bulk_fill_does_not_block_an_independent_cached_repair(self):
        ctx = multiprocessing.get_context('spawn')
        state = Path(self.tmp.name)
        cache = state/'cache'; cache.mkdir()
        (cache/'claim-fix-candidates-grok.json').write_text(json.dumps({
            'at': time.time(), 'value': [repair_inventory_pr()]}))
        entered, release, output = ctx.Event(), ctx.Event(), ctx.Queue()
        pre = {name: ctx.Event() for name in ('codex', 'grok')}
        done = {name: ctx.Event() for name in pre}
        processes = []
        try:
            for name in ('codex', 'grok'):
                process = ctx.Process(target=repair_inventory_process,
                    args=(str(state), name, entered, release, pre[name], done[name], output))
                process.start(); processes.append(process)
                if name == 'codex':
                    self.assertTrue(entered.wait(10), 'first worker must reach the offline bulk read')
                    contender = lane.Locked(state/'claim.lock', blocking=False)
                    try:
                        self.assertTrue(contender.held, 'bulk fill must run outside global claim.lock')
                    finally:
                        contender.release()
            self.assertTrue(pre['grok'].wait(10))
            self.assertTrue(done['grok'].wait(5), 'qualified cached repair must progress before bulk read release')
            self.assertEqual(json.loads((state/'fix-attempts.json').read_text())['999999']['count'], 1)
            release.set()
            for process in processes:
                process.join(10)
                self.assertFalse(process.is_alive(), 'bounded fixture must not leave a lock-hung process')
                self.assertEqual(process.exitcode, 0)
            rows = [output.get(timeout=2) for _ in processes]
            repair = next(row for row in rows if row['role'] == 'grok')
            self.assertEqual(repair['claimPublications'], 1)
            self.assertEqual(repair['repairDispatch'], [{'number': 999999, 'head': 'a'*40}])
            self.assertEqual(repair['attempts']['999999']['count'], 1)
            self.assertEqual(sum(len(row['fixtureReads']) for row in rows), 1)
        finally:
            release.set()
            for process in processes:
                process.join(2)
                if process.is_alive():
                    process.terminate(); process.join(2)  # Only this test's verified child.
            output.close(); output.join_thread()

    def setUp(self):
        budget = patch.object(lane.Linear, "_snapshot_budget_admitted", return_value=True)
        budget.start()
        self.addCleanup(budget.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.saved = (lane.SHARED_CACHE_DIR, os.environ.pop("LANES_EXECUTION_BACKEND", None), lane.sh,
                      lane.lane_prs, lane.repo_prs)
        self.saved_reclaimable = lane.reclaimable_drafts
        self.addCleanup(lambda: setattr(lane, "reclaimable_drafts", self.saved_reclaimable))
        lane.SHARED_CACHE_DIR = Path(self.tmp.name)
        self.summary = dict(lane._SUMMARY)
        lane._SUMMARY.update(at=0.0, prs=[], readable=False)
        self.clock = {"now": 1_700_000_000.0}
        self.counts = {"fix": 0, "flight": 0, "queued": 0}

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

        lane.lane_prs = lambda name, providers=None, fields="": self.counts.__setitem__("fix", self.counts["fix"] + 1) or [
            {"number": 1, "headRefName": "devin/jov-1-20260901", "isDraft": False}]
        lane.repo_prs = lambda: []
        lane.reclaimable_drafts = lambda: []

        def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
            if "--search" in args:
                self.counts["queued"] += 1
            else:
                self.counts["flight"] += 1
            return SimpleNamespace(returncode=0, stdout="[]")
        lane.sh = fake_sh

        def read_all():
            fixes = lane.fix_candidates("codex")
            flight = lane.in_flight_issues()
            queued = lane.pr_events.queued_prs(lane, ("red",))
            return fixes, flight, queued

        def inventory(_module):
            self.counts["queued"] += 1
            return []
        with patch.object(lane.time, "time", lambda: self.clock["now"]), \
                patch.object(lane.pr_events, "open_prs_state", side_effect=inventory):
            fixes, flight, queued = read_all()
            self.assertEqual(fixes[0]["number"], 1)
            self.assertEqual(flight, frozenset())
            self.assertEqual(queued, [])
            self.assertEqual(self.counts, {"fix": 1, "flight": 1, "queued": 1})
            read_all()
            self.assertEqual(self.counts, {"fix": 1, "flight": 1, "queued": 1},
                             "a second worker inside the TTL must not scan again")
            self.clock["now"] += lane.CLAIM_SCAN_TTL_S + 1
            read_all()
            self.assertEqual(self.counts, {"fix": 2, "flight": 2, "queued": 2})

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
                                                  "description": '```json\n{"schema": "summer.reasoning-job/v1"}\n```',
                                                  "createdAt": "1"}]}}
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
                hud.linear_model(Path("/x"))  # the HUD reads the local mirror, never Linear
                hud.linear_model(Path("/x"))
                self.assertEqual(calls, {"hud": 0, "reason": 1, "state": 1})
                self.clock["now"] += lane.CLAIM_SCAN_TTL_S + 1
                reason_lane.queued_jobs(client, "reasoning-job")
                lane.cached_issue_state(client, "JOV-9")
                hud.linear_model(Path("/x"))
                self.assertEqual(calls, {"hud": 0, "reason": 2, "state": 2})
        finally:
            hud.lane.Linear, hud.lane.SHARED_CACHE_DIR, reason_cache.SHARED_CACHE_DIR = saved


class HostHandoffAdmissionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))

    @staticmethod
    def routed_providers():
        return {
            "devin": {"tier": 0, "slots": 1, "model": "standard", "cmd": ["devin-test"],
                      "routes": [{"model": "standard", "capability": "standard", "cost": 0}]},
            "codex": {"tier": 1, "slots": 1, "model": "frontier", "cmd": ["codex-test"],
                      "routes": [{"model": "frontier", "capability": "frontier", "cost": 3}]},
            "claude": {"tier": 2, "slots": 1, "model": "sonnet", "cmd": ["claude-test", "{model}"],
                       "routes": [{"model": "sonnet", "capability": "standard", "cost": 1},
                                  {"model": "opus", "capability": "frontier", "cost": 2}]},
            "hyperagent": {"tier": 0, "slots": 1, "repairs": False, "cmd": ["remote-test"],
                           "routes": [{"model": "remote", "capability": "frontier", "cost": 0}]},
        }

    def test_issue_handoff_keeps_sensitive_and_codex_blocked_restrictions(self):
        providers = self.routed_providers()
        with patch.object(lane, "provider_healthy", return_value=True) as healthy:
            self.assertIsNone(lane.next_provider(self.host, {"codex"}, providers, issue=issue(labels=["auth"])))
            self.assertIsNone(lane.next_provider(self.host, set(), providers,
                                                issue=issue(labels=["auth", "codex-blocked"])))
            self.assertEqual(lane.next_provider(self.host, {"devin"}, providers,
                                                issue=issue(labels=["codex-blocked"]))[0], "claude")
        self.assertTrue(all(call.args[0] is providers["claude"] for call in healthy.call_args_list))

    def test_frontier_handoff_selects_a_frontier_model_without_mutating_the_catalog(self):
        providers = self.routed_providers()
        with patch.object(lane, "provider_healthy", return_value=True):
            name, spec = lane.next_provider(self.host, {"codex"}, providers, issue=issue(labels=["route:frontier"]))
        self.assertEqual((name, spec["model"]), ("claude", "opus"))
        self.assertEqual(spec["route"]["required"], "frontier")
        self.assertEqual(providers["claude"]["model"], "sonnet")
        self.assertEqual(lane.template(spec["cmd"], {"model": spec["model"]}), ["claude-test", "opus"])

    def test_handoff_requires_proven_route_capability(self):
        providers = {"devin": {"slots": 1, "model": "unknown", "cmd": ["devin-test"]}}
        with patch.object(lane, "provider_healthy", return_value=True):
            self.assertIsNone(lane.next_provider(self.host, set(), providers, issue=issue()))

    def test_handoff_cannot_drop_the_initial_floor_when_policy_is_unreadable(self):
        providers = self.routed_providers()
        with patch.object(lane, "provider_healthy", return_value=True), \
                patch.object(lane, "read_json", return_value={}):
            name, spec = lane.next_provider(self.host, {"codex"}, providers, issue=issue(),
                                            minimum_capability="frontier")
            self.assertEqual((name, spec["model"]), ("claude", "opus"))
            self.assertEqual(spec["route"]["required"], "frontier")
            self.assertIsNone(lane.next_provider(self.host, {"codex", "claude"}, providers,
                                                issue=issue(), minimum_capability="frontier"))
            self.assertIsNone(lane.next_provider(self.host, set(), providers,
                                                issue=issue(), minimum_capability="unknown"))

    def test_issue_handoff_preserves_live_availability_and_remote_only_exclusions(self):
        for mode in ("disabled", "no-slots", "remote-only", "quota", "cooling", "unhealthy", "saturated"):
            with self.subTest(mode=mode):
                providers = self.routed_providers()
                spec = providers["claude"]
                if mode == "disabled":
                    spec["enabled"] = False
                if mode == "no-slots":
                    spec["slots"] = 0
                if mode == "remote-only":
                    spec["repairs"] = False
                if mode == "quota":
                    spec["quota"] = {"source": "ledger", "maxRuns": 0}
                with patch.object(lane, "provider_healthy", return_value=mode != "unhealthy"), \
                        patch.object(lane, "cooling", side_effect=lambda host, name: mode == "cooling" and name == "claude"), \
                        patch.object(lane, "slot_free", return_value=mode != "saturated"):
                    self.assertIsNone(lane.next_provider(self.host, {"codex"}, providers,
                                                        issue=issue(labels=["route:frontier"])))

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

    def test_prior_session_context_reaches_spawned_prompt_and_bound_manifest(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
        task = issue("JOV-4302", labels=["ws:memory-gbrain"])
        previous = {"schema": "jovie-lane-run/v1", "repository": lane.REPO_SLUG,
                    "issue": task.identifier, "runId": "earlier-session", "headSha": "prior-sha"}
        runs = self.host.state / "runs"
        runs.mkdir()
        (runs / "ledger.jsonl").write_text(json.dumps(previous) + "\n")
        with patch.object(lane, "run_agent", return_value=SimpleNamespace(returncode=0)) as agent:
            receipt = lane.run_issue(self.host, "codex", {"cmd": ["agent", "{prompt_file}"]}, FakeLinear([]), task)
        prompt = Path(agent.call_args.args[0][1]).read_text()
        self.assertIn("earlier-session", prompt)
        context = json.loads(Path(receipt["contextManifests"][0]["path"]).read_text())
        self.assertEqual(context["inputs"]["prior_attempts"]["status"], "present")
        self.assertEqual(receipt["workstream"], "memory-gbrain")

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

    def test_issue_cleanup_keeps_the_branch_when_its_worktree_is_retained(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": []}
        with patch.object(lane, "remove_worktree", return_value=False), \
                patch.object(lane, "sh", wraps=lane.sh) as shell:
            lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        self.assertFalse(any(call.args[0][:3] == ["git", "branch", "-D"]
                             for call in shell.call_args_list))

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

        def nxt(host, exclude, providers=None, **kwargs):
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

    def test_real_handoff_router_never_downgrades_sensitive_or_frontier_work(self):
        providers = HostHandoffAdmissionTest.routed_providers()
        providers.pop("claude")
        seen = []

        def agent(cmd, cwd, *args, **kwargs):
            seen.append((cmd[0], cwd))
            (cwd / "partial.py").write_text("preserve_partial_source = True\n")
            return SimpleNamespace(returncode=75 if cmd[0] == "codex-test" else 0)

        for index, labels in enumerate((["auth"], ["route:frontier"], [], [])):
            with self.subTest(labels=labels):
                seen.clear()
                initial = {**providers["codex"], **({"route": {"required": "frontier"}} if index == 2 else {})}
                lane.verify_and_land = lambda *a, **k: {"verdict": "landing" if len(seen) > 1 else "no-change", "reasons": []}
                with patch.object(lane, "next_provider", side_effect=self.real_next), \
                        patch.object(lane, "load_providers", return_value=providers), \
                        patch.object(lane, "provider_healthy", return_value=True), \
                        patch.object(lane, "run_agent", side_effect=agent):
                    receipt = lane.run_issue(self.host, "codex", initial, FakeLinear([]),
                                             issue(f"JOV-{90 + index}", labels=labels))
                if labels or index == 2:
                    self.assertEqual([name for name, _ in seen], ["codex-test"])
                    self.assertEqual(receipt["verdict"], "provider-error")
                    self.assertNotIn("handoffs", receipt)
                    self.assertTrue((Path(receipt["worktree"]) / "partial.py").exists())
                else:
                    self.assertEqual([name for name, _ in seen], ["codex-test", "devin-test"])
                    self.assertEqual(seen[0][1], seen[1][1])
                    self.assertEqual((receipt["verdict"], receipt["finishedBy"]), ("landing", "devin"))

    def test_frontier_floor_applies_again_after_the_first_handoff_fails(self):
        providers = HostHandoffAdmissionTest.routed_providers()
        providers["sakana"] = {"tier": 3, "slots": 1, "cmd": ["sakana-test"],
                               "routes": [{"model": "standard", "capability": "standard", "cost": 4}]}
        seen = []

        def agent(cmd, *args, **kwargs):
            seen.append(cmd)
            return SimpleNamespace(returncode=75)

        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": []}
        with patch.object(lane, "next_provider", side_effect=self.real_next), \
                patch.object(lane, "load_providers", return_value=providers), \
                patch.object(lane, "provider_healthy", return_value=True), \
                patch.object(lane, "run_agent", side_effect=agent):
            receipt = lane.run_issue(self.host, "codex", providers["codex"], FakeLinear([]),
                                     issue(labels=["route:frontier"]))
        self.assertEqual(seen, [["codex-test"], ["claude-test", "opus"]])
        self.assertEqual(len(receipt["handoffs"]), 1)
        self.assertEqual(receipt["verdict"], "provider-error")

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
        lane.next_provider = lambda host, exclude, providers=None, **kwargs: (next(order), {"cmd": ["false"]})
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
                  "mergedAt": "2026-09-28T11:00:00Z", "headRefOid": "a" * 40}
        receipts = [
            {"runId": "create", "issue": "JOV-9", "pr": 9, "provider": "devin",
             "schema": "jovie-lane-run/v1", "origin": "autonomous-lane", "headSha": "a" * 40,
             "attribution": {"category": "autonomous-created", "originProvider": "devin",
                             "finalProvider": "devin"}, "startedAt": "2026-09-28T10:00:00Z"},
            {"schema": "jovie-lane-run/v1", "origin": "autonomous-lane", "runId": "review",
             "kind": "adopt", "pr": 9, "provider": "codex", "headSha": "a" * 40,
             "attribution": {"category": "review-only", "provider": "codex"},
             "endedAt": "2026-09-28T10:30:00Z"},
            {"schema": "jovie-lane-run/v1", "origin": "autonomous-lane", "runId": "fix",
             "kind": "fix-red", "pr": 9, "provider": "codex", "verdict": "fix-pushed",
             "headAfter": "a" * 40, "attribution": {"category": "autonomous-remediation",
                                                        "provider": "codex"},
             "endedAt": "2026-09-28T10:45:00Z"},
        ]
        attributed = lane.pr_attribution(merged, receipts)
        self.assertEqual(attributed["category"], "cross-provider-finalizer")
        self.assertEqual((attributed["origin"], attributed["originProvider"], attributed["finalProvider"]),
                         ("autonomous-lane", "devin", "codex"))
        self.assertEqual(attributed["confidence"], "verified")

    def test_unreceipted_codex_branches_remain_unknown(self):
        recent = {"number": 1, "headRefName": "codex/manual", "createdAt": "2026-09-28T10:00:00Z",
                  "mergedAt": "2026-09-28T11:00:00Z", "headRefOid": "a" * 40}
        old = {**recent, "number": 2, "createdAt": "2026-09-20T10:00:00Z"}
        self.assertEqual(lane.pr_attribution(recent, [])["category"], "unknown")
        self.assertEqual(lane.pr_attribution(old, [])["category"], "unknown")
        self.assertNotEqual(lane.pr_attribution(recent, [])["origin"], "autonomous-lane")

    def test_provider_metrics_count_only_receipted_origin_as_landed_output(self):
        rows = [{"schema": "jovie-lane-run/v1", "origin": "autonomous-lane", "runId": "r",
                 "issue": "JOV-9", "pr": 9, "provider": "codex", "agentExit": 0,
                 "headSha": "a" * 40,
                 "attribution": {"category": "autonomous-created", "originProvider": "codex",
                                 "finalProvider": "codex"},
                 "startedAt": "2026-09-28T10:00:00Z", "endedAt": "2026-09-28T10:10:00Z",
                 "verdict": "landing", "execution": {"event": "attempt_finished"},
                 "providerEvidence": [{"provider": "codex", "event": "account-leased"}]}]
        merged = [{"number": 9, "headRefName": "codex/jov-9-x", "createdAt": "2026-09-28T10:00:00Z",
                   "mergedAt": "2026-09-28T10:30:00Z", "headRefOid": "a" * 40},
                  {"number": 10, "headRefName": "codex/manual", "createdAt": "2026-09-28T10:00:00Z",
                   "mergedAt": "2026-09-28T10:20:00Z", "headRefOid": "b" * 40}]
        report = lane.provider_throughput(rows, ["codex", "devin"], merged)
        codex = report["providers"]["codex"]
        self.assertEqual((codex["eligibleWorkOffered"], codex["workerStarts"], codex["productiveRuns"],
                          codex["prsCreated"], codex["firstPassGreen"], codex["accountLeases"],
                          codex["landedOutput"]), (1, 1, 1, 1, 1, 1, 1))
        self.assertEqual(codex["issueToPrSecondsP50"], 600)
        self.assertEqual(codex["issueToMergeSecondsP50"], 1800)
        self.assertEqual(report["landedByAttribution"],
                         {"autonomous-created": 1, "unknown": 1})


class MaintenanceDemandTest(unittest.TestCase):
    def test_explicit_summary_pair_cannot_borrow_later_global_demand_metadata(self):
        rows = [self.pr()]
        paired = {'at': self.now, 'sourceAt': self.now, 'prs': rows, 'readable': True}
        forged = {'at': self.now+100, 'sourceAt': self.now+100, 'prs': [], 'readable': True}
        with patch.object(lane, '_SUMMARY', forged), patch.object(lane, 'load_providers', return_value=self.providers):
            lane.record_maintenance_demand(self.host, 'devin', rows, rows, [], set(), summary=paired)
            self.assertEqual(json.loads((self.host.state/'maintenance-demand.json').read_text())['lanes']['devin']['pending'], 1)
            lane.record_maintenance_demand(self.host, 'devin', rows, rows, [], set(), summary={**paired, 'readable': False})
        row = json.loads((self.host.state/'maintenance-demand.json').read_text())['lanes']['devin']
        self.assertIsNone(row['pending'])
        self.assertEqual(row['observedAt'], self.now)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))
        self.providers = {"devin": {"slots": 4}, "codex": {"slots": 3}}
        self.now = time.time()
        claims = patch.object(lane, "_CLAIM_OBSERVATIONS", {})
        claims.start()
        self.addCleanup(claims.stop)

    def pr(self, number=7, **over):
        row = {"number": number, "headRefOid": f"h{number}", "headRefName": f"devin/jov-{number}-20261010",
               "isDraft": False, "isInMergeQueue": False, "isCrossRepository": False, "labels": [],
               "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "FAILURE"}]}
        row.update(over)
        return row

    def census(self, rows, *, selected=None, readable=True, source_at=None, provider="devin", current=None):
        summary = {"at": self.now, "sourceAt": self.now if source_at is None else source_at,
                   "readable": readable, "prs": rows if current is None else current}
        with patch.object(lane, "_SUMMARY", summary), patch.object(lane, "load_providers", return_value=self.providers), \
                patch.object(lane, "sh", side_effect=AssertionError("census must not call an API")), \
                patch.object(lane, "claimed_elsewhere", side_effect=AssertionError("no per-PR remote reads")), \
                patch.object(lane, "preserved_run", side_effect=AssertionError("no per-PR recovery qualification")):
            lane.record_maintenance_demand(self.host, provider, rows, rows, rows, selected or set())
        return json.loads((self.host.state / "maintenance-demand.json").read_text())["lanes"][provider]

    def test_positive_demand_is_deduplicated_and_selected_work_is_excluded(self):
        self.assertEqual(self.census([self.pr(), self.pr()])["pending"], 1)
        self.assertIsNone(self.census([self.pr()], selected={7})["pending"])
        self.assertEqual(self.census([])["pending"], 0)

    def test_census_reports_known_blockers_without_inventing_total_zero(self):
        sample = self.census([self.pr(isInMergeQueue=True)])
        self.assertIsNone(sample["pending"])
        self.assertEqual(sample["ordinaryPrPending"], 0)
        self.assertEqual(sample["blockedByReason"], {"queued": 1})
        self.assertEqual(sample["dispositions"], {"7": "queued"})
        self.assertEqual(sample["unknownByReason"], {})
        self.assertFalse(sample["projectionComplete"])
        self.assertIn("labeled-remediation-events", sample["unmeasuredClasses"])

    def test_census_names_stale_inventory_and_retains_positive_lower_bound(self):
        sample = self.census([self.pr()], readable=False)
        self.assertEqual(sample["unknownByReason"], {"maintenance-inventory-unknown": 1})
        sample = self.census([self.pr(), self.pr(8)], current=[self.pr(), self.pr(8, headRefOid="new")])
        self.assertEqual(sample["pending"], 1)
        self.assertIsNone(sample["ordinaryPrPending"])
        self.assertEqual(sample["byKind"], {"repair": 1})
        self.assertEqual(sample["unknownByReason"], {"maintenance-current-metadata-unknown": 1})

    def test_missing_test_is_repair_demand_but_not_adoption_permission(self):
        held = {"7": lane.pr_events.held_record("h7", ["code-change-without-test"])}
        (self.host.state / "held.json").write_text(json.dumps(held))
        self.assertEqual(self.census([self.pr()])["pending"], 1)
        self.assertEqual(lane.gate_disposition(self.pr(isDraft=True), held, {}), "existing-gate-hold")

    def test_native_resource_ownership_and_integrity_dispositions_are_not_demand(self):
        for change in ({"labels": [{"name": "hold"}]}, {"isInMergeQueue": True},
                       {"isCrossRepository": True}, {"headRefName": "dependabot/npm/bump"}):
            with self.subTest(change=change):
                self.assertIsNone(self.census([self.pr(**change)])["pending"])
        for record in ({"sha": "h7", "count": 1, "at": self.now},
                       {"sha": "h7", "count": lane.MAX_FIX_ATTEMPTS, "at": self.now, "endedAt": "ended"}):
            (self.host.state / "fix-attempts.json").write_text(json.dumps({"7": record}))
            self.assertIsNone(self.census([self.pr()])["pending"])
        (self.host.state / "fix-attempts.json").unlink()
        (self.host.state / "held.json").write_text(json.dumps({"7": lane.pr_events.held_record("h7", ["secret-like-file-changed"])}))
        self.assertIsNone(self.census([self.pr()])["pending"])

    def test_unreadable_stale_and_corrupt_samples_are_unknown(self):
        self.assertIsNone(self.census([self.pr()], readable=False)["pending"])
        self.assertIsNone(self.census([self.pr()], source_at=self.now - lane.MAINTENANCE_DEMAND_MAX_AGE_S - 1)["pending"])
        # Gem 2026-10-11: a shared-cache hit near its 60 s expiry, held in the process summary and
        # then scanned, published "unknown" for codex over 45 candidates.
        self.assertEqual(self.census([self.pr()], source_at=self.now - 2 * lane.SUMMARY_TTL_S + 5)["pending"], 1)
        (self.host.state / "held.json").write_text("[]")
        self.assertIsNone(self.census([self.pr()])["pending"])

    def test_preserved_target_is_withheld_without_touching_the_checkout(self):
        path = self.host.state / "worktrees/20261010T172237Z-PR7-codex-fix-f5bb6d"
        path.mkdir(parents=True)
        marker = path / lane.disk_guard.PRESERVED_REPAIR
        raw = json.dumps({"pr": 7, "runId": path.name})
        marker.write_text(raw)
        self.assertIsNone(self.census([self.pr()])["pending"])
        self.assertEqual(marker.read_text(), raw)

    def test_cleanup_preserved_issue_checkout_keeps_repair_demand_known(self):
        # 2026-10-11 on Gem: four issue-run checkouts preserved by cleanup carried
        # {"pr": null, "issue": null}; every lane published pending=null and stayed at its floor.
        legacy = self.host.state / "worktrees/20261010T104030Z-JOV-8157-codex-64d65a"
        legacy.mkdir(parents=True)
        (legacy / lane.disk_guard.PRESERVED_REPAIR).write_text(json.dumps({"pr": None, "issue": None}))
        self.assertEqual(self.census([self.pr()])["pending"], 1)
        repair = self.host.state / "worktrees/20261011T000000Z-PR7-codex-fix-bb"
        repair.mkdir()
        (repair / lane.disk_guard.PRESERVED_REPAIR).write_text(json.dumps({"pr": None, "issue": None}))
        self.assertIsNone(self.census([self.pr()])["pending"], "a preserved PR checkout is still withheld")
        repair.joinpath(lane.disk_guard.PRESERVED_REPAIR).unlink()
        unnamed = self.host.state / "worktrees/scratch"
        unnamed.mkdir()
        (unnamed / lane.disk_guard.PRESERVED_REPAIR).write_text(json.dumps({"pr": None, "issue": None}))
        self.assertIsNone(self.census([self.pr()])["pending"], "an unattributable marker stays unknown")

    def test_one_racing_row_leaves_proven_demand_as_a_lower_bound(self):
        # 2026-10-11 on Gem: demand flapped to null whenever one candidate's head differed from
        # the summary cache, so autoscale held repairs at the floor despite real red PRs.
        moved = self.pr(8)
        self.assertEqual(self.census([self.pr(), moved], current=[self.pr(), self.pr(8, headRefOid="moved")])["pending"], 1)
        self.assertIsNone(self.census([moved], current=[self.pr(8, headRefOid="moved")])["pending"],
                          "with nothing proven, a racing row is still unknown, never zero")

    def test_current_metadata_overrules_stale_candidates_at_the_same_head(self):
        for change in ({"labels": [{"name": "hold"}]}, {"isInMergeQueue": True},
                       {"statusCheckRollup": [{"status": "IN_PROGRESS", "conclusion": None}]}):
            with self.subTest(change=change):
                self.assertIsNone(self.census([self.pr()], current=[self.pr(**change)])["pending"])
        for key in ("isDraft", "isCrossRepository", "isInMergeQueue", "headRefName", "labels", "statusCheckRollup"):
            row = self.pr()
            del row[key]
            with self.subTest(missing=key):
                self.assertIsNone(self.census([row])["pending"])

    def test_malformed_accounting_and_disabled_or_claimed_work_is_unknown(self):
        path = self.host.state / "fix-attempts.json"
        for record in ({"sha": "h7", "count": -999}, {"count": 1},
                       {"sha": "h7", "count": True}, {"sha": "h7", "at": "bad"},
                       {"sha": "h7", "count": 1, "at": self.now, "endedAt": True},
                       {"sha": "h7", "count": 1, "at": self.now, "endedAt": {}},
                       {"sha": "oldhead", "count": 2, "at": self.now - 60, "endedAt": self.now - 1,
                        "pushed": True, "pushedHead": True},
                       {"sha": "oldhead", "count": 2, "at": self.now - 60, "endedAt": self.now - 1,
                        "pushed": True, "pushedHead": None}):
            path.write_text(json.dumps({"7": record}))
            self.assertIsNone(self.census([self.pr()])["pending"])
        path.unlink()
        lane._CLAIM_OBSERVATIONS[(7, "h7", "fix")] = {"active": True, "at": self.now}
        self.assertIsNone(self.census([self.pr()])["pending"])
        lane._CLAIM_OBSERVATIONS.clear()
        self.providers["devin"]["enabled"] = False
        self.assertIsNone(self.census([self.pr()])["pending"])

    def test_green_review_event_is_pending_only_while_current_label_remains(self):
        row = self.pr(eventKinds=["review"], labels=[{"name": lane.pr_events.PREFIX + "review"}],
                      statusCheckRollup=[{"status": "COMPLETED", "conclusion": "SUCCESS"}])
        self.assertEqual(self.census([row])["pending"], 1)
        self.assertIsNone(self.census([row], current=[{**row, "labels": []}])["pending"])

    def test_null_preserved_marker_and_malformed_hold_are_unknown(self):
        directory = self.host.state / "worktrees/run-PR7-codex-fix"
        directory.mkdir(parents=True)
        marker = directory / lane.disk_guard.PRESERVED_REPAIR
        marker.write_text("null")
        self.assertIsNone(self.census([self.pr()])["pending"])
        marker.unlink()
        (self.host.state / "held.json").write_text(json.dumps({"7": {
            "sha": "h7", "evidence": "secret-like-file-changed", "next_action": "bug-intake"}}))
        self.assertIsNone(self.census([self.pr()])["pending"])

    def test_dequeued_only_event_waits_for_existing_sync(self):
        row = self.pr(eventKinds=["dequeued"], labels=[{"name": lane.pr_events.PREFIX + "dequeued"}],
                      mergeStateStatus="CLEAN", statusCheckRollup=[{"status": "COMPLETED", "conclusion": "SUCCESS"}])
        self.assertIsNone(self.census([row])["pending"])
        (self.host.state / "synced.json").write_text(json.dumps({"7": "existing-sync"}))
        self.assertEqual(self.census([row])["pending"], 1)

    def test_conflicting_preserved_marker_withholds_both_targets(self):
        path = self.host.state / "worktrees/run-PR7-codex-fix"
        path.mkdir(parents=True)
        (path / lane.disk_guard.PRESERVED_REPAIR).write_text(json.dumps({"pr": 8}))
        self.assertIsNone(self.census([self.pr(), self.pr(8)])["pending"])

    def test_observation_refuses_special_symlink_and_oversized_evidence(self):
        directory = self.host.state / "worktrees/run-PR8-codex-fix"
        directory.mkdir(parents=True)
        marker = directory / lane.disk_guard.PRESERVED_REPAIR
        os.mkfifo(marker)
        try:
            self.assertIsNone(self.census([self.pr()], selected={7})["pending"])
        finally:
            marker.unlink()
        target = self.host.state / "elsewhere.json"
        target.write_text('{"pr": 8}')
        marker.symlink_to(target)
        self.assertIsNone(self.census([self.pr()])["pending"])
        marker.unlink()
        marker.write_text(" " * 16385)
        self.assertIsNone(self.census([self.pr()])["pending"])
        marker.unlink()
        attempts = self.host.state / "fix-attempts.json"
        os.mkfifo(attempts)
        self.assertIsNone(self.census([self.pr()])["pending"])
        attempts.unlink()
        demand = self.host.state / "maintenance-demand.json"
        demand.unlink()
        os.mkfifo(demand)
        self.census_without_publication([self.pr()])
        self.assertTrue(demand.exists())

    def census_without_publication(self, rows):
        with patch.object(lane, "_SUMMARY", {"at": self.now, "sourceAt": self.now, "readable": True, "prs": rows}), \
                patch.object(lane, "load_providers", return_value=self.providers):
            lane.record_maintenance_demand(self.host, "devin", rows, rows, [], set())

    def test_summary_timestamp_cannot_certify_different_cache_rows(self):
        cache = self.host.state / "open-prs-labels-v2.json"
        old = self.pr(rollup="FAILURE")
        newer = self.pr(rollup="FAILURE", labels=[{"name": "hold"}])
        summary = {"at": 0, "prs": [], "readable": False}
        with patch.object(lane, "_SUMMARY", summary), patch.object(lane, "SHARED_CACHE_DIR", self.host.state), \
                patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "mesh"}):
            for rows, expected in (([newer], None), ([old], self.now - 40)):
                cache.write_text(json.dumps({"at": self.now - 40, "value": rows}))
                summary["at"] = 0
                with patch.object(lane, "shared", return_value=[dict(old)]):
                    lane.open_prs_summary()
                self.assertEqual(summary["sourceAt"], expected)

    def test_marker_scan_has_an_entry_budget_and_does_not_refresh_inventory_age(self):
        for number in range(257):
            (self.host.state / "worktrees" / str(number)).mkdir(parents=True)
        self.assertIsNone(self.census([self.pr()])["pending"])
        shutil.rmtree(self.host.state / "worktrees")
        row = self.census([self.pr()], source_at=self.now - 40)
        self.assertEqual(row["observedAt"], self.now - 40)

    def test_implementation_only_provider_never_counts_adoption_only_work(self):
        self.assertIsNone(self.census([self.pr(isDraft=True, statusCheckRollup=[])], provider="codex")["pending"])


class WorkerTest(unittest.TestCase):
    def test_joined_idle_refresh_preserves_expired_same_lane_legacy_but_refuses_foreign_or_active(self):
        # Real worker and every repair selector/classifier/planner. An expired
        # legacy lease lacks endedAt; that is ordinary scope, not a new transfer.
        cases = [("same-expired", "codex", False, True),
                 ("foreign-missing-ended", "grok", False, False),
                 ("same-active", "codex", True, False),
                 ("same-expired-floor-model", "codex", False, False)]
        cases += [(fault, "grok", False, False) for fault in (
            "foreign-manual", "foreign-wrong-branch", "foreign-wrong-owner",
            "foreign-reversed-lease", "foreign-missing-start", "foreign-fork", "foreign-missing-draft")]
        for case, name, active, expected_rerun in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp)); now = 100000.0
                providers = {"codex": {"enabled": True, "tier": 0, "slots": 1},
                             "grok": {"enabled": True, "tier": 1, "slots": 1}}
                pr = {"number": 7, "state": "OPEN", "headRefOid": "head-A",
                      "headRefName": "codex/jov-7-20261016", "isDraft": True,
                      "isCrossRepository": False, "isInMergeQueue": False,
                      "mergeStateStatus": "BLOCKED", "labels": [], "labelsComplete": True,
                      "statusCheckRollup": [{"name": "test", "status": "COMPLETED",
                          "conclusion": "TIMED_OUT",
                          "detailsUrl": "https://github.com/JovieInc/Jovie/actions/runs/123"}]}
                record = {"sha": "head-A", "lane": "codex", "count": 2,
                          "at": now if active else 100, "repairBranch": pr["headRefName"],
                          "repairVerdict": "fix-no-change",
                          "escalations": [{"kind": "deterministic", "rung": "update-branch", "head": "head-A"}],
                          "pendingEscalation": {"lane": name, "head": "head-A", "dossier": "existing evidence",
                              "cls": "needs-rebase", "subtype": "semantic", "topRung": name == "codex"}}
                if case.startswith("foreign-") and case != "foreign-missing-ended":
                    record["endedAt"] = 200
                if case == "foreign-manual":
                    pr["headRefName"] = "manual/feature"; record["repairBranch"] = pr["headRefName"]
                if case == "foreign-wrong-branch": record["repairBranch"] = "codex/jov-8-20261016"
                if case == "foreign-wrong-owner": record["lane"] = "grok"
                if case == "foreign-reversed-lease": record["at"] = 201
                if case == "foreign-missing-start": record.pop("at")
                if case == "foreign-fork": pr["isCrossRepository"] = True
                if case == "foreign-missing-draft": pr.pop("isDraft")
                floor_model = case == "same-expired-floor-model"
                if floor_model: pr["statusCheckRollup"][0]["conclusion"] = "FAILURE"
                path = host.state / "fix-attempts.json"; path.write_text(json.dumps({"7": record}))
                ordinary = [pr] if name == "codex" else []
                effects = []
                def transport(args, **kwargs):
                    self.assertEqual(args, ["gh", "run", "rerun", "123", "--failed", "--repo", "JovieInc/Jovie"])
                    effects.append(args)
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                with contextlib.ExitStack() as stack:
                    stack.enter_context(patch.dict(os.environ, {"LANES_ESCALATION": "1", "LANES_ESCALATION_STUCK_PRS": "1"}))
                    stack.enter_context(patch.object(host, "intake_slots", return_value=0 if floor_model else 1))
                    stack.enter_context(patch.object(lane, "load_providers", return_value=providers))
                    stack.enter_context(patch.object(lane, "_SUMMARY", {"at": now, "sourceAt": now, "readable": True, "prs": [pr]}))
                    stack.enter_context(patch.object(lane, "_CLAIM_OBSERVATIONS", {}))
                    stack.enter_context(patch.object(lane.time, "time", return_value=now))
                    event = stack.enter_context(patch.object(lane.pr_events, "claim_event_pr", wraps=self.saved[13]))
                    escalation = stack.enter_context(patch.object(lane, "claim_escalation_pr", wraps=lane.claim_escalation_pr))
                    polling = stack.enter_context(patch.object(lane, "claim_red_pr", wraps=self.saved[4]))
                    stack.enter_context(patch.object(lane, "claim_adoptable_pr", wraps=self.saved[6]))
                    planner = stack.enter_context(patch.object(lane, "escalate_exhausted", wraps=self.saved[11]))
                    stack.enter_context(patch.object(lane, "fix_candidates", return_value=ordinary))
                    stack.enter_context(patch.object(lane, "lane_prs", return_value=ordinary))
                    stack.enter_context(patch.object(lane, "reconcile_fix_target", side_effect=lambda _: copy.deepcopy(pr)))
                    stack.enter_context(patch.object(lane, "cooling", return_value=False))
                    stack.enter_context(patch.object(lane, "provider_healthy", return_value=True))
                    stack.enter_context(patch.object(lane, "observe_repair_provider_health", return_value=True))
                    shell = stack.enter_context(patch.object(lane, "sh", side_effect=transport))
                    stack.enter_context(patch.object(lane.pr_events, "conditional_page", return_value=[]))
                    stack.enter_context(patch.object(lane.pr_events, "etag_cache_dir", return_value=None))
                    labels = stack.enter_context(patch.object(lane.pr_events, "add_label"))
                    stack.enter_context(patch.object(lane.pr_events, "capture_target_file_witnesses", return_value={}))
                    stack.enter_context(patch.object(lane.pr_events, "cleanup_one_event"))
                    stack.enter_context(patch.object(lane.disk_guard, "check", return_value={"admitted": True}))
                    stack.enter_context(patch.object(lane.bindings, "work", return_value=None))
                    stack.enter_context(patch.object(lane, "requeue_verified"))
                    stack.enter_context(patch.object(lane, "record_maintenance_demand"))
                    stack.enter_context(patch.object(lane, "publish_exhausted_repairs"))
                    stack.enter_context(patch.object(lane, "sweep_execution_statuses"))
                    stack.enter_context(patch.object(lane, "revisit_terminal_prs"))
                    stack.enter_context(patch.object(lane, "read_new_issue_budget", return_value={"allowed": False, "reason": "fixture"}))
                    new_work = stack.enter_context(patch.object(lane, "run_issue"))
                    self.assertEqual(lane.worker(host, name), 0)
                event.assert_called_once(); escalation.assert_called_once(); polling.assert_called_once()
                planner.assert_called_once()
                self.assertEqual(planner.call_args.kwargs.get("joined_rungs"), frozenset({7}))
                self.assertEqual(len(effects), int(expected_rerun))
                if floor_model: labels.assert_called_once_with(7, "escalating", shell)
                else: labels.assert_not_called()
                new_work.assert_not_called()
                after = json.loads(path.read_text())["7"]
                self.assertEqual(after["count"], record["count"])
                if floor_model:
                    self.assertEqual(after["pendingEscalation"]["lane"], "grok")
                    self.assertEqual(after["pendingEscalation"]["cls"], "fixable-by-model")
                    self.assertEqual(after["pendingEscalation"]["subtype"], "check")
                    self.assertEqual(after["pendingEscalation"]["head"], "head-A")
                    self.assertEqual({k: v for k, v in after.items() if k != "pendingEscalation"},
                                     {k: v for k, v in record.items() if k != "pendingEscalation"})
                else:
                    self.assertEqual(after["pendingEscalation"], record["pendingEscalation"])
                if "endedAt" not in record: self.assertNotIn("endedAt", after)
                if expected_rerun:
                    self.assertEqual(after["escalations"][:-1], record["escalations"])
                    self.assertEqual(after["escalations"][-1]["rung"], "rerun")
                elif not floor_model:
                    self.assertEqual(after, record)

    def test_joined_rung_idle_planner_respects_canonical_fix_gate_and_unknown_custody(self):
        # Insert in WorkerTest. Preserve real worker, selector, classifier, planner,
        # canonical claim parser, and real no-client mode; mock only I/O/unrelated work.
        for owner in ("fix", "gate", "unreadable", "unowned"):
            for floor in (False, True):
                with self.subTest(owner=owner, maintenance_only=floor), tempfile.TemporaryDirectory() as tmp:
                    host = lane.Host(state=Path(tmp))
                    now = 100000.0
                    providers = {"codex": {"enabled": True, "tier": 0, "slots": 1},
                                 "grok": {"enabled": True, "tier": 1, "slots": 1}}
                    pr = {"number": 7, "state": "OPEN", "headRefOid": "head-A",
                          "headRefName": "codex/jov-7-20261016", "isDraft": True,
                          "isCrossRepository": False, "isInMergeQueue": False,
                          "mergeStateStatus": "BLOCKED", "labels": [], "labelsComplete": True,
                          "statusCheckRollup": [{"name": "test", "status": "COMPLETED",
                              "conclusion": "TIMED_OUT",
                              "detailsUrl": "https://github.com/JovieInc/Jovie/actions/runs/123"}]}
                    record = {"sha": "head-A", "lane": "codex", "count": 2, "at": 100,
                              "endedAt": 200, "repairBranch": pr["headRefName"],
                              "repairVerdict": "fix-no-change",
                              "escalations": [{"kind": "deterministic", "rung": "update-branch", "head": "head-A"}],
                              "pendingEscalation": {"lane": "grok", "head": "head-A", "dossier": "existing evidence",
                                  "cls": "needs-rebase", "subtype": "semantic", "topRung": False}}
                    path = host.state / "fix-attempts.json"
                    path.write_text(json.dumps({"7": record}))
                    comments = ([{"body": f"🤖 lane claim kind={owner} sha=head-A host=other-host at=1970-01-02T03:46:40Z"}]
                                if owner in {"fix", "gate"} else [])
                    effects = []
                    def transport(args, **kwargs):
                        if args[:3] == ["gh", "api", "--paginate"]:
                            self.assertEqual(owner, "unreadable")
                            return SimpleNamespace(returncode=1, stdout="", stderr="fixture-unreadable")
                        self.assertEqual(args, ["gh", "run", "rerun", "123", "--failed", "--repo", "JovieInc/Jovie"])
                        effects.append(args)
                        return SimpleNamespace(returncode=0, stdout="", stderr="")
                    summary = {"at": now, "sourceAt": now, "readable": True, "prs": [pr]}
                    with contextlib.ExitStack() as stack:
                        stack.enter_context(patch.dict(os.environ, {'LANES_ESCALATION': '1', 'LANES_ESCALATION_STUCK_PRS': '1'}))
                        stack.enter_context(patch.object(host, 'intake_slots', return_value=0 if floor else 1))
                        stack.enter_context(patch.object(lane, 'load_providers', return_value=providers))
                        stack.enter_context(patch.object(lane, '_SUMMARY', summary))
                        stack.enter_context(patch.object(lane, '_CLAIM_OBSERVATIONS', {}))
                        stack.enter_context(patch.object(lane.time, 'time', return_value=now))
                        planner = stack.enter_context(patch.object(lane, 'escalate_exhausted', wraps=self.saved[11]))
                        stack.enter_context(patch.object(lane, 'reconcile_fix_target', side_effect=lambda _: copy.deepcopy(pr)))
                        stack.enter_context(patch.object(lane, 'cooling', return_value=False))
                        stack.enter_context(patch.object(lane, 'provider_healthy', return_value=True))
                        stack.enter_context(patch.object(lane, 'observe_repair_provider_health', return_value=True))
                        stack.enter_context(patch.object(lane, 'sh', side_effect=transport))
                        stack.enter_context(patch.object(lane.pr_events, 'conditional_page', return_value=None if owner == 'unreadable' else comments))
                        stack.enter_context(patch.object(lane.pr_events, 'etag_cache_dir', return_value=None))
                        labels = stack.enter_context(patch.object(lane.pr_events, 'add_label'))
                        stack.enter_context(patch.object(lane.pr_events, 'capture_target_file_witnesses', return_value={}))
                        stack.enter_context(patch.object(lane.pr_events, 'cleanup_one_event'))
                        stack.enter_context(patch.object(lane.disk_guard, 'check', return_value={'admitted': True}))
                        stack.enter_context(patch.object(lane.bindings, 'work', return_value=None))
                        stack.enter_context(patch.object(lane, 'requeue_verified'))
                        stack.enter_context(patch.object(lane, 'record_maintenance_demand'))
                        stack.enter_context(patch.object(lane, 'publish_exhausted_repairs'))
                        stack.enter_context(patch.object(lane, 'sweep_execution_statuses'))
                        stack.enter_context(patch.object(lane, 'revisit_terminal_prs'))
                        stack.enter_context(patch.object(lane, 'read_new_issue_budget', return_value={'allowed': False, 'reason': 'fixture'}))
                        new_work = stack.enter_context(patch.object(lane, 'run_issue'))
                        self.assertEqual(lane.worker(host, "grok"), 0)
                    planner.assert_called_once()
                    self.assertEqual(planner.call_args.kwargs.get("joined_rungs"), frozenset({7}))
                    expected = [] if owner != "unowned" or floor else [
                        ["gh", "run", "rerun", "123", "--failed", "--repo", "JovieInc/Jovie"]]
                    self.assertEqual(effects, expected)
                    labels.assert_not_called(); new_work.assert_not_called()
                    if not expected:
                        self.assertEqual(json.loads(path.read_text())["7"], record)

    def test_pending_rung_join_uses_only_the_fresh_pinned_prelock_inventory(self):
        for delay in (0, lane.MAINTENANCE_DEMAND_MAX_AGE_S + 1):
            with self.subTest(delay=delay):
                clock = [10000.0]
                original = {"number": 7, "headRefOid": "original"}
                changed = {"number": 7, "headRefOid": "later-global-value"}
                summary = {"at": clock[0], "readable": True, "sourceAt": clock[0],
                           "prs": [{**original, "labelsComplete": True}]}
                locked = lane.Locked
                def acquire(path, *args, **kwargs):
                    if Path(path).name == "claim.lock":
                        summary["prs"] = [changed]
                        clock[0] += delay
                    return locked(path, *args, **kwargs)
                with patch.object(lane, "_SUMMARY", summary), \
                        patch.object(lane, "Locked", side_effect=acquire), \
                        patch.object(lane.time, "time", side_effect=lambda: clock[0]), \
                        patch.object(self.host, "intake_slots", return_value=0), \
                        patch.object(lane.pr_events, "capture_target_file_witnesses", return_value={}), \
                        patch.object(lane, "pending_rung_candidates", side_effect=lambda host, name, rows: rows) as join, \
                        patch.object(lane, "claim_escalation_pr", return_value=None) as claim, \
                        patch.object(lane, "record_maintenance_demand"), \
                        patch.object(lane, "escalate_exhausted"):
                    lane.worker(self.host, "devin")
                if delay:
                    join.assert_not_called()
                    claim.assert_not_called()
                else:
                    self.assertEqual(join.call_args.args[2], [{**original, "labelsComplete": True}])
                    self.assertEqual(claim.call_args.args[2], [{**original, "labelsComplete": True}])
                self.assertEqual(summary["prs"], [changed])

    def test_target_confirmation_precedes_claim_lock_and_worker_rechecks_age_after_wait(self):
        task, witness = TargetFileAdmissionTest().fixture()
        self.linear.issues = [task]
        original_locked = lane.Locked
        seen = []
        clock = [10000.0]
        def capture(*args, **kwargs):
            contender = original_locked(self.host.state / "claim.lock", blocking=False)
            try:
                self.assertTrue(contender.held, "confirmation ran inside claim.lock")
            finally:
                contender.release()
            seen.append("confirmation")
            return witness
        def lock(path, *args, **kwargs):
            if Path(path).name == "claim.lock":
                self.assertEqual(seen, ["confirmation"])
                clock[0] = 10061.0  # Simulate a blocked lock acquisition beyond the source TTL.
            return original_locked(path, *args, **kwargs)
        with patch.object(lane.pr_events, "capture_target_file_witnesses", side_effect=capture), \
                patch.object(lane, "Locked", side_effect=lock), \
                patch.object(lane.time, "time", side_effect=lambda: clock[0]), \
                patch.object(lane, "open_hotspot_holds", return_value={"scripts/lanes/lane_runner.py": 21724}), \
                patch.object(lane, "run_issue") as work:
            lane.worker(self.host, "devin")
        self.assertEqual(seen, ["confirmation"])
        work.assert_not_called()
        self.assertEqual(self.linear.moves, [])

    def test_fresh_target_worker_dispatch_and_changed_inventory_fail_closed(self):
        task, witness = TargetFileAdmissionTest().fixture()
        row = witness[21824]
        current = {**row, "baseRef": {"target": {"oid": row["baseTipOid"]}},
                   "files": [{"path": path} for path in row["paths"]], "filesComplete": True,
                   "inlineFilesEvidence": row}
        self.linear.issues = [task]
        for changed in (True, False):
            with self.subTest(changed=changed):
                inventory = [{**current, "headRefOid": "d"*40}] if changed else [current]
                with patch.object(lane.pr_events, "capture_target_file_witnesses", return_value=witness), \
                        patch.object(lane, "overlap_inventory", return_value=(inventory, [])), \
                        patch.object(lane, "open_hotspot_holds", return_value={"scripts/lanes/lane_runner.py": 21724}), \
                        patch.object(lane.time, "time", return_value=10000), \
                        patch.object(lane, "run_issue", return_value={"verdict": "landing", "prUrl": "u"}) as work:
                    lane.worker(self.host, "devin")
                self.assertEqual(work.call_count, int(not changed))

    def test_unknown_target_scope_keeps_adopt_and_labeled_work_ahead_of_pool(self):
        for selected in ("adopt", "labeled"):
            with self.subTest(selected=selected), \
                    patch.object(lane.pr_events, "capture_target_file_witnesses", side_effect=RuntimeError("scope unavailable")), \
                    patch.object(lane, "claim_adoptable_pr", return_value=SimpleNamespace(pr={"number": 8}) if selected == "adopt" else None), \
                    patch.object(lane, "claim_labeled_event", return_value=issue("JOV-LABELED") if selected == "labeled" else None), \
                    patch.object(lane, "adopt_pr") as adopt, \
                    patch.object(lane, "run_issue", return_value={"verdict": "landing", "prUrl": "u"}) as work, \
                    patch.object(lane, "read_new_issue_budget") as budget:
                lane.worker(self.host, "devin")
                self.assertEqual(adopt.call_count, int(selected == "adopt"))
                self.assertEqual(work.call_count, int(selected == "labeled"))
                if selected == "labeled": self.assertEqual(work.call_args.args[4].identifier, "JOV-LABELED")
                budget.assert_not_called()

    def test_missing_target_scope_never_displaces_existing_repair_priority(self):
        with patch.object(lane.pr_events, "capture_target_file_witnesses", side_effect=RuntimeError("scope unavailable")), \
                patch.object(lane, "claim_red_pr", return_value={"number": 21724}), \
                patch.object(lane, "fix_red_pr") as repair, patch.object(lane, "run_issue") as new_work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        repair.assert_called_once(); new_work.assert_not_called()

    def test_oversize_inventory_idles_with_a_distinct_reason_and_stderr_line(self):
        good = lane.capture_repair_inventory('devin')
        bad = {**good, 'summary': {**good['summary'], 'sourceAt': None,
                                   'sourceAtReason': 'inventory-oversize', 'sourceAtBytes': 17 * 1024 * 1024}}
        err = io.StringIO()
        with patch.object(lane, 'capture_repair_inventory', return_value=bad), \
                patch.object(lane, 'run_issue') as work, contextlib.redirect_stderr(err):
            self.assertEqual(lane.worker(self.host, 'devin'), 0)
        work.assert_not_called()
        self.assertEqual(json.loads((self.host.state/'worker-idle.json').read_text())['devin']['reason'],
                         'repair-inventory-oversize')
        self.assertIn(str(17 * 1024 * 1024), err.getvalue())

    def test_large_valid_inventory_cache_does_not_hold_the_worker(self):
        rows = [{**repair_inventory_pr(), 'body': 'x' * (2 * 1024 * 1024)}]
        (lane.SHARED_CACHE_DIR).mkdir(parents=True, exist_ok=True)
        (lane.SHARED_CACHE_DIR/'open-prs-labels-v2.json').write_text(json.dumps({'at': time.time(), 'value': rows}))
        lane._SUMMARY.update(at=0.0, prs=[], readable=False)
        with patch.dict(os.environ, {'LANES_EXECUTION_BACKEND': 'mesh'}), \
                patch.object(lane, 'shared', return_value=copy.deepcopy(rows)), \
                patch.object(lane, 'record_idle_exit') as idle, patch.object(lane, 'run_issue'), \
                contextlib.redirect_stderr(io.StringIO()):
            receipt = lane.capture_repair_inventory('devin')
            self.assertTrue(lane.repair_inventory_valid(receipt, 'devin'))
            try: lane.worker(self.host, 'devin')
            except Exception: pass  # downstream work is out of scope; only the hold matters
        reasons = [c.args[2] for c in idle.call_args_list]
        self.assertNotIn('repair-inventory-unknown-or-stale', reasons)
        self.assertNotIn('repair-inventory-oversize', reasons)

    def test_initial_invalid_repair_receipt_records_idle_only_after_global_release(self):
        real_idle = lane.record_idle_exit
        def idle(host, name, reason):
            contender = lane.Locked(host.state/'claim.lock', blocking=False)
            try: self.assertTrue(contender.held, 'idle callback must run outside globalclaim')
            finally: contender.release()
            real_idle(host, name, reason)
        good = lane.capture_repair_inventory('devin')
        for change in ({'readable': False}, {'sourceAt': None}, {'sourceAt': time.time()-60}):
            bad = {**good, 'summary': {**good['summary'], **change}}
            with self.subTest(change=change), patch.object(lane, 'capture_repair_inventory', return_value=bad), \
                    patch.object(lane, 'record_idle_exit', side_effect=idle), patch.object(lane, 'run_issue') as work:
                self.assertEqual(lane.worker(self.host, 'devin'), 0)
                work.assert_not_called()
                self.assertEqual(json.loads((self.host.state/'worker-idle.json').read_text())['devin']['reason'],
                                 'repair-inventory-unknown-or-stale')
                slot = lane.Locked(self.host.state/'slots/devin.0.lock', blocking=False)
                try: self.assertTrue(slot.held)
                finally: slot.release()

    def test_brief_unknown_response_or_elapsed_ttl_keeps_baseline_local_claim_continuity(self):
        real_linear = self.saved[0]
        for scenario in ('unknown-comment', 'elapsed-comment', 'remote-only'):
            with self.subTest(scenario=scenario):
                # Each case uses fresh actual mirror/claim state, not a refreshed remote label.
                with tempfile.TemporaryDirectory() as tmp:
                    host = lane.Host(state=Path(tmp), repo=ROOT, linear_env=Path('unused'))
                    clock = [time.time()]
                    class Client:
                        description = 'No design brief yet'
                        comments = []
                        label_adds = 0
                        def lane_issues(client, label=None):
                            return real_linear.lane_issues(client, label)
                        def gql(client, query, variables):
                            if query.startswith('query'):
                                return {'issue': {'description': client.description}}
                            if 'd' in variables: client.description = variables['d']
                            if 'addedLabelIds' in query: client.label_adds += 1
                            return {'issueUpdate': {'success': True}}
                        def comment(client, ident, body):
                            client.comments.append((ident, body))
                            if scenario in ('unknown-comment', 'remote-only'):
                                raise RuntimeError('offline committed comment response lost')
                            clock[0] += lane.CLAIM_SCAN_TTL_S + 1
                    client = Client()
                    node = {'id': 'brief-id', 'identifier': 'JOV-999999', 'title': 'Homepage hero',
                            'description': client.description, 'priority': 2, 'createdAt': '2026-10-13T00:00:00Z',
                            'updatedAt': '2026-10-14T23:00:00Z', 'state': {'name': 'Todo', 'type': 'unstarted'},
                            'parent': None, 'labels': {'nodes': [{'name': 'ws:ui-ia'}],
                                                     'pageInfo': {'hasNextPage': False}}}
                    lane.linear_sync.apply(host.state, 'JOV', [node])
                    spec = {'enabled': True, 'repairs': scenario != 'remote-only', 'model': 'offline', 'slots': 1, 'label': 'devin'}
                    with patch.dict(os.environ, {'LANES_STATE': tmp}), \
                            patch.object(lane.time, 'time', side_effect=lambda: clock[0]), \
                            patch.object(lane, 'Linear', return_value=client), \
                            patch.object(lane, 'run_issue', return_value={'verdict': 'decomposed'}) as work, \
                            patch.object(lane, 'issue_router', return_value=None), \
                            patch.object(lane, 'notify_issue_claim'), patch.object(lane, 'note_event_outcome'), \
                            patch.object(lane.bindings, 'work', return_value=None), \
                            patch.object(lane, 'sh', side_effect=AssertionError('no external calls')), \
                            patch.object(lane, 'requeue_verified'), patch.object(lane, 'yield_deferred_requeues'), \
                            patch.object(lane, 'publish_exhausted_repairs'), patch.object(lane, 'sweep_execution_statuses'), \
                            patch.object(lane, 'revisit_terminal_prs'), contextlib.redirect_stderr(io.StringIO()):
                        with contextlib.ExitStack() as guards:
                            if scenario == 'remote-only':
                                guards.enter_context(patch.object(lane, 'capture_repair_inventory',
                                    side_effect=AssertionError('remote-only must bypass repair inventory gate')))
                            for _ in range(2):
                                slot = lane.Locked(host.state/'slots/devin.0.lock', blocking=False)
                                self.assertTrue(slot.held)
                                self.assertEqual(lane.worker_with_slot(host, 'devin', spec, slot), 0)
                    self.assertEqual(len(client.comments), 1)
                    self.assertEqual(client.label_adds, 1)
                    self.assertEqual(client.description.count('"orderId"'), 1)
                    self.assertEqual(lane.linear_sync.claim_status(host.state, 'brief-id'), 'active')
                    work.assert_called_once()

    def test_unknown_linear_inventory_releases_the_seat_without_claiming(self):
        with patch.object(self.linear, "lane_issues", side_effect=lane.LaneInventoryUnknown("linear-refresh-reserve-held")), \
                patch.object(lane, "run_issue") as work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        work.assert_not_called()
        self.assertEqual(self.linear.moves, [])
        idle = json.loads((self.host.state / "worker-idle.json").read_text())
        self.assertEqual(idle["devin"]["reason"], "linear-inventory-unknown")
        seat = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        try:
            self.assertTrue(seat.held)
        finally:
            seat.release()

    def test_bound_lyb_work_uses_this_seat_before_jovie_intake(self):
        with patch.object(lane.bindings, "work", return_value="pr-opened") as bound, \
                patch.object(lane, "run_issue") as jovie:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(bound.call_args.args[2:4], ("devin", lane.load_providers()["devin"]))
        jovie.assert_not_called()
        self.assertEqual(len(self.execs), 1)  # re-exec for the next unit, like any finished run

    def test_binding_fault_never_blocks_the_jovie_path(self):
        with patch.object(lane.bindings, "work", side_effect=RuntimeError("lyb unreadable")), \
                patch.object(lane, "run_issue", return_value={"verdict": "landing"}) as jovie, \
                contextlib.redirect_stderr(io.StringIO()):
            lane.worker(self.host, "devin")
        self.assertEqual(jovie.call_args.args[4].identifier, "JOV-3")

    def test_selected_repair_needs_no_linear_credentials_or_housekeeping(self):
        with patch.object(lane, "claim_red_pr", return_value={"number": 7}), \
                patch.object(lane, "Linear", side_effect=SystemExit("no key")) as client, \
                patch.object(lane, "escalate_exhausted", side_effect=lane.LinearRateLimited(9999999999)) as cleanup, \
                patch.object(lane, "sweep_lane_prs") as sweep, \
                patch.object(lane, "fix_red_pr") as repair:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        repair.assert_called_once()
        client.assert_not_called()
        cleanup.assert_not_called()
        sweep.assert_not_called()

    def test_maintenance_only_seat_never_falls_through_after_fresh_repair_miss(self):
        with patch.object(self.host, "intake_slots", return_value=0), \
                patch.object(lane, "Linear") as client, \
                patch.object(lane, "claim_labeled_event") as event, \
                patch.object(lane, "read_new_issue_budget") as budget, \
                patch.object(lane, "run_issue") as new_work, \
                patch.object(lane, "escalate_exhausted") as refresh:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        refresh.assert_called_once()
        self.assertIsNone(refresh.call_args.args[2])
        self.assertTrue(refresh.call_args.kwargs["model_only"])
        client.assert_not_called()
        event.assert_not_called()
        budget.assert_not_called()
        new_work.assert_not_called()
        self.assertEqual(self.linear.moves, [])
        idle = json.loads((self.host.state / "worker-idle.json").read_text())
        self.assertEqual(idle["devin"]["reason"], "maintenance-only-idle")

    def test_extra_repair_seat_is_part_of_the_shared_total(self):
        occupied = lane.Locked(self.host.state / "slots/devin.0.lock", False)
        self.addCleanup(occupied.release)
        with patch.object(self.host, "slots", return_value=2), \
                patch.object(self.host, "intake_slots", return_value=1), \
                patch.object(lane, "worker_with_slot", return_value=0) as work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertTrue(work.call_args.kwargs["maintenance_only"])
        self.assertEqual(work.call_args.args[3].handle.name, str(self.host.state / "slots/devin.1.lock"))
        self.assertTrue(occupied.held)

    def test_occupied_seat_outside_reduced_cap_prevents_another_start(self):
        occupied = lane.Locked(self.host.state / "slots/devin.4.lock", False)
        self.addCleanup(occupied.release)
        with patch.object(self.host, "slots", return_value=1), \
                patch.object(lane, "worker_with_slot") as work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        work.assert_not_called()
        self.assertTrue(occupied.held)

    def test_host_cap_counts_occupied_seats_from_every_provider(self):
        occupied = lane.Locked(self.host.state / "slots/codex.4.lock", False)
        self.addCleanup(occupied.release)
        with patch.object(lane.autoscale, "host_ceiling", return_value=1), \
                patch.object(lane, "worker_with_slot") as work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        work.assert_not_called()
        self.assertTrue(occupied.held)

    def test_unknown_or_special_slot_inventory_refuses_a_start(self):
        slots = self.host.state / "slots"
        slots.mkdir()
        os.mkfifo(slots / "codex.3.lock")
        with patch.object(lane, "worker_with_slot") as work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        work.assert_not_called()

    def test_eligible_repair_precedes_held_new_intake(self):
        self.linear.issues = [issue("JOV-3")]
        with patch.object(lane, "claim_red_pr", return_value={"number": 21175}), \
                patch.object(lane, "fix_red_pr") as repair, \
                patch.object(lane, "read_new_issue_budget", return_value={"allowed": False, "reason": "over-budget"}) as budget, \
                patch.object(lane, "run_issue") as new_work:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        repair.assert_called_once()
        budget.assert_not_called()
        new_work.assert_not_called()
        self.assertEqual(self.linear.moves, [])

    def test_optional_observation_failure_does_not_interrupt_selected_repair(self):
        with patch.object(lane, "claim_red_pr", return_value={"number": 7}), \
                patch.object(lane, "record_maintenance_demand", side_effect=RuntimeError("malformed unrelated state")), \
                patch.object(lane, "fix_red_pr") as repair, patch.object(lane, "read_new_issue_budget") as budget:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        repair.assert_called_once()
        budget.assert_not_called()
        contender = lane.Locked(self.host.state / "claim.lock", blocking=False)
        try:
            self.assertTrue(contender.held)
        finally:
            contender.release()

    def test_an_overlapping_candidate_is_recorded_and_still_runs(self):
        # Tim 2026-10-12: the overlap guard records, the merge queue serializes; it never blocks.
        self.linear.issues[0].description = "Edit `scripts/lanes/lane_runner.py`."
        existing = {"number": 1, "files": ["scripts/lanes/lane_runner.py"], "isDraft": False}
        with patch.object(lane, "overlap_inventory", return_value=([existing], [])), \
                patch.object(lane, "open_hotspot_holds", return_value={}), \
                patch.object(lane, "run_issue", return_value={"verdict": "landing", "prUrl": "u"}) as run, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            lane.worker(self.host, "devin")
        run.assert_called_once()

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
        # No live host state: a lane run exports LANES_*/SYMPHONY_*/LINEAR_* vars that
        # Host.base_slots, lane_state_dir, cooldown scopes and autoscale.mode all read.
        # Without this scrub the class inherits the host's slot counts and shared state.
        env = patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for key in list(os.environ):
            if key != "LANES_EXECUTION_BACKEND" and key.startswith(
                    ("LANES_", "SYMPHONY_", "LINEAR_", "DESIGN_GATE_")):
                os.environ.pop(key)
        os.environ["SYMPHONY_AUTOSCALE"] = "off"
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        real_summary = lane.open_prs_summary
        default_summary = lane._SUMMARY
        summary = copy.deepcopy(lane._SUMMARY)
        def known_empty_summary(*, capture=None):
            if lane._SUMMARY is default_summary:
                lane._SUMMARY.update(at=time.time(), sourceAt=time.time(), prs=[], readable=True)
            return real_summary(capture=capture)
        summary_fixture = patch.object(lane, 'open_prs_summary', side_effect=known_empty_summary)
        summary_fixture.start()
        self.addCleanup(summary_fixture.stop)
        def restore_summary():
            lane._SUMMARY.clear(); lane._SUMMARY.update(summary)
        self.addCleanup(restore_summary)
        self.saved = (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
                      lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
                      lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
                      lane.pr_events.claim_event_pr, lane.sweep_lane_prs, lane.read_new_issue_budget,
                      lane.open_hotspot_holds)
        lane.open_hotspot_holds = lambda: {}  # never a real `gh pr list` from a unit test
        lane.sweep_lane_prs = lambda host, name, linear, now=None: None
        lane.pr_events.queued_prs = lambda module, kinds, *, inventory=None: []
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: None
        lane.claim_red_pr = lambda host, name, prs=None: None
        lane.claim_adoptable_pr = lambda host, name, prs, repair_candidates=None: None
        lane.lane_prs = lambda name, fields="", *, inventory=None: []
        lane.read_new_issue_budget = lambda name, slots: lane.new_issue_budget(name, slots, lane.lane_prs(name, fields=lane.LIGHT_PR_FIELDS))
        lane.in_flight_issues = lambda: frozenset()  # never GitHub from a unit test
        lane.fix_candidates = lambda name, *, inventory=None: []
        lane.escalate_exhausted = lambda host, prs, linear, **kwargs: None
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name), linear_env=Path("unused"))
        intake = patch.object(self.host, "intake_slots", return_value=1)
        intake.start()
        self.addCleanup(intake.stop)
        self.linear = FakeLinear([issue("JOV-3")])
        lane.Linear = lambda env: self.linear
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "model": "m", "cmd": ["true"]}}
        self.execs = []
        lane.os.execv = lambda exe, args: self.execs.append(args)
        # Lane writes go to the durable outbox; these disposition tests observe each entry as
        # it is enqueued (outbox delivery itself is covered in test_linear_sync).
        real_enqueue = self.real_enqueue = lane.linear_sync.enqueue

        def observed(state, op, issue_id, *, target=None, body=None):
            (self.linear.move(issue_id, target) if op == "move" else self.linear.comment(issue_id, body))
            return real_enqueue(state, op, issue_id, target=target, body=body)
        outbox = patch.object(lane.linear_sync, "enqueue", observed)
        outbox.start()
        self.addCleanup(outbox.stop)

    def tearDown(self):
        (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
         lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
         lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
         lane.pr_events.claim_event_pr, lane.sweep_lane_prs, lane.read_new_issue_budget,
         lane.open_hotspot_holds) = self.saved
        self.tmp.cleanup()

    def test_initial_claim_failure_is_nonfatal_without_fabricating_delivery(self):
        import io
        client = self.saved[0].__new__(self.saved[0]); comment = self.linear.comment
        for failure in (None, OSError("private-network-message")):
            lane.linear_sync.release(self.host.state, "id-JOV-3")  # each case claims afresh
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

    def test_an_epic_runs_as_a_decomposition_unit_and_keeps_its_settled_state(self):
        self.linear.issues = [issue("JOV-3", labels=["type:epic"])]
        lane.run_issue = lambda *a: self.fail("an epic is not an implementation run")
        with patch.object(lane.epics, "run_epic", return_value={"verdict": "decomposed"}) as run_epic:
            lane.worker(self.host, "devin")
        self.assertEqual(run_epic.call_args.args[5].identifier, "JOV-3")
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertFalse(lane.failures_path(self.host).exists())
        self.assertEqual(self.execs[0][-3:], ["worker", "--provider", "devin"])

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

    def test_pr_recovery_hold_filters_every_selector_and_keeps_fresh_work_eligible(self):
        blocked = {"number": 7, "headRefOid": "a" * 40}
        fresh = {"number": 8, "headRefOid": "b" * 40}
        lane.note_recovery_handoff(self.host, f"pr:7:{blocked['headRefOid']}")
        seen = []
        def check(prs):
            seen.append([pr["number"] for pr in prs])
            self.assertNotIn(7, seen[-1])
        def event(host, module, name, prs):
            check(prs)
        def escalation(host, name, prs, **kwargs):
            check(prs)
        def polling(host, name, prs):
            check(prs)
            return fresh
        with patch.object(lane, "fix_candidates", return_value=[blocked, fresh]), \
                patch.object(lane, "lane_prs", return_value=[blocked]), \
                patch.object(lane.pr_events, "queued_prs", return_value=[blocked]), \
                patch.object(lane.pr_events, "claim_event_pr", side_effect=event), \
                patch.object(lane, "claim_escalation_pr", side_effect=escalation), \
                patch.object(lane, "claim_red_pr", side_effect=polling), \
                patch.object(lane, "fix_red_pr") as repair:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(seen, [[], [8], [8]])
        self.assertEqual(repair.call_args.args[-1], fresh)

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

    def test_failures_retry_then_park_in_todo_until_the_next_release(self):
        lane.run_issue = lambda *a: {"verdict": "held", "reasons": ["code-change-without-test"]}
        for _ in range(3):
            lane.worker(self.host, "devin")
        # No Backlog sink (it needed a human): parked locally, retried on the next release.
        self.assertEqual([m[1] for m in self.linear.moves if m[1] != "In Progress"], ["Todo", "Todo", "Todo"])
        self.assertEqual(json.loads((self.host.state / "failures.json").read_text())["JOV-3"]["count"], 3)

    def test_not_shippable_gets_a_terminal_disposition_without_a_failure(self):
        lane.run_issue = lambda *a: {"verdict": "not-shippable", "reasons": ["already fixed"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Backlog"))
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(len(self.execs), 1)

    def test_provider_error_returns_the_issue_and_cools_only_on_a_measured_limit(self):
        lane.run_issue = lambda *a: {"verdict": "provider-error", "reasons": ["agent-exit:2"]}
        self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertFalse(lane.cooling(self.host, "devin"), "a crash is a failure, not a provider limit")
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Todo"))
        self.assertEqual(self.execs, [])
        lane.run_issue = lambda *a: {"verdict": "provider-error", "reasons": [f"agent-exit:{lane.PROVIDER_LIMIT_EXIT}"]}
        self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertFalse(lane.cooling(self.host, "devin"), "a raw CLI's 75 is not our limit contract")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Todo"))
        # codex_lane / claude_lane exit 75 only on a measured limit: that cools the lane.
        self.assertTrue(lane.cool_down(self.host, "codex", lane.PROVIDER_LIMIT_EXIT))
        self.assertTrue(lane.cooling(self.host, "codex"))
        self.assertFalse(lane.cool_down(self.host, "claude", 1))
        self.assertEqual(lane.provider_exit(["harness-error:x"]), -1)
        self.assertFalse(lane.cool_down(self.host, "claude", lane.provider_exit([])))

    def test_red_prs_are_fixed_before_new_issues_are_claimed(self):
        fixed = []
        lane.claim_red_pr = lambda host, name, prs=None: {"number": 5}
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, self.linear.moves), ([5], []))
        self.assertEqual(len(self.execs), 1)

    def test_event_queued_prs_are_fixed_first_without_optional_linear_escalation(self):
        fixed, escalated = [], []
        lane.fix_candidates = lambda name, *, inventory=None: [{"number": 5}, {"number": 6}]
        lane.pr_events.queued_prs = lambda module, kinds, *, inventory=None: [{"number": 6, "eventKinds": ["red"]}]
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: prs[0]
        lane.claim_red_pr = lambda host, name, prs=None: self.fail("the event queue goes first")
        lane.escalate_exhausted = lambda host, prs, linear, **kwargs: escalated.append(sorted(pr["number"] for pr in prs))
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, escalated), ([6], []))

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
                lane.linear_sync.release(self.host.state, "id-JOV-3")  # the PR keeps the prior claim
                lane.run_issue = lambda *a: {"verdict": verdict, "pr": 7, "prUrl": "u"}
                lane.worker(self.host, "devin")
                self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
                self.assertFalse(lane.failures_path(self.host).exists())
                self.assertIn("no new certification", self.linear.comments[-1][1])

    def test_an_issue_the_local_ledger_already_owns_is_not_started_twice(self):
        started = []
        lane.run_issue = lambda *a, **k: started.append(a) or {"verdict": "landing"}
        self.assertTrue(lane.linear_sync.claim(self.host.state, "id-JOV-3", "JOV-3", "codex"))
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual((self.linear.moves, started), ([], []))

    def test_intake_runs_from_the_mirror_while_linear_is_rate_limited(self):
        """Every Linear call fails; the issue is still claimed, worked, and its writes wait."""
        down = lane.LinearRateLimited(9999999999)
        for method in ("gql", "move", "comment", "state_of"):
            setattr(self.linear, method, Mock(side_effect=down))
        lane.run_issue = Mock(return_value={"verdict": "landing", "prUrl": "u"})
        lane.escalate_exhausted = Mock(side_effect=down)
        with patch.object(lane, "claim_labeled_event", side_effect=down), \
                patch.object(lane.linear_sync, "enqueue", self.real_enqueue):
            lane.worker(self.host, "devin")
        self.assertEqual(lane.run_issue.call_args.args[4].identifier, "JOV-3")
        self.assertEqual(lane.linear_sync.claim_status(self.host.state, "id-JOV-3"), "active")
        entries = lane.linear_sync._read(lane.linear_sync._outbox_path(self.host.state), lane.linear_sync.OUTBOX)["entries"]
        self.assertEqual(entries[0]["target"], "In Progress")
        self.assertTrue(any("claimed this issue" in entry.get("body", "") for entry in entries))

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

    def test_unknown_in_flight_exit_names_its_reason(self):
        lane.lane_prs = lambda name, fields="", *, inventory=None: []
        lane.in_flight_issues = lambda: None
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(json.loads((self.host.state / "worker-idle.json").read_text())
                         ["devin"]["reason"], "in-flight-unknown")

    def test_a_crash_before_the_scan_leaves_no_idle_record(self):
        lane.lane_prs = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        self.assertRaises(RuntimeError, lane.worker, self.host, "devin")
        self.assertFalse((self.host.state / "worker-idle.json").exists())
        self.assertEqual(self.linear.moves, [])

    def test_open_red_prs_never_stop_a_lane_claiming_new_work(self):
        # Tim 2026-10-12: no open-PR ceiling; only real limits bound a lane.
        red = [{"number": n, "headRefName": f"devin/jov-{n}-20260927t000000", "isDraft": True} for n in range(1, 9)]
        lane.lane_prs = lambda name, fields="", *, inventory=None: red if fields else []
        ran = []
        lane.run_issue = lambda *a: ran.append(1) or {"verdict": "landing", "prUrl": "u"}
        lane.worker(self.host, "devin")
        self.assertEqual(ran, [1])

    def test_new_issue_budget_uses_base_slots_not_autoscaled(self):
        """JOV-7514: parked-PR caps stay on configured slots as autoscale capacity rises."""
        seen = []
        lane.read_new_issue_budget = lambda name, slots: seen.append(slots) or {"allowed": True}
        lane.run_issue = lambda *a: {"verdict": "landing", "prUrl": "u"}
        with patch.object(self.host, "base_slots", return_value=2), \
                patch.object(lane.autoscale, "effective_slots", return_value=5):
            lane.worker(self.host, "devin")
        self.assertEqual(seen, [2])

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
        lane.fix_candidates = lambda name, *, inventory=None: [pr]
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
        self.assertEqual((result["allowed"], result["used"], result["terminal"]), (True, 1, 1))
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
    """Tim 2026-10-12: no open-PR ceiling (JOV-6833 x2 active / JOV-7514 x4 terminal are gone)."""
    def row(self, number=1, branch=None, draft=True, state="CLEAN", labels=()):
        return {"number": number, "headRefName": branch or f"codex/jov-{number}-20261002",
                "isDraft": draft, "mergeStateStatus": state, "labels": [{"name": name} for name in labels]}

    def test_no_pr_count_ever_refuses_new_issues(self):
        parked = [self.row(n, labels=("hold",)) for n in range(1, 40)]
        active = [self.row(n, state="BLOCKED") for n in range(40, 80)]
        result = lane.new_issue_budget("codex", 1, parked + active + [self.row(99, branch="codex/manual")])
        self.assertEqual((result["allowed"], result["reason"], result["cap"], result["terminalCap"]),
                         (True, "within-budget", None, None))
        self.assertEqual((result["used"], result["terminal"]), (40, 39), "counts stay visible, never a ceiling")
        self.assertEqual(lane.new_issue_budget("codex", 0, None)["reason"], "provider-disabled")
        self.assertFalse(hasattr(lane, "OPEN_PRS_PER_SLOT") or hasattr(lane, "TERMINAL_PRS_PER_SLOT")
                         or hasattr(lane, "over_budget"))

    def test_the_claim_path_makes_no_pr_count_read(self):
        with patch.object(lane, "sh", side_effect=AssertionError("no GitHub read")):
            result = lane.read_new_issue_budget("codex", 3)
        self.assertEqual((result["allowed"], result["reason"], result["used"], result["error"]),
                         (True, "within-budget", None, None))


class OversizeDiffExitTest(unittest.TestCase):
    def test_an_oversize_diff_goes_to_a_repair_lane_that_splits_it(self):
        # Tim 2026-10-12: diff-too-large had no exit (bug intake, a human split).
        self.assertEqual(lane.pr_events.held_reason(["diff-too-large:3036"]), ("diff-too-large", "fix-loop"))
        self.assertTrue(lane.pr_events.fixable_hold(lane.pr_events.held_record("h", ["diff-too-large:3036"]), "h"))
        self.assertNotIn("diff-too-large", lane.remediation.DIFF_POLICY)
        prompt = lane.render_fix_prompt({"number": 7, "headRefName": "devin/jov-7-20261012", "mergeStateStatus": "BLOCKED",
                                         "gateEvidence": ["diff-too-large:3036"]}, "")
        self.assertIn(f"keep at most {lane.MAX_REVIEWABLE_LINES} reviewable changed lines", prompt)
        self.assertIn("follow-up PR", prompt)


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

    def _assert_sigterm_revokes_before_kill(self, child):
        import signal
        with tempfile.TemporaryDirectory() as tmp, open(os.devnull, "w") as log:
            root = Path(tmp)
            host = lane.Host(state=root)
            pidfile = root / "pid"

            def ready_pid():
                # Readiness handshake: a complete pid line, not mere file existence.
                # A created-but-unwritten file made on_kill read "" (merge group 40121302814).
                try:
                    text = pidfile.read_text()
                except FileNotFoundError:
                    return None
                return int(text) if text.endswith("\n") and text.strip().isdigit() else None

            def signal_when_ready():
                if ready_pid() is not None:
                    os.kill(os.getpid(), signal.SIGTERM)

            observed = []

            def on_kill(error):
                # Preserve receipt-before-kill proof for a real SIGTERM too.
                os.kill(ready_pid(), 0)
                observed.append(type(error).__name__)
                lane.revoke_publication(host, branch="devin/jov-9-1", reason="run-stopped")

            with self.assertRaises(lane.RunStopped):
                lane.run_agent([sys.executable, "-c", child], root, log, timeout=30,
                               guard=signal_when_ready, guard_interval=0.05, on_kill=on_kill)
            self.assertEqual(observed, ["RunStopped"])
            self.assertIsNotNone(lane.publication_revocation(host, "devin/jov-9-1"))
            with self.assertRaises(ProcessLookupError):
                os.kill(ready_pid(), 0)

    def test_sigterm_is_a_stop_that_revokes_before_kill(self):
        # Startup may exceed the old 0.5s timer on a loaded installer host.
        self._assert_sigterm_revokes_before_kill(
            "import os,time,pathlib; time.sleep(0.75); "
            "pathlib.Path('pid').write_text(f'{os.getpid()}\\n'); time.sleep(30)")

    def test_sigterm_waits_for_a_complete_pid_not_a_created_file(self):
        # Regression: the file exists empty, then holds a partial pid, before the line completes.
        self._assert_sigterm_revokes_before_kill(
            "import os,time,pathlib; p=pathlib.Path('pid'); time.sleep(0.2); p.touch(); "
            "time.sleep(0.3); p.write_text(str(os.getpid())); time.sleep(0.3); "
            "p.write_text(f'{os.getpid()}\\n'); time.sleep(30)")

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


class ShippingOriginIngestTest(unittest.TestCase):
    def test_deferred_transport_is_importable_in_the_release_selftest(self):
        import shipping_origin

        state = Path("/synthetic-origin-state")
        result = {"accepted": ["restored"], "rejected": [], "errors": []}
        with patch.object(shipping_origin, "collect", return_value=result) as collect:
            self.assertEqual(lane.collect_shipping_origin(state), result)
        collect.assert_called_once_with(state)

    def test_transport_failure_stays_visible_to_dispatch(self):
        import shipping_origin

        with patch.object(shipping_origin, "collect", side_effect=RuntimeError("transport unavailable")):
            with self.assertRaisesRegex(RuntimeError, "transport unavailable"):
                lane.collect_shipping_origin(Path("/synthetic-origin-state"))


class DispatchTest(unittest.TestCase):
    def setUp(self):
        disk = patch.object(lane.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        # Host-independent tests must never contact production from Gem's test gate.
        clock = patch.object(lane.continuity_clock, "tick", return_value={"status": "current"})
        clock.start()
        self.addCleanup(clock.stop)
        # yc_corpus.tick captures real Popen as its default argument. Replacing
        # lane.subprocess.Popen does not isolate Gem's ancillary refresh path.
        corpus = patch.object(lane.yc_corpus, "tick", return_value={"status": "current"})
        self.corpus_tick = corpus.start()
        self.addCleanup(corpus.stop)

        origins = patch.object(lane, "collect_shipping_origin", return_value={"accepted": [], "rejected": [], "errors": []})
        self.origin_collect = origins.start()
        self.addCleanup(origins.stop)

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
                patch.object(lane, "HOST", "gem"), \
                patch.dict(os.environ, {"YC_CORPUS_OWNER": "gem"}), \
                patch.object(lane.subprocess, "Popen") as spawn:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            lane._save_event_delivery(host, {
                "schema": lane.EVENT_DELIVERY_SCHEMA,
                "actions": {"delivery": {"key": "delivery", "kind": "comments", "status": "failed",
                                         "nextAt": 123, "createdAt": 100}},
            })
            self.origin_collect.side_effect = RuntimeError("origin transport unavailable")
            self.assertEqual(lane.dispatch(host), 0)
            tick = json.loads((host.state / "tick.json").read_text())
            if os.environ.get("LANES_SELFTEST"):
                self.origin_collect.assert_not_called()
            else:
                self.origin_collect.assert_called_once_with(host.state)
                self.assertIn("origin transport unavailable", tick["shippingOriginIngest"]["errors"][0])
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(spawn.call_args.args[0][-1], "codex")
            self.corpus_tick.assert_called_once_with(host.state)
            self.assertFalse((host.state / "yc-corpus.json").exists(),
                             "dispatch fixture must not schedule a real corpus refresh")
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual(tick["spawned"], ["codex"])
            self.assertIsNone(tick["error"])
            self.assertEqual(tick["remediationEvents"]["deliveryFailed"], 1)
            self.assertEqual(tick["remediationEvents"]["deliveryNextAt"], 123)
            self.assertIn("reasonError", tick)
            self.assertIn("doctorError", tick)

    def test_dispatch_tick_syncs_the_mirror_and_spawns_even_when_linear_is_down(self):
        """Mirror sync and outbox flush ride the existing tick; Linear down never holds spawn."""
        client = SimpleNamespace(admit=lambda requests: False)
        for failure in (None, SystemExit("no LINEAR_API_KEY")):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"SYMPHONY_AUTOSCALE": "off", "LANES_SLOTS_CODEX": "1"}), \
                    patch.object(lane.autoscale, "mode", return_value="off"), \
                    patch.object(lane.disk_guard, "check", return_value={"freePct": 50, "admitted": True}), \
                    patch.object(lane.worktree_sweep, "maybe_spawn", return_value="not-due"), \
                    patch.object(lane, "ensure_full_history"), \
                    patch.object(lane, "load_providers", return_value={"codex": {"slots": 1}}), \
                    patch.object(lane, "provider_healthy", return_value=True), \
                    patch.object(lane, "claim_remediation_events", return_value={}), \
                    patch.object(lane, "Linear", side_effect=failure, return_value=client), \
                    patch.object(lane.linear_sync, "tick", return_value={"JOV": {"outcome": "rate-limited"}}) as sync, \
                    patch.object(lane.epics, "reconcile", return_value={}), \
                    patch.object(lane.pr_events, "tick", return_value={}), \
                    patch.object(lane.reason_lane, "tick", return_value={}), \
                    patch.object(lane.doctor, "run"), \
                    patch.object(lane.subprocess, "Popen") as spawn:
                os.environ.pop("LANES_SELFTEST", None)
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 0)
                self.assertEqual(spawn.call_count, 1)
                tick = json.loads((Path(tmp) / "tick.json").read_text())
                if failure is None:
                    self.assertEqual(sync.call_args.args[:2], (host.state, client))
                    self.assertEqual(sync.call_args.args[4], ["JOV"])
                    self.assertEqual(tick["linearSync"], {"JOV": {"outcome": "rate-limited"}})
                else:
                    sync.assert_not_called()
                    self.assertIn("SystemExit", tick["linearSyncError"])
                self.assertEqual(tick["linear"]["outbox"]["depth"], 0)

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

    def test_dispatch_respects_slots_health_and_quota_without_cleanup(self):
        saved = (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check)
        spawned = []
        lane.load_providers = lambda: {
            "a": {"slots": 2},
            "b": {"slots": 3},
            "c": {"slots": 1, "enabled": False},
            "claude": {"slots": 2, "quota": {"source": "claude-lane"}},
            "d": {"slots": 4},
        }
        lane.provider_healthy = lambda spec: (
            self.fail("unavailable provider was probed")
            if spec["slots"] == 4 or spec.get("quota") else spec["slots"] == 2)
        lane.subprocess.Popen = lambda args, **kw: spawned.append(args[-1])
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.doctor.run = lambda *a, **k: {}
        lane.disk_guard.check = lambda host: {"freePct": 50.0, "low": False, "critical": False, "admitted": True}
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "worktrees/old"
            old.mkdir(parents=True)
            os.utime(old, (0, 0))
            (Path(tmp) / "claude-quota.json").write_text(json.dumps({
                "bank": {"kind": "usage-limit", "until": time.time() + 60},
            }))
            try:
                # Autoscale samples live load/PSI; on a busy CI runner it trimmed a's seats.
                with patch.dict(os.environ, {"LANES_SLOTS_CLAUDE": "2", "LANES_SLOTS_D": "0",
                                             "SYMPHONY_AUTOSCALE": "off"}):
                    host = lane.Host(state=Path(tmp), repo=Path(tmp))
                    self.assertEqual(lane.dispatch(host), 0)
            finally:
                (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check) = saved
            self.assertTrue(old.exists(), "cleanup belongs after slot acquisition, not on each dispatch tick")
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual((tick["unhealthy"], tick["spawned"], tick["error"]), (["b"], ["a", "a"], None))
            self.assertEqual(tick["quotaBlocked"], {"claude": "banked:usage-limit"})
        self.assertEqual(spawned, ["a", "a"])

    def test_one_faulty_provider_does_not_idle_the_other_lanes(self):
        saved = (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check)
        spawned = []
        def health(spec):
            if spec.get("broken"):
                raise lane.lifecycle.AdmissionHeld("probe owner unknown")
            return True
        lane.load_providers = lambda: {"broken": {"slots": 1, "broken": True}, "fine": {"slots": 2}}
        lane.provider_healthy = health
        lane.subprocess.Popen = lambda args, **kw: spawned.append(args[-1])
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.doctor.run = lambda *a, **k: {}
        lane.disk_guard.check = lambda host: {"freePct": 50.0, "low": False, "critical": False, "admitted": True}
        # Autoscale samples live load/PSI; on a busy or small host it trims the
        # fine lane below its 2 configured seats. This fixture isolates provider
        # fault handling, not autoscale — pin the mode off like the sibling above.
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_AUTOSCALE": "off"}):
            try:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 0)
            finally:
                (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run,
                 lane.disk_guard.check) = saved
            tick = json.loads((host.state / "tick.json").read_text())
        self.assertEqual((tick["unhealthy"], tick["spawned"], tick["error"]), (["broken"], ["fine", "fine"], None))
        self.assertIn("AdmissionHeld", tick["providerErrors"]["broken"])
        self.assertEqual(spawned, ["fine", "fine"])

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
            self.assertIn("git expl
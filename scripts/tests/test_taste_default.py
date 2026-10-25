"""Hermetic tests for the risk- and confidence-scaled founder-taste default."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
spec = importlib.util.spec_from_file_location("taste_default", ROOT / "scripts/lanes/taste_default.py")
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

SHA = "381a4282e16abd02365dd7f2328c9e65d56ab70e"
NOW = 1_800_000_000.0
POLICY = td.load_policy()


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def lifecycle(issue="JOV-1", owed=("founder-taste",), verified=True, at=NOW - 3600, risk="low", rows=("AM-018",)):
    manifest = {"schema": "jovie.validation-manifest/v1", "issue": issue, "riskLevel": risk,
                "receiptNotBefore": "2026-10-20T00:00:00Z", "required": [{"kind": "founder-taste", "reason": "UI change"}],
                "uiEvidence": [{"row": r, "failureClass": "ui-motion"} for r in rows]}
    lines = [f"Validation lifecycle kept {issue} in Validating.",
             *([f"Verified production generation: {SHA}."] if verified else []),
             *[f"- {kind}: no current receipt (UI change)" for kind in owed],
             "<!-- validation-manifest:v1", json.dumps(manifest), "-->", "<!-- validation-lifecycle:v1 abc123 -->"]
    return {"id": "c-" + issue, "body": "\n".join(lines), "createdAt": iso(at)}


def receipt(kind, status, evidence="x", at=NOW - 600, issue="JOV-1"):
    body = "<!-- validation-receipt:v1\n" + json.dumps({"issue": issue, "kind": kind, "status": status, "sha": SHA, "evidence": evidence}) + "\n-->"
    return {"id": f"r-{kind}-{at}", "body": body, "createdAt": iso(at)}


def issue(identifier="JOV-1", entered=NOW - 3 * 86400, comments=None, title="Sidebar polish", risk="low", labels=()):
    return {"id": f"uuid-{identifier}", "identifier": identifier, "title": title, "labels": {"nodes": [{"name": n} for n in labels]},
            "history": {"nodes": [{"createdAt": iso(entered), "toState": {"name": "Validating"}}]},
            "comments": {"nodes": comments if comments is not None else [lifecycle(issue=identifier, at=entered + 60, risk=risk)]}}


class PolicyTest(unittest.TestCase):
    def test_wait_is_base_by_risk_times_factor_by_confidence_from_config(self):
        table = {(r, c): td.wait_hours(r, c, POLICY) for r in ("low", "medium", "high") for c in ("high", "medium", "low")}
        self.assertEqual(table[("low", "high")], 2.0)
        self.assertEqual(table[("low", "medium")], 4.0)
        self.assertEqual(table[("medium", "medium")], 24.0)
        self.assertEqual(table[("high", "medium")], 72.0)
        self.assertEqual(table[("high", "low")], 144.0)
        self.assertEqual(table[("high", "high")], 36.0)
        tuned = json.loads(json.dumps(POLICY))
        tuned["baseHours"]["low"] = 1
        tuned["confidenceFactor"]["high"] = 0.1
        self.assertEqual(td.wait_hours("low", "high", tuned), tuned["minHours"], "never below the floor")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump({"baseHours": {"low": 4, "medium": 24, "high": -1}, "confidenceFactor": POLICY["confidenceFactor"]}, handle)
        with self.assertRaises(ValueError):
            td.load_policy(Path(handle.name))

    def test_risk_comes_from_the_manifest_and_money_auth_privacy_force_high(self):
        manifest = {"riskLevel": "low", "required": []}
        self.assertEqual(td.classify_risk({"title": "Sidebar spacing"}, manifest, POLICY)[0], "low")
        self.assertEqual(td.classify_risk({"title": "Checkout button color"}, manifest, POLICY)[0], "high")
        self.assertEqual(td.classify_risk({"title": "x", "labels": {"nodes": [{"name": "privacy"}]}}, manifest, POLICY)[0], "high")
        self.assertEqual(td.classify_risk({"title": "x"}, {"riskLevel": "medium"}, POLICY)[0], "medium")
        self.assertEqual(td.classify_risk({"title": "x"}, {}, POLICY)[0], "medium")
        self.assertEqual(td.classify_risk({"title": "x"}, {"required": [{"reason": "billing flow"}]}, POLICY)[0], "high")

    def test_confidence_scores_review_receipts_and_prior_calls(self):
        recent = [{"kind": "outcome", "status": "pass"}, {"kind": "screen-audit", "status": "pass"}]
        supported = {"verdict": "supported"}
        self.assertEqual(td.score_confidence(["AM-018"], recent, supported, {}, POLICY, NOW)[:2], ("high", 3))
        self.assertEqual(td.score_confidence(["AM-018"], [], None, {}, POLICY, NOW)[:2], ("medium", 0))
        self.assertEqual(td.score_confidence(["AM-018"], [], {"verdict": "contradicted"}, {}, POLICY, NOW)[:2], ("low", -2))
        reversed_ = {"AM-018": {"accepted": 5, "reversed": 1, "lastReversedAt": NOW - 86400}}
        level, score, signals = td.score_confidence(["AM-018"], recent, supported, reversed_, POLICY, NOW)
        self.assertEqual((level, score), ("medium", 1), "a reversal costs two points")
        self.assertTrue(any("reversed" in s for s in signals))
        old = {"AM-018": {"accepted": 0, "reversed": 1, "lastReversedAt": NOW - 90 * 86400}}
        self.assertEqual(td.score_confidence(["AM-018"], [], None, old, POLICY, NOW)[1], 0, "reversals age out")
        stable = {"AM-018": {"accepted": 3, "reversed": 0}}
        self.assertEqual(td.score_confidence(["AM-018"], [], None, stable, POLICY, NOW)[1], 1)

    def test_deadline_records_risk_confidence_default_and_holds_when_the_reviewer_contradicts(self):
        low = td.taste_ask(issue(entered=NOW - 5 * 3600), NOW, POLICY)
        self.assertEqual((low["risk"], low["confidence"], low["waitHours"], low["due"]), ("low", "medium", 4.0, True))
        self.assertEqual(low["deadlineAt"], NOW - 5 * 3600 + 4 * 3600)
        self.assertIn("ship", low["default"])
        high = td.taste_ask(issue(title="Billing page redesign", entered=NOW - 5 * 3600), NOW, POLICY)
        self.assertEqual((high["risk"], high["waitHours"], high["due"]), ("high", 72.0, False))
        confident = td.taste_ask(issue(entered=NOW - 3 * 3600, comments=[lifecycle(at=NOW - 3 * 3600), receipt("outcome", "pass"),
                                                                       receipt("screen-audit", "pass")]), NOW, POLICY, {}, {"verdict": "supported"})
        self.assertEqual((confident["confidence"], confident["waitHours"], confident["due"]), ("high", 2.0, True))
        contradicted = td.taste_ask(issue(entered=NOW - 3 * 86400), NOW, POLICY, {}, {"verdict": "contradicted"})
        self.assertEqual((contradicted["confidence"], contradicted["due"], contradicted["held"]), ("low", False, True))
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(owed=("screen-audit",))]), NOW, POLICY))
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(verified=False)]), NOW, POLICY))
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(issue="JOV-9")]), NOW, POLICY))

    def test_receipt_states_the_basis_of_the_default(self):
        ask = td.taste_ask(issue(entered=NOW - 5 * 3600), NOW, POLICY)
        args = td.receipt_args("JOV-1", ask)
        evidence = args[args.index("--evidence") + 1]
        self.assertTrue(evidence.startswith("default-accepted: risk=low confidence=medium wait=4.0h"))
        self.assertIn("default = ship", evidence)
        self.assertEqual(args[args.index("--kind") + 1], "founder-taste")
        self.assertEqual(args[args.index("--status") + 1], "pass")


class PassTest(unittest.TestCase):
    def run_pass(self, issues, *, existing=None, tracked=None, dry_run=False, now=NOW):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        if existing:
            td.write_state(state, {**td.read_state(state), **existing})
        comments, calls = [], []
        tracked = tracked or {}

        class Linear:
            def __init__(self, env):
                pass
            def gql(self, query, variables):
                if "pageInfo" in query:
                    return {"issues": {"nodes": issues, "pageInfo": {"hasNextPage": False, "endCursor": None}}}
                if "state{name}" in query:
                    return {"issue": tracked.get(variables["id"])}
                return {"issues": {"nodes": [{"id": "digest-issue"}]}}
            def comment(self, issue_id, body):
                comments.append((issue_id, body))

        host = SimpleNamespace(state=state, repo=state / "repo", linear_env=None)
        run = lambda args, **kw: (calls.append((list(args), kw)) or subprocess.CompletedProcess(
            args, 0, "<!-- validation-receipt:v1 -->" if "linear-sync-on-merge.mjs" in " ".join(map(str, args)) else "", ""))
        with patch.object(td.outcome_lane, "app_authorization", return_value="Bearer app"), \
                patch.object(td.outcome_lane, "node24_path", return_value="/n24/bin"), \
                patch.object(td.esc, "gateway_key", return_value=None):
            result = td.run_pass(host, SimpleNamespace(Linear=Linear), now=now, dry_run=dry_run, run=run, policy=POLICY)
        return result, calls, comments, state

    def test_due_items_ship_on_default_waiting_items_get_a_recorded_deadline_and_the_digest_says_so(self):
        due = issue("JOV-1", entered=NOW - 6 * 3600)                     # low risk, 4h wait: due
        waiting = issue("JOV-2", entered=NOW - 6 * 3600, title="Billing copy")  # high risk, 72h: waiting
        result, calls, comments, state = self.run_pass([due, waiting])
        self.assertEqual((result["recorded"], result["waiting"], result["digest"]), (["JOV-1"], 1, "posted"))
        node = [c for c in calls if c[0][0] == "node"]
        self.assertEqual(len(node), 1)
        self.assertEqual(node[0][1]["env"]["LINEAR_API_KEY"], "Bearer app")
        self.assertTrue(any("worktree" in c[0] and "add" in c[0] for c in calls), "receipt CLI runs from a checkout of the verified sha")
        stored = td.read_state(state)["proposals"]
        self.assertEqual((stored["JOV-1"]["status"], stored["JOV-1"]["decidedBy"]), ("defaulted", "default"))
        self.assertEqual((stored["JOV-2"]["status"], stored["JOV-2"]["risk"], stored["JOV-2"]["waitHours"]), ("waiting", "high", 72.0))
        self.assertGreater(stored["JOV-2"]["deadlineAt"], NOW)
        text = comments[0][1]
        self.assertIn("feedback, not approval", text)
        self.assertIn("risk high, confidence medium", text)
        self.assertIn(td._iso(stored["JOV-2"]["deadlineAt"]), text)
        ledger = [json.loads(l) for l in (state / "runs/ledger.jsonl").read_text().splitlines()]
        self.assertEqual((ledger[0]["kind"], ledger[0]["verdict"], ledger[0]["risk"]), ("taste-decision", "defaulted", "low"))
        # Idempotent: the same facts record nothing twice.
        again, calls2, comments2, _ = self.run_pass([due, waiting], existing=td.read_state(state), now=NOW + 60)
        self.assertEqual((again["recorded"], [c for c in calls2 if c[0][0] == "node"], comments2), ([], [], []))

    def test_tim_deciding_early_wins_and_a_later_fail_is_a_reversal_that_lowers_confidence(self):
        early = issue("JOV-3", entered=NOW - 3600, title="Billing copy")
        result, _, _, state = self.run_pass([early])
        self.assertEqual(result["recorded"], [])
        decided = {"id": "u3", "identifier": "JOV-3", "state": {"name": "Done"}, "comments": {"nodes": [
            lifecycle(issue="JOV-3"), receipt("founder-taste", "pass", evidence="looks right", at=NOW + 600, issue="JOV-3")]}}
        result, calls, _, state = self.run_pass([], existing=td.read_state(state), tracked={"JOV-3": decided}, now=NOW + 900)
        proposal = td.read_state(state)["proposals"]["JOV-3"]
        self.assertEqual((proposal["status"], proposal["decidedBy"], [c for c in calls if c[0][0] == "node"]), ("decided-pass", "founder", []))
        self.assertEqual(result["metrics"]["decidedByTim"], 1)
        # A default Tim later fails: reversal recorded, learning lowers confidence on the same rows.
        shipped = issue("JOV-4", entered=NOW - 6 * 3600)
        _, _, _, state = self.run_pass([shipped])
        reversal = {"id": "u4", "identifier": "JOV-4", "state": {"name": "Rework"}, "comments": {"nodes": [
            receipt("founder-taste", "fail", evidence="motion is wrong", at=NOW + 3000, issue="JOV-4")]}}
        result, _, _, state = self.run_pass([], existing=td.read_state(state), tracked={"JOV-4": reversal}, now=NOW + 4000)
        data = td.read_state(state)
        self.assertTrue(data["proposals"]["JOV-4"]["reversedAt"])
        self.assertEqual(data["learning"]["AM-018"]["reversed"], 1)
        self.assertEqual((result["metrics"]["reversed"], result["metrics"]["reversedPct"], result["metrics"]["shippedOnDefaultPct"]), (1, 100.0, 100.0))
        similar = td.taste_ask(issue("JOV-5", entered=NOW), NOW + 5000, POLICY, data["learning"],
                               {"verdict": "supported"})
        self.assertEqual((similar["confidence"], similar["waitHours"]), ("low", 8.0), "supported review +1, reversal -2 on the same row")
        fresh = td.taste_ask(issue("JOV-6", entered=NOW), NOW + 5000, POLICY, {}, {"verdict": "supported"})
        self.assertEqual((fresh["confidence"], fresh["waitHours"]), ("medium", 4.0))

    def test_metrics_report_time_to_decision_and_shares(self):
        proposals = {
            "A": {"status": "defaulted", "enteredAt": 0, "decidedAt": 4 * 3600},
            "B": {"status": "defaulted", "enteredAt": 0, "decidedAt": 24 * 3600, "reversedAt": 99},
            "C": {"status": "decided-pass", "enteredAt": 0, "decidedAt": 2 * 3600},
            "D": {"status": "waiting", "enteredAt": 0}}
        metrics = td.compute_metrics(proposals)
        self.assertEqual((metrics["decided"], metrics["waiting"], metrics["defaulted"], metrics["decidedByTim"]), (3, 1, 2, 1))
        self.assertEqual((metrics["timeToDecisionHoursP50"], metrics["shippedOnDefaultPct"], metrics["reversedPct"]), (4.0, 66.7, 50.0))

    def test_dry_run_and_tick(self):
        result, calls, comments, state = self.run_pass([issue("JOV-1", entered=NOW - 6 * 3600)], dry_run=True)
        self.assertEqual((calls, comments, result["recorded"]), ([], [], ["JOV-1"]))
        self.assertEqual(result["proposals"]["JOV-1"]["waitHours"], 4.0)
        self.assertFalse((state / td.STATE_FILE).exists())
        with tempfile.TemporaryDirectory() as raw:
            host, spawned = SimpleNamespace(state=Path(raw)), []
            spawn = lambda *a, **k: spawned.append(a)
            clean = {k: v for k, v in __import__("os").environ.items()
                     if k not in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND", "LANES_TASTE_DEFAULT")}
            with patch.dict("os.environ", clean, clear=True):
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "spawned")
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "not-due")
            with patch.dict("os.environ", {"LANES_SELFTEST": "1"}):
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "selftest-skipped")


if __name__ == "__main__":
    unittest.main()


class ReceiptSafetyTest(PassTest):
    def test_a_zero_exit_without_a_posted_receipt_is_not_a_default(self):
        # An old checkout's script ignores `receipt` and exits 0 after a sweep: no marker in stdout means not posted.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)

        class Linear:
            def __init__(self, env):
                pass
            def gql(self, query, variables):
                return {"issues": {"nodes": [issue("JOV-1", entered=NOW - 6 * 3600)], "pageInfo": {"hasNextPage": False}}} if "pageInfo" in query else {"issue": None}
            def comment(self, *a):
                pass

        host = SimpleNamespace(state=state, repo=state / "repo", linear_env=None)
        run = lambda args, **kw: subprocess.CompletedProcess(args, 0, "swept 3 issues", "")
        with patch.object(td.outcome_lane, "app_authorization", return_value="Bearer app"), patch.object(td.esc, "gateway_key", return_value=None):
            result = td.run_pass(host, SimpleNamespace(Linear=Linear), now=NOW, run=run, policy=POLICY)
        self.assertEqual((result["recorded"], result["failed"]), ([], ["JOV-1"]))
        self.assertEqual(td.read_state(state)["proposals"]["JOV-1"]["status"], "waiting")

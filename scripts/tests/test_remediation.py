"""Symphony central remediation: classifier, router, ladder, caps, intake (JOV-7540)."""
from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


remediation = load("remediation")

HEAD = "7cf5b07"
NOW = 2_000_000_000.0


def checks(n=1, conclusion="SUCCESS", status="COMPLETED", name="ci"):
    return [{"name": f"{name}-{i}" if n > 1 else name, "status": status, "conclusion": conclusion}
            for i in range(n)]


def pr(**extra):
    base = {"number": 1, "headRefOid": HEAD, "isDraft": False, "mergeStateStatus": "CLEAN",
            "labels": [], "statusCheckRollup": checks(3), "autoMergeRequest": None}
    base.update(extra)
    return base


def providers():
    return {
        "devin": {"enabled": True, "tier": 0},
        "codex": {"enabled": True, "tier": 1},
        "claude": {"enabled": False, "tier": 2},
        "hyperagent": {"enabled": False, "tier": 3},
        "grok": {"enabled": False, "tier": 4},
        "kimi": {"enabled": False, "tier": 5},
        "host-local": {"enabled": True, "tier": 6},
    }


class ClassifierFixtureTest(unittest.TestCase):
    def test_stuck_pr_fixtures(self):
        ready = pr(number=20079, statusCheckRollup=checks(39))
        self.assertEqual(remediation.classify_blocker(ready, {"sha": "ed4d35e", "reason": "fix-exhausted"})["cls"], "ready")
        self.assertEqual(remediation.classify_blocker(ready)["next_action"], "arm")

        dirty = pr(number=20074, mergeStateStatus="DIRTY", labels=[{"name": "lane-fix-exhausted"}],
                   conflictFiles=["src/a.ts", "src/b.ts"],
                   reviewThreads=[{"resolved": False, "bot": True, "severity": "CRITICAL",
                                   "body": "PublicationStorySchema id required", "author": "sentry[bot]"},
                                  {"resolved": False, "bot": True, "severity": "HIGH",
                                   "body": "summary-vs-bullet removed"}])
        classified = remediation.classify_blocker(dirty)
        self.assertEqual((classified["cls"], classified["subtype"]), ("needs-rebase", "semantic"))
        self.assertTrue(any("bot review" in line for line in classified["evidence"]))

        strategy = pr(number=20062, isDraft=True, labels=[{"name": "hold"}], files=["canon/strategy/theses.md"],
                      reviewThreads=[{"resolved": False, "bot": True, "body": "supersededBy cycle"}])
        self.assertEqual(remediation.classify_blocker(strategy)["cls"], "needs-human-decision")

        rebase = pr(number=20035, mergeStateStatus="DIRTY",
                    labels=[{"name": "lane-fix-conflict"}, {"name": "lane-fix-exhausted"}, {"name": "queue-poison"}])
        self.assertEqual(remediation.classify_blocker(rebase)["cls"], "needs-rebase")

        failing = pr(number=20020, isDraft=True, labels=[{"name": "lane-fix-red"}, {"name": "lane-fix-exhausted"}],
                     statusCheckRollup=[{"name": "component-ship-gate", "status": "COMPLETED", "conclusion": "FAILURE",
                                         "excerpt": "missing LibraryFilesPanel.stories.tsx"}])
        fixable = remediation.classify_blocker(failing, None, {"count": 2, "pushed": False, "sha": HEAD})
        self.assertEqual(fixable["cls"], "fixable-by-model")
        self.assertTrue(any("did not move the head" in line for line in fixable["evidence"]))

        waiting = pr(number=19776, mergeStateStatus="BLOCKED",
                     labels=[{"name": "lane-fix-exhausted"}, {"name": "queue-poison"}],
                     statusCheckRollup=checks(2) + [{"name": "Exact-head Coverage", "status": "IN_PROGRESS", "conclusion": ""}])
        self.assertEqual(remediation.classify_blocker(waiting)["subtype"], "awaiting")

        held = pr(number=18985, labels=[{"name": "hold"}, {"name": "queue-poison"}],
                  holdNote={"author": "itstimwhite",
                            "body": "use computeRatePercent from @/lib/analytics/metrics and remove hold"})
        human = remediation.classify_blocker(held)
        self.assertEqual((human["cls"], human["subtype"]), ("fixable-by-model", "human-hold"))

    def test_lockfile_only_and_main_red_and_events(self):
        lock = pr(mergeStateStatus="DIRTY", conflictFiles=["pnpm-lock.yaml"])
        self.assertEqual(remediation.classify_blocker(lock)["subtype"], "lockfile-only")
        overlap = pr(statusCheckRollup=[{"name": "CI", "status": "COMPLETED", "conclusion": "FAILURE"}])
        main = [{"name": "CI", "conclusion": "FAILURE"}]
        self.assertEqual(remediation.classify_blocker(overlap, main_rollup=main)["subtype"], "main-red")
        event = remediation.classify_event({"source": "pr", "pr": overlap, "main_rollup": main})
        self.assertEqual(event["cls"], "main-red")
        self.assertEqual(remediation.classify_event({"source": "main-ci", "main_red": True, "evidence": {}})["cls"], "main-red")
        scheduled = remediation.classify_event({"source": "schedule", "evidence": {"excerpt": "runner has been lost"}})
        self.assertEqual(scheduled["cls"], "flaky-infra")
        self.assertEqual(remediation.classify_event({"source": "deploy", "evidence": {"excerpt": "prod"}})["cls"],
                         "fixable-by-model")
        self.assertEqual(remediation.classify_event({"source": "sentry", "evidence": {}})["subtype"], "sentry")


class RouterLadderTest(unittest.TestCase):
    def test_disabled_lanes_including_hyperagent_are_never_chosen(self):
        catalog = providers()
        healthy = lambda name, spec: True
        chosen = remediation.route_lane(catalog, healthy=healthy)
        self.assertEqual(chosen["lane"], "devin")
        nxt = remediation.failover(catalog, "devin", "provider-error", healthy=healthy)
        self.assertEqual(nxt["to"], "codex")
        self.assertEqual(nxt["reason"], "provider-error")
        for reason in ("error", "404", "exhausted", "unhealthy"):
            skipped = remediation.failover(catalog, "codex", reason, exclude={"devin"}, healthy=lambda name, spec: name != "codex")
            self.assertNotIn(skipped["to"], {"hyperagent", "claude", "grok", "kimi", "codex"})
            self.assertEqual(skipped["to"], "host-local")
        self.assertIsNone(remediation.route_lane(
            {name: spec for name, spec in catalog.items() if name != "host-local"},
            exclude={"devin", "codex"}, healthy=healthy))

    def test_escalation_picks_a_stronger_tier_then_one_top_rung(self):
        catalog = providers()
        healthy = lambda name, spec: True
        first = remediation.select_escalation_lane(catalog, {"devin"}, healthy=healthy)
        self.assertEqual((first["lane"], first["topRung"]), ("codex", False))
        top = remediation.select_escalation_lane(catalog, {"devin", "codex", "host-local"}, healthy=healthy)
        self.assertEqual((top["lane"], top["topRung"]), ("host-local", True))
        self.assertIsNone(remediation.select_escalation_lane(
            catalog, {"devin", "codex", "host-local"}, healthy=healthy, top_rung_used=True))

    def test_deterministic_rungs_spend_no_model_and_caps_stop_the_ladder(self):
        catalog = providers()
        record = {}
        classified = {"cls": "needs-rebase", "subtype": "semantic", "next_action": "update-branch"}
        plan = remediation.plan_ladder(classified, record, catalog, NOW, HEAD)
        self.assertEqual(plan["kind"], "deterministic")
        record = remediation.append_rung(record, rung="update-branch", lane=None, cls="needs-rebase",
                                         at=NOW, head=HEAD, kind="deterministic", ok=False)
        self.assertEqual(record.get("count", 0), 0)
        model = remediation.plan_ladder(classified, record, catalog, NOW, HEAD)
        self.assertEqual(model["action"], "model")
        record = remediation.append_rung(record, rung="escalate", lane="devin", cls="needs-rebase",
                                         at=NOW - 10, head=HEAD, kind="model")
        record = remediation.append_rung(record, rung="escalate", lane="codex", cls="needs-rebase",
                                         at=NOW - 10, head=HEAD, kind="model")
        blocked = remediation.plan_ladder(classified, record, catalog, NOW, HEAD)
        self.assertEqual(blocked["reason"], "ladder-exhausted")
        cooled = remediation.append_rung({}, rung="escalate", lane="devin", cls="fixable-by-model",
                                         at=NOW - 10, head=HEAD, kind="model")
        wait = remediation.plan_ladder({"cls": "fixable-by-model", "subtype": "check", "next_action": "escalate"},
                                       cooled, catalog, NOW, HEAD)
        self.assertEqual(wait["reason"], "cooldown")
        prior = {"priorEscalations": [{"kind": "model", "head": "old", "at": 1}] * 4, "escalations": []}
        self.assertEqual(remediation.caps_allow(prior, HEAD, NOW)[1], "ladder-exhausted")

    def test_flag_defaults(self):
        for name in ("LANES_ESCALATION", "LANES_ESCALATION_NOTIFY_TIM", "LANES_ESCALATION_LIFT_HUMAN_HOLDS"):
            os.environ.pop(name, None)
        self.assertTrue(remediation.escalation_enabled())
        self.assertFalse(remediation.notify_tim())
        self.assertFalse(remediation.lift_human_holds())
        self.assertFalse(remediation.stuck_pr_escalation_enabled())
        os.environ["LANES_ESCALATION"] = "0"
        try:
            plan = remediation.plan_ladder({"cls": "fixable-by-model", "subtype": "check", "next_action": "escalate"},
                                           {}, providers(), NOW, HEAD)
            self.assertEqual(plan["reason"], "escalation-disabled")
        finally:
            os.environ.pop("LANES_ESCALATION", None)

    def test_surface_and_hold_nag_dedupe(self):
        body = remediation.surface_body(pr(number=9), {"cls": "needs-human-decision", "subtype": "hold",
                                                       "evidence": ["wait"], "next_action": "tim-decides"}, "hold")
        self.assertIn("symphony-surface pr=9", body)
        self.assertTrue(remediation.already_surfaced([body], 9, HEAD))
        self.assertFalse(remediation.already_surfaced([body], 9, "other"))
        self.assertTrue(remediation.hold_nag_due({}, 9, HEAD, NOW))
        self.assertFalse(remediation.hold_nag_due({"9": {"head": HEAD, "at": NOW - 10}}, 9, HEAD, NOW))
        self.assertTrue(remediation.hold_nag_due({"9": {"head": HEAD, "at": NOW - remediation.HOLD_NAG_S - 1}}, 9, HEAD, NOW))


class DoctorAndIntakeTest(unittest.TestCase):
    def test_doctor_blocks_count_classes_and_alert(self):
        snapshot = {"classified": [{"pr": 1, "cls": "ready"}, {"pr": 2, "cls": "needs-human-decision"}],
                    "escalating": [2], "ladderExhausted": [3],
                    "surfaced": [{"pr": 3, "cls": "needs-human-decision", "reason": "ladder-exhausted"}],
                    "attempts": [{"pr": 2, "at": NOW - 10, "lane": "codex"}],
                    "bySource": {"pr": 2, "sentry": 1}, "routedByLane": {"codex": 1},
                    "failovers": [{"at": NOW - 5, "reason": "404"}]}
        report = remediation.escalation_summary(snapshot, [], NOW)
        self.assertEqual(report["by_class"]["ready"], 1)
        self.assertEqual(report["escalating"], 1)
        self.assertEqual(report["ladder_exhausted"], 1)
        self.assertEqual(report["attempts24h"], 1)
        self.assertEqual(report["surfaced"][0]["pr"], 3)
        remediation_report = remediation.remediation_summary(snapshot, [], NOW)
        self.assertEqual(remediation_report["by_source"]["sentry"], 1)
        self.assertEqual(remediation_report["failovers24h"], 1)
        self.assertIn("#3", remediation.alert_reason(report))
        self.assertIsNone(remediation.alert_reason(remediation.empty_escalation()))

    def test_non_pr_events_fingerprint_and_claim_window(self):
        deploy = remediation.non_pr_event("deployment_status", {
            "deployment_status": {"state": "failure", "description": "boom", "created_at": "2026-10-02T00:00:00Z"},
            "deployment": {"environment": "production", "sha": "abc"}})
        self.assertEqual(deploy["source"], "deploy")
        self.assertEqual(deploy["ws"], "release-deploy")
        self.assertIsNone(remediation.non_pr_event("deployment_status", {"deployment_status": {"state": "success"}}))
        sentry = remediation.non_pr_event("repository_dispatch", {"action": "sentry-issue",
                                                                 "client_payload": {"issue_id": "99", "title": "x"}})
        self.assertEqual(sentry["ws"], "reliability")
        again = remediation.event_from_sentry({"issue_id": "99", "title": "x"})
        self.assertEqual(sentry["fingerprint"], again["fingerprint"])
        self.assertTrue(remediation.claim_open(NOW - 60, NOW))
        self.assertFalse(remediation.claim_open(NOW - remediation.CLAIM_WINDOW_S - 1, NOW))
        plan = remediation.linear_intake_plan(sentry)
        self.assertIn("remediation", plan["labels"])
        self.assertIn("agent-ready", plan["labels"])
        self.assertIn("ws:reliability", plan["labels"])
        self.assertIsNone(remediation.non_pr_event("workflow_run", {"workflow_run": {
            "event": "pull_request", "conclusion": "failure", "pull_requests": [{"number": 1}]}}))

    def test_registry_keeps_hyperagent_disabled(self):
        catalog = json_providers()
        self.assertFalse(catalog["hyperagent"]["enabled"])
        self.assertFalse(catalog["grok"]["enabled"])
        self.assertFalse(catalog["kimi"]["enabled"])
        chosen = remediation.route_lane(catalog, healthy=lambda name, spec: True)
        self.assertNotEqual(chosen["lane"], "hyperagent")
        self.assertNotIn("hyperagent", {spec and name for name, spec in catalog.items() if not spec.get("enabled", True)} & {chosen["lane"]})

def linear_issue(identifier, fingerprint, *, state="unstarted", title="", description="",
                 created="2026-10-01T00:00:00Z", team="JOV", updated="2026-10-02T00:00:00Z"):
    name = "Todo" if state == "unstarted" else ("Done" if state == "completed" else state)
    return {
        "id": "id-" + identifier, "identifier": identifier, "title": title or fingerprint,
        "description": description, "createdAt": created, "updatedAt": updated,
        "url": f"https://linear.app/jov/{identifier}",
        "state": {"name": name, "type": state},
        "team": {"key": team, "states": {"nodes": [
            {"id": f"todo-{team}", "name": "Todo", "type": "unstarted"},
            {"id": f"ip-{team}", "name": "In Progress", "type": "started"},
        ]}},
        "labels": {"nodes": [{"id": "lab-" + fingerprint, "name": f"remediation:{fingerprint}"}]},
    }


class LabeledEventTest(unittest.TestCase):
    def setUp(self):
        os.environ.pop("LANES_ESCALATION_NOTIFY_TIM", None)

    def test_example_fingerprints_and_musicfetch_cutover(self):
        cases = {
            "asc-agreements": "human-only",
            "billing-health-public": "fixable-by-agent",
            "stripe-reconcile": "fixable-by-agent",
            "e2e-login-timeout": "fixable-by-agent",
            "synthetic-monitoring": "fixable-by-agent",
            "golden-path-nightly": "fixable-by-agent",
            "flaky-test-filing": "fixable-by-agent",
            "codeowners-drift": "fixable-by-agent",
        }
        for fingerprint, cls in cases.items():
            classified = remediation.classify_labeled_event(fingerprint, fingerprint, "")
            self.assertEqual(classified["cls"], cls, fingerprint)
        self.assertEqual(remediation.classify_labeled_event("asc-agreements")["subtype"], "store submission")
        for phrase, category in (
                ("approve spend for the vendor", "spend"),
                ("billing action on the live customer", "billing action"),
                ("env/DNS/secrets rotated by hand", "env/DNS/secrets"),
                ("store submission is waiting", "store submission"),
                ("needs an outside human", "outside human"),
                ("manual deploy of the worker", "manual deploy"),
        ):
            classified = remediation.classify_labeled_event("gap", "gap", phrase)
            self.assertEqual((classified["cls"], classified["subtype"]), ("human-only", category), phrase)
        renew = remediation.classify_labeled_event(
            "musicfetch-quota", "Renew MusicFetch", "please renew MusicFetch before Friday")
        self.assertEqual(renew["cls"], "fixable-by-agent")
        self.assertEqual(renew["subtype"], "musicfetch-cutover")
        self.assertEqual(renew["next_action"], "JOV-7323")
        dossier = remediation.event_dossier(renew, "Renew MusicFetch", "JOV-9")
        self.assertIn("JOV-7323", dossier)
        self.assertIn("Do not renew MusicFetch", dossier)
        self.assertNotIn("please renew", dossier.lower())

    def test_one_open_event_per_fingerprint_and_recurrence_reopens(self):
        older = linear_issue("JOV-1", "stripe-reconcile", created="2026-10-01T00:00:00Z")
        newer = linear_issue("JOV-2", "stripe-reconcile", created="2026-10-02T00:00:00Z", team="LYB")
        plan = remediation.plan_labeled_events([newer, older], {}, providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(list(plan["events"]), ["stripe-reconcile"])
        self.assertEqual(plan["events"]["stripe-reconcile"]["identifier"], "JOV-1")
        self.assertEqual(plan["events"]["stripe-reconcile"]["status"], "claimed")
        self.assertEqual(plan["events"]["stripe-reconcile"]["lane"], "codex")
        self.assertEqual([row["id"] for row in plan["comments"]], ["id-JOV-2"])
        self.assertEqual(plan["reopens"], [])
        again = remediation.plan_labeled_events([older, newer], plan["events"], providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(again["comments"], [])
        self.assertEqual(again["events"]["stripe-reconcile"]["attempts"], plan["events"]["stripe-reconcile"]["attempts"])

        closed = linear_issue("JOV-1", "e2e-login-timeout", state="completed", created="2026-09-01T00:00:00Z")
        opened = linear_issue("JOV-8", "e2e-login-timeout", created="2026-10-02T00:00:00Z")
        recur = remediation.plan_labeled_events(
            [opened, closed], {"e2e-login-timeout": {"issueId": "id-JOV-1", "status": "done", "attempts": [
                {"kind": "model", "lane": "codex", "head": "e2e-login-timeout", "at": NOW - 100},
            ]}},
            providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(recur["events"]["e2e-login-timeout"]["identifier"], "JOV-8")
        self.assertEqual(recur["events"]["e2e-login-timeout"]["issueId"], "id-JOV-8")
        self.assertEqual(recur["events"]["e2e-login-timeout"]["recurrence"], 1)
        self.assertEqual(recur["events"]["e2e-login-timeout"]["attemptCount"], 1)
        self.assertEqual(recur["reopens"], [])
        self.assertFalse(any(row.get("id") == "id-JOV-8" and "not a second event" in row["body"]
                             for row in recur["comments"]))

    def test_human_and_exhausted_ping_is_behind_the_flag(self):
        human = linear_issue("JOV-3", "asc-agreements", title="ASC agreements blocked")
        quiet = remediation.plan_labeled_events([human], {}, providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(quiet["events"]["asc-agreements"]["status"], "human")
        self.assertIn("store submission", quiet["events"]["asc-agreements"]["ask"])
        self.assertEqual(quiet["comments"], [])
        self.assertEqual(quiet["labels"], [])
        os.environ["LANES_ESCALATION_NOTIFY_TIM"] = "1"
        try:
            loud = remediation.plan_labeled_events([human], {}, providers(), NOW, healthy=lambda *_: True)
        finally:
            os.environ.pop("LANES_ESCALATION_NOTIFY_TIM", None)
        self.assertEqual(len(loud["comments"]), 1)
        self.assertIn("needs-human `ccf5eaaa-8705-49f0-b264-ec3558d678b7`", loud["comments"][0]["body"])
        self.assertEqual(loud["labels"], [{"id": "id-JOV-3", "labelId": remediation.NEEDS_HUMAN_LABEL_ID}])
        held = remediation.plan_labeled_events([human], loud["events"], providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(held["comments"], [])

        spent = {"stripe-reconcile": {
            "issueId": "id-JOV-4", "status": "claimed", "release": True, "lane": None,
            "attempts": [
                {"kind": "model", "lane": "codex", "head": "stripe-reconcile", "at": NOW - 10000},
                {"kind": "model", "lane": "devin", "head": "stripe-reconcile", "at": NOW - 9000, "topRung": True},
            ],
        }}
        exhausted = remediation.plan_labeled_events(
            [linear_issue("JOV-4", "stripe-reconcile")], spent, providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(exhausted["events"]["stripe-reconcile"]["status"], "exhausted")
        self.assertEqual(exhausted["labels"], [])
        self.assertTrue(exhausted["events"]["stripe-reconcile"]["ask"])

    def test_failover_picks_a_stronger_live_lane(self):
        recorded = {"synthetic-monitoring": {
            "issueId": "id-JOV-5", "status": "claimed", "release": True, "lane": None,
            "attempts": [{"kind": "model", "lane": "codex", "head": "synthetic-monitoring", "at": NOW - 10000}],
        }}
        plan = remediation.plan_labeled_events(
            [linear_issue("JOV-5", "synthetic-monitoring")], recorded, providers(), NOW,
            healthy=lambda *_: True, cooled={"codex"})
        self.assertEqual(plan["events"]["synthetic-monitoring"]["status"], "claimed")
        self.assertEqual(plan["events"]["synthetic-monitoring"]["lane"], "host-local")
        self.assertNotEqual(plan["events"]["synthetic-monitoring"]["lane"], "hyperagent")

    def test_doctor_counts_by_fingerprint(self):
        snapshot = {"events": {
            "stripe-reconcile": {"status": "claimed", "identifier": "JOV-4", "cls": "fixable-by-agent", "lane": "codex"},
            "asc-agreements": {"status": "human", "identifier": "JOV-3", "cls": "human-only", "ask": "Tim"},
            "e2e-login-timeout": {"status": "exhausted", "identifier": "JOV-8", "cls": "fixable-by-agent"},
            "old": {"status": "done", "identifier": "JOV-1", "cls": "fixable-by-agent"},
        }}
        report = remediation.events_summary(snapshot)
        self.assertEqual(report["eventsOpen"], 3)
        self.assertEqual(report["eventsClaimed"], 1)
        self.assertEqual(report["eventsHuman"], 1)
        self.assertEqual(report["eventsExhausted"], 1)
        self.assertEqual(report["byFingerprint"]["asc-agreements"]["state"], "human")
        self.assertEqual(report["byFingerprint"]["old"]["state"], "done")
        wrapped = remediation.remediation_summary(snapshot, [], NOW)
        self.assertEqual(wrapped["eventsClaimed"], 1)
        self.assertEqual(wrapped["byFingerprint"]["stripe-reconcile"]["issue"], "JOV-4")

    def test_closed_label_is_history_and_titles_do_not_match(self):
        """JOV-7544's title uses the colon form. Match the label, including across JOV and LYB."""
        titled = linear_issue(
            "JOV-7544", "unrelated-gap", title="vercel-deploy-failed:jovie-docs", team="JOV")
        labeled = linear_issue(
            "LYB-4", "vercel-deploy-failed:jovie-docs", title="docs project ERROR",
            team="LYB", created="2026-10-02T00:00:00Z")
        done = linear_issue(
            "JOV-1", "vercel-deploy-failed:jovie-docs", state="completed", title="old colon title",
            created="2026-09-01T00:00:00Z")
        plan = remediation.plan_labeled_events(
            [titled, labeled, done],
            {"vercel-deploy-failed:jovie-docs": {
                "issueId": "id-JOV-1", "status": "done",
                "attempts": [{"kind": "model", "lane": "codex", "head": "vercel-deploy-failed:jovie-docs", "at": 1},
                             {"kind": "model", "lane": "devin", "head": "vercel-deploy-failed:jovie-docs", "at": 2}],
            }},
            providers(), NOW, healthy=lambda *_: True)
        self.assertIn("unrelated-gap", plan["events"])
        self.assertEqual(plan["events"]["unrelated-gap"]["identifier"], "JOV-7544")
        event = plan["events"]["vercel-deploy-failed:jovie-docs"]
        self.assertEqual(event["identifier"], "LYB-4")
        self.assertEqual(event["team"], "LYB")
        self.assertEqual(event["recurrence"], 1)
        self.assertEqual(event["attemptCount"], 2)
        self.assertEqual(plan["reopens"], [])
        self.assertFalse(any(row.get("id") == "id-LYB-4" and "not a second event" in row["body"]
                             for row in plan["comments"]))
        self.assertNotEqual(event["fingerprint"], plan["events"]["unrelated-gap"]["fingerprint"])

    def test_router_flag_off_still_reopens_the_canonical_issue(self):
        os.environ["LANES_ESCALATION"] = "0"
        try:
            closed = linear_issue("JOV-1", "e2e-login-timeout", state="completed", created="2026-09-01T00:00:00Z")
            opened = linear_issue("JOV-8", "e2e-login-timeout", created="2026-10-02T00:00:00Z")
            recur = remediation.plan_labeled_events(
                [opened, closed], {"e2e-login-timeout": {"issueId": "id-JOV-1", "status": "done"}},
                providers(), NOW, healthy=lambda *_: True)
        finally:
            os.environ.pop("LANES_ESCALATION", None)
        self.assertEqual(recur["events"]["e2e-login-timeout"]["identifier"], "JOV-1")
        self.assertEqual(recur["reopens"], [{"id": "id-JOV-1", "stateId": "todo-JOV"}])

    def test_stuck_pr_ladder_is_off_and_sweep_labels_are_ordinary_events(self):
        os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        self.assertFalse(remediation.stuck_pr_escalation_enabled())
        os.environ["LANES_ESCALATION"] = "0"
        os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
        try:
            self.assertFalse(remediation.stuck_pr_escalation_enabled())
        finally:
            os.environ.pop("LANES_ESCALATION", None)
            os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
        try:
            self.assertTrue(remediation.stuck_pr_escalation_enabled())
        finally:
            os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        hold = linear_issue("JOV-7546", "pr-17708-hold", title="PR on hold")
        exhausted = linear_issue(
            "LYB-2", "pr-19776-conflict", title="lane-fix-exhausted", team="LYB")
        plan = remediation.plan_labeled_events(
            [hold, exhausted], {}, providers(), NOW, healthy=lambda *_: True)
        self.assertEqual(plan["events"]["pr-17708-hold"]["status"], "claimed")
        self.assertEqual(plan["events"]["pr-17708-hold"]["cls"], "fixable-by-agent")
        self.assertEqual(plan["events"]["pr-19776-conflict"]["identifier"], "LYB-2")
        self.assertEqual(plan["events"]["pr-19776-conflict"]["status"], "claimed")
        self.assertNotIn("stuck-pr", plan)


def json_providers():
    import json
    return json.loads((ROOT / "scripts/lanes/providers.json").read_text())


if __name__ == "__main__":
    unittest.main()

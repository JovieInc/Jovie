"""Cost-aware issue routing across the lanes (JOV-7706).

Run with:
    python3 -m pytest scripts/tests/test_issue_routing.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)
remediation = lane.remediation

PROVIDERS = json.loads((ROOT / "scripts/lanes/providers.json").read_text())
POLICY = json.loads((ROOT / "scripts/lanes/routing.json").read_text())


def issue(identifier="JOV-1", title="Tab indicator collapses on narrow screens", labels=(), description="body"):
    return {"identifier": identifier, "title": title, "description": description, "labels": list(labels)}


def lane_issue(identifier="JOV-1", title="Tab indicator collapses", labels=(), description="body"):
    return lane.Issue("id-" + identifier, identifier, title, description, 2, "2026-10-01T00:00:00Z", list(labels))


def availability(down=(), pressure=None):
    pressure = pressure or {}
    return lambda name, _route: {"ok": name not in down, "why": "down" if name in down else "ok",
                                 "pressure": pressure.get(name, 0)}


def chosen(decision):
    return decision["chosen"] and (decision["chosen"]["lane"], decision["chosen"]["model"])


class CapabilityFloorTest(unittest.TestCase):
    def test_default_is_standard(self):
        self.assertEqual(remediation.required_capability("Fix tab", "", [], POLICY)["capability"], "standard")

    def test_protected_surfaces_need_frontier(self):
        for title in ("Production controller never authorizes staging", "Merge queue drops batches",
                      "Model routing ignores quota", "Summer governor reorders P0s",
                      "Add migration for entitlements"):
            need = remediation.required_capability(title, "", [], POLICY)
            self.assertEqual(need["capability"], "frontier", title)
            self.assertTrue(need["reasons"][0].startswith("title:"))
        body = remediation.required_capability("Fix a flake", "touches .github/workflows/staging-controller.yml",
                                               [], POLICY)
        self.assertEqual(body["capability"], "frontier")
        label = remediation.required_capability("Fix", "", ["ws:release-deploy"], POLICY)
        self.assertEqual(label, {"capability": "frontier", "reasons": ["label:ws:release-deploy"]})

    def test_frozen_plan_is_bounded_unless_it_touches_a_protected_surface(self):
        self.assertEqual(remediation.required_capability("Rename helper", "<!-- frozen-plan v1 -->", [], POLICY),
                         {"capability": "bounded", "reasons": ["marker:<!-- frozen-plan"]})
        self.assertEqual(remediation.required_capability("Docs", "", ["ws:docs-changelog"], POLICY)["capability"],
                         "bounded")
        self.assertEqual(remediation.required_capability("Merge queue rename", "<!-- frozen-plan -->", [],
                                                         POLICY)["capability"], "frontier")

    def test_unknown_capability_ranks_as_standard(self):
        self.assertEqual(remediation.capability_rank("galaxy-brain"), remediation.capability_rank("standard"))


class RouteIssueTest(unittest.TestCase):
    def route(self, item, **kwargs):
        return remediation.route_issue(item, PROVIDERS, POLICY, kwargs.pop("availability", availability()), **kwargs)

    def test_standard_work_goes_to_free_devin_first_then_subsidized_then_sonnet(self):
        self.assertEqual(chosen(self.route(issue())), ("devin", "swe-2-medium"))
        self.assertEqual(chosen(self.route(issue(), availability=availability({"devin"}))),
                         ("hyperagent", "z-ai/glm-5.3"))
        decision = self.route(issue(), availability=availability({"devin", "hyperagent"}))
        self.assertEqual(chosen(decision), ("claude", "claude-sonnet-5-5"))
        self.assertIn("cheaper skipped: devin/swe-2-medium=down, hyperagent/z-ai/glm-5.3=down", decision["rationale"])

    def test_bounded_work_takes_the_cheapest_lane(self):
        decision = self.route(issue(labels=["mechanical"]))
        self.assertEqual(decision["required"], "bounded")
        self.assertEqual(chosen(decision), ("devin", "swe-2-medium"))

    def test_frontier_goes_to_opus_then_codex_as_claude_quota_fills(self):
        work = issue(title="Production controller rebinds superseded generations")
        decision = self.route(work)
        self.assertEqual(chosen(decision), ("claude", "claude-opus-5-5"))
        self.assertIn("below floor:", decision["rationale"])
        self.assertIn("devin/swe-2-medium", decision["rationale"])
        busy = self.route(work, availability=availability(pressure={"claude": 0.5}))
        self.assertEqual(chosen(busy), ("codex", "codex-default"))
        self.assertEqual(busy["chosen"]["effectiveCost"], 3.5)

    def test_frontier_never_falls_to_a_cheaper_lane(self):
        decision = self.route(issue(title="Merge queue admission"), availability=availability({"claude", "codex"}))
        self.assertIsNone(decision["chosen"])
        self.assertIn("held, never downgraded", decision["rationale"])
        self.assertEqual({row["lane"] for row in decision["candidates"]}, {"claude", "codex"})

    def test_no_enabled_route_for_the_floor_is_held(self):
        only_cheap = {"devin": PROVIDERS["devin"]}
        decision = remediation.route_issue(issue(title="Merge queue"), only_cheap, POLICY, availability())
        self.assertIsNone(decision["chosen"])
        self.assertIn("no enabled route", decision["rationale"])

    def test_explicit_route_label_pins_lane_and_model_above_the_floor(self):
        self.assertEqual(chosen(self.route(issue(labels=["route:claude:opus"]))), ("claude", "claude-opus-5-5"))
        self.assertEqual(chosen(self.route(issue(labels=["claude"]))), ("claude", "claude-sonnet-5-5"))
        pinned = self.route(issue(title="Merge queue stalls", labels=["devin"]))
        self.assertEqual(chosen(pinned), ("claude", "claude-opus-5-5"))
        self.assertEqual(pinned["notes"], ["explicit-below-floor-or-disabled:devin"])

    def test_sensitive_work_stays_on_the_guarded_lane(self):
        decision = self.route(issue(title="Merge queue"), only_lanes={"codex"})
        self.assertEqual(chosen(decision), ("codex", "codex-default"))

    def test_disabled_and_malformed_routes_are_ignored(self):
        providers = {"a": {"enabled": False, "routes": [{"model": "x", "cost": 0}]},
                     "b": {"routes": ["bad", {"cost": 0}, {"model": "y", "cost": 5}]}}
        rows = remediation.issue_routes(providers)
        self.assertEqual([(row["lane"], row["model"]) for row in rows], [("b", "y")])


class AdmissionTest(unittest.TestCase):
    def test_routed_and_held_rejections(self):
        to_devin = lambda _issue: {"chosen": {"lane": "devin"}, "required": "standard"}
        held = lambda _issue: {"chosen": None, "required": "frontier"}
        item = lane_issue()
        self.assertEqual(lane.admission_rejection(item, {}, time.time(), frozenset(), "claude", to_devin),
                         "routed:devin")
        self.assertIsNone(lane.admission_rejection(item, {}, time.time(), frozenset(), "devin", to_devin))
        self.assertEqual(lane.admission_rejection(item, {}, time.time(), frozenset(), "devin", held),
                         "route-held:frontier")
        self.assertEqual(lane.pick_issue([item], {}, provider="claude", route=to_devin), None)
        self.assertEqual(lane.pick_issue([item], {}, provider="devin", route=to_devin), item)


class AvailabilityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), linear_env=Path(self.tmp.name) / "none")
        self.env = patch.dict(os.environ, {"LANES_SLOTS_CODEX": "0"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def write(self, name, data):
        (self.host.state / name).parent.mkdir(parents=True, exist_ok=True)
        (self.host.state / name).write_text(json.dumps(data) if not isinstance(data, str) else data)

    def test_self_is_available_others_need_slots_health_and_a_free_seat(self):
        seen = lane.lane_availability(self.host, "claude", PROVIDERS)
        self.assertEqual(seen("claude", {})["ok"], True)
        self.assertEqual(seen("codex", {}), {"ok": False, "why": "no-slots-on-host", "pressure": 0})
        self.assertTrue(seen("devin", {})["ok"])
        held = [lane.Locked(self.host.state / "slots" / f"devin.{index}.lock", blocking=False) for index in range(4)]
        try:
            self.assertEqual(lane.lane_availability(self.host, "claude", PROVIDERS)("devin", {})["why"], "saturated")
        finally:
            for lock in held:
                lock.release()

    def test_cooling_unhealthy_and_blocked_lanes_are_unavailable(self):
        lane.cool_down(self.host, "devin")
        self.write("tick.json", {"unhealthy": ["hyperagent"]})
        self.write("worker-idle.json", {"claude": {"at": lane.now_iso(), "reason": "pr-budget"}})
        seen = lane.lane_availability(self.host, "codex", PROVIDERS)
        self.assertEqual(seen("devin", {})["why"], "cooling")
        self.assertEqual(seen("hyperagent", {})["why"], "unhealthy")
        self.assertEqual(seen("claude", {})["why"], "blocked:pr-budget")

    def test_claude_bank_and_window_pressure(self):
        now = time.time()
        self.write("claude-quota.json", {"runs": [{"at": now - 10, "model": "claude-opus-5-5"}] * 6})
        pressure = lane.quota_pressure(self.host, "claude", PROVIDERS["claude"], now)
        self.assertEqual(pressure["pressure"], 0.5)
        self.write("claude-quota.json", {"bank": {"kind": "usage-limit", "until": now + 60}})
        self.assertEqual(lane.quota_pressure(self.host, "claude", PROVIDERS["claude"], now)["why"],
                         "banked:usage-limit")

    def test_ledger_window_counts_issue_runs_and_enforces_a_cap(self):
        now = time.time()
        rows = [{"provider": "hyperagent", "startedAt": lane.now_iso()},
                {"provider": "hyperagent", "kind": "fix-red", "startedAt": lane.now_iso()},
                {"provider": "devin", "startedAt": lane.now_iso()},
                {"provider": "hyperagent", "startedAt": "2020-01-01T00:00:00+00:00"}]
        self.write("runs/ledger.jsonl", "\n".join(json.dumps(row) for row in rows) + "\nnot json\n")
        spec = {"quota": {"source": "ledger", "windowS": 3600, "softRuns": 4, "maxRuns": 1}}
        self.assertEqual(lane.recent_lane_runs(self.host, "hyperagent", 3600, now), 1)
        self.assertEqual(lane.quota_pressure(self.host, "hyperagent", spec, now)["why"], "window-cap 1/1")
        spec["quota"]["maxRuns"] = 5
        self.assertEqual(lane.quota_pressure(self.host, "hyperagent", spec, now)["pressure"], 0.25)
        self.assertEqual(lane.recent_lane_runs(lane.Host(state=Path(self.tmp.name) / "none"), "x", 1, now), 0)

    def test_codex_pressure_reads_account_status(self):
        fake = type("Codex", (), {"status": staticmethod(lambda now: {"accounts": {
            "a": {"available": False}, "b": {"available": True}}})})
        with patch.object(lane, "codex_lane_module", return_value=fake):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["pressure"], 0.5)
        fake.status = staticmethod(lambda now: {"accounts": {"a": {"available": False}}})
        with patch.object(lane, "codex_lane_module", return_value=fake):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["why"],
                             "all-accounts-banked")
        with patch.object(lane, "codex_lane_module", side_effect=OSError):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["why"], "accounts unread")

    def test_router_end_to_end_logs_its_rationale(self):
        router = lane.issue_router(self.host, "claude", PROVIDERS, POLICY)
        frontier = lane_issue("JOV-9", "Staging controller blocks every authorization")
        self.assertIsNone(lane.admission_rejection(frontier, {}, time.time(), frozenset(), "claude", router))
        self.assertEqual(lane.admission_rejection(lane_issue("JOV-10"), {}, time.time(), frozenset(), "claude",
                                                  router), "routed:devin")
        decision = router.decisions["JOV-9"]
        self.assertEqual(decision["chosen"]["model"], "claude-opus-5-5")
        lane.log_route(self.host, "claude", decision)
        logged = json.loads((self.host.state / "runs" / "routing.jsonl").read_text().splitlines()[0])
        self.assertEqual(logged["claimedBy"], "claude")
        self.assertEqual(logged["schema"], "jovie-lane-route/v1")
        self.assertIn("effective cost", logged["rationale"])

    def test_sensitive_issue_is_routed_to_codex_only(self):
        with patch.dict(os.environ, {"LANES_SLOTS_CODEX": "3"}):
            router = lane.issue_router(self.host, "codex", PROVIDERS, POLICY)
            sensitive = lane_issue("JOV-11", "Fix login copy", labels=["area:auth"])
            self.assertEqual(router(sensitive)["chosen"]["lane"], "codex")

    def test_registry_without_routes_keeps_first_come_admission(self):
        self.assertIsNone(lane.issue_router(self.host, "devin", {"devin": {"label": "devin"}}, POLICY))


if __name__ == "__main__":
    unittest.main()

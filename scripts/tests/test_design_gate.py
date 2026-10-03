"""Design gate: IA-first briefs before UI and landing build lanes (JOV-7541).

Run with:
    python3 -m pytest scripts/tests/test_design_gate.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import design_gate  # noqa: E402
import design_gate_check  # noqa: E402


def issue(identifier="JOV-1", priority=2, created="2026-09-01T00:00:00Z",
          labels=(), title=None, description=""):
    return SimpleNamespace(
        id="id-" + identifier, identifier=identifier,
        title=title or f"Task {identifier}", description=description,
        priority=priority, created_at=created, labels=list(labels),
    )


def complete_brief(capability="smart-links", imagery="photo", component="PublicProfileHero",
                   pen="node Ab12Cd", sections=("hero", "cta")):
    section_lines = "\n".join(f"- {section_id}" for section_id in sections)
    copy_lines = "\n".join(
        f"- {section_id}: Publish the certified page without inventing a claim."
        for section_id in sections)
    imagery_lines = "\n".join(f"- {section_id}: {imagery}" for section_id in sections)
    return f"""## 1. IA / message
Message: Artists see one public page that explains what Jovie publishes for them.

## 2. Certified capabilities
Capability ids:
- {capability}

## 3. Outcome
Outcome: A founder can publish a certified artist page without inventing claims.

## 4. Problem → solution
Problem: Landing pages ship claims the product cannot prove yet.
Solution: The page sells only the certified public-profile outcome.

## 5. Layout
Sections:
{section_lines}

## 6. Copy
Copy:
{copy_lines}

## 7. Imagery
Imagery:
{imagery_lines}

## 8. Art direction
Component: {component}

## 9. Creative exploration
Pen: {pen}
ImageGen:
"""


def load_lane():
    spec = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["lane_runner"] = module
    spec.loader.exec_module(module)
    return module


class GatingTest(unittest.TestCase):
    def test_labels_and_surfaces_gate_and_plain_work_does_not(self):
        self.assertTrue(design_gate.is_design_gated(issue(labels=["ws:ui-ia"])))
        self.assertTrue(design_gate.is_design_gated(issue(labels=["WS:Profiles-Marketing"])))
        self.assertTrue(design_gate.is_design_gated(issue(labels=["ws:design-gate"])))
        self.assertTrue(design_gate.is_design_gated(
            issue(description="Touch apps/web/data/marketing/factory/spine.ts")))
        self.assertTrue(design_gate.is_design_gated(
            issue(description="Edit apps/web/app/(home)/page.tsx")))
        self.assertTrue(design_gate.is_design_gated(issue(title="Rebuild the homepage hero")))
        self.assertTrue(design_gate.is_design_gated(issue(title="New landing page for pay")))
        self.assertFalse(design_gate.is_design_gated(issue(title="Tab indicator collapses")))
        self.assertFalse(design_gate.path_is_gated("apps/web/app/app/(shell)/dashboard/page.tsx"))
        self.assertTrue(design_gate.path_is_gated("apps/web/components/marketing/Hero.tsx"))

    def test_workstreams_explicit_is_used_when_the_module_is_present(self):
        fake = SimpleNamespace(explicit=lambda labels: "ui-ia" if "area:ui" in labels else None)
        with mock.patch.dict(sys.modules, {"workstreams": fake}):
            self.assertTrue(design_gate.is_design_gated(issue(labels=["area:ui"])))
        self.assertFalse(design_gate.is_design_gated(issue(labels=["area:ui"])))


class BriefTest(unittest.TestCase):
    def test_template_is_not_a_completed_brief(self):
        path = ROOT / "docs/design/design-brief-template.md"
        if not path.exists():
            self.skipTest("template is outside the lane release archive")
        text = path.read_text(encoding="utf-8")
        status = design_gate.brief_status(text)
        self.assertFalse(status["complete"])
        self.assertEqual(status["missing"], list(range(1, 10)))
        self.assertEqual(status["source"], "inline")

    def test_complete_inline_brief_is_admitted(self):
        task = issue(labels=["ws:ui-ia"], description=complete_brief())
        status = design_gate.brief_status(task.description)
        self.assertEqual(status["missing"], [], status)
        self.assertTrue(status["complete"])
        decision = design_gate.build_admission(task)
        self.assertTrue(decision["admit"])
        self.assertIsNone(decision["reason"])

    def test_each_missing_step_blocks(self):
        replacements = {
            1: ("Message: Artists see one public page that explains what Jovie publishes for them.",
                "Message:"),
            3: ("Outcome: A founder can publish a certified artist page without inventing claims.",
                "Outcome:"),
            4: ("Problem: Landing pages ship claims the product cannot prove yet.",
                "Problem:"),
            8: ("Component: PublicProfileHero", "Component:"),
            9: ("Pen: node Ab12Cd", "Pen:"),
        }
        for step, (old, new) in replacements.items():
            with self.subTest(step=step):
                status = design_gate.brief_status(complete_brief().replace(old, new))
                self.assertIn(step, status["missing"])
                self.assertFalse(status["complete"])
        status = design_gate.brief_status(complete_brief(capability=""))
        self.assertIn(2, status["missing"])
        status = design_gate.brief_status(complete_brief(sections=()))
        self.assertIn(5, status["missing"])
        self.assertIn(6, status["missing"])
        self.assertIn(7, status["missing"])
        text = complete_brief().replace(
            "- hero: Publish the certified page without inventing a claim.",
            "- hero: TODO")
        self.assertIn(6, design_gate.brief_status(text)["missing"])
        self.assertIn(7, design_gate.brief_status(complete_brief(imagery="hologram"))["missing"])
        self.assertIn(8, design_gate.brief_status(
            complete_brief().replace("Component: PublicProfileHero",
                                     "Component: PublicProfileHero, SecondArt"))["missing"])

    def test_unknown_and_uncertified_capability_ids_fail_step_2(self):
        unknown = design_gate.brief_status(complete_brief(capability="not-a-capability"))
        self.assertIn(2, unknown["missing"])
        self.assertEqual(unknown["invalidCapabilityIds"], [{"id": "not-a-capability", "reason": "unknown"}])
        uncertified = design_gate.brief_status(complete_brief(capability="jovie-card"))
        self.assertIn(2, uncertified["missing"])
        self.assertEqual(uncertified["invalidCapabilityIds"], [{"id": "jovie-card", "reason": "uncertified"}])
        self.assertIn("smart-links", design_gate.certified_ids())
        self.assertNotIn("jovie-card", design_gate.certified_ids())
        self.assertIn("jovie-card", design_gate.registry_ids())

    def test_linked_doc_is_the_brief_and_a_missing_doc_is_not_inline(self):
        body = "Design brief: docs/design/briefs/pay.md\n\n## 1. IA / message\nMessage: This inline text must not count as the brief."
        unloaded = design_gate.brief_status(body)
        self.assertEqual(unloaded["source"], "linked-unloaded")
        self.assertEqual(unloaded["missing"], list(range(1, 10)))
        loaded = design_gate.brief_status(body, complete_brief())
        self.assertTrue(loaded["complete"])
        self.assertEqual(loaded["source"], "linked")
        task = issue(labels=["ws:profiles-marketing"], description=body)
        decision = design_gate.build_admission(task, linked_doc_text=complete_brief())
        self.assertTrue(decision["admit"])

    def test_imagery_accepts_the_founder_spellings(self):
        for spelling in ("video", "photo", "Lottie", "callout", "phone mockup", "Mac mockup"):
            with self.subTest(spelling=spelling):
                status = design_gate.brief_status(complete_brief(imagery=spelling, sections=("hero",)))
                self.assertNotIn(7, status["missing"], status)


class AdmissionTest(unittest.TestCase):
    def setUp(self):
        self.lane = load_lane()

    def test_pick_routes_an_incomplete_brief_to_one_brief_lane_run(self):
        blocked = self.lane.Issue("id-JOV-1", "JOV-1", "Homepage hero", "no brief yet",
                                  1, "2026-09-01T00:00:00Z", ["ws:ui-ia"])
        nxt = self.lane.Issue("id-JOV-2", "JOV-2", "Tab indicator collapses JOV-2", "body",
                              2, "2026-09-02T00:00:00Z", [])
        calls = []

        class Linear:
            def gql(self, query, variables):
                calls.append(("gql", query, variables))

            def comment(self, issue_id, body):
                calls.append(("comment", issue_id, body))

        picked = design_gate.pick_build_issue(
            [blocked, nxt], {}, pick=self.lane.pick_issue, linear=Linear(), provider="devin")
        self.assertEqual(picked.identifier, "JOV-1")
        self.assertTrue(design_gate.wants_brief(picked))
        self.assertEqual(calls[0][2]["label"], design_gate.NEEDS_BRIEF_LABEL_ID)
        self.assertNotIn("no separate design lane", calls[1][2])
        # Remote-only lanes never take the brief run; they skip to buildable work.
        picked = design_gate.pick_build_issue(
            [blocked, nxt], {}, pick=self.lane.pick_issue, provider="hyperagent")
        self.assertEqual(picked.identifier, "JOV-2")

    def test_pick_skips_an_incomplete_brief_after_the_brief_lane_ran(self):
        blocked = self.lane.Issue("id-JOV-1", "JOV-1", "Homepage hero",
                                  "no brief yet\n" + design_gate.BRIEF_MARKER,
                                  1, "2026-09-01T00:00:00Z", ["ws:ui-ia"])
        nxt = self.lane.Issue("id-JOV-2", "JOV-2", "Tab indicator collapses JOV-2", "body",
                              2, "2026-09-02T00:00:00Z", [])
        calls = []

        class Linear:
            def gql(self, query, variables):
                calls.append(("gql", query, variables))

            def comment(self, issue_id, body):
                calls.append(("comment", issue_id, body))

        picked = design_gate.pick_build_issue(
            [blocked, nxt], {}, pick=self.lane.pick_issue, linear=Linear(), provider="devin")
        self.assertEqual(picked.identifier, "JOV-2")
        self.assertIn("addedLabelIds", calls[0][1])
        self.assertEqual(calls[0][2]["label"], design_gate.NEEDS_BRIEF_LABEL_ID)
        self.assertEqual(calls[0][2]["id"], blocked.id)
        self.assertIn("needs-design-brief", calls[1][2])

    def test_label_is_applied_once_and_only_to_the_issue_that_would_have_been_picked(self):
        first = self.lane.Issue("id-JOV-1", "JOV-1", "Homepage hero",
                                "no brief\n" + design_gate.BRIEF_MARKER,
                                1, "2026-09-01T00:00:00Z", ["ws:ui-ia", "needs-design-brief"])
        second = self.lane.Issue("id-JOV-3", "JOV-3", "Landing page copy",
                                 "Design brief: docs/design/briefs/missing.md",
                                 2, "2026-09-02T00:00:00Z", ["ws:design-gate"])
        later = self.lane.Issue("id-JOV-4", "JOV-4", "Tab indicator collapses JOV-4", "body",
                                3, "2026-09-03T00:00:00Z", [])
        calls = []

        class Linear:
            def gql(self, query, variables):
                calls.append(variables["id"])

            def comment(self, issue_id, body):
                calls.append(issue_id)

        picked = design_gate.pick_build_issue(
            [first, second, later], {}, pick=self.lane.pick_issue, linear=Linear(), provider="devin")
        self.assertEqual(picked.identifier, "JOV-4")
        # The head issue already carries the label, so this pass does not write
        # again, and it does not label the later incomplete issue in bulk.
        self.assertEqual(calls, [])


class BriefLaneTest(unittest.TestCase):
    class Linear:
        def __init__(self, description="Homepage hero"):
            self.description, self.calls, self.comments = description, [], []

        def gql(self, query, variables):
            self.calls.append(variables)
            if query.startswith("query"):
                return {"issue": {"description": self.description}}
            if "d" in variables:
                self.description = variables["d"]
            return {"issueUpdate": {"success": True}}

        def comment(self, issue_id, body):
            self.comments.append(body)

    def test_complete_brief_is_appended_once_and_admits_the_issue(self):
        linear = self.Linear()
        gated = issue(labels=["ws:ui-ia", "needs-design-brief"], description="Homepage hero")
        result = design_gate.publish_brief(linear, gated, complete_brief())
        self.assertEqual(result["verdict"], "brief-complete")
        self.assertIn(design_gate.BRIEF_MARKER, linear.description)
        self.assertEqual(linear.calls[-1]["label"], design_gate.NEEDS_BRIEF_LABEL_ID)
        gated.description = linear.description
        self.assertTrue(design_gate.build_admission(gated)["admit"])
        self.assertFalse(design_gate.wants_brief(gated))
        again = design_gate.publish_brief(linear, gated, complete_brief())
        self.assertEqual(again["reasons"], ["brief-already-published"])
        self.assertEqual(linear.description.count(design_gate.BRIEF_MARKER), 1)

    def test_partial_brief_is_kept_and_reports_missing_steps_without_a_rerun(self):
        linear = self.Linear()
        gated = issue(labels=["ws:ui-ia"], description="Homepage hero")
        result = design_gate.publish_brief(linear, gated, complete_brief(pen=""))
        self.assertEqual((result["verdict"], result["missing"]), ("brief-incomplete", [9]))
        self.assertIn("Steps 9 still need a design pass", linear.comments[0])
        self.assertFalse(any("removedLabelIds" in str(call) for call in linear.calls))
        gated.description = linear.description
        decision = design_gate.build_admission(gated)
        self.assertFalse(decision["admit"])
        self.assertFalse(design_gate.brief_due(gated, decision))

    def test_empty_output_fails_without_touching_the_issue(self):
        linear = self.Linear()
        result = design_gate.publish_brief(linear, issue(labels=["ws:ui-ia"]), "I could not do it.")
        self.assertEqual(result, {"verdict": "failed", "reasons": ["brief-empty"]})
        self.assertEqual(linear.calls, [])

    def test_prompt_is_brief_only_and_forbids_invented_artifacts(self):
        prompt = design_gate.render_brief_prompt(issue(title="Homepage hero"), "ctx")
        self.assertIn(design_gate.BRIEF_FILE, prompt)
        self.assertIn("Do not build, commit, push or open a PR", prompt)
        self.assertIn("leave the `Pen:` and `ImageGen:` lines empty", prompt)

    def test_runner_routes_a_brief_run_without_a_pr(self):
        lane = load_lane()
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))

            def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
                if args[:3] == ["git", "worktree", "add"]:
                    Path(args[-2]).mkdir(parents=True)
                return SimpleNamespace(returncode=0, stdout="0", stderr="")

            def fake_agent(cmd, cwd, log, timeout, **kwargs):
                (cwd / design_gate.BRIEF_FILE).write_text(complete_brief())
                return SimpleNamespace(returncode=0)

            linear = self.Linear()
            gated = lane.Issue("id-JOV-9", "JOV-9", "Homepage hero", "Homepage hero",
                               1, "2026-09-01T00:00:00Z", ["ws:ui-ia"])
            with mock.patch.object(lane, "sh", fake_sh), \
                    mock.patch.object(lane, "run_agent", fake_agent), \
                    mock.patch.object(lane, "context_pack", lambda issue: "ctx"), \
                    mock.patch.object(lane.disk_guard, "free_pct", return_value=50.0):
                receipt = lane.run_brief(host, "devin", {"cmd": ["true"]}, linear, gated)
            self.assertEqual((receipt["verdict"], receipt["kind"]), ("brief-complete", "design-brief"))
            self.assertIsNone(receipt["result"]["pr"])
            prompt = next((host.state / "runs").glob("*-brief-*.prompt.md")).read_text()
            self.assertIn("Do not build", prompt)
            ledger = (host.state / "runs/ledger.jsonl").read_text()
            self.assertIn('"design-brief"', ledger)


class DoctorCensusTest(unittest.TestCase):
    def test_observe_counts_gated_admitted_and_missing_steps(self):
        lane = load_lane()
        doctor = sys.modules["doctor"]
        good = lane.Issue("id-JOV-GOOD", "JOV-GOOD", "Tab indicator collapses JOV-GOOD", "body",
                          1, "2026-09-01T00:00:00Z", [])
        waiting = lane.Issue("id-JOV-WAIT", "JOV-WAIT", "Homepage hero", "no brief",
                             1, "2026-09-01T00:00:00Z", ["ws:ui-ia"])
        ready = lane.Issue("id-JOV-READY", "JOV-READY", "Marketing page", complete_brief(),
                           2, "2026-09-02T00:00:00Z", ["ws:profiles-marketing"])
        providers = {"devin": {"label": "devin", "slots": 1, "enabled": True}}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = lane.Host(state=state, repo=ROOT, linear_env=state / "missing.env")
            tracker = mock.Mock()
            tracker.lane_issues.return_value = [good, waiting, ready]
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1", "LANES_SLOTS_DEVIN": "1"}), \
                    mock.patch.object(lane, "load_providers", return_value=providers), \
                    mock.patch.object(lane, "Linear", return_value=tracker), \
                    mock.patch.object(lane, "in_flight_issues", return_value=frozenset()), \
                    mock.patch.object(lane, "load_github_env"), \
                    mock.patch.object(lane, "read_new_issue_budget",
                                      side_effect=lambda name, slots: {"allowed": True, "used": 0, "reason": "within-budget"}), \
                    mock.patch.object(lane, "graphql_budget", return_value=None):
                observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=1_000_000)
        self.assertEqual(observed["designGate"]["gated"], 2)
        self.assertEqual(observed["designGate"]["admitted"], 1)
        self.assertEqual(observed["designGate"]["needsBrief"], 1)
        self.assertEqual(observed["designGate"]["missingSteps"]["1"], 1)
        self.assertEqual(observed["qualifiedJobsByProvider"]["devin"], ["JOV-GOOD", "JOV-READY"])
        self.assertEqual(observed["rejectedByProvider"]["devin"]["needs-design-brief"], 1)
        feed = doctor.status_feed(host, lane, observed, {}, {})
        self.assertEqual(feed["admission"]["designGate"], observed["designGate"])


class CertifiedSyncTest(unittest.TestCase):
    def test_checked_in_list_matches_the_registry_rule(self):
        registry = ROOT / "apps/web/data/product-truth/registry.ts"
        if not registry.exists():
            self.skipTest("registry is outside the lane release archive")
        certified, every = design_gate.certified_ids_from_registry_source(
            registry.read_text(encoding="utf-8"))
        catalog = design_gate.certified_catalog()
        self.assertEqual(catalog["ids"], certified)
        self.assertEqual(catalog["registryIds"], every)
        self.assertIn("public", catalog["rule"])
        self.assertIn("proofAuthorized", catalog["rule"])
        self.assertNotIn("jovie-card", certified)
        self.assertNotIn("voice", certified)
        self.assertNotIn("selective-reach", certified)
        self.assertIn("smart-links", certified)


class CiCheckTest(unittest.TestCase):
    def test_warns_by_default_and_blocks_only_when_enforced(self):
        files = ["apps/web/app/(marketing)/pay/page.tsx", "scripts/lanes/README.md"]
        warned = design_gate_check.check(files, "No brief here.", enforce=False)
        self.assertEqual(warned["exit"], 0)
        self.assertEqual(warned["level"], "warning")
        self.assertEqual(warned["status"], "warn")
        blocked = design_gate_check.check(files, "No brief here.", enforce=True)
        self.assertEqual(blocked["exit"], 1)
        self.assertEqual(blocked["level"], "error")
        skipped = design_gate_check.check(["scripts/lanes/README.md"], "No brief here.", enforce=True)
        self.assertEqual(skipped["exit"], 0)
        self.assertEqual(skipped["status"], "skip")

    def test_complete_linked_brief_passes_and_an_unmapped_url_stays_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            brief = root / "docs/design/briefs/pay.md"
            brief.parent.mkdir(parents=True)
            brief.write_text(complete_brief(), encoding="utf-8")
            body = "Design brief: docs/design/briefs/pay.md\n"
            result = design_gate_check.check(
                ["apps/web/data/marketing/factory/spine.ts"], body, enforce=True,
                read_text=design_gate.repo_reader(root))
            self.assertEqual(result["exit"], 0)
            self.assertEqual(result["status"], "pass")
        unverified = design_gate_check.check(
            ["apps/web/app/(home)/page.tsx"],
            "Design brief: https://example.com/brief", enforce=True)
        self.assertEqual(unverified["exit"], 0)
        self.assertEqual(unverified["level"], "warning")

    def test_linked_issue_brief_is_used_when_fetch_succeeds(self):
        body = "Refs JOV-7541."
        fetched = design_gate_check.check(
            ["apps/web/components/marketing/Hero.tsx"], body, enforce=True,
            fetch_issue=lambda identifier: complete_brief() if identifier == "JOV-7541" else None)
        self.assertEqual(fetched["status"], "pass")
        unreadable = design_gate_check.check(
            ["apps/web/components/marketing/Hero.tsx"], body, enforce=True,
            fetch_issue=lambda identifier: None)
        self.assertEqual(unreadable["exit"], 0)
        self.assertEqual(unreadable["level"], "warning")

    def test_cli_emits_a_warning_and_passes_when_enforcement_is_off(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = root / "files.txt"
            files.write_text("apps/web/app/(marketing)/pay/page.tsx\n", encoding="utf-8")
            event = root / "event.json"
            event.write_text(json.dumps({"pull_request": {"body": "no brief"}}), encoding="utf-8")
            summary = root / "summary.md"
            with mock.patch.dict(os.environ, {"DESIGN_GATE_ENFORCE": "", "GITHUB_STEP_SUMMARY": str(summary),
                                              "LINEAR_API_KEY": ""}):
                code = design_gate_check.main(
                    ["--event", str(event), "--files-from", str(files), "--repo", str(root)])
            self.assertEqual(code, 0)
            self.assertIn("Design brief", summary.read_text(encoding="utf-8"))
            self.assertFalse(design_gate.enforce_enabled("off"))
            self.assertTrue(design_gate.enforce_enabled("true"))

    def test_workflow_keeps_the_shared_path_prefixes(self):
        workflow = ROOT / ".github/workflows/design-gate.yml"
        if not workflow.exists():
            self.skipTest("workflow is outside the lane release archive")
        text = workflow.read_text(encoding="utf-8")
        for prefix in design_gate.GATED_PATH_PREFIXES:
            self.assertIn(prefix, text)
        self.assertIn("DESIGN_GATE_ENFORCE", text)


if __name__ == "__main__":
    unittest.main()

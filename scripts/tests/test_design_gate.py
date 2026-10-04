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


NOW = 1_791_000_000.0


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

    def test_only_visible_ui_work_is_gated(self):
        """The false matches found live on 2026-10-03 (JOV-7717)."""
        cases = {
            # Plumbing titles: redirects, orphans, route handlers.
            "O-09/W-07: Redirect the old /new homepage": ["remediation:audit-o09-homepage-alias"],
            "O-11: Resolve the unlinked /ai marketing page": ["remediation:audit-o11-ai-orphan"],
            "Audit and prune 19 API route handlers with no in-repo callers": ["ws:ui-ia"],
        }
        for title, labels in cases.items():
            self.assertFalse(design_gate.is_design_gated(issue(title=title, labels=labels)), title)
        # A homepage mentioned in passing in the description does not gate.
        mentions = {
            "Complete non-chat access requests and signed profile claims":
                "Follows [JOV-6537](https://linear.app/x/ship-gated-bloom-request-access-homepage) "
                "and homepage Find me stays.",
            "Lock: APIs/MCPs are a core Jovie line, not first": "Homepage stays person-first Find me.",
            "Triage ~80 never-mounted components": "Includes the homepage/* trio.",
        }
        for title, description in mentions.items():
            self.assertFalse(design_gate.is_design_gated(
                issue(title=title, description=description, labels=["ws:general"])), title)
        # Visible UI still gates, and picks its brief variant.
        chat = issue(title="Repair New Chat visual contracts", labels=["ws:ui-ia"])
        hero = issue(title="Rebuild the homepage hero")
        mom = issue(title="Mom-test then waitlist", labels=["ws:profiles-marketing"])
        self.assertTrue(all(design_gate.is_design_gated(item) for item in (chat, hero, mom)))
        self.assertEqual([design_gate.brief_variant(item) for item in (chat, hero, mom)],
                         ["app", "marketing", "marketing"])

    def test_workstreams_explicit_is_used_when_the_module_is_present(self):
        fake = SimpleNamespace(explicit=lambda labels: "ui-ia" if "area:ui" in labels else None)
        with mock.patch.dict(sys.modules, {"workstreams": fake}):
            self.assertTrue(design_gate.is_design_gated(issue(labels=["area:ui"])))
        self.assertFalse(design_gate.is_design_gated(issue(labels=["area:ui"])))


class AppBriefTest(unittest.TestCase):
    def test_app_template_is_not_a_completed_brief(self):
        path = ROOT / "docs/design/app-ui-brief-template.md"
        if not path.exists():
            self.skipTest("template is outside the lane release archive")
        status = design_gate.brief_status(path.read_text(encoding="utf-8"), variant="app")
        self.assertEqual(status["missing"], list(range(1, 10)))

    def test_complete_app_brief_is_admitted_and_marketing_steps_do_not_apply(self):
        self.assertEqual(design_gate.brief_status(app_brief(), variant="app")["missing"], [])
        self.assertEqual(design_gate.brief_status(app_brief())["missing"], [5, 6, 7])
        task = issue(labels=["ws:ui-ia"], title="Sidebar dock stack", description=app_brief())
        self.assertTrue(design_gate.build_admission(task)["admit"])

    def test_each_app_step_5_to_7_rule(self):
        def missing(**kwargs):
            return design_gate.brief_status(app_brief(**kwargs), variant="app")["missing"]
        self.assertEqual(missing(states="loading, spinning"), [5])
        self.assertEqual(missing(states=""), [5])
        self.assertEqual(missing(primitive="atom.made-up"), [6])
        self.assertEqual(missing(primitive="Button"), [])  # not a bullet id: only the shell frame counts
        self.assertEqual(missing(viewports="mobile, watch"), [7])
        self.assertEqual(missing(viewports=""), [7])
        self.assertEqual(missing(pen=""), [9])

    def test_checked_in_primitives_match_the_registries(self):
        component = ROOT / "apps/web/data/designSystem/componentRegistry.ts"
        screens = ROOT / "apps/web/data/appScreens/registry.ts"
        if not component.exists() or not screens.exists():
            self.skipTest("registries are outside the lane release archive")
        design_gate.reset_catalog_cache()
        expected = design_gate.primitive_ids_from_sources(
            component.read_text(encoding="utf-8"), screens.read_text(encoding="utf-8"))
        self.assertEqual(sorted(design_gate.primitive_ids()), expected)
        self.assertIn("atom.button", expected)
        self.assertIn("component.empty-state", expected)


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
        task = issue(labels=["ws:profiles-marketing"], description=complete_brief())
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


def app_brief(states="loading, empty, error, populated", primitive="component.empty-state",
              viewports="mobile, desktop", pen="node Ab12Cd"):
    return f"""## 1. IA / message
Message: The new chat screen tells the artist what Jovie can do next for them.

## 2. Certified capabilities
Capability ids:
- smart-links

## 3. Outcome
Outcome: An artist starts a useful chat without a broken or blank first screen.

## 4. Problem → solution
Problem: The new chat surface collapses its titlebar and drops visual contracts.
Solution: Rebuild it from canonical shell primitives with every state covered.

## 5. Screens and states
States:
- new-chat: {states}

## 6. Canonical primitives
Primitives:
- component.app-shell-frame
- {primitive}

## 7. States and viewports covered
Viewports:
- new-chat: {viewports}

## 8. Art direction
Component: AppShellFrame

## 9. Creative exploration
Pen: {pen}
ImageGen:
"""


class FakeLinear:
    """Linear as the lanes see it: one description and label set per issue."""

    def __init__(self, issues=()):
        self.descriptions = {item.id: item.description for item in issues}
        self.labels = {item.id: set(item.labels) for item in issues}
        self.comments, self.calls = [], []

    def gql(self, query, variables):
        self.calls.append((query, variables))
        if query.startswith("query"):
            return {"issue": {"description": self.descriptions.get(variables["id"], "")}}
        if "d" in variables:
            self.descriptions[variables["id"]] = variables["d"]
        if "addedLabelIds" in query:
            name = {design_gate.NEEDS_BRIEF_LABEL_ID: design_gate.NEEDS_BRIEF_LABEL,
                    design_gate.BRIEF_AUTO_LABEL_ID: design_gate.BRIEF_AUTO_LABEL}[variables["label"]]
            self.labels.setdefault(variables["id"], set()).add(name)
        if "removedLabelIds" in query:
            self.labels.setdefault(variables["id"], set()).discard(design_gate.NEEDS_BRIEF_LABEL)
        return {"issueUpdate": {"success": True}}

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))

    def refresh(self, item):
        """What the next claim scan reads back."""
        item.description = self.descriptions[item.id]
        item.labels = sorted(self.labels[item.id])
        return item


class AdmissionTest(unittest.TestCase):
    def setUp(self):
        # Keep default-time helpers on the same clock as the simulated hold window.
        clock = mock.patch.object(design_gate.time, "time", return_value=NOW)
        clock.start()
        self.addCleanup(clock.stop)
        self.lane = load_lane()

    def task(self, identifier, title, description, priority, labels):
        return self.lane.Issue(f"id-{identifier}", identifier, title, description, priority,
                               "2026-09-01T00:00:00Z", list(labels))

    def test_a_held_issue_gets_its_brief_run_on_the_next_claim(self):
        build = self.task("JOV-2", "Tab indicator collapses JOV-2", "body", 1, [])
        held = self.task("JOV-1", "Homepage hero", "no brief yet", 4, ["ws:ui-ia"])
        linear = FakeLinear([build, held])
        # The held issue ranks below buildable work and is still taken first.
        picked = design_gate.pick_build_issue(
            [build, held], {}, pick=self.lane.pick_issue, linear=linear, provider="devin", now=NOW)
        self.assertEqual(picked.identifier, "JOV-1")
        self.assertTrue(design_gate.wants_brief(linear.refresh(held)))
        self.assertIn(design_gate.NEEDS_BRIEF_LABEL, held.labels)
        self.assertEqual(design_gate.held_at(held.description), NOW)
        self.assertIn("brief-auto", linear.comments[0][1])
        # Remote-only lanes never take the brief run; they skip to buildable work.
        picked = design_gate.pick_build_issue(
            [build, held], {}, pick=self.lane.pick_issue, provider="hyperagent", now=NOW)
        self.assertEqual(picked.identifier, "JOV-2")

    def test_label_and_hold_time_are_written_once(self):
        held = self.task("JOV-1", "Homepage hero", "no brief", 1, ["ws:ui-ia"])
        linear = FakeLinear([held])
        design_gate.pick_build_issue([held], {}, pick=self.lane.pick_issue, linear=linear,
                                     provider="devin", now=NOW)
        writes = len(linear.calls)
        design_gate.pick_build_issue([linear.refresh(held)], {}, pick=self.lane.pick_issue,
                                     linear=linear, provider="devin", now=NOW + 60)
        self.assertEqual(design_gate.held_at(linear.descriptions[held.id]), NOW)
        self.assertEqual(len(linear.comments), 1)
        self.assertEqual(len(linear.calls), writes)

    def test_an_issue_cannot_be_held_forever(self):
        """Regression (JOV-7717): every path out of the hold ends in a build claim."""
        held = self.task("JOV-1", "Repair New Chat visual contracts", "no brief", 1, ["ws:ui-ia"])
        linear = FakeLinear([held])
        runs = []
        now = NOW
        for _cycle in range(4):
            picked = design_gate.pick_build_issue(
                [linear.refresh(held)], {}, pick=self.lane.pick_issue, linear=linear,
                provider="devin", now=now)
            self.assertIsNotNone(picked, "a held issue was skipped with no brief run")
            if not design_gate.wants_brief(picked):
                break
            # Each brief run leaves step 9 open: no Pen or ImageGen artifact.
            runs.append(design_gate.publish_brief(linear, picked, app_brief(pen=""),
                                                  retry=design_gate.brief_retry(picked))["verdict"])
            now += 600
        self.assertEqual(runs, ["brief-incomplete", "brief-incomplete"])
        decision = design_gate.build_admission(linear.refresh(held), now=now)
        self.assertEqual((decision["admit"], decision["reason"], decision["missing"]),
                         (True, "brief-auto", [9]))
        self.assertIn(design_gate.BRIEF_AUTO_LABEL, linear.labels[held.id])
        order = json.loads(linear.descriptions[held.id].split("```json\n")[-1].split("\n```")[0])
        self.assertEqual((order["authorityClass"], order["requiredCapabilities"]), ("founder", ["taste"]))
        self.assertIn("Design brief steps 9", order["founderAsk"]["blocked"])

    def test_a_held_issue_with_no_run_is_admitted_after_24h(self):
        description = "Design brief: docs/design/briefs/missing.md\n" + design_gate.held_marker(NOW)
        held = self.task("JOV-1", "Landing page copy", description, 1, ["ws:profiles-marketing"])
        early = design_gate.build_admission(held, now=NOW + design_gate.HOLD_LIMIT_S - 1)
        late = design_gate.build_admission(held, now=NOW + design_gate.HOLD_LIMIT_S)
        self.assertEqual((early["admit"], early["reason"]), (False, "needs-design-brief"))
        self.assertEqual((late["admit"], late["reason"]), (True, "brief-auto"))
        linear = FakeLinear([held])
        picked = design_gate.pick_build_issue([held], {}, pick=self.lane.pick_issue, linear=linear,
                                              provider="devin", now=NOW + design_gate.HOLD_LIMIT_S)
        self.assertEqual(picked.identifier, "JOV-1")
        self.assertFalse(design_gate.wants_brief(picked))
        self.assertIn("held 24h", linear.comments[-1][1])
        # The founder order is filed once even if the label read is stale.
        self.assertFalse(design_gate.ensure_brief_auto(
            linear, linear.refresh(held), late, now=NOW + design_gate.HOLD_LIMIT_S))
        self.assertEqual(linear.descriptions[held.id].count('"orderId"'), 1)


class FounderOrderTest(unittest.TestCase):
    def test_order_matches_the_work_order_contract_fields(self):
        task = issue("JOV-6277", labels=["ws:ui-ia"], title="Repair New Chat visual contracts")
        decision = {"missing": [5, 9], "attempts": 2}
        order = design_gate.founder_order(task, decision, NOW)
        self.assertEqual(set(order), {
            "schema", "orderId", "revision", "idempotencyKey", "gate", "state", "title", "outcome",
            "successPredicate", "requiredCapabilities", "riskTier", "authorityClass", "scope",
            "evidence", "permittedActions", "forbiddenActions", "budget", "stopConditions",
            "escalation", "expectedArtifact", "founderAsk", "replyTo", "createdAt", "createdBy"})
        self.assertRegex(order["idempotencyKey"], r"^[A-Za-z0-9_-]{8,128}$")
        self.assertLessEqual(len(order["title"]), 120)
        self.assertEqual(order["successPredicate"]["verifier"], "founder-record")
        block = design_gate.render_order_block(order)
        self.assertRegex(block, r"^<!-- jovie-work-order:[0-9a-f]{16}:r1 -->\n```json\n\{")


class BriefLaneTest(unittest.TestCase):
    def test_complete_brief_is_appended_once_and_admits_the_issue(self):
        gated = issue(labels=["ws:ui-ia", "needs-design-brief"], description="New chat")
        linear = FakeLinear([gated])
        result = design_gate.publish_brief(linear, gated, app_brief())
        self.assertEqual(result["verdict"], "brief-complete")
        self.assertNotIn(design_gate.NEEDS_BRIEF_LABEL, linear.labels[gated.id])
        gated.description = linear.descriptions[gated.id]
        self.assertTrue(design_gate.build_admission(gated)["admit"])
        self.assertFalse(design_gate.wants_brief(gated))
        again = design_gate.publish_brief(linear, gated, app_brief())
        self.assertEqual(again["reasons"], ["brief-already-published"])
        self.assertEqual(gated.description.count(design_gate.BRIEF_MARKER), 1)

    def test_retry_replaces_the_first_draft_and_keeps_the_hold_time(self):
        gated = issue(labels=["ws:ui-ia"], description="New chat\n" + design_gate.held_marker(NOW))
        linear = FakeLinear([gated])
        first = design_gate.publish_brief(linear, gated, app_brief(primitive="atom.made-up"))
        self.assertEqual(first["missing"], [6])
        self.assertIn("one frontier retry runs", linear.comments[-1][1])
        gated.description = linear.descriptions[gated.id]
        self.assertTrue(design_gate.brief_retry(gated))
        second = design_gate.publish_brief(linear, gated, app_brief(), retry=True)
        self.assertEqual(second["verdict"], "brief-complete")
        text = linear.descriptions[gated.id]
        self.assertNotIn("atom.made-up", text)
        self.assertEqual(design_gate.held_at(text), NOW)
        self.assertEqual(design_gate.brief_attempts(text), 2)

    def test_empty_output_still_records_the_run(self):
        gated = issue(labels=["ws:ui-ia"], description="New chat")
        linear = FakeLinear([gated])
        result = design_gate.publish_brief(linear, gated, "I could not do it.")
        self.assertEqual((result["verdict"], result["reasons"]), ("brief-incomplete", ["brief-empty"]))
        self.assertEqual(design_gate.brief_attempts(linear.descriptions[gated.id]), 1)

    def test_prompt_is_brief_only_and_names_the_variant_template(self):
        app = design_gate.render_brief_prompt(issue(title="Sidebar dock", labels=["ws:ui-ia"]), "ctx")
        self.assertIn(design_gate.BRIEF_FILE, app)
        self.assertIn("Do not build, commit, push or open a PR", app)
        self.assertIn("leave the `Pen:` and `ImageGen:` lines empty", app)
        self.assertIn("app-ui-brief-template.md", app)
        retry = design_gate.render_brief_prompt(
            issue(title="Homepage hero"), "ctx", retry=True, missing=[5, 9])
        self.assertIn("design-brief-template.md", retry)
        self.assertIn("Frontier retry", retry)
        self.assertIn("Steps 5, 9", retry)

    def test_runner_routes_brief_runs_and_sends_the_retry_to_the_frontier_lane(self):
        lane = load_lane()
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))

            def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
                if args[:3] == ["git", "worktree", "add"]:
                    Path(args[-2]).mkdir(parents=True)
                return SimpleNamespace(returncode=0, stdout="0", stderr="")

            commands = []

            def fake_agent(cmd, cwd, log, timeout, **kwargs):
                commands.append(cmd[0])
                (cwd / design_gate.BRIEF_FILE).write_text(app_brief(pen=""))
                return SimpleNamespace(returncode=0)

            gated = lane.Issue("id-JOV-9", "JOV-9", "Sidebar dock stack", "Sidebar dock",
                               1, "2026-09-01T00:00:00Z", ["ws:ui-ia"])
            linear = FakeLinear([gated])
            providers = {"devin": {"cmd": ["devin"]}, "codex": {"cmd": ["codex"], "health": ["true"]}}
            with mock.patch.object(lane, "sh", fake_sh), \
                    mock.patch.object(lane, "run_agent", fake_agent), \
                    mock.patch.object(lane, "context_pack", lambda issue: "ctx"), \
                    mock.patch.object(lane, "load_providers", return_value=providers), \
                    mock.patch.object(lane, "provider_healthy", return_value=True), \
                    mock.patch.object(lane.disk_guard, "free_pct", return_value=50.0):
                first = lane.run_brief(host, "devin", providers["devin"], linear, gated)
                second = lane.run_brief(host, "devin", providers["devin"], linear, linear.refresh(gated))
            self.assertEqual((first["verdict"], first["kind"], first["briefRetry"]),
                             ("brief-incomplete", "design-brief", False))
            self.assertEqual((second["provider"], second["briefRetry"]), ("codex", True))
            self.assertEqual(commands, ["devin", "codex"])
            self.assertIsNone(second["result"]["pr"])
            prompt = (host.state / "runs" / f"{second['runId']}.prompt.md").read_text()
            self.assertIn("Frontier retry", prompt)
            self.assertEqual(design_gate.build_admission(linear.refresh(gated))["reason"], "brief-auto")


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


class DoctorStallTest(unittest.TestCase):
    def test_age_histogram_and_stale_alert(self):
        fresh = issue("JOV-1", labels=["ws:ui-ia"], title="Sidebar dock",
                      description="x\n" + design_gate.held_marker(NOW - 600))
        day = issue("JOV-2", labels=["ws:ui-ia"], title="Chat titlebar",
                    description="x\n" + design_gate.held_marker(NOW - 7 * 3600))
        stuck = issue("JOV-3", labels=["ws:ui-ia", "needs-design-brief"], title="Settings panel",
                      description="x\n" + design_gate.held_marker(NOW - design_gate.HOLD_ALERT_S))
        unknown = issue("JOV-4", labels=["ws:ui-ia", "needs-design-brief"], title="Library grid")
        pool = {"devin": [fresh, day, stuck, unknown]}
        census = design_gate.apply_to_pool(pool, {}, now=NOW)
        self.assertEqual(census["ageHistogram"],
                         {"<1h": 1, "1-6h": 0, "6-24h": 1, ">=24h": 1, "unknown": 1})
        self.assertEqual((census["autoAdmitted"], census["needsBrief"]), (1, 3))
        self.assertEqual(census["stale"], ["JOV-3"])
        self.assertEqual([item.identifier for item in pool["devin"]], ["JOV-3"])


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

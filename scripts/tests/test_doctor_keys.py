"""JOV-14452 filer guardrail tests: stable keys, marker upsert in any state, close
hysteresis, flap damping, the per-host create cap with one upserted rollup, the
scanner-error classification of sweep holds, and the JOV-14764 install-receipt
gate for Done (merge is not deploy).

Run with:
    python3 -m unittest scripts/tests/test_doctor_keys.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import string
from types import SimpleNamespace
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")
doctor_keys = doctor.doctor_keys  # the exact instance doctor.py imported
doctor_filer = doctor.doctor_filer  # the filer engine (cap, damping, rollup)
doctor_release = load("doctor_release")


def git_chain(path: Path):
    """A real git object store: base <- fix <- tip on main, plus a divergent
    commit for the rebase-away case. Returns (fix, tip, divergent)."""
    def run(*args):
        subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True)
    path.mkdir(parents=True, exist_ok=True)
    run("init", "-q", "-b", "main")
    run("config", "user.email", "t@jovie")
    run("config", "user.name", "t")
    (path / "f.txt").write_text("base\n")
    run("add", "-A")
    run("commit", "-qm", "base")
    base = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    (path / "f.txt").write_text("fix\n")
    run("add", "-A")
    run("commit", "-qm", "fix")
    fix = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    (path / "f.txt").write_text("tip\n")
    run("add", "-A")
    run("commit", "-qm", "tip")
    tip = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    run("checkout", "-q", "-b", "divergent", base)  # a parallel line of history without the fix
    (path / "f.txt").write_text("other\n")
    run("add", "-A")
    run("commit", "-qm", "other")
    divergent = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    run("checkout", "-q", "main")
    return fix, tip, divergent


def write_receipt(state_dir: Path, source_commit: str, refused=False):
    (Path(state_dir) / "lanes-status.json").write_text(
        json.dumps({"release": {"sourceCommit": source_commit, "bundleDigest": "d",
                                "installedAt": "2026-11-23T18:00:00Z", "refused": refused}}))


def obs(**overrides):
    """The same observation base test_doctor.py uses, so judge() runs its full rule set."""
    base = {"now": 1_000_000.0, "tick": {"at": "2026-09-26T21:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"count": 2, "available": ["a"], "accounts": {"a": {"resetsInS": 0}, "b": {"resetsInS": 900}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 0, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    return base


class MutableClock:
    def __init__(self, value):
        self.value = value

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


class LinearFake:
    """Linear transport double: marker lookups answer from its own issue store (any
    state), and every mutation is recorded so tests can prove what did NOT happen."""

    def __init__(self, flap_label=False):
        self.issues = {}  # id -> {title, description, state, labels}
        self.counter = 100
        self.moves, self.comments, self.label_adds, self.updates, self.label_creates = [], [], [], [], []
        self.flap_label = flap_label

    def gql(self, query, variables):
        if "description:{contains:$d}" in query:
            rows = [{"id": id_, "state": {"type": row["state"]}}
                    for id_, row in self.issues.items() if variables["d"] in row["description"]]
            return {"issues": {"nodes": rows[:5]}}
        if "issue(id:$id){description}" in query:  # JOV-14764: the install-receipt gate reads the body
            row = self.issues.get(variables["id"]) or {}
            return {"issue": {"description": row.get("description", "")}}
        if "teams(filter" in query:
            labels = [{"id": "symphony", "name": "symphony"}]
            if self.flap_label:
                labels.append({"id": "flap", "name": doctor_keys.FLAP_LABEL})
            return {"teams": {"nodes": [{"id": "team",
                                         "states": {"nodes": [{"id": "triage", "name": "Triage"},
                                                              {"id": "backlog", "name": "Backlog"},
                                                              {"id": "done", "name": "Done"}]},
                                         "labels": {"nodes": labels}}]}}
        if "issueLabels(" in query:
            if self.flap_label and variables["n"] == doctor_keys.FLAP_LABEL:
                return {"issueLabels": {"nodes": [{"id": "flap", "name": doctor_keys.FLAP_LABEL}]}}
            return {"issueLabels": {"nodes": []}}
        if "issueLabelCreate" in query:
            self.label_creates.append(variables)
            return {"issueLabelCreate": {"issueLabel": {"id": "made-label", "name": variables["i"]["name"]}}}
        if "issueAddLabel" in query:
            self.label_adds.append((variables["id"], variables["l"]))
            return {"issueAddLabel": {"success": True}}
        if "issueUpdate" in query:
            self.updates.append((variables["id"], variables.get("d")))
            if variables["id"] in self.issues and variables.get("d") is not None:
                self.issues[variables["id"]]["description"] = variables["d"]
            return {"issueUpdate": {"success": True}}
        if "issueCreate" in query:
            self.counter += 1
            issue_id = f"ISSUE-{self.counter}"
            created = variables["i"]
            state = {"backlog": "backlog", "done": "completed"}.get(created.get("stateId"), "triage")
            self.issues[issue_id] = {"title": created["title"], "description": created.get("description", ""),
                                     "state": state, "labels": list(created.get("labelIds") or [])}
            return {"issueCreate": {"issue": {"id": issue_id, "identifier": f"JOV-{self.counter}"}}}
        if "issue(id:$id){state{type}}" in query:
            row = self.issues.get(variables["id"]) or {}
            return {"issue": {"state": {"type": row.get("state", "started")}}}
        raise AssertionError(f"unhandled query: {query[:90]}")

    def move(self, issue_id, target):
        self.moves.append((issue_id, target))
        if issue_id in self.issues:
            self.issues[issue_id]["state"] = "completed" if target == "Done" else "triage"
        return True

    def state_of(self, issue_id):
        return "Done" if (self.issues.get(issue_id) or {}).get("state") == "completed" else "Triage"

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))
        return True

    def titled(self, prefix):
        return [id_ for id_, row in self.issues.items() if row["title"].startswith(prefix)]

    def non_rollup(self):
        return [id_ for id_, row in self.issues.items()
                if not row["title"].startswith(doctor_keys.ROLLOUP_TITLE_PREFIX)]


class TrackerHarness(unittest.TestCase):
    """A real doctor.Tracker over a recording Linear fake, a durable ledger and a
    controllable clock; no test methods here, subclasses add only their own."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = MutableClock(1_000_000.0)
        for module in (doctor_keys, doctor_filer, doctor_release):
            patcher = mock.patch.object(module.time, "time", self.clock)
            patcher.start()
            self.addCleanup(patcher.stop)

    def tracker(self, linear=None, flap_label=False):
        ledger = doctor_filer.FilerLedger(Path(self.tmp.name) / "doctor-filer.json")
        return doctor.Tracker(linear or LinearFake(flap_label=flap_label), "gem", ledger)

    def tick(self, tracker, state, alerts, advance=600):
        self.clock.advance(advance)
        return doctor.reconcile(alerts, state, tracker, self.clock.value)

    def mature_clear(self, tracker, state, advance=600):
        for _ in range(3):
            state = self.tick(tracker, state, {})
        return state


class GuardrailTest(TrackerHarness):

    def test_volatile_suffixes_normalize(self):
        for a, b in (("sweep-snapshot-secret:checkout-7f3a2b1c9d2e-main",
                      "sweep-snapshot-secret:checkout-0abcdef12345-main"),
                     ("capacity:access-gaps-mac:1a2b3c4d5e6f", "capacity:access-gaps-mac:9f8e7d6c5b4a"),
                     ("production-deploy:release-gate-new-blocker:a1b2c3d4e5f6",
                      "production-deploy:release-gate-new-blocker:f6e5d4c3b2a1"),
                     ("red-dispatch-unclaimed:17063", "red-dispatch-unclaimed:17064"),
                     ("gap-2026-11-22T18:04:07Z", "gap-2026-11-23T09:00:00Z"),
                     ("run 41946653614 failed", "run 34662670237 failed")):
            with self.subTest(key=a):
                self.assertEqual(doctor_keys.normalize(a), doctor_keys.normalize(b))
        self.assertEqual(doctor_keys.normalize("red-dispatch-unclaimed:17063"), "red-dispatch-unclaimed:<n>")
        for stable in ("disk-low", "provider-idle:codex", "bottleneck:merge-queue",
                       "production-deploy:release-gate-new-blocker:desktop-release:deploy-gate"):
            self.assertEqual(doctor_keys.normalize(stable), stable)
        self.assertNotEqual(doctor_keys.normalize("provider-idle:ab"), doctor_keys.normalize("provider-idle:cd"))
        self.assertNotEqual(doctor_keys.doctor_key("disk-low", "gem"), doctor_keys.doctor_key("disk-low", "mac"))
        marker = doctor_keys.marker("disk-low", "gem")
        self.assertTrue(marker.startswith(doctor_keys.MARKER_PREFIX) and marker.endswith(doctor_keys.MARKER_SUFFIX))
        self.assertEqual(len(marker), len(doctor_keys.MARKER_PREFIX) + 64 + len(doctor_keys.MARKER_SUFFIX))
        self.assertEqual(doctor_keys.impact_free_class("sweep-snapshot-secret:checkout-<h>-main"),
                         "sweep-snapshot-secret")
        self.assertEqual(doctor_keys.impact_free_class("capacity:access-gaps-mac:<h>"), "capacity:access-gaps")
        self.assertEqual(doctor_keys.impact_free_class("scan-failed:trufflehog=<n>"), "worktree-or-scanner")
        self.assertIsNone(doctor_keys.impact_free_class("disk-low"))

    def test_hold_breakdown_classifies_scanner_errors_not_findings(self):
        rows = [{"name": "checkout-a", "path": "/private/root", "reason": "scan-failed:trufflehog=1,gitleaks=0"},
                {"name": "checkout-b", "path": "/private/root", "reason": "scan-failed:trufflehog=1,gitleaks=0"},
                {"name": "checkout-c", "path": "/private/root", "reason": "secret-finding:trufflehog"},
                {"name": "checkout-d", "path": "/private/root", "reason": "archive-credentials-unconfigured"}]
        alerts = doctor.judge(obs(sweepSecretHeld=rows, sweepSecretHeldCoverage="known"))
        text = alerts[doctor_sweep_hold_key()]
        self.assertIn("2 scanner error(s) (scan failed, not findings)", text)
        self.assertIn("1 confirmed finding(s)", text)
        self.assertNotIn("trufflehog=1", text, "a scanner error is not a finding, and reasons stay redacted")
        self.assertEqual(doctor_keys.hold_breakdown([]), None)

    def test_same_key_never_two_open_issues(self):
        tracker = self.tracker()
        state = {}
        for i in range(50):  # the harshest flap: fire/clear on every other tick
            state = self.tick(tracker, state, {"disk-low": "4% free"} if i % 2 == 0 else {})
            open_now = [id_ for id_ in tracker.linear.titled("Symphony doctor: disk-low")
                        if tracker.linear.issues[id_]["state"] != "completed"]
            self.assertLessEqual(len(open_now), 1, "at no tick may two open issues exist for one key")
        self.assertEqual(len(tracker.linear.titled("Symphony doctor: disk-low")), 1, "50 alternating ticks, one issue")
        state = self.mature_clear(tracker, state)
        owner = tracker.linear.titled("Symphony doctor: disk-low")[0]
        self.assertEqual(tracker.linear.issues[owner]["state"], "completed")
        state = self.tick(tracker, state, {"disk-low": "again"})
        self.assertEqual(len(tracker.linear.issues), 1, "a refire after a sustained clear reopens, never refiles")
        self.assertEqual(tracker.linear.moves[-1], (owner, "Triage"))
        self.assertIn(doctor_keys.marker("disk-low", "gem"), tracker.linear.issues[owner]["description"])

    def test_cooloff_expiry_reopens_not_files(self):
        tracker = self.tracker()
        state = self.tick(tracker, {}, {"disk-low": "4% free"})
        owner = tracker.linear.titled("Symphony doctor: disk-low")[0]
        state = self.mature_clear(tracker, state)
        self.clock.advance(3 * doctor.COOL_OFF_S)  # far past the old cool-off refile window
        state = self.tick(tracker, state, {"disk-low": "much later"})
        self.assertEqual(len(tracker.linear.non_rollup()), 1, "no twin after the cool-off expires (JOV-14452)")
        self.assertEqual(tracker.linear.moves[-1], (owner, "Triage"))
        self.assertEqual(state["issues"]["disk-low"], {"id": owner, "closedAt": None})

    def test_hysteresis_and_flap_damping(self):
        tracker = self.tracker(flap_label=True)
        state = self.tick(tracker, {}, {"disk-low": "4% free"})
        owner = tracker.linear.titled("Symphony doctor: disk-low")[0]
        moves_after_open = len(tracker.linear.moves)
        state = self.tick(tracker, state, {})  # absent 1: 10 min is not enough
        state = self.tick(tracker, state, {})  # absent 2: still not enough
        self.assertEqual(len(tracker.linear.moves), moves_after_open, "no close before 3 absent ticks and 30 min")
        self.assertIsNone(state["issues"]["disk-low"]["closedAt"])
        state = self.tick(tracker, state, {})  # absent 3: 30 minutes since the last sighting
        self.assertEqual(state["issues"]["disk-low"]["closedAt"], self.clock.value)
        self.assertEqual(tracker.linear.moves[-1], (owner, "Done"))
        moves_after_close = len(tracker.linear.moves)
        reopen_moves = 0
        for cycle in range(4):  # fire/close cycles until the flapper freezes
            before = len(tracker.linear.moves)
            state = self.tick(tracker, state, {"disk-low": f"cycle {cycle}"})
            reopen_moves += len(tracker.linear.moves) - before
            state = self.mature_clear(tracker, state)
        self.assertEqual(reopen_moves, doctor_keys.FLAP_REOPENS, "the third reopen is the last move")
        self.assertEqual(tracker.linear.issues[owner]["state"], "triage",
                         "a flapper stops moving the moment it has been reopened 3 times in 24h (JOV-14452)")
        self.assertIn((owner, "flap"), tracker.linear.label_adds, "label doctor-flapping is applied once")
        frozen_moves = len(tracker.linear.moves)
        comments_before = len(tracker.linear.comments)
        for hour in (1, 6, 12):  # more flapping within the same day: no moves, at most one comment
            self.clock.advance(hour * 3600)
            state = self.tick(tracker, state, {"disk-low": "still flapping"})
            state = self.mature_clear(tracker, state)
        self.assertEqual(len(tracker.linear.moves), frozen_moves, "a damped issue never moves again")
        self.assertLessEqual(len(tracker.linear.comments) - comments_before, 1,
                             "a damped issue gets at most one comment a day")
        self.assertIn("disk-low", tracker.filer.report(self.clock.value)["dampened"],
                      "the self-monitor block names the frozen flapper")

    def test_rate_cap_rollup(self):
        tracker = self.tracker()
        names = [a + b for a in string.ascii_lowercase for b in string.ascii_lowercase][:150]
        alerts = {f"provider-idle:{name}": f"provider {name} idle" for name in names}
        alerts.update({f"disk:{name}": f"mount {name} full" for name in names[:40]})  # a second family
        state = self.tick(tracker, {}, alerts)
        created = tracker.linear.titled("Symphony doctor: provider-idle")
        disks = tracker.linear.titled("Symphony doctor: disk")
        rollups = tracker.linear.titled(doctor_keys.ROLLOUP_TITLE_PREFIX)
        self.assertEqual(len(created), doctor_keys.CREATE_CAP_PER_HOUR,
                         "at most 3 creates per family per hour (provider-idle)")
        self.assertEqual(len(disks), doctor_keys.CREATE_CAP_PER_HOUR,
                         "a second family gets its own 3, not the host-wide old cap (P0 2026-11-24)")
        self.assertEqual(len(rollups), 1, "the overflow folds into one rollup issue")
        self.assertEqual(len(tracker.linear.issues), 7, "190 new keys: 3+3 creates plus 1 rollup, nothing else")
        rollup = tracker.linear.issues[rollups[0]]
        self.assertEqual(rollup["state"], "backlog", "the rollup is a background checklist, never Triage (P0)")
        self.assertIn(f"`{doctor_keys.ANOMALY_CLASS}`", rollup["description"], "the cap raise is self-reported")
        self.assertIn("`provider-idle:", rollup["description"])
        self.assertIn("(+124 more classes)", rollup["description"], "the capped keys fold into the checklist")
        self.assertIn("(disk, provider-idle family)", rollup["description"], "the anomaly names the capped families")
        state = self.tick(tracker, state, alerts)  # steady state: no second wave of anything
        self.assertEqual(len(tracker.linear.issues), 7)
        report = tracker.filer.report(self.clock.value)
        self.assertEqual(report["createCap"], doctor_keys.CREATE_CAP_PER_HOUR)
        self.assertGreaterEqual(report["createsPastHour"], 4)
        self.assertTrue(state["filer"]["anomaly"], "the filer block in doctor.json carries the anomaly")
        self.clock.advance(3600)  # the overflow marker ages out of the one-hour window
        state = self.mature_clear(tracker, state)
        self.assertEqual(tracker.linear.issues[rollups[0]]["state"], "completed",
                         "an emptied rollup closes so Triage reflects reality")

    def test_no_impact_class_flood_folds_into_one_rollup_line(self):
        tracker = self.tracker()
        names = [a + b for a in string.ascii_lowercase for b in string.ascii_lowercase][:150]
        for name in names:  # the old writer's shape: one volatile key per held worktree
            tracker.open(f"sweep-snapshot-secret:checkout-{name}-7f3a2b1c9d2e", f"worktree {name} held")
        tracker.flush()
        self.assertEqual(tracker.linear.non_rollup(), [], "sweep holds never own a Triage issue (JOV-14452)")
        rollups = tracker.linear.titled(doctor_keys.ROLLOUP_TITLE_PREFIX)
        self.assertEqual(len(rollups), 1, "1,127-class floods stay one rollup signal")
        description = tracker.linear.issues[rollups[0]]["description"]
        self.assertEqual(description.count("- [ ] `sweep-snapshot-secret`"), 1, "one checklist line for the class")
        self.assertIn("(+149 more variant(s))", description)
        self.assertNotIn("trufflehog", description)
        self.assertEqual(tracker.filer.report(self.clock.value)["rollupClasses"], ["sweep-snapshot-secret"])


class InstallReceiptTest(TrackerHarness):
    """JOV-14764: an issue whose fix is recorded reaches Done only when the host
    install receipt proves the installed generation contains it (equal SHA or
    ancestor); anything else fails closed with one daily comment and no move."""

    def open_with_fix(self, tracker, fix):
        state = self.tick(tracker, {}, {"disk-low": "4% free"})
        owner = tracker.linear.titled("Symphony doctor: disk-low")[0]
        if fix is not None:
            tracker.linear.issues[owner]["description"] += f"\n<!-- doctor-fix:{fix} -->"
        return state, owner

    def test_done_requires_install_receipt(self):
        fix, tip, divergent = git_chain(Path(self.tmp.name) / "repo")
        for label, marker, installed in (("an ancestor install closes it", fix, tip),
                                         ("the exact install closes it", tip, tip),
                                         ("a divergent install never closes it", divergent, tip)):
            with self.subTest(case=label):
                (Path(self.tmp.name) / "doctor-filer.json").unlink(missing_ok=True)
                tracker = self.tracker()
                state, owner = self.open_with_fix(tracker, marker)
                write_receipt(Path(self.tmp.name), installed)
                with mock.patch.dict(os.environ, {"LANES_REPO": str(Path(self.tmp.name) / "repo")}):
                    state = self.mature_clear(tracker, state)
                if marker == installed or marker == fix and installed == tip:
                    self.assertEqual(tracker.linear.issues[owner]["state"], "completed", label)
                    self.assertEqual(state["issues"]["disk-low"]["closedAt"], self.clock.value)
                else:
                    self.assertEqual(tracker.linear.issues[owner]["state"], "triage", label)
                    self.assertIsNone(state["issues"]["disk-low"].get("closedAt"))
                    self.assertEqual(state["issues"]["disk-low"].get("pendingAction"), "close")
                    self.assertTrue(any("awaiting Gem install" in body for _, body in tracker.linear.comments), label)

    def test_receipt_missing_fails_closed(self):
        fix, tip, divergent = git_chain(Path(self.tmp.name) / "repo")
        for label, receipt in (("no lanes-status.json", None),
                               ("malformed JSON", "{not json"),
                               ("a refused install", "refused"),
                               ("a short sourceCommit", "short")):
            with self.subTest(case=label):
                for stale in ("doctor-filer.json", "lanes-status.json"):
                    (Path(self.tmp.name) / stale).unlink(missing_ok=True)
                tracker = self.tracker()
                state, owner = self.open_with_fix(tracker, fix)
                if receipt == "refused":
                    write_receipt(Path(self.tmp.name), tip, refused=True)
                elif receipt == "short":
                    write_receipt(Path(self.tmp.name), "abc123")
                elif receipt is not None:
                    (Path(self.tmp.name) / "lanes-status.json").write_text(receipt)
                with mock.patch.dict(os.environ, {"LANES_REPO": str(Path(self.tmp.name) / "repo")}):
                    for _ in range(6):  # retries keep failing closed, one comment a day
                        state = self.tick(tracker, state, {})
                self.assertEqual(tracker.linear.issues[owner]["state"], "triage", label)
                self.assertIsNone(state["issues"]["disk-low"].get("closedAt"), label)
                awaiting = [body for _, body in tracker.linear.comments if "awaiting Gem install" in body]
                self.assertEqual(len(awaiting), 1, f"{label}: one upserted comment a day, not per tick")

    def test_no_fix_sha_uses_hysteresis_close(self):
        tracker = self.tracker()
        state, owner = self.open_with_fix(tracker, None)  # a plain doctor issue, no fix marker
        state = self.tick(tracker, state, {})
        state = self.tick(tracker, state, {})
        self.assertEqual(tracker.linear.issues[owner]["state"], "triage", "two absent ticks do not close it")
        self.assertIsNone(state["issues"]["disk-low"].get("closedAt"))
        state = self.tick(tracker, state, {})  # the third absent tick spans 30 minutes
        self.assertEqual(tracker.linear.issues[owner]["state"], "completed", "plain clears still reach Done (JOV-14452)")
        self.assertEqual(state["issues"]["disk-low"]["closedAt"], self.clock.value)
        self.assertEqual([body for _, body in tracker.linear.comments if "awaiting Gem install" in body], [])

    def test_gate_internals_fail_closed_and_note_once_a_day(self):
        fix, tip, divergent = git_chain(Path(self.tmp.name) / "repo")
        repo = str(Path(self.tmp.name) / "repo")
        tracker = self.tracker()
        real = tracker.linear

        class Down:
            def gql(self, query, variables):
                raise RuntimeError("linear down")

        tracker.linear.issues["ISSUE-1"] = {"title": "t", "description": f"<!-- doctor-fix:{fix} -->",
                                            "state": "triage", "labels": []}
        write_receipt(Path(self.tmp.name), tip)
        tracker.linear = Down()
        self.assertTrue(doctor_release.awaiting_install(tracker, "ISSUE-1", "disk-low", repo=repo),
                        "an unreadable issue body fails closed")
        tracker.linear = real
        self.assertFalse(doctor_release.awaiting_install(tracker, "ISSUE-1", "disk-low", repo=repo),
                         "an installed ancestor closes normally")
        self.assertTrue(doctor_release.contains(Path(self.tmp.name) / "repo", fix, tip))
        self.assertFalse(doctor_release.contains(Path(self.tmp.name) / "repo", divergent, tip),
                         "a rebased-away fix is never proven installed")
        self.assertFalse(doctor_release.contains(None, fix, tip), "no repo means no proof")
        self.assertIsNone(doctor_release.read_receipt(Path(self.tmp.name) / "nowhere"))
        with mock.patch.dict(os.environ, {"LANES_REPO": "/nonexistent-lanes-repo"}):
            self.assertIsNone(doctor_release.repo_root(), "a non-checkout LANES_REPO proves nothing")
        write_receipt(Path(self.tmp.name), divergent)  # the installed generation went another way
        for _ in range(2):  # a divergent fix keeps awaiting; the note is upserted once a day
            self.assertTrue(doctor_release.awaiting_install(tracker, "ISSUE-1", "disk-low", repo=repo))
        notes = [body for _, body in tracker.linear.comments if "awaiting Gem install" in body]
        self.assertEqual(len(notes), 1, "one upserted comment a day, not one per attempt")
        bare = SimpleNamespace(linear=real)  # no durable ledger: the note is skipped, the gate still holds
        self.assertTrue(doctor_release.awaiting_install(bare, "ISSUE-1", "disk-low", repo=repo))
        self.assertEqual([body for _, body in tracker.linear.comments if "awaiting Gem install" in body], notes)


def doctor_sweep_hold_key():
    return doctor.doctor_sweep_hold.KEY


if __name__ == "__main__":
    unittest.main()

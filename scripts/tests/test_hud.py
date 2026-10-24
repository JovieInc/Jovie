"""Regression tests for scripts/lanes/hud.py (the Symphony console HUD).

Run with:
    python3 -m unittest scripts/tests/test_hud.py -v
"""
from __future__ import annotations

import importlib.util
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("hud", ROOT / "scripts/lanes/hud.py")
hud = importlib.util.module_from_spec(SPEC)
sys.modules["hud"] = hud
SPEC.loader.exec_module(hud)

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def plain(line: str) -> str:
    return ANSI.sub("", line)


def cells(frame: list[str], raw: bool = False) -> list[str]:
    """Each column's segment of each physical row (the frame is laid out in columns)."""
    return [cell for row in frame for cell in (row if raw else plain(row)).split(hud.GUTTER)]


def model(**overrides) -> dict:
    base = {
        "local": {
            "host": "gem", "release": "06a337b", "releaseMatchesHud": True, "hudDir": "/x",
            "providers": {"devin": {}, "codex": {}}, "slots": {"devin": 2, "codex": 1},
            "workers": [
                {"pid": 1, "provider": "devin", "run": {"runId": "r1", "provider": "devin", "kind": "issue", "target": "JOV-6544",
                                                        "startedAt": "2026-09-26T20:00:00+00:00", "phase": "agent"}},
                {"pid": 2, "provider": "devin", "run": None},
            ],
            "ledger24h": {"landing": 3, "failed": 1, "gate-timeout": 2}, "runs24h": 6,
            "receipts24h": [{"runId": "lane-1", "issue": "JOV-1", "provider": "devin", "pr": 18671,
                              "agentExit": 0, "verdict": "landing", "startedAt": "2026-09-26T19:00:00Z",
                              "endedAt": "2026-09-26T19:30:00Z"}],
            "attributionReceipts": [{"runId": "lane-1", "issue": "JOV-1", "provider": "devin", "pr": 18671,
                                      "agentExit": 0, "verdict": "landing", "startedAt": "2026-09-26T19:00:00Z",
                                      "endedAt": "2026-09-26T19:30:00Z"}],
            "lastLanding": "2026-09-26T20:30:00Z", "held": {"18712": {"sha": "a", "evidence": ["check-failed:bash scripts/hooks/pre-push-gate.sh affected"]}},
            "failures": {"JOV-1": {"count": 1, "at": 0}}, "gateTimeouts": {}, "requeue": {"18720": "h"},
            "cooldowns": {"hyperagent": 600}, "gateSeats": 2,
            "codex": {"accounts": {"alpha": {"available": True, "leased": False, "resetsInS": 0, "remainingPercent": 48, "naturalResetInS": 600, "bankedResetCount": 2},
                                   "beta": {"available": False, "leased": False, "resetsInS": 5400, "remainingPercent": 0, "naturalResetInS": 5400, "bankedResetCount": 1},
                                   "gamma": {"available": True, "leased": True, "resetsInS": 0, "remainingPercent": 90, "naturalResetInS": 7200, "bankedResetCount": 0}},
                      "available": ["alpha"], "count": 3},
            "doctor": {"alerts": {"dispatch-crash": "dispatch failed 3 ticks in a row"}},
        },
        "linear": {"ok": True, "pool": {"agent-ready": 87, "devin": 0, "codex": 19}, "poolTotal": 99,
                   "active": {"JOV-6544": "Audio browsing: verify and close intent prefetch"}, "triage": 11,
                   "fetchedAt": hud.utcnow().isoformat()},
        "github": {"ok": True, "errors": {},
                   "open": [{"number": 18724, "title": "JOV-6544 fix(audio): converge now-playing metadata", "lane": "devin",
                             "issue": "JOV-6544", "draft": False, "merge": "UNSTABLE", "updatedAt": "2026-09-26T20:20:26Z"},
                            {"number": 18712, "title": "JOV-6544 fix(web): warm release detail", "lane": "devin", "issue": "JOV-6544",
                             "draft": True, "merge": "CLEAN", "headRefOid": "a", "updatedAt": "2026-09-26T18:29:49Z"}],
                   "merged24h": [{"number": 18671, "title": "fix(ios): preserve chat cache timestamps",
                                   "createdAt": "2026-09-26T19:00:00Z", "mergedAt": "2026-09-26T20:12:00Z",
                                   "headRefName": "devin/jov-1-20260926t190000", "lane": "devin"},
                                 {"number": 18759, "title": "fix(lanes): one PR per issue",
                                  "createdAt": "2026-09-26T20:00:00Z", "mergedAt": "2026-09-26T20:54:50Z",
                                  "headRefName": "tim/jov-1", "lane": None}],
                   "queue": {"depth": 2, "entries": [{"number": 18724, "state": "AWAITING_CHECKS", "enqueuedAt": "2026-09-26T20:20:28Z"}]},
                   "rate": {"core": 4800, "graphql": 4700, "resetAt": "2026-09-26T21:30:00+00:00"},
                   "fetchedAt": hud.utcnow().isoformat()},
        "system": {"load1": 1.2, "cores": 16, "diskFreePct": 3.1, "memAvailPct": 80},
    }
    for account in base["local"]["codex"]["accounts"].values():
        account["capacityLease"] = {"sources": {"capacity": {"observedAt": hud.utcnow().isoformat()}}}
    base.update(overrides)
    return base


class MergeEvidenceTest(unittest.TestCase):
    def test_unread_open_inventory_is_unknown_not_zero(self):
        sample = model()
        sample["github"].pop("open")
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("open lane PRs unknown", text)
        self.assertIn("PR list: not-read-yet", text)
        self.assertNotIn("open lane PRs 0", text)

    def test_failed_inventory_suppresses_partial_or_stale_rows(self):
        sample = model()
        sample["github"]["errors"]["open"] = "github-budget-floor: 529 (< 600) until reset"
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("open lane PRs unknown", text)
        self.assertIn("github-budget-floor: 529 (< 600) until reset", text)
        frame = hud.render(sample, width=200)
        self.assertFalse([cell for cell in cells(frame) if cell.startswith(("#18724 ", "#18712 "))])

    def test_non_list_inventory_renders_unknown_without_iterating_titles(self):
        for inventory in (None, {"partial": "unread"}):
            with self.subTest(inventory=inventory):
                sample = model()
                sample["github"]["open"] = inventory
                text = "\n".join(plain(line) for line in hud.render(sample, width=200))
                self.assertIn("open lane PRs unknown", text)
                self.assertNotIn("open lane PRs 0", text)

    def test_complete_empty_open_inventory_keeps_true_zero(self):
        sample = model()
        sample["github"]["open"] = []
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("open lane PRs 0 · draft 0 · non-draft 0", text)
        self.assertNotIn("PR list: not-read-yet", text)

    def test_initial_remote_state_does_not_claim_zero_merges(self):
        sample = model(github=hud.Remote(None).github)
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("merged unknown", text)
        self.assertIn("not-read-yet", text)
        self.assertNotIn("merged 0 in 24h", text)
        self.assertIn("landed unknown", text)

    def test_complete_empty_window_remains_true_zero(self):
        sample = model()
        sample["github"]["merged24h"] = []
        sample["github"]["mergedWindow"] = {"complete": True}
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("merged 0 in 24h", text)
        self.assertIn("landed 0", text)

    def test_explicit_incomplete_receipt_suppresses_stale_rows(self):
        sample = model()
        sample["github"]["mergedWindow"] = {"complete": False, "reason": "unstable_snapshot"}
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("merged unknown", text)
        self.assertNotIn("merged 2 in 24h", text)
        self.assertNotIn("#18671", text)

    def test_unreadable_merge_evidence_is_unknown_not_zero(self):
        sample = model()
        sample["github"]["errors"]["merged"] = "merged-pr-evidence:unstable_snapshot"
        sample["github"]["merged24h"] = []
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("merged unknown", text)
        self.assertNotIn("merged 0 in 24h", text)
        self.assertIn("landed unknown", text)

    def test_github_model_uses_shared_reader_and_retains_incomplete_reason(self):
        evidence = {"complete": False, "reason": "max_pages_reached", "prs": [],
                    "window": {"since": 1, "until": 2}, "pages": 20, "scans": 1}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "lane_state_dir", return_value=None), \
                mock.patch.object(hud.lane, "load_providers", return_value={}), \
                mock.patch.object(hud, "promotion_model", return_value={"error": "fixture"}), \
                mock.patch.object(hud, "gh_json", side_effect=RuntimeError("fixture")), \
                mock.patch.object(hud.merge_evidence, "collect", return_value=evidence) as collect:
            result = hud.github_model()
        self.assertEqual(result["mergedWindow"]["reason"], "max_pages_reached")
        self.assertIn("max_pages_reached", result["errors"]["merged"])
        self.assertNotIn("merged24h", result)
        self.assertEqual(collect.call_count, 1)

    def test_open_model_retains_exact_head_and_its_own_read_age(self):
        pr = {"number": 123, "title": "repair", "headRefName": "codex/jov-123-20261016t000000",
              "headRefOid": "head-sha", "isDraft": False, "mergeStateStatus": None,
              "updatedAt": "2026-10-16T00:00:00Z"}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "load_providers", return_value={"codex": {}}), \
                mock.patch.object(hud, "promotion_model", return_value={}), \
                mock.patch.object(hud.merge_evidence, "collect_shared", side_effect=RuntimeError("merge unavailable")), \
                mock.patch.object(hud, "gh_json", side_effect=[ [pr], RuntimeError("queue timeout"), RuntimeError("rate timeout") ]) as read:
            result = hud.github_model()
        self.assertEqual(result["open"][0]["headRefOid"], "head-sha")
        self.assertIsNone(result["open"][0]["merge"])
        self.assertEqual(set(result["readAt"]), {"open"})
        self.assertIn("headRefOid", read.call_args_list[0].args[0][-1])
        self.assertFalse(result["ok"])

    def test_successful_model_reads_timestamp_each_authority_separately(self):
        queue = {"data": {"repository": {"mergeQueue": {"entries": {"totalCount": 1,
            "nodes": [{"pullRequest": {"number": 123}, "state": "AWAITING_CHECKS",
                       "enqueuedAt": "2026-10-16T00:00:00Z"}]}}}}}
        merged = {"number": 99, "title": "landed", "mergedAt": "2026-10-16T00:00:00Z",
                  "createdAt": "2026-10-15T00:00:00Z", "headRefName": "codex/jov-99-20261015"}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "load_providers", return_value={"disabled": {"enabled": False}, "codex": {}}), \
                mock.patch.object(hud.lane, "graphql_budget", return_value=(4200, "reset")), \
                mock.patch.object(hud, "promotion_model", return_value={}), \
                mock.patch.object(hud.merge_evidence, "collect_shared", return_value={"complete": True, "window": {"until": hud.utcnow().timestamp()}, "prs": [merged]}), \
                mock.patch.object(hud, "gh_json", side_effect=[[], queue, {"resources": {"core": {"remaining": 4500}}}]):
            result = hud.github_model()
        self.assertTrue(result["ok"])
        self.assertEqual(set(result["readAt"]), {"open", "merged", "queue", "rate"})
        self.assertEqual(result["queue"]["depth"], 1)
        self.assertEqual(result["merged24h"][0]["number"], 99)
        self.assertTrue(all(hud.github_source_error(result, source, hud.utcnow()) is None
                            for source in result["readAt"]))

    def test_shared_merge_cache_age_is_not_renewed_by_a_successful_read(self):
        now = hud.utcnow()
        cached_until = now.timestamp() - 240
        evidence = {"complete": True, "window": {"until": cached_until}, "prs": []}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "load_providers", return_value={}), \
                mock.patch.object(hud, "promotion_model", return_value={}), \
                mock.patch.object(hud.merge_evidence, "collect_shared", return_value=evidence), \
                mock.patch.object(hud, "gh_json", side_effect=RuntimeError("queue/rate")):
            result = hud.github_model()
        self.assertEqual(hud.datetime.fromisoformat(result["readAt"]["merged"]).timestamp(), cached_until)
        later = now + hud.timedelta(seconds=840)
        self.assertIn("stale", hud.github_source_error(result, "merged", later))
        with mock.patch.object(hud, "utcnow", return_value=later):
            text = "\n".join(plain(row) for row in hud.render(model(github=result), 200, 45))
        self.assertIn("merged unknown", text)
        self.assertNotIn("merged 0 in 24h", text)

    def test_truncated_queue_is_unknown_not_partial_membership(self):
        queue = {"data": {"repository": {"mergeQueue": {"entries": {"totalCount": 21, "nodes": []}}}}}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "load_providers", return_value={}), \
                mock.patch.object(hud, "promotion_model", return_value={}), \
                mock.patch.object(hud.merge_evidence, "collect_shared", side_effect=RuntimeError("merge")), \
                mock.patch.object(hud, "gh_json", side_effect=[queue, RuntimeError("rate")]):
            result = hud.github_model()
        self.assertNotIn("queue", result)
        self.assertNotIn("queue", result["readAt"])
        self.assertIn("inventory incomplete", result["errors"]["queue"])

    def test_partial_or_failed_open_read_never_claims_complete_inventory(self):
        for page in ([{}] * 60, None, RuntimeError("HTTP 504")):
            with self.subTest(page=type(page).__name__), \
                    mock.patch.object(hud.lane, "load_github_env"), \
                    mock.patch.object(hud.lane, "load_providers", return_value={"codex": {}}), \
                    mock.patch.object(hud, "promotion_model", return_value={}), \
                    mock.patch.object(hud.merge_evidence, "collect_shared", side_effect=RuntimeError("unavailable")), \
                    mock.patch.object(hud, "gh_json", side_effect=[page, RuntimeError("queue"), RuntimeError("rate")]):
                result = hud.github_model()
                self.assertNotIn("open", result)
                self.assertNotIn("open", result["readAt"])
                self.assertIn("open", result["errors"])

    def test_remote_read_exceptions_replace_cached_success_and_keep_polling(self):
        class Stop(Exception):
            pass
        remote = hud.Remote(SimpleNamespace(state=Path("/nonexistent"), linear_env=None))
        remote.github = model()["github"]
        with mock.patch.object(hud, "running_workers", return_value=[]), \
                mock.patch.object(hud, "production_model", side_effect=RuntimeError("prod unread")), \
                mock.patch.object(hud, "linear_model", side_effect=RuntimeError("mirror failed")), \
                mock.patch.object(hud, "github_model", side_effect=RuntimeError("env read failed")) as github, \
                mock.patch.object(hud.time, "monotonic", return_value=0), \
                mock.patch.object(hud.time, "sleep", side_effect=[None, Stop()]), self.assertRaises(Stop):
            remote.run()
        self.assertEqual(github.call_count, 1)
        self.assertNotIn("open", remote.github)
        self.assertNotIn("queue", remote.github)
        self.assertIn("env read failed", remote.github["errors"]["open"])
        self.assertIn("mirror failed", remote.linear["error"])
        self.assertIn("prod unread", remote.production["error"])

    def test_remote_reads_github_every_five_minutes_and_linear_every_tick(self):
        class Stop(Exception):
            pass
        clock = iter([0, 90, 180, 300, 300])
        sleeps = []
        def sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) == 4:
                raise Stop()
        remote = hud.Remote(SimpleNamespace(state=Path("/nonexistent"), linear_env=None))
        with mock.patch.object(hud, "running_workers", return_value=[]), \
                mock.patch.object(hud, "production_model", return_value={}) as production, \
                mock.patch.object(hud, "linear_model", return_value={"ok": True}) as linear, \
                mock.patch.object(hud, "github_model", return_value={"ok": True}) as github, \
                mock.patch.object(hud.time, "monotonic", side_effect=lambda: next(clock)), \
                mock.patch.object(hud.time, "sleep", side_effect=sleep), \
                self.assertRaises(Stop):
            remote.run()
        self.assertEqual(linear.call_count, 4)
        self.assertEqual(github.call_count, 2)
        self.assertEqual(production.call_count, 4)
        self.assertEqual(sleeps, [hud.REFRESH_REMOTE_S] * 4)


class ParseTest(unittest.TestCase):
    def test_run_ids_name_target_kind_and_start(self):
        info = hud.parse_run_id("20260926T205354Z-PR18695-devin-fix-41d8e6")
        self.assertEqual((info["target"], info["kind"], info["provider"]), ("PR18695", "fix", "devin"))
        self.assertEqual(info["startedAt"], "2026-09-26T20:53:54+00:00")
        self.assertEqual(hud.parse_run_id("20260926T205627Z-JOV-5948-devin-ff9a75")["kind"], "issue")
        self.assertEqual(hud.parse_run_id("20260926T174637Z-PR18712-codex-adopt-135fa8")["kind"], "adopt")
        self.assertIsNone(hud.parse_run_id("ledger"))

    def test_phase_follows_the_last_harness_step(self):
        log = "$ git fetch -q origin main\n$ pnpm install --frozen-lockfile\nProgress: 1\n"
        self.assertEqual(hud.phase_of(log, "devin"), "installing")
        log += "$ devin -p --prompt-file x\nthinking...\nedited file\n"
        self.assertEqual(hud.phase_of(log, "devin"), "agent")
        log += "$ bash scripts/hooks/pre-push-gate.sh affected\n[typecheck] ...\n"
        self.assertEqual(hud.phase_of(log, "devin"), "gate")
        log += "$ gh pr ready 5 --repo x\n"
        self.assertEqual(hud.phase_of(log, "devin"), "landing")
        self.assertEqual(hud.phase_of("codex-lane: account=alpha home=/h\nworking\n", "codex"), "agent (codex)")
        self.assertEqual(hud.phase_of("", "devin"), "starting")


class PipelineAccuracyTest(unittest.TestCase):
    def sample(self, merge="DIRTY", draft=False, held=None, queued=False):
        value = model()
        pr = value["github"]["open"][0]
        pr.update(merge=merge, draft=draft, headRefOid="current-head")
        value["github"]["open"] = [pr]
        value["github"]["queue"] = {"depth": int(queued), "entries":
            value["github"]["queue"]["entries"] if queued else []}
        value["local"]["held"] = {str(pr["number"]): held} if held else {}
        return value

    def row(self, value, width=160):
        return next(cell for cell in cells(hud.render(value, width, 45)) if cell.startswith("#18724 "))

    def pr_rows(self, frame):
        return [cell for cell in cells(frame) if cell.startswith(("#18724 ", "#18712 "))]

    def test_real_conflict_and_exact_head_hold_are_both_visible_at_console_width(self):
        value = self.sample(held={"sha": "current-head", "reason": "gate-timeout",
                                  "evidence": ["check-timeout: pre-push-gate.sh"]})
        row = self.row(value)
        self.assertIn("merge conflict · held: gate-timeout", row)
        self.assertNotIn("READY", row)

    def test_malformed_exact_head_hold_evidence_is_unknown_without_crashing(self):
        for evidence in (4, {"reason": "gate"}, "gate-check-failed", [None, {}], [], None):
            with self.subTest(evidence=evidence):
                row = self.row(self.sample(held={"sha": "current-head", "evidence": evidence}))
                self.assertIn("merge conflict · held: reason unknown", row)

    def test_obsolete_or_unbound_hold_is_not_current_repair_disposition(self):
        for hold in ({"sha": "old-head", "reason": "gate-timeout"},
                     {"reason": "gate-timeout"}, "corrupt"):
            with self.subTest(hold=hold):
                row = self.row(self.sample(held=hold))
                self.assertIn("merge conflict", row)
                self.assertNotIn("held:", row)

    def test_generic_blocked_does_not_invent_failing_checks(self):
        row = self.row(self.sample(merge="BLOCKED"))
        self.assertIn("blocked · reason unknown", row)
        self.assertNotIn("checks", row)
        self.assertNotIn("READY", row)

    def test_nonpassing_status_and_known_check_failure_remain_distinct(self):
        self.assertIn("non-passing status", self.row(self.sample(merge="UNSTABLE")))
        value = self.sample(merge="BLOCKED", held={"sha": "current-head",
            "reason": "gate-check-failed", "evidence": ["check-failed: unit tests"]})
        self.assertIn("held: gate-check-failed", self.row(value))

    def test_queue_then_hold_and_draft_precedence(self):
        queued = self.sample(merge="BLOCKED", draft=True, queued=True)
        self.assertIn("queued awaiting_checks", self.row(queued))
        self.assertNotIn("draft · awaiting gate", self.row(queued))
        self.assertIn("DRAFT", self.row(queued))
        held = self.sample(merge="BLOCKED", draft=True, held={"sha": "current-head",
            "evidence": ["check-failed:bash scripts/hooks/pre-push-gate.sh affected"]})
        self.assertIn("held: check-failed:pre-push-gate.sh", self.row(held))
        self.assertNotIn("draft · awaiting gate", self.row(held))
        self.assertIn("draft · awaiting gate", self.row(self.sample(merge="BLOCKED", draft=True)))

    def test_queued_exact_head_hold_preserves_queue_as_primary_note(self):
        value = self.sample(merge="BLOCKED", queued=True,
                            held={"sha": "current-head", "reason": "gate-timeout"})
        row = self.row(value)
        self.assertIn("queued awaiting_checks", row)
        self.assertIn("held: gate-timeout", row)
        self.assertLess(row.index("queued"), row.index("held:"))

    def test_long_queued_hold_keeps_its_reason_visible_at_console_width(self):
        value = self.sample(merge="BLOCKED", queued=True,
                            held={"sha": "current-head", "reason": "lockfile-without-manifest"})
        row = self.row(value)
        self.assertIn("queued awaiting_checks", row)
        self.assertIn("held: lockfile-without-manifest", row)
        self.assertLessEqual(len(row), 160)
        self.assertIn("queued awaiting_checks · held: lockfile-without-manifest", row)

    def test_unmatched_hud_release_does_not_claim_a_restart_has_started(self):
        value = self.sample()
        value["local"]["releaseMatchesHud"] = False
        header = plain(hud.render(value, 160, 45)[0])
        self.assertIn("! hud≠release", header)
        self.assertNotIn("restarting", header)

    def test_unread_hold_source_is_unknown_not_zero_or_healthy(self):
        value = self.sample()
        value["local"]["heldError"] = "held.json unavailable or invalid"
        value["local"]["doctor"] = {}
        value["local"]["cooldowns"] = {}
        value["local"]["requeue"] = {}
        value["local"]["ledger24h"] = {}
        text = "\n".join(plain(row) for row in hud.render(value, 200, 45))
        self.assertIn("hold records unknown", text)
        self.assertIn("held.json unavailable or invalid", text)
        self.assertNotIn("nothing needs a human", text)

    def test_null_or_missing_merge_state_is_unknown_not_success(self):
        for merge in (None, "", "UNKNOWN"):
            with self.subTest(merge=merge):
                row = self.row(self.sample(merge=merge))
                self.assertIn("merge state unknown", row)
                self.assertNotIn("READY", row)
                self.assertNotIn("queued", row)

    def test_bad_or_stale_source_age_cannot_display_current_pr_or_queue_success(self):
        for stamp in (None, "invalid", "2026-01-01T00:00:00+00:00",
                      "2026-01-01T00:00:00", (hud.utcnow() + hud.timedelta(seconds=30)).isoformat()):
            with self.subTest(stamp=stamp):
                value = self.sample(queued=True)
                value["github"]["fetchedAt"] = stamp
                text = "\n".join(plain(row) for row in hud.render(value, 200, 45))
                self.assertIn("open lane PRs unknown", text)
                self.assertIn("merge queue unknown", text)
                self.assertNotIn("#18724", text)
                self.assertNotIn("queued awaiting", text)
                self.assertIn("merged unknown", text)

    def test_failed_queue_read_does_not_reuse_cached_membership(self):
        value = self.sample(queued=True)
        value["github"]["errors"]["queue"] = "TimeoutError: queue read failed"
        text = "\n".join(plain(row) for row in hud.render(value, 200, 45))
        self.assertIn("merge queue unknown", text)
        self.assertIn("queue read: TimeoutError: queue read failed", text)
        self.assertNotIn("queued", self.row(value))

    def test_invalid_section_timestamps_cannot_fall_back_to_fresh_overall_attempt(self):
        for stamps in (None, "invalid", {}, {"queue": hud.utcnow().isoformat()}):
            with self.subTest(stamps=stamps):
                value = self.sample(queued=True)
                value["github"]["readAt"] = stamps
                frame = hud.render(value, 200, 45)
                text = "\n".join(plain(row) for row in frame)
                self.assertIn("open lane PRs unknown", text)
                self.assertFalse(self.pr_rows(frame))

    def test_section_timestamps_do_not_refresh_older_reads(self):
        value = self.sample(queued=True)
        value["github"]["readAt"] = {"open": "2026-01-01T00:00:00+00:00",
            "queue": value["github"]["fetchedAt"], "merged": value["github"]["fetchedAt"],
            "rate": value["github"]["fetchedAt"]}
        frame = hud.render(value, 200, 45)
        text = "\n".join(plain(row) for row in frame)
        self.assertIn("open lane PRs unknown", text)
        self.assertIn("merge queue 1", text)
        self.assertIn("stale", text)
        self.assertFalse(self.pr_rows(frame))


class RenderTest(unittest.TestCase):
    def test_frame_fits_the_console_exactly(self):
        for width, height in ((160, 45), (120, 30), (240, 60)):
            frame = hud.render(model(), width, height)
            self.assertEqual(len(frame), height)
            for line in frame:
                self.assertLessEqual(len(plain(line)), width, plain(line))

    def test_multiline_provider_errors_do_not_scroll_header_off_console(self):
        value = model()
        value["github"]["promotion"] = {"error": "RuntimeError: quota read\ngh: budget-floor\rretry\tlater"}
        frame = hud.render(value, 160, 45)
        physical_rows = "\n".join(frame).splitlines()
        self.assertEqual(len(physical_rows), 45)
        self.assertIn("JOVIE · SYMPHONY", plain(physical_rows[0]))
        self.assertIn("gh: budget-floor retry later", "\n".join(plain(row) for row in frame))
        self.assertTrue(all(len(plain(row)) == 160 for row in frame))

    def test_unknown_capacity_is_not_colored_healthy(self):
        value = model()
        value["local"]["doctor"]["at"] = hud.utcnow().isoformat()
        value["local"]["doctor"]["capacity"] = {
            "schema": "jovie.capacity-horizon/v1", "generatedAt": hud.utcnow().isoformat(), "incidents": [],
            "topBlocker": "capacity source missing",
            "leases": [{"alias": "current-login", "mode": "unknown", "freshness": {"status": "unknown"}}]}
        row = next(cell for cell in cells(hud.render(value, 160, 45), raw=True) if "current-login ?" in cell)
        self.assertIn("\x1b[35m? current-login ?", row, "unknown capacity carries the unknown style and glyph")
        self.assertNotIn("\x1b[36m", row)

    def test_dispatcher_slots_respect_zero_overrides_and_autoscaling(self):
        now = hud.utcnow()
        feed = {"at": now.isoformat(), "observed": {"capacityByProvider": {
            "devin": {"slots": 0, "base": 0}, "codex": {"slots": 2, "base": 3}}}}
        self.assertEqual(hud.dispatcher_slots(feed, {"devin": {}, "codex": {}}, now),
                         ({"devin": 0, "codex": 2}, {"devin": 0, "codex": 3}))
        for bad in (None, {}, {**feed, "at": "invalid"},
                    {**feed, "at": (now - hud.timedelta(seconds=271)).isoformat()},
                    {**feed, "at": (now + hud.timedelta(seconds=1)).isoformat()},
                    {**feed, "observed": {"capacityByProvider": {"devin": {"slots": True, "base": 0}}}}):
            with self.subTest(feed=bad):
                self.assertIsNone(hud.dispatcher_slots(bad, {"devin": {}, "codex": {}}, now))
        value = model()
        value["local"]["slotEvidence"] = "unknown"
        text = "\n".join(plain(row) for row in hud.render(value, 160, 45))
        self.assertIn("running / unknown", text)
        self.assertIn("codex 0/?", text)

    def test_running_and_vacant_slots_are_truthful(self):
        text = "\n".join(plain(line) for line in hud.render(model(), 160, 45))
        self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", text)
        self.assertIn("JOV-6544  issue   agent", text)
        self.assertIn("Audio browsing", text)
        self.assertIn("devin      polling · new issues unknown (doctor unread)", text)
        self.assertIn("codex      vacant · no worker process", text)
        self.assertIn("✓ alpha 48% left · reset 10m · banked 2", text)
        self.assertIn("✕ beta 0% left · reset 1h30m · banked 1 · retry 1h30m", text)
        self.assertIn("● gamma 90% left · reset 2h00m · banked 0 · leased", text)

    def test_workers_above_a_reduced_cap_stay_visible(self):
        value = model()
        value["local"]["slots"] = {"devin": 0, "codex": 1}
        text = "\n".join(plain(line) for line in hud.render(value, 160, 45))
        self.assertIn("devin 1/0", text)
        self.assertIn("JOV-6544", text, "a running worker over the reduced cap is still shown")
        self.assertIn("polling", text)

    def test_capacity_horizon_is_show_only_and_renders_source_gaps(self):
        value = model()
        value["local"]["doctor"]["at"] = hud.utcnow().isoformat()
        value["local"]["doctor"]["capacity"] = {
            "schema": "jovie.capacity-horizon/v1", "generatedAt": hud.utcnow().isoformat(),
            "incidents": [], "topBlocker": "drain evidence stale",
            "leases": [{"alias": "alpha", "usableRemaining": 48, "bankedCount": 2, "mode": "fast",
                        "event": {"label": "natural reset", "countdownSeconds": 600},
                        "forecast": {"projectedUnused": None}, "route": {"selectedJob": "JOV-9"},
                        "freshness": {"status": "stale"}}]}
        text = "\n".join(plain(line) for line in hud.render(value, 160, 45))
        self.assertIn("capacity horizon", text)
        self.assertIn("? alpha ? · banked ? · natural reset ?", text)
        self.assertIn("UNKNOWN · selection unknown · stale", text)
        self.assertIn("show-only", text)

    def test_capacity_horizon_ages_saved_receipts_and_account_observations(self):
        now = hud.utcnow()
        value = model()
        feed = value["local"]["doctor"]
        feed["at"] = now.isoformat()
        feed["capacity"] = {
            "schema": "jovie.capacity-horizon/v1", "generatedAt": now.isoformat(),
            "leases": [{"alias": "alpha", "usableRemaining": 48, "bankedCount": 2, "mode": "normal",
                        "event": {"label": "natural reset", "at": (now + hud.timedelta(seconds=600)).isoformat(),
                                  "countdownSeconds": 99999},
                        "forecast": {}, "route": {"selectedJob": "JOV-9"},
                        "freshness": {"status": "fresh", "observedAt": now.isoformat()}}]}
        with mock.patch.object(hud, "utcnow", return_value=now + hud.timedelta(seconds=60)):
            row = next(cell for cell in cells(hud.render(value, 200, 45), raw=True) if "alpha 48%" in cell)
        self.assertIn("natural reset 9m", plain(row), "countdown uses the absolute source deadline")
        self.assertIn("\x1b[36m✓ alpha 48%", row)
        for target, key in ((feed, "at"), (feed["capacity"], "generatedAt")):
            for stamp in (None, "invalid", now.replace(tzinfo=None).isoformat(),
                          (now + hud.timedelta(seconds=1)).isoformat(),
                          (now - hud.timedelta(seconds=271)).isoformat()):
                with self.subTest(key=key, stamp=stamp), mock.patch.object(hud, "utcnow", return_value=now):
                    target[key] = stamp
                    text = "\n".join(plain(line) for line in hud.render(value, 200, 45))
                    self.assertIn("capacity horizon unknown", text)
                    self.assertNotIn("alpha 48%", text)
                    self.assertNotIn("NORMAL", text)
            target[key] = now.isoformat()
        freshness = feed["capacity"]["leases"][0]["freshness"]
        for stamp, expected in ((None, "unknown"), ("invalid", "unknown"),
                                (now.replace(tzinfo=None).isoformat(), "unknown"),
                                ((now + hud.timedelta(seconds=61)).isoformat(), "contradictory"),
                                ((now - hud.timedelta(seconds=7201)).isoformat(), "stale")):
            with self.subTest(stamp=stamp), mock.patch.object(hud, "utcnow", return_value=now):
                freshness["observedAt"] = stamp
                frame = hud.render(value, 200, 45)
                row = next(cell for cell in cells(frame, raw=True) if "alpha ?" in cell)
                self.assertRegex(plain(row), r"UNKNOWN( · selection unknown)? · " + expected)
                self.assertNotIn("\x1b[36m", row)
                self.assertIn("top blocker: capacity source " + expected, "\n".join(plain(line) for line in frame))
                self.assertNotIn("no material blocker", "\n".join(plain(line) for line in frame))

    def test_capacity_horizon_unknown_deadline_is_not_a_saved_countdown(self):
        now = hud.utcnow()
        value = model()
        value["local"]["doctor"].update(at=now.isoformat(), capacity={
            "schema": "jovie.capacity-horizon/v1", "generatedAt": now.isoformat(),
            "leases": [{"alias": "alpha", "mode": "normal", "event": {"countdownSeconds": 600},
                        "freshness": {"status": "fresh", "observedAt": now.isoformat()}}]})
        for stamp in (None, "bad", now.replace(tzinfo=None).isoformat()):
            with self.subTest(stamp=stamp):
                value["local"]["doctor"]["capacity"]["leases"][0]["event"]["at"] = stamp
                row = next(cell for cell in cells(hud.render(value, 200, 45)) if "alpha ?" in cell)
                self.assertIn("source gap ?", row)
                self.assertNotIn("10m", row)

    def test_missing_horizon_cannot_bypass_account_source_freshness(self):
        now = hud.utcnow()
        for capacity in (None, {"schema": "retired-controller/v1"}):
            for stamp, expected in ((None, "unknown"), ("bad", "unknown"),
                                    ((now - hud.timedelta(seconds=7201)).isoformat(), "stale"),
                                    ((now + hud.timedelta(seconds=61)).isoformat(), "contradictory")):
                with self.subTest(capacity=capacity, stamp=stamp), mock.patch.object(hud, "utcnow", return_value=now):
                    value = model()
                    value["local"]["doctor"] = {"capacity": capacity}
                    account = value["local"]["codex"]["accounts"]["alpha"]
                    account["capacityLease"] = {"sources": {"capacity": {"observedAt": stamp}}}
                    row = next(cell for cell in cells(hud.render(value, 200, 45), raw=True) if "alpha capacity" in cell)
                    self.assertIn("? alpha capacity " + expected, plain(row))
                    self.assertNotIn("48%", row)
                    self.assertNotIn("\x1b[36m", row)

    def test_pipeline_attention_and_backlog_rows(self):
        value = model()
        value["local"]["doctor"]["fileOverlap"] = {
            "mode": "enforce", "pairs": [{"first": "pr:#20141", "later": "pr:#20166",
                                             "actionTaken": "stack", "files": ["scripts/lanes/lane_runner.py"]}],
            "metrics": {"conflicts_prevented": 2, "overlap_flags": 3, "rebases_caused_by_overlap": 1}}
        text = "\n".join(plain(line) for line in hud.render(value, 160, 45))
        self.assertIn("#18724 JOV-6544  OPEN  queued awaiting_checks  devin · JOV-6544 fix(audio)", text)
        self.assertIn("queued awaiting_checks", text)
        self.assertIn("held: check-failed:pre-push-gate.sh affected", text)
        self.assertIn("✕ dispatch-crash: dispatch failed 3 ticks in a row · owner ?", text)
        self.assertIn("cooldown hyperagent 10m", text)
        self.assertIn("requeue pending #18720", text)
        self.assertIn("gate-timeout 2", text)
        self.assertIn("Todo 99 →", text)
        self.assertIn("attribution verified 0/2 · inferred 0 · unknown 2", text)
        self.assertIn("merged 2 in 24h", text)
        self.assertIn("codex      24h started 0", text)
        self.assertIn("devin      24h started 1 · productive 1 · PR 1 · first-pass 100%", text)
        self.assertIn("disk 3.1% free", text)
        # Vanity counters are gone: overlap flags never answered an operator question.
        self.assertNotIn("FILE OVERLAP", text)
        self.assertNotIn("flags 3", text)

    def test_failed_sources_render_their_reason_never_a_blank(self):
        broken = model(linear={"ok": False, "error": "HTTPError: 429"},
                       github={"ok": False, "errors": {"open": "RuntimeError: HTTP 504", "queue": "timeout", "merged": "x", "rate": "y"}})
        broken["local"]["codex"] = {"error": "FileNotFoundError: codex", "accounts": {}, "available": []}
        broken["local"]["doctor"] = {}
        broken["local"]["cooldowns"], broken["local"]["requeue"], broken["local"]["ledger24h"] = {}, {}, {}
        text = "\n".join(plain(line) for line in hud.render(broken, 160, 45))
        self.assertIn("Linear HTTPError: 429", text)
        self.assertIn("PR list: RuntimeError: HTTP 504", text)
        self.assertIn("merge queue unknown", text)
        self.assertIn("queue read: timeout", text)
        self.assertIn("new issues unknown (doctor unread)", text)
        self.assertIn("FileNotFoundError: codex", text)
        self.assertIn("? lanes-status unread · owner doctor.py on the primary host", text)
        self.assertNotIn("no alerts recorded", text, "an unread feed is itself an alert")

    def test_stale_remote_reads_are_flagged_in_the_header(self):
        stale = model()
        stale["github"]["fetchedAt"] = "2026-01-01T00:00:00+00:00"
        header = plain(hud.render(stale, 160, 45)[0])
        self.assertIn("github stale", header)

    def test_claimable_pool_uses_fresh_final_predicate_receipt_not_raw_labels(self):
        value = model()
        feed = value["local"]["doctor"]
        feed.update(at=hud.utcnow().isoformat(), admission={
            "poolByProvider": {"devin": 0, "codex": 1},
            "eligiblePoolByProvider": {"devin": 0, "codex": 1},
            "newIssueBudgetByProvider": {"devin": {"used": 0, "cap": 8, "reason": "within-budget"},
                                         "codex": {"used": 0, "cap": 6, "reason": "within-budget"}},
            "candidatePoolByProvider": {"devin": 8, "codex": 1},
            "rejectedByProvider": {"devin": {"excluded-label:type:epic": 5, "sensitive-text": 3}}})
        text = "\n".join(plain(line) for line in hud.render(value, 160, 45))
        self.assertIn("devin      new 0 · eligible 0/8 · PRs 0/8 within-budget", text)
        self.assertIn("   5 excluded  excluded-label:type:epic", text)
        self.assertIn("   3 excluded  sensitive-text", text)
        self.assertNotIn("pool 87", text)
        self.assertEqual(hud.pool_hint("devin", value["local"]),
                         "new issues 0 · eligible 0/8 · PRs 0/8 within-budget · excluded-label:type:epic 5, sensitive-text 3")
        # An unrelated direct Linear read failure does not invalidate the fresh receipt.
        value["linear"] = {"ok": False, "error": "HTTP 429"}
        self.assertIn("new issues 0 · eligible 0/8 · PRs 0/8 within-budget", hud.pool_hint("devin", value["local"]))
        feed["admission"]["error"] = "ownership unreadable"
        self.assertEqual(hud.pool_hint("devin", value["local"]), "new issues unknown (ownership unreadable)")
        feed["admission"].pop("error")
        self.assertEqual(hud.pool_hint("missing", value["local"]), "new issues unknown (PR budget unread)")
        for stamp in ("2026-01-01T00:00:00Z", "2099-01-01T00:00:00Z"):
            feed["at"] = stamp
            self.assertEqual(hud.pool_hint("devin", value["local"]), "new issues unknown (doctor stale)")
        feed["at"] = "malformed"
        self.assertEqual(hud.pool_hint("devin", value["local"]), "new issues unknown (doctor unread)")

    def test_native_doctor_census_explains_real_admission_backpressure(self):
        value = model()
        feed = value["local"]["doctor"]
        feed.update(at=hud.utcnow().isoformat(), observed={
            "poolByProvider": {"codex": 0}, "candidatePoolByProvider": {"codex": 20},
            "eligiblePoolByProvider": {"codex": 8}, "rejectedByProvider": {},
            "newIssueBudgetByProvider": {"codex": {"used": 14, "cap": 6,
                                                    "allowed": False, "reason": "over-budget"}}})
        self.assertEqual(hud.pool_hint("codex", value["local"]),
                         "new issues 0 · eligible 8/20 · PRs 14/6 over-budget")

    def test_native_uncapped_pr_budget_is_readable_and_not_a_capacity_limit(self):
        value = model()
        value["local"]["doctor"].update(at=hud.utcnow().isoformat(), observed={
            "poolByProvider": {"codex": 0}, "candidatePoolByProvider": {"codex": 27},
            "eligiblePoolByProvider": {"codex": 0}, "rejectedByProvider": {"codex": {"sensitive-text": 16}},
            "newIssueBudgetByProvider": {"codex": hud.lane.read_new_issue_budget("codex", 3)}})
        hint = hud.pool_hint("codex", value["local"])
        self.assertEqual(hint, "new issues 0 · eligible 0/27 · PR ceiling none · sensitive-text 16")
        self.assertNotIn("None", hint)

    def test_new_issue_hint_separates_eligibility_budget_and_unknown(self):
        local = {"doctor": {"at": hud.utcnow().isoformat(), "admission": {
            "poolByProvider": {"codex": 0}, "candidatePoolByProvider": {"codex": 25},
            "eligiblePoolByProvider": {"codex": 7},
            "newIssueBudgetByProvider": {"codex": {"used": 6, "cap": 6, "reason": "over-budget"}}}}}
        hint = hud.pool_hint("codex", local)
        self.assertIn("new issues 0", hint)
        self.assertIn("eligible 7/25", hint)
        self.assertIn("PRs 6/6 over-budget", hint)
        local["doctor"]["admission"]["newIssueBudgetByProvider"]["codex"] = {
            "used": None, "cap": 6, "reason": "pr-inventory-unavailable"}
        self.assertEqual(hud.pool_hint("codex", local), "new issues unknown (PR inventory unread) · eligible 7/25")
        local["doctor"]["admission"].pop("newIssueBudgetByProvider")
        self.assertEqual(hud.pool_hint("codex", local), "new issues unknown (PR budget unread)")

    def test_clip_keeps_ansi_balanced_and_width_exact(self):
        colored = hud.paint("fail", "x" * 50)
        self.assertEqual(len(plain(hud.clip(colored, 10))), 10)
        self.assertEqual(len(plain(hud.pad("ab", 5))), 5)
        self.assertEqual(hud.dur(5400), "1h30m")
        self.assertEqual(hud.dur(90000), "1d1h")


class LedgerSchemaTest(unittest.TestCase):
    """JOV-7497: receipts missing optional verdict/provider/kind metadata must render
    as unclassified, not crash the display or be inferred as success."""

    def setUp(self):
        # The fixtures own the worker census. Reading this host's /proc made the release
        # self-test fail whenever a live Gem worker was running (2026-10-11: devin 1/0).
        patcher = mock.patch.object(hud, "running_workers", return_value=[])
        patcher.start()
        self.addCleanup(patcher.stop)

    def host_with_ledger(self, receipts):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        # A temporary ledger has its own process snapshot. Real host workers
        # must not make fixture assertions depend on whether Gem is shipping.
        worker_snapshot = mock.patch.object(hud, "running_workers", return_value=[])
        self.worker_snapshot = worker_snapshot.start()
        self.addCleanup(worker_snapshot.stop)
        (state / "runs").mkdir()
        stamp = hud.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(state / "runs" / "ledger.jsonl", "w") as handle:
            for receipt in receipts:
                row = {"runId": receipt.get("runId", "x"), "endedAt": receipt.pop("endedAt", stamp), **receipt}
                handle.write(json.dumps(row) + "\n")
        return SimpleNamespace(state=state, slots=lambda _name, default: default, gate_slots=2)

    def test_local_model_uses_dispatcher_overrides_instead_of_console_defaults(self):
        host = self.host_with_ledger([])
        feed = {"at": hud.utcnow().isoformat(), "observed": {"capacityByProvider": {
            "devin": {"slots": 0, "base": 0}, "codex": {"slots": 3, "base": 3}}}}
        (host.state / "doctor.json").write_text(json.dumps(feed))
        with mock.patch.object(hud.lane, "load_providers", return_value={"devin": {"slots": 4}, "codex": {"slots": 3}}):
            local = hud.local_model(host)
        self.assertEqual(local["slots"], {"devin": 0, "codex": 3})
        self.assertEqual(local["slotEvidence"], "fresh-dispatcher")
        text = "\n".join(plain(row) for row in hud.render(model(local=local), 160, 45))
        self.assertIn("running / 3 (codex 0/3)", text)
        self.assertIn("off devin", text)
        self.assertNotIn("running / 7", text)

    def test_temporary_ledger_uses_its_process_snapshot(self):
        host = self.host_with_ledger([])
        local = hud.local_model(host)
        self.assertEqual(local["workers"], [])
        self.worker_snapshot.assert_called_once_with(host.state)
        self.assertIsNone(local["feed"], "a host without the doctor's status feed says so")
        (host.state / "lanes-status.json").write_text('{"schema": "symphony-lanes-status/v1", "at": "x"}')
        self.assertEqual(hud.local_model(host)["feed"]["schema"], "symphony-lanes-status/v1")

    def test_dispatcher_slot_override_retains_an_explicit_busy_worker(self):
        host = self.host_with_ledger([])
        feed = {"at": hud.utcnow().isoformat(), "observed": {"capacityByProvider": {
            "devin": {"slots": 0, "base": 0}, "codex": {"slots": 3, "base": 3}}}}
        (host.state / "doctor.json").write_text(json.dumps(feed))
        worker = {"pid": 123, "provider": "codex", "run": {
            "runId": "fixture", "provider": "codex", "kind": "fix", "target": "PR1",
            "startedAt": hud.utcnow().isoformat(), "phase": "agent"}}
        self.worker_snapshot.return_value = [worker]
        with mock.patch.object(hud.lane, "load_providers", return_value={"devin": {"slots": 4}, "codex": {"slots": 3}}):
            local = hud.local_model(host)
        self.assertEqual(local["workers"], [worker])
        text = "\n".join(plain(row) for row in hud.render(model(local=local), 160, 45))
        self.assertIn("running / 3 (codex 1/3)", text)

    def test_missing_and_null_verdicts_become_unclassified_not_a_crash(self):
        host = self.host_with_ledger([
            {"runId": "a", "provider": "devin"},  # no verdict key at all
            {"runId": "b", "provider": "devin", "verdict": None},
            {"runId": "c", "provider": "devin", "verdict": ""},
            {"runId": "d", "provider": "devin", "verdict": {"nested": True}},
            {"runId": "e", "provider": "devin", "verdict": "landing"},
            {"runId": "f", "provider": "devin", "verdict": "failed"},
        ])
        local = hud.local_model(host)
        self.assertEqual(local["ledger24h"], {"unclassified": 4, "landing": 1, "failed": 1})
        self.assertEqual(local["runs24h"], 6)
        # Raw receipts keep their original verdict metadata; only the count is classified.
        self.assertIsNone(next(r for r in local["receipts24h"] if r["runId"] == "b")["verdict"])
        self.assertNotIn("verdict", next(r for r in local["receipts24h"] if r["runId"] == "a"))
        text = "\n".join(plain(line) for line in hud.render(model(local=local), 160, 45))
        self.assertIn("unclassified 4", text)
        self.assertIn("landing 1", text)

    def test_null_and_missing_ended_at_do_not_crash_local_model(self):
        host = self.host_with_ledger([
            {"runId": "a", "provider": "devin", "verdict": "landing", "endedAt": None},
            {"runId": "b", "provider": "devin"},
        ])
        local = hud.local_model(host)
        self.assertEqual(local["runs24h"], 1)
        self.assertEqual(local["ledger24h"], {"unclassified": 1})

    def test_empty_ledger_reports_no_runs(self):
        host = self.host_with_ledger([])
        local = hud.local_model(host)
        self.assertEqual(local["ledger24h"], {})
        text = "\n".join(plain(line) for line in hud.render(model(local=local), 160, 45))
        self.assertIn("24h verdicts: no runs", text)

    def test_render_survives_non_string_ledger_keys(self):
        broken = model()
        broken["local"]["ledger24h"] = {None: 2, 5: 1, "landing": 3}
        text = "\n".join(plain(line) for line in hud.render(broken, 160, 45))
        self.assertIn("24h verdicts:", text)


class SlotViewportTest(unittest.TestCase):
    def crowded(self, count=36):
        sample = model()
        names = ("devin", "codex", "claude")
        sample["local"]["slots"] = {name: count // 3 for name in names}
        sample["local"]["providers"] = {name: {} for name in names}
        sample["local"]["workers"] = [
            {"pid": index + 1, "provider": names[index // (count // 3)],
             "run": {"runId": f"run-{index}", "provider": names[index // (count // 3)],
                     "kind": "issue", "target": f"JOV-{90000 + index}",
                     "startedAt": "2026-09-26T20:00:00+00:00", "phase": "agent"}}
            for index in range(count)]
        return sample

    def targets(self, frame):
        return set(re.findall(r"\bJOV-9[0-9]{4}\b", "\n".join(plain(row) for row in frame)))

    def test_every_running_slot_is_reachable_at_typical_and_ultrawide_sizes(self):
        expected = {f"JOV-{90000 + index}" for index in range(36)}
        for width, height in ((80, 24), (120, 30), (160, 45), (240, 60)):
            with self.subTest(width=width, height=height):
                sample, viewport, reached = self.crowded(), hud.SlotViewport(), set()
                for _ in range(36):
                    frame = hud.render(sample, width, height, viewport)
                    self.assertEqual(len(frame), height)
                    self.assertTrue(all(hud.visible(row) == width for row in frame))
                    text = "\n".join(plain(row) for row in frame)
                    self.assertIn("36 running", text)
                    self.assertIn("PgUp/PgDn", text)
                    self.assertNotIn("vacant", text)
                    reached.update(self.targets(frame))
                    if viewport.offset + viewport.page_size >= viewport.total:
                        break
                    viewport.move("page-down")
                self.assertEqual(reached, expected)

    def test_reduced_slots_and_unconfigured_observed_workers_remain_reachable(self):
        sample, viewport = self.crowded(12), hud.SlotViewport()
        sample["local"]["slots"] = {"devin": 0, "codex": 0}
        reached = set()
        for _ in range(12):
            frame = hud.render(sample, 120, 30, viewport)
            reached.update(self.targets(frame))
            self.assertNotIn("vacant", "\n".join(plain(row) for row in frame))
            viewport.move("page-down")
        self.assertEqual(reached, {f"JOV-{90000 + index}" for index in range(12)})

    def test_end_anchor_survives_resize_and_home_returns_to_first_slot(self):
        sample, viewport = self.crowded(), hud.SlotViewport()
        hud.render(sample, 160, 45, viewport)
        viewport.move("end")
        for width, height in ((160, 45), (240, 60), (80, 24)):
            frame = hud.render(sample, width, height, viewport)
            self.assertIn("JOV-90035", self.targets(frame))
            self.assertEqual(viewport.offset, viewport.total - viewport.page_size)
        viewport.move("home")
        frame = hud.render(sample, 80, 24, viewport)
        self.assertIn("JOV-90000", self.targets(frame))
        self.assertNotIn("JOV-90035", self.targets(frame))
        self.assertEqual(viewport.offset, 0)

    def test_navigation_decodes_split_and_concatenated_terminal_sequences(self):
        keyboard = hud.TerminalInput()
        self.assertEqual(keyboard.feed(b"\x1b["), [])
        self.assertEqual(keyboard.feed(b"6~\x1b[A\x1b[B"), ["page-down", "up", "down"])
        self.assertEqual(keyboard.feed(b"\x1bOH\x1bOF\x1b[5~"), ["home", "end", "page-up"])
        self.assertEqual(keyboard.feed(b"ignored\x1b[1~\x1b[4~"), ["home", "end"])

    def test_terminal_attributes_are_restored_after_exception_or_ctrl_c(self):
        for failure in (RuntimeError("leave"), KeyboardInterrupt()):
            keyboard = hud.TerminalInput()
            stream = mock.Mock()
            stream.isatty.return_value = True
            stream.fileno.return_value = 42
            saved = ["original console mode"]
            with self.subTest(failure=type(failure).__name__), \
                    mock.patch.object(hud.sys, "stdin", stream), \
                    mock.patch.object(hud.sys, "stdout", stream), \
                    mock.patch.object(hud.termios, "tcgetattr", return_value=saved), \
                    mock.patch.object(hud.tty, "setcbreak") as enter, \
                    mock.patch.object(hud.termios, "tcsetattr") as restore:
                with self.assertRaises(type(failure)):
                    with keyboard:
                        raise failure
            enter.assert_called_once_with(42)
            restore.assert_called_once_with(42, hud.termios.TCSADRAIN, saved)

    def test_noninteractive_output_keeps_sleep_without_reading_input(self):
        with mock.patch.object(hud.sys, "stdin", io.StringIO()), \
                mock.patch.object(hud.sys, "stdout", io.StringIO()), \
                mock.patch.object(hud.time, "sleep") as sleep, \
                mock.patch.object(hud.select, "select") as select_input, \
                mock.patch.object(hud.termios, "tcgetattr") as attributes:
            with hud.TerminalInput() as keyboard:
                self.assertEqual(keyboard.wait(0.25), [])
        sleep.assert_called_once_with(0.25)
        select_input.assert_not_called()
        attributes.assert_not_called()

    def test_real_loop_resizes_and_scrolls_without_repolling_the_model(self):
        class StopLoop(Exception):
            pass
        class TTYBuffer(io.StringIO):
            def isatty(self):
                return True
        sample, keyboard, frames = self.crowded(), hud.TerminalInput(), []
        saved_render = hud.render
        def render(value, width, height, viewport):
            frame = saved_render(value, width, height, viewport)
            frames.append((width, height, self.targets(frame)))
            return frame
        def wait(_):
            if len(frames) == 1:
                return keyboard.feed(b"\x1b[F")
            if len(frames) == 2:
                return keyboard.feed(b"\x1b[5~")
            raise StopLoop()
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(hud.lane, "Host", return_value=SimpleNamespace(state=Path(directory))), \
                mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud, "Remote"), \
                mock.patch.object(hud, "current_hud", return_value=None), \
                mock.patch.object(hud, "build_model", return_value=sample) as build, \
                mock.patch.object(hud, "render", side_effect=render), \
                mock.patch.object(hud, "TerminalInput", return_value=keyboard), \
                mock.patch.object(keyboard, "wait", side_effect=wait), \
                mock.patch.object(hud.time, "monotonic", side_effect=[100] + [104] * 16), \
                mock.patch.object(shutil, "get_terminal_size", return_value=hud.os.terminal_size((160, 45))), \
                mock.patch.object(hud.os, "get_terminal_size", side_effect=[
                    hud.os.terminal_size((160, 45)), hud.os.terminal_size((240, 60)),
                    hud.os.terminal_size((120, 30))]), \
                mock.patch.object(hud.sys, "stdin", io.StringIO()), \
                mock.patch.object(hud.sys, "stdout", TTYBuffer()):
            with self.assertRaises(StopLoop):
                hud.main([])
        self.assertEqual([(width, height) for width, height, _ in frames], [(160, 45), (240, 60), (120, 30)])
        self.assertIn("JOV-90035", frames[1][2])
        self.assertIn("JOV-90000", frames[2][2])
        build.assert_called_once()

    def test_release_reexec_restores_input_before_handoff(self):
        class Handoff(Exception):
            pass
        keyboard, order = hud.TerminalInput(), []
        def execute(*_):
            order.append("exec")
            raise Handoff()
        with mock.patch.object(hud.lane, "Host", return_value=SimpleNamespace(state=Path("/unused"))), \
                mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud, "Remote"), \
                mock.patch.object(hud, "TerminalInput", return_value=keyboard), \
                mock.patch.object(keyboard, "restore", side_effect=lambda: order.append("restore")), \
                mock.patch.object(hud, "current_hud", return_value=Path("/new-release/hud.py")), \
                mock.patch.object(hud.os, "execv", side_effect=execute), \
                mock.patch.object(hud.sys, "stdin", io.StringIO()), \
                mock.patch.object(hud.sys, "stdout", io.StringIO()):
            with self.assertRaises(Handoff):
                hud.main([])
        self.assertEqual(order, ["restore", "exec", "restore"])

    def test_current_dimensions_keep_explicit_width_and_height_overrides(self):
        stream = mock.Mock()
        stream.isatty.return_value = True
        args = SimpleNamespace(width=120, height=None)
        with mock.patch.object(hud.sys, "stdout", stream), \
                mock.patch.object(hud.os, "get_terminal_size", side_effect=[
                    hud.os.terminal_size((160, 45)), hud.os.terminal_size((240, 60)),
                    hud.os.terminal_size((80, 24))]) as size:
            self.assertEqual(hud.terminal_dimensions(args), (120, 45))
            self.assertEqual(hud.terminal_dimensions(args), (120, 60))
            args.width, args.height = None, 40
            self.assertEqual(hud.terminal_dimensions(args), (80, 40))
        self.assertEqual(size.call_count, 3)

    def test_once_can_select_the_last_slot_page_without_terminal_input(self):
        output = io.StringIO()
        with mock.patch.object(hud.lane, "Host"), \
                mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud, "build_model", return_value=self.crowded()), \
                mock.patch.object(hud, "TerminalInput") as keyboard, \
                mock.patch.object(hud.sys, "stdout", output):
            self.assertEqual(hud.main(["--once", "--width", "120", "--height", "30", "--slot-offset", "33"]), 0)
        self.assertIn("JOV-90035", output.getvalue())
        self.assertNotIn("JOV-90000", output.getvalue())
        self.assertRegex(output.getvalue(), r"Rows \d+-36 of 36")
        keyboard.assert_not_called()


class ManagedReleaseRestartTest(unittest.TestCase):
    def test_live_redraw_preserves_the_last_console_column(self):
        class StopLoop(Exception):
            pass

        width, height = 160, 45
        sample = model()
        stamp = hud.utcnow()
        with mock.patch.object(hud, "utcnow", return_value=stamp):
            expected = [plain(row) for row in hud.render(sample, width, height)]
        output = io.StringIO()
        with mock.patch.object(hud.lane, "Host", return_value=SimpleNamespace(state=Path('/unused'))), \
                mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud, "Remote"), \
                mock.patch.object(hud, "current_hud", return_value=None), \
                mock.patch.object(hud, "build_model", return_value=sample), \
                mock.patch.object(hud, "utcnow", return_value=stamp), \
                mock.patch.object(hud.sys, "stdout", output), \
                mock.patch.object(hud.time, "sleep", side_effect=StopLoop):
            with self.assertRaises(StopLoop):
                hud.main(["--width", str(width), "--height", str(height)])

        # tty1 keeps its cursor on the final cell while wrap is pending. EL
        # after a full-width write therefore erases that cell, including Z or
        # the end of a hold reason. Apply the emitted terminal controls rather
        # than checking the pre-terminal render strings alone.
        trace = output.getvalue().split("\x1b[?25l", 1)[1].split("\x1b[?25h", 1)[0]
        screen, row, column = [["~"] * width for _ in range(height)], 0, 0
        for token in re.split(r"(\x1b\[[0-9;?]*[A-Za-z]|\n)", trace):
            if token == "\n":  # tty1's ONLCR advances to column one.
                row, column = row + 1, 0
            elif token == "\x1b[2J":
                screen = [[" "] * width for _ in range(height)]
            elif token.endswith("H") and token.startswith("\x1b["):
                place = token[2:-1].split(";")
                row, column = (int(place[0]) - 1, int(place[1]) - 1) if place != [""] else (0, 0)
            elif token == "\x1b[K":
                start = min(column, width - 1)
                screen[row][start:] = [" "] * (width - start)
            elif not token.startswith("\x1b"):
                for char in token:
                    screen[row][min(column, width - 1)] = char
                    column += 1
        self.assertEqual(["".join(row) for row in screen], expected)
        self.assertTrue(any(row[-1] != " " for row in expected))

    def test_symlink_launched_process_executes_the_new_release_and_preserves_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            old, new = state / "old", state / "new"
            shutil.copytree(ROOT / "scripts/lanes", old, ignore=shutil.ignore_patterns("__pycache__"))
            shutil.copyfile(ROOT / "scripts/shipping_origin.py", state / "shipping_origin.py")
            new.mkdir()
            receipt = state / "executed.json"
            (new / "hud.py").write_text(
                "import json, sys\nfrom pathlib import Path\n"
                f"Path({str(receipt)!r}).write_text(json.dumps({{'source': __file__, 'args': sys.argv[1:]}}))\n")
            (state / "current").symlink_to(old, target_is_directory=True)
            harness = state / "launch.py"
            harness.write_text(f"""
import importlib.util, os
from pathlib import Path
from types import SimpleNamespace
state = Path({str(state)!r})
spec = importlib.util.spec_from_file_location('hud', state / 'current/hud.py')
hud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hud)
hud.lane.Host = lambda: SimpleNamespace(state=state)
hud.lane.load_github_env = lambda: None
hud.Remote = lambda _: SimpleNamespace(start=lambda: None)
hud.build_model = lambda *args: None
frames = 0
def render(*args):
    global frames
    if frames:
        raise RuntimeError('old HUD rendered again instead of executing the new release')
    frames += 1
    replacement = state / '.current.tmp'
    replacement.symlink_to(state / 'new', target_is_directory=True)
    os.replace(replacement, state / 'current')
    return ['old release before managed update']
hud.render = render
hud.main()
""")
            flags = ["--width", "160", "--height", "45", "--interval", "0.001"]
            result = subprocess.run([sys.executable, str(harness), *flags],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(receipt.read_text()),
                             {"source": str((new / "hud.py").resolve()), "args": flags})

    def test_unchanged_or_missing_release_keeps_rendering_without_reexec(self):
        class StopLoop(Exception):
            pass
        for candidate in (hud.HERE / "hud.py", None):
            with self.subTest(candidate=candidate), \
                    mock.patch.object(hud.lane, "Host", return_value=SimpleNamespace(state=Path('/unused'))), \
                    mock.patch.object(hud.lane, "load_github_env"), \
                    mock.patch.object(hud, "Remote"), \
                    mock.patch.object(hud, "current_hud", return_value=candidate), \
                    mock.patch.object(hud, "build_model", return_value=None), \
                    mock.patch.object(hud, "render", return_value=["frame"]) as render, \
                    mock.patch.object(hud.os, "execv") as execute, \
                    mock.patch.object(hud.sys, "stdout", io.StringIO()), \
                    mock.patch.object(hud.time, "sleep", side_effect=StopLoop):
                with self.assertRaises(StopLoop):
                    hud.main([])
                render.assert_called_once()
                execute.assert_not_called()



class LaneTargetTitleTest(unittest.TestCase):
    """A fix run on a non-lane branch (screenshots/, ci/) still shows its real PR title."""

    def rows(self, value, now):
        return [plain(row) for row in hud.render(value, 215, 45, now=now)]

    def test_live_fixture_non_lane_target_shows_fetched_title(self):
        value, now = fixture("live")
        value["github"]["open"] = [pr for pr in value["github"].get("open", []) if pr["number"] != 21774]
        value["github"]["targets"] = {"PR21774": {"title": "chore: update product screenshots", "state": "OPEN"}}
        text = "\n".join(self.rows(value, now))
        self.assertIn("chore: update", text)  # clipped to the worker column
        self.assertNotIn("title not in current", text)

    def test_live_fixture_closed_target_is_marked(self):
        value, now = fixture("live")
        value["github"]["open"] = [pr for pr in value["github"].get("open", []) if pr["number"] != 21774]
        value["github"]["targets"] = {"PR21774": {"title": "old work", "state": "MERGED"}}
        self.assertIn("CLOSED/MERG", "\n".join(self.rows(value, now)))

    def test_degraded_fixture_names_the_read_failure(self):
        value, now = fixture("degraded")
        self.assertIn("GitHub read", "\n".join(self.rows(value, now)))

    def test_fetch_is_batched_cached_and_alerts_once(self):
        calls = []

        def fake(args):
            calls.append(args)
            return {"data": {"repository": {"p5": {"title": "five", "state": "MERGED"},
                                            "p6": {"title": "six", "state": "OPEN"}}}}

        with tempfile.TemporaryDirectory() as tmp:
            cache, log = Path(tmp) / "titles.json", Path(tmp) / "alerts.jsonl"
            got, error = hud.fetch_target_titles([5, 6], cache, now=1000.0, fetch=fake)
            self.assertIsNone(error)
            self.assertEqual(got["PR6"]["title"], "six")
            hud.fetch_target_titles([5, 6], cache, now=1100.0, fetch=fake)
            self.assertEqual(len(calls), 1)  # one batched read, then the 5-minute cache
            self.assertEqual(hud.record_closed_target_alerts(got, cache, log), ["PR5"])
            self.assertEqual(hud.record_closed_target_alerts(got, cache, log), [])
            self.assertEqual(len(log.read_text().splitlines()), 1)

    def test_fetch_failure_is_reported_not_guessed(self):
        def boom(args):
            raise RuntimeError("HTTP 502")
        got, error = hud.fetch_target_titles([7], None, now=10_000.0, fetch=boom)
        self.assertEqual(got, {})
        self.assertIn("HTTP 502", error)

if __name__ == "__main__":
    unittest.main()


class PromotionTest(unittest.TestCase):
    """JOV-6836: the HUD surfaces promotion-loss metrics, cached, and never blanks on failure."""
    METRICS = {"firstPass": {"rate": 0.74}, "reenqueueMinutes": {"p75": 365, "pending": 2},
               "openToFirstEnqueueMinutes": {"p75": 106.7}, "occupancy": {"cleanNotQueued": 6},
               "intake": {"opensPerHour": 12.6, "mergesPerHour": 7.3, "keysWithMultipleOpenPrs": 10},
               "queueEntriesPerMerge": 2.2}

    def setUp(self):
        hud._promotion.update(at=0.0, data=None)

    def test_line_renders_metrics_and_errors(self):
        text = "\n".join(plain(line) for line in hud.render(model(github={**model()["github"], "promotion": self.METRICS}), 160, 45))
        self.assertIn("first-pass 74% · ejected→back p75 365m (2 waiting)", text)
        self.assertIn("open→enqueue p75 106.7m · CLEAN not queued 6 · queue entries/merge 2.2", text)
        self.assertNotIn("keys >1 PR", text, "a vanity counter, dropped from the HUD")
        self.assertIn("? promotion: not-read-yet", plain(hud.promotion_lines(None)[0]))
        narrow = "\n".join(plain(line) for line in hud.render(model(github={**model()["github"], "promotion": self.METRICS}), 200, 45))
        self.assertIn("open→enqueue p75 106.7m", narrow, "narrow columns drop whole parts, never the lead metric")
        self.assertIn("boom", plain(hud.promotion_lines({"error": "boom"})[0]))

    def test_model_runs_the_script_once_per_interval_and_reports_failures(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return type("R", (), {"returncode": 0, "stdout": '{"firstPass": {"rate": 1}}', "stderr": ""})()
        self.assertEqual(hud.promotion_model(now=1000, run=run), {"firstPass": {"rate": 1}})
        hud.promotion_model(now=1000 + hud.PROMOTION_EVERY_S - 1, run=run)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][-3:], ["--since", "8h", "--json"])
        failed = hud.promotion_model(now=1000 + hud.PROMOTION_EVERY_S, run=lambda *a, **k: type(
            "R", (), {"returncode": 1, "stdout": "", "stderr": "gh: HTTP 502"})())
        self.assertIn("gh: HTTP 502", failed["error"])


class LinearAndBudgetTest(unittest.TestCase):
    """2026-09-27: Linear rejects `number in [0]` and REST rate_limit misreports GraphQL."""

    def test_linear_panel_reads_the_local_mirror_without_a_linear_request(self):
        """2026-10-11: the HUD spends no Linear budget; it reads the dispatch tick's mirror."""
        import os
        from unittest import mock
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"LANES_STATE": tmp}), \
                mock.patch.object(hud.lane, "Linear", side_effect=AssertionError("no Linear client")):
            self.assertFalse(hud.linear_model(Path("/x"))["ok"])  # never filled: said so, not faked
            def row(n, state, labels):
                return {"id": f"i{n}", "identifier": f"JOV-{n}", "title": f"t{n}", "description": "",
                        "priority": 1, "createdAt": "2026-10-01T00:00:00.000Z",
                        "updatedAt": "2026-10-11T00:00:00.000Z", "state": {"name": state, "type": "unstarted"},
                        "labels": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": l} for l in labels]}}
            hud.lane.linear_sync.apply(Path(tmp), "JOV", [row(1, "Todo", ["devin"]), row(7, "In Progress", []),
                                                         row(9, "Triage", ["codex"])])
            with hud.lane.linear_sync._mutating(hud.lane.linear_sync.mirror_path(Path(tmp), "JOV"),
                                                hud.lane.linear_sync.MIRROR) as data:
                data.update(cursor="x", syncedAt=1_800_000_000.0)
            hud.lane.linear_sync.enqueue(Path(tmp), "comment", "i1", body="claimed")
            busy = hud.linear_model(Path("/x"), ["JOV-7"])
        self.assertTrue(busy["ok"])
        self.assertEqual((busy["active"], busy["poolTotal"], busy["triage"], busy["outbox"]),
                         ({"JOV-7": "t7"}, 1, 1, 1))
        self.assertEqual(busy["pool"].get("devin"), 1)

    def test_graphql_budget_reads_graphql_not_rest(self):
        seen = []

        def run(args, **_kwargs):
            seen.append(args)
            return type("R", (), {"returncode": 0, "stderr": "",
                                  "stdout": '{"data":{"rateLimit":{"remaining":0,"resetAt":"2026-09-27T22:39:30Z"}}}'})()
        original = hud.lane.subprocess.run
        hud.lane.subprocess.run = run
        try:
            self.assertEqual(hud.lane.graphql_budget(), (0, "2026-09-27T22:39:30Z"))
            hud.lane.subprocess.run = lambda *a, **k: type("R", (), {"returncode": 1, "stdout": "", "stderr": "x"})()
            self.assertIsNone(hud.lane.graphql_budget())
        finally:
            hud.lane.subprocess.run = original
        self.assertEqual(seen[0][:3], ["gh", "api", "graphql"])


FIXTURES = ROOT / "scripts/lanes/hud_fixtures"
SNAPSHOT_SIZES = ((160, 45), (215, 45), (80, 24))
FIXTURE_NAMES = ("live", "degraded", "missing")


def degrade(value: dict) -> dict:
    """The live capture with every authority answering badly: PR list over budget, stale queue,
    pending marker, stalled delivery, a critical liveness condition, held.json unreadable."""
    github, local = value["github"], value["local"]
    github["errors"] = {"open": "github-budget-floor: 529 (< 600) until reset"}
    github.pop("open")
    github["readAt"]["queue"] = "2026-10-20T17:30:00+00:00"
    github["rate"] = {"core": 529, "graphql": 412, "resetAt": "2026-10-20T19:16:27Z"}
    github["promotion"] = {"error": "RuntimeError: gh: HTTP 502\nretry later"}
    value["production"]["marker"] = {"status": "pending"}
    local.update(releaseMatchesHud=False, slotEvidence="unknown", heldError="held.json unavailable or invalid",
                 held={}, cooldowns={"grok": 540})
    local["tick"].update(error="dispatch failed: OSError: [Errno 28] No space left on device",
                         quotaBlocked={"codex": "usage-limit until 21:00Z"})
    local["doctor"]["capacity"]["leases"][0]["freshness"] = {"status": "stale"}
    local["feed"]["delivery"]["state"] = "stalled"
    local["feed"]["conditions"]["started-without-live-owner"] = {
        "state": "active", "severity": "critical", "owner": "summer", "firstObservedAt": "2026-10-20T17:41:00Z",
        "evidence": "3 In Progress issues have no live lane lease: JOV-8701, JOV-8702, JOV-8655",
        "nextAction": "reclaim-or-return-to-todo", "summerEscalation": {"outcome": "requested"}}
    local["workers"][0]["run"]["phase"] = "gate"
    value["linear"] = {"ok": False, "error": "HTTPError: 429 rate limited\nretry-after 60"}
    value["system"] = {"load1": 22.4, "cores": 16, "diskFreePct": 8.2, "memAvailPct": 11}
    return value


def nothing_read() -> dict:
    """The first frame after boot: nothing read yet, no status feed, no codex lane."""
    return {"local": {"host": "gem", "release": None, "releaseMatchesHud": False, "providers": {"codex": {}, "grok": {}},
                      "slots": {"codex": 3, "grok": 1}, "baseSlots": {"codex": 3, "grok": 1}, "slotEvidence": "unknown",
                      "autoscaleMode": "off", "workers": [], "ledger24h": {}, "runs24h": 0, "receipts24h": [],
                      "attributionReceipts": [], "lastLanding": None, "held": {}, "heldError": None, "failures": {},
                      "gateTimeouts": {}, "requeue": {}, "cooldowns": {}, "doctor": {}, "feed": None, "tick": {},
                      "codex": {"error": "FileNotFoundError: codex", "accounts": {}, "available": []}, "gateSeats": 2},
            "linear": {"ok": False, "error": "not read yet"}, "github": {"ok": False, "errors": {"open": "not read yet"}},
            "production": {}, "system": {"load1": None, "cores": 16, "diskFreePct": 41.0, "memAvailPct": None}}


def fixture(name: str):
    """A model and the instant it is rendered at. live is a trimmed Gem capture (2026-10-20)."""
    data = json.loads((FIXTURES / "live.json").read_text())
    now = hud.datetime.fromisoformat(data.pop("_now"))
    data.pop("_source", None)
    builders = {"live": lambda: data, "degraded": lambda: degrade(data), "missing": nothing_read}
    return builders[name](), now


class FrameSnapshotTest(unittest.TestCase):
    """Whole-frame snapshots at Gem's tty1 grid (160x45), the native 21:9 grid of its 1720x720
    framebuffer (215x45) and the 80x24 floor. HUD_UPDATE_SNAPSHOTS=1 rewrites them."""

    @classmethod
    def setUpClass(cls):
        cls.rendered = []
        for name in FIXTURE_NAMES:
            for width, height in SNAPSHOT_SIZES:
                value, now = fixture(name)
                cls.rendered.append((name, width, height, hud.render(value, width, height, now=now)))

    def frames(self):
        return iter(self.rendered)

    def test_frames_match_snapshots(self):
        update = bool(hud.os.environ.get("HUD_UPDATE_SNAPSHOTS"))
        for name, width, height, frame in self.frames():
            with self.subTest(fixture=name, size=f"{width}x{height}"):
                text = "\n".join(plain(row).rstrip() for row in frame) + "\n"
                path = FIXTURES / "__snapshots__" / f"{name}-{width}x{height}.txt"
                if update:
                    path.parent.mkdir(exist_ok=True)
                    path.write_text(text)
                self.assertEqual(text, path.read_text())

    def test_every_frame_fills_the_grid_with_console_font_glyphs_only(self):
        for name, width, height, frame in self.frames():
            with self.subTest(fixture=name, size=f"{width}x{height}"):
                self.assertEqual(len(frame), height)
                self.assertTrue(all(hud.visible(row) == width for row in frame))
                glyphs = {char for row in frame for char in plain(row)}
                outside = {char for char in glyphs if not (" " <= char < "\x7f" or "\xa0" <= char <= "ſ")
                           and char not in hud.CONSOLE_GLYPHS}
                self.assertEqual(outside, set(), "tty1's PSF font cannot draw these")
                self.assertTrue(all(row.count("\x1b[") == 0 or row.endswith("\x1b[0m") or row.endswith(" ")
                                    for row in frame))

    def test_key_ids_are_never_truncated(self):
        for name, width, height, frame in self.frames():
            with self.subTest(fixture=name, size=f"{width}x{height}"):
                text = "\n".join(plain(row) for row in frame)
                self.assertNotRegex(text, r"(#\d+|JOV-\d*|PR\d*)…")
                for cell in cells(frame):
                    if found := re.match(r"(#\d+) ", cell):
                        self.assertRegex(found.group(1), r"^#\d{5}$")

    def test_colour_never_carries_a_state_alone(self):
        words = ("merged", "deployed", "verified", "queued", "merge conflict", "held:", "unstable",
                 "blocked", "prepared", "undeployed", "top blocker", "capacity horizon", "promotion")
        for name, width, height, frame in self.frames():
            for row in frame:
                for code, text in re.findall(r"\x1b\[(?:7;)?(31|33|35|36)m([^\x1b]*)\x1b\[0m", row):
                    with self.subTest(fixture=name, size=f"{width}x{height}", text=text):
                        self.assertTrue(any(mark in text for mark in "✓!✕?●") or any(word in text for word in words),
                                        f"coloured text without a glyph or state word: {text!r}")

    def test_panels_hold_their_place_whatever_the_data(self):
        labels = re.compile(r"\x1b\[7m (WORKERS|SUPPLY|REPAIR|QUEUE|SHIPPED|ALERTS|BUDGETS|HOST) ")
        for width, height in SNAPSHOT_SIZES:
            layouts = [[(index, hud.visible(row[:match.start()]), match.group(1))
                        for index, row in enumerate(frame) for match in labels.finditer(row)]
                       for _name, w, h, frame in self.rendered if (w, h) == (width, height)]
            with self.subTest(size=f"{width}x{height}"):
                self.assertEqual(layouts[0], layouts[1])
                self.assertEqual(layouts[0], layouts[2])
                self.assertEqual({label for _, _, label in layouts[0]},
                                 {"WORKERS", "SUPPLY", "REPAIR", "QUEUE", "SHIPPED", "ALERTS", "BUDGETS", "HOST"})

    def test_the_live_frame_answers_the_operator_questions_in_order(self):
        value, now = fixture("live")
        frame = [plain(row) for row in hud.render(value, 160, 45, now=now)]
        self.assertIn("CONSTRAINT ! WARN   deploy · 7 merged PR(s) not in production · oldest 1h41m", frame[1])
        self.assertIn("serves 060037d · ✓ verified", frame[2])
        self.assertIn("behind 18 commits", frame[2])
        self.assertIn("merged 10 → deployed 3 → verified 3", frame[3])
        self.assertIn("merges 5/h", frame[3])
        text = "\n".join(frame)
        self.assertIn("17 excluded  sensitive-text", text)
        self.assertIn("owner symphony-lanes-doctor", text)

    def test_degraded_sources_say_so_and_the_worst_constraint_wins(self):
        value, now = fixture("degraded")
        frame = [plain(row) for row in hud.render(value, 160, 45, now=now)]
        text = "\n".join(frame)
        self.assertIn("CONSTRAINT ✕ FAIL   delivery", frame[1])
        self.assertIn("Production Verified marker pending", frame[2])
        self.assertIn("verified ?", frame[3])
        self.assertIn("✕ crit started-without-live-owner", text, "a new liveness condition shows with its owner")
        self.assertIn("owner summer", text)
        self.assertIn("? PR list: github-budget-floor: 529 (< 600) until reset", text)
        self.assertIn("? queue read: stale", text)
        self.assertIn("✕ Linear HTTPError: 429 rate limited retry-after 60", text)
        self.assertIn("HOST      ✕ FAIL", text)
        self.assertNotIn("open lane PRs 0", text)

    def test_missing_data_renders_unknown_never_zero(self):
        value, now = fixture("missing")
        text = "\n".join(plain(row) for row in hud.render(value, 80, 24, now=now))
        self.assertIn("CONSTRAINT ? UNKNOWN", text)
        self.assertIn("served build unknown", text)
        self.assertIn("merged ? → deployed ? → verified ?", text)
        self.assertNotRegex(text, r"merged 0|deployed 0|open lane PRs 0")


class ConstraintTest(unittest.TestCase):
    def facts(self, **feed):
        base = {"schema": hud.STATUS_SCHEMA, "at": hud.utcnow().isoformat(), "running": 4, "idle": 0,
                "admission": {"eligiblePool": 3, "candidatePool": 9, "rejectedByProvider": {}},
                "mergeThroughput": {"mergedPerHour": 4, "ejectionRate": 0}}
        base.update(feed)
        value = model()
        value["local"]["feed"] = base
        return hud.interpret(value, hud.utcnow())

    def test_ladder_names_capacity_intake_queue_and_evidence(self):
        self.assertEqual(self.facts()["constraint"][:2], ("warn", "worker capacity"))
        intake = self.facts(admission={"eligiblePool": 0, "candidatePool": 9,
                                       "rejectedByProvider": {"codex": {"sensitive-text": 6}, "grok": {"sensitive-text": 6}}})
        self.assertEqual(intake["constraint"][:2], ("warn", "intake"))
        self.assertIn((1, "sensitive-text 6"), intake["constraint"][2])
        queue = self.facts(mergeThroughput={"ejectionRate": 0.5, "queueDepth": 4})
        self.assertEqual(queue["constraint"][:2], ("warn", "merge queue"))
        flowing = self.facts(idle=2)
        self.assertEqual(flowing["constraint"][:2], ("ok", "none binding"))
        value = model()
        value["local"]["feed"] = {"schema": hud.STATUS_SCHEMA, "at": "2026-01-01T00:00:00Z"}
        self.assertEqual(hud.interpret(value, hud.utcnow())["constraint"][:2], ("unknown", "evidence"))

    def test_status_feed_is_only_current_evidence(self):
        now = hud.utcnow()
        for feed, error in ((None, "lanes-status unread"), ({"schema": "other"}, "lanes-status schema other"),
                            ({"schema": hud.STATUS_SCHEMA, "at": "bad"}, "lanes-status age unknown"),
                            ({"schema": hud.STATUS_SCHEMA, "at": (now - hud.timedelta(seconds=300)).isoformat()}, "lanes-status stale 5m")):
            with self.subTest(error=error):
                self.assertEqual(hud.status_feed({"feed": feed}, now), (None, error))


class ProductionTest(unittest.TestCase):
    PROD, MAIN = "a" * 40, "b" * 40
    DONE, PENDING, ELSEWHERE = "c" * 40, "d" * 40, "e" * 40

    def git(self, behind=(), recent=()):
        def run(args, **_):
            command = args[3:]
            out, code = "", 0
            if command[:1] == ["rev-parse"]:
                ref = command[-1]
                out = self.MAIN if "origin/main" in ref else self.PROD if ref.startswith("060037d") else ""
                code = 0 if out else 1
            elif command[:1] == ["rev-list"]:
                out = "\n".join(recent if "--since=72 hours ago" in command else behind)
            return SimpleNamespace(returncode=code, stdout=out)
        return run

    def test_served_build_ancestry_marks_each_merge_deployed_or_not(self):
        merged = [{"number": 1, "mergeCommit": {"oid": self.DONE}}, {"number": 2, "mergeCommit": {"oid": self.PENDING}},
                  {"number": 3, "mergeCommit": self.ELSEWHERE}, {"number": 4, "mergeCommit": None}]
        with tempfile.TemporaryDirectory() as directory:
            history = Path(directory) / hud.SERVED_BUILDS
            result = hud.production_model(Path("/repo"), merged, history, fetch=lambda: "060037d",
                                          run=self.git(behind=[self.PENDING, self.MAIN], recent=[self.DONE, self.PENDING]),
                                          marker=lambda sha, now: {"status": "verified", "at": "2026-10-20T13:15:52Z"},
                                          now=1_800_000_000)
            self.assertEqual(json.loads(history.read_text())[-1]["buildId"], "060037d")
        self.assertIsNone(result["error"])
        self.assertEqual((result["prodSha"], result["mainSha"], result["behind"]), (self.PROD, self.MAIN, 2))
        self.assertEqual(result["deployed"], {self.DONE: True, self.PENDING: False, self.ELSEWHERE: None})

    def test_unknown_build_or_unreadable_ancestry_is_an_error_not_a_deploy(self):
        for fetch, run, expected in ((lambda: "f" * 7, self.git(), "not in the local clone"),
                                     (self.fail_fetch, self.git(), "production version unread")):
            with self.subTest(expected=expected):
                result = hud.production_model(Path("/repo"), [], None, fetch=fetch, run=run, marker=lambda *_: {}, now=1)
                self.assertIn(expected, result["error"])
                self.assertEqual(result["deployed"], {})

    def test_production_rows_show_served_build_lag_and_the_state_flow(self):
        value = model()
        now = hud.utcnow() + hud.timedelta(seconds=1)  # after every read the fixture stamps
        merged = value["github"]["merged24h"]
        merged[0].update(mergeCommit={"oid": self.DONE}, mergedAt=(now - hud.timedelta(hours=5)).isoformat())
        merged[1].update(mergeCommit={"oid": self.PENDING}, mergedAt=(now - hud.timedelta(hours=4)).isoformat())
        value["production"] = {"readAt": now.isoformat(), "error": None, "buildId": "060037d", "prodSha": self.PROD,
                               "mainSha": self.MAIN, "behind": 3, "marker": {"status": "verified", "at": (now - hud.timedelta(hours=6)).isoformat()},
                               "deployed": {self.DONE: True, self.PENDING: False}}
        frame = [plain(row) for row in hud.render(value, 160, 45, now=now)]
        self.assertIn("CONSTRAINT ✕ FAIL   deploy · 1 merged PR(s) not in production · oldest 4h00m", frame[1])
        self.assertIn(f"serves {self.PROD[:7]} · ✓ verified 6h00m ago · main {self.MAIN[:7]} · behind 3 commits · 1 undeployed", frame[2])
        self.assertIn("draft 1 → prepared 0 → queued 2 → merged 2 → deployed 1 → verified 1", frame[3])
        value["production"]["marker"] = {"status": "pending"}
        frame = [plain(row) for row in hud.render(value, 160, 45, now=now)]
        self.assertIn("Production Verified marker pending", frame[2])
        self.assertIn("deployed 1 → verified ?", frame[3], "a pending marker is not verification")

    @staticmethod
    def fail_fetch():
        raise RuntimeError("production version unread (URLError)")

    def test_served_build_is_bounded_validated_and_retried_once(self):
        class Response(io.BytesIO):
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
        calls = []
        def opener(request, timeout):
            calls.append(timeout)
            if len(calls) == 1:
                raise OSError("reset")
            return Response(b'{"buildId": "060037D"}')
        self.assertEqual(hud.served_build(opener=opener), "060037d")
        self.assertEqual(calls, [5, 5])
        with self.assertRaisesRegex(RuntimeError, "not a commit"):
            hud.served_build(opener=lambda *_args, **_kw: Response(b'{"buildId": "main"}'))
        with self.assertRaisesRegex(RuntimeError, "unread"):
            hud.served_build(opener=mock.Mock(side_effect=OSError("down")))

    def test_verified_marker_is_final_and_pending_is_asked_again_per_interval(self):
        hud._markers.clear()
        name = "production-generation-verified-" + self.PROD
        pages = [{"artifacts": []}, {"artifacts": []},
                 {"artifacts": [{"name": name, "expired": False, "workflow_run": {"head_branch": "main"},
                                 "created_at": "2026-10-20T13:15:52Z"}]}]
        gh = mock.Mock(side_effect=pages)
        self.assertEqual(hud.verified_marker(self.PROD, 1000, gh)["status"], "pending")
        self.assertEqual(hud.verified_marker(self.PROD, 1000 + hud.REFRESH_GITHUB_S - 1, gh)["status"], "pending")
        self.assertEqual(gh.call_count, 2, "both marker names were read once")
        verified = hud.verified_marker(self.PROD, 1000 + hud.REFRESH_GITHUB_S, gh)
        self.assertEqual((verified["status"], verified["at"]), ("verified", "2026-10-20T13:15:52Z"))
        self.assertIs(hud.verified_marker(self.PROD, 10 ** 9, gh), verified)
        hud._markers.clear()
        self.assertEqual(hud.verified_marker(self.PROD, 1, mock.Mock(return_value={"oops": 1}))["status"], "unknown")
        hud._markers.clear()

    def test_stale_production_read_is_unknown(self):
        value = model()
        value["production"] = {"readAt": "2026-01-01T00:00:00+00:00", "prodSha": self.PROD}
        text = "\n".join(plain(row) for row in hud.render(value, 160, 45))
        self.assertIn("served build unknown · stale", text)
        self.assertIn("deployed ?", text)


class RefreshCostTest(unittest.TestCase):
    def test_ledger_reads_only_appended_complete_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "runs").mkdir()
            ledger = state / "runs" / "ledger.jsonl"
            ledger.write_text('{"runId": "a"}\n{"runId": "b"}\n')
            rows = hud.ledger_rows(state)
            self.assertEqual([row["runId"] for row in rows], ["a", "b"])
            with mock.patch.object(hud.json, "loads", wraps=json.loads) as parse:
                self.assertIs(hud.ledger_rows(state), rows)
                parse.assert_not_called()
            with open(ledger, "a") as handle:
                handle.write('{"runId": "c"}\nnot json\n[1]\n{"runId": "d"')
            self.assertEqual([row["runId"] for row in hud.ledger_rows(state)], ["a", "b", "c"])
            with open(ledger, "a") as handle:
                handle.write("}\n")
            self.assertEqual([row["runId"] for row in hud.ledger_rows(state)], ["a", "b", "c", "d"])
            ledger.write_text('{"runId": "z"}\n')
            self.assertEqual([row["runId"] for row in hud.ledger_rows(state)], ["z"])
            ledger.unlink()
            self.assertEqual(hud.ledger_rows(state), [])

    def test_state_json_is_parsed_again_only_when_it_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lanes-status.json"
            path.write_text('{"at": 1}')
            first = hud.read_json_cached(path)
            with mock.patch.object(hud, "read_json", wraps=hud.read_json) as read:
                self.assertIs(hud.read_json_cached(path), first)
                read.assert_not_called()
            path.write_text('{"at": 22}')
            self.assertEqual(hud.read_json_cached(path), {"at": 22})
            path.unlink()
            self.assertIsNone(hud.read_json_cached(path))

    def test_redraw_writes_only_changed_rows(self):
        first = hud.paint_frame(["a", "b", "c"], None)
        self.assertEqual(first, "\x1b[1;1H\x1b[Ka\x1b[2;1H\x1b[Kb\x1b[3;1H\x1b[Kc")
        self.assertEqual(hud.paint_frame(["a", "B", "c"], ["a", "b", "c"]), "\x1b[2;1H\x1b[KB")
        self.assertEqual(hud.paint_frame(["a", "b", "c"], ["a", "b", "c"]), "")

    def test_receipt_joins_are_reused_until_the_ledger_or_window_moves(self):
        value = model()
        receipts = value["local"]["attributionReceipts"]
        with mock.patch.object(hud.lane, "pr_attribution", wraps=hud.lane.pr_attribution) as attribute:
            first = hud.derived(value)
            self.assertIs(hud.derived(value), first)
            calls = attribute.call_count
            receipts.append(dict(receipts[0], runId="lane-2"))
            self.assertIsNot(hud.derived(value), first)
            self.assertGreater(attribute.call_count, calls)


class ConsoleTextTest(unittest.TestCase):
    def test_untrusted_text_cannot_inject_escapes_or_shift_columns(self):
        self.assertEqual(hud.console_text("ok\x1b[2Jé漢😀\ttab"), "ok?[2Jé?? tab")
        self.assertEqual(hud.titled("#1 ", "x\x1b[31my", 20), "#1 x?[31my")
        self.assertEqual(hud.titled("#1 ", "fix(leads): normalize names (JOV-7859)", 36), "#1 fix(leads): normalize names…")

    def test_fit_drops_whole_parts_least_important_first(self):
        parts = [(0, "#22307 merged"), (2, "low value"), (1, "deployed 7")]
        self.assertEqual(plain(hud.fit(parts, 40)), "#22307 merged · low value · deployed 7")
        self.assertEqual(plain(hud.fit(parts, 26)), "#22307 merged · deployed 7")
        self.assertEqual(plain(hud.fit(parts, 14)), "#22307 merged")

    def test_row_allocation_is_fixed_by_geometry_alone(self):
        for count, columns in hud.LAYOUTS.items():
            for rows in (19, 40, 60):
                for names in columns:
                    alloc = hud.allocate(names, rows)
                    with self.subTest(columns=count, rows=rows, names=names):
                        self.assertEqual(sum(alloc.values()), rows)
                        self.assertEqual(alloc, hud.allocate(names, rows))
        self.assertEqual(hud.allocate(["workers", "supply"], 4), {"workers": 4}, "a panel that cannot fit is hidden whole")

    def test_once_draws_the_panel_layout_by_default(self):
        value, now = fixture("live")
        output = io.StringIO()
        with mock.patch.object(hud.lane, "Host"), mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud, "build_model", return_value=value), \
                mock.patch.object(hud, "utcnow", return_value=now), mock.patch.object(hud.sys, "stdout", output):
            self.assertEqual(hud.main(["--once", "--width", "160", "--height", "45"]), 0)
        self.assertIn(" WORKERS ", output.getvalue())
        self.assertNotIn("ACTIVE SLOTS", output.getvalue())

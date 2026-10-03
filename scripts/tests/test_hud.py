"""Regression tests for scripts/lanes/hud.py (the Symphony console HUD).

Run with:
    python3 -m unittest scripts/tests/test_hud.py -v
"""
from __future__ import annotations

import importlib.util
import json
import re
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
                   "fetchedAt": "2026-09-26T21:00:00+00:00"},
        "github": {"ok": True, "errors": {},
                   "open": [{"number": 18724, "title": "JOV-6544 fix(audio): converge now-playing metadata", "lane": "devin",
                             "issue": "JOV-6544", "draft": False, "merge": "UNSTABLE", "updatedAt": "2026-09-26T20:20:26Z"},
                            {"number": 18712, "title": "JOV-6544 fix(web): warm release detail", "lane": "devin", "issue": "JOV-6544",
                             "draft": True, "merge": "CLEAN", "updatedAt": "2026-09-26T18:29:49Z"}],
                   "merged24h": [{"number": 18671, "title": "fix(ios): preserve chat cache timestamps",
                                   "createdAt": "2026-09-26T19:00:00Z", "mergedAt": "2026-09-26T20:12:00Z",
                                   "headRefName": "devin/jov-1-20260926t190000", "lane": "devin"},
                                 {"number": 18759, "title": "fix(lanes): one PR per issue",
                                  "createdAt": "2026-09-26T20:00:00Z", "mergedAt": "2026-09-26T20:54:50Z",
                                  "headRefName": "tim/jov-1", "lane": None}],
                   "queue": {"depth": 2, "entries": [{"number": 18724, "state": "AWAITING_CHECKS", "enqueuedAt": "2026-09-26T20:20:28Z"}]},
                   "rate": {"core": 4800, "graphql": 4700, "resetAt": "2026-09-26T21:30:00+00:00"},
                   "fetchedAt": "2026-09-26T21:00:00+00:00"},
        "system": {"load1": 1.2, "cores": 16, "diskFreePct": 3.1, "memAvailPct": 80},
    }
    base.update(overrides)
    return base


class MergeEvidenceTest(unittest.TestCase):
    def test_initial_remote_state_does_not_claim_zero_merges(self):
        sample = model(github=hud.Remote(None).github)
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("RECENTLY MERGED · unknown", text)
        self.assertIn("not-read-yet", text)
        self.assertNotIn("total 0 in 24h", text)
        self.assertIn("landed unknown", text)

    def test_complete_empty_window_remains_true_zero(self):
        sample = model()
        sample["github"]["merged24h"] = []
        sample["github"]["mergedWindow"] = {"complete": True}
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("total 0 in 24h", text)
        self.assertIn("landed 0", text)

    def test_explicit_incomplete_receipt_suppresses_stale_rows(self):
        sample = model()
        sample["github"]["mergedWindow"] = {"complete": False, "reason": "unstable_snapshot"}
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("RECENTLY MERGED · unknown", text)
        self.assertNotIn("total 2 in 24h", text)
        self.assertNotIn("#18671", text)

    def test_unreadable_merge_evidence_is_unknown_not_zero(self):
        sample = model()
        sample["github"]["errors"]["merged"] = "merged-pr-evidence:unstable_snapshot"
        sample["github"]["merged24h"] = []
        text = "\n".join(plain(line) for line in hud.render(sample, width=200))
        self.assertIn("RECENTLY MERGED · unknown", text)
        self.assertNotIn("total 0 in 24h", text)
        self.assertIn("landed unknown", text)

    def test_github_model_uses_shared_reader_and_retains_incomplete_reason(self):
        evidence = {"complete": False, "reason": "max_pages_reached", "prs": [],
                    "window": {"since": 1, "until": 2}, "pages": 20, "scans": 1}
        with mock.patch.object(hud.lane, "load_github_env"), \
                mock.patch.object(hud.lane, "load_providers", return_value={}), \
                mock.patch.object(hud, "promotion_model", return_value={"error": "fixture"}), \
                mock.patch.object(hud, "gh_json", side_effect=RuntimeError("fixture")), \
                mock.patch.object(hud.merge_evidence, "collect", return_value=evidence) as collect:
            result = hud.github_model()
        self.assertEqual(result["mergedWindow"]["reason"], "max_pages_reached")
        self.assertIn("max_pages_reached", result["errors"]["merged"])
        self.assertNotIn("merged24h", result)
        self.assertEqual(collect.call_count, 1)


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


class RenderTest(unittest.TestCase):
    def test_frame_fits_the_console_exactly(self):
        for width, height in ((160, 45), (120, 30), (240, 60)):
            frame = hud.render(model(), width, height)
            self.assertEqual(len(frame), height)
            for line in frame:
                self.assertLessEqual(len(plain(line)), width, plain(line))

    def test_running_and_vacant_slots_are_truthful(self):
        text = "\n".join(plain(line) for line in hud.render(model(), 160, 45))
        self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", text)
        self.assertIn("JOV-6544   Audio browsing: verify and close intent prefetch", text)
        self.assertIn("worker polling · new issues unknown (doctor unread)", text)
        self.assertIn("codex  vacant · no worker", text)
        self.assertIn("✓ alpha 48% left · reset 10m · banked 2", text)
        self.assertIn("✕ beta 0% left · reset 1h30m · banked 1 · retry 1h30m", text)
        self.assertIn("● gamma 90% left · reset 2h00m · banked 0 · leased", text)

    def test_capacity_horizon_is_show_only_and_renders_source_gaps(self):
        value = model()
        value["local"]["doctor"]["capacity"] = {
            "schema": "jovie.capacity-horizon/v1", "incidents": [], "topBlocker": "drain evidence stale",
            "leases": [{"alias": "alpha", "usableRemaining": 48, "bankedCount": 2, "mode": "fast",
                        "event": {"label": "natural reset", "countdownSeconds": 600},
                        "forecast": {"projectedUnused": None}, "route": {"selectedJob": "JOV-9"},
                        "freshness": {"status": "stale"}}]}
        text = "\n".join(plain(line) for line in hud.render(value, 160, 45))
        self.assertIn("CAPACITY HORIZON", text)
        self.assertIn("alpha 48% · banked 2 · natural reset 10m · drain ? @ ? · unused ? · coverage 0 · FAST · JOV-9 · stale", text)
        self.assertIn("show-only", text)

    def test_pipeline_attention_and_backlog_rows(self):
        text = "\n".join(plain(line) for line in hud.render(model(), 160, 45))
        self.assertIn("#18724 devin  JOV-6544", text)
        self.assertIn("unstable", text)
        self.assertIn("in queue awaiting_checks", text)
        self.assertIn("held: check-failed:pre-push-gate.sh affected", text)
        self.assertIn("✕ dispatch-crash: dispatch failed 3 ticks in a row", text)
        self.assertIn("cooldown hyperagent 10m", text)
        self.assertIn("requeue pending #18720", text)
        self.assertIn("gate-timeout 2", text)
        self.assertIn("Todo candidates 99 (agent-ready 87 · devin 0 · codex 19)", text)
        self.assertIn("autonomous 1 · manual Codex app 0 · old codex/* 0 · total 2 in 24h", text)
        self.assertIn("THROUGHPUT 24h · codex offer 0", text)
        self.assertIn("devin offer 1 start 1 productive 1 PR 1 first-pass 100%", text)
        self.assertIn("disk 3.1% free", text)

    def test_failed_sources_render_their_reason_never_a_blank(self):
        broken = model(linear={"ok": False, "error": "HTTPError: 429"},
                       github={"ok": False, "errors": {"open": "RuntimeError: HTTP 504", "queue": "timeout", "merged": "x", "rate": "y"}})
        broken["local"]["codex"] = {"error": "FileNotFoundError: codex", "accounts": {}, "available": []}
        broken["local"]["doctor"] = {}
        broken["local"]["cooldowns"], broken["local"]["requeue"], broken["local"]["ledger24h"] = {}, {}, {}
        text = "\n".join(plain(line) for line in hud.render(broken, 160, 45))
        self.assertIn("Linear HTTPError: 429", text)
        self.assertIn("PR list: RuntimeError: HTTP 504", text)
        self.assertIn("merge queue timeout", text)
        self.assertIn("new issues unknown (doctor unread)", text)
        self.assertIn("FileNotFoundError: codex", text)
        self.assertIn("✓ nothing needs a human", text)
        self.assertNotIn("UNKNOWN", text)

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
        self.assertIn("new issues 0 · eligible 0/8 · PRs 0/8 within-budget · excluded-label:type:epic 5, sensitive-text 3", text)
        self.assertIn("NEW ISSUES devin", text)
        self.assertNotIn("pool 87", text)
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
        colored = hud.rgb(hud.RED, "x" * 50)
        self.assertEqual(len(plain(hud.clip(colored, 10))), 10)
        self.assertEqual(len(plain(hud.pad("ab", 5))), 5)
        self.assertEqual(hud.dur(5400), "1h30m")
        self.assertEqual(hud.dur(90000), "1d1h")


class LedgerSchemaTest(unittest.TestCase):
    """JOV-7497: receipts missing optional verdict/provider/kind metadata must render
    as unclassified, not crash the display or be inferred as success."""

    def host_with_ledger(self, receipts):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        (state / "runs").mkdir()
        stamp = hud.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(state / "runs" / "ledger.jsonl", "w") as handle:
            for receipt in receipts:
                row = {"runId": receipt.get("runId", "x"), "endedAt": receipt.pop("endedAt", stamp), **receipt}
                handle.write(json.dumps(row) + "\n")
        return SimpleNamespace(state=state, slots=lambda _name, default: default, gate_slots=2)

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


if __name__ == "__main__":
    unittest.main()


class PromotionTest(unittest.TestCase):
    """JOV-6836: the HUD surfaces promotion-loss metrics, cached, and never blanks on failure."""
    METRICS = {"firstPass": {"rate": 0.74}, "reenqueueMinutes": {"p75": 365, "pending": 2},
               "openToFirstEnqueueMinutes": {"p75": 106.7}, "occupancy": {"cleanNotQueued": 6},
               "intake": {"opensPerHour": 12.6, "mergesPerHour": 7.3, "keysWithMultipleOpenPrs": 10}}

    def setUp(self):
        hud._promotion.update(at=0.0, data=None)

    def test_line_renders_metrics_and_errors(self):
        text = "\n".join(plain(line) for line in hud.render(model(github={**model()["github"], "promotion": self.METRICS}), 200, 45))
        self.assertIn("first-pass 74% · ejected→back p75 365m (2 waiting) · open→enqueue p75 106.7m", text)
        self.assertIn("opens/h 12.6 vs merges/h 7.3 · CLEAN not queued 6 · keys >1 PR 10", text)
        self.assertIn("PROMOTION 8h  unread", plain(hud.promotion_line(None)))
        self.assertIn("boom", plain(hud.promotion_line({"error": "boom"})))

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

    def fake_linear(self, calls):
        class Client:
            def __init__(self, _env):
                pass

            def gql(self, query, variables):
                calls.append((query, variables))
                data = {"pool": {"nodes": [{"identifier": "JOV-1", "priority": 1, "labels": {"nodes": [{"name": "devin"}]}}]},
                        "triage": {"nodes": []}}
                if "$numbers" in query:
                    data["active"] = {"nodes": [{"identifier": "JOV-7", "title": "t", "state": {"name": "In Progress"}}]}
                return data
        return Client

    def test_idle_host_never_sends_a_zero_issue_number(self):
        calls = []
        original = hud.lane.Linear
        hud.lane.Linear = self.fake_linear(calls)
        try:
            idle = hud.linear_model(Path("/x"))
            busy = hud.linear_model(Path("/x"), ["JOV-7"])
        finally:
            hud.lane.Linear = original
        self.assertTrue(idle["ok"])
        self.assertEqual(idle["active"], {})
        self.assertNotIn("numbers", calls[0][1])
        self.assertNotIn("$numbers", calls[0][0])
        self.assertEqual(calls[1][1]["numbers"], [7])
        self.assertEqual(busy["active"], {"JOV-7": "t"})

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

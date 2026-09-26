"""Regression tests for scripts/lanes/hud.py (the Symphony console HUD).

Run with:
    python3 -m unittest scripts/tests/test_hud.py -v
"""
from __future__ import annotations

import importlib.util
import re
import sys
import unittest
from pathlib import Path

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
            "lastLanding": "2026-09-26T20:30:00Z", "held": {"18712": {"sha": "a", "evidence": ["check-failed:bash scripts/hooks/pre-push-gate.sh affected"]}},
            "failures": {"JOV-1": {"count": 1, "at": 0}}, "gateTimeouts": {}, "requeue": {"18720": "h"},
            "cooldowns": {"hyperagent": 600}, "gateSeats": 2,
            "codex": {"accounts": {"alpha": {"available": True, "leased": False, "resetsInS": 0},
                                   "beta": {"available": False, "leased": False, "resetsInS": 5400},
                                   "gamma": {"available": True, "leased": True, "resetsInS": 0}},
                      "available": ["alpha"], "count": 3},
            "doctor": {"alerts": {"dispatch-crash": "dispatch failed 3 ticks in a row"}},
        },
        "linear": {"ok": True, "pool": {"agent-ready": 87, "devin": 0, "codex": 19}, "poolTotal": 99,
                   "active": {"JOV-6544": "Audio browsing: verify and close intent prefetch"}, "triage": 11,
                   "fetchedAt": "2026-09-26T21:00:00+00:00"},
        "github": {"ok": True, "errors": {},
                   "open": [{"number": 18724, "title": "JOV-6544 fix(audio): converge now-playing metadata", "lane": "devin",
                             "issue": "JOV-6544", "draft": False, "merge": "UNSTABLE", "checks": {"pass": 30, "fail": 0, "pending": 2},
                             "updatedAt": "2026-09-26T20:20:26Z"},
                            {"number": 18712, "title": "JOV-6544 fix(web): warm release detail", "lane": "devin", "issue": "JOV-6544",
                             "draft": True, "merge": "CLEAN", "checks": {"pass": 12, "fail": 1}, "updatedAt": "2026-09-26T18:29:49Z"}],
                   "merged24h": [{"number": 18671, "title": "fix(ios): preserve chat cache timestamps", "mergedAt": "2026-09-26T20:12:00Z", "lane": "devin"},
                                 {"number": 18759, "title": "fix(lanes): one PR per issue", "mergedAt": "2026-09-26T20:54:50Z", "lane": None}],
                   "queue": {"depth": 2, "entries": [{"number": 18724, "state": "AWAITING_CHECKS", "enqueuedAt": "2026-09-26T20:20:28Z"}]},
                   "rate": {"core": 4800, "graphql": 4700, "resetAt": "2026-09-26T21:30:00+00:00"},
                   "fetchedAt": "2026-09-26T21:00:00+00:00"},
        "system": {"load1": 1.2, "cores": 16, "diskFreePct": 3.1, "memAvailPct": 80},
    }
    base.update(overrides)
    return base


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
        self.assertIn("worker polling · pool 87 (own 0, shared 87)", text)
        self.assertIn("codex  vacant · no worker", text)
        self.assertIn("✓ alpha", text)
        self.assertIn("✕ beta banked 1h30m", text)
        self.assertIn("● gamma leased", text)

    def test_pipeline_attention_and_backlog_rows(self):
        text = "\n".join(plain(line) for line in hud.render(model(), 160, 45))
        self.assertIn("#18724 devin  JOV-6544", text)
        self.assertIn("in queue awaiting_checks", text)
        self.assertIn("held: check-failed:pre-push-gate.sh affected", text)
        self.assertIn("✕ dispatch-crash: dispatch failed 3 ticks in a row", text)
        self.assertIn("cooldown hyperagent 10m", text)
        self.assertIn("requeue pending #18720", text)
        self.assertIn("gate-timeout 2", text)
        self.assertIn("Todo pool 99 (agent-ready 87 · devin 0 · codex 19)", text)
        self.assertIn("lanes 1 of 2 in 24h", text)
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
        self.assertIn("pool unknown (Linear unread)", text)
        self.assertIn("FileNotFoundError: codex", text)
        self.assertIn("✓ nothing needs a human", text)
        self.assertNotIn("UNKNOWN", text)

    def test_stale_remote_reads_are_flagged_in_the_header(self):
        stale = model()
        stale["github"]["fetchedAt"] = "2026-01-01T00:00:00+00:00"
        header = plain(hud.render(stale, 160, 45)[0])
        self.assertIn("github stale", header)

    def test_clip_keeps_ansi_balanced_and_width_exact(self):
        colored = hud.rgb(hud.RED, "x" * 50)
        self.assertEqual(len(plain(hud.clip(colored, 10))), 10)
        self.assertEqual(len(plain(hud.pad("ab", 5))), 5)
        self.assertEqual(hud.dur(5400), "1h30m")
        self.assertEqual(hud.dur(90000), "1d1h")


if __name__ == "__main__":
    unittest.main()

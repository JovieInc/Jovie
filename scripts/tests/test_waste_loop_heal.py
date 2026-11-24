"""Regression: capacity SHARE must ship waste modules; heal restores the receipt."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scripts" / "lanes"), str(ROOT / "scripts" / "capacity")]
import waste_loop_heal as heal  # noqa: E402


class InstallScriptShipsWaste(unittest.TestCase):
    def test_systemd_install_copies_waste_modules_and_registry(self):
        text = (ROOT / "scripts/capacity/install-systemd-user.sh").read_text()
        for needle in (
            'install -m 0644 "$HERE/waste.py"',
            'install -m 0644 "$HERE/waste_debt.py"',
            'ops/registry/waste.json',
            "docs/design-system/cert-screens.json",
            "CAPACITY_REPO=",
        ):
            self.assertIn(needle, text, needle)


class SyncShare(unittest.TestCase):
    def test_sync_writes_missing_blobs_from_git(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            share = home / ".local/share/capacity"
            (share / "scripts/capacity").mkdir(parents=True)
            (share / "scripts/capacity/forecast.py").write_text("# stub\n")
            # Point heal paths at the temp home.
            old_share, old_state = heal.SHARE, heal.STATE
            old_blobs = heal.BLOBS
            try:
                heal.SHARE = share
                heal.STATE = home / ".local/state/capacity"
                heal.BLOBS = tuple(
                    (rel, share / dest.relative_to(old_share))
                    for rel, dest in old_blobs
                )
                # Use this checkout as the git repo (blobs exist on HEAD).
                out = heal.sync_share(ROOT, rev="HEAD")
                self.assertEqual(out["status"], "synced")
                self.assertTrue((share / "scripts/capacity/waste.py").is_file())
                self.assertTrue((share / "ops/registry/waste.json").is_file())
                self.assertTrue((share / "docs/design-system/cert-screens.json").is_file())
                # Second sync is a no-op write list.
                again = heal.sync_share(ROOT, rev="HEAD")
                self.assertEqual(again["status"], "synced")
                self.assertEqual(again["written"], [])
            finally:
                heal.SHARE, heal.STATE, heal.BLOBS = old_share, old_state, old_blobs

    def test_heal_run_pass_writes_waste_latest(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            share = home / ".local/share/capacity"
            state = home / ".local/state/capacity"
            (share / "scripts/capacity").mkdir(parents=True)
            (share / "scripts/capacity/forecast.py").write_text("# stub\n")
            old_share, old_state, old_blobs = heal.SHARE, heal.STATE, heal.BLOBS
            old_home = os.environ.get("HOME")
            try:
                heal.SHARE = share
                heal.STATE = state
                heal.BLOBS = tuple(
                    (rel, share / dest.relative_to(old_share))
                    for rel, dest in old_blobs
                )
                os.environ["HOME"] = str(home)
                # Avoid Summer store network during the publish pass.
                os.environ.pop("SUMMER_STORE_URL", None)
                os.environ.pop("SUMMER_STORE_TOKEN", None)
                out = heal.heal(SimpleNamespace(repo=ROOT), rev="HEAD", force_run=True)
                self.assertEqual(out["status"], "ok", out)
                receipt = state / "waste-latest.json"
                self.assertTrue(receipt.is_file())
                digest = json.loads(receipt.read_text())
                self.assertEqual(digest.get("schema"), "jovie.waste-digest/v1")
                self.assertTrue(digest.get("at"))
                rows = {r["id"]: r for r in out.get("techDebt") or []}
                self.assertIn("debt.cert_screen_entries", rows)
                self.assertEqual(rows["debt.cert_screen_entries"]["owner"], "summer")
            finally:
                heal.SHARE, heal.STATE, heal.BLOBS = old_share, old_state, old_blobs
                if old_home is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = old_home


class ForecastImportFallback(unittest.TestCase):
    def test_forecast_mentions_capacity_repo_fallback(self):
        text = (ROOT / "scripts/capacity/forecast.py").read_text()
        self.assertIn("CAPACITY_REPO", text)
        self.assertIn("import waste", text)


if __name__ == "__main__":
    unittest.main()

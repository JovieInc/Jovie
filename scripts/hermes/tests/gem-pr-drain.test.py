#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-pr-drain.py"
SPEC = importlib.util.spec_from_file_location("gem_pr_drain", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class JovieOwnershipTests(unittest.TestCase):
    def test_jovie_and_legacy_alias_are_observer_only(self):
        for repo in ("JovieInc/Jovie", "itstimwhite/Jovie"):
            self.assertTrue(MODULE.is_jovie_repository(repo))
            self.assertFalse(MODULE.repo_drain_enabled(repo, True))

    def test_other_repositories_can_still_follow_their_registry_policy(self):
        self.assertFalse(MODULE.repo_drain_enabled("other/repo", False))
        self.assertTrue(MODULE.repo_drain_enabled("other/repo", True))

    def test_jovie_main_writes_successful_observer_only_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = pathlib.Path(directory) / "latest.json"
            output = io.StringIO()
            with (
                mock.patch.object(MODULE, "STATE", artifact.parent),
                mock.patch.object(MODULE, "ARTIFACT", artifact),
                mock.patch.object(MODULE, "inventory", side_effect=AssertionError),
                mock.patch.object(MODULE.sys, "argv", [str(SOURCE)]),
                redirect_stdout(output),
            ):
                self.assertEqual(MODULE.main(), 0)

            receipt = json.loads(output.getvalue())
            self.assertEqual(receipt["status"], "ok")
            self.assertEqual(receipt["work_admission"], "disabled")
            self.assertEqual(receipt["intake"], "disabled_symphony_implementation_owner")
            self.assertEqual(receipt["selected"], [])
            self.assertEqual(receipt, json.loads(artifact.read_text()))


if __name__ == "__main__":
    unittest.main()

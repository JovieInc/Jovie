"""The readable Gem install receipt (JOV-14764): what the updater installed and why it refused,
exactly {sourceCommit, bundleDigest, installedAt, refused} — Part B's doctor closer consumes the
lanes-status.json 'release' block, so this shape is contractual."""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
sys_path_added = str(ROOT / "scripts/lanes")
import sys  # noqa: E402
if sys_path_added not in sys.path:
    sys.path.insert(0, sys_path_added)
sys.modules.setdefault("lane_runner", None)  # keep the release module single-loaded
sys.path.insert(0, str(Path(__file__).resolve().parent))
import atomic_state  # noqa: E402
import importlib.util  # noqa: E402

SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)

class ReleaseReceiptTest(unittest.TestCase):

    BUNDLE_1 = {"bundleDigest": "b1" * 32, "sourceCommit": "a" * 40,
                "objects": {"scripts/lanes": "f" * 40}}
    BUNDLE_2 = {"bundleDigest": "b2" * 32, "sourceCommit": "c" * 40,
                "objects": {"scripts/lanes": "f" * 40}}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="release-receipt-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.host = lane.Host(state=self.root / "state", repo=self.root / "repo", gate_slots=2)
        self.host.state.mkdir()

    def _install(self, bundle, *, proof_rc=0, proof_stdout="", stage_diagnostic=None):
        """Drive install_release to activation with the staged proof stubbed at the boundary."""
        def run(argv, **kwargs):
            if "prove-staging" in argv:
                if stage_diagnostic is not None:
                    staging = Path(argv[argv.index("prove-staging") + 1])
                    (staging / ".selftest-diagnostic.json").write_text(json.dumps(stage_diagnostic))
                return subprocess.CompletedProcess(argv, proof_rc, stdout=proof_stdout, stderr="")
            if argv[:1] == ["tar"]:  # the archive is a stub; create the staged tree it would unpack
                (Path(argv[argv.index("-C") + 1]) / "scripts/lanes").mkdir(parents=True, exist_ok=True)
                return subprocess.CompletedProcess(argv, 0, stdout=b"", stderr=b"")
            return subprocess.CompletedProcess(argv, 0, stdout=b"fixture archive", stderr=b"")
        with patch.object(lane, "fetch_release_source", return_value=SimpleNamespace(returncode=0)), \
                patch.object(lane, "release_identity", return_value=bundle), \
                patch.object(lane.lifecycle, "run", side_effect=run):
            return lane.install_release(self.host)

    def _receipt(self):
        return json.loads((self.host.state / "release-receipt.json").read_text())

    def test_successful_install_writes_sourceCommit_equal_to_bundle_source(self):
        self.assertEqual(self._install(self.BUNDLE_1), 0)
        receipt = self._receipt()
        self.assertEqual(receipt["sourceCommit"], self.BUNDLE_1["sourceCommit"])
        self.assertEqual(receipt["bundleDigest"], self.BUNDLE_1["bundleDigest"])
        self.assertIsNone(receipt["refused"])
        self.assertEqual(set(receipt), {"sourceCommit", "bundleDigest", "installedAt", "refused"})
        datetime.strptime(receipt["installedAt"], "%Y-%m-%dT%H:%M:%SZ")

    def test_refused_install_keeps_installed_sourceCommit_and_names_the_failing_test(self):
        self.assertEqual(self._install(self.BUNDLE_1), 0)
        installed_at = self._receipt()["installedAt"]
        diagnostic = {"schema": "jovie-lane-selftest-diagnostic/v1",
                      "failedSelectors": ["test_refused (a.b.UpdateTest)"]}
        self.assertEqual(self._install(self.BUNDLE_2, proof_rc=1,
                                       proof_stdout="release tests failed\n",
                                       stage_diagnostic=diagnostic), 1)
        receipt = self._receipt()
        self.assertEqual(receipt["sourceCommit"], self.BUNDLE_1["sourceCommit"],
                         "a refusal never claims the refused bundle is installed")
        self.assertEqual(receipt["bundleDigest"], self.BUNDLE_1["bundleDigest"])
        self.assertEqual(receipt["installedAt"], installed_at)
        self.assertEqual(receipt["refused"]["reason"], "test_refused (a.b.UpdateTest)")
        datetime.strptime(receipt["refused"]["at"], "%Y-%m-%dT%H:%M:%SZ")

    def test_refusal_without_a_diagnostic_names_the_check_that_refused(self):
        self.assertEqual(self._install(self.BUNDLE_1), 0)
        self.assertEqual(self._install(self.BUNDLE_2, proof_rc=1,
                                       proof_stdout="staging proof failed\n"), 1)
        self.assertEqual(self._receipt()["refused"]["reason"], "staging proof failed")

    def test_refused_install_before_any_install_leaves_sourceCommit_null(self):
        self.assertEqual(self._install(self.BUNDLE_1, proof_rc=1,
                                       proof_stdout="mesh runtime dependency closure failed\n"), 1)
        receipt = self._receipt()
        self.assertIsNone(receipt["sourceCommit"])
        self.assertIsNone(receipt["bundleDigest"])
        self.assertEqual(receipt["refused"]["reason"], "mesh runtime dependency closure failed")

    def test_a_partial_write_never_leaves_invalid_json(self):
        self.assertEqual(self._install(self.BUNDLE_1), 0)
        good = (self.host.state / "release-receipt.json").read_bytes()
        with patch.object(atomic_state.os, "replace", side_effect=OSError("crash before rename")):
            atomic_state.write_release_receipt(self.host.state, bundle=self.BUNDLE_2)  # must not raise
        self.assertEqual((self.host.state / "release-receipt.json").read_bytes(), good)
        json.loads(good)  # and what survived is valid JSON

    def test_two_installs_racing_leave_one_valid_receipt(self):
        start, release = threading.Barrier(2), threading.Event()
        outcomes = []

        def install(bundle):
            start.wait(timeout=10)
            try:
                atomic_state.write_release_receipt(self.host.state, bundle=bundle)
                return "ok"
            finally:
                release.set()

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(install, bundle) for bundle in (self.BUNDLE_1, self.BUNDLE_2)]
            for future in futures:
                outcomes.append(future.result(timeout=10))
        receipt = self._receipt()
        self.assertEqual(outcomes, ["ok", "ok"])
        self.assertIn(receipt["sourceCommit"], {self.BUNDLE_1["sourceCommit"], self.BUNDLE_2["sourceCommit"]})
        self.assertIsNone(receipt["refused"])

    def test_release_status_prefers_the_receipt_and_falls_back_to_the_marker(self):
        marker = lane.read_marker(self.host)
        self.assertEqual(atomic_state.release_status(self.host.state, marker), marker)
        atomic_state.write_release_receipt(self.host.state, bundle=self.BUNDLE_1)
        self.assertEqual(atomic_state.release_status(self.host.state, marker),
                         {"sourceCommit": self.BUNDLE_1["sourceCommit"],
                          "bundleDigest": self.BUNDLE_1["bundleDigest"],
                          "installedAt": self._receipt()["installedAt"], "refused": None})

    def test_receipt_failure_never_gates_the_install(self):
        with patch.object(atomic_state, "atomic_write_text", side_effect=OSError("state dir unwritable")):
            atomic_state.write_release_receipt(self.host.state, bundle=self.BUNDLE_1)  # swallowed, no raise
        self.assertFalse((self.host.state / "release-receipt.json").exists())
        self.assertEqual(self._install(self.BUNDLE_1), 0, "the install proceeds with no receipt")
        self.assertTrue((self.host.state / "release-receipt.json").exists())



"""Detached native consumers sync main only when main already lists them."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import detached_native_sync as sync  # noqa: E402
import fix_red_classes as classes  # noqa: E402

PATH = "apps/ios/Jovie/App/WhatsNewFeed.swift"
OTHER = "apps/ios/Jovie/App/RootView.swift"
CHECK = "Affected Unit Tests (4/4)"
# The two assertion lines from run 43249244310, including the timestamp and color.
LOG = (
    "HttpError: API rate limit exceeded for installation\n"
    "2026-11-12T15:46:18.7137944Z \x1b[31m+     "
    '"code": "detached-native-consumer",\x1b[39m\n'
    "2026-11-12T15:46:18.7138486Z \x1b[31m+     "
    f'"id": "JoviePillButtonStyle:{PATH}",\x1b[39m\n'
)
REGISTRY = (
    "consumerPaths: [\n"
    f"        '{OTHER}',\n"
    f"        '{PATH}',\n"
    "      ],\n"
)


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge,
            "statusCheckRollup": [{"name": name, "conclusion": "FAILURE"} for name in names]}


class DetachedNativeSyncTest(unittest.TestCase):
    def test_blocked_unit_shard_syncs_main_when_the_registry_quotes_the_path(self):
        with patch.object(sync, "main_owns", return_value=True) as owns:
            got = classes.classify(pr(CHECK), {CHECK: LOG})
            behind = classes.classify(pr(CHECK, merge="BEHIND"), {CHECK: LOG})
        self.assertEqual((got["cls"], got["action"]), ("detached-native-consumer", "sync-main"))
        self.assertEqual(got["files"], [PATH])
        self.assertEqual((behind["cls"], behind["action"]), ("detached-native-consumer", "sync-main"))
        self.assertEqual(owns.call_count, 2)

    def test_a_consumer_main_does_not_list_stays_with_the_model(self):
        with patch.object(sync, "main_owns", return_value=False):
            got = classes.classify(pr(CHECK), {CHECK: LOG})
        self.assertEqual((got["cls"], got["action"]), ("detached-native-consumer", "agent"))
        self.assertEqual(got["files"], [PATH])

    def test_rate_limit_noise_without_the_assertion_does_not_ask_main(self):
        def boom(_paths):
            raise AssertionError("main_owns")

        with patch.object(sync, "main_owns", boom):
            got = classes.classify(pr(CHECK), {CHECK: "HttpError: API rate limit exceeded for installation\n"})
        self.assertEqual((got["cls"], got["action"]), ("platform-infra", "rerun"))
        bare = classes.classify(pr(CHECK), {CHECK: '"code": "detached-native-consumer"'})
        self.assertEqual(bare["cls"], "other")

    def test_registry_quote_owns_the_path_and_git_failures_do_not(self):
        self.assertTrue(sync.main_owns([PATH], show=REGISTRY))
        self.assertTrue(sync.main_owns([PATH, OTHER], show=REGISTRY))
        self.assertFalse(sync.main_owns([PATH], show=REGISTRY.replace(f"'{PATH}'", "unused")))
        self.assertFalse(sync.main_owns([], show=REGISTRY))
        self.assertFalse(sync.main_owns(["apps/ios/Jovie/../../etc/passwd"], show=REGISTRY))
        self.assertFalse(sync.main_owns([PATH], show=object()))
        with patch("detached_native_sync.subprocess.run", side_effect=OSError):
            self.assertFalse(sync.main_owns([PATH]))
        failed = SimpleNamespace(returncode=1, stdout="")
        with patch("detached_native_sync.subprocess.run", return_value=failed):
            self.assertFalse(sync.main_owns([PATH]))
        self.assertEqual(sync.paths(LOG), [PATH])


if __name__ == "__main__":
    unittest.main()

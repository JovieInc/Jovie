"""Certification TODO stubs sync main only when main already filled them."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import cert_stub_sync as sync  # noqa: E402
import fix_red_classes as classes  # noqa: E402

PATHS = (
    "goldenPath.stages[0].oracle",
    "goldenPath.stages[1].oracle",
    "goldenPath.stages[2].oracle",
    "goldenPath.stages[3].oracle",
    "goldenPath.stages[4].oracle",
    "goldenPath.accounts.source",
    "paidOutcome.plan",
    "paidOutcome.priceSource",
    "paidOutcome.freeAlternative",
    "privacy.crawl[0].url",
    "privacy.policyUrl",
    "customerVoice.channels[0].route",
    "waste.appId",
    "capacity.appId",
)
COMPANY = "Company guards"
PUBLIC = "certify / Certification config"
COMPANY_LOG = "\n".join(
    f"##[error]public-app-certification: jovie-ios: {path}: still a TODO stub" for path in PATHS
)
PUBLIC_LOG = "\n".join(f"##[error]jovie-ios: {path}: still a TODO stub" for path in PATHS)
CLEAR = {
    "goldenPath": {
        "stages": [{"oracle": "filled"} for _ in range(5)],
        "accounts": {"source": "apps/web/lib/synthetic/prodcert-identities.ts"},
    },
    "paidOutcome": {"plan": "Artist Presence", "priceSource": "plan-prices.ts", "freeAlternative": "free"},
    "privacy": {"crawl": [{"url": "https://jov.ie/signin"}], "policyUrl": "https://jov.ie/legal/privacy"},
    "customerVoice": {"channels": [{"route": "support"}]},
    "waste": {"appId": "jovie"},
    "capacity": {"appId": "jovie"},
}


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge,
            "statusCheckRollup": [{"name": name, "conclusion": "FAILURE"} for name in names]}


def show_clear(_app):
    return json.dumps(CLEAR)


class CertStubSyncTest(unittest.TestCase):
    def test_blocked_certification_syncs_main_when_main_filled_the_stubs(self):
        with patch.object(sync, "main_clear", return_value=True) as clear:
            got = classes.classify(pr(COMPANY, PUBLIC), {COMPANY: COMPANY_LOG, PUBLIC: PUBLIC_LOG})
            behind = classes.classify(pr(COMPANY, merge="BEHIND"), {COMPANY: COMPANY_LOG})
        self.assertEqual((got["cls"], got["action"]), ("cert-todo-stub", "sync-main"))
        self.assertEqual(got["files"], ["canon/certification/jovie-ios.json"])
        self.assertEqual((behind["cls"], behind["action"]), ("cert-todo-stub", "sync-main"))
        self.assertEqual(clear.call_count, 3)

    def test_a_stub_main_still_has_stays_with_the_model(self):
        stale = json.dumps({"goldenPath": {"stages": [{"oracle": "TODO"}]}})
        with patch.object(sync, "main_clear", return_value=False):
            got = classes.classify(pr(COMPANY), {COMPANY: COMPANY_LOG})
        self.assertEqual((got["cls"], got["action"]), ("cert-todo-stub", "agent"))
        self.assertFalse(sync.main_clear(sync.findings(COMPANY_LOG), show=lambda _app: stale))

    def test_a_warning_without_an_error_annotation_does_not_match(self):
        warning = "##[warning]jovie-ios: waste.appId: still a TODO stub\n"
        self.assertIsNone(sync.hit(warning))
        self.assertEqual(sync.findings(warning), [])
        got = classes.classify(pr(COMPANY), {COMPANY: warning + "vacuous-verdict baseline\n"})
        self.assertEqual(got["cls"], "other")

    def test_lookup_clears_a_moved_field_and_rejects_a_remaining_todo(self):
        self.assertTrue(sync.main_clear([("jovie-ios", "waste.appId")], show=show_clear))
        self.assertTrue(sync.main_clear([("jovie-ios", "retired.field")], show=show_clear))
        self.assertFalse(sync.main_clear([], show=show_clear))
        self.assertFalse(sync.main_clear([("Jovie", "waste.appId")], show=show_clear))
        self.assertFalse(sync.main_clear([("jovie-ios", "waste.appId")], show=lambda _app: "{"))
        self.assertFalse(sync.main_clear([("jovie-ios", "waste.appId")], show=lambda _app: "[]"))
        leftover = dict(CLEAR)
        leftover["waste"] = {"appId": "TODO: fill"}
        self.assertFalse(sync.main_clear([("jovie-ios", "waste.appId")], show=lambda _app: json.dumps(leftover)))

    def test_git_and_json_failures_stay_with_the_model(self):
        with patch("cert_stub_sync.subprocess.run", side_effect=OSError):
            self.assertEqual(sync.hit(PUBLIC_LOG), ("cert-todo-stub", "agent"))
        failed = SimpleNamespace(returncode=1, stdout="")
        with patch("cert_stub_sync.subprocess.run", return_value=failed):
            self.assertFalse(sync.main_clear([("jovie-ios", "waste.appId")]))

    def test_origin_main_already_cleared_the_recorded_jovie_ios_stubs(self):
        self.assertEqual(sync.hit(COMPANY_LOG), ("cert-todo-stub", "sync-main"))
        self.assertEqual(sync.hit(PUBLIC_LOG), ("cert-todo-stub", "sync-main"))
        got = classes.classify(
            pr(COMPANY, PUBLIC), {COMPANY: COMPANY_LOG, PUBLIC: PUBLIC_LOG})
        self.assertEqual((got["cls"], got["action"], got["files"]), (
            "cert-todo-stub", "sync-main", ["canon/certification/jovie-ios.json"]))


if __name__ == "__main__":
    unittest.main()

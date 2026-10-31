import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class FailureEvidenceTest(unittest.TestCase):
    def test_failed_summary_fingerprint_ignores_checkout_and_command_prelude(self):
        for kind in ('Tests', 'Suites'):
            footer = f'\x1b[31m--- Failed {kind} 1 ---\x1b[0m\n2026-10-30T21:46:43Z FAIL tests/marketing/baseline.test.ts > stale baseline\nAssertionError: Baseline is stale'
            for prefix in (
                '2026-10-30T21:43:32Z * [new branch] backup/error-contract -> origin/backup/error-contract\n',
                '2026-10-30T21:43:32Z Run echo "::error::Incomplete checkout"\n',
                '--- Failed Tests 1 ---\nFAIL tests/mock-error.test.ts\n',
            ):
                with self.subTest(kind=kind, prefix=prefix):
                    signature = classes.error_signature(prefix + footer)
                    self.assertEqual(signature, classes.error_signature(footer))
                    self.assertIn('tests/marketing/baseline.test.ts', signature)

    def test_failed_summary_fingerprint_distinguishes_real_failures(self):
        prefix = 'Run echo "::error::Incomplete checkout"\n'
        a = classes.error_signature(prefix + '--- Failed Tests 1 ---\nFAIL tests/table/virtual-window.test.ts')
        b = classes.error_signature(prefix + '--- Failed Tests 1 ---\nFAIL tests/marketing/baseline.test.ts')
        self.assertNotEqual(a, b)
        self.assertEqual(classes.error_signature('Error: worker lost'), 'Error: worker lost')

    def test_metadata_numbers_do_not_turn_product_red_into_infra(self):
        # PR23362: fetched ref metadata preceded the actual Vitest failure.
        failed = "AssertionError: Baseline is stale\narbitrary-value::components/organisms/CookieBannerSection.tsx: 1 < 2"
        for metadata in (
            "* [new branch] ops/pr-inventory-graphql-504-jov-8000 -> origin/ops/pr-inventory-graphql-504-jov-8000",
            "591 tests passed in 503 ms; source lines: 500; duration 502 ms",
        ):
            with self.subTest(metadata=metadata):
                log = metadata + "\n" + failed
                self.assertIsNone(classes.remediation.INFRA_TEXT.search(log))
                result = classes.classify(pr("unit"), {"unit": log})
                self.assertEqual((result["cls"], result["action"]), ("other", "agent"))
                event = classes.remediation.classify_event({"source": "schedule", "evidence": {"excerpt": log}})
                self.assertEqual(event["cls"], "fixable-by-model")

    def test_explicit_http_and_runner_failures_keep_infra_recovery(self):
        for message in (
            "upstream returned HTTP 500 before the job started", "HTTP/2 503 Service Unavailable",
            "HTTP Error 502: Bad Gateway", "HTTPError: 504", "status: 503", "statusCode=502",
            "response code: 503", "The requested URL returned error: 502",
            "runner has been lost", "The runner has received a shutdown", "ENOMEM", "i/o timeout",
        ):
            with self.subTest(message=message):
                self.assertIsNotNone(classes.remediation.INFRA_TEXT.search(message))
                result = classes.classify(pr("unit"), {"unit": message})
                self.assertEqual((result["cls"], result["action"]), ("platform-infra", "rerun"))
                event = classes.remediation.classify_event({"source": "schedule", "evidence": {"excerpt": message}})
                self.assertEqual(event["cls"], "flaky-infra")

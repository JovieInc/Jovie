import importlib.util
import sys
import tempfile
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


def lane_harness():
    """Reuse the collected lane_runner tests when pytest already loaded them."""
    for module in sys.modules.values():
        path = getattr(module, "__file__", None) or ""
        if path.endswith("scripts/tests/test_lane_runner.py") and hasattr(module, "FixRedTest"):
            return module
    spec = importlib.util.spec_from_file_location(
        "test_lane_runner_fleet_harness", Path(__file__).with_name("test_lane_runner.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FleetBodyRouteTest(unittest.TestCase):
    def test_annotated_red_stamps_and_a_win_stays_with_the_model(self):
        red = "##[error]red-before-green: this repair PR has no section"
        win = "##[error]win: this PR needs a measured win"
        got = classes.classify(pr("Source Validation"), {"Source Validation": red})
        self.assertEqual((got["cls"], got["action"]), ("fleet-body", "stamp-repair-evidence"))
        self.assertIn(got["action"], classes.DETERMINISTIC)
        for log in (win, red + "\n" + win):
            got = classes.classify(pr("Fleet Rules Evidence", "PR Fleet Rules"), {
                "Fleet Rules Evidence": log, "PR Fleet Rules": log})
            self.assertEqual((got["cls"], got["action"]), ("fleet-body", "agent"), log)
            self.assertNotIn(got["action"], classes.DETERMINISTIC)
        split = classes.classify(pr("Fleet Rules Evidence", "PR Fleet Rules"), {
            "Fleet Rules Evidence": red, "PR Fleet Rules": win})
        self.assertEqual((split["cls"], split["action"]), ("fleet-body", "agent"))
        mixed = classes.classify(pr("Fleet Rules Evidence", "Source Validation"), {
            "Fleet Rules Evidence": red, "Source Validation": "AssertionError: expected 1"})
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))

    def test_missing_red_section_is_stamped_once_and_a_win_reaches_the_model(self):
        harness = lane_harness()
        patches = (
            harness._qualification_prepare_fixture, harness._disk_capacity_fixture,
            harness._devin_free_fixture, harness._qualification_fixture)
        started = [item for item in patches if not hasattr(item, "is_local")]
        for item in started:
            item.start()
        case = harness.FixRedTest()
        case.setUp()
        try:
            red = "##[error]red-before-green: this repair PR has no section\n"
            target = {**case.pr(), "body": "## Summary\nrepair\n", "statusCheckRollup": [{
                "name": "Fleet Rules Evidence", "status": "COMPLETED", "conclusion": "FAILURE",
                "detailsUrl": "https://github.com/JovieInc/Jovie/actions/runs/123/job/456"}]}
            with tempfile.TemporaryDirectory() as tmp:
                host, receipt, agent, again = case.run_gate(tmp, red, pr=target)
                self.assertEqual(receipt["reasons"], ["stamped-fleet-body"])
                self.assertEqual(receipt["failureFingerprint"]["cls"], "fleet-body")
                agent.assert_not_called()
                again.assert_not_called()
                written = (host.state / "runs" / "fleet-body-5.md").read_text()
                self.assertIn("## Red-before-green", written)
                self.assertIn("- Failing command:", written)
                self.assertNotIn("## Win", written)
                _, second, agent2, _ = case.run_gate(tmp, red, pr=target)
                agent2.assert_called_once()
                self.assertNotEqual(second["reasons"][:1], ["stamped-fleet-body"])
            win = red + "##[error]win: this PR needs a measured win\n"
            with tempfile.TemporaryDirectory() as tmp:
                host, _, agent, _ = case.run_gate(tmp, win, pr=target)
                agent.assert_called_once()
                self.assertFalse((host.state / "runs" / "fleet-body-5.md").exists())
        finally:
            case.doCleanups()
            for item in reversed(started):
                item.stop()

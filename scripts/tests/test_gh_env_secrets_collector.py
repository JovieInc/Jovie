"""gh-env-secrets collector tests (JOV-13032): a blind card names its cause, and a quota-shed read
retries once at default priority instead of going blind while cost-0 rate_limit reads still work.
New-file rule per the capacity coverage lock: existing capacity tests stay untouched."""
import sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "capacity"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import collectors as fc

REPO_SPEC = {"type": "gh-env-secrets", "repo": "JovieInc/Jovie", "cap": 100}
ENV_SPEC = {"type": "gh-env-secrets", "repo": "JovieInc/Jovie", "cap": 100,
            "environment": "Production \u2013 jovie"}
KEY = "gh-env-secrets:"


def gh_result(code=0, stdout="100", stderr="", deferred=False):
    return {"code": code, "stdout": stdout, "stderr": stderr, "deferred": deferred}


class GhEnvSecretsCollector(unittest.TestCase):
    def setUp(self):
        fc.COLLECTOR_ERRORS.pop(KEY, None)
        self.addCleanup(fc.COLLECTOR_ERRORS.pop, KEY, None)

    def test_repo_secret_count_reads_total_count_at_report_priority(self):
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(stdout="97")) as gh:
            got = fc.c_gh_env_secrets(REPO_SPEC, 0)
        self.assertEqual(got, {"value": 97, "limit": 100})
        self.assertEqual(gh.call_args.args[0],
                         ["api", "repos/JovieInc/Jovie/actions/secrets?per_page=1", "--jq", ".total_count"])
        self.assertEqual(gh.call_args.kwargs.get("priority"), "report")
        self.assertNotIn(KEY, fc.COLLECTOR_ERRORS)

    def test_environment_path_quotes_the_environment_name(self):
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(stdout="100")) as gh:
            got = fc.c_gh_env_secrets(ENV_SPEC, 0)
        self.assertEqual(got, {"value": 100, "limit": 100})
        self.assertEqual(gh.call_args.args[0][1],
                         "repos/JovieInc/Jovie/environments/Production%20%E2%80%93%20jovie/secrets?per_page=1")

    def test_deferred_report_read_retries_once_at_default_priority(self):
        with mock.patch("apiclient.gh.run_gh",
                        side_effect=[gh_result(code=75, deferred=True), gh_result(stdout="100")]) as gh:
            got = fc.c_gh_env_secrets(REPO_SPEC, 0)
        self.assertEqual(got, {"value": 100, "limit": 100})
        self.assertEqual(gh.call_count, 2)
        self.assertEqual(gh.call_args_list[0].kwargs.get("priority"), "report")
        self.assertEqual(gh.call_args_list[1].kwargs.get("priority"), "default")
        self.assertNotIn(KEY, fc.COLLECTOR_ERRORS)

    def test_double_deferral_names_the_cause(self):
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(
                code=75, stderr="shed (core budget low)", deferred=True)) as gh:
            self.assertIsNone(fc.c_gh_env_secrets(REPO_SPEC, 0))
        self.assertEqual(gh.call_count, 2)
        reason = fc.COLLECTOR_ERRORS[KEY]
        self.assertIn("deferred", reason)
        self.assertIn("core budget low", reason)

    def test_http_failure_names_the_status(self):
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(
                code=1, stderr="HTTP 403: Resource not accessible by integration")):
            self.assertIsNone(fc.c_gh_env_secrets(REPO_SPEC, 0))
        self.assertIn("HTTP 403", fc.COLLECTOR_ERRORS[KEY])

    def test_empty_and_unparseable_outputs_name_the_cause(self):
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(stdout="")):
            self.assertIsNone(fc.c_gh_env_secrets(REPO_SPEC, 0))
        self.assertIn("empty", fc.COLLECTOR_ERRORS[KEY])
        with mock.patch("apiclient.gh.run_gh", return_value=gh_result(stdout="not-a-count")):
            self.assertIsNone(fc.c_gh_env_secrets(REPO_SPEC, 0))
        self.assertIn("not-a-count", fc.COLLECTOR_ERRORS[KEY])

    def test_missing_apiclient_names_the_fix(self):
        with mock.patch.dict(sys.modules, {"apiclient.gh": None}):
            self.assertIsNone(fc.c_gh_env_secrets(REPO_SPEC, 0))
        self.assertIn("apiclient", fc.COLLECTOR_ERRORS[KEY])


if __name__ == "__main__":
    unittest.main()

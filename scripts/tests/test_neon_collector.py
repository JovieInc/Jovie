"""Neon collector auth wiring and failure-visibility (JOV-10159..10162).

The gem collector's systemd unit ships no secrets, so c_neon went blind on its first pass:
NEON_API_KEY existed only as a GitHub Actions secret, which the host cannot read. These tests
pin (a) the Doppler fallback that matches the lanes store pattern c_resend already uses, and
(b) that a failed neon reading records WHY (variable + store, or HTTP status) so the doctor
card names the fix instead of a bare "collector is blind".
Additive-only coverage (coverage-gap-land-no-ratchet-v1): no existing test is modified.
"""
import os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "capacity"))
import forecast as f

RES = {"id": "neon-x", "group": "database", "label": "X", "unit": "cu-hours", "leadTimeHours": 24,
       "mode": "level", "atLimit": {"effect": "crash", "note": "n"},
       "collector": {"type": "neon", "orgId": "org-x", "metric": "compute-hours", "limit": 300},
       "fix": {"escalate": {"options": [], "default": "d", "deadlineHours": 24}}}


class NeonCollector(unittest.TestCase):
    def setUp(self):
        f.COLLECTOR_ERRORS.clear()

    def test_neon_without_any_token_records_reason_naming_variable_and_store(self):
        spec = {"orgId": "org-x", "metric": "compute-hours", "limit": 300}
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(f, "run", return_value=None), \
                    mock.patch.dict(os.environ, {}, clear=True), \
                    mock.patch.object(f.Path, "home", return_value=Path(d)):
                self.assertIsNone(f.c_neon(spec, 0))
        reason = f.COLLECTOR_ERRORS["neon:compute-hours"]
        self.assertIn("NEON_API_KEY", reason)
        self.assertIn("agent-mesh", reason)

    def test_neon_token_from_doppler_when_env_missing(self):
        with mock.patch.object(f, "run", return_value="napi_fake\n"), \
                mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(f.neon_token(), "napi_fake")

    def test_neon_env_token_wins_and_doppler_is_never_called(self):
        with mock.patch.object(f, "run", return_value="doppler-token") as doppler, \
                mock.patch.dict(os.environ, {"NEON_API_KEY": " env-key "}, clear=True):
            self.assertEqual(f.neon_token(), "env-key")
        doppler.assert_not_called()

    def test_neon_http_failure_records_status_reason(self):
        spec = {"orgId": "org-x", "metric": "branches", "projectId": "p", "limit": 10}
        with mock.patch.object(f, "neon_token", return_value="t"), \
                mock.patch.object(f, "_http_json", return_value=None), \
                mock.patch.object(f, "LAST_HTTP_ERROR", "HTTP 401"):
            self.assertIsNone(f.c_neon(spec, 0))
        self.assertEqual(f.COLLECTOR_ERRORS["neon:branches"], "Neon API HTTP 401")

    def test_gap_row_surfaces_the_recorded_collector_reason(self):
        row = f.evaluate(RES, None, [], 0)
        self.assertEqual(row["status"], "GAP")
        self.assertEqual(row["why"], "no collector reading")
        f.COLLECTOR_ERRORS["neon:compute-hours"] = "no NEON_API_KEY on this host"
        self.assertIn("NEON_API_KEY", f.apply_collector_error(row, RES)["why"])
        # A healthy reading's row is untouched (it carries a value).
        ok = f.evaluate(RES, {"value": 1, "limit": 100}, [], 0)
        self.assertEqual(f.apply_collector_error(ok, RES), ok)


if __name__ == "__main__":
    unittest.main()

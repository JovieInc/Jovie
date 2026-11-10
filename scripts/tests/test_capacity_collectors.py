import json, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "capacity"))
import forecast as f
import collectors as fc

RES = {"id": "x", "group": "g", "label": "X", "unit": "bytes", "leadTimeHours": 7 * 24, "mode": "trend",
       "atLimit": {"effect": "deny", "note": "n"}, "collector": {"type": "disk"},
       "fix": {"escalate": {"options": [{"label": "NVMe", "cost": "$200", "lead": "3d"}], "default": "sweep", "deadlineHours": 48}}}

class CollectorUnit(unittest.TestCase):
    def test_ps_time_parsing(self):
        self.assertEqual(f._seconds("01:02"), 62)
        self.assertEqual(f._seconds("1-00:00:01"), 86401)
        self.assertEqual(f._seconds("09:10:11.50"), 33011.5)
        self.assertEqual(f._seconds("3600"), 3600)
        self.assertIsNone(f._seconds("x"))

    def test_stuck_procs_counts_old_idle_matches_only(self):
        ps = ("101 10:00:00 0:01.00 /usr/bin/codex exec -\n"
              "102 10:00:00 2:00:00 /usr/bin/codex exec -\n"
              "103 00:10:00 0:00.10 /usr/bin/codex exec -\n"
              "104 10:00:00 0:00.10 /bin/zsh\n")
        orig, plat = fc.run, fc.sys.platform
        fc.run = lambda cmd, timeout=25: ps
        f.sys.platform = "darwin"
        try:
            got = fc.c_stuck_procs({"match": r"codex exec", "maxHours": 2, "maxCpuFrac": 0.01}, 0)
        finally:
            fc.run, fc.sys.platform = orig, plat
        self.assertEqual(got["value"], 1)
        self.assertIn("pid 101", got["detail"])

    def test_access_signature_keeps_status_and_drops_noise(self):
        self.assertEqual(f.access_signature("HTTP 403 Forbidden for 123456789"), "HTTP 403 Forbidden for #")
        self.assertIsNone(f.access_signature("HTTP 403: API rate limit exceeded for installation"))
        self.assertIsNone(f.access_signature("HTTP 401', () => thing"))
        self.assertIsNone(f.access_signature("HTTP 401"))

class ResendCollector(unittest.TestCase):
    """Only authoritative account usage is a quota reading; unknown evidence stays GAP."""

    DAY_SPEC = {"type": "resend", "window": "day", "limit": 100}
    MONTH_SPEC = {"type": "resend", "window": "month", "limit": 3000}
    NOW = f.parse_iso("2026-10-31T12:00:00Z")

    def setUp(self):
        env = mock.patch.dict(os.environ, {}, clear=True)
        env.start()
        self.addCleanup(env.stop)

    @staticmethod
    def usage():
        return {"object": "usage", "emails": {
            "daily": {"used": 10, "limit": 100, "sent": 8, "received": 2,
                      "resets_at": "2026-11-01T03:15:00Z"},
            "monthly": {"used": 100, "limit": 3000, "sent": 80, "received": 20,
                        "resets_at": "2026-12-01T00:00:00Z"}}}

    def read(self, payload, spec=None, now=None):
        with mock.patch.object(fc, "run", return_value="re_fixture"), \
             mock.patch.object(fc, "_http_json", return_value=payload) as http:
            reading = fc.c_resend(spec or self.DAY_SPEC, self.NOW if now is None else now)
        return reading, http

    def test_missing_or_blank_token_is_gap_without_http(self):
        for token in [None, "", " \n"]:
            with self.subTest(token=token), mock.patch.object(fc, "run", return_value=token), \
                 mock.patch.object(fc, "_http_json") as http:
                self.assertIsNone(fc.c_resend(self.DAY_SPEC, self.NOW))
                http.assert_not_called()

    def test_authoritative_used_includes_receiving_in_both_windows(self):
        payload = self.usage()
        for window, spec, used in [("daily", self.DAY_SPEC, 70), ("monthly", self.MONTH_SPEC, 700)]:
            payload["emails"][window].update(used=used, sent=0, received=used)
            reading, http = self.read(payload, spec)
            self.assertEqual(reading, {"value": used, "limit": spec["limit"],
                                      "resetsAt": payload["emails"][window]["resets_at"]})
            http.assert_called_once_with("https://api.resend.com/usage", "re_fixture")

    def test_valid_authoritative_zero_is_measured_zero(self):
        payload = self.usage()
        payload["emails"]["daily"].update(used=0, sent=0, received=0)
        reading, http = self.read(payload)
        self.assertEqual(reading["value"], 0)
        self.assertEqual(reading["limit"], 100)
        self.assertEqual(http.call_count, 1)

    def test_sent_listing_is_not_a_total_quota_fallback(self):
        for payload in [None, {"data": [], "has_more": False},
                        {"data": [{"id": "sent", "created_at": "2026-10-31T11:00:00Z"}], "has_more": False}]:
            with self.subTest(payload=payload):
                reading, http = self.read(payload)
                self.assertIsNone(reading)
                http.assert_called_once_with("https://api.resend.com/usage", "re_fixture")

    def test_incomplete_or_malformed_usage_is_gap(self):
        invalid = [None, [], {}, {"object": "error"}, {"object": "usage"},
                   {"object": "usage", "emails": []}, {"object": "usage", "emails": {}},
                   {"object": "usage", "emails": {"daily": None}},
                   {"object": "usage", "emails": {"daily": []}}]
        for key in ["used", "limit", "sent", "received", "resets_at"]:
            payload = self.usage()
            del payload["emails"]["daily"][key]
            invalid.append(payload)
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertIsNone(self.read(payload)[0])

    def test_counts_and_limits_must_be_supported_nonnegative_integers(self):
        for key in ["used", "limit", "sent", "received"]:
            for value in [None, True, False, -1, 1.5, "1", float("nan"), float("inf"), 2 ** 53]:
                payload = self.usage()
                payload["emails"]["daily"][key] = value
                with self.subTest(key=key, value=value):
                    self.assertIsNone(self.read(payload)[0])
        payload = self.usage()
        payload["emails"]["daily"]["limit"] = 0
        self.assertIsNone(self.read(payload)[0])

    def test_unlimited_or_different_limit_is_gap_not_the_static_quota(self):
        for limit in [None, 200, 50_000]:
            payload = self.usage()
            payload["emails"]["daily"]["limit"] = limit
            with self.subTest(limit=limit):
                self.assertIsNone(self.read(payload)[0])
        for spec in [{**self.DAY_SPEC, "window": "week"}, {**self.DAY_SPEC, "window": []},
                     {**self.DAY_SPEC, "window": {}}, {**self.DAY_SPEC, "limit": True},
                     {**self.DAY_SPEC, "limit": 100.0}, {**self.DAY_SPEC, "limit": 0}]:
            with self.subTest(spec=spec):
                self.assertIsNone(self.read(self.usage(), spec)[0])

    def test_inconsistent_usage_components_are_gap(self):
        for used in [0, 9, 11]:
            payload = self.usage()
            payload["emails"]["daily"]["used"] = used
            with self.subTest(used=used):
                self.assertIsNone(self.read(payload)[0])

    def test_provider_reset_must_be_future_timezone_aware_evidence(self):
        invalid = [None, 0, "invalid", "2026-11-01T03:15:00", "2026-11-01 03:15:00Z",
                   "2026-02-31T00:00:00Z", "2026-10-31T12:00:00Z", "2026-10-30T12:00:00Z"]
        for reset in invalid:
            payload = self.usage()
            payload["emails"]["daily"]["resets_at"] = reset
            with self.subTest(reset=reset):
                self.assertIsNone(self.read(payload)[0])
        payload = self.usage()
        payload["emails"]["daily"]["resets_at"] = "2026-11-01T05:15:00+02:00"
        self.assertEqual(self.read(payload)[0]["resetsAt"], payload["emails"]["daily"]["resets_at"])

    def test_uses_provider_window_without_deriving_a_calendar_boundary(self):
        payload = self.usage()
        for now in ["2026-10-30T23:59:59Z", "2026-10-31T00:00:00Z"]:
            reading, _ = self.read(payload, now=f.parse_iso(now))
            self.assertEqual(reading["value"], 10)
            self.assertEqual(reading["resetsAt"], "2026-11-01T03:15:00Z")

    def test_environment_key_is_trimmed_without_doppler(self):
        with mock.patch.dict(os.environ, {"RESEND_READ_KEY": " re_fixture \n"}), \
             mock.patch.object(fc, "run") as doppler, \
             mock.patch.object(fc, "_http_json", return_value=self.usage()) as http:
            self.assertEqual(fc.c_resend(self.DAY_SPEC, self.NOW)["value"], 10)
        doppler.assert_not_called()
        http.assert_called_once_with("https://api.resend.com/usage", "re_fixture")

    def test_http_auth_unsupported_network_and_json_errors_are_gap(self):
        import io
        import urllib.error
        errors = [urllib.error.HTTPError("https://api.resend.com/usage", code, "secret-detail", {}, None)
                  for code in [401, 403, 404, 429, 500]] + [OSError("secret-network-detail")]
        for error in errors:
            with self.subTest(error=type(error).__name__), mock.patch.dict(os.environ, {"RESEND_READ_KEY": "re_fixture"}), \
                 mock.patch("urllib.request.urlopen", side_effect=error) as http:
                self.assertIsNone(fc.c_resend(self.DAY_SPEC, self.NOW))
                self.assertEqual(http.call_count, 1)
                self.assertEqual(http.call_args.args[0].full_url, "https://api.resend.com/usage")
                self.assertNotIn("secret", fc.LAST_HTTP_ERROR)
        with mock.patch.dict(os.environ, {"RESEND_READ_KEY": "re_fixture"}), \
             mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b"invalid-json")):
            self.assertIsNone(fc.c_resend(self.DAY_SPEC, self.NOW))

    def test_forecast_retains_reset_and_rejects_expired_or_legacy_evidence(self):
        res = {**RES, "collector": self.DAY_SPEC, "mode": "level"}
        reading = {"value": 10, "limit": 100, "resetsAt": "2026-11-01T03:15:00Z"}
        self.assertEqual(f.evaluate(res, reading, [], self.NOW)["resetsAt"], reading["resetsAt"])
        for invalid in [{"value": 0, "limit": 100}, {**reading, "resetsAt": "invalid"},
                        {**reading, "resetsAt": "2026-10-30T00:00:00Z"}, {**reading, "value": True},
                        {**reading, "limit": 0}, {**reading, "limit": 200}]:
            with self.subTest(invalid=invalid):
                self.assertEqual(f.evaluate(res, invalid, [], self.NOW)["status"], "GAP")

    def test_trend_uses_only_history_from_the_same_provider_reset_window(self):
        import io
        from contextlib import redirect_stdout
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            state.mkdir()
            res = {**RES, "host": "cloud", "collector": self.DAY_SPEC, "leadTimeHours": 24, "mode": "trend"}
            registry = {"resources": [res], "hostAliases": {"cloud": ["cloud"]}, "cloudCollector": "cloud"}
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps(registry))
            payload = self.usage()
            payload["emails"]["daily"].update(used=60, sent=40, received=20)
            reset = payload["emails"]["daily"]["resets_at"]
            samples = [{"t": f.parse_iso(at), "id": "x", "value": value, "limit": 100, "resetsAt": window}
                       for at, value, window in [
                           ("2026-10-29T00:00:00Z", 80, "2026-10-30T23:00:00Z"),
                           ("2026-10-30T00:00:00Z", 95, "2026-10-30T23:00:00Z"),
                           ("2026-10-31T00:00:00Z", 1, reset),
                           ("2026-10-31T06:00:00Z", 20, reset),
                           ("2026-10-31T11:00:00Z", 40, reset)]]
            (state / "samples.jsonl").write_text("".join(json.dumps(row) + "\n" for row in samples))
            with mock.patch.object(f, "REGISTRY", registry_path), mock.patch.object(f, "state_dir", return_value=state), \
                 mock.patch.object(fc, "_http_json", return_value=payload), \
                 mock.patch.dict(os.environ, {"RESEND_READ_KEY": "re_fixture"}), \
                 mock.patch.object(f.time, "time", return_value=self.NOW), redirect_stdout(io.StringIO()):
                self.assertEqual(f.main(["report", "--host", "cloud", "--json"]), 2)
            row = json.loads((state / "forecast.json").read_text())["rows"][0]
            self.assertEqual(row["status"], "ALARM")
            self.assertGreater(row["burnPerHour"], 0)
            self.assertLess(row["ttlHours"], 24)

    def test_collect_persists_reset_and_cached_report_expires_at_provider_reset(self):
        import io
        from contextlib import redirect_stdout
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry_path = root / "registry.json"
            res = {**RES, "host": "cloud", "collector": self.DAY_SPEC, "mode": "level"}
            registry = {"resources": [res], "hostAliases": {"cloud": ["cloud"], "gem": ["gem"]}, "cloudCollector": "cloud"}
            registry_path.write_text(json.dumps(registry))
            with mock.patch.object(f, "REGISTRY", registry_path), \
                 mock.patch.object(f, "state_dir", return_value=root / "state"), \
                 mock.patch.object(f, "alarm_feed", return_value=root / "alarms.jsonl"), \
                 mock.patch.object(f, "publish"), mock.patch.object(f, "deliver", return_value={}), \
                 mock.patch.object(fc, "_http_json", return_value=self.usage()) as http, \
                 mock.patch.dict(os.environ, {"RESEND_READ_KEY": "re_fixture", "WASTE_LOOP": "off"}), \
                 redirect_stdout(io.StringIO()), mock.patch.object(f.time, "time", return_value=self.NOW):
                self.assertEqual(f.main(["collect", "--host", "cloud", "--json"]), 0)
                sample = json.loads((root / "state/samples.jsonl").read_text().splitlines()[0])
                self.assertEqual(sample["resetsAt"], self.usage()["emails"]["daily"]["resets_at"])
                res["host"] = "remote"
                registry_path.write_text(json.dumps(registry))
                self.assertEqual(f.main(["report", "--host", "gem", "--json"]), 0)
                row = json.loads((root / "state/forecast.json").read_text())["rows"][0]
                self.assertEqual(row["resetsAt"], sample["resetsAt"])
                self.assertEqual(http.call_count, 1)
                with mock.patch.object(f.time, "time", return_value=f.parse_iso(sample["resetsAt"]) + 1):
                    self.assertEqual(f.main(["report", "--host", "gem", "--json"]), 0)
                row = json.loads((root / "state/forecast.json").read_text())["rows"][0]
                self.assertEqual(row["status"], "GAP")


class HttpJson(unittest.TestCase):
    def test_success_retains_neon_wrapper_contract_and_clears_error(self):
        import io
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b'{"data": []}')) as http:
            fc.LAST_HTTP_ERROR = "HTTP 401"
            self.assertEqual(fc._http_json("https://example.test/emails", "fake-key"), {"data": []})
        self.assertEqual(fc.LAST_HTTP_ERROR, "")
        self.assertEqual(http.call_args.kwargs, {"timeout": 20})
        self.assertEqual(http.call_args.args[0].get_header("Authorization"), "Bearer fake-key")

    def test_http_network_and_invalid_json_fail_closed_without_secret_detail(self):
        import io
        import urllib.error
        for err in [urllib.error.HTTPError("https://example.test", 401, "secret-body", {}, None),
                    OSError("secret-network-detail")]:
            with self.subTest(err=type(err).__name__), mock.patch("urllib.request.urlopen", side_effect=err):
                self.assertIsNone(fc._http_json("https://example.test/emails", "fake-key"))
                self.assertNotIn("secret", fc.LAST_HTTP_ERROR)
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b'not-json')):
            self.assertIsNone(fc._http_json("https://example.test/emails", "fake-key"))
        self.assertEqual(fc.LAST_HTTP_ERROR, "unreachable")



if __name__ == "__main__":
    unittest.main()

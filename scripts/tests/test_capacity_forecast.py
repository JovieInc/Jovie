import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "capacity"))
import forecast as f

H = 3600
RES = {"id": "x", "group": "g", "label": "X", "unit": "bytes", "leadTimeHours": 7 * 24, "mode": "trend",
       "atLimit": {"effect": "deny", "note": "n"}, "collector": {"type": "disk"},
       "fix": {"escalate": {"options": [{"label": "NVMe", "cost": "$200", "lead": "3d"}], "default": "sweep", "deadlineHours": 48}}}


class Forecast(unittest.TestCase):
    def test_slope_needs_span_and_points(self):
        self.assertIsNone(f.slope_per_hour([(0, 1), (H, 2)]))
        self.assertIsNone(f.slope_per_hour([(0, 1), (H, 2), (2 * H, 3)]))
        pts = [(i * 12 * H, i * 10.0) for i in range(8)]
        self.assertAlmostEqual(f.slope_per_hour(pts), 10 / 12, places=6)

    def test_alarm_when_ttl_inside_lead_time(self):
        hist = [(i * 12 * H, 100 + i * 12.0) for i in range(8)]  # 1 unit/hour
        row = f.evaluate(RES, {"value": 200, "limit": 300}, hist[:-1], hist[-1][0] + 12 * H)
        self.assertEqual(row["status"], "ALARM")
        self.assertAlmostEqual(row["ttlHours"], 100, delta=3)

    def test_ok_when_ttl_outside_lead_time(self):
        hist = [(i * 12 * H, 100 + i * 1.2) for i in range(8)]  # 0.1/hour
        row = f.evaluate(RES, {"value": 110, "limit": 500}, hist, hist[-1][0] + 12 * H)
        self.assertEqual(row["status"], "OK")

    def test_headroom_floor_without_history(self):
        row = f.evaluate(RES, {"value": 95, "limit": 100}, [], 0)
        self.assertEqual(row["status"], "ALARM")

    def test_at_limit_and_gap_and_stale(self):
        self.assertEqual(f.evaluate(RES, {"value": 100, "limit": 100}, [], 0)["status"], "AT-LIMIT")
        self.assertEqual(f.evaluate(RES, None, [], 0)["status"], "GAP")
        res = dict(RES, maxAgeDays=1)
        row = f.evaluate(res, {"value": 1, "limit": 100, "observedAt": "2026-01-01T00:00:00Z"}, [], f.parse_iso("2026-01-05T00:00:00Z"))
        self.assertEqual(row["status"], "STALE")

    def test_publish_is_change_only_and_never_buys(self):
        with tempfile.TemporaryDirectory() as d:
            state, feed = Path(d) / "s", Path(d) / "alarms.jsonl"
            row = f.evaluate(RES, {"value": 95, "limit": 100}, [], 0)
            reg = {"resources": [RES]}
            first = f.publish([row], reg, 0, state, feed)
            second = f.publish([row], reg, 60, state, feed)
            self.assertEqual(len(first), 1)
            self.assertEqual(second, [])
            self.assertTrue(first[0]["neverBuy"])
            self.assertIn("NVMe", first[0]["body"])
            self.assertEqual(len(feed.read_text().splitlines()), 1)

    def test_registry_is_complete(self):
        reg = json.loads(f.REGISTRY.read_text())
        ids = [r["id"] for r in reg["resources"]]
        self.assertEqual(len(ids), len(set(ids)))
        for r in reg["resources"]:
            self.assertIn(r["atLimit"]["effect"], ("pause", "deny", "crash", "bill"), r["id"])
            self.assertGreater(r["leadTimeHours"], 0, r["id"])
            self.assertIn(r["collector"]["type"], list(f.COLLECTORS) + ["none"], r["id"])
            self.assertIn(r["host"], ("gem", "mac", "air", "cloud", "any"), r["id"])
        self.assertIn(reg["cloudCollector"], reg["hostAliases"])

    def test_blind_collector_alarms_instead_of_quiet_gap(self):
        row = f.evaluate(RES, None, [], 0, blind=True)
        self.assertEqual(row["status"], "BLIND")
        self.assertIn("BLIND", f.BAD)
        card = f.card(RES, row, 0)
        self.assertIn("no spend", card["default"])
        self.assertEqual(f.evaluate(RES, None, [], 0)["status"], "GAP")

    def test_stale_projection_is_a_refresh_task_not_at_limit(self):
        res = dict(RES, maxAgeDays=3)
        reading = {"value": 14, "limit": 12, "burnPerHour": 0.1, "observedAt": "2026-10-25T00:00:00Z"}
        row = f.evaluate(res, reading, [], f.parse_iso("2026-10-31T00:00:00Z"))
        self.assertEqual(row["status"], "STALE")
        self.assertIn("refreshes", f.card(res, row, 0)["default"])

    def test_deadline_alarms_inside_lead_time_and_closes_when_done(self):
        res = dict(RES, leadTimeHours=48, warnFrac=2, mode="level")
        now = f.parse_iso("2026-10-31T00:00:00Z")
        spec = {"type": "deadline", "dueAt": "2026-11-01T00:00:00Z", "doneWhen": "submitted"}
        row = f.evaluate(res, f.c_deadline(spec, now), [], now)
        self.assertEqual(row["status"], "ALARM")
        self.assertAlmostEqual(row["ttlHours"], 24, delta=0.01)
        self.assertIn("submitted", row["detail"])
        far = f.evaluate(res, f.c_deadline(spec, now - 10 * 86400), [], now - 10 * 86400)
        self.assertEqual(far["status"], "OK")
        done = f.evaluate(res, f.c_deadline(dict(spec, doneAt="2026-10-31"), now), [], now)
        self.assertEqual(done["status"], "OK")
        late = f.evaluate(res, f.c_deadline(spec, now + 2 * 86400), [], now + 2 * 86400)
        self.assertEqual(late["status"], "AT-LIMIT")

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
        orig, plat = f.run, f.sys.platform
        f.run = lambda cmd, timeout=25: ps
        f.sys.platform = "darwin"
        try:
            got = f.c_stuck_procs({"match": r"codex exec", "maxHours": 2, "maxCpuFrac": 0.01}, 0)
        finally:
            f.run, f.sys.platform = orig, plat
        self.assertEqual(got["value"], 1)
        self.assertIn("pid 101", got["detail"])

    def test_access_gaps_need_a_repeat_and_scan_incrementally(self):
        with tempfile.TemporaryDirectory() as d:
            os_env = dict(f.os.environ)
            f.os.environ["CAPACITY_STATE"] = str(Path(d) / "state")
            try:
                log = Path(d) / "sess" / "a.jsonl"
                log.parent.mkdir()
                log.write_text('{"r":"Doppler Error: You do not have access to config prd_admin 4242"}\n'
                               '{"r":"HTTP 403 once only"}\n')
                spec = {"globs": [str(Path(d) / "*/*.jsonl")], "minRepeats": 2}
                first = f.c_access_gaps(spec, f.time.time())
                self.assertEqual(first["value"], 0)
                with open(log, "a") as fh:
                    fh.write('{"r":"Doppler Error: You do not have access to config prd_admin 9999"}\n')
                second = f.c_access_gaps(spec, f.time.time())
                self.assertEqual(second["value"], 1)
                self.assertNotIn("9999", second["gaps"][0]["sig"])
                rows = f.access_gap_rows(dict(RES, collector=dict(spec, type="access-gaps")), second, 0)
                self.assertEqual(rows[0]["status"], "AT-LIMIT")
                self.assertTrue(rows[0]["id"].startswith("x:"))
                third = f.c_access_gaps(spec, f.time.time())  # nothing new: offsets advanced, count stays
                self.assertEqual(third["gaps"][0]["count"], 2)
            finally:
                f.os.environ.clear(); f.os.environ.update(os_env)

    def test_cards_are_delivered_and_failed_deliveries_retry(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            row = f.evaluate(RES, {"value": 100, "limit": 100}, [], 0)
            card = f.card(RES, row, 0)
            down = f.deliver([card], state, "mac", 0, transport=lambda cs: [(None, "ssh:Timeout")] * len(cs))
            self.assertEqual((down["pending"], down["lastError"]), (1, "ssh:Timeout"))
            seen = []
            up = f.deliver([], state, "mac", 60, transport=lambda cs: seen.extend(cs) or [("JOV-1", None)] * len(cs))
            self.assertEqual((up["delivered"], up["pending"]), (1, 0))
            self.assertEqual(seen[0]["id"], "x")
            self.assertIn("JOV-1", (state / "deliveries.jsonl").read_text())
            self.assertIn("Default:", f.card_text(card))

    def test_new_resource_types_are_registered(self):
        reg = json.loads(f.REGISTRY.read_text())
        kinds = {r["collector"]["type"] for r in reg["resources"]}
        for k in ("gh-env-secrets", "deadline", "stuck-procs", "access-gaps"):
            self.assertIn(k, kinds)
        for r in reg["resources"]:
            if r["collector"]["type"] == "deadline":
                f.parse_iso(r["collector"]["dueAt"])
                self.assertGreater(r["warnFrac"], 1, r["id"])

    def test_access_signature_keeps_status_and_drops_noise(self):
        self.assertEqual(f.access_signature("HTTP 403 Forbidden for 123456789"), "HTTP 403 Forbidden for #")
        self.assertIsNone(f.access_signature("HTTP 403: API rate limit exceeded for installation"))
        self.assertIsNone(f.access_signature("HTTP 401', () => thing"))
        self.assertIsNone(f.access_signature("HTTP 401"))

    def test_recovery_emits_a_clear_card(self):
        with tempfile.TemporaryDirectory() as d:
            state, feed = Path(d) / "s", Path(d) / "alarms.jsonl"
            reg = {"resources": [RES]}
            f.publish([f.evaluate(RES, {"value": 100, "limit": 100}, [], 0)], reg, 0, state, feed)
            cleared = f.publish([f.evaluate(RES, {"value": 1, "limit": 100}, [], 0)], reg, 60, state, feed)
            self.assertEqual([(c["id"], c.get("clear")) for c in cleared], [("x", True)])


if __name__ == "__main__":
    unittest.main()

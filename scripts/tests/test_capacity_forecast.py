import json, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

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
            expected_effects = ("bill",) if r["id"] == "neon-spend" else ("pause", "deny", "crash")
            self.assertIn(r["atLimit"]["effect"], expected_effects, r["id"])
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


class CapacityLifecycle(unittest.TestCase):
    ACCESS = dict(RES, id="access", mode="level", collector={"type": "access-gaps", "minRepeats": 2})

    def snapshot(self, spec, now):
        reading = f.c_access_gaps(spec, now)
        return [f.evaluate(self.ACCESS, reading, [], now)] + f.access_gap_rows(self.ACCESS, reading, now)

    def test_expired_dynamic_gap_clears_once_after_collector_recovers(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            state, feed = root / "state", root / "feed"
            log = root / "session.jsonl"
            log.write_text('HTTP 403 Forbidden fixture\n' * 2)
            now = f.time.time()
            spec = {"globs": [str(log)], "windowHours": 1, "minRepeats": 2}
            with mock.patch.object(f, "state_dir", return_value=state):
                reg = {"resources": [self.ACCESS]}
                opened = f.publish(self.snapshot(spec, now), reg, now, state, feed)
                self.assertEqual(len(opened), 1)
                gap_id = opened[0]["id"]
                # Missing/failed collection is not proof that the denial resolved.
                for rows in [[], [f.evaluate(self.ACCESS, None, [], now + 1, blind=True)]]:
                    self.assertFalse(any(c.get("clear") for c in f.publish(rows, reg, now + 1, state, feed)))
                recovered = self.snapshot(spec, now + 2 * H)
                cleared = f.publish(recovered, reg, now + 2 * H, state, feed)
                self.assertIn(gap_id, [c["id"] for c in cleared if c.get("clear")])
                self.assertEqual(f.publish(recovered, reg, now + 2 * H + 1, state, feed), [])

    def test_card_limit_never_clears_an_active_gap(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            state, feed = root / "state", root / "feed"
            log = root / "session.jsonl"
            log.write_text('HTTP 403 Forbidden alpha\n' * 2)
            now = f.time.time()
            spec = {"globs": [str(log)], "minRepeats": 2, "maxCards": 1}
            reg = {"resources": [self.ACCESS]}
            with mock.patch.object(f, "state_dir", return_value=state):
                first = f.publish(self.snapshot(spec, now), reg, now, state, feed)
                with log.open("a") as fh:
                    fh.write('HTTP 403 Forbidden beta\n' * 3)
                next_cards = f.publish(self.snapshot(spec, now + 1), reg, now + 1, state, feed)
                self.assertEqual(len(next_cards), 1)
                self.assertFalse(next_cards[0].get("clear"))
                # The hidden alarm must remain tracked until a complete scan clears it.
                self.assertEqual(json.loads((state / "alarm-status.json").read_text())[first[0]["id"]], "AT-LIMIT")
                self.assertEqual(f.publish(self.snapshot(spec, now + 2), reg, now + 2, state, feed), [])

    def test_missing_parent_evidence_does_not_clear_legacy_gap(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            (state / "alarm-status.json").write_text(json.dumps({"access:old": "AT-LIMIT"}))
            parent = f.evaluate(self.ACCESS, {"value": 0, "limit": 1000}, [], 0)
            cards = f.publish([parent], {"resources": [self.ACCESS]}, 0, state, state / "feed")
            self.assertEqual(cards, [])
            self.assertEqual(json.loads((state / "alarm-status.json").read_text())["access:old"], "AT-LIMIT")

    def test_clear_supersedes_failed_alarm_and_cannot_reopen_it(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            alarm = f.card(RES, f.evaluate(RES, {"value": 100, "limit": 100}, [], 0), 0)
            f.deliver([alarm], state, "fixture", 0, transport=lambda cs: [(None, "down")] * len(cs))
            clear = {"kind": "capacity-clear", "id": "x", "at": f.iso(60), "clear": True}
            observed = []
            def partial(cs):
                observed.extend(cs)
                return [("none-open", None) if c.get("clear") else (None, "down") for c in cs]
            result = f.deliver([clear], state, "fixture", 60, transport=partial)
            self.assertEqual([c["kind"] for c in observed], ["capacity-clear"])
            self.assertEqual(result["pending"], 0)
            unexpected = mock.Mock(side_effect=AssertionError("resolved alarm retried"))
            self.assertEqual(f.deliver([], state, "fixture", 120, transport=unexpected)["delivered"], 0)
            unexpected.assert_not_called()

    def test_new_alarm_supersedes_failed_clear_without_dropping_other_resources(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            clear = {"kind": "capacity-clear", "id": "x", "at": f.iso(0), "clear": True}
            other = dict(clear, id="other")
            f.deliver([clear, other], state, "fixture", 0, transport=lambda cs: [(None, "down")] * len(cs))
            alarm = f.card(RES, f.evaluate(RES, {"value": 100, "limit": 100}, [], 60), 60)
            observed = []
            f.deliver([alarm], state, "fixture", 60,
                      transport=lambda cs: observed.extend(cs) or [("FIXTURE", None)] * len(cs))
            self.assertEqual(len(observed), 2)
            self.assertEqual({c["id"]: c["kind"] for c in observed},
                             {"x": "capacity-escalation", "other": "capacity-clear"})

    def test_invalid_resend_collect_is_blind_and_neon_error_survives(self):
        res = dict(RES, collector={"type": "resend", "limit": 100})
        self.assertEqual(f.evaluate(res, {"value": 0, "limit": 100}, [], 0, blind=True)["status"], "BLIND")
        neon = dict(RES, collector={"type": "neon", "metric": "spend"})
        with mock.patch.dict(f.COLLECTOR_ERRORS, {"neon:spend": "HTTP 403"}, clear=True):
            row = f.apply_collector_error(f.evaluate(neon, None, [], 0, blind=True), neon)
        self.assertEqual((row["status"], row["why"]), ("BLIND", "HTTP 403"))

    def test_collect_delivers_recovery_and_retains_waste_pass(self):
        import io
        from contextlib import redirect_stdout
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            state = root / "state"
            state.mkdir()
            (state / "alarm-status.json").write_text(json.dumps({"access:old": "AT-LIMIT"}))
            res = dict(self.ACCESS, host="cloud")
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({"resources": [res], "hostAliases": {"fixture": ["fixture"]},
                                                 "cloudCollector": "fixture"}))
            waste = SimpleNamespace(run_pass=mock.Mock())
            reading = {"value": 0, "limit": 1000, "gaps": [], "activeGapKeys": []}
            with mock.patch.object(f, "REGISTRY", registry_path), \
                 mock.patch.object(f, "state_dir", return_value=state), \
                 mock.patch.object(f, "alarm_feed", return_value=root / "feed"), \
                 mock.patch.dict(f.COLLECTORS, {"access-gaps": lambda spec, now: reading}), \
                 mock.patch.dict(sys.modules, {"waste": waste}), \
                 mock.patch.dict(os.environ, {"WASTE_LOOP": "on"}), \
                 mock.patch.object(f, "deliver", return_value={"delivered": 1}) as deliver, \
                 redirect_stdout(io.StringIO()):
                self.assertEqual(f.main(["collect", "--host", "fixture", "--json"]), 0)
            self.assertEqual([(c["id"], c.get("clear")) for c in deliver.call_args.args[0]], [("access:old", True)])
            waste.run_pass.assert_called_once_with()
            self.assertEqual(json.loads((state / "forecast.json").read_text())["delivery"], {"delivered": 1})

    def test_unreadable_or_corrupt_gap_history_is_not_recovery(self):
        for fault in ("corrupt", "invalid-row", "unreadable", "missing"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as d:
                state = Path(d)
                offsets = state / "access-gap-offsets.json"
                offsets.write_text('{"fixture-transcript": 100}')
                seen = state / "access-gap-seen.jsonl"
                contents = 'not json\n' if fault == "corrupt" else '{"t": 0}\n'
                if fault != "missing":
                    seen.write_text(contents)
                (state / "alarm-status.json").write_text(json.dumps({"access:old": "AT-LIMIT"}))
                read_text = Path.read_text
                def read(path, *args, **kwargs):
                    if path == seen and fault == "unreadable":
                        raise PermissionError("fixture")
                    return read_text(path, *args, **kwargs)
                with mock.patch.object(f, "state_dir", return_value=state), \
                     mock.patch.object(Path, "read_text", read):
                    reading = f.c_access_gaps({"globs": []}, 2 * H)
                self.assertIsNone(reading)
                row = f.evaluate(self.ACCESS, reading, [], 2 * H, blind=True)
                cards = f.publish([row], {"resources": [self.ACCESS]}, 2 * H, state, state / "feed")
                self.assertFalse(any(c.get("clear") for c in cards))
                self.assertEqual(offsets.read_text(), '{"fixture-transcript": 100}')
                if fault != "missing":
                    self.assertEqual(seen.read_text(), contents)

    def test_failed_tracker_lookup_retries_clear_and_error_does_not_leak_to_next_lookup(self):
        from types import SimpleNamespace
        tracker = SimpleNamespace(existing_error=None, close=mock.Mock(return_value=True))
        calls = []
        def existing(key):
            calls.append(key)
            if len(calls) == 1:
                tracker.existing_error = "fixture query unavailable"
                return None
            return "FIXTURE-1" if key == "capacity:x" else None
        tracker.existing = existing
        doctor = SimpleNamespace(Tracker=lambda linear, host: tracker)
        lane = SimpleNamespace(Linear=lambda env: object(), Host=lambda: SimpleNamespace(linear_env={}), HOST="fixture")
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(sys.modules, {"doctor": doctor, "lane_runner": lane}):
            state = Path(d)
            clear = {"kind": "capacity-clear", "id": "x", "at": f.iso(0), "clear": True}
            first = f.deliver([clear, dict(clear, id="other")], state, "fixture", 0, transport=f.tracker_transport)
            self.assertEqual((first["delivered"], first["pending"]), (1, 1))
            tracker.close.assert_not_called()
            second = f.deliver([], state, "fixture", 60, transport=f.tracker_transport)
            self.assertEqual((second["delivered"], second["pending"]), (1, 0))
            tracker.close.assert_called_once_with("FIXTURE-1", "capacity:x")

    def test_unreadable_transcript_metadata_preserves_history_and_alarm(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            state = root / "state"
            state.mkdir()
            log = root / "session.jsonl"
            log.write_text("HTTP 403 Forbidden fixture\n")
            seen = state / "access-gap-seen.jsonl"
            seen.write_text(json.dumps({"t": 0, "sig": "HTTP 403 Forbidden fixture", "src": "fixture"}) + "\n")
            offsets = state / "access-gap-offsets.json"
            offsets.write_text(json.dumps({str(log): log.stat().st_size}))
            before = (seen.read_bytes(), offsets.read_bytes())
            (state / "alarm-status.json").write_text(json.dumps({"access:old": "AT-LIMIT"}))
            stat = os.stat
            def unavailable(path, *args, **kwargs):
                if str(path) == str(log):
                    raise PermissionError("fixture stat unavailable")
                return stat(path, *args, **kwargs)
            with mock.patch.object(f, "state_dir", return_value=state), mock.patch.object(f.os, "stat", unavailable):
                reading = f.c_access_gaps({"globs": [str(log)], "windowHours": 1}, 2 * H)
            self.assertIsNone(reading)
            self.assertEqual((seen.read_bytes(), offsets.read_bytes()), before)
            cards = f.publish([f.evaluate(self.ACCESS, reading, [], 2 * H, blind=True)],
                              {"resources": [self.ACCESS]}, 2 * H, state, state / "feed")
            self.assertFalse(any(c.get("clear") for c in cards))


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
        with mock.patch.object(f, "run", return_value="re_fixture"), \
             mock.patch.object(f, "_http_json", return_value=payload) as http:
            reading = f.c_resend(spec or self.DAY_SPEC, self.NOW if now is None else now)
        return reading, http

    def test_missing_or_blank_token_is_gap_without_http(self):
        for token in [None, "", " \n"]:
            with self.subTest(token=token), mock.patch.object(f, "run", return_value=token), \
                 mock.patch.object(f, "_http_json") as http:
                self.assertIsNone(f.c_resend(self.DAY_SPEC, self.NOW))
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
             mock.patch.object(f, "run") as doppler, \
             mock.patch.object(f, "_http_json", return_value=self.usage()) as http:
            self.assertEqual(f.c_resend(self.DAY_SPEC, self.NOW)["value"], 10)
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
                self.assertIsNone(f.c_resend(self.DAY_SPEC, self.NOW))
                self.assertEqual(http.call_count, 1)
                self.assertEqual(http.call_args.args[0].full_url, "https://api.resend.com/usage")
                self.assertNotIn("secret", f.LAST_HTTP_ERROR)
        with mock.patch.dict(os.environ, {"RESEND_READ_KEY": "re_fixture"}), \
             mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b"invalid-json")):
            self.assertIsNone(f.c_resend(self.DAY_SPEC, self.NOW))

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
                 mock.patch.object(f, "_http_json", return_value=payload), \
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
                 mock.patch.object(f, "_http_json", return_value=self.usage()) as http, \
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
            f.LAST_HTTP_ERROR = "HTTP 401"
            self.assertEqual(f._http_json("https://example.test/emails", "fake-key"), {"data": []})
        self.assertEqual(f.LAST_HTTP_ERROR, "")
        self.assertEqual(http.call_args.kwargs, {"timeout": 20})
        self.assertEqual(http.call_args.args[0].get_header("Authorization"), "Bearer fake-key")

    def test_http_network_and_invalid_json_fail_closed_without_secret_detail(self):
        import io
        import urllib.error
        for err in [urllib.error.HTTPError("https://example.test", 401, "secret-body", {}, None),
                    OSError("secret-network-detail")]:
            with self.subTest(err=type(err).__name__), mock.patch("urllib.request.urlopen", side_effect=err):
                self.assertIsNone(f._http_json("https://example.test/emails", "fake-key"))
                self.assertNotIn("secret", f.LAST_HTTP_ERROR)
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b'not-json')):
            self.assertIsNone(f._http_json("https://example.test/emails", "fake-key"))
        self.assertEqual(f.LAST_HTTP_ERROR, "unreachable")


if __name__ == "__main__":
    unittest.main()

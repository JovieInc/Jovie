"""Inactive native event admission; private metadata never replaces the authoritative queue."""
from __future__ import annotations

import importlib
import io
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

fixtures = importlib.import_module("scripts.tests.test_reason_dispatch")
reason = fixtures.reason


class ReasonEventTest(unittest.TestCase):
    installed = fixtures.IndependentWakeTest.installed

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.host = SimpleNamespace(state=self.root)
        self.api = SimpleNamespace(HOST="fixture", Locked=fixtures.lane.Locked,
                                   disk_guard=SimpleNamespace(check=lambda _: {"admitted": True}))
        environment = patch.dict(os.environ, {"LANES_REASON_WAKE": "1", "LANES_SELFTEST": "",
                                              "LANES_EXECUTION_BACKEND": ""})
        environment.start()
        self.addCleanup(environment.stop)
        self.real_tick = reason.tick
        native = patch.object(reason, "tick", return_value={"status": "idle"})
        self.native = native.start()
        self.addCleanup(native.stop)
        self.wake_launches = []
        original = reason._reason_dispatch.schedule_tick
        scheduler = patch.object(reason._reason_dispatch, "schedule_tick",
                                 side_effect=lambda host, api, spawn=None: original(host, api, spawn=self.capture_wake))
        scheduler.start()
        self.addCleanup(scheduler.stop)

    def capture_wake(self, args, **kwargs):
        probe = fixtures.lane.Locked(self.root / "reason-events.lock", blocking=False)
        try:
            self.wake_launches.append((args, kwargs, os.environ.get("LANES_REASON_WAKE"), probe.held))
        finally:
            probe.release()
        return SimpleNamespace(pid=123)

    def event(self, **changes):
        row = {"schema": "jovie.reason-event/v1", "issueId": "12345678-1234-4234-8234-123456789abc",
               "issueIdentifier": "JOV-1", "issueUpdatedAt": "2026-11-17T01:00:00.000000Z",
               "deliveryId": "a" * 64, "providerAt": "2026-11-17T01:00:01.000000Z",
               "receivedAt": "2026-11-17T01:00:04.000000Z", **changes}
        path = self.root / (row["deliveryId"] + ".json")
        path.write_text(json.dumps(row))
        path.chmod(0o600)
        return path

    def tick(self, path=None, factory=None):
        factory = factory or (lambda: self.fail("test queue transport must remain mocked"))
        return reason.checked_tick(self.host, self.api, factory, event_file=path)

    def test_event_adapter_is_inactive_without_opt_in(self):
        with patch.dict(os.environ, {"LANES_REASON_WAKE": ""}):
            receipt = self.tick(self.event())
        self.native.assert_not_called()
        self.assertEqual(receipt["status"], "blocked")
        self.assertTrue(receipt["owner"])
        self.assertTrue(receipt["nextAction"])

    def test_installer_defaults_inactive_preserves_operator_units_and_pairs_opt_in_backstop(self):
        original = fixtures.subprocess.run
        for platform in ("Linux", "Darwin"):
            for enabled, sentinel in ((None, False), (None, True), ("1", False), ("1", True)):
                def run(args, **kwargs):
                    root = Path(args[1]).parent
                    target = (root / "units/jovie-lanes-reason.service" if platform == "Linux"
                              else root / "plists/com.jovie.lanes-reason.plist")
                    if sentinel:
                        target.write_text("operator-owned sentinel\n")
                    return original(args, **kwargs)
                with self.subTest(platform=platform, enabled=enabled, sentinel=sentinel), \
                        patch.object(fixtures.subprocess, "run", side_effect=run), self.installed(platform, enabled=enabled) as fixture:
                    commands = (fixture.root / "commands").read_text()
                    target = (fixture.units / "jovie-lanes-reason.service" if platform == "Linux"
                              else fixture.plists / "com.jovie.lanes-reason.plist")
                    active = ("--user enable --now jovie-lanes-reason.timer" in commands if platform == "Linux"
                              else "launchctl load " + str(target) in commands)
                    self.assertEqual(active, enabled == "1" and not sentinel)
                    if sentinel:
                        self.assertEqual(target.read_text(), "operator-owned sentinel\n")
                    if enabled == "1" and sentinel:
                        self.assertNotEqual(fixture.result.returncode, 0)
                        continue
                    self.assertEqual(fixture.result.returncode, 0, fixture.result.stderr)
                    if enabled is None:
                        self.assertEqual(target.exists(), sentinel)
                        continue
                    if platform == "Linux":
                        service = target.read_text()
                        self.assertIn("/current/reason_lane.py tick", service)
                        self.assertNotIn("reconcile", service)
                        self.assertIn("KillMode=process", service)
                        self.assertIn("Environment=LANES_REASON_WAKE=1", service)
                    repeated = original(["/bin/bash", str(fixture.installer)], env=fixture.env,
                                        capture_output=True, text=True, timeout=10)
                    self.assertEqual(repeated.returncode, 0, repeated.stderr)

    def test_duplicate_revision_coalesces_but_new_revision_rechecks_authoritative_queue(self):
        first = self.tick(self.event())
        duplicate = self.tick(self.event(deliveryId="b" * 64, issueUpdatedAt="2026-11-17T01:00:00Z"))
        self.assertEqual(first["status"], "idle")
        self.assertEqual(duplicate["status"], "coalesced")
        self.assertEqual(duplicate["priorCheckId"], first["checkId"])
        self.assertEqual(self.native.call_count, 1)
        revised = self.tick(self.event(deliveryId="c" * 64, issueUpdatedAt="2026-11-17T01:00:02.000000Z"))
        self.assertEqual(revised["status"], "idle")
        self.assertEqual(self.native.call_count, 2)

    def test_malformed_oversized_and_symlink_metadata_hold_before_queue(self):
        cases = ("malformed", "oversized", "symlink", "writable", "revision", "provider-time", "extra-field")
        for case in cases:
            with self.subTest(case=case):
                path = self.event()
                if case == "malformed":
                    path.write_text("{")
                elif case == "oversized":
                    path.write_text(" " * 4097)
                elif case == "symlink":
                    target = self.root / "target.json"
                    path.rename(target)
                    path.symlink_to(target)
                elif case == "writable":
                    path.chmod(0o666)
                elif case == "revision":
                    path = self.event(issueUpdatedAt="not-a-revision")
                elif case == "provider-time":
                    path = self.event(providerAt="not-a-time")
                else:
                    path = self.event(command="do not execute")
                receipt = self.tick(path)
                self.assertEqual(receipt["status"], "blocked")
                self.assertTrue(receipt["owner"])
                self.assertTrue(receipt["nextAction"])
                self.native.assert_not_called()
                path.unlink()


    def test_event_cli_keeps_existing_lifecycle_guard_and_passes_metadata_only(self):
        lane = fixtures.lane
        path = self.event()
        def checked(*args, **kwargs):
            self.assertEqual(Path(kwargs["event_file"]), path)
            with (self.root / "lifecycle.lock").open("a+") as lock:
                with self.assertRaises(BlockingIOError):
                    lane.fcntl.flock(lock, lane.fcntl.LOCK_EX | lane.fcntl.LOCK_NB)
            return {"status": "idle"}
        with patch.dict("sys.modules", {"lane_runner": lane}), patch.object(lane, "Host", return_value=self.host), \
                patch.object(lane, "load_github_env"), patch.object(reason, "checked_tick", side_effect=checked) as call, \
                patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(reason.main(["tick", "--event-file", str(path)]), 0)
            call.assert_called_once()

    def test_backstop_recovers_an_interrupted_event_check_and_never_calls_spawn_complete(self):
        path = self.event()
        event_key = reason._reason_dispatch.event_key(json.loads(path.read_text()))
        pending = self.root / "reason-events/pending" / (event_key + ".json")
        checked = self.root / "reason-events/checked" / (event_key + ".json")
        self.native.side_effect = KeyboardInterrupt("event activation process lost")
        with self.assertRaises(KeyboardInterrupt):
            self.tick(path)
        probe = fixtures.lane.Locked(self.root / "reason-events.lock", blocking=False)
        try:
            self.assertTrue(probe.held, "interrupted check retained the metadata lock")
        finally:
            probe.release()
        self.assertEqual(json.loads(pending.read_text())["disposition"], "checking")
        self.assertFalse(checked.exists())
        self.native.side_effect = None
        self.native.return_value = {"status": "spawned", "queued": 1}
        receipt = self.tick()
        self.assertEqual(receipt["status"], "spawned")
        self.assertEqual(self.native.call_count, 2)
        self.assertIn("accepted run-lease", receipt["nextAction"])
        self.assertEqual(json.loads(checked.read_text())["disposition"], "checked")
        self.assertFalse(pending.exists())

    def test_dependency_block_is_retried_by_backstop_with_the_same_guards(self):
        self.native.side_effect = RuntimeError("queue dependency unavailable")
        blocked = self.tick(self.event())
        self.assertEqual((blocked["status"], blocked["owner"]), ("blocked", "reason-lane"))
        self.assertTrue(blocked["nextAction"])
        self.native.side_effect = None
        self.api.disk_guard.check = lambda _: {"admitted": False}
        held = self.tick()
        self.assertEqual(held["status"], "blocked")
        self.assertEqual(self.native.call_count, 1)
        self.api.disk_guard.check = lambda _: {"admitted": True}
        self.assertEqual(self.tick()["status"], "idle")
        self.assertEqual(self.native.call_count, 2)

    def test_event_intervals_and_queue_execution_keep_distinct_unqualified_timestamps(self):
        module = reason._reason_dispatch
        start, finish = "2026-11-19T01:00:10.000000Z", "2026-11-19T01:00:13.000000Z"
        with patch.object(module, "now_iso", return_value=start) as clock:
            def check(*args, **kwargs):
                clock.return_value = finish
                return {"status": "idle"}
            self.native.side_effect = check
            receipt = self.tick(self.event())
        event = receipt["events"][0]
        self.assertEqual(event["timing"], {
            "providerToReceived": {"enteredAt": "2026-11-17T01:00:01.000000Z",
                                   "exitedAt": "2026-11-17T01:00:04.000000Z", "qualified": False},
            "receivedToCheck": {"enteredAt": "2026-11-17T01:00:04.000000Z",
                                "exitedAt": start, "qualified": False},
            "qualification": "native-producer-unverified"})
        self.assertEqual((receipt["startedAt"], receipt["observedAt"]), (start, finish))
        self.assertEqual(json.loads((self.root / "runs/reason-checks/2026-11-19.jsonl").read_text()), receipt)

    def test_missing_optional_timestamps_never_become_qualified_dwell(self):
        receipt = self.tick(self.event(providerAt=None, receivedAt=None))
        self.assertEqual(receipt["status"], "idle")
        timing = receipt["events"][0]["timing"]
        for field in ("providerToReceived", "receivedToCheck"):
            self.assertFalse(timing[field]["qualified"])
            self.assertIsNone(timing[field]["enteredAt"])


    def test_foreign_owned_metadata_is_held_before_queue(self):
        path = self.event()
        module = reason._reason_dispatch
        original = module.lifecycle._read_regular
        def read(candidate, *args, **kwargs):
            raw, info = original(candidate, *args, **kwargs)
            if Path(candidate) == path:
                values = {field: getattr(info, field) for field in dir(info) if field.startswith("st_")}
                values["st_uid"] = os.getuid() + 1
                info = SimpleNamespace(**values)
            return raw, info
        with patch.object(module.lifecycle, "_read_regular", side_effect=read):
            receipt = self.tick(path)
        self.assertEqual(receipt["status"], "blocked")
        self.assertTrue(receipt["owner"])
        self.assertTrue(receipt["nextAction"])
        self.native.assert_not_called()


    def test_corrupt_checked_control_never_coalesces_as_a_success(self):
        path = self.event()
        self.tick(path)
        key = reason._reason_dispatch.event_key(json.loads(path.read_text()))
        checked = self.root / "reason-events/checked" / (key + ".json")
        valid = json.loads(checked.read_text())
        for field, value in (("status", "complete"), ("status", "running"), ("disposition", "checking"),
                             ("checkId", "bad"), ("observedAt", "2026-11-17T01:00:00")):
            with self.subTest(field=field):
                checked.write_text(json.dumps({**valid, field: value}))
                checked.chmod(0o600)
                receipt = self.tick(path)
                self.assertEqual(receipt["status"], "blocked")
                self.assertTrue(receipt["owner"])
                self.assertTrue(receipt["nextAction"])
                self.assertEqual(self.native.call_count, 1)


    def test_event_result_fsync_failure_blocks_then_normal_backstop_recovers(self):
        module = reason._reason_dispatch
        original = module._event_write
        def write(*args):
            with patch.object(module.os, "fsync", side_effect=OSError("event result fsync failed")):
                return original(*args)
        with patch.object(module, "_event_write", side_effect=write):
            receipt = self.tick(self.event())
        self.assertEqual(receipt["status"], "blocked")
        self.assertTrue(receipt["owner"] and receipt["nextAction"])
        self.native.assert_not_called()
        self.assertEqual(self.tick()["status"], "idle")
        self.native.assert_called_once()

    def test_distinct_event_refreshes_a_warm_empty_queue_even_when_drain_is_busy(self):
        lane = fixtures.lane
        for busy in (False, True):
            with self.subTest(busy=busy), patch.dict("sys.modules", {"lane_runner": lane}), \
                    patch.object(lane, "SHARED_CACHE_DIR", self.root / f"cache-{busy}"):
                linear = fixtures.reason_fixtures.FakeLinear()
                queued = {"id": "i-1", "identifier": "JOV-1", "title": "research", "createdAt": "1",
                          "description": fixtures.reason_fixtures.description()}
                spawned = []
                self.native.side_effect = lambda host, api, factory, **kwargs: self.real_tick(
                    host, api, factory, fixtures.CONFIG, spawn=lambda args, **kw: spawned.append(args), **kwargs)
                with patch.object(linear, "gql", wraps=linear.gql) as request:
                    self.assertEqual(reason.queued_jobs(linear, fixtures.CONFIG["label"]), [])
                    linear.jobs = [queued]
                    self.assertEqual(reason.queued_jobs(linear, fixtures.CONFIG["label"]), [])
                    self.assertEqual(request.call_count, 1, "ordinary reads must retain the existing cache")
                    active = lane.Locked(self.root / "reason.lock", blocking=False) if busy else None
                    try:
                        event = self.event(issueUpdatedAt=f"2026-11-17T01:00:0{int(busy)}Z")
                        receipt = self.tick(event, factory=lambda: linear)
                        self.assertEqual(receipt["status"], "running" if busy else "spawned")
                        self.assertEqual(request.call_count, 2, "event must reread through the same client even while busy")
                        self.assertEqual(reason.queued_jobs(linear, fixtures.CONFIG["label"]), [queued])
                        self.assertEqual(request.call_count, 2, "the active drain must see the refreshed cache")
                    finally:
                        if active is not None:
                            active.release()
                    if busy:
                        self.real_tick(self.host, self.api, lambda: linear, fixtures.CONFIG,
                                       spawn=lambda args, **kw: spawned.append(args))
                    self.assertEqual(len(spawned), 1)
                    self.assertEqual(spawned[0][-1], "drain")


    def test_corrupt_pending_duplicate_stays_held_and_preserves_evidence(self):
        path = self.event()
        self.native.side_effect = RuntimeError("queue unavailable")
        self.tick(path)
        key = reason._reason_dispatch.event_key(json.loads(path.read_text()))
        pending = self.root / "reason-events/pending" / (key + ".json")
        corrupt = '{"schema":"unowned-corrupt-prior"}'
        pending.write_text(corrupt)
        self.native.side_effect = None
        receipt = self.tick(path)
        self.assertEqual(receipt["status"], "blocked")
        self.assertTrue(receipt["owner"] and receipt["nextAction"])
        self.assertEqual(pending.read_text(), corrupt)
        self.assertEqual(self.native.call_count, 1)

    def test_final_empty_drain_read_and_event_finish_both_handoff_without_a_timer(self):
        module, lane = reason._reason_dispatch, fixtures.lane
        source = {"producer": "scripts/lanes/reason_dispatch.py", "status": "available",
                  "sourceCommit": "a" * 40, "bundleDigest": "b" * 64, "laneTree": "c" * 40}
        for release_early in (False, True):
            with self.subTest(release_early=release_early), patch.object(module, "source_provenance", return_value=source), \
                    patch.object(lane, "SHARED_CACHE_DIR", self.root / f"handoff-cache-{release_early}"), \
                    patch.dict("sys.modules", {"lane_runner": lane}), patch.object(reason, "healthy", return_value=True):
                final_read, release = threading.Event(), threading.Event()
                linear = fixtures.reason_fixtures.FakeLinear()
                self.host.linear_env = self.root / "env"
                self.api.Linear = lambda _: linear
                self.api.LinearRateLimited = lane.LinearRateLimited
                outcomes, errors, drains = [], [], []
                self.wake_launches.clear()
                def locked(path, blocking):
                    lock = lane.Locked(path, blocking=blocking)
                    def close():
                        if path.name == "reason.lock" and threading.current_thread() is worker and lock.held:
                            final_read.set()
                            if not release.wait(5):
                                raise AssertionError("test did not release the final drain read")
                        lock.release()
                    return SimpleNamespace(held=lock.held, release=close)
                self.api.Locked = locked
                def drain():
                    try:
                        outcomes.append(reason.drain(self.host, self.api, fixtures.CONFIG))
                    except BaseException as error:
                        errors.append(error)
                worker = threading.Thread(target=drain)
                def checked(host, api, factory, **kwargs):
                    result = self.real_tick(host, api, factory, fixtures.CONFIG,
                                            spawn=lambda args, **kw: drains.append(args), **kwargs)
                    if release_early:
                        release.set()
                        worker.join(5)
                        self.assertFalse(worker.is_alive())
                    return result
                self.native.side_effect = checked
                worker.start()
                try:
                    self.assertTrue(final_read.wait(5), "drain never reached its final empty read")
                    linear.jobs = [{"id": "i", "identifier": "JOV-1", "title": "research", "createdAt": "1",
                                    "description": fixtures.reason_fixtures.description()}]
                    path = self.event(issueUpdatedAt=f"2026-11-17T01:00:0{2 + int(release_early)}Z")
                    receipt = self.tick(path, factory=lambda: linear)
                    self.assertEqual(receipt["status"], "running")
                    key = module.event_key(json.loads(path.read_text()))
                    pending = self.root / "reason-events/pending" / (key + ".json")
                    self.assertTrue(pending.exists())
                    self.assertFalse((self.root / "reason-events/checked" / pending.name).exists())
                finally:
                    release.set()
                    worker.join(5)
                self.assertFalse(worker.is_alive())
                self.assertFalse(errors, errors)
                self.assertEqual(outcomes, [{"status": "idle", "done": []}])
                self.assertTrue(self.wake_launches, "neither event finish nor drain exit requested a tick")
                self.assertTrue(all(args[-1] == "tick" and env == "1" for args, _, env, _ in self.wake_launches))
                self.assertTrue(any(free for _, _, _, free in self.wake_launches), "no tick requested after metadata unlock")
                child = self.tick(factory=lambda: linear)
                self.assertEqual(child["status"], "spawned")
                self.assertEqual(len(drains), 1)
                self.assertFalse(pending.exists())

    def test_handoff_preserves_absent_or_explicitly_disabled_opt_in(self):
        module = reason._reason_dispatch
        source = {"producer": "scripts/lanes/reason_dispatch.py", "status": "available",
                  "sourceCommit": "a" * 40, "bundleDigest": "b" * 64, "laneTree": "c" * 40}
        self.native.return_value = {"status": "running"}
        active = fixtures.lane.Locked(self.root / "reason.lock", blocking=False)
        try:
            with patch.object(module, "source_provenance", return_value=source):
                self.tick(self.event())
        finally:
            active.release()
        for enabled in (None, "0"):
            with self.subTest(enabled=enabled), patch.object(module, "source_provenance", return_value=source), \
                    patch.dict(os.environ, {"LANES_REASON_WAKE": enabled or ""}):
                if enabled is None:
                    os.environ.pop("LANES_REASON_WAKE")
                receipt = module.wake_pending(self.host, self.api, spawn=self.capture_wake)
                self.assertEqual((receipt["schema"], receipt["status"]), ("jovie.reason-handoff/v1", "blocked"))
                self.assertTrue(receipt["owner"] and receipt["nextAction"])
        self.assertFalse(self.wake_launches)

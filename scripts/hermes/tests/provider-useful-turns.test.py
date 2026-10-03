#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/provider_useful_turns.py"
GENERATOR = ROOT / "scripts/hermes/gem-concurrency-evidence.py"
SERVICE = ROOT / "scripts/hermes/systemd/symphony-concurrency-controller.service"
SPEC = importlib.util.spec_from_file_location("provider_useful_turns", SOURCE)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
sys.path.insert(0, str(GENERATOR.parent))
GENERATOR_SPEC = importlib.util.spec_from_file_location(
    "gem_concurrency_evidence", GENERATOR
)
assert GENERATOR_SPEC is not None and GENERATOR_SPEC.loader is not None
GENERATOR_MODULE = importlib.util.module_from_spec(GENERATOR_SPEC)
GENERATOR_SPEC.loader.exec_module(GENERATOR_MODULE)

NOW = datetime(2026, 9, 4, 14, 0, tzinfo=timezone.utc)
DEFAULT_PROFILE = MODULE.profile_identity("openai", "meetjovie")


def turn(
    *,
    profile: str = DEFAULT_PROFILE,
    provider: str = "openai",
    model: str = "gpt-5.6-sol",
    completed: datetime = NOW,
    **overrides,
) -> dict:
    value = {
        "schema": MODULE.TURN_SCHEMA,
        "provider": provider,
        "profile": profile,
        "model": model,
        "completedAt": MODULE.isoformat(completed),
        "rc": 0,
        "useful": True,
        "outputDigest": "a" * 64,
        "outputBytes": 12,
        "tokens": {"input": 20, "output": 4, "total": 24},
    }
    value.update(overrides)
    return value


def write_ledger(path: pathlib.Path, rows: list[object]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n")


class CapacityReceiptTests(unittest.TestCase):
    def test_auth_inventory_alone_never_becomes_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt = MODULE.build_capacity_receipt(
                pathlib.Path(tmp) / "missing.jsonl",
                NOW,
                {
                    "openai": [
                        MODULE.profile_identity("openai", "one"),
                        MODULE.profile_identity("openai", "two"),
                    ]
                },
            )
        self.assertEqual(receipt["target"], 0)
        self.assertFalse(receipt["approved"])
        self.assertIsNone(receipt["observedAt"])
        self.assertEqual(receipt["providers"]["openai"]["enrolled"], 2)
        self.assertEqual(receipt["providers"]["openai"]["ready"], 0)

    def test_one_distinct_successful_useful_turn_is_one_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, [turn()])
            receipt = MODULE.build_capacity_receipt(ledger, NOW)
        self.assertEqual(receipt["target"], 1)
        self.assertEqual(receipt["source"], MODULE.CAPACITY_SOURCE)
        self.assertEqual(receipt["observedAt"], MODULE.isoformat(NOW))
        accepted, reason = MODULE.validate_capacity_receipt(receipt, NOW)
        self.assertEqual(reason, "accepted")
        self.assertTrue(accepted["accepted"])

    def test_duplicate_provider_profile_model_is_still_one_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(
                ledger,
                [
                    turn(completed=NOW - timedelta(minutes=2)),
                    turn(completed=NOW - timedelta(minutes=1), outputDigest="b" * 64),
                ],
            )
            receipt = MODULE.build_capacity_receipt(ledger, NOW)
        self.assertEqual(receipt["target"], 1)
        self.assertEqual(len(receipt["rows"]), 1)
        self.assertEqual(receipt["rows"][0]["outputDigest"], "b" * 64)

    def test_subsecond_completion_orders_by_instant_across_build_and_compaction(self):
        older = NOW - timedelta(seconds=1)
        newer = older + timedelta(microseconds=500_000)
        older_row = turn(completed=older, outputDigest="a" * 64)
        newer_row = turn(completed=newer, outputDigest="b" * 64)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            rows = [older_row, newer_row]
            rows.extend(
                turn(completed=older, outputDigest=f"{index + 1:064x}")
                for index in range(MODULE.MAX_LEDGER_ROWS)
            )
            MODULE.append_rows(ledger, rows, now=NOW)
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        self.assertEqual(receipt["target"], 1)
        self.assertEqual(receipt["rows"][0]["outputDigest"], "b" * 64)
        self.assertEqual(receipt["observedAt"], MODULE.isoformat(newer))

    def test_receipt_observed_at_requires_the_newest_instant_not_lexical_max(self):
        older = NOW - timedelta(seconds=1)
        newer = older + timedelta(microseconds=500_000)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(
                ledger,
                [
                    turn(
                        profile=MODULE.profile_identity("openai", "older"),
                        completed=older,
                    ),
                    turn(
                        profile=MODULE.profile_identity("openai", "newer"),
                        completed=newer,
                        outputDigest="b" * 64,
                    ),
                ],
            )
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        self.assertEqual(receipt["observedAt"], MODULE.isoformat(newer))
        receipt["observedAt"] = MODULE.isoformat(older)
        self.assertEqual(
            MODULE.validate_capacity_receipt(receipt, NOW)[1],
            "capacity-evidence-observed-at-mismatch",
        )

    def test_one_profile_across_multiple_models_is_still_one_subscription(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(
                ledger,
                [
                    turn(model="gpt-5.6-luna", completed=NOW - timedelta(minutes=1)),
                    turn(model="gpt-5.6-sol", outputDigest="b" * 64),
                ],
            )
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        self.assertEqual(receipt["target"], 1)
        self.assertEqual(receipt["rows"][0]["model"], "gpt-5.6-sol")
        self.assertTrue(MODULE.validate_capacity_receipt(receipt, NOW)[0]["accepted"])

    def test_stale_failed_non_useful_and_malformed_rows_are_rejected(self):
        invalid = [
            turn(completed=NOW - timedelta(hours=25)),
            turn(rc=1),
            turn(useful=False),
            turn(outputDigest=""),
            turn(outputBytes=0),
            turn(tokens={"input": 2, "output": 0, "total": 2}),
            {"schema": MODULE.TURN_SCHEMA},
            "not-an-object",
        ]
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, invalid)
            receipt = MODULE.build_capacity_receipt(ledger, NOW)
        self.assertEqual(receipt["target"], 0)
        self.assertEqual(receipt["ledger"]["rejectedRows"], len(invalid))

    def test_periodic_regeneration_cannot_freshen_old_proof(self):
        completed = NOW - timedelta(hours=23)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, [turn(completed=completed)])
            first = MODULE.build_capacity_receipt(ledger, NOW)
            second = MODULE.build_capacity_receipt(ledger, NOW + timedelta(hours=2))
        self.assertEqual(first["observedAt"], MODULE.isoformat(completed))
        self.assertIsNone(second["observedAt"])
        self.assertEqual(second["target"], 0)

    def test_consumer_rejects_oauth_source_and_provider_row_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, [turn()])
            receipt = MODULE.build_capacity_receipt(ledger, NOW)
        oauth = {**receipt, "source": "live-oauth-cli-seats"}
        mismatched = json.loads(json.dumps(receipt))
        mismatched["providers"]["openai"]["ready"] = 2
        self.assertEqual(
            MODULE.validate_capacity_receipt(oauth, NOW)[1],
            "capacity-evidence-source-invalid",
        )
        self.assertEqual(
            MODULE.validate_capacity_receipt(mismatched, NOW)[1],
            "capacity-evidence-provider-row-mismatch",
        )

    def test_consumer_rejects_cross_language_type_and_identity_ambiguity(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, [turn()])
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        invalid_mutations = (
            ("boolean-target", lambda value: value.update(target=True)),
            (
                "boolean-severe-incidents",
                lambda value: value.update(severeIncidents=False),
            ),
            ("whitespace-model", lambda value: value["rows"][0].update(model=" gpt-5.6-sol ")),
            ("raw-profile", lambda value: value["rows"][0].update(profile="meetjovie")),
            ("invalid-provider", lambda value: value["rows"][0].update(provider="OpenAI")),
            ("boolean-rc", lambda value: value["rows"][0].update(rc=False)),
            ("float-rc", lambda value: value["rows"][0].update(rc=0.0)),
            (
                "naive-completion",
                lambda value: value["rows"][0].update(
                    completedAt="2026-09-04T14:00:00"
                ),
            ),
            (
                "space-separated-completion",
                lambda value: value["rows"][0].update(
                    completedAt="2026-09-04 14:00:00+00:00"
                ),
            ),
            (
                "compact-offset-completion",
                lambda value: value["rows"][0].update(
                    completedAt="2026-09-04T14:00:00+0000"
                ),
            ),
            (
                "out-of-range-offset-completion",
                lambda value: value["rows"][0].update(
                    completedAt="2026-09-04T14:00:00+01:60"
                ),
            ),
            (
                "boolean-provider-ready",
                lambda value: value["providers"]["openai"].update(ready=True),
            ),
        )
        for name, mutate in invalid_mutations:
            with self.subTest(name=name):
                candidate = json.loads(json.dumps(receipt))
                mutate(candidate)
                accepted, reason = MODULE.validate_capacity_receipt(candidate, NOW)
                self.assertIsNone(accepted, reason)

    def test_consumer_rejects_more_than_the_canonical_ceiling(self):
        rows = [
            turn(
                profile=MODULE.profile_identity("openai", f"profile-{index}"),
                outputDigest=f"{index + 1:064x}",
            )
            for index in range(MODULE.MAX_CAPACITY + 1)
        ]
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            write_ledger(ledger, rows)
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        self.assertEqual(receipt["target"], 41)
        self.assertEqual(
            MODULE.validate_capacity_receipt(receipt, NOW)[1],
            "capacity-evidence-target-mismatch-or-zero",
        )

    def test_validate_capacity_receipt_rejects_duplicate_subscription_identity(self):
        receipt = {
            "schema": MODULE.CAPACITY_SCHEMA,
            "source": MODULE.CAPACITY_SOURCE,
            "observedAt": MODULE.isoformat(NOW),
            "target": 2,
            "approved": True,
            "severeIncidents": 0,
            "rows": [turn(model="gpt-5.6-sol"), turn(model="gpt-5.6-terra")],
            "providers": {
                "openai": {
                    "enrolled": 1,
                    "enrolledProfiles": ["meetjovie"],
                    "ready": 2,
                }
            },
        }
        self.assertEqual(
            MODULE.validate_capacity_receipt(receipt, NOW)[1],
            "capacity-evidence-duplicate-seat",
        )

    def test_codex_enrollment_counts_configured_directories_without_reading_auth(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for name in ("one", "two"):
                account = root / name
                account.mkdir()
                (account / "auth.json").write_text("not-readable-json")
                (account / "config.toml").write_text("model = 'test'")
            incomplete = root / "incomplete"
            incomplete.mkdir()
            (incomplete / "auth.json").write_text("unused")
            inventory = GENERATOR_MODULE.enrollment_inventory(root)
        self.assertEqual(
            inventory,
            {
                "openai": sorted(
                    [
                        MODULE.profile_identity("openai", "one"),
                        MODULE.profile_identity("openai", "two"),
                    ]
                )
            },
        )

    def test_capacity_generator_writes_a_private_identity_bound_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            accounts = root / "accounts"
            account = accounts / "account-a"
            account.mkdir(parents=True)
            (account / "auth.json").write_text("not-inspected", encoding="utf-8")
            (account / "config.toml").write_text("model = 'test'\n", encoding="utf-8")
            ledger = root / "turns.jsonl"
            out = root / "concurrency.json"
            identity = MODULE.profile_identity("openai", "account-a")
            write_ledger(ledger, [turn(profile=identity)])
            stdout = io.StringIO()
            with (
                mock.patch.dict(os.environ, {"CODEX_ACCOUNTS_ROOT": str(accounts)}),
                mock.patch.object(
                    sys,
                    "argv",
                    [str(GENERATOR), "--ledger", str(ledger), "--out", str(out)],
                ),
                redirect_stdout(stdout),
            ):
                returncode = GENERATOR_MODULE.main()

            receipt = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(returncode, 0)
            self.assertEqual(receipt["target"], 1)
            self.assertEqual(receipt["rows"][0]["profile"], identity)
            self.assertEqual(out.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("account-a", stdout.getvalue())

    def test_replaced_profile_cannot_reuse_removed_profiles_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            removed = MODULE.profile_identity("openai", "removed-profile")
            replacement = MODULE.profile_identity("openai", "replacement-profile")
            write_ledger(ledger, [turn(profile=removed)])
            receipt = MODULE.build_capacity_receipt(
                ledger,
                NOW,
                {"openai": [replacement]},
            )

        self.assertEqual(receipt["target"], 0)
        self.assertFalse(receipt["approved"])
        self.assertEqual(
            receipt["providers"]["openai"]["enrolledProfiles"], [replacement]
        )
        self.assertEqual(receipt["ledger"]["unenrolledRows"], 1)

    def test_hot_ledger_compacts_to_latest_fresh_proof_with_typed_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            rows = [
                turn(
                    profile=MODULE.profile_identity("openai", f"account-{index % 40}"),
                    completed=NOW - timedelta(seconds=MODULE.MAX_LEDGER_ROWS - index),
                    outputDigest=f"{index + 1:064x}",
                )
                for index in range(MODULE.MAX_LEDGER_ROWS + 8)
            ]
            self.assertEqual(MODULE.append_rows(ledger, rows, now=NOW), len(rows))
            retained = ledger.read_text(encoding="utf-8").splitlines()
            receipt = MODULE.build_capacity_receipt(ledger, NOW)
            compaction_path = ledger.with_name(f"{ledger.name}.compaction.json")
            compaction = json.loads(compaction_path.read_text(encoding="utf-8"))

        self.assertEqual(len(retained), 40)
        self.assertEqual(receipt["target"], 40)
        self.assertEqual(receipt["ledger"]["compaction"], compaction)
        self.assertEqual(compaction["schema"], MODULE.COMPACTION_SCHEMA)
        self.assertEqual(compaction["beforeRows"], MODULE.MAX_LEDGER_ROWS + 8)
        self.assertEqual(compaction["retainedRows"], 40)
        self.assertEqual(compaction["prunedRows"], MODULE.MAX_LEDGER_ROWS - 32)

    def test_compaction_drops_expired_and_malformed_rows_without_freshening(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            stale = [
                turn(
                    profile=MODULE.profile_identity("openai", f"old-{index}"),
                    completed=NOW - timedelta(hours=25),
                    outputDigest=f"{index + 1:064x}",
                )
                for index in range(MODULE.MAX_LEDGER_ROWS)
            ]
            write_ledger(ledger, [*stale, "malformed"])
            current = turn(profile=MODULE.profile_identity("openai", "current"))
            MODULE.append_rows(ledger, [current], now=NOW)
            receipt = MODULE.build_capacity_receipt(ledger, NOW)

        self.assertEqual(receipt["target"], 1)
        self.assertEqual(receipt["rows"][0]["completedAt"], MODULE.isoformat(NOW))
        self.assertEqual(receipt["ledger"]["totalRows"], 1)
        self.assertGreaterEqual(receipt["ledger"]["compaction"]["prunedRows"], 513)

    def test_concurrent_appenders_share_one_lock_across_compaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = pathlib.Path(tmp) / "turns.jsonl"
            source = str(SOURCE)
            program = """
import importlib.util, pathlib, sys
from datetime import datetime, timezone
spec = importlib.util.spec_from_file_location('provider_useful_turns_child', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
now = datetime.now(timezone.utc)
profile = module.profile_identity('openai', f'child-{sys.argv[3]}')
rows = []
for index in range(150):
    rows.append({
        'schema': module.TURN_SCHEMA,
        'provider': 'openai',
        'profile': profile,
        'model': 'gpt-5.6-sol',
        'completedAt': module.isoformat(now),
        'rc': 0,
        'useful': True,
        'outputDigest': f'{int(sys.argv[3]) * 1000 + index + 1:064x}',
        'outputBytes': 1,
        'tokens': {'input': 1, 'output': 1, 'total': 2},
    })
module.append_rows(pathlib.Path(sys.argv[2]), rows, now=now)
"""
            children = [
                subprocess.Popen([sys.executable, "-c", program, source, str(ledger), str(index)])
                for index in range(4)
            ]
            for child in children:
                self.assertEqual(child.wait(timeout=20), 0)
            receipt = MODULE.build_capacity_receipt(
                ledger, datetime.now(timezone.utc) + timedelta(seconds=1)
            )

        self.assertEqual(receipt["target"], 4)
        self.assertLessEqual(receipt["ledger"]["totalRows"], MODULE.MAX_LEDGER_ROWS)
        self.assertGreater(receipt["ledger"]["compaction"]["totalPruned"], 0)


class AppServerProofTests(unittest.TestCase):
    def test_only_completed_token_bearing_output_is_appended(self):
        events = [
            {"method": "turn/started", "params": {"turn": {"id": "turn-1"}}},
            {
                "method": "item/completed",
                "params": {
                    "turnId": "turn-1",
                    "item": {"type": "agentMessage", "text": "useful result"},
                },
            },
            {
                "method": "thread/tokenUsage/updated",
                "params": {
                    "turnId": "turn-1",
                    "tokenUsage": {
                        "last": {"inputTokens": 12, "outputTokens": 3, "totalTokens": 15}
                    },
                },
            },
            {
                "method": "turn/completed",
                "params": {"turn": {"id": "turn-1", "status": "completed"}},
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            stream = pathlib.Path(tmp) / "stream.jsonl"
            write_ledger(stream, events)
            rows = MODULE.useful_turns_from_app_server(
                stream,
                provider="openai",
                profile="jovie",
                model="gpt-5.6-sol",
                completed_at=NOW,
            )
            ledger = pathlib.Path(tmp) / "proof.jsonl"
            self.assertEqual(MODULE.append_rows(ledger, rows), 1)
            persisted = json.loads(ledger.read_text())
        self.assertEqual(
            persisted["profile"], MODULE.profile_identity("openai", "jovie")
        )
        self.assertEqual(persisted["tokens"]["output"], 3)
        self.assertNotIn("useful result", json.dumps(persisted))

    def test_failed_empty_or_tokenless_turns_write_nothing(self):
        events = [
            {"method": "turn/started", "params": {"turn": {"id": "turn-1"}}},
            {"method": "turn/completed", "params": {"turn": {"id": "turn-1", "status": "failed"}}},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            stream = pathlib.Path(tmp) / "stream.jsonl"
            write_ledger(stream, events)
            rows = MODULE.useful_turns_from_app_server(
                stream,
                provider="openai",
                profile="jovie",
                model="gpt-5.6-sol",
                completed_at=NOW,
            )
        self.assertEqual(rows, [])

    def test_bounded_exec_canary_produces_the_same_redacted_useful_turn(self):
        events = [
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": "SYMPHONY_CAPACITY_OK"},
            },
            {
                "type": "turn.completed",
                "usage": {
                    "input_tokens": 7,
                    "cached_input_tokens": 0,
                    "output_tokens": 3,
                },
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            stream = pathlib.Path(tmp) / "exec.jsonl"
            write_ledger(stream, events)
            rows = MODULE.useful_turns_from_exec(
                stream,
                provider="openai",
                profile="account-a",
                model="gpt-5.6-sol",
                completed_at=NOW,
            )

        self.assertEqual(len(rows), 1)
        self.assertEqual(
            rows[0]["profile"], MODULE.profile_identity("openai", "account-a")
        )
        self.assertEqual(rows[0]["tokens"], {"input": 7, "output": 3, "total": 10})
        self.assertNotIn("SYMPHONY_CAPACITY_OK", json.dumps(rows[0]))

    def test_terminal_exec_failure_never_produces_capacity(self):
        with tempfile.TemporaryDirectory() as tmp:
            stream = pathlib.Path(tmp) / "exec.jsonl"
            write_ledger(
                stream,
                [
                    {
                        "type": "item.completed",
                        "item": {"type": "agent_message", "text": "not useful"},
                    },
                    {"type": "turn.completed", "usage": {"input_tokens": 1, "output_tokens": 1}},
                    {"type": "turn.failed", "error": {"message": "limit"}},
                ],
            )
            rows = MODULE.useful_turns_from_exec(
                stream,
                provider="openai",
                profile="account-a",
                model="gpt-5.6-sol",
                completed_at=NOW,
            )
        self.assertEqual(rows, [])

    def test_long_lived_capture_cannot_stamp_old_output_as_fresh(self):
        events = [
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": "old"},
            },
            {
                "type": "turn.completed",
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            stream = pathlib.Path(tmp) / "exec.jsonl"
            ledger = pathlib.Path(tmp) / "proof.jsonl"
            write_ledger(stream, events)
            result = subprocess.run(
                [
                    sys.executable,
                    str(SOURCE),
                    "record-exec",
                    "--stream",
                    str(stream),
                    "--ledger",
                    str(ledger),
                    "--provider",
                    "openai",
                    "--profile",
                    "account-a",
                    "--model",
                    "gpt-5.6-sol",
                    "--started-at-epoch",
                    "1",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 1)
        self.assertFalse(ledger.exists())

    def test_legacy_unit_is_migrated_to_proof_path_without_kimi_refresh(self):
        generator = GENERATOR.read_text(encoding="utf-8")
        service = SERVICE.read_text(encoding="utf-8")
        self.assertNotIn("refresh_kimi", generator)
        self.assertNotIn("access_token", generator)
        self.assertIn("provider-useful-turns.jsonl", service)
        self.assertIn("ExecStartPre=/usr/bin/python3", service)
        self.assertIn("gem-concurrency-evidence.py", service)


if __name__ == "__main__":
    unittest.main()

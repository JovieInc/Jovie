#!/usr/bin/env python3
"""Producer-to-priority-gate composition through the real private proof context."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import pathlib
import tempfile
import unittest

import proof_fixtures as F
import symphony_capacity_evidence as P
import symphony_proof_context as T
import gem_gate_contract as C

PATH = pathlib.Path(__file__).resolve().parents[1] / "gem-priority-gate.py"
SPEC = importlib.util.spec_from_file_location("priority_gate", PATH)
G = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(G)


class PriorityGateCompositionTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        self.proof = F.proof(self.now, "priority-consumer")
        self.context = F.context([self.proof])
        self.receipt = P.build_receipt([self.proof], {}, self.now, context=self.context)

    def observe(self, receipt):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "capacity.json"
            path.write_text(json.dumps(receipt))
            return G.observe_concurrency(path, self.now)

    def test_actual_producer_output_is_accepted_by_priority_consumer(self):
        self.assertTrue(C.v2_validate_capacity_receipt(self.receipt, self.now, **T.validation_args(self.context))[0])
        observed = self.observe(self.receipt)
        self.assertTrue(observed["accepted"], observed["reason"])
        # The evaluation path revalidates using the same trusted entry point.
        self.assertTrue(G.validate_capacity_receipt(self.receipt, self.now)[0])

    def test_receipt_cannot_supply_its_own_trust_context(self):
        F.CONTEXT.unlink()
        self.assertFalse(self.observe(self.receipt)["accepted"])

    def test_runtime_contract_profile_and_attestation_substitution_fail_closed(self):
        changes = [
            lambda r: r["runtime"].update(sourceRevision="a" * 40),
            lambda r: r.update(contractSha256="b" * 64),
            lambda r: r["acceptedEvidence"][0].update(profile="c" * 64),
            lambda r: r["acceptedEvidence"][0].update(outputDigest="d" * 64),
            lambda r: r.update(acceptedEvidence="malformed"),
            lambda r: r.update(target=True),
            lambda r: r.update(runtime=None),
            lambda r: r.update(observedAt=(self.now + timedelta(seconds=1)).isoformat()),
        ]
        for change in changes:
            receipt = copy.deepcopy(self.receipt)
            change(receipt)
            self.assertFalse(self.observe(receipt)["accepted"])

    def test_v2_rows_without_runtime_binding_cannot_downgrade_to_legacy(self):
        self.receipt.pop("runtime")
        self.receipt.pop("contractSha256")
        self.assertFalse(self.observe(self.receipt)["accepted"])

    def test_missing_or_malformed_legacy_evidence_remains_rejected(self):
        for value in (None, [], {}, {"acceptedEvidence": []}):
            self.assertFalse(G.validate_capacity_receipt(value, self.now)[0])

    def test_account_cooldown_invalidates_previously_valid_capacity(self):
        F.write_private(F.ROOT / "state.json", {"cooldowns": {"account-priority-consumer": int(self.now.timestamp()) + 300}})
        self.assertFalse(self.observe(self.receipt)["accepted"])


if __name__ == "__main__":
    unittest.main()

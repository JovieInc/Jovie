"""Capability delivery preserves uncertain and denied outcomes in the native outbox."""
import json
import unittest
from pathlib import Path
from unittest import mock
from scripts.tests import test_linear_sync as fixtures

ls, FakeLinear, Base = fixtures.ls, fixtures.FakeLinear, fixtures.Base

class CapabilityOutboxTest(Base):
    def seed(self):
        import capability_outbox as outbox
        now = 1794592800
        record = {"job": {"id": "run-1", "head": "a" * 40, "action": "issue-dispatch",
                          "principal": "fixture", "environment": "test", "owner": "worker-a"},
                  "custody": {"expiresAt": "2026-11-13T18:10:00Z"}, "execution": {"outcome": "not-started"}}
        result = outbox.transition({"op": "checkpoint", "record": record, "nowMs": now * 1000,
                                    "requirements": [{"kind": "tool", "capability": "provider", "scope": "test"}],
                                    "observations": {}})
        outbox.enqueue(self.state, "id-1", result["record"], result["messages"])
        return outbox, now, result

    def test_duplicate_enqueues_and_verified_delivery_never_approve(self):
        outbox, now, result = self.seed()
        outbox.enqueue(self.state, "id-1", result["record"], result["messages"])
        body = result["messages"][0]
        client = FakeLinear([{"commentCreate": {"success": True}},
                             {"issue": {"comments": {"nodes": [{"id": "c1", "body": body}]}}}])
        delivered = outbox.flush(self.state, client, lambda _: True, now=now)
        self.assertTrue(delivered[0]["delivered"])
        rows = ls._read(ls._outbox_path(self.state), ls.OUTBOX)["capabilityRequests"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(next(iter(rows.values()))["record"]["capabilityRequests"][0]["status"], "pending")
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now + 1), [])

    def test_unknown_send_only_reads_back_even_when_page_is_truncated(self):
        outbox, now, result = self.seed()
        client = FakeLinear([TimeoutError(), {"issue": {"comments": {"nodes": [], "pageInfo": {"hasNextPage": True}}}}])
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now)[0]["reason"], "delivery-unknown")
        client = FakeLinear([{"issue": {"comments": {"nodes": []}}}])
        outbox.flush(self.state, client, lambda _: True, now=now + 1)
        self.assertEqual([query for query, _ in client.calls], [outbox.READBACK])

    def test_denied_delivery_is_retained_and_not_retried(self):
        outbox, now, result = self.seed()
        client = FakeLinear([{"errors": [{"extensions": {"code": "FORBIDDEN"}}]}])
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now)[0]["reason"], "delivery-denied")
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now + 1), [])
        self.assertEqual(len(client.calls), 1)
        self.assertIn("capability-request-undelivered", ls.alerts(ls.status(self.state, now=now)))

    def test_budget_hold_and_concurrent_claim_do_not_send(self):
        outbox, now, result = self.seed()
        key = result["record"]["capabilityRequests"][0]["id"]
        client = FakeLinear([])
        self.assertEqual(outbox.flush(self.state, client, lambda _: False, now=now), [])
        selected = outbox._update(self.state, key, "delivery-select", now)
        self.assertIn("request", selected)
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now + 1), [])
        self.assertEqual(client.calls, [])


    def test_real_client_denial_blocks_already_queued_destination_and_corruption_cannot_reset(self):
        import lane_runner
        outbox, now, result = self.seed()
        second = json.loads(json.dumps(result["record"]))
        second["capabilityRequests"][0]["id"] = "b" * 64
        second["capabilityRequests"][0]["binding"]["capability"] = "different-tool"
        outbox.enqueue(self.state, "id-1", second, ["different request"])
        client = FakeLinear([lane_runner.LinearRequestError({"extensions": {"code": "FORBIDDEN"}})])
        delivered = outbox.flush(self.state, client, lambda _: True, now=now)
        self.assertEqual(delivered[0]["reason"], "delivery-denied")
        self.assertEqual(len(client.calls), 1)
        path = ls._outbox_path(self.state)
        for content in ('{"schema":', '{"schema":"wrong"}'):
            path.write_text(content)
            with self.assertRaisesRegex(ValueError, "preserve-delivery-history"):
                outbox.enqueue(self.state, "id-1", result["record"], result["messages"])
            self.assertEqual(path.read_text(), content)


    def test_denied_readback_keeps_mutation_unknown_without_repeating_denied_read(self):
        import lane_runner
        outbox, now, result = self.seed()
        client = FakeLinear([TimeoutError(), lane_runner.LinearRequestError({"extensions": {"code": "FORBIDDEN"}})])
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now)[0]["reason"], "delivery-denied")
        self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now + 1), [])
        row = next(iter(ls._read(ls._outbox_path(self.state), ls.OUTBOX)["capabilityRequests"].values()))
        self.assertEqual(row["record"]["capabilityRequests"][0]["delivery"]["mutationOutcome"], "unknown")
        self.assertEqual(len(client.calls), 2)

    def test_uncertain_destination_holds_unsent_request_without_falsifying_its_send_state(self):
        outbox, now, result = self.seed()
        first_key = result["record"]["capabilityRequests"][0]["id"]
        second = json.loads(json.dumps(result["record"]))
        second["capabilityRequests"][0]["id"] = "c" * 64
        outbox.enqueue(self.state, "id-1", second, ["second request"])
        selected = outbox._update(self.state, first_key, "delivery-select", now)
        outbox._update(self.state, first_key, "delivery-settle", now, selected=selected, sent={"status": "unknown"}, receipt=None)
        self.assertEqual(outbox._update(self.state, "c" * 64, "delivery-select", now)["reason"], "destination-delivery-uncertain")
        outbox._update(self.state, first_key, "delivery-settle", now, selected=selected, sent=None,
                       receipt={"id": "comment-1", "requestId": first_key, "bindingDigest": first_key})
        resumed = outbox._update(self.state, "c" * 64, "delivery-select", now)
        self.assertIn("request", resumed)
        self.assertFalse(resumed["readOnly"])


    def test_reconstruction_consumes_same_flush_deadline_before_any_delivery(self):
        outbox, now, result = self.seed()
        clock = iter([10.0, 56.0])
        with mock.patch.object(outbox, "reconcile") as reconcile, \
                mock.patch.object(outbox.time, "monotonic", side_effect=lambda: next(clock)):
            client = FakeLinear([])
            self.assertEqual(outbox.flush(self.state, client, lambda _: True, now=now, budget_s=45), [])
            self.assertEqual(reconcile.call_args.kwargs["deadline"], 55.0)
            self.assertEqual(client.calls, [])

if __name__ == "__main__": unittest.main()

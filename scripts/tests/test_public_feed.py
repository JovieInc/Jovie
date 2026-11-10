"""Public feed growth and refusal-pressure regressions (JOV-12026)."""
import hashlib
import json
import unittest

from scripts.tests.test_doctor import doctor, obs, realistic_feed


class PublicFeedRegressionTest(unittest.TestCase):
    def test_growing_fingerprint_index_is_referenced_without_erasing_operational_counts(self):
        feed = realistic_feed()
        template = feed["remediation"]["byFingerprint"]["remediation-fingerprint-2"]
        rows = {f"fingerprint-{n:064d}": {**template, "state": "claimed"} for n in range(4000)}
        rows["unknown-shape"] = None
        feed["remediation"]["byFingerprint"] = rows
        feed["remediation"]["eventsOpen"] = 4000
        full = json.dumps(feed, indent=1)
        out = doctor.public_status_projection(feed, full)
        public = json.loads(out)
        self.assertEqual(public["schema"], "symphony-lanes-status/v1")
        self.assertLess(len(out.encode()), doctor.PUBLIC_FEED_MAX_BYTES * doctor.PUBLIC_FEED_WARN_RATIO)
        block = public["remediation"]
        self.assertNotIn("byFingerprint", block, "a referenced index must not look like an empty or partial index")
        self.assertEqual(block["byFingerprintSummary"], {
            "recordCount": 4001, "byState": {"claimed": 4000, "unknown": 1}})
        self.assertEqual(block["byFingerprintRef"]["recordCount"], 4001)
        self.assertEqual(block["byFingerprintRef"]["jsonPointer"], "/remediation/byFingerprint")
        self.assertEqual(block["eventsOpen"], 4000)
        self.assertEqual(block["surfaced"], feed["remediation"]["surfaced"])
        self.assertEqual(public["publicProjection"]["fullEvidence"]["sha256"], hashlib.sha256(full.encode()).hexdigest())
        self.assertEqual(feed["remediation"]["byFingerprint"], rows, "source evidence is never mutated")

    def test_unknown_fingerprint_index_is_not_reported_as_an_empty_summary(self):
        public = {"remediation": {"byFingerprint": None, "eventsOpen": None}}
        doctor._compact_remediation(public)
        self.assertIsNone(public["remediation"]["byFingerprint"])
        self.assertIsNone(public["remediation"]["eventsOpen"])
        self.assertNotIn("byFingerprintSummary", public["remediation"])

    def test_overflow_refusal_metrics_keep_rejected_payload_pressure_visible(self):
        refusal = {"schema": "symphony-lanes-status-unavailable/v1", "status": "unavailable",
                   "reason": "essential-public-feed-exceeds-byte-limit", "requiredBytes": 262670,
                   "maxBytes": doctor.PUBLIC_FEED_MAX_BYTES}
        text = json.dumps(refusal)
        sizes = doctor.feed_section_sizes(text)
        self.assertEqual(sizes["bytes"], 262670)
        self.assertEqual(sizes["publishedBytes"], len(text.encode()))
        self.assertGreater(sizes["ratio"], 1)
        self.assertEqual(sizes["sections"], {"rejectedPayload": 262670})
        self.assertIn("public-feed-near-limit", doctor.judge(obs(publicFeed=sizes)))

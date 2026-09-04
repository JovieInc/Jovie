#!/usr/bin/env python3
"""GitHub poke enters Symphony. HA remediator webhook is not the queue."""

from __future__ import annotations

import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
POKE = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"
REGISTRY = ROOT / "audits/continuous/registry.json"


class GitHubPokeEntersSymphonyTests(unittest.TestCase):
    def test_poke_wakes_symphony_not_hyperagent_webhook(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("16419", text)
        self.assertIn("http://127.0.0.1:4041/api/v1/refresh", text)
        self.assertIn("symphony-grok-sidecar.service", text)
        self.assertIn("--no-block", text)
        self.assertNotIn("HYPERAGENT_CI_WEBHOOK", text)
        self.assertNotRegex(text, r"curl[^\n]*4042")
        self.assertNotIn("systemctl --user restart symphony-elixir", text)
        self.assertNotIn("systemctl restart symphony-elixir", text)
        self.assertIn("accountable-writer: Symphony", text)

    def test_ha_thread_mix_stays_product_not_ci_only(self):
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
        families = {
            family["id"]: family.get("providerEligibility", {}).get(
                "allowedProviders", []
            )
            for family in registry.get("auditFamilies", [])
        }
        self.assertIn("hyperagent", families["ux-accessibility-visual-drift"])
        self.assertIn("hyperagent", families["documentation-skill-context-freshness"])
        poke = POKE.read_text(encoding="utf-8")
        self.assertIn("Hyperagent is general product throughput", poke)
        self.assertNotIn("HYPERAGENT_CI_WEBHOOK", poke)


if __name__ == "__main__":
    unittest.main()

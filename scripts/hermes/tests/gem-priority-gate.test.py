#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
GATE = ROOT / "scripts/hermes/gem-priority-gate.py"
SPEC = importlib.util.spec_from_file_location("gem_priority_gate", GATE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, url: str, payload: dict[str, object], status: int = 200):
        self._url = url
        self._payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self) -> str:
        return self._url

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class ProductionHealthTests(unittest.TestCase):
    def test_default_uses_the_dedicated_deploy_health_contract(self):
        with (
            mock.patch.dict(os.environ, {"JOVIE_PRODUCTION_HEALTH_URL": ""}),
            mock.patch.object(sys, "argv", [str(GATE)]),
        ):
            args = MODULE.parse_args()

        self.assertEqual(args.production_url, "https://jov.ie/api/health/deploy")

    def test_deploy_health_healthy_is_green(self):
        url = "https://jov.ie/api/health/deploy"
        response = FakeResponse(url, {"status": "healthy"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(
            observed,
            {
                "status": "green",
                "url": url,
                "reportedStatus": "healthy",
            },
        )

    def test_legacy_ok_status_remains_compatible_for_explicit_overrides(self):
        url = "https://example.test/health"
        response = FakeResponse(url, {"status": "ok"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "green")
        self.assertEqual(observed["reportedStatus"], "ok")

    def test_unhealthy_deploy_contract_is_red(self):
        url = "https://jov.ie/api/health/deploy"
        response = FakeResponse(url, {"status": "unhealthy"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "red")
        self.assertEqual(observed["reportedStatus"], "unhealthy")


if __name__ == "__main__":
    unittest.main()

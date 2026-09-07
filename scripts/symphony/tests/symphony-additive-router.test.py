#!/usr/bin/env python3
"""Bounded regression lane for additive Grok/Kimi issue targeting."""
from __future__ import annotations
import importlib.util
import pathlib
import unittest
FALLBACK_TEST = pathlib.Path(__file__).with_name("symphony-codex-auth-fallback.test.py")
SELECTED_TESTS = (
    "test_targeted_drain_launches_only_the_exact_eligible_issue",
    "test_targeted_drain_refuses_absent_issue_before_provider_probe",
    "test_targeted_drain_refuses_when_another_worker_owns_capacity",
    "test_ready_targeted_reconcile_fails_when_exact_issue_does_not_start",
    "test_ready_targeted_reconcile_refuses_any_preexisting_fallback_worker",
    "test_ready_targeted_reconcile_succeeds_only_on_exact_start",
    "test_ready_targeted_reconcile_cleans_up_transient_exact_start",
    "test_untargeted_drain_preserves_existing_capacity_and_issue_set",
    "test_exhausted_target_refuses_absent_issue_without_touching_runtime",
    "test_exhausted_target_refuses_when_unrelated_worker_owns_capacity",
    "test_exhausted_target_succeeds_only_when_exact_unit_survives",
    "test_exhausted_target_fails_if_survivor_set_is_not_exact",
    "test_exhausted_target_not_survived_reports_restore_failure",
)
def _fallback_test_case() -> type[unittest.TestCase]:
    spec = importlib.util.spec_from_file_location(
        "symphony_codex_auth_fallback_tests", FALLBACK_TEST
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {FALLBACK_TEST}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.FallbackTests
def load_tests(_loader, _tests, _pattern) -> unittest.TestSuite:
    test_case = _fallback_test_case()
    return unittest.TestSuite(test_case(name) for name in SELECTED_TESTS)
if __name__ == "__main__":
    unittest.main()

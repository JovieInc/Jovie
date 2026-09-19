#!/usr/bin/env python3
"""Run the actual publisher suites and enforce coverage for each source module."""
import importlib.util
from pathlib import Path
import sys
import unittest
import coverage

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [ROOT / name for name in (
    "summer_bottleneck_producer.py", "summer_admissions.py", "summer_existing_repair.py")]
tracer = coverage.Coverage(branch=True, data_file=None, include=[str(path) for path in SOURCES])
tracer.start()
suite = unittest.TestSuite()
for index, name in enumerate(("summer-bottleneck-producer.test.py", "summer-publisher-admissions.test.py")):
    spec = importlib.util.spec_from_file_location(f"summer_publisher_suite_{index}", ROOT / "tests" / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
result = unittest.TextTestRunner(verbosity=2).run(suite)
tracer.stop()
passed = result.wasSuccessful()
for path in SOURCES:
    if tracer.report(include=[str(path)], show_missing=True, precision=2) < 90:
        passed = False
raise SystemExit(0 if passed else 1)

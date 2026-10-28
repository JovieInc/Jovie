"""Guard: no test module defines a module-level function that pytest treats as a setup/teardown hook.

#23257 shipped test_decompose_pass.py with a module-level helper named `setup(rows, ...)`. pytest invokes
that name as a hook with the module as its argument, so all 10 tests errored ("'module' object is not
iterable") under pytest while the lanes release self-test (unittest) passed, and nothing noticed. A helper
must not be named like a hook; this scan covers every test module the lanes bundle ships.
"""
import ast
import unittest
from pathlib import Path

TESTS = Path(__file__).resolve().parent
HOOK_NAMES = frozenset({
    "setup", "teardown", "setup_module", "teardown_module", "setup_function", "teardown_function",
    "setup_class", "teardown_class", "setup_method", "teardown_method", "setUpModule", "tearDownModule"})


def module_level_hook_names() -> list[str]:
    found = []
    for path in sorted(TESTS.glob("test_*.py")):
        for node in ast.parse(path.read_text()).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in HOOK_NAMES:
                # unittest's own module hooks take no arguments and are intentional.
                if node.name in ("setUpModule", "tearDownModule", "setup_module", "teardown_module") and not node.args.args:
                    continue
                found.append(f"{path.name}:{node.lineno} {node.name}")
    return found


class PytestHookNameTest(unittest.TestCase):
    def test_no_module_level_helper_is_named_like_a_pytest_hook(self):
        self.assertEqual(module_level_hook_names(), [], "rename the helper (e.g. make_state): pytest calls it as a hook")


if __name__ == "__main__":
    unittest.main()

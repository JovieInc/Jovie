"""Code identifiers retain both routing registrations during an additive merge."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import fix_red_classes as classes  # noqa: E402


class CodeIdentifierMergeTest(unittest.TestCase):
    def test_unions_code_identifiers_in_main_order(self):
        self.assertEqual(classes.merge_additive_identifier_list(
            '    REGISTER_DOMAIN, ATOMIC_WRITE, BIOME_FORMAT\n',
            '    REGISTER_DOMAIN, ATOMIC_WRITE, ALIAS_ACTION\n'),
            '    REGISTER_DOMAIN, ATOMIC_WRITE, ALIAS_ACTION, BIOME_FORMAT\n')

    def test_rejects_expressions_duplicates_and_reordering(self):
        for ours in ['ATOM, run()\n', 'ATOM, x.y\n', 'ATOM, X, X\n', 'X, ATOM\n']:
            with self.subTest(ours=ours):
                self.assertIsNone(classes.merge_additive_identifier_list(ours, 'ATOM, X\n'))

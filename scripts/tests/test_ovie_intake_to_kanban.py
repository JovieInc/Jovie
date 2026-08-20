import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "ovie-intake-to-kanban.py"


class OvieIntakeToKanbanTest(unittest.TestCase):
    def run_lander(self, pending, board_path: Path, *, receipt_only: bool = False):
        argv = [sys.executable, str(SCRIPT), "--board", str(board_path)]
        if receipt_only:
            argv.append("--receipt-only")
        result = subprocess.run(
            argv,
            input=json.dumps(pending),
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_upserts_company_items_and_skips_personal(self):
        with tempfile.TemporaryDirectory() as tmp:
            board = Path(tmp) / "board.json"
            pending = [
                {
                    "id": "ini_abc",
                    "idempotency_key": "ovie-ini_abc",
                    "title": "Fix signup 500",
                    "lane": "engineering",
                },
                {
                    "id": "ini_personal",
                    "idempotency_key": "ovie-ini_personal",
                    "title": "Text Liv",
                    "lane": "personal",
                },
            ]
            first = self.run_lander(pending, board)
            self.assertEqual(first["created_linear"], 0)
            self.assertEqual(len(first["tasks"]), 1)
            self.assertEqual(first["tasks"][0]["id"], "ini_abc")
            second = self.run_lander(pending, board)
            self.assertEqual(len(second["tasks"]), 1)
            self.assertEqual(second["results"][0]["action"], "updated")
            closed = self.run_lander(pending, board, receipt_only=True)
            self.assertTrue(closed["receipt_only"])
            self.assertEqual(closed["tasks"][0]["status"], "unavailable")
            self.assertIsNone(closed["tasks"][0]["linear"])


if __name__ == "__main__":
    unittest.main()

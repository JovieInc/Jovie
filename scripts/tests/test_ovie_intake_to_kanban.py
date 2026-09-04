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

    def test_upserts_operations_items_and_skips_shipping_and_personal(self):
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
                    "id": "ini_ops",
                    "idempotency_key": "ovie-ini_ops",
                    "title": "Research launch options",
                    "lane": "heavy",
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
            self.assertEqual(first["tasks"][0]["id"], "ini_ops")
            self.assertEqual(first["results"][0]["action"], "skipped-shipping-linear")
            second = self.run_lander(pending, board)
            self.assertEqual(len(second["tasks"]), 1)
            self.assertEqual(second["results"][1]["action"], "updated")
            closed = self.run_lander(pending, board, receipt_only=True)
            self.assertTrue(closed["receipt_only"])
            self.assertEqual(closed["tasks"][0]["status"], "unavailable")
            self.assertIsNone(closed["tasks"][0]["linear"])

    def test_removes_legacy_shipping_card_from_operations_board(self):
        with tempfile.TemporaryDirectory() as tmp:
            board = Path(tmp) / "board.json"
            board.write_text(
                json.dumps(
                    {
                        "owner": "summer",
                        "tasks": [
                            {
                                "id": "ini_abc",
                                "idempotency_key": "ovie-ini_abc",
                                "created_by": "ovie",
                                "owner": "summer",
                                "title": "Fix signup 500",
                                "lane": "engineering",
                                "status": "queued",
                                "linear": None,
                            },
                            {
                                "id": "manual_engineering",
                                "idempotency_key": "manual-engineering",
                                "created_by": "human",
                                "owner": "summer",
                                "title": "Keep manual card",
                                "lane": "engineering",
                                "status": "queued",
                                "linear": None,
                            },
                            {
                                "id": "ini_ops",
                                "idempotency_key": "ovie-ini_ops",
                                "created_by": "ovie",
                                "owner": "summer",
                                "title": "Research launch options",
                                "lane": "heavy",
                                "status": "queued",
                                "linear": None,
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            pending = [
                {
                    "id": "ini_abc",
                    "idempotency_key": "ovie-ini_abc",
                    "title": "Fix signup 500",
                    "lane": "engineering",
                    "destination": "linear",
                }
            ]

            result = self.run_lander(pending, board)
            self.assertEqual(result["results"][0]["action"], "removed-shipping-linear")
            self.assertEqual(
                [task["id"] for task in result["tasks"]],
                ["manual_engineering", "ini_ops"],
            )
            persisted = json.loads(board.read_text(encoding="utf-8"))
            self.assertEqual(
                [task["id"] for task in persisted["tasks"]],
                ["manual_engineering", "ini_ops"],
            )


if __name__ == "__main__":
    unittest.main()

import os
import subprocess
import tempfile
import time
import unittest
import unittest.mock
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "heavy-task.sh"


class HeavyTaskTest(unittest.TestCase):
    def run_script(self, tmp, *cmd, slots="2", **env):
        return subprocess.Popen(["bash", str(SCRIPT), *cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env={**{k: v for k, v in os.environ.items() if k != "CI"},
                                     "HEAVY_TASK_DIR": tmp, "HEAVY_TASK_SLOTS": slots, **env})

    def test_runs_the_command_niced_and_returns_its_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = self.run_script(tmp, "sh", "-c", "nice; exit 7")
            out, _ = proc.communicate(timeout=20)
            self.assertEqual(proc.returncode, 7)
            self.assertGreaterEqual(int(out.split()[0]), 10)

    def test_at_most_n_run_at_once_and_waiters_get_a_slot_when_one_frees(self):
        with tempfile.TemporaryDirectory() as tmp:
            marks = Path(tmp) / "marks"
            marks.mkdir()
            body = f"touch {marks}/$$; sleep 1.2; n=$(ls {marks} | wc -l); echo $n; rm {marks}/$$"
            procs = [self.run_script(tmp, "sh", "-c", body) for _ in range(4)]
            seen = [int(p.communicate(timeout=30)[0].split()[0]) for p in procs]
            self.assertLessEqual(max(seen), 2, seen)
            self.assertTrue(all(p.returncode == 0 for p in procs))

    def test_hosted_ci_and_the_kill_switch_run_directly(self):
        with tempfile.TemporaryDirectory() as tmp:
            for env in ({"CI": "1"}, {"HEAVY_TASK_DISABLE": "1"}):
                proc = self.run_script(tmp, "sh", "-c", "echo ok", **env)
                self.assertEqual(proc.communicate(timeout=20)[0].strip(), "ok")
            self.assertEqual(list(Path(tmp).iterdir()), [], "no slot files taken")


class LaneContractTest(unittest.TestCase):
    def test_lane_prompts_defer_builds_to_ci_and_main_sets_the_guard_env(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
        import bindings
        import lane_runner as lane
        issue = lane.Issue(id="i", identifier="JOV-1", title="t", description="d", priority=2, created_at="x", labels=[])
        prompt = lane.render_prompt(issue, "b", "ctx")
        self.assertIn("Never run `next build`", prompt)
        self.assertIn("heavy-task.sh", prompt)
        binding = type("B", (), {"slug": "o/r", "key": "LYB"})()
        self.assertIn("Never run a production", bindings.render_prompt(binding, "b", issue=issue))
        os.environ.pop("LANES_NO_LOCAL_BUILD", None)
        try:
            with unittest.mock.patch.object(lane, "Host", side_effect=RuntimeError("stop")):
                try:
                    lane.main(["dispatch"])
                except RuntimeError:
                    pass
            self.assertEqual(os.environ.get("LANES_NO_LOCAL_BUILD"), "1")
        finally:
            os.environ.pop("LANES_NO_LOCAL_BUILD", None)

    def test_the_hooks_and_build_entrypoints_go_through_the_guards(self):
        root = Path(__file__).resolve().parents[2]
        self.assertIn("scripts/heavy-task.sh sh", (root / ".husky/pre-commit").read_text())
        gate = (root / "scripts/hooks/pre-push-gate.sh").read_text()
        for needle in ("heavy-task.sh pnpm run pre-push", "heavy-task.sh pnpm component-ship-gate"):
            self.assertIn(needle, gate)
        self.assertIn("deny-lane-heavy.mjs next build", (root / "apps/web/package.json").read_text())
        self.assertIn("denyLaneHeavy(", (root / "scripts/turbo-local.mjs").read_text())
        self.assertIn("LANES_NO_LOCAL_BUILD", (root / "apps/web/playwright.config.ts").read_text())


if __name__ == "__main__":
    unittest.main()

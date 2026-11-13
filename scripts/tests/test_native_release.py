"""Native capability adapter executes from the immutable release closure."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from scripts.tests import test_lane_runner as fixtures

lane, ROOT = fixtures.lane, fixtures.ROOT


class NativeReleaseTest(unittest.TestCase):
    def test_staged_capability_adapter_executes_without_checkout_or_authority_substitution(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging = Path(tmp).resolve()
            for relative in lane.RELEASE_EXTRAS:
                target = staging / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)
            command = ["node", str(staging / "scripts/lib/native-capability-adapter.mjs")]
            payload = {"op": "delivery-select", "record": {"capabilityRequests": []},
                       "requestId": "missing", "nowMs": 1794600000000}
            result = subprocess.run(command, input=json.dumps(payload), cwd=staging,
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["result"], {"reason": "request-missing"})
            (staging / "scripts/summer-commissioning/registry.json").unlink()
            missing = subprocess.run(command, input=json.dumps(payload), cwd=staging,
                                     capture_output=True, text=True, timeout=15)
            self.assertNotEqual(missing.returncode, 0)


if __name__ == "__main__": unittest.main()

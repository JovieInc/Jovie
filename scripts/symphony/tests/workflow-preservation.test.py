#!/usr/bin/env python3
"""Exercise the actual activation entry without granting upstream mutation authority."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("upstream_fixture", Path(__file__).with_name("upstream-preservation.test.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
ROOT = P.ROOT


class WorkflowPreservationTests(P.UpstreamPreservationTests):
    def test_actual_workflow_entry_preserves_approved_upstream_without_mutators(self):
        approved = self.save_binding()
        # Fixture-only injection; the child runs the actual CLI, observer and /proc verifier.
        self.a.write_executable("python3", '''import functools,io,json,os,pathlib,runpy,sys
sys.path.insert(0,str(pathlib.Path.cwd()/'scripts/symphony'))
import emit_gem_service_attestation as E
home=pathlib.Path(os.environ['HOME']); fixture=json.loads((home/'approved-binding.json').read_text())
E.UPSTREAM_RELEASE.update(fixture['release']); E.trust.PROC_ROOT=home/'proc'
E.trust.service_identity=lambda:(123,json.loads(pathlib.Path(os.environ['OWNERSHIP_FIXTURE']).read_text())['fields']['ControlGroup'])
E.observe_upstream_preservation=functools.partial(E.observe_upstream_preservation,home=home,proc_root=home/'proc')
from datetime import datetime,timezone
E.urllib.request.urlopen=lambda *a,**k:io.BytesIO(json.dumps({'generated_at':datetime.now(timezone.utc).isoformat(),'running':[],'retrying':[],'blocked':[]}).encode())
args=[arg for arg in sys.argv[1:] if arg!='-B']; sys.argv=args
runpy.run_path(args[0],run_name='__main__')
''')
        env = {"GEM_UPSTREAM_PRESERVATION_BINDING": str(self.binding_path), "GEM_UPSTREAM_PRESERVATION_BINDING_SHA256": approved}
        result = self.a.entry(env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('"activation": "not-activated"', result.stdout)
        self.assertFalse(self.a.events.exists())
        self.assertEqual((self.a.home / "github-output").read_text(), "mode=upstream-preserved\n")
        env["GEM_UPSTREAM_PRESERVATION_BINDING_SHA256"] = "a" * 64
        result = self.a.entry(env)
        self.assertEqual(result.returncode, 76, result.stdout + result.stderr)
        self.assertFalse(self.a.events.exists())
        workflow = (ROOT / ".github/workflows/gem-delivery-controller-activation.yml").read_text()
        verify = workflow.split("- name: Verify runtime identity after reload", 1)[1]
        self.assertIn("steps.activation.outputs.mode == 'canonical-managed'", verify)


def load_tests(loader, tests, pattern):
    # Inherited observer cases run in the attestation selector; this selector owns entry behavior.
    return unittest.TestSuite([WorkflowPreservationTests("test_actual_workflow_entry_preserves_approved_upstream_without_mutators")])


if __name__ == "__main__":
    unittest.main()

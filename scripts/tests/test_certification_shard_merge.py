"""Head-only certification additions land in a shard; the registry keeps main's bytes."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_conflict_resolvers as resolvers  # noqa: E402
import fix_red_source_edits as edits  # noqa: E402

REL = resolvers.CERT_REGISTRY
HEAD = "apps/web/components/head.tsx"
MAIN = "apps/web/components/main.tsx"
KEPT = "apps/web/components/kept.tsx"


def _sh(values):
    def sh(args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=values[int(args[-1][1]) - 1])
    return sh


class CertificationShardMergeTest(unittest.TestCase):
    def setUp(self):
        self.base = {
            "policy": {"mutationMin": 80},
            "gates": {KEPT: ["ds-owner"]},
            "waivers": {KEPT: {"offline": "No network"}},
        }
        self.ours = json.loads(json.dumps(self.base))
        self.theirs = json.loads(json.dumps(self.base))
        self.ours["gates"][HEAD] = ["tokens", "states"]
        self.ours["waivers"][HEAD] = {"permission-denied": "No gate", "empty": "No rows"}
        self.theirs["policy"] = {"mutationMin": 90}
        self.theirs["gates"][MAIN] = ["a11y"]
        self.theirs["waivers"][MAIN] = {"offline": "Main only"}
        # Spaces only in policy, so a re-serialized registry cannot match these bytes.
        body = json.dumps(
            {"gates": self.theirs["gates"], "waivers": self.theirs["waivers"]},
            separators=(",", ":"))
        self.theirs_text = '{"policy": {"mutationMin": 90},' + body[1:]

    def values(self):
        return [json.dumps(self.base), json.dumps(self.ours), self.theirs_text]

    def apply(self, root, branch="claude/ds-cert-s10", rel=REL, values=None):
        return resolvers.apply_certification_shard(root, rel, _sh(values or self.values()), branch)

    def test_shard_path_and_sorted_head_rows_keep_main_bytes(self):
        self.assertEqual(
            resolvers.certification_shard_rel("claude/ds-cert-s10"),
            "docs/design-system/component-certification.d/claude-ds-cert-s10.json")
        self.assertIsNone(resolvers.certification_shard_rel("///"))
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            placed = self.apply(root)
            self.assertEqual(set(placed), {REL, resolvers.certification_shard_rel("claude/ds-cert-s10")})
            self.assertEqual(placed[REL], self.theirs_text)
            shard = placed[resolvers.certification_shard_rel("claude/ds-cert-s10")]
            self.assertLess(shard.index('"gates"'), shard.index('"waivers"'))
            document = json.loads(shard)
            self.assertEqual(list(document["gates"]), [HEAD])
            self.assertEqual(list(document["waivers"][HEAD]), ["permission-denied", "empty"])
            self.assertNotIn(MAIN, shard)

    def test_refuses_edits_disagreements_occupancy_and_other_paths(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            self.ours["gates"][KEPT] = ["tokens"]
            self.assertIsNone(self.apply(root))
            self.setUp()
            self.ours["gates"][MAIN] = ["tokens"]
            self.theirs["gates"][MAIN] = ["a11y"]
            self.theirs_text = json.dumps(self.theirs)
            self.assertIsNone(self.apply(root))
            self.setUp()
            self.ours["policy"]["mutationMin"] = 0
            self.assertIsNone(self.apply(root))
            self.setUp()
            self.ours["extra"] = 1
            self.assertIsNone(self.apply(root))
            self.setUp()
            self.assertIsNone(self.apply(root, rel="generated.json"))
            shard = root / "docs/design-system/component-certification.d/other.json"
            shard.parent.mkdir(parents=True)
            shard.write_text(json.dumps({"gates": {HEAD: ["tokens"]}}) + "\n")
            self.assertIsNone(self.apply(root))
            shard.write_text("{")
            self.assertIsNone(self.apply(root))

    def test_subset_of_main_returns_the_registry_only(self):
        self.ours = json.loads(json.dumps(self.base))
        with tempfile.TemporaryDirectory() as scratch:
            placed = self.apply(Path(scratch), branch="///")
            self.assertEqual(list(placed), [REL])
            self.assertEqual(placed[REL], self.theirs_text)

    def test_existing_shard_rows_merge_when_they_agree(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            rel = resolvers.certification_shard_rel("claude/ds-cert-s10")
            path = root / rel
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({
                "gates": {"apps/web/components/older.tsx": ["tests"]},
                "waivers": {"apps/web/components/older.tsx": {"empty": "Kept"}},
            }) + "\n")
            document = json.loads(self.apply(root)[rel])
            self.assertEqual(list(document["gates"]), [HEAD, "apps/web/components/older.tsx"])
            self.assertEqual(document["waivers"]["apps/web/components/older.tsx"]["empty"], "Kept")

    def test_real_git_conflict_is_repaired_through_the_list_machine(self):
        with tempfile.TemporaryDirectory() as scratch:
            work = Path(scratch)
            theirs_text = json.dumps(self.theirs, indent=2) + "\n"

            def sh(args, **kwargs):
                return subprocess.run(args, cwd=work, capture_output=True, text=True)

            def git(*args):
                result = sh(["git", *args])
                self.assertEqual(result.returncode, 0, result.stderr)
                return result.stdout.strip()

            git("init", "-q", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.test")
            git("config", "commit.gpgsign", "false")
            hooks = work / "hooks"
            hooks.mkdir()
            git("config", "core.hooksPath", str(hooks))
            target = work / REL
            target.parent.mkdir(parents=True)

            def save(document):
                target.write_text(json.dumps(document, indent=2) + "\n")
                git("add", REL)
                git("commit", "-qm", "fixture")

            save(self.base)
            git("branch", "feature")
            target.write_text(theirs_text)
            git("add", REL)
            git("commit", "-qm", "main")
            git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
            git("checkout", "-q", "feature")
            save(self.ours)
            self.assertTrue(edits.resolve_additive_list_conflict(
                work, "claude/ds-cert-s10", None, sh=sh,
                merge_entries=lambda _: None, push=False))
            self.assertEqual(target.read_text(), theirs_text)
            shard = work / resolvers.certification_shard_rel("claude/ds-cert-s10")
            document = json.loads(shard.read_text())
            self.assertEqual(list(document["gates"]), [HEAD])
            self.assertNotIn(MAIN, document["gates"])
            self.assertEqual(git("diff", "--name-only", "--diff-filter=U"), "")
            self.assertEqual(len(git("rev-parse", "HEAD^@").split()), 2)
            self.assertNotIn("<<<<<<<", target.read_text())


if __name__ == "__main__":
    unittest.main()

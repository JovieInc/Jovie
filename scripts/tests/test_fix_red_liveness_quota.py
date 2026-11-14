"""The liveness quota-deferral merge keeps both repairs and rejects other hunks."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_liveness_quota as quota  # noqa: E402


def _hunk(ours: str, theirs: str) -> str:
    """Conflict text whose source lines do not themselves start with markers."""
    return f"{'<' * 7} HEAD\n{ours}{'=' * 7}\n{theirs}{'>' * 7} origin/main\n"


_HEADER = (
    " * before\n"
    + _hunk(
        " * credential cannot hide a readable run list. Any other failure stays red.\n"
        " *\n"
        " * A quota denial returns quota-deferred (JOV-9993).\n",
        " * credential cannot hide a readable run list.\n"
        " *\n"
        " * JOV-10153: a double 403 defers while the shared budget is spent.\n",
    )
    + " * after\n"
)

_HELPERS = (
    "/**\n"
    + _hunk(
        " * Classifier evidence (JOV-9993).\n"
        " */\n"
        "export function quotaKindOf(read) {\n"
        "  return read;\n"
        "}\n"
        "\n"
        "/**\n"
        " * Denied non-GET responses.\n"
        " */\n"
        "export async function classifyDeniedResponse(response) {\n"
        "  return quotaKindOf(response);\n"
        "}\n"
        "\n"
        "/**\n"
        " * Run-list read that stays open on this side.\n",
        " * True when the shared installation REST budget is provably spent.\n",
    )
    + " */\n"
    "async function sharedBudgetSpent() {}\n"
)

_READ = (
    "export async function readGithubJson(url, { fetchImpl, token, apiUrl = '' }) {\n"
    "  const read = await readJson(fetchImpl, url, githubHeaders(token));\n"
    + _hunk(
        "  if (read.ok) return read;\n"
        "  const quotaKind = quotaKindOf(read);\n"
        "  if (quotaKind) return { ok: false, reason: 'quota-deferred', quotaKind };\n"
        "  return read;\n"
        "}\n"
        "\n"
        "const PUSH_RUNS_PAGE = 100;\n"
        "\n"
        "/**\n"
        " * When a merge-queue squash commit reached main.\n"
        " */\n"
        "export async function landedOnMainAt(repo, sha, committerDate, { fetchImpl, token, apiUrl }) {\n"
        "  return sha;\n"
        "}\n",
        "  if (read.ok || !token || read.reason !== 'http-403') return read;\n"
        "  if (await sharedBudgetSpent(fetchImpl, token, apiUrl))\n"
        "    return { ok: false, deferred: true, reason: 'quota-deferred' };\n"
        "  return recovery;\n"
        "}\n"
        "\n"
        "/**\n"
        " * Observation failure shape (JOV-10153).\n"
        " */\n"
        "export function githubReadFailure(read) {\n"
        "  return {\n"
        "    ok: false,\n"
        "    deferred: read.deferred === true,\n"
        "    reason: `github-${read.reason}`,\n"
        "  };\n"
        "}\n",
    )
    + "}\n"
)

_LIVENESS = (
    "import {\n"
    "  githubHeaders,\n"
    + _hunk(
        "  landedOnMainAt,\n",
        "  githubReadFailure,\n",
    )
    + "  readGithubJson,\n"
    "} from './lib/github-json-read.mjs';\n"
    "    for (const row of report.results) {\n"
    + _hunk(
        "      if (row.critical && !isQuotaDeferredRow(row))\n"
        "        state[livenessFingerprint(row.id)] =\n"
        "          row.status === 'fresh' ? 'green' : 'red';\n",
        "      if (!row.critical) continue;\n"
        "      const fingerprint = livenessFingerprint(row.id);\n"
        "      state[fingerprint] = alertStateFor(row.status, previous[fingerprint]);\n",
    )
    + "    }\n"
    "  process.stdout.write(\n"
    + _hunk(
        "    `${JSON.stringify({ status: report.status, red: report.results.filter(row => row.status !== 'fresh').map(row => row.id), quotaDeferred })}\\n`\n",
        "    `${JSON.stringify({ status: report.status, red: report.results.filter(row => !['fresh', 'deferred'].includes(row.status)).map(row => row.id) })}\\n`\n",
    )
    + "  );\n"
)


class LivenessQuotaMergeTest(unittest.TestCase):
    def test_read_keeps_classifier_short_circuit_and_spent_budget_deferral(self):
        resolved = quota.resolve_liveness_quota_text(
            quota._READ, _HEADER + _HELPERS + _READ)
        self.assertIsNotNone(resolved)
        self.assertNotIn("<" * 7, resolved)
        self.assertIn("JOV-9993", resolved)
        self.assertIn("JOV-10153", resolved)
        self.assertIn("export function quotaKindOf", resolved)
        self.assertIn("export async function classifyDeniedResponse", resolved)
        self.assertIn("async function sharedBudgetSpent", resolved)
        self.assertIn("const recoveryKind = quotaKindOf(read) ?? quotaKindOf(recovery);", resolved)
        self.assertIn("await sharedBudgetSpent(fetchImpl, token, apiUrl)", resolved)
        self.assertIn("deferred: true, reason: 'quota-deferred'", resolved)
        self.assertIn("export async function landedOnMainAt", resolved)
        self.assertIn("export function githubReadFailure", resolved)
        self.assertIn("const PUSH_RUNS_PAGE = 100;", resolved)
        self.assertEqual(resolved.count("export async function readGithubJson"), 1)
        self.assertIn("return sha;", resolved)
        body = resolved.split("export async function readGithubJson", 1)[1].split(
            "export async function landedOnMainAt", 1)[0]
        self.assertIn("return { ok: false, reason: read.reason };", body)
        self.assertNotIn("quotaKind: recoveryQuotaKind", body)

    def test_liveness_unions_import_state_and_stdout(self):
        resolved = quota.resolve_liveness_quota_text(quota._LIVENESS, _LIVENESS)
        self.assertIsNotNone(resolved)
        self.assertIn("  githubReadFailure,\n  landedOnMainAt,\n", resolved)
        self.assertIn("if (!row.critical || isQuotaDeferredRow(row)) continue;", resolved)
        self.assertIn("alertStateFor(row.status, previous[fingerprint])", resolved)
        self.assertIn(
            "!['fresh', 'deferred'].includes(row.status) && !isQuotaDeferredRow(row)",
            resolved)
        self.assertIn("quotaDeferred", resolved)

    def test_unknown_hunk_stays_unresolved(self):
        text = _hunk("keep ours\n", "keep theirs\n")
        self.assertIsNone(quota.resolve_liveness_quota_text(quota._READ, text))
        self.assertIsNone(quota.resolve_liveness_quota_text(quota._LIVENESS, text))
        self.assertIsNone(quota.resolve_liveness_quota_text("scripts/other.mjs", _LIVENESS))

    def test_open_worktree_conflicts_resolve_when_present(self):
        root = Path(__file__).resolve().parents[2]
        marker = "<" * 7
        for rel in (quota._READ, quota._LIVENESS):
            text = (root / rel).read_text()
            if marker not in text:
                continue
            resolved = quota.resolve_liveness_quota_text(rel, text)
            self.assertIsNotNone(resolved, rel)
            self.assertNotIn(marker, resolved)
            self.assertNotIn(">" * 7, resolved)


if __name__ == "__main__":
    unittest.main()

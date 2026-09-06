"""Regression tests for self-hosted agent workflow hygiene."""
import json
import os
import re
import stat
import subprocess
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"


HOT_PATH_WORKFLOWS = (
    "auto-ready-agent-drafts.yml",
    "agent-tick.yml",
    "auto-fix-lint-agent-drafts.yml",
    "stuck-draft-autoclose.yml",
    "merge-queue-autoenroll.yml",
)

FULL_CHECKOUT_JOBS = (
    ("ci.yml", "ci-unit-tests"),
)

FLEET_CONTROLLER_JOBS = (
    ("auto-pr-on-push.yml", "open-pr"),
    ("auto-ready-agent-drafts.yml", "auto-ready"),
    ("merge-queue-autoenroll.yml", "enroll"),
    ("merge-queue-autoenroll.yml", "rebase"),
    ("agent-tick.yml", "auto-ready"),
)

MODEL_OR_ADVISORY_JOBS = (
    ("claude.yml", "claude"),
    ("claude-review.yml", "review"),
    ("eval.yml", "eval"),
    ("eval-real-model.yml", "real-model-eval"),
    ("github-ai-orchestrator.yml", "implement_and_open_pr"),
    ("main-autofix.yml", "autofix"),
    ("sentry-autofix.yml", "autofix"),
    ("taste-classifier.yml", "classify"),
    ("taste-label-guard.yml", "guard"),
)

HOSTED_DEEP_EVIDENCE_JOBS = (
    ("e2e-full-matrix.yml", "e2e-full-matrix"),
    ("e2e-full-matrix.yml", "notify"),
    ("nightly-testing-agent.yml", "context"),
    ("nightly-testing-agent.yml", "deterministic"),
    ("nightly-testing-agent.yml", "mutation-hotspots"),
    ("nightly-testing-agent.yml", "candidate-validation"),
    ("nightly-testing-agent.yml", "report"),
    ("nightly-tests.yml", "knip"),
    ("nightly-tests.yml", "unit-tests"),
    ("nightly-tests.yml", "e2e-tests"),
    ("nightly-tests.yml", "notify"),
    ("synthetic-monitoring.yml", "synthetic-test"),
    ("test-coverage-audit.yml", "audit"),
    ("sonarcloud.yml", "sonarcloud"),
    ("security.yml", "gitleaks"),
    ("security.yml", "trufflehog"),
    ("security.yml", "trivy"),
    ("security.yml", "scorecard"),
    ("security.yml", "commit-signature-check"),
    ("screenshots.yml", "generate"),
    ("test-flakiness-report.yml", "analyze-flakiness"),
    ("ci-duration-ratchet.yml", "measure"),
    ("sentry-error-gate.yml", "sentry-gate"),
    ("cost-anomaly-gate.yml", "evaluate"),
    ("main-ci-health-monitor.yml", "monitor"),
    ("main-ci-health-monitor.yml", "auto-rerun"),
    ("visual-a11y.yml", "ci-visual-path-changes"),
    ("visual-a11y.yml", "storybook-a11y"),
    ("visual-regression.yml", "visual-regression"),
)

HOSTED_POST_MERGE_JOBS = (
    ("linear-sync-on-merge.yml", "sync_done"),
    ("neon-ephemeral-branch-cleanup.yml", "delete-neon-branch"),
)

def _writer_proof_body(
    head: str,
    pr_number: int,
    writer: str = "itstimwhite",
    issue: str = "JOV-5751",
) -> str:
    gates = (
        "exact-head",
        "writer",
        "required-tests",
        "review-sweep",
        "ticket-evidence",
        "pr-evidence",
        "writer-promotion-path",
    )
    receipt = {
        "schema": "jovie-writer-pr-proof/v1",
        "issuedAt": "2026-08-31T00:00:00.000Z",
        "issueId": issue,
        "prNumber": pr_number,
        "headSha": head,
        "writerLogin": writer,
        "ownership": "author-owned",
        "evidence": {
            "requiredTests": "passed: focused promotion tests",
            "reviewSweep": "complete: review comments checked",
            "ticketEvidence": "attached: Linear workpad current",
            "prEvidence": "attached: PR body current",
        },
        "promotion": {
            "path": "writer-owned-pr-promote",
            "readyAndNativeIntent": "same-bounded-action",
            "reconciliationRequired": False,
        },
        "gates": [
            {"id": gate, "passed": True, "reason": "test proof"} for gate in gates
        ],
        "proofComplete": True,
        "blockedBy": [],
    }
    return f"<!-- jovie-writer-pr-proof/v1\n{json.dumps(receipt, separators=(',', ':'))}\n-->"

HOSTED_API_ONLY_PR_CONTROLLERS = (
    ("dependabot-auto-merge.yml", "auto-merge"),
    ("pr-size-guard-label-override.yml", "override"),
)

HOSTED_BACKGROUND_CONTROLLER_JOBS = (
    ("agent-harness-health-report.yml", "report"),
    ("agent-landing-sweep.yml", "sweep"),
    ("agent-tick.yml", "landing-sweep"),
    ("agent-tick.yml", "cost-anomaly"),
    ("agent-tick.yml", "dispatch"),
    ("agent-tick.yml", "neon-cleanup"),
    ("agent-tick.yml", "synthetic-monitoring"),
    ("auto-fix-lint-agent-drafts.yml", "auto-fix-lint"),
    ("doc-gardening-agent.yml", "garden"),
    ("github-ai-dispatcher.yml", "dispatch"),
    ("github-ai-orchestrator.yml", "guard"),
    ("github-ai-orchestrator.yml", "claim_issue"),
    ("github-ai-orchestrator.yml", "finalize_claim"),
    ("neon-scheduled-cleanup.yml", "scheduled-cleanup"),
    ("observability-issue.yml", "sync-issue"),
    ("sentry-autofix-recurrence.yml", "recurrence"),
    ("reusable-ci-lint.yml", "lint"),
    ("reusable-ci-lint.yml", "typecheck"),
    ("reusable-ci-lint.yml", "knip"),
    ("reusable-ci-lint.yml", "env-example-guard"),
    ("reusable-ci-lint.yml", "promptfoo-evals"),
    ("reusable-ci-lint.yml", "golden-eval-set"),
)


def _job_block(workflow: str, job_name: str) -> str:
    """Return one top-level workflow job using its two-space YAML boundary."""
    content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
    marker = f"  {job_name}:\n"
    assert marker in content, f"{workflow}: missing jobs.{job_name}"
    remainder = content.split(marker, 1)[1]
    lines: list[str] = []
    for line in remainder.splitlines():
        if line.startswith("  ") and not line.startswith("    "):
            break
        lines.append(line)
    return "\n".join(lines)


def _step_block(workflow: str, step_name: str) -> str:
    """Return one workflow step using its six-space YAML boundary."""
    content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
    marker = f"      - name: {step_name}\n"
    assert marker in content, f"{workflow}: missing step {step_name}"
    remainder = content.split(marker, 1)[1]
    return remainder.split("\n      - name:", 1)[0]


def _sparse_checkout_paths(step_block: str) -> set[str]:
    """Return the literal paths from an actions/checkout sparse list."""
    marker = "          sparse-checkout: |\n"
    assert marker in step_block, "missing sparse-checkout list"
    paths: set[str] = set()
    for line in step_block.split(marker, 1)[1].splitlines():
        if not line.startswith("            "):
            break
        paths.add(line.strip())
    return paths


LOCAL_IMPORT_RE = re.compile(
    r"(?:from\s+|import\s*(?:\(\s*)?)[\"'](\.{1,2}/[^\"']+)[\"']"
)
LOCAL_RESOURCE_RE = re.compile(
    r"new URL\([\"'](\.{1,2}/[^\"']+)[\"'],\s*import\.meta\.url\)"
)


def _assert_local_runtime_closure(materialized: set[str], entrypoint: str) -> None:
    """Fail when materialized ESM references an omitted local dependency."""
    pending = [entrypoint]
    visited: set[str] = set()

    while pending:
        relative_path = pending.pop()
        if relative_path in visited:
            continue
        visited.add(relative_path)
        source_path = REPO_ROOT / relative_path
        source = source_path.read_text(encoding="utf-8")

        def assert_materialized(local_path: str) -> str:
            dependency = (source_path.parent / local_path).resolve()
            dependency_relative = dependency.relative_to(REPO_ROOT).as_posix()
            assert dependency_relative in materialized, (
                f"{relative_path} references {dependency_relative}, but the workflow "
                "sparse checkout does not materialize it"
            )
            return dependency_relative

        for import_path in LOCAL_IMPORT_RE.findall(source):
            pending.append(assert_materialized(import_path))
        for resource_path in LOCAL_RESOURCE_RE.findall(source):
            assert_materialized(resource_path)


def test_pr_preparation_canary_contract() -> None:
    driver = r"""
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const canary = await import(process.argv[1]);
const update = await import(process.argv[2]);
const now = Date.parse('2026-08-16T19:00:00Z');
const sha = 'a'.repeat(40);
const entry = {number:16001,action:'update_branch_rebase',expectedAuthor:'itstimwhite',
  expectedHeadOwner:'JovieInc',headRefName:'codex/preparation-16001',headOid:'1'.repeat(40)};
const plan = {schema:canary.PLAN_SCHEMA,repository:'JovieInc/Jovie',baseRef:'main',
  enabled:true,expiresAt:'2026-08-16T20:00:00Z',maxParallel:4,entries:[entry]};
assert.equal(canary.validatePlan(plan,{nowMs:now}).ok,true);
assert.match(canary.validatePlan({...plan,entries:Array(5).fill(entry)},{nowMs:now}).errors.join(),/exceed 4/);
assert.match(canary.validatePlan({...plan,expiresAt:'2026-08-16T18:00:00Z'},{nowMs:now}).errors.join(),/expired/);
const rawPlan = Buffer.from(JSON.stringify(plan));
const dryBundle = canary.createPlanBundle({rawPlan,plan,trustedDefaultBranchSha:sha,
  livePolicy:{defaultBranch:'main',sha},nowMs:now});
assert.equal(dryBundle.matrix.include.length,1);
assert.throws(() => canary.createPlanBundle({rawPlan,plan,trustedDefaultBranchSha:sha,
  livePolicy:{defaultBranch:'main',sha:'b'.repeat(40)},nowMs:now}),/live default-branch head/);
assert.throws(() => canary.createPlanBundle({rawPlan,plan,trustedDefaultBranchSha:sha,
  livePolicy:{defaultBranch:'main',sha},mode:'apply',confirmation:'wrong',nowMs:now}),/exact SHA-256/);
const checks = ['PR Ready','Migration Guard','Fork PR Gate','PR Size Guard'].map(name =>
  ({__typename:'CheckRun',name,status:'COMPLETED',conclusion:'SUCCESS'}));
const pr = {number:16001,state:'OPEN',isDraft:false,baseRefName:'main',baseRefOid:sha,
  headRefName:entry.headRefName,headRefOid:entry.headOid,isCrossRepository:false,
  mergeable:'MERGEABLE',mergeStateStatus:'BEHIND',reviewDecision:'APPROVED',
  author:{login:'itstimwhite'},headRepositoryOwner:{login:'JovieInc'},
  headRepository:{nameWithOwner:'JovieInc/Jovie'},mergeQueueEntry:null,autoMergeRequest:null,
  labels:[],statusCheckRollup:checks};
const policy = {defaultBranch:'main',sha};
assert.equal(canary.evaluateEligibility({entry,plan,pr,livePolicy:policy}).eligible,true);
assert.equal(canary.evaluateEligibility({entry,plan,pr:{...pr,labels:[{name:'merge-queue'}]},livePolicy:policy}).eligible,true);
for (const [patch,outcome] of [[{labels:[{name:'hold'}]},'no_op_held'],[{mergeQueueEntry:{id:'MQE'}},'no_op_already_admitted'],[{headRefOid:'b'.repeat(40)},'no_op_stale_head'],[{statusCheckRollup:[]},'no_op_checks_not_green']]) {
  assert.equal(canary.evaluateEligibility({entry,plan,pr:{...pr,...patch},livePolicy:policy}).outcome,outcome);
}
const temp = await mkdtemp(join(tmpdir(),'jovie-preparation-'));
try {
  const planPath = join(temp,'plan.json'); await writeFile(planPath,rawPlan);
  const receipts=[]; const calls=[];
  const result = await canary.runPreparedEntry({planPath,planHash:dryBundle.planHash,
    trustedDefaultBranchSha:sha,mode:'dry-run',confirmation:'',prNumber:16001,
    receiptPath:join(temp,'receipt.json'),runId:'1',runAttempt:'1'},
    {nowImpl:()=>now,fetchRepositoryPolicyImpl:async()=>policy,fetchPrImpl:async()=>pr,
      rebaseImpl:async args=>{calls.push(args);return {ok:true,updated:true,reason:'dry-run'};},
      writeReceiptImpl:async(_path,receipt)=>receipts.push(receipt)});
  assert.equal(result.outcome,'eligible_dry_run'); assert.deepEqual(receipts.map(x=>x.outcome),['initializing','started','eligible_dry_run']);
  assert.equal(calls[0].expectedHeadOid,entry.headOid); assert.equal(calls[0].expectedBaseOid,sha);
} finally { await rm(temp,{recursive:true,force:true}); }
const cancelled=canary.cancelledReceipt({outcome:'started',mutationAttempted:false},'SIGTERM',now); assert.equal(cancelled.outcome,'cancelled_indeterminate'); assert.equal(cancelled.mutationAttempted,null);
const snapshot = {...pr,id:'PR_1',potentialMergeCommit:null};
for (const expected of [{expectedBaseOid:'e'.repeat(40)},{expectedHeadOid:'f'.repeat(40)}]) { let proofs=0;
  const result = await update.tryGitHubRebase({repo:'JovieInc/Jovie',
    pr:{number:16001,headRefName:entry.headRefName},expectedBaseRefName:'main',...expected,
    dryRun:false,ghJsonImpl:async args=>args[0]==='api'?{object:{sha}}:snapshot,
    integrationProofImpl:async()=>{proofs+=1;}});
  assert.equal(result.ok,false); assert.equal(result.mutationAttempted,false); assert.equal(proofs,0);
}
"""
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            driver,
            (REPO_ROOT / "scripts/pr-preparation-canary.mjs").as_uri(),
            (REPO_ROOT / "scripts/lib/github-update-branch.mjs").as_uri(),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_pr_preparation_canary_workflow_is_manual_bounded_and_queue_inert() -> None:
    workflow = (WORKFLOWS / "pr-preparation-canary.yml").read_text(encoding="utf-8")
    trigger = workflow.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
    permissions = workflow.split("\npermissions:\n", 1)[1].split("\njobs:\n", 1)[0]
    assert "workflow_dispatch:" in trigger
    assert all(event not in trigger for event in ("schedule:", "push:", "pull_request:"))
    assert workflow.count("\npermissions:\n") == 1
    assert permissions == "  contents: read\n  pull-requests: read"
    assert "${{ secrets." not in workflow
    assert "${{ secrets[" not in workflow
    assert ": write" not in workflow
    assert "max-parallel: 4" in workflow and "fail-fast: false" in workflow
    assert workflow.count("timeout-minutes: 10") == 2
    assert "merge-queue-drain-mutex" not in workflow
    assert "JOVIE_BOT_PRIVATE_KEY" not in workflow
    assert "create-github-app-token" not in workflow
    assert "--mode dry-run" in workflow and "--mode apply" not in workflow
    assert workflow.count("if-no-files-found: error") == 2
    assert "if-no-files-found: ignore" not in workflow
    assert "continue-on-error: true" not in workflow
    assert "ref: main" in workflow
    assert "ref: ${{ needs.plan.outputs.trusted_default_sha }}" in workflow
    source = (REPO_ROOT / "scripts/pr-preparation-canary.mjs").read_text(encoding="utf-8")
    for forbidden in ("gh pr merge", "--add-label", "enqueuePullRequest", "--force"):
        assert forbidden not in workflow + source


def test_agent_hot_paths_do_not_run_repo_tests() -> None:
    """Fleet scans must not fail on a contaminated sparse self-hosted checkout."""
    for workflow_name in HOT_PATH_WORKFLOWS:
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "test_gh_retry.py" not in content, workflow_name


def test_stuck_draft_autoclose_is_manual_and_hosted_only() -> None:
    """The all-PR drain must never schedule an automatic draft closer."""
    workflow = (WORKFLOWS / "stuck-draft-autoclose.yml").read_text(
        encoding="utf-8"
    )
    trigger_block = workflow.split("\non:\n", 1)[1].split(
        "\nconcurrency:", 1
    )[0]

    assert "workflow_dispatch:" in trigger_block
    assert "schedule:" not in trigger_block
    assert "runs-on: ubuntu-latest" in _job_block(
        "stuck-draft-autoclose.yml", "autoclose"
    )
    assert "CI_FAST_RUNNER" not in _job_block(
        "stuck-draft-autoclose.yml", "autoclose"
    )


def test_merge_queue_ruleset_verify_is_scheduled_not_pr_ready() -> None:
    """Live ruleset parity must run; it must not become a source PR gate."""
    workflow = (WORKFLOWS / "merge-queue-ruleset-verify.yml").read_text(
        encoding="utf-8"
    )
    trigger_block = workflow.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert "schedule:" in trigger_block
    assert "workflow_dispatch:" in trigger_block
    assert "pull_request" not in trigger_block
    assert "node scripts/ci-merge-queue-check.mjs verify" in workflow
    assert "ci-harness/manifest.json" not in workflow


def test_slop_gate_is_post_merge_informational() -> None:
    """Copy smell stays off PR Ready; taste is post-ship."""
    workflow = (WORKFLOWS / "slop-gate.yml").read_text(encoding="utf-8")
    trigger_block = workflow.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert "schedule:" in trigger_block
    assert "workflow_dispatch:" in trigger_block
    assert "pull_request" not in trigger_block
    assert "ci-harness/manifest.json" in workflow
    assert "continue-on-error: true" in workflow
    assert "HEAD~1" not in workflow
    assert "--before='7 days ago'" in workflow


def test_agent_pipeline_retires_dead_qc_wires() -> None:
    """Scope Judge, self-attested GStack comments, and denylist classifier stay gone."""
    workflow = (WORKFLOWS / "agent-pipeline.yml").read_text(encoding="utf-8")
    trigger_block = workflow.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert '"Scope Judge"' not in trigger_block
    assert 'workflows: ["CI"]' in trigger_block
    assert "AGENT_RUN_SOURCE_RUN_ID" not in workflow
    assert "check-agent-gate-evidence.ts" not in workflow
    assert "gstack-gates" not in workflow
    assert 'Scope judge (diff aligns with ticket intent)' not in workflow
    assert "retries_exhausted" in workflow
    assert "SLACK_WEBHOOK_URL" in _job_block("agent-pipeline.yml", "exhaust")
    assert "LINEAR_API_KEY" in _job_block("agent-pipeline.yml", "exhaust")
    assert "stale-cleanup:" not in workflow
    assert "needs-human-autoclose.mjs" not in workflow
    assert "scripts/lib/agent-branch-pattern.mjs" in workflow
    assert "scripts/lib/agent-branch-pattern.mjs --match" in workflow
    landing = (WORKFLOWS / "agent-landing-sweep.yml").read_text(encoding="utf-8")
    assert "scope-judge" not in landing
    assert "Scope Judge" not in landing.split("\njobs:", 1)[1]


def test_node_only_agent_jobs_do_not_write_to_system_corepack_dir() -> None:
    """Node scripts must not call corepack enable on locked-down runners."""
    for workflow_name in (
        "agent-pipeline.yml",
        "pr-conflict-handler.yml",
        "merge-queue-autoenroll.yml",
    ):
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "run: corepack enable" not in content, workflow_name


def test_workflow_test_tooling_is_hash_pinned() -> None:
    """Security tooling installs must keep package integrity evidence in-repo."""
    requirements_path = REPO_ROOT / ".github" / "requirements" / "pytest.txt"
    requirements = requirements_path.read_text(encoding="utf-8")
    logical_requirements = requirements.replace("\\\n", " ").splitlines()

    assert any(
        requirement.split(maxsplit=1)[0] == "pytest==9.0.3"
        for requirement in logical_requirements
        if requirement and not requirement.startswith("#")
    )
    for requirement in logical_requirements:
        if not requirement or requirement.startswith("#"):
            continue
        assert "==" in requirement, requirement
        assert "--hash=sha256:" in requirement, requirement

    install_command = (
        "python -m pip install --quiet --require-hashes "
        "-r .github/requirements/pytest.txt"
    )
    for workflow_name in (
        "actionlint.yml",
        "brand-scrub.yml",
        "ci.yml",
        "slop-gate.yml",
    ):
        workflow = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert install_command in workflow, workflow_name
        assert "pip install pytest" not in workflow, workflow_name


def test_autofix_uses_corepack_for_pnpm_distribution() -> None:
    """Avoid an unhashed npm global install on the automated repair path."""
    script = (REPO_ROOT / "scripts" / "auto-fix-lint-agent-drafts.sh").read_text(
        encoding="utf-8"
    )
    workflow = (WORKFLOWS / "auto-fix-lint-agent-drafts.yml").read_text(
        encoding="utf-8"
    )

    assert "npm install -g pnpm@" not in script
    assert "corepack prepare pnpm@9.15.4 --activate" in script
    assert "pnpm install --frozen-lockfile --ignore-scripts" in script
    assert "env -u GH_TOKEN -u GITHUB_TOKEN -u NODE_AUTH_TOKEN" in script
    assert ".headOwner == $repo_owner" in script
    assert "headOwner/$headRepo.git" not in script
    assert "persist-credentials: false" in workflow
    assert "TARGET_PR_NUMBER" in script
    assert 'gh_retry pr view "$TARGET_PR_NUMBER"' in script
    assert "github.event.workflow_run.conclusion == 'failure'" in workflow
    assert "github.event.workflow_run.pull_requests[0].number != null" in workflow


def test_repair_controllers_use_causal_events_instead_of_polling() -> None:
    """Repairs run from the state change they reconcile, without duplicate clocks."""
    autofix = (WORKFLOWS / "auto-fix-lint-agent-drafts.yml").read_text(
        encoding="utf-8"
    )
    receipts = (WORKFLOWS / "delivery-control-receipts.yml").read_text(
        encoding="utf-8"
    )
    conflicts = (WORKFLOWS / "pr-conflict-handler.yml").read_text(
        encoding="utf-8"
    )

    assert "schedule:" not in autofix
    assert "workflows: ['CI']" in autofix
    assert "schedule:" not in receipts
    assert "workflow_run:" in receipts
    assert "--reconcile" not in receipts
    assert "schedule:" not in conflicts
    assert "push:" in conflicts and "branches: [main]" in conflicts
    assert "workflows: ['CI']" in conflicts


def test_sha_bound_nightlies_skip_only_repeated_scheduled_heads() -> None:
    """Expensive clocks fail closed and manual dispatches always execute."""
    action = (
        REPO_ROOT / ".github" / "actions" / "skip-if-unchanged" / "action.yml"
    ).read_text(encoding="utf-8")

    assert 'if [[ "$EVENT" != "schedule" ]]' in action
    assert 'echo "skip=false"' in action
    assert "^[0-9a-f]{40}$" in action
    assert "--branch main --event schedule --status success" in action
    assert '[[ -n "$last" && "$last" == "$SHA" ]]' in action

    for workflow_name in (
        "nightly-testing-agent.yml",
        "nightly-tests.yml",
        "sonarcloud.yml",
    ):
        workflow = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "actions: read" in workflow, workflow_name
        assert "uses: ./.github/actions/skip-if-unchanged" in workflow, workflow_name
        assert "needs: unchanged" in workflow, workflow_name
        assert "needs.unchanged.outputs.skip != 'true'" in workflow, workflow_name

    live_model = (WORKFLOWS / "eval-real-model.yml").read_text(encoding="utf-8")
    nightly = (WORKFLOWS / "nightly-tests.yml").read_text(encoding="utf-8")
    assert "uses: ./.github/actions/skip-if-unchanged" not in live_model
    assert "needs: unchanged" not in _job_block("nightly-tests.yml", "e2e-tests")
    assert "needs.unchanged.outputs.skip" not in _job_block(
        "nightly-tests.yml", "e2e-tests"
    )


def test_event_complete_workflows_do_not_retain_fallback_clocks() -> None:
    """Path-complete main events own screenshots; live external drift keeps its clock."""
    screenshots = (WORKFLOWS / "screenshots.yml").read_text(encoding="utf-8")
    screenshot_triggers = screenshots.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    ruleset = (WORKFLOWS / "merge-queue-ruleset-verify.yml").read_text(
        encoding="utf-8"
    )
    ruleset_triggers = ruleset.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]

    assert "push:" in screenshot_triggers
    assert "workflow_dispatch:" in screenshot_triggers
    assert "schedule:" not in screenshot_triggers
    assert "schedule:" in ruleset_triggers


def test_agent_landing_does_not_treat_risk_classifier_as_human_merge_gate() -> None:
    """Autonomous shipping uses machine gates and never creates a human hold."""
    for workflow_name in (
        "agent-pipeline.yml",
        "agent-landing-sweep.yml",
        "agent-tick.yml",
        "main-autofix.yml",
        "sentry-autofix.yml",
        "github-ai-orchestrator.yml",
    ):
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "blocksUnattendedAutoMerge == true" not in content, workflow_name
        assert not re.search(
            r"--add-label(?:=|\s+)[\"']?(?:needs-human|no-auto)", content
        ), workflow_name
        assert "Has needs-human label. Skipping" not in content, workflow_name
        assert "requires human review; skipping" not in content, workflow_name


def test_retired_human_hold_labels_are_removed_at_the_pr_boundary() -> None:
    """A stale workflow or manual label action cannot create a durable hold."""
    scrub = (WORKFLOWS / "legacy-human-hold-scrub.yml").read_text(
        encoding="utf-8"
    )
    trigger = scrub.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]

    assert "pull_request_target:" in trigger
    assert "issues:" in trigger
    assert "types: [labeled]" in trigger
    assert "schedule:" in trigger
    assert "workflow_dispatch:" in trigger
    assert "actions/checkout" not in scrub
    assert 'gh api --method DELETE "repos/$GH_REPO/labels/$LABEL"' in scrub
    for label in (
        "needs-human",
        "needs-human-review",
        "needs-human-taste",
        "needs:taste",
        "human-review-required",
        "no-auto",
        "no-auto-merge",
        "no-automerge",
    ):
        assert f"github.event.label.name == '{label}'" in scrub
        assert f" {label}" in scrub


def test_claude_mention_requires_write_capable_association() -> None:
    """Public @claude mentions must not mint a write token for strangers."""
    workflow = (WORKFLOWS / "claude.yml").read_text(encoding="utf-8")
    job = _job_block("claude.yml", "claude")

    assert "github.event.comment.author_association == 'OWNER'" in job
    assert "github.event.comment.author_association == 'MEMBER'" in job
    assert "github.event.comment.author_association == 'COLLABORATOR'" in job
    assert "github.actor == 'coderabbitai[bot]'" in job
    assert "allowed_bots: 'coderabbitai[bot]'" in workflow
    assert "author_association == 'CONTRIBUTOR'" not in job
    assert "author_association == 'NONE'" not in job


def test_trigger_guard_materializes_systemic_detector_import_closure() -> None:
    """The detector must not fail before it can classify a systemic failure."""
    step = _step_block("agent-pipeline.yml", "Checkout systemic detector")
    materialized = _sparse_checkout_paths(step)
    entrypoint = "scripts/lib/detect-systemic-failures.mjs"

    assert entrypoint in materialized
    _assert_local_runtime_closure(materialized, entrypoint)


def test_self_hosted_gate_jobs_materialize_full_checkout() -> None:
    """Jobs that need repo scripts/actions must recover from sparse workspaces."""
    required_steps = (
        "Reset workspace git state (self-hosted)",
        "uses: actions/checkout@",
        "Materialize full tree (self-hosted)",
        "git checkout-index -a -f",
        "Verify checkout sentinel",
        "uses: ./.github/actions/setup-node-pnpm",
    )

    for workflow_name, job_name in FULL_CHECKOUT_JOBS:
        block = _job_block(workflow_name, job_name)
        positions = []
        for step in required_steps:
            assert step in block, (workflow_name, job_name, step)
            positions.append(block.index(step))
        assert positions == sorted(positions), (workflow_name, job_name)


def test_trufflehog_job_does_not_require_docker() -> None:
    """Self-hosted runners do not expose a Docker socket for trufflehog action."""
    content = (WORKFLOWS / "security.yml").read_text(encoding="utf-8")
    assert "trufflesecurity/trufflehog@" not in content
    assert "ci-pr-trufflehog" in content


def test_merge_gated_secret_scans_use_clean_hosted_runners() -> None:
    """Secret scanners need a fresh, authoritative Git object store."""
    for job_name in ("gitleaks", "trufflehog"):
        block = _job_block("security.yml", job_name)
        assert "runs-on: ubuntu-latest" in block, job_name
        assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block, job_name


def test_gated_secret_scan_fetches_only_the_exact_event_range() -> None:
    """The fast gate must not fetch every branch and tag to scan one diff."""
    block = _job_block("ci.yml", "ci-secret-scan")

    assert "fetch-depth: 1" in block
    assert "fetch-depth: 0" not in block
    assert "prepare-ci-secret-scan-range.sh" in block
    assert "github.event.pull_request.base.sha" in block
    assert "github.event.pull_request.base.ref" in block
    assert "github.event.pull_request.head.sha" in block
    assert 'CURRENT_REF="refs/pull/${{ github.event.pull_request.number }}/head"' in block
    assert (
        "PULL_REQUEST_BASE_REF: ${{ github.event.pull_request.base.ref }}" in block
    )
    assert 'CURRENT_BASE_REF="refs/heads/$PULL_REQUEST_BASE_REF"' in block
    assert 'CURRENT_BASE_REF="refs/heads/${{ github.event.pull_request.base.ref }}"' not in block
    assert "github.event.merge_group.base_sha" in block
    assert "github.event.before" in block
    assert (
        '"$BASE_SHA" "$GITHUB_SHA" "$CURRENT_REF" "$CURRENT_SHA" \\\n'
        '            "$CURRENT_BASE_REF"'
    ) in block
    assert 'BASE_SHA="$(git rev-parse refs/secret-scan/exact-base)"' in block
    assert 'SECRET_SCAN_REMOTE_CURRENT_REF="$CURRENT_REF"' in block
    assert 'SECRET_SCAN_REMOTE_CURRENT_SHA="$CURRENT_SHA"' in block
    assert 'SECRET_SCAN_REMOTE_BASE_SHA="$BASE_SHA"' in block
    assert 'scan-secrets.sh ci-pr "$BASE_SHA"' in block
    assert 'git fetch origin "${{ github.base_ref }}"' not in block

    helper = REPO_ROOT / "scripts/security/prepare-ci-secret-scan-range.sh"
    assert helper.is_file()
    assert os.access(helper, os.X_OK)


def test_fleet_controllers_checkout_main_policy_code() -> None:
    """PR events must not replace fleet scripts with the triggering merge ref."""
    for workflow, job_name in FLEET_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "uses: actions/checkout@" in block, (workflow, job_name)
        assert "ref: main" in block, (workflow, job_name)
        assert "persist-credentials: false" in block, (workflow, job_name)


def test_gh_fleet_controllers_use_hosted_cli_contract() -> None:
    """Controller jobs invoking gh must not depend on heterogeneous runners."""
    for workflow, job_name in FLEET_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "run: gh --version" in block, (workflow, job_name)


def test_conflict_handler_coalesces_audits_without_cancelling_manual_apply() -> None:
    """CI-completion audits may supersede each other, never operator runs."""
    block = _job_block("pr-conflict-handler.yml", "plan")

    assert "runs-on: ubuntu-latest" in block
    assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block
    assert "github.event.workflow_run.event == 'pull_request'" in block
    assert "github.event.workflow_run.conclusion != 'cancelled'" in block
    assert (
        "group: pr-conflict-handler-${{ github.repository }}-"
        "${{ github.event_name == 'workflow_dispatch' && "
        "'operator' || 'audit' }}"
    ) in block
    assert (
        "cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}"
        in block
    )
    assert "EVENT_NAME: ${{ github.event_name }}" in block
    assert "APPLY_INPUT: ${{ inputs.apply || 'false' }}" in block
    assert 'if [[ "$EVENT_NAME" == "workflow_dispatch"' in block
    assert '"$APPLY_INPUT" == "true"' in block
    assert 'MODE="--apply"' in block


def test_conflict_handler_reserves_app_token_for_bounded_mutations() -> None:
    """Fleet reads cannot consume the App installation's writer budget."""
    block = _job_block("pr-conflict-handler.yml", "plan")
    ledger = _job_block("pr-conflict-handler.yml", "record_cohort")

    assert "GH_TOKEN: ${{ github.token }}" in block
    assert "GH_QUEUE_TOKEN: ${{ github.token }}" in block
    assert "GH_MUTATION_TOKEN: ${{ steps.app-token.outputs.token }}" in block
    assert 'GH_TOKEN="$GH_MUTATION_TOKEN" gh api -X POST' in block
    fleet = (
        REPO_ROOT / "scripts/pr-conflict-handler.mjs"
    ).read_text(encoding="utf-8")
    assert "fetchCompleteOpenPrSummariesRest" in fleet
    assert "hydrateOpenPrGraphqlMetadata" in fleet
    assert "hydrateOpenPrStatusContexts" in fleet
    assert "'pr',\n    'list'" not in fleet
    assert "statusCheckRollup'].join" not in fleet
    assert "GH_TOKEN: ${{ github.token }}" in ledger
    assert "GH_LEDGER_TOKEN: ${{ steps.app-token.outputs.token }}" in ledger
    assert 'GH_TOKEN="$GH_LEDGER_TOKEN" gh api -X POST' in ledger
    assert 'GH_TOKEN="$GH_LEDGER_TOKEN" gh api -X PATCH' in ledger


def test_conflict_cohort_batches_poll_reads_and_fails_closed_on_ledger_lookup() -> None:
    """A 40-PR cohort must stay under the workflow token's read budget."""
    ledger = _job_block("pr-conflict-handler.yml", "record_cohort")
    assignments = {}
    for name in (
        "poll_interval_seconds",
        "poll_deadline_seconds",
        "max_ci_run_pages",
        "max_cohort_size",
    ):
        match = re.search(rf"^\s*{name}=(\d+)$", ledger, re.MULTILINE)
        assert match, name
        assignments[name] = int(match.group(1))

    polls = (
        assignments["poll_deadline_seconds"]
        + assignments["poll_interval_seconds"]
        - 1
    ) // assignments["poll_interval_seconds"]
    fixed_read_ceiling = 5 * assignments["max_cohort_size"] + 20
    worst_case_reads = fixed_read_ceiling + polls * (
        1 + assignments["max_ci_run_pages"]
    )
    assert worst_case_reads == 460
    assert worst_case_reads < 1000

    poll = ledger.split(
        "deadline=$((SECONDS + poll_deadline_seconds))", 1
    )[1].split("timed_out=", 1)[0]
    assert 'repos/$REPOSITORY/pulls/$pr' not in poll
    assert "actions/workflows/ci.yml/runs?head_sha" not in poll
    assert "buildConflictCohortLiveHeadQuery" in poll
    assert "indexLatestConflictCohortCiRuns" in poll
    assert "gh api graphql" in poll
    assert "page <= max_ci_run_pages" in poll

    assert "--paginate --slurp" in ledger
    assert "duplicate cohort receipts" in ledger
    assert "| head -1 || true" not in ledger


def test_workflow_run_controllers_ignore_non_pr_and_stale_runs() -> None:
    """Main/merge-group completions must not wake PR fleet controllers."""
    for workflow, job_name in (
        ("merge-queue-autoenroll.yml", "enroll"),
        ("pr-conflict-handler.yml", "plan"),
    ):
        block = _job_block(workflow, job_name)
        assert "github.event.workflow_run.event == 'pull_request'" in block, workflow
        assert "github.event.workflow_run.conclusion != 'cancelled'" in block, workflow

    auto_ready = (WORKFLOWS / "auto-ready-agent-drafts.yml").read_text(
        encoding="utf-8"
    )
    assert "workflow_dispatch:" in auto_ready
    assert "workflow_run:" not in auto_ready
    assert "pull_request:" not in auto_ready

    pipeline = _job_block("agent-pipeline.yml", "guard")
    assert "github.event.workflow_run.event == 'pull_request'" in pipeline
    assert 'if [[ "$PR_HEAD_SHA" != "$HEAD_SHA" ]]' in pipeline
    assert "workflow_run.pull_requests[0].number" in pipeline
    assert "pulls?state=open" not in pipeline


def test_agent_pipeline_retry_budget_is_durable() -> None:
    """Each remediation run must record the attempt its guard counted."""
    fix = _job_block("agent-pipeline.yml", "fix")
    assert "Record bounded remediation attempt" in fix
    assert 'ATTEMPT_LABEL="agent-fix-${TRIGGER_TYPE}-${SHORT_SHA}-${ATTEMPT}"' in fix
    assert '"labels[]=$ATTEMPT_LABEL"' in fix


def test_agent_pipeline_remediation_mutex_is_scoped_per_pr() -> None:
    """Independent PR remediations run concurrently while retries stay serial."""
    guard = _job_block("agent-pipeline.yml", "guard")
    fix = _job_block("agent-pipeline.yml", "fix")

    assert "pr_number: ${{ steps.evaluate.outputs.pr_number }}" in guard
    assert (
        "group: agent-remediation-${{ github.repository }}-"
        "${{ needs.guard.outputs.pr_number }}"
    ) in fix
    assert "group: agent-remediation-${{ github.repository }}\n" not in fix
    assert "cancel-in-progress: false" in fix


def test_conflict_paths_preserve_native_queue_and_use_only_non_force_delivery() -> None:
    """Conflict delivery has no force-push, ready flip, direct merge, or dequeue."""
    fleet = (REPO_ROOT / "scripts/pr-conflict-handler.mjs").read_text(
        encoding="utf-8"
    )
    workflow = (WORKFLOWS / "pr-conflict-handler.yml").read_text(
        encoding="utf-8"
    )

    assert not (WORKFLOWS / "auto-resolve-conflicts.yml").exists()
    assert not (REPO_ROOT / ".github/scripts/resolve-pr-conflict.mjs").exists()
    assert not (WORKFLOWS / "agent-pr-verify-ready.yml").exists()
    assert "tryGitHubRebase" in fleet
    assert "git merge" not in fleet
    assert "force-with-lease" not in fleet
    assert "gh pr update-branch" not in fleet
    assert "JOV-INV-021" in workflow
    assert "fx ask" in workflow
    assert "FX_MODEL: openai/gpt-5.6-sol" in workflow
    assert workflow.count("actions/create-github-app-token@") >= 2
    assert (
        workflow.count(
            "max-parallel: ${{ fromJSON(needs.plan.outputs.adaptive_cap) }}"
        )
        >= 2
    )
    for exact_identity_check in (
        'pulls/$PR_NUMBER',
        ".head.sha",
        "ref(qualifiedName:$qualifiedName)",
        ".data.repository.ref.target.oid",
        '.state == "open"',
        ".draft == $draft",
        ".autoMerge == $autoMerge",
        ".sameRepo == true",
        ".ref == $ref",
    ):
        assert exact_identity_check in workflow
    assert ".base.sha" not in workflow
    assert re.search(
        r'push\s+"https://github\.com/\$REPOSITORY\.git"\s+'
        r'"(?:HEAD|\$[A-Z_]*(?:HEAD|COMMIT)):refs/heads/\$HEAD_REF"',
        workflow,
        re.IGNORECASE,
    )
    assert "expected_base:0:12" not in workflow
    assert "BASE_HEAD:0:12" not in workflow
    for forbidden in (
        "force-with-lease",
        "git push --force",
        "gh pr merge",
        "gh pr ready",
        "dequeuePullRequest",
        "disablePullRequestAutoMerge",
        "merge-queue-backend.mjs dequeue",
        "withgraphite/graphite-ci-action",
    ):
        assert forbidden not in workflow


def test_standalone_health_monitors_have_independent_bounded_schedules() -> None:
    """Critical monitors must not depend on the disabled Agent Tick monolith."""
    schedules = {
        "main-ci-health-monitor.yml": "'8,28,48 * * * *'",
        "runner-health-monitor.yml": "'2,12,22,32,42,52 * * * *'",
        "synthetic-monitoring.yml": "'17 */6 * * *'",
    }
    for workflow, cron in schedules.items():
        content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
        assert "schedule:" in content, workflow
        assert cron in content, workflow

    for workflow, job_name in (
        ("main-ci-health-monitor.yml", "monitor"),
        ("main-ci-health-monitor.yml", "auto-rerun"),
        ("runner-health-monitor.yml", "monitor"),
    ):
        assert "runs-on: ubuntu-latest" in _job_block(workflow, job_name)


def test_main_autofix_waits_for_rerun_and_exact_sha_repair_ownership() -> None:
    """Schedule ticks must not dispatch or alert repeatedly for owned failures."""
    evaluator = (
        REPO_ROOT / ".github/actions/eval-main-health/action.yml"
    ).read_text(encoding="utf-8")
    autofix = (WORKFLOWS / "main-autofix.yml").read_text(encoding="utf-8")

    assert "const failingRunAttempt = Number(latestFailure?.run_attempt ?? 0)" in evaluator
    assert "failingRunAttempt < 2" in evaluator
    assert "autofixSkipReason = 'awaiting_one_shot_rerun'" in evaluator
    assert "repairInFlight = openPulls.some" in evaluator
    assert "run.head_sha === failingSha" in evaluator
    assert "github.rest.repos.listCommitStatusesForRef" in evaluator
    assert "github.rest.repos.getCommit" in evaluator
    assert "latestFailure.head_sha !== currentMainSha" in evaluator
    assert "ownedAttempts >= autofixAttemptLimit" in evaluator
    assert "withinLease(latestOwnershipStatus.created_at)" in evaluator
    assert "uncertain:repair_state_unavailable" in evaluator
    assert "status.context === 'main-autofix/ownership'" in evaluator
    assert "description.match(/^owned:run-" in evaluator
    assert "description.startsWith('terminal:')" in evaluator
    assert "const recentAttemptShas = new Set([currentFailingSha])" in evaluator
    assert "(status.description ?? '').startsWith('owned:')" in evaluator
    assert "candidateStatuses = await github.paginate" in evaluator
    assert "if (r.head_sha) recentShas.add(r.head_sha)" not in evaluator
    assert "autofixSkipReason = 'repair_in_flight'" in evaluator
    assert "autofixSkipReason = 'repair_marker_owned'" in evaluator
    assert "autofixSkipReason = 'terminal_repair_recorded'" in evaluator
    assert "autofixSkipReason = 'repair_state_unavailable'" in evaluator
    assert "const shouldAlert =" in evaluator
    assert "(repairStateKnown || firstUncertaintyAlert)" in evaluator
    assert "failingRunAttempt === 1" in evaluator
    assert autofix.count("context: 'main-autofix/ownership'") == 2
    assert "Record exact-SHA repair ownership" in autofix
    assert "Finalize exact-SHA repair ownership" in autofix
    assert "terminal:no_changes" in autofix
    assert "released:pr-${prNumber}" in autofix
    assert "forcing autofix" not in autofix
    assert "dispatch_target_not_current_failure" in autofix

    for workflow, job_name in (
        ("main-ci-health-monitor.yml", "monitor"),
        ("main-autofix.yml", "evaluate"),
    ):
        assert "statuses: write" in _job_block(workflow, job_name)

    agent_tick = (WORKFLOWS / "agent-tick.yml").read_text(encoding="utf-8")
    assert "\n  main-ci-health:\n" not in agent_tick
    agent_tick_trigger = agent_tick.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert "workflow_dispatch:" in agent_tick_trigger
    assert "schedule:" not in agent_tick_trigger

    landing_sweep = _job_block("agent-tick.yml", "landing-sweep")
    assert "statuses: read" in landing_sweep
    assert "statuses: write" not in landing_sweep


def test_auto_ready_compensates_live_hold_race(tmp_path: Path) -> None:
    """A hold racing in after a writer-proofed promotion restores draft."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    state_file = tmp_path / "state"
    state_file.write_text("draft", encoding="utf-8")
    call_log = tmp_path / "calls.log"
    fx_child_head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    fx_source_head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    proof_body = json.dumps(_writer_proof_body(fx_child_head, 42))
    fake_gh = fake_bin / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >> {call_log}
            if [[ "$1 $2" == "pr list" ]]; then
              printf '%s\\n' '[{{"n":42,"t":"race guard","draft":true,"head":"codex/race","oid":"{fx_child_head}","body":{proof_body},"author":"itstimwhite","L":[]}}]'
            elif [[ "$1 $2" == "pr view" ]]; then
              phase="$(cat {state_file})"
              if [[ "$phase" == "promoted" ]]; then
                printf '%s\\n' '{{"draft":false,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":["gated"],"state":"OPEN","autoMerge":true,"queued":false}}'
              elif [[ "$phase" == "restored" ]]; then
                printf '%s\\n' '{{"draft":true,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":["gated"],"state":"OPEN","autoMerge":false,"queued":false}}'
              else
                printf '%s\\n' '{{"draft":true,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":[],"state":"OPEN","autoMerge":false,"queued":false}}'
              fi
            elif [[ "$1 $2" == "pr checks" ]]; then
              printf 'fake gh must never wait for checks before promotion\\n' >&2
              exit 2
            elif [[ "$1 $2" == "pr ready" ]]; then
              if [[ " $* " == *" --undo "* ]]; then
                printf '%s\\n' restored > {state_file}
              else
                printf '%s\\n' ready > {state_file}
              fi
            elif [[ "$1 $2" == "pr merge" ]]; then
              if [[ " $* " == *" --disable-auto "* ]]; then
                :
              else
                printf '%s\\n' promoted > {state_file}
              fi
            elif [[ "$1" == "api" ]]; then
              case "$2" in
                graphql)
                  phase="$(cat {state_file})"
                  if [[ "$phase" == "promoted" ]]; then
                    printf '%s\\n' '{{"draft":false,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":["gated"],"state":"OPEN","autoMerge":true,"queued":false}}'
                  elif [[ "$phase" == "restored" ]]; then
                    printf '%s\\n' '{{"draft":true,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":["gated"],"state":"OPEN","autoMerge":false,"queued":false}}'
                  else
                    printf '%s\\n' '{{"draft":true,"head":"{fx_child_head}","branch":"codex/race","body":{proof_body},"labels":[],"state":"OPEN","autoMerge":false,"queued":false}}'
                  fi
                  ;;
                repos/*/commits/*)
                  printf '%s\\n' '{{"sha":"{fx_child_head}","message":"fix(ci): fx repair\\n\\nFX-Source-Head: {fx_source_head}\\n","parentShas":["{fx_source_head}"],"authorName":"jovie-fx[bot]","authorEmail":"jovie-fx[bot]@users.noreply.github.com","authorLogin":"jovie-bot[bot]","committerName":"jovie-fx[bot]","committerEmail":"jovie-fx[bot]@users.noreply.github.com","committerLogin":"jovie-bot[bot]","verified":true}}'
                  ;;
                repos/*/actions/workflows/rolling-ci-dispatch.yml/runs*)
                  printf '%s\\n' '{{"workflowPath":".github/workflows/rolling-ci-dispatch.yml","workflowName":"Rolling CI Dispatch","conclusion":"success","event":"workflow_run","actorLogin":"jovie-bot[bot]","headSha":"{fx_source_head}"}}'
                  ;;
                *)
                  :
                  ;;
              esac
            elif [[ "$1 $2" == "pr comment" ]]; then
              :
            else
              printf 'unexpected fake gh invocation: %s\\n' "$*" >&2
              exit 2
            fi
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{fake_bin}:{env['PATH']}",
            "REPO": "JovieInc/Jovie",
            "GH_RETRY_ATTEMPTS": "1",
            "JOVIE_AGENT_PROFILE": "coder",
        }
    )
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts/auto-ready-agent-drafts.sh")],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert "compensated: restored #42 to draft" in result.stdout
    assert state_file.read_text(encoding="utf-8").strip() == "restored"
    calls = call_log.read_text(encoding="utf-8")
    assert "pr ready 42 -R JovieInc/Jovie" in calls
    assert (
        f"pr merge 42 -R JovieInc/Jovie --auto --squash "
        f"--match-head-commit {fx_child_head}"
    ) in calls
    assert "pr merge 42 -R JovieInc/Jovie --disable-auto" in calls
    assert "pr ready 42 -R JovieInc/Jovie --undo" in calls
    assert "pr checks" not in calls


def test_auto_ready_leaves_human_head_without_fx_provenance_draft(
    tmp_path: Path,
) -> None:
    """A human-authored draft on an agent branch must never be promoted."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    call_log = tmp_path / "calls.log"
    human_head = "cccccccccccccccccccccccccccccccccccccccc"
    fake_gh = fake_bin / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >> {call_log}
            if [[ "$1 $2" == "pr list" ]]; then
              printf '%s\\n' '[{{"n":7,"t":"human draft","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"codex/human","oid":"{human_head}","author":"itstimwhite","L":[]}}]'
            elif [[ "$1 $2" == "pr view" ]]; then
              printf '%s\\n' '{{"draft":true,"head":"{human_head}","branch":"codex/human","labels":[],"mergeable":"MERGEABLE","state":"OPEN"}}'
            elif [[ "$1 $2" == "pr ready" || "$1 $2" == "pr merge" || "$1 $2" == "pr checks" ]]; then
              printf 'fake gh must never promote a human-authored head\\n' >&2
              exit 2
            elif [[ "$1" == "api" ]]; then
              case "$2" in
                repos/*/commits/*)
                  printf '%s\\n' '{{"sha":"{human_head}","message":"fix: human patch","parentShas":["dddddddddddddddddddddddddddddddddddddddd"],"authorName":"Tim White","authorEmail":"tim@example.com","authorLogin":"itstimwhite","committerName":"Tim White","committerEmail":"tim@example.com","committerLogin":"itstimwhite","verified":false}}'
                  ;;
                *)
                  :
                  ;;
              esac
            elif [[ "$1 $2" == "pr comment" ]]; then
              :
            else
              printf 'unexpected fake gh invocation: %s\\n' "$*" >&2
              exit 2
            fi
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{fake_bin}:{env['PATH']}",
            "REPO": "JovieInc/Jovie",
            "GH_RETRY_ATTEMPTS": "1",
            "JOVIE_AGENT_PROFILE": "coder",
        }
    )
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts/auto-ready-agent-drafts.sh")],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert "leaving PR unchanged" in result.stdout
    assert "pr ready" not in call_log.read_text(encoding="utf-8")


def test_auto_ready_recovers_interrupted_ready_without_auto_merge(
    tmp_path: Path,
) -> None:
    """A later pass closes the interruption gap between ready and auto-merge."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    state_file = tmp_path / "state"
    state_file.write_text("orphan-ready", encoding="utf-8")
    call_log = tmp_path / "calls.log"
    head = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    proof_body = json.dumps(_writer_proof_body(head, 88, "jovie-bot[bot]"))
    fake_gh = fake_bin / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\n' "$*" >> {call_log}
            if [[ "$1 $2" == "pr list" ]]; then
              printf '%s\n' '[{{"n":88,"t":"interrupted pair","draft":false,"head":"codex/interrupted","oid":"{head}","body":{proof_body},"author":"jovie-bot[bot]","L":[]}}]'
            elif [[ "$1 $2" == "pr ready" ]]; then
              printf 'recovery must not repeat the ready mutation\n' >&2
              exit 2
            elif [[ "$1 $2" == "pr merge" ]]; then
              if [[ " $* " == *" --auto "* ]]; then
                printf '%s\n' auto-enabled > {state_file}
              else
                printf 'unexpected merge mutation: %s\n' "$*" >&2
                exit 2
              fi
            elif [[ "$1" == "api" && "$2" == "graphql" ]]; then
              if [[ "$(cat {state_file})" == "auto-enabled" ]]; then
                printf '%s\n' '{{"draft":false,"head":"{head}","branch":"codex/interrupted","body":{proof_body},"labels":[],"state":"OPEN","autoMerge":true,"queued":false}}'
              else
                printf '%s\n' '{{"draft":false,"head":"{head}","branch":"codex/interrupted","body":{proof_body},"labels":[],"state":"OPEN","autoMerge":false,"queued":false}}'
              fi
            else
              printf 'unexpected fake gh invocation: %s\n' "$*" >&2
              exit 2
            fi
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{fake_bin}:{env['PATH']}",
            "REPO": "JovieInc/Jovie",
            "GH_RETRY_ATTEMPTS": "1",
            "JOVIE_AGENT_PROFILE": "coder",
        }
    )
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts/auto-ready-agent-drafts.sh")],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert "recovered ready #88 by enabling native auto-merge" in result.stdout
    assert state_file.read_text(encoding="utf-8").strip() == "auto-enabled"
    calls = call_log.read_text(encoding="utf-8")
    assert "pr ready" not in calls
    assert (
        f"pr merge 88 -R JovieInc/Jovie --auto --squash "
        f"--match-head-commit {head}"
    ) in calls


def test_scheduled_synthetic_alerts_before_preserving_failure() -> None:
    """Setup, parser, and canary failures must all reach alerting before red."""
    workflow = (WORKFLOWS / "synthetic-monitoring.yml").read_text(
        encoding="utf-8"
    )
    parse = _step_block("synthetic-monitoring.yml", "Parse test results")
    alert = _step_block("synthetic-monitoring.yml", "Send Slack Alert on Failure")
    preserve = _step_block("synthetic-monitoring.yml", "Fail job if tests failed")

    assert "if: ${{ always() }}" in parse
    failure_safe = (
        "always() && (failure() || "
        "steps.test-results.outputs.test_status != 'passed')"
    )
    assert failure_safe in alert
    assert failure_safe in preserve
    assert workflow.index("Send Slack Alert on Failure") < workflow.index(
        "Fail job if tests failed"
    )


def test_github_ai_orchestrator_is_manual_only_and_hard_disabled() -> None:
    """A workflow-state flip must not restore GitHub Issue intake."""
    workflow = (WORKFLOWS / "github-ai-orchestrator.yml").read_text(
        encoding="utf-8"
    )
    triggers = workflow.split("\njobs:", 1)[0]

    assert "workflow_dispatch:" in triggers
    assert "issues:" not in triggers
    for job in ("guard", "claim_issue", "implement_and_open_pr", "finalize_claim"):
        job_block = _job_block("github-ai-orchestrator.yml", job)
        assert (
            "if: ${{ github.event_name == '__retired_linear_only__' }}"
            in job_block
        )


def test_live_model_work_never_fans_out_from_pull_requests() -> None:
    """PR evals stay deterministic; live-model spend belongs off the PR path."""
    real_model = (WORKFLOWS / "eval-real-model.yml").read_text(encoding="utf-8")
    deterministic = (WORKFLOWS / "eval.yml").read_text(encoding="utf-8")

    assert "pull_request:" not in real_model
    assert "pnpm exec vitest run" in real_model
    assert "github.event_name == 'pull_request' && '0'" in deterministic


def test_deep_lanes_are_staggered_and_bounded() -> None:
    """Scheduled exhaustive coverage should not fan out across the runner pool."""
    full_matrix = (WORKFLOWS / "e2e-full-matrix.yml").read_text(encoding="utf-8")
    nightly_agent = (WORKFLOWS / "nightly-testing-agent.yml").read_text(
        encoding="utf-8"
    )

    assert "max-parallel: 1" in full_matrix
    assert "needs: [context, deterministic]" in nightly_agent
    assert "'30 4 * * *'" in nightly_agent

    nightly = (WORKFLOWS / "nightly-tests.yml").read_text(encoding="utf-8")
    screenshots = (WORKFLOWS / "screenshots.yml").read_text(encoding="utf-8")
    harness = (WORKFLOWS / "agent-harness-health-report.yml").read_text(
        encoding="utf-8"
    )
    assert "'30 23 * * *'" in nightly
    screenshot_triggers = screenshots.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert "push:" in screenshot_triggers
    assert "schedule:" not in screenshot_triggers
    assert "'0 9 * * 2'" in harness


def test_nightly_unit_suite_fetches_storybook_provenance_history() -> None:
    """Storybook provenance receipts need more than the depth-1 HEAD commit."""
    job = _job_block("nightly-tests.yml", "unit-tests")

    assert "name: Full Unit Test Suite" in job
    assert "fetch-depth: 0" in job
    assert "fetch-depth: 1" not in job
    assert "pnpm --filter=@jovie/web run test" in job


def test_nightly_notifications_skip_when_slack_credentials_are_absent() -> None:
    """Missing Slack credentials must not make the notification job fail."""
    job = _job_block("nightly-tests.yml", "notify")
    knip_failure = _step_block(
        "nightly-tests.yml", "Slack notification on Knip failure"
    )
    unit_failure = _step_block(
        "nightly-tests.yml", "Slack notification on unit test failure"
    )
    e2e_failure = _step_block(
        "nightly-tests.yml", "Slack notification on E2E failure"
    )
    all_success = _step_block(
        "nightly-tests.yml", "Slack notification on all success"
    )

    assert "SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}" in job
    assert "SLACK_CI_CHANNEL_ID: ${{ vars.SLACK_CI_CHANNEL_ID }}" in job
    assert "SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}" in job
    for step, result in (
        (knip_failure, "needs.knip.result == 'failure'"),
        (unit_failure, "needs.unit-tests.result == 'failure'"),
    ):
        assert result in step
        assert "env.SLACK_BOT_TOKEN != ''" in step
        assert "env.SLACK_CI_CHANNEL_ID != ''" in step
        assert "channel-id:" not in step
        assert "method: chat.postMessage" in step
        assert "token: ${{ env.SLACK_BOT_TOKEN }}" in step
        assert '"channel": "${{ env.SLACK_CI_CHANNEL_ID }}"' in step

    assert "needs.e2e-tests.result == 'failure'" in e2e_failure
    assert "env.SLACK_WEBHOOK_URL != ''" in e2e_failure
    for result in (
        "needs.knip.result == 'success'",
        "needs.unit-tests.result == 'success'",
        "needs.e2e-tests.result == 'success'",
    ):
        assert result in all_success
    assert "env.SLACK_WEBHOOK_URL != ''" in all_success


def test_pitch_static_assets_do_not_keep_large_unreferenced_files() -> None:
    """Large public pitch assets must be referenced by the checked-in deck."""
    pitch_dir = REPO_ROOT / "apps" / "web" / "public" / "pitch"
    assets_dir = pitch_dir / "assets"
    deck_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in pitch_dir.iterdir()
        if path.is_file() and path.suffix in {".css", ".html", ".js"}
    )
    referenced_assets = set(re.findall(r"assets/([^\"')\s>]+)", deck_sources))

    large_unreferenced = sorted(
        path.name
        for path in assets_dir.iterdir()
        if path.is_file()
        and path.stat().st_size > 250_000
        and path.name not in referenced_assets
    )

    assert large_unreferenced == []


def test_product_screenshot_budget_covers_capture_and_publication() -> None:
    """The screenshot publisher must outlive capture plus the normal push gate."""
    job = _job_block("screenshots.yml", "generate")
    capture = _step_block("screenshots.yml", "Capture screenshot catalog")
    publication = _step_block("screenshots.yml", "Create or update screenshot PR")

    job_timeout = int(re.search(r"timeout-minutes: (\d+)", job).group(1))
    capture_timeout = int(
        re.search(r"timeout-minutes: (\d+)", capture).group(1)
    )
    publication_timeout = int(
        re.search(r"timeout-minutes: (\d+)", publication).group(1)
    )

    assert publication_timeout >= 75
    assert job_timeout >= capture_timeout + publication_timeout + 20
    for capture_only_variable in (
        "DATABASE_URL",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "NEXT_DISABLE_TOOLBAR",
        "NEXT_PUBLIC_CLERK_PROXY_DISABLED",
        "E2E_USE_TEST_AUTH_BYPASS",
        "E2E_CLERK_USER_ID",
    ):
        assert f"-u {capture_only_variable}" in publication
    assert "hold_screenshot_merge_queue()" in publication
    assert "production-controller.yml/runs?status=in_progress&per_page=100" in publication
    assert "production-controller.yml/runs?status=queued&per_page=100" in publication
    assert "hold-screenshot-mq-during-controller.mjs" in publication
    assert publication.count('gh pr edit --add-label "merge-queue"') == 0
    assert publication.count("if hold_screenshot_merge_queue; then") == 2


def test_cost_monitoring_docs_match_activation_gated_observer() -> None:
    """Declared scheduling must not be confused with activation or rollback."""
    workflow = (WORKFLOWS / "cost-anomaly-gate.yml").read_text(encoding="utf-8")
    cost_docs = (REPO_ROOT / "docs/COST_MONITORING.md").read_text(
        encoding="utf-8"
    )
    audit = (REPO_ROOT / "docs/AUTOMATION_AUDIT.md").read_text(
        encoding="utf-8"
    )

    trigger_block = workflow.split("on:", 1)[1].split("# Prevent", 1)[0]
    assert "workflow_dispatch:" in trigger_block
    assert "schedule:" in trigger_block
    assert "'*/15 * * * *'" in trigger_block
    assert "workflow enablement is an explicit operational step" in cost_docs
    assert "never mutates production" in cost_docs
    assert "vercel rollback" not in workflow
    assert "Cost Anomaly Gate" in audit
    assert "Keep activation-gated" in audit


def test_cost_anomaly_alerts_on_ratio_or_absolute_floor(tmp_path: Path) -> None:
    """Either standing threshold must independently open an incident."""
    step = _step_block("cost-anomaly-gate.yml", "Evaluate anomaly")
    script = textwrap.dedent(step.split("        run: |\n", 1)[1])
    script = script.replace(
        'CURRENT="${{ steps.current.outputs.count }}"',
        'CURRENT="$TEST_CURRENT"',
    ).replace(
        'BASELINE="${{ steps.baseline.outputs.average }}"',
        'BASELINE="$TEST_BASELINE"',
    )

    cases = (
        # Regression: 695 is above 5 * 134, despite staying below the floor.
        ("695", "134", "1000", "anomaly", "518% of baseline"),
        # The floor remains independent when the ratio threshold is higher.
        ("1100", "500", "1000", "anomaly", "absolute floor 1000 exceeded"),
        ("600", "134", "1000", "normal", "Within normal range"),
        ("1001", "0", "1000", "anomaly", "absolute floor 1000 exceeded"),
    )
    for index, (current, baseline, floor, status, reason) in enumerate(cases):
        output = tmp_path / f"github-output-{index}"
        env = os.environ.copy()
        env.update(
            {
                "TEST_CURRENT": current,
                "TEST_BASELINE": baseline,
                "THRESHOLD_MULTIPLIER": "5",
                "ABSOLUTE_FLOOR": floor,
                "LOOKBACK_MINUTES": "60",
                "GITHUB_OUTPUT": str(output),
            }
        )
        result = subprocess.run(
            ["bash", "-euo", "pipefail", "-c", script],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        outputs = output.read_text(encoding="utf-8")
        assert f"status={status}" in outputs
        assert reason in outputs


def test_auto_pr_compares_trigger_branch_without_executing_its_checkout() -> None:
    """The pushed branch is controller input; current main supplies helpers."""
    block = _job_block("auto-pr-on-push.yml", "open-pr")
    assert 'git fetch origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"' in block
    assert 'git diff --name-only "origin/main...origin/$BRANCH"' in block
    assert "origin/main...HEAD" not in block


def test_claude_review_uses_hosted_bun_prerequisites() -> None:
    """setup-bun must not land on self-hosted images missing unzip."""
    block = _job_block("claude-review.yml", "review")
    assert "runs-on: ubuntu-latest" in block
    assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block
    assert "uses: oven-sh/setup-bun@" in block


def test_taste_policy_runs_trusted_base_code_with_write_authority() -> None:
    """PR data may steer policy, but PR-controlled code must never execute."""
    for workflow, job_name in (
        ("taste-classifier.yml", "classify"),
        ("taste-label-guard.yml", "guard"),
    ):
        source = (WORKFLOWS / workflow).read_text(encoding="utf-8")
        block = _job_block(workflow, job_name)
        assert "\n  pull_request_target:\n" in source
        assert "\n  pull_request:\n" not in source
        assert "ref: ${{ github.event.pull_request.base.sha }}" in block
        assert "persist-credentials: false" in block
        assert "ref: ${{ github.event.pull_request.head.sha }}" not in block
        assert "pnpm install" not in block
        assert "corepack enable" not in block
        assert "runs-on: ubuntu-latest" in block


def test_model_and_advisory_jobs_never_consume_fixed_ci_runners() -> None:
    """Long or advisory work cannot starve deterministic merge capacity."""
    for workflow, job_name in MODEL_OR_ADVISORY_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_deep_evidence_jobs_use_hosted_capacity() -> None:
    """Deep evidence must not consume the five fixed merge-throughput runners."""
    for workflow, job_name in HOSTED_DEEP_EVIDENCE_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_post_merge_fanout_never_consumes_fixed_ci_capacity() -> None:
    """Every merged PR fans these jobs out, so they must stay off fixed runners."""
    for workflow, job_name in HOSTED_POST_MERGE_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_api_only_pr_controllers_never_consume_fixed_ci_capacity() -> None:
    """Queue and check API work must leave fixed runners to deterministic tests."""
    for workflow, job_name in HOSTED_API_ONLY_PR_CONTROLLERS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)

    dependabot = (WORKFLOWS / "dependabot-auto-merge.yml").read_text(
        encoding="utf-8"
    )
    assert "Graphite" not in dependabot
    assert "Native autoenroll owns queue mutation" in dependabot


def test_retired_merge_queue_label_has_no_active_producers() -> None:
    """Native queue membership must never be synthesized from a legacy label."""
    sources = [
        REPO_ROOT / ".claude/rules/release.md",
        REPO_ROOT / ".claude/rules/swarm.md",
        REPO_ROOT / ".github/rulesets/branch-protection.yml",
        WORKFLOWS / "agent-pipeline.yml",
        REPO_ROOT / "scripts/release-queue-deferred.sh",
        REPO_ROOT / "scripts/symphony/lib/codex-issue-shipper.ts",
    ]
    forbidden = re.compile(
        r"--(?:add|remove)-label\s+[\"']?merge-queue|"
        r"\.name\s*==\s*[\"']merge-queue[\"']|"
        r"labels[^\n]*[\"'`]merge-queue[\"'`]"
    )
    for source in sources:
        assert forbidden.search(source.read_text(encoding="utf-8")) is None, source


def test_background_controllers_never_consume_fixed_ci_capacity() -> None:
    """Schedules, API controllers, and dormant lanes cannot steal unit slots."""
    for workflow, job_name in HOSTED_BACKGROUND_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_fleet_gate_refresh_skips_cancelled_ci_and_ignored_labels() -> None:
    """Cancelled CI and non-hold labels must not occupy a jovie-fixed slot."""
    workflow = (WORKFLOWS / "fleet-gate-refresh.yml").read_text(encoding="utf-8")
    trigger = workflow.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
    block = _job_block("fleet-gate-refresh.yml", "refresh")

    assert "schedule:" not in trigger
    assert "workflows: [CI, Production Controller]" in trigger
    assert "opened" in trigger
    assert "edited" in trigger
    assert "synchronize" in trigger
    assert "Production Marker Recovery]" not in trigger
    assert "workflows: [CI, Production Controller, Queue-Deferred Release]" not in trigger
    assert "group: fleet-gate-event-refresh" in workflow
    assert "cancel-in-progress: false" in workflow
    assert "github.event.workflow_run.conclusion != 'cancelled'" in block
    assert "github.event.pull_request.merged != true" in block
    assert "github.event.label.name == 'hold'" in block
    assert "github.event.label.name == 'gated'" in block
    assert "github.event.label.name == 'queue-deferred'" in block
    assert "github.event.label.name == 'needs-human'" not in block
    assert "github.event.label.name == 'duplicate'" in block
    assert "runs-on: [self-hosted, Linux, X64, jovie-fixed]" in block
    assert "Persist stack policy repair actions" in block
    assert "--closure-health-file=" in block
    assert "delivery-state-machine.mjs" in block
    assert "\n  pull_request_target:\n" in workflow and "\n  pull_request:\n" not in workflow and "converted_to_draft" in trigger and "github.event_name != 'pull_request_target'" in block and "steps.refresh.outputs.receipt_path" in block and "state/gem-priority-gate/latest.json" not in block
    assert "steps.stack-actions.outcome == 'success'" in block


def test_heartbeat_is_the_only_scheduled_generic_fixed_runner_consumer() -> None:
    """Schedules cannot silently compete with the bounded merge unit pool."""
    scheduled_fixed: list[str] = []
    for workflow_path in sorted(WORKFLOWS.glob("*.yml")):
        content = workflow_path.read_text(encoding="utf-8")
        if "\non:\n" not in content:
            continue
        trigger = content.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        if "schedule:" not in trigger:
            continue
        if any(
            marker in content
            for marker in (
                "runs-on: jovie-runner",
                "runs-on: ${{ vars.CI_FAST_RUNNER",
                "runs-on: ${{ vars.CI_UNIT_RUNNER",
            )
        ):
            scheduled_fixed.append(workflow_path.name)

    assert scheduled_fixed == ["runner-heartbeat.yml"]


def test_fleet_controllers_share_one_evaluate_action() -> None:
    """FGR, QDR, merge-queue, and production-controller must not copy-paste the gate CLI."""
    action = ".github/actions/evaluate-fleet-gate"
    script = REPO_ROOT / "scripts/symphony/evaluate-fleet-gate.sh"
    assert script.is_file(), "shared evaluate script missing"
    callers = (
        ("fleet-gate-refresh.yml", "refresh", "refresh"),
        ("queue-deferred-release.yml", "fleet-policy", "policy"),
        ("merge-queue-autoenroll.yml", "fleet-policy", "policy"),
        ("production-controller.yml", "fleet-promotion", "policy"),
    )
    for workflow, job_name, _step in callers:
        text = (WORKFLOWS / workflow).read_text(encoding="utf-8")
        assert f"uses: ./{action}" in text, workflow
        assert "python3 scripts/symphony/gem-priority-gate.py" not in text, workflow
    production = (WORKFLOWS / "production-controller.yml").read_text(encoding="utf-8")
    assert "consumer: deployment" in production
    assert "expected-sha: ${{ github.event.workflow_run.head_sha }}" in production


def test_github_ai_dispatcher_is_manual_only_and_hard_disabled() -> None:
    """GitHub Issues cannot select work even if the workflow is re-enabled."""
    workflow = (WORKFLOWS / "github-ai-dispatcher.yml").read_text(encoding="utf-8")
    block = _job_block("github-ai-dispatcher.yml", "dispatch")
    triggers = workflow.split("\njobs:", 1)[0]

    assert "workflow_dispatch:" in triggers
    assert "workflow_run:" not in triggers
    assert "pull_request:" not in triggers
    assert "issues:" not in triggers
    assert (
        "if: ${{ github.event_name == '__retired_linear_only__' }}" in block
    )


def _setup_doppler_install_script() -> str:
    action = REPO_ROOT / ".github/actions/setup-doppler/action.yml"
    lines = action.read_text().splitlines()
    start = lines.index("    - name: Install Doppler CLI")
    run = next(i for i in range(start, len(lines)) if lines[i] == "      run: |")
    body: list[str] = []
    for line in lines[run + 1 :]:
        if line.startswith("        ") or not line:
            body.append(line[8:] if line else line)
            continue
        break
    return "\n".join(body) + "\n"


def _write_executable(path: Path, body: str) -> None:
    path.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _run_setup_doppler_fixture(
    tmp_path: Path, scenario: str
) -> tuple[subprocess.CompletedProcess[str], Path, str]:
    fake_bin = tmp_path / "bin"
    fake_root = tmp_path / "root"
    fake_bin.mkdir()
    fake_root.mkdir()
    log = tmp_path / "calls.log"

    _write_executable(
        fake_bin / "sudo",
        textwrap.dedent(
            """
            printf 'sudo %s\\n' "$*" >> "$CALL_LOG"
            if [ "$1" = apt-get ]; then
              exit 0
            fi
            if [ "$1" = install ]; then
              source_path="${@: -2:1}"
              destination="${@: -1}"
              mkdir -p "$FAKE_ROOT$(dirname "$destination")"
              cp "$source_path" "$FAKE_ROOT$destination"
              exit 0
            fi
            exit 64
            """
        ),
    )
    _write_executable(
        fake_bin / "curl",
        textwrap.dedent(
            """
            printf 'curl %s\\n' "$*" >> "$CALL_LOG"
            output=''
            previous=''
            for argument in "$@"; do
              if [ "$previous" = --output ]; then output="$argument"; fi
              previous="$argument"
            done
            test -n "$output"
            if [ "$SCENARIO" = empty ]; then
              : > "$output"
              exit 0
            fi
            if [ "$SCENARIO" = invalid ]; then
              printf '<html>temporary upstream error</html>\\n' > "$output"
              exit 0
            fi
            for required in --fail --show-error --location --retry-all-errors; do
              case " $* " in
                *" $required "*) ;;
                *) exit 65 ;;
              esac
            done
            printf 'transport-attempt=503\\ntransport-attempt=success\\n' >> "$CALL_LOG"
            cat > "$output" <<'KEY'
            -----BEGIN PGP PUBLIC KEY BLOCK-----
            valid-test-key
            -----END PGP PUBLIC KEY BLOCK-----
            KEY
            """
        ),
    )
    _write_executable(
        fake_bin / "gpg",
        textwrap.dedent(
            """
            printf 'gpg %s\\n' "$*" >> "$CALL_LOG"
            if [[ " $* " = *" --show-keys "* ]]; then
              grep -q '^-----BEGIN PGP PUBLIC KEY BLOCK-----$' "${@: -1}"
              exit 0
            fi
            output=''
            previous=''
            for argument in "$@"; do
              if [ "$previous" = --output ]; then output="$argument"; fi
              previous="$argument"
            done
            test -n "$output"
            printf 'dearmored-test-key\\n' > "$output"
            """
        ),
    )

    environment = os.environ.copy()
    environment.update(
        {
            "CALL_LOG": str(log),
            "FAKE_ROOT": str(fake_root),
            "PATH": f"{fake_bin}:/usr/bin:/bin",
            "SCENARIO": scenario,
        }
    )
    result = subprocess.run(
        ["bash", "-c", _setup_doppler_install_script()],
        cwd=REPO_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, fake_root, log.read_text() if log.exists() else ""


def test_setup_doppler_retries_then_installs_validated_key_atomically(
    tmp_path: Path,
) -> None:
    result, fake_root, calls = _run_setup_doppler_fixture(tmp_path, "transient")

    assert result.returncode == 0, result.stderr
    assert "transport-attempt=503" in calls
    assert "transport-attempt=success" in calls
    assert "--retry-all-errors" in calls
    assert (
        fake_root / "usr/share/keyrings/doppler-archive-keyring.gpg"
    ).read_text() == "dearmored-test-key\n"
    assert (fake_root / "etc/apt/sources.list.d/doppler-cli.list").is_file()


def test_setup_doppler_rejects_empty_body_before_keyring_mutation(
    tmp_path: Path,
) -> None:
    result, fake_root, calls = _run_setup_doppler_fixture(tmp_path, "empty")

    assert result.returncode != 0
    assert "Doppler signing key download was empty." in result.stderr
    assert "gpg " not in calls
    assert not (
        fake_root / "usr/share/keyrings/doppler-archive-keyring.gpg"
    ).exists()


def test_setup_doppler_rejects_non_pgp_body_before_keyring_mutation(
    tmp_path: Path,
) -> None:
    result, fake_root, calls = _run_setup_doppler_fixture(tmp_path, "invalid")

    assert result.returncode != 0
    assert "was not an ASCII-armored PGP public key" in result.stderr
    assert "gpg " not in calls
    assert not (
        fake_root / "usr/share/keyrings/doppler-archive-keyring.gpg"
    ).exists()

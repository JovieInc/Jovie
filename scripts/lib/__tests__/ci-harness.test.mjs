import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCiHarnessArtifact,
  classifyCiRisk,
  FORBIDDEN_PINNED_JOB_CONTEXTS,
  generateCiHarnessDocs,
  listMergeGateJobs,
  listRiskRuleContracts,
  loadCiHarnessManifest,
  REQUIRED_MERGE_STATUSES,
  riskLocalCommands,
  validateCiHarnessManifest,
} from '../ci-control-plane.mjs';
import { replaceGeneratedBlock } from '../ci-harness.mjs';
import { extractWorkflowJobBlock } from '../merge-queue-guard.mjs';

const manifest = loadCiHarnessManifest();
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
/** Locked PR merge-gate set (manifest is source of truth for harness docs + artifact). */
const EXPECTED_MERGE_GATE_NAMES = [
  'Path Changes',
  'ci-fast',
  'CI Risk Classifier',
  'Secret Scan (gitleaks + trufflehog)',
  'Migration Guard',
  'Unit Tests',
  'Build + Layout (combined)',
  'iOS Build + Test (combined)',
  'Promptfoo Evals (deterministic)',
  'Golden Eval Set (deterministic)',
];

describe('ci-harness manifest', () => {
  it('counts migration files relative to the apps/web working directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-migration-guard-'));
    const webRoot = resolve(root, 'apps/web');
    const migrations = resolve(webRoot, 'drizzle/migrations');
    const runGit = (...args) =>
      spawnSync('git', args, { cwd: root, encoding: 'utf8' });

    try {
      mkdirSync(migrations, { recursive: true });
      writeFileSync(resolve(migrations, '0080_existing.sql'), 'SELECT 1;\n');
      expect(runGit('init', '-q').status).toBe(0);
      expect(runGit('config', 'user.name', 'Migration Guard Test').status).toBe(
        0
      );
      expect(
        runGit('config', 'user.email', 'migration-guard@example.com').status
      ).toBe(0);
      expect(runGit('add', '.').status).toBe(0);
      expect(runGit('commit', '-q', '--no-gpg-sign', '-m', 'base').status).toBe(
        0
      );
      const base = runGit('rev-parse', 'HEAD').stdout.trim();

      writeFileSync(resolve(migrations, '0081_new.sql'), 'SELECT 2;\n');
      expect(runGit('add', '.').status).toBe(0);
      expect(
        runGit('commit', '-q', '--no-gpg-sign', '-m', 'migration').status
      ).toBe(0);

      const result = spawnSync(
        'bash',
        [resolve(REPO_ROOT, 'apps/web/scripts/check-migrations.sh'), base],
        {
          cwd: webRoot,
          encoding: 'utf8',
          env: { ...process.env, SKIP_MIGRATION_GUARD: '' },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('A\tdrizzle/migrations/0081_new.sql');
      expect(result.stdout).toContain('Added: 1 files');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates the checked-in manifest', () => {
    const validation = validateCiHarnessManifest(manifest);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('locks the merge-gate job set and remediation commands (characterization)', () => {
    const gates = listMergeGateJobs(manifest);
    expect(gates.map(job => job.name)).toEqual(EXPECTED_MERGE_GATE_NAMES);
    // Every merge gate must tell agents how to remediate locally.
    for (const gate of gates) {
      expect(gate.nextLocalCommand, gate.id).toMatch(/\S/);
      expect(gate.remediation, gate.id).toMatch(/\S/);
      expect(gate.tier, gate.id).toMatch(/\S/);
    }
    // Non-gate deploy/cleanup jobs must not pollute PR Ready documentation.
    const nonGates = (manifest.jobs ?? []).filter(job => !job.mergeGate);
    expect(nonGates.map(job => job.name)).toEqual([
      'Lighthouse (public routes manual)',
      'Lighthouse (dashboard manual)',
      'Lighthouse (onboarding manual)',
      'Lighthouse (admin manual)',
      'E2E Smoke (manual)',
      'Golden Path (manual)',
      'Extended Smoke (manual)',
      'Preview Deploy (manual)',
      'Production Release',
      'Main Release Ready',
      'Production Verified',
      'Test Flakiness Report',
    ]);
  });

  it('locks risk-rule smoke/preview/auto-merge contracts (characterization)', () => {
    const rules = listRiskRuleContracts(manifest);
    expect(rules.map(rule => rule.id)).toEqual([
      'ci-workflows',
      'agent-control-plane',
      'auth-identity',
      'activation-automation-data',
      'billing-money',
      'db-migrations',
      'proxy-middleware',
      'env-config',
      'public-ui',
    ]);
    const byId = Object.fromEntries(rules.map(rule => [rule.id, rule]));
    expect(byId['auth-identity']).toMatchObject({
      level: 'high',
      requiresSmoke: true,
      requiresPreview: true,
      blocksUnattendedAutoMerge: false,
    });
    expect(byId['billing-money']).toMatchObject({
      level: 'high',
      requiresSmoke: true,
      requiresPreview: true,
      blocksUnattendedAutoMerge: false,
    });
    expect(byId['activation-automation-data']).toMatchObject({
      level: 'high',
      requiresSmoke: true,
      requiresPreview: true,
      blocksUnattendedAutoMerge: false,
    });
    expect(byId['public-ui']).toMatchObject({
      level: 'medium',
      requiresSmoke: false,
      requiresPreview: true,
      blocksUnattendedAutoMerge: false,
    });
    expect(byId['ci-workflows']).toMatchObject({
      level: 'high',
      requiresSmoke: true,
      requiresPreview: true,
      blocksUnattendedAutoMerge: false,
    });
  });

  it('keeps merge-queue branch protection on aggregates, not harness merge gates', () => {
    // Branch protection pins aggregate/metadata contexts only.
    expect(REQUIRED_MERGE_STATUSES).toEqual([
      'PR Ready',
      'Migration Guard',
      'Fork PR Gate',
      'PR Size Guard',
    ]);
    // Individual harness merge-gate job names must stay in the forbidden pin list
    // so a batch failure bisects instead of evicting siblings. ci-fast is a real
    // collapsed job (JOV-3464) but must never be pinned alone — only PR Ready is.
    for (const name of EXPECTED_MERGE_GATE_NAMES) {
      if (REQUIRED_MERGE_STATUSES.includes(name)) continue;
      expect(
        FORBIDDEN_PINNED_JOB_CONTEXTS.includes(name) ||
          FORBIDDEN_PINNED_JOB_CONTEXTS.includes(`CI / ${name}`),
        `expected forbidden pin for merge-gate job "${name}"`
      ).toBe(true);
    }
  });

  it('keeps required source PR Ready deterministic and runner-light', () => {
    const workflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    const prReady = extractWorkflowJobBlock(workflow, 'ci-pr-ready');

    expect(prReady).toContain(
      'needs: [ci-path-changes, ci-risk-classifier, ci-fast, ci-secret-scan]'
    );
    expect(prReady).toContain('Evaluate deterministic source PR checks');
    expect(prReady).toContain('All deterministic source PR checks passed.');
    expect(workflow).not.toContain('withgraphite/graphite-ci-action');
    expect(workflow).not.toContain('steps.graphite');
    for (const heavyJob of [
      'ci-unit-tests',
      'ci-build-public',
      'neon-db',
      'ci-pr-vercel-preview',
      'ci-e2e-smoke',
      'ci-golden-path',
      'ci-smoke-required',
      'ci-lighthouse-pr',
      'ci-a11y',
      'ci-storybook-a11y',
      'ci-layout-guard',
      'ci-build-layout',
      'ci-ios',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
    ]) {
      expect(prReady).not.toContain(heavyJob);
    }

    const manualJobs = [
      'ci-knip',
      'neon-db',
      'ci-drizzle-check',
      'ci-build-public',
      'ci-layout-guard',
      'ci-mobile-overflow',
      'ci-lighthouse-pr',
      'ci-lighthouse-dashboard-pr',
      'ci-lighthouse-onboarding-pr',
      'ci-lighthouse-admin-pr',
      'ci-lighthouse-chat-pr',
      'ci-pr-neon-migrate',
      'ci-a11y',
      'ci-a11y-authed',
      'ci-e2e-smoke',
      'ci-golden-path',
      'ci-admin-smoke',
      'ci-e2e-migrate',
      'ci-e2e-tests',
      'ci-test-performance',
      'ci-pr-vercel-preview',
      'ci-storybook-a11y',
      'ci-summary',
      'ci-smoke-required',
    ];
    for (const jobId of manualJobs) {
      const job = extractWorkflowJobBlock(workflow, jobId);
      const controller = job.slice(0, job.indexOf('    steps:'));
      expect(controller).toContain("github.event_name == 'workflow_dispatch'");
      expect(controller).not.toContain("github.event_name == 'pull_request'");
    }
    expect(
      extractWorkflowJobBlock(workflow, 'ci-pr-vercel-preview')
    ).not.toContain(
      "needs.ci-risk-classifier.outputs.requires_preview == 'true'"
    );
    expect(extractWorkflowJobBlock(workflow, 'ci-e2e-smoke')).not.toContain(
      "needs.ci-risk-classifier.outputs.requires_smoke == 'true'"
    );

    const visualWorkflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/visual-regression.yml'),
      'utf8'
    );
    expect(visualWorkflow).not.toMatch(/^\s*pull_request:/m);
    expect(visualWorkflow).not.toContain("'testing'");
    expect(workflow).not.toContain(
      "contains(github.event.pull_request.labels.*.name, 'testing')"
    );
    expect(workflow).not.toMatch(
      /contains\(github\.event\.pull_request\.labels[^\n]*(?:deep-ci|launch-candidate|deploy-preview|testing)/
    );
  });

  it('binds the production Sentry gate to its environment before reading secrets', () => {
    const workflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/production-release.yml'),
      'utf8'
    );
    const sentryGate = extractWorkflowJobBlock(workflow, 'sentry-error-gate');

    expect(sentryGate).not.toContain(
      'uses: ./.github/workflows/sentry-error-gate.yml'
    );
    expect(sentryGate).toContain('runs-on: ubuntu-latest');
    expect(sentryGate).toContain('name: Production – jovie');
    expect(sentryGate).toContain('uses: ./.github/actions/sentry-error-gate');
    expect(sentryGate).toContain(
      'sentry-auth-token: ${{ secrets.SENTRY_AUTH_TOKEN }}'
    );
    expect(sentryGate.indexOf('name: Production – jovie')).toBeLessThan(
      sentryGate.indexOf('sentry-auth-token:')
    );
    expect(sentryGate).not.toContain('secrets: inherit');

    const action = readFileSync(
      resolve(REPO_ROOT, '.github/actions/sentry-error-gate/action.yml'),
      'utf8'
    );
    expect(action).toContain(
      "SENTRY_AUTH_TOKEN: ${{ inputs['sentry-auth-token'] }}"
    );
    expect(action).not.toContain('secrets.');
  });

  it('keeps build and layout in one hosted merge-group workspace', () => {
    const workflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    const buildLayout = extractWorkflowJobBlock(workflow, 'ci-build-layout');
    const sourceReady = extractWorkflowJobBlock(workflow, 'ci-pr-ready');
    const mergeReady = extractWorkflowJobBlock(
      workflow,
      'ci-merge-group-ready'
    );
    const unitTests = extractWorkflowJobBlock(workflow, 'ci-unit-tests');

    expect(buildLayout).toContain('runs-on: ubuntu-latest');
    expect(buildLayout).toContain('Build exact combined head');
    expect(buildLayout).toContain('Run deterministic layout behavior guard');
    expect(buildLayout).not.toContain('actions/upload-artifact');
    expect(buildLayout).not.toContain('actions/download-artifact');

    expect(sourceReady).not.toContain('ci-unit-tests');
    expect(unitTests).toContain("github.event_name == 'merge_group'");
    expect(unitTests).not.toContain("github.event_name == 'pull_request'");
    expect(mergeReady).toContain('ci-unit-tests');
    expect(mergeReady).toContain('ci-build-layout');
    expect(mergeReady).toContain('ci-ios');
    expect(mergeReady).toContain('drizzle-migration-guard');
    expect(mergeReady).not.toContain(
      'RUN_TEST="${{ needs.ci-path-changes.outputs.run_test }}"'
    );
    expect(mergeReady).toContain('Five affected Unit Test shards did not pass');
    expect(unitTests).toContain('run: echo "run_full_ci=true"');
  });

  it('defaults bare merge queue checks to the active native backend', () => {
    const { MERGE_QUEUE_BACKEND: _ignored, ...env } = process.env;
    // biome-ignore format: executable CLI regression stays compact for the integration-train cap
    const run = command => spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/ci-merge-queue-check.mjs'), command], { env: { ...env, PATH: '' }, encoding: 'utf8' });
    const validate = run('validate');
    const verify = run('verify');
    // biome-ignore format: executable offline/live status matrix stays compact for the integration-train cap
    expect([validate.status, validate.stderr, validate.stdout.includes('Repo config OK'), verify.status, verify.stderr.includes('Live GitHub ruleset verification failed')]).toEqual([0, '', true, 1, true]);
  });

  it('generates stable docs from tiers, merge gates, and risk rules', () => {
    const docs = generateCiHarnessDocs(manifest, 'CI Agent Harness');
    expect(docs).toContain('Generated from `.github/ci-harness/manifest.json`');
    expect(docs).toContain('| Source Fast Gate |');
    expect(docs).toContain('| Direct/admin main |');
    expect(docs).toContain('| Post-deploy |');
    expect(docs).toContain(
      'Source `PR Ready` may require only `source-pr`/`both` jobs'
    );
    expect(docs).toContain('| `Unit Tests` | merge-group |');
    expect(docs).toContain('| Auth and identity | high | yes | yes | no |');
    // Docs must list every locked merge gate + remediation command.
    for (const name of EXPECTED_MERGE_GATE_NAMES) {
      expect(docs).toContain(`\`${name}\``);
    }
    expect(docs).toContain('`pnpm run typecheck && pnpm run biome:check`');
    expect(docs).toContain('no PR label allocates a heavy source-event lane');
  });

  it('replaces an existing generated docs block', () => {
    const existing = [
      '# Doc',
      '',
      '<!-- ci-harness:start -->',
      'stale',
      '<!-- ci-harness:end -->',
      '',
      'tail',
      '',
    ].join('\n');
    const next = replaceGeneratedBlock(existing, 'fresh');
    expect(next).toBe(['# Doc', '', 'fresh', '', 'tail', ''].join('\n'));
  });
});

describe('ci-harness risk classifier', () => {
  it('classifies high / medium / low path sets with stable smoke+preview flags', () => {
    const high = classifyCiRisk(
      ['apps/web/lib/billing/entitlements.ts'],
      manifest
    );
    expect(high.riskLevel).toBe('high');
    expect(high.requiresSmoke).toBe(true);
    expect(high.requiresPreview).toBe(true);
    expect(high.blocksUnattendedAutoMerge).toBe(false);
    expect(high.matchedRules.map(rule => rule.id)).toContain('billing-money');
    expect(high.recommendedLabels).toEqual([]);
    expect(riskLocalCommands(high)).toEqual([
      'pnpm ci:harness:check',
      'pnpm run test:web:smoke',
      'pnpm run build:web',
    ]);

    const medium = classifyCiRisk(
      ['apps/web/components/features/profile/ProfileCompactSurface.tsx'],
      manifest
    );
    expect(medium.riskLevel).toBe('medium');
    expect(medium.requiresSmoke).toBe(false);
    expect(medium.requiresPreview).toBe(true);
    expect(medium.blocksUnattendedAutoMerge).toBe(false);
    expect(riskLocalCommands(medium)).toEqual([
      'pnpm ci:harness:check',
      'pnpm run build:web',
    ]);

    const low = classifyCiRisk(['README.md', 'docs/PR_FLOW.md'], manifest);
    expect(low.riskLevel).toBe('low');
    expect(low.requiresSmoke).toBe(false);
    expect(low.requiresPreview).toBe(false);
    expect(low.blocksUnattendedAutoMerge).toBe(false);
    expect(low.matchedRules).toEqual([]);
    expect(riskLocalCommands(low)).toEqual(['pnpm ci:harness:check']);
  });

  it('requires smoke and preview for auth changes (autonomous merge)', () => {
    const risk = classifyCiRisk(['apps/web/lib/auth/gate.ts'], manifest);
    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules.map(rule => rule.id)).toContain('auth-identity');
  });

  it.each([
    'apps/web/app/onboarding/actions/enrich-profile.ts',
    'apps/web/lib/ingestion/processor.ts',
    'apps/web/lib/memory/drizzle-store.ts',
    'apps/web/app/api/cron/process-workflow-runs/route.ts',
    'apps/web/app/api/memory/observations/route.ts',
    'apps/web/app/api/dsp/enrichment/sync/route.ts',
    'apps/web/app/api/dashboard/ai-crawlers/route.ts',
    'apps/web/app/api/admin/agent-os/workflows/route.ts',
    'apps/web/app/api/hud/ai-ops/route.ts',
  ])('requires smoke and preview for activation/automation path %s', file => {
    const risk = classifyCiRisk([file], manifest);
    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.matchedRules.map(rule => rule.id)).toContain(
      'activation-automation-data'
    );
  });

  it('requires preview but does not block unattended auto-merge for public UI only', () => {
    const risk = classifyCiRisk(
      ['apps/web/components/features/profile/ProfileCompactSurface.tsx'],
      manifest
    );
    expect(risk.riskLevel).toBe('medium');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
  });

  it('does not escalate version-only package manifest bumps to smoke', () => {
    const risk = classifyCiRisk(
      [
        'package.json',
        'apps/web/package.json',
        'apps/web/app/(marketing)/compare/[slug]/page.tsx',
      ],
      manifest,
      {
        isVersionOnlyPackageManifestChange: file =>
          file === 'package.json' || file === 'apps/web/package.json',
      }
    );

    expect(risk.riskLevel).toBe('medium');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules.map(rule => rule.id)).toEqual(['public-ui']);
  });

  it('does not escalate dependency-only semver bumps to smoke', () => {
    const risk = classifyCiRisk(
      ['apps/web/package.json', 'pnpm-lock.yaml'],
      manifest,
      {
        isDependencyOnlyPackageManifestChange: file =>
          file === 'apps/web/package.json',
      }
    );

    expect(risk.riskLevel).toBe('low');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.requiresPreview).toBe(false);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules).toEqual([]);
  });

  it('does not escalate root devDependency bumps with lockfile to smoke', () => {
    const risk = classifyCiRisk(['package.json', 'pnpm-lock.yaml'], manifest, {
      isVersionOnlyPackageManifestChange: () => false,
      isDependencyOnlyPackageManifestChange: file => file === 'package.json',
    });

    expect(risk.riskLevel).toBe('low');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.requiresPreview).toBe(false);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules).toEqual([]);
  });

  it('keeps package manifest changes that alter scripts in the env-config smoke lane', () => {
    const risk = classifyCiRisk(['package.json'], manifest, {
      isVersionOnlyPackageManifestChange: () => false,
      isDependencyOnlyPackageManifestChange: () => false,
    });

    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules.map(rule => rule.id)).toContain('env-config');
  });

  it('treats workflow edits as high-risk control-plane changes', () => {
    const risk = classifyCiRisk(['.github/workflows/ci.yml'], manifest);
    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
  });

  it('does not require web smoke for iOS-only workflow dependency bumps', () => {
    const risk = classifyCiRisk(
      [
        '.github/workflows/ios-testflight.yml',
        '.github/workflows/ios-signing-bootstrap.yml',
      ],
      manifest
    );
    expect(risk.riskLevel).toBe('low');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules).toEqual([]);
  });

  it('does not require smoke for documentation-only agent control plane edits', () => {
    const risk = classifyCiRisk(['.claude/rules/ui.md'], manifest);
    expect(risk.riskLevel).toBe('low');
    expect(risk.requiresSmoke).toBe(false);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules).toEqual([]);
  });

  it('still requires smoke for executable agent control plane edits', () => {
    const risk = classifyCiRisk(['.claude/hooks/lint-check.sh'], manifest);
    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules.map(rule => rule.id)).toContain(
      'agent-control-plane'
    );
  });
});

describe('ci-harness artifact formatter', () => {
  it('emits required gates, remediation commands, preview URL, and risk evidence', () => {
    const risk = classifyCiRisk(['apps/web/lib/auth/gate.ts'], manifest);
    const artifact = buildCiHarnessArtifact({
      runId: '123',
      runAttempt: '2',
      repository: 'JovieInc/Jovie',
      prNumber: '99',
      sha: 'abc123',
      previewUrl: 'https://preview.example.com',
      manifest,
      risk,
      jobResults: [
        { id: 'ci-fast', status: 'success' },
        { id: 'ci-risk-classifier', status: 'failure' },
        { id: 'ci-build-layout', status: 'skipped', skipReason: 'source PR' },
      ],
    });

    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.evidence.previewUrl).toBe('https://preview.example.com');
    expect(artifact.evidence.risk.requiresSmoke).toBe(true);
    expect(artifact.requiredGates.map(job => job.id)).toContain('ci-fast');
    expect(artifact.requiredGates.map(job => job.id)).toContain(
      'ci-risk-classifier'
    );
    expect(artifact.requiredGates.map(job => job.id)).not.toContain(
      'ci-build-layout'
    );
    expect(
      artifact.nextLocalCommands.some(command =>
        command.includes('pnpm ci:harness:check')
      )
    ).toBe(true);
  });

  it('includes intra-job lane results for ci-fast collapse (JOV-3464)', () => {
    const artifact = buildCiHarnessArtifact({
      runId: '456',
      runAttempt: '1',
      repository: 'JovieInc/Jovie',
      prNumber: '100',
      sha: 'def456',
      previewUrl: null,
      manifest,
      risk: null,
      jobResults: [{ id: 'ci-fast', status: 'failure' }],
      laneResults: [
        {
          lane: 'typecheck',
          status: 'failure',
          nextLocalCommand: 'pnpm run typecheck',
          log_excerpt: "error TS2304: Cannot find name 'x'",
        },
        {
          id: 'biome',
          status: 'success',
          nextLocalCommand: 'pnpm run biome:check',
        },
      ],
    });

    expect(artifact.lanes).toHaveLength(2);
    expect(artifact.lanes[0]).toMatchObject({
      lane: 'typecheck',
      status: 'failure',
      nextLocalCommand: 'pnpm run typecheck',
    });
    expect(artifact.nextLocalCommands).toContain('pnpm run typecheck');
    // Job-level remediation from ci-fast still present
    expect(
      artifact.nextLocalCommands.some(command =>
        command.includes('pnpm run typecheck')
      )
    ).toBe(true);
  });
});

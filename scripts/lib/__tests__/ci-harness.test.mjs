import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const manifest = loadCiHarnessManifest();
const ciWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
);

/** Locked PR merge-gate set (manifest is source of truth for harness docs + artifact). */
const EXPECTED_MERGE_GATE_NAMES = [
  'ci-fast',
  'Typecheck Stable Safety Gate',
  'Structural Contract',
  'CI Risk Classifier',
  'Unit Tests',
  'Build (public routes)',
  'Lighthouse (public routes PR)',
  'Lighthouse (dashboard PR)',
  'Lighthouse (onboarding PR)',
  'Lighthouse (admin PR)',
  'E2E Smoke (PR Fast Feedback)',
  'Golden Path (PR)',
  'Preview Deploy (PR)',
];

describe('ci-harness manifest', () => {
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
      'Deploy staging',
      'Test Flakiness Report',
    ]);
  });

  it('fans the stable typecheck safety gate into PR Ready', () => {
    const prReadyJob = ciWorkflow.slice(ciWorkflow.indexOf('  ci-pr-ready:'));
    expect(prReadyJob).toContain('ci-typecheck-stable,');
    expect(prReadyJob).toContain(
      'STABLE_TYPECHECK_RESULT="${{ needs.ci-typecheck-stable.result }}"'
    );
    expect(prReadyJob).toContain(
      'if [[ "$STABLE_TYPECHECK_RESULT" != "success" ]]'
    );
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
      requiresPreview: false,
      blocksUnattendedAutoMerge: false,
    });
  });

  it('keeps merge-queue branch protection on aggregates, not harness merge gates', () => {
    // Branch protection pins PR Ready / Migration Guard / Fork PR Gate only.
    expect(REQUIRED_MERGE_STATUSES).toEqual([
      'PR Ready',
      'Migration Guard',
      'Fork PR Gate',
    ]);
    // Individual harness merge-gate job names must stay in the forbidden pin list
    // so a batch failure bisects instead of evicting siblings. ci-fast is a real
    // collapsed job (JOV-3464) but must never be pinned alone — only PR Ready is.
    for (const name of EXPECTED_MERGE_GATE_NAMES) {
      expect(
        FORBIDDEN_PINNED_JOB_CONTEXTS.includes(name) ||
          FORBIDDEN_PINNED_JOB_CONTEXTS.includes(`CI / ${name}`),
        `expected forbidden pin for merge-gate job "${name}"`
      ).toBe(true);
    }
  });

  it('generates stable docs from tiers, merge gates, and risk rules', () => {
    const docs = generateCiHarnessDocs(manifest, 'CI Agent Harness');
    expect(docs).toContain('Generated from `.github/ci-harness/manifest.json`');
    expect(docs).toContain('| Fast Gate |');
    expect(docs).toContain(
      '`PR Ready` may require only jobs declared as merge gates'
    );
    expect(docs).toContain('| Auth and identity | high | yes | yes | no |');
    // Docs must list every locked merge gate + remediation command.
    for (const name of EXPECTED_MERGE_GATE_NAMES) {
      expect(docs).toContain(`\`${name}\``);
    }
    expect(docs).toContain('`pnpm run typecheck && pnpm run biome:check`');
    expect(docs).toContain('`pnpm run test:web:smoke`');
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
    expect(high.recommendedLabels).toEqual(['testing']);
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
    expect(risk.requiresPreview).toBe(false);
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
        { id: 'ci-structural-contract', status: 'failure' },
        { id: 'ci-build-public', status: 'skipped', skipReason: 'docs only' },
      ],
    });

    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.evidence.previewUrl).toBe('https://preview.example.com');
    expect(artifact.evidence.risk.requiresSmoke).toBe(true);
    expect(artifact.requiredGates.map(job => job.id)).toContain(
      'ci-structural-contract'
    );
    expect(
      artifact.nextLocalCommands.some(command =>
        command.includes('pnpm doc:freshness:check')
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

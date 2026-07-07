import { describe, expect, it } from 'vitest';
import {
  buildCiHarnessArtifact,
  classifyCiRisk,
  generateCiHarnessDocs,
  loadCiHarnessManifest,
  replaceGeneratedBlock,
  validateCiHarnessManifest,
} from '../ci-harness.mjs';

const manifest = loadCiHarnessManifest();

describe('ci-harness manifest', () => {
  it('validates the checked-in manifest', () => {
    const validation = validateCiHarnessManifest(manifest);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('generates stable docs from tiers, merge gates, and risk rules', () => {
    const docs = generateCiHarnessDocs(manifest, 'CI Agent Harness');
    expect(docs).toContain('Generated from `.github/ci-harness/manifest.json`');
    expect(docs).toContain('| Fast Gate |');
    expect(docs).toContain(
      '`PR Ready` may require only jobs declared as merge gates'
    );
    expect(docs).toContain('| Auth and identity | high | yes | yes | no |');
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
  it('requires smoke and preview for auth changes (autonomous merge)', () => {
    const risk = classifyCiRisk(['apps/web/lib/auth/gate.ts'], manifest);
    expect(risk.riskLevel).toBe('high');
    expect(risk.requiresSmoke).toBe(true);
    expect(risk.requiresPreview).toBe(true);
    expect(risk.blocksUnattendedAutoMerge).toBe(false);
    expect(risk.matchedRules.map(rule => rule.id)).toContain('auth-identity');
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
});

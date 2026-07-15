import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tsParser = require('@typescript-eslint/parser');
const canonicalUiLabelCasingRule = require('../../../eslint-rules/canonical-ui-label-casing.js');

const webRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(webRoot, '..');

const EXP_DRIFT_TARGETS = [
  'apps/web/app/exp/home-v1/page.tsx',
  'apps/web/app/exp/library-v1/page.tsx',
  'apps/web/app/exp/shell-v1/page.tsx',
] as const;

/**
 * The 8 component files from #11274 that had format drift and/or ESLint
 * label-casing violations. Once the pre-push gate (`biome check .`) catches
 * these, any agent touching unrelated code would get a confusing pre-push
 * failure — so the guard locks the fixed state in permanently.
 */
const COMPONENT_DRIFT_TARGETS = [
  'apps/web/components/features/admin/ShippingVelocityChart.tsx',
  'apps/web/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper.tsx',
  'apps/web/components/features/admin/agent-os/AgentOsRunsPanel.tsx',
  'apps/web/components/features/admin/agent-os/ApprovalQueuePanel.tsx',
  'apps/web/components/features/admin/agent-os/ArtifactDrawer.tsx',
  'apps/web/components/features/demo/DemoSettingsPanel.tsx',
  'apps/web/components/features/demo/DemoTimWhiteProfileSurface.tsx',
  'apps/web/components/features/dev/DevToolbar.tsx',
] as const;

/** Files that had `@jovie/canonical-ui-label-casing` violations in #11274. */
const LABEL_CASING_TARGETS = [
  'components/features/demo/DemoTimWhiteProfileSurface.tsx',
  'components/features/dev/DevToolbar.tsx',
] as const;

function run(command: string) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function canonicalLabelErrors(targets: readonly string[]) {
  const linter = new Linter({ configType: 'flat' });

  return targets.flatMap(target => {
    const filePath = path.resolve(webRoot, target.replace('apps/web/', ''));
    return linter
      .verify(
        readFileSync(filePath, 'utf8'),
        {
          languageOptions: {
            parser: tsParser,
            parserOptions: {
              ecmaFeatures: { jsx: true },
              ecmaVersion: 'latest',
              sourceType: 'module',
            },
          },
          plugins: {
            '@jovie': {
              rules: {
                'canonical-ui-label-casing': canonicalUiLabelCasingRule,
              },
            },
          },
          rules: { '@jovie/canonical-ui-label-casing': 'error' },
        },
        { filename: filePath }
      )
      .filter(
        message =>
          message.ruleId === '@jovie/canonical-ui-label-casing' &&
          message.severity === 2
      );
  });
}

describe('exp drift lint guard (#11224 follow-up)', () => {
  it('keeps the three exp pages Biome-clean so pre-push hooks do not fail on unrelated work', () => {
    const files = EXP_DRIFT_TARGETS.join(' ');
    expect(() => run(`pnpm biome check ${files}`)).not.toThrow();
  });

  it('keeps canonical UI label casing clean on the three exp pages', () => {
    expect(canonicalLabelErrors(EXP_DRIFT_TARGETS)).toEqual([]);
  });
});

describe('component drift lint guard (#11274)', () => {
  it('keeps the 8 component files Biome-clean so pre-push hooks do not fail on unrelated work', () => {
    const files = COMPONENT_DRIFT_TARGETS.join(' ');
    expect(() => run(`pnpm biome check ${files}`)).not.toThrow();
  });

  it('keeps canonical UI label casing clean on the two previously-violated component files', () => {
    expect(canonicalLabelErrors(LABEL_CASING_TARGETS)).toEqual([]);
  });
});

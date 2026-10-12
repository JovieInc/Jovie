import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tsParser = require('@typescript-eslint/parser');
const canonicalUiLabelCasingRule = require('../../../eslint-rules/canonical-ui-label-casing.js');

const webRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(webRoot, '../..');
const biomeCli = require.resolve('@biomejs/biome/bin/biome');
const execFileAsync = promisify(execFile);

const EXP_DRIFT_TARGETS = [
  'apps/web/app/exp/library-v1/page.tsx',
  'apps/web/app/exp/shell-v1/page.tsx',
  'apps/web/app/exp/shell-v1/ShellV1ExperimentClient.tsx',
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

// JOV-4892: launch each Biome check once, in parallel, from a shared beforeAll
// so a loaded affected-suite shard pays the cold process startup once instead
// of sequentially inside two test bodies — sequential cold spawns are what
// exhausted the 5s default vitest budget in shard 4/8. The 30s child timeout is
// ~30-150x the observed 0.2-1s runtime and turns a hung spawn into an ordinary
// assertion failure rather than a test timeout; the 45s test timeout bounds the
// await of the already-running check.
const BIOME_CHILD_TIMEOUT_MS = 30_000;
const BIOME_TEST_TIMEOUT_MS = 45_000;

function checkBiome(targets: readonly string[]) {
  // Resolve the installed CLI directly: shell/pnpm startup can exhaust the
  // unit-test budget on a loaded pre-push runner. Keep the subprocess bounded.
  return execFileAsync(process.execPath, [biomeCli, 'check', ...targets], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: BIOME_CHILD_TIMEOUT_MS,
  });
}

const biomeChecks: Partial<
  Record<'exp' | 'components', ReturnType<typeof checkBiome>>
> = {};

beforeAll(() => {
  biomeChecks.exp = checkBiome(EXP_DRIFT_TARGETS);
  biomeChecks.components = checkBiome(COMPONENT_DRIFT_TARGETS);
});

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
  it(
    'keeps the exp route sources Biome-clean so pre-push hooks do not fail on unrelated work',
    async () => {
      expect(biomeChecks.exp).toBeDefined();
      await expect(biomeChecks.exp).resolves.toBeDefined();
    },
    BIOME_TEST_TIMEOUT_MS
  );

  it('keeps canonical UI label casing clean on the exp route sources', () => {
    expect(canonicalLabelErrors(EXP_DRIFT_TARGETS)).toEqual([]);
  });
});

describe('component drift lint guard (#11274)', () => {
  it(
    'keeps the 8 component files Biome-clean so pre-push hooks do not fail on unrelated work',
    async () => {
      expect(biomeChecks.components).toBeDefined();
      await expect(biomeChecks.components).resolves.toBeDefined();
    },
    BIOME_TEST_TIMEOUT_MS
  );

  it('keeps canonical UI label casing clean on the two previously-violated component files', () => {
    expect(canonicalLabelErrors(LABEL_CASING_TARGETS)).toEqual([]);
  });
});

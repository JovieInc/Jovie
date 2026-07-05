import { execSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('exp drift lint guard (#11224 follow-up)', () => {
  it('keeps the three exp pages Biome-clean so pre-push hooks do not fail on unrelated work', () => {
    const files = EXP_DRIFT_TARGETS.join(' ');
    expect(() => run(`pnpm biome check ${files}`)).not.toThrow();
  });

  it('keeps canonical UI label casing clean on the three exp pages', () => {
    const files = EXP_DRIFT_TARGETS.map(target =>
      target.replace('apps/web/', '')
    ).join(' ');

    let eslintOutput = '';
    try {
      eslintOutput = execSync(
        `pnpm exec eslint --cache --cache-location .cache/eslint --format json ${files}`,
        {
          cwd: webRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120_000,
        }
      );
    } catch (error) {
      const execError = error as { stdout?: string };
      eslintOutput = execError.stdout ?? '';
      if (!eslintOutput) throw error;
    }

    const results = JSON.parse(eslintOutput) as Array<{
      messages: Array<{ ruleId?: string; severity: number }>;
    }>;

    const labelCasingErrors = results.flatMap(result =>
      result.messages.filter(
        message =>
          message.ruleId === '@jovie/canonical-ui-label-casing' &&
          message.severity === 2
      )
    );

    expect(labelCasingErrors).toEqual([]);
  }, 120_000);
});

describe('component drift lint guard (#11274)', () => {
  it('keeps the 8 component files Biome-clean so pre-push hooks do not fail on unrelated work', () => {
    const files = COMPONENT_DRIFT_TARGETS.join(' ');
    expect(() => run(`pnpm biome check ${files}`)).not.toThrow();
  });

  it('keeps canonical UI label casing clean on the two previously-violated component files', () => {
    const files = LABEL_CASING_TARGETS.join(' ');

    let eslintOutput = '';
    try {
      eslintOutput = execSync(
        `pnpm exec eslint --cache --cache-location .cache/eslint --format json ${files}`,
        {
          cwd: webRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120_000,
        }
      );
    } catch (error) {
      const execError = error as { stdout?: string };
      eslintOutput = execError.stdout ?? '';
      if (!eslintOutput) throw error;
    }

    const results = JSON.parse(eslintOutput) as Array<{
      messages: Array<{ ruleId?: string; severity: number }>;
    }>;

    const labelCasingErrors = results.flatMap(result =>
      result.messages.filter(
        message =>
          message.ruleId === '@jovie/canonical-ui-label-casing' &&
          message.severity === 2
      )
    );

    expect(labelCasingErrors).toEqual([]);
  }, 120_000);
});

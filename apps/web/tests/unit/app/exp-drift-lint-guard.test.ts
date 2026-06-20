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

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/summer-eve-pin.yml'),
  'utf8'
);
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
) as { scripts: Record<string, string> };

describe('summer eve pin workflow', () => {
  it('skips gracefully when the pin-check token secret is absent', () => {
    expect(workflow).toContain("cron: '*/30 * * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('scripts/check-summer-eve-pin.ts');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
    const skip = workflow.slice(
      workflow.indexOf('Skip when SUMMER_PIN_CHECK_VERCEL_TOKEN is absent'),
      workflow.indexOf('- name: Checkout')
    );
    expect(skip).toContain(
      '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent; skipping the Summer Eve pin check.'
    );
    expect(skip).toContain('exit 0');
    expect(skip).toContain('skip=true');
    expect(workflow).toContain("steps.token.outputs.skip != 'true'");
    expect(packageJson.scripts['check:summer-eve-pin']).toBe(
      'tsx scripts/check-summer-eve-pin.ts'
    );
  });

  it('pins third-party actions by commit SHA', () => {
    const uses = workflow.match(/uses:\s*\S+/gu) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      if (use.includes('./')) continue;
      expect(use).toMatch(/@[0-9a-f]{40}\b/u);
    }
  });
});

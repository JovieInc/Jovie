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

describe('summer eve identity workflow', () => {
  it('stays read-only, rejects deployment pins, and checks source-bound identity', () => {
    expect(workflow).toContain("cron: '*/30 * * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('pull_request:');
    expect(workflow).not.toContain('paths:');
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain('accountable-writer: Summer');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).toContain(
      'node --test scripts/summer-deployment-pin-guard.test.mjs'
    );
    expect(workflow).toContain('pnpm check:summer-eve-pin');
    expect(workflow).not.toContain('vercel env pull');
    expect(workflow).not.toContain('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN');
    expect(workflow).not.toContain('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID');
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:summer-eve-pin']).toBe(
      'tsx scripts/check-summer-eve-pin.ts'
    );
    for (const use of workflow.match(/uses:\s*\S+/gu) ?? []) {
      if (!use.includes('./')) expect(use).toMatch(/@[0-9a-f]{40}\b/u);
    }
  });
});

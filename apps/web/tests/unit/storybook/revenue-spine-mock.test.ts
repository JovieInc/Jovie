import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mock from '@/.storybook/revenue-spine-mock';
import {
  REVENUE_SPINE_FAILURE_CODES,
  REVENUE_SPINE_STAGES,
} from '@/lib/observability/revenue-spine';

const WEB_ROOT = path.resolve(__dirname, '../../..');

function exportedNames(relativePath: string): string[] {
  const source = readFileSync(path.resolve(WEB_ROOT, relativePath), 'utf8');
  return [
    ...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
  ].map(match => match[1]);
}

describe('revenue-spine Storybook mock', () => {
  it('exports every runtime name the real module exports', () => {
    const names = exportedNames('lib/observability/revenue-spine.ts');
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => !(name in mock))).toEqual([]);
  });

  it('keeps the stage and failure-code contracts identical', () => {
    expect(mock.REVENUE_SPINE_STAGES).toEqual(REVENUE_SPINE_STAGES);
    expect(mock.REVENUE_SPINE_FAILURE_CODES).toEqual(
      REVENUE_SPINE_FAILURE_CODES
    );
  });

  it('is browser-safe: no node builtin imports', () => {
    const source = readFileSync(
      path.resolve(WEB_ROOT, '.storybook/revenue-spine-mock.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"]node:/);
    expect(() => mock.captureRevenueSpineFailure()).not.toThrow();
  });

  it('is wired as a Storybook alias', () => {
    const main = readFileSync(
      path.resolve(WEB_ROOT, '.storybook/main.ts'),
      'utf8'
    );
    expect(main).toMatch(
      /find: '@\/lib\/observability\/revenue-spine',\s*replacement: require\.resolve\('\.\/revenue-spine-mock\.ts'\)/
    );
  });
});

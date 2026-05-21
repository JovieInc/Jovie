import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

describe('requireProfileId fast path', () => {
  it('uses essential dashboard data instead of the full dashboard payload', () => {
    const source = readSource('app/app/(shell)/dashboard/requireProfileId.ts');

    expect(source).toContain('getDashboardDataEssential');
    expect(source).not.toContain('getDashboardData()');
  });
});

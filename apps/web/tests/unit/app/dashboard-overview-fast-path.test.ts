import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

describe('dashboard overview fast path', () => {
  it('uses essential dashboard data plus an overview supplement', () => {
    const source = readSource(
      'app/app/(shell)/dashboard/DashboardOverviewSection.tsx'
    );

    expect(source).toContain('getDashboardDataEssential');
    expect(source).toContain('getDashboardOverviewSupplement');
    expect(source).not.toMatch(/\bgetDashboardData\s*\(/);
  });
});

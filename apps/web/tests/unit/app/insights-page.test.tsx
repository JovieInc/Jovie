import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('insights page route contract', () => {
  it('uses the shared app shell route context instead of local dashboard loaders', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/app/(shell)/insights/page.tsx'),
      'utf8'
    );

    expect(source).toContain('loadAppShellRouteContext');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('getDashboardDataEssential');
    expect(source).not.toMatch(/\bgetDashboardData\(/);
  });
});

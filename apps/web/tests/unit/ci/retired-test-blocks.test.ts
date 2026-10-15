import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Keep the JOV-7732 cleanup bounded to the retired unit suites. Playwright's
// runtime-conditional environment gates are outside this contract.
const retiredTestPaths = [
  'tests/unit/app/native-complete-page.test.tsx',
  'tests/unit/app/signin-page.test.tsx',
  'tests/unit/auth/waitlist-gating.test.ts',
  'tests/unit/ladygaga-seed.test.ts',
  'tests/unit/middleware/proxy-behavioral.test.ts',
  'tests/unit/middleware/proxy-composition.critical.test.ts',
  'tests/unit/tooltip.test.tsx',
];

describe('retired unit test debt', () => {
  it('keeps the retired suites free of skipped or placeholder cases', () => {
    const violations = retiredTestPaths.filter(file => {
      const filePath = resolve(process.cwd(), file);
      // Suites containing only retired cases can be removed altogether.
      return (
        existsSync(filePath) &&
        /\b(?:describe|it|test)\.(?:skip|todo)\s*\(/.test(
          readFileSync(filePath, 'utf8')
        )
      );
    });

    expect(violations).toEqual([]);
  });
});

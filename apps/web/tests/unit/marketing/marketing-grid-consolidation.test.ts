import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const firstBatchRoutes = [
  'app/(marketing)/voice/page.tsx',
  'app/(marketing)/ai/page.tsx',
  'app/(marketing)/investors/page.tsx',
] as const;

describe('marketing first-batch grid contract', () => {
  it('uses the canonical public page container without a local shell', () => {
    for (const route of firstBatchRoutes) {
      const source = readFileSync(resolve(process.cwd(), route), 'utf8');

      expect(source, route).toContain("MarketingContainer width='page'");
      expect(source, route).not.toContain('max-w-5xl flex');
      expect(source, route).not.toContain('sectionWrapClassName');
      expect(source, route).not.toContain('transition-all');
    }
  });
});

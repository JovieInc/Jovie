import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_INTERVIEWS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/interviews/page.tsx'
);
const ADMIN_PLATFORM_CONNECTIONS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/platform-connections/page.tsx'
);

describe('admin child route auth normalization', () => {
  it('keeps read-only admin child pages on the parent admin layout gate', () => {
    for (const filePath of [
      ADMIN_INTERVIEWS_PAGE,
      ADMIN_PLATFORM_CONNECTIONS_PAGE,
    ]) {
      const source = readFileSync(filePath, 'utf8');

      expect(source).not.toContain('getCachedAuth');
      expect(source).not.toContain('checkAdminRole');
      expect(source).not.toContain('requireAdminOrRedirect');
      expect(source).not.toMatch(/\brequireAdmin\(\)/);
    }
  });
});

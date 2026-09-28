import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_INTERVIEWS_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/interviews/page.tsx'
);

describe('admin child route auth normalization', () => {
  it('keeps read-only admin child pages on the parent admin layout gate', () => {
    const source = readFileSync(ADMIN_INTERVIEWS_PAGE, 'utf8');

    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('checkAdminRole');
    expect(source).not.toContain('requireAdminOrRedirect');
    expect(source).not.toMatch(/\brequireAdmin\(\)/);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);
const ADMIN_INTERVIEWS_ROUTE = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/interviews/page.tsx'
);

describe('admin interviews shell normalization', () => {
  it('keeps the route inside the canonical admin shell', () => {
    const source = readFileSync(ADMIN_INTERVIEWS_ROUTE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toContain('<AdminPage');
    expect(source).toContain("testId='admin-interviews-page'");
    expect(source).not.toContain("className='space-y-4 p-6'");
    expect(source).not.toContain('<header>');
  });

  it('uses tokenized list rows and shared status badges', () => {
    const source = readFileSync(ADMIN_INTERVIEWS_ROUTE, 'utf8');

    expect(source).toContain("import { Badge } from '@jovie/ui';");
    expect(source).toContain('divide-y divide-subtle');
    expect(source).toContain('bg-surface-0');
    expect(source).not.toContain('divide-white/[0.06]');
    expect(source).not.toContain('bg-white/[0.03]');
    expect(source).not.toContain('bg-white/[0.05]');
  });

  it('keeps interview route data outside the page module', () => {
    const source = readFileSync(ADMIN_INTERVIEWS_ROUTE, 'utf8');

    expect(source).toContain('loadAdminInterviewRows');
    expect(source).not.toContain('@/lib/db');
    expect(source).not.toContain('@/lib/db/schema/auth');
    expect(source).not.toContain('@/lib/db/schema/profiles');
    expect(source).not.toContain('@/lib/db/schema/user-interviews');
    expect(source).not.toContain('userInterviews');
    expect(source).not.toContain('creatorProfiles');
  });
});

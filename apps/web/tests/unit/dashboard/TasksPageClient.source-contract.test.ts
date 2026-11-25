import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for TasksPageClient: class contracts, banned imports and
 * retired APIs that a render test can't see. Interaction tests stay in
 * TasksPageClient.test.tsx.
 */
const source = readFileSync(
  resolve(
    __dirname,
    '../../../components/features/dashboard/tasks/TasksPageClient.tsx'
  ),
  'utf8'
);

describe('TasksPageClient source contract', () => {
  it('keeps task stage and priority metadata controls at 28px on desktop', () => {
    expect(source).toContain(
      '-mx-2 relative inline-flex h-7 min-w-0 items-center rounded-full px-2'
    );
    expect(source).toContain('before:h-11 before:min-w-11 before:w-full');
    expect(source).toContain('sm:before:h-7 sm:before:min-w-0');
    expect(source).not.toContain('inline-flex h-8 min-w-0');
    expect(source).toContain(
      "<TaskMetaTrigger ariaLabel='Change Task Status'>"
    );
    expect(source).toContain(
      "<TaskMetaTrigger ariaLabel='Change Task Priority'>"
    );
  });

  it('drops the retired Disc3 release glyph (banned icon guard, Tim, 2026-09-25)', () => {
    expect(source).not.toContain('Disc3');
    expect(source).toContain('Layers,');
    expect(source).toContain('<Layers className=');
  });

  it('routes table API imports through the v9 compat adapter', () => {
    expect(source).toContain("'@/lib/tanstack-table'");
    expect(source).not.toContain("'@tanstack/react-table'");
  });

  it('does not register a retired header search adapter (JOV-8792)', () => {
    expect(source).not.toContain('useRegisterHeaderSearch');
    expect(source).not.toContain('headerSearchAdapter');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(
    join(
      process.cwd(),
      'components/features/dashboard/organisms/release-provider-matrix',
      relativePath
    ),
    'utf8'
  );
}

describe('release filter System B style guard', () => {
  it('keeps ReleaseFilterDropdown count badges off legacy accent variables', () => {
    const source = readSource('ReleaseFilterDropdown.tsx');

    expect(source).not.toContain('--linear-accent');
    expect(source).toContain('bg-surface-1');
    expect(source).toContain('text-tertiary-token');
  });

  it('keeps FilterSubmenu count badges on named System B seam utilities', () => {
    const source = readSource('FilterSubmenu.tsx');

    expect(source).not.toContain('border-(--linear-app-frame-seam)');
    expect(source).toContain('border-subtle');
    expect(source).toContain('bg-surface-1');
    expect(source).toContain('text-tertiary-token');
  });
});

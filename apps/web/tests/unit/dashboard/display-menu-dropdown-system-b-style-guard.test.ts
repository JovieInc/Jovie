import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = join(
  process.cwd(),
  'components/organisms/table/molecules/DisplayMenuDropdown.tsx'
);

describe('DisplayMenuDropdown System B style guard', () => {
  it('keeps the checked switch state neutral instead of primary/accent filled', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain("checked ? 'bg-primary' : 'bg-surface-2'");
    expect(source).not.toMatch(/\bbg-primary\b/);
    expect(source).not.toMatch(/\bbg-accent\b/);
    expect(source).toContain("checked ? 'bg-btn-primary' : 'bg-surface-2'");
    expect(source).toContain(
      "checked ? 'bg-btn-primary-foreground' : 'bg-white dark:bg-white'"
    );
  });

  it('keeps switch state transitions layout-stable', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('transition-[background-color]');
    expect(source).toContain('hover:bg-surface-1');
    expect(source).toContain('focus-visible:bg-surface-1');
    expect(source).toContain('focus-visible:outline-none');
    expect(source).toContain('focus-visible:ring-1 focus-visible:ring-ring');
    expect(source).toContain('h-4 w-7 shrink-0');
    expect(source).toContain('h-3 w-3 rounded-full');
    expect(source).toContain('translate-x-3');
  });
});

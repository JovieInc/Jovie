import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TaskWorkspaceHeaderBar', () => {
  it('uses the single unified header-height token (founder lock 2026-09-25)', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).toContain(
      'h-(--app-shell-header-height) min-h-(--app-shell-header-height)'
    );
    expect(source).not.toContain('--app-shell-header-height-compact');
  });

  it('keeps the primary New Task action visible at every breakpoint', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).toContain("{mode === 'create' ? 'Create' : 'New Task'}");
    expect(source).not.toContain("'hidden lg:inline-flex'");
  });
});

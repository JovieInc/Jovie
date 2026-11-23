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

describe('TaskWorkspaceHeaderBar focus', () => {
  it('moves focus to the draft field on entering create mode, not with autoFocus', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/\bautoFocus\b/);
    expect(source).toContain(
      "if (mode === 'create') draftInputRef.current?.focus();"
    );
  });
});

describe('TaskWorkspaceHeaderBar control heights (JOV-12567)', () => {
  it('sits on the 28px control and 44px bar contract', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskWorkspaceHeaderBar.tsx'),
      'utf8'
    );

    expect(source).toContain("'relative h-7 gap-1.5 px-2 text-xs'");
    expect(source).toContain("'h-7 px-2.5'");
    expect(source).toContain("'h-7 w-7 px-0'");
    expect(source).toContain("'h-7 max-w-lg min-w-0'");
    expect(source).not.toContain("'h-8 px-2.5'");
    expect(source).not.toContain("'h-8 w-8 px-0'");
    expect(source).not.toContain('sm:before:h-8');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = join(
  process.cwd(),
  'components/organisms/table/molecules/DisplayMenuDropdown.tsx'
);

describe('DisplayMenuDropdown System B style guard', () => {
  it('composes the canonical toolbar action trigger instead of restoring local chrome', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain(
      "import { PAGE_TOOLBAR_ACTION_BUTTON_CLASS } from './PageToolbar';"
    );
    expect(source).toContain('PAGE_TOOLBAR_ACTION_BUTTON_CLASS');
    expect(source).not.toContain('hover:border-subtle');
  });

  it('composes the grouping toggle from the canonical switch owner', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toMatch(
      /import \{[\s\S]*Switch[\s\S]*\} from '@jovie\/ui';/
    );
    expect(source).toContain('<Switch');
    expect(source).toContain('checked={checked}');
    expect(source).toContain('onCheckedChange={onToggle}');
    expect(source).not.toContain("role='switch'");
    expect(source).not.toContain('aria-checked={checked}');
    expect(source).not.toContain("checked ? 'bg-primary' : 'bg-surface-2'");
    expect(source).not.toMatch(/\bbg-primary\b/);
    expect(source).not.toMatch(/\bbg-accent\b/);
    expect(source).not.toContain("checked ? 'bg-btn-primary' : 'bg-surface-2'");
    expect(source).not.toContain('h-4 w-7 shrink-0');
    expect(source).not.toContain('translate-x-3');
  });

  it('keeps the grouping switch label associated with the control', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('const id = useId();');
    expect(source).toContain('const labelId = `${id}-label`;');
    expect(source).toContain('htmlFor={id}');
    expect(source).toContain('aria-labelledby={labelId}');
  });

  it('keeps switch row feedback layout-stable while focus belongs to the switch', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('transition-[background-color]');
    expect(source).toContain('hover:bg-surface-1');
    expect(source).toContain('focus-within:bg-surface-1');
    expect(source).not.toContain(
      'focus-visible:ring-1 focus-visible:ring-ring'
    );
  });
});

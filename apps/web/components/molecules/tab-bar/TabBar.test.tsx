import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TabBar task density contract', () => {
  it('keeps segment overflow controls at 32px on desktop', () => {
    const source = readFileSync(resolve(__dirname, './TabBar.tsx'), 'utf8');

    expect(source).toContain('const TAB_BAR_SEGMENT_OVERFLOW_TRIGGER_CLASSNAME');
    expect(source).toContain("'h-8 w-8 sm:before:h-8 sm:before:w-8'");
    expect(source).toContain('const overflowTriggerClassName =');
    expect(source).toContain('className={overflowTriggerClassName}');
    expect(source).toContain(
      "cn('invisible absolute', overflowTriggerClassName)"
    );
  });
});

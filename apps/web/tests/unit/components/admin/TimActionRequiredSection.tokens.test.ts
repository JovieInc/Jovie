import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);
const TIM_ACTION_SECTION = join(
  TEST_DIR,
  '../../../../components/features/admin/TimActionRequiredSection.tsx'
);

describe('TimActionRequiredSection token usage', () => {
  it('keeps the warning accent on design tokens', () => {
    const source = readFileSync(TIM_ACTION_SECTION, 'utf8');

    expect(source).toContain('group-hover:text-warning');
    expect(source).toContain('hover:border-warning/30');
    expect(source).toContain('hover:bg-warning/10');
    expect(source).toContain('hover:text-warning');
    expect(source).toContain('bg-warning');
    expect(source).not.toContain('#FACC15');
    expect(source).not.toContain('backgroundColor');
  });

  it('avoids uppercase tracking on the compact admin shell header', () => {
    const source = readFileSync(TIM_ACTION_SECTION, 'utf8');

    expect(source).toContain('font-caption text-tertiary-token');
    expect(source).not.toContain('uppercase tracking');
    expect(source).not.toContain('tracking-[0.16em]');
  });
});

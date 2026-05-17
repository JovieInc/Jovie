import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(import.meta.dirname, '../../../..');
const COMPONENT_PATH = 'components/features/admin/ShippingVelocityChart.tsx';

function readComponentSource() {
  return readFileSync(resolve(APP_ROOT, COMPONENT_PATH), 'utf8');
}

describe('ShippingVelocityChart source guard', () => {
  it('keeps chart colors on semantic design tokens', () => {
    const source = readComponentSource();

    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).toContain("merged: 'var(--color-accent)'");
    expect(source).toContain("opened: 'var(--color-success)'");
    expect(source).toContain("closed: 'var(--color-error)'");
  });

  it('keeps shell, labels, and controls on token classes', () => {
    const source = readComponentSource();

    expect(source).not.toMatch(/\b(?:bg|border|text)-white(?:\/|\b)/);
    expect(source).not.toContain('uppercase');
    expect(source).not.toMatch(/\btracking-\[[^\]]+\]/);
    expect(source).toContain('bg-surface-0');
    expect(source).toContain('text-primary-token');
    expect(source).toContain('text-secondary-token');
    expect(source).toContain('text-tertiary-token');
    expect(source).toContain('border-subtle');
  });
});

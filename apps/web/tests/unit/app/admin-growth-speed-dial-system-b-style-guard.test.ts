import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const speedDialSourcePath = 'components/features/admin/leads/GtmSpeedDial.tsx';

describe('admin growth speed dial System B source contract', () => {
  it('keeps speed preset controls neutral instead of accent-filled', () => {
    const source = readFileSync(resolve(appRoot, speedDialSourcePath), 'utf8');

    expect(source).not.toContain('bg-primary-token text-on-primary');
    expect(source).not.toContain('text-accent hover:underline');
    expect(source).not.toMatch(/\bbg-(?:blue|purple|violet|indigo)-\d/);

    expect(source).toContain('border-(--linear-btn-primary-border)');
    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
  });
});

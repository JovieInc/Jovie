import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const sourcePath = resolve(
  appRoot,
  'components/onboarding/OnboardingInterviewModal.tsx'
);

describe('onboarding interview modal System B source contract', () => {
  it('keeps the modal surface and input on shared System B primitives', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain("import { Button, Textarea } from '@jovie/ui'");
    expect(source).toContain('rounded-(--linear-radius-lg)');
    expect(source).toContain('border-(--linear-border-subtle)');
    expect(source).toContain('bg-(--linear-bg-surface-0)');
    expect(source).toContain('shadow-(--linear-shadow-card-elevated)');
    expect(source).toContain('backdrop:bg-(--linear-bg-page)');
    expect(source).toContain('<Textarea');

    expect(source).not.toContain('border-white/[0.08]');
    expect(source).not.toContain('bg-white/[0.04]');
    expect(source).not.toContain('focus:border-white/20');
    expect(source).not.toContain('bg-[var(--color-bg-surface-3,#2a2c32)]');
    expect(source).not.toContain('shadow-[0_5px_50px_rgba');
    expect(source).not.toContain('<textarea');
  });

  it('uses stable tokenized progress dots instead of typographic glyph progress', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('progressLabel');
    expect(source).toContain('min-h-7');
    expect(source).toContain('data-[state=active]:bg-primary-token');

    expect(source).not.toContain("'●'");
    expect(source).not.toContain("'○'");
    expect(source).not.toContain('tracking-widest');
  });
});

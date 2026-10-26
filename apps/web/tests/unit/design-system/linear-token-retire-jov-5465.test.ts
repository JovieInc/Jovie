import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('JOV-5465 duration/ease/shadow/blur retire', () => {
  it('keeps TestimonialCard on the canonical duration token', () => {
    const source = readSource('components/features/home/TestimonialCard.tsx');
    expect(source).toContain('duration-(--duration-normal)');
    expect(source).not.toMatch(/--linear-duration-/);
  });

  it('keeps ConsentBanner on canonical spacing and card shadow tokens', () => {
    const source = readSource('components/features/tracking/ConsentBanner.tsx');
    expect(source).toContain("gap: 'var(--space-2)'");
    expect(source).toContain('var(--shadow-card)');
    expect(source).not.toMatch(/--linear-(?:space|gap|container)-/);
    expect(source).not.toContain('--linear-shadow-card');
  });
});

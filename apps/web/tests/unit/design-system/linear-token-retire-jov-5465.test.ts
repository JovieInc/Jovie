import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('JOV-5465 duration/ease/shadow/blur retire', () => {
  it('keeps DeeplinksGrid on canonical duration tokens', () => {
    const source = readSource('components/features/home/DeeplinksGrid.tsx');
    expect(source).toContain('duration-(--duration-slow)');
    expect(source).toContain('duration-(--duration-normal)');
    expect(source).not.toMatch(/--linear-duration-/);
  });

  it('keeps FloatingClaimBar on the canonical elevated card shadow', () => {
    const source = readSource('components/features/home/FloatingClaimBar.tsx');
    expect(source).toContain('var(--shadow-card-elevated)');
    expect(source).not.toContain('--linear-shadow-card-elevated');
  });

  it('keeps PricingSection on canonical card shadows', () => {
    const source = readSource('components/features/home/PricingSection.tsx');
    expect(source).toContain('var(--shadow-card)');
    expect(source).toContain('var(--shadow-card-elevated)');
    expect(source).not.toMatch(/--linear-shadow-/);
  });

  it('keeps ReleaseNotificationsSection on canonical shadow and duration tokens', () => {
    const source = readSource(
      'components/features/home/ReleaseNotificationsSection.tsx'
    );
    expect(source).toContain('var(--shadow-card-elevated)');
    expect(source).toContain('duration-(--duration-normal)');
    expect(source).not.toMatch(/--linear-(?:shadow-|duration-)/);
  });

  it('keeps TestimonialCard on the canonical duration token', () => {
    const source = readSource('components/features/home/TestimonialCard.tsx');
    expect(source).toContain('duration-(--duration-normal)');
    expect(source).not.toMatch(/--linear-duration-/);
  });

  it('keeps DashboardLinksDemo on the canonical button shadow', () => {
    const source = readSource(
      'components/features/home/demo/DashboardLinksDemo.tsx'
    );
    expect(source).toContain('var(--shadow-button)');
    expect(source).not.toContain('--linear-shadow-button');
  });

  it('keeps ConsentBanner on canonical spacing and card shadow tokens', () => {
    const source = readSource('components/features/tracking/ConsentBanner.tsx');
    expect(source).toContain("gap: 'var(--space-2)'");
    expect(source).toContain('var(--shadow-card)');
    expect(source).not.toMatch(/--linear-(?:space|gap|container)-/);
    expect(source).not.toContain('--linear-shadow-card');
  });

  it('keeps PricingSection heading guarded by canonical-ui-label-casing (JOV-5747)', () => {
    const source = readSource('components/features/home/PricingSection.tsx');
    expect(source).toContain('Simple Pricing.');
    expect(source).not.toContain('ui-casing-allow');
  });
});

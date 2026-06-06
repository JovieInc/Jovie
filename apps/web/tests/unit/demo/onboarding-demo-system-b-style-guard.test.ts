import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const demoOnboardingSourcePath =
  'components/features/demo/OnboardingDemoContent.tsx';

const forbiddenCentralActionPatterns = [
  /bg-accent-token\s+text-white/,
  /\bbg-(?:blue|purple|violet|indigo)-\d/,
  /\b(?:from|via|to)-(?:blue|purple|violet|indigo)-\d/,
  /\btext-white\b/,
  /--linear-accent/,
] as const;

describe('Onboarding demo System B source contract', () => {
  it('keeps demo step switcher actions neutral instead of accent-filled', () => {
    const source = readFileSync(
      resolve(appRoot, demoOnboardingSourcePath),
      'utf8'
    );

    for (const pattern of forbiddenCentralActionPatterns) {
      expect(
        source,
        `${demoOnboardingSourcePath} leaked ${pattern}`
      ).not.toMatch(pattern);
    }

    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
  });

  it('reserves stable step switcher geometry across selected and idle states', () => {
    const source = readFileSync(
      resolve(appRoot, demoOnboardingSourcePath),
      'utf8'
    );

    expect(source).toContain('min-h-7');
    expect(source).toContain('border-transparent');
    expect(source).toContain('border-(--linear-btn-primary-border)');
  });
});

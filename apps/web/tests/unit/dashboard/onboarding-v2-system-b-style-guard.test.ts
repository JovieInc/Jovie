import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const sourcePath =
  'components/features/dashboard/organisms/onboarding-v2/OnboardingV2Form.tsx';
const sourceFile = resolve(webRoot, sourcePath);

const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');
const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /\brgba?\(/,
  /\bhsla?\(/,
  new RegExp(gradientPattern, 'i'),
  /\bcolor-mix\(/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|max-h|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/,
  /\btracking-(?:tight|tighter)\b/,
  /\b(?:active:)?scale-/,
] as const;

describe('OnboardingV2Form System B source contract', () => {
  it('keeps fixed onboarding visuals on named System B primitives', () => {
    const source = readFileSync(sourceFile, 'utf8');

    for (const pattern of forbiddenVisualPatterns) {
      expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('system-b-onboarding-step-icon');
    expect(source).toContain('system-b-onboarding-flat-panel');
    expect(source).toContain('system-b-onboarding-context-textarea');
  });
});

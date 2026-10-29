import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Marketing sections must not render decorative step numbering ("Step 1",
 * "01 02 03", "1. Identify") or unverified market-stat cards. Step titles and
 * bodies carry the meaning; numerals are decoration.
 */
const WEB_ROOT = path.resolve(import.meta.dirname, '../../..');

const read = (rel: string) => readFileSync(path.join(WEB_ROOT, rel), 'utf8');

const STEP_NUMBER_TOKENS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'Step {n} label', pattern: /Step \{(?:i|index|idx)\s*\+\s*1\}/ },
  { name: '0{index + 1} numeral', pattern: /0\{(?:i|index|idx)\s*\+\s*1\}/ },
  { name: "padStart(2, '0') numeral", pattern: /padStart\(2,\s*'0'\)/ },
  { name: "'01' style literal", pattern: /\b(?:n|number|step):\s*'0[1-9]'/ },
  { name: 'rendered {step.n}', pattern: /\{step\.n\}/ },
  {
    name: "numbered heading '1. Word'",
    pattern: />\s*[1-9]\. [A-Z][a-z]+\s*</,
  },
  { name: 'Four/Three steps pill', pattern: />(?:Four|Three) steps</ },
];

const STEP_FREE_FILES = [
  'components/features/pay/PayLanding.tsx',
  'components/organisms/VoicePageContent.tsx',
  'app/(marketing)/instant-merch/InstantMerchLanding.tsx',
  'app/(marketing)/ai/page.tsx',
  'components/marketing/artist-profile/ArtistProfileHowItWorks.tsx',
] as const;

describe('marketing step numbering guard', () => {
  for (const file of STEP_FREE_FILES) {
    it(`${file} renders no step-number tokens`, () => {
      const source = read(file);
      const hits = STEP_NUMBER_TOKENS.filter(t => t.pattern.test(source)).map(
        t => t.name
      );
      expect(hits).toEqual([]);
    });
  }

  it('/launch renders no market-stat cards', () => {
    const source = read('app/(marketing)/launch/page.tsx');
    expect(source).not.toMatch(/system-b-launch-stat-grid/);
    expect(source).not.toMatch(/const STATS\b/);
  });

  it('/instant-merch details do not describe the page itself', () => {
    const source = read('data/instantMerchCopy.ts');
    expect(source).not.toMatch(/landing page does not/i);
    expect(source).not.toMatch(/clearly labeled as a concept/i);
  });
});

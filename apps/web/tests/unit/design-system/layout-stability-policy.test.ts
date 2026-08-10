import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const design = readFileSync(join(REPO_ROOT, 'DESIGN.md'), 'utf8');
const uiRule = readFileSync(join(REPO_ROOT, '.claude/rules/ui.md'), 'utf8');
const testingGuidelines = readFileSync(
  join(REPO_ROOT, 'docs/TESTING_GUIDELINES.md'),
  'utf8'
);
const faqSection = readFileSync(
  join(WEB_ROOT, 'components/marketing/FaqSection.tsx'),
  'utf8'
);
const faqAccordion = readFileSync(
  join(WEB_ROOT, 'components/marketing/ClientFaqAccordion.tsx'),
  'utf8'
);
const marketingRegistry = readFileSync(
  join(WEB_ROOT, 'data/marketing/sections.ts'),
  'utf8'
);

describe('layout stability policy', () => {
  it('distinguishes unexpected instability from semantic disclosure geometry', () => {
    for (const source of [design, uiRule]) {
      expect(source).toMatch(/unexpected or uninitiated layout instability/i);
      expect(source).toMatch(/direct, local, and deterministic result/i);
      expect(source).toMatch(/explicit disclosure or navigation action/i);
      expect(source).toMatch(/declared interaction boundary/i);
      expect(source).toMatch(/async, loading, error, or content change/i);
      expect(source).toMatch(/reserve space or use an overlay/i);
      expect(source).toMatch(/unrelated siblings outside the disclosure flow/i);
      expect(source).toMatch(/paint- or compositor-safe properties/i);
      expect(source).toMatch(
        /under reduced motion, resolve height immediately/i
      );
    }
  });

  it('grounds browser metrics and source guards in complementary ownership checks', () => {
    expect(testingGuidelines).toMatch(
      /CLS excludes layout shifts shortly after qualifying user input/i
    );
    expect(testingGuidelines).toMatch(/bounded, local, and deterministic/i);
    expect(testingGuidelines).toMatch(/state ownership/i);
  });

  it('keeps the canonical FAQ on a collapsed, bounded disclosure contract', () => {
    expect(faqSection).toContain(
      "data-layout-contract='bounded-local-disclosure'"
    );
    expect(faqAccordion).toContain('hidden={!isOpen}');
    expect(faqAccordion).toContain('aria-expanded={isOpen}');
    expect(faqAccordion).toContain('aria-controls={panelId}');
    expect(faqAccordion).toContain('aria-labelledby={triggerId}');
    expect(faqAccordion).not.toContain('grid-rows-[1fr]');
    expect(marketingRegistry).toContain('bounded disclosure boundary');
  });
});

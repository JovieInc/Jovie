import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORT_FAQ_ITEMS, SUPPORT_SEO_COPY } from './supportCopy';

const webRoot = resolve(import.meta.dirname, '..');
const readSource = (path: string) =>
  readFileSync(resolve(webRoot, path), 'utf8');

describe('shared support language', () => {
  it('does not require a music service in the general setup answer', () => {
    const setup = SUPPORT_FAQ_ITEMS.find(item =>
      item.question.includes('get started')
    );
    expect(setup).toBeDefined();
    expect(setup?.answer).toContain('Find yourself');
    expect(setup?.answer).not.toMatch(/connect (?:Spotify|Apple Music)/i);
  });

  // Tim 2026-09-26 (supersedes JOV-6432): help and support are non-ICP
  // surfaces, so smart-link help uses general Jovie profile language.
  it('explains smart links without music-specific wording', () => {
    const smartLinks = SUPPORT_FAQ_ITEMS.find(item =>
      item.question.includes('smart links')
    );
    expect(smartLinks?.question).toBe('How do smart links work?');
    expect(smartLinks?.answer).toContain('Jovie profile');
    expect(`${smartLinks?.question} ${smartLinks?.answer}`).not.toMatch(
      /\b(music|release|fan|streaming)\b/i
    );
  });

  it('uses profile and account metadata for the shared support page', () => {
    expect(SUPPORT_SEO_COPY.keywords).toContain('Jovie profile help');
    expect(SUPPORT_SEO_COPY.keywords).not.toContain('artist profile support');
  });

  it('shares one FAQ source between visible answers and structured data', () => {
    const route = readSource('app/(marketing)/support/page.tsx');
    const component = readSource('components/organisms/SupportPageContent.tsx');
    expect(route).toContain("from '@/data/supportCopy'");
    expect(component).toContain("from '@/data/supportCopy'");
    expect(route).toContain('buildFaqSchema([...SUPPORT_FAQ_ITEMS])');
    expect(component).toContain('items={[...SUPPORT_FAQ_ITEMS]}');
    expect(route).not.toContain('const SUPPORT_FAQ_ITEMS =');
    expect(component).not.toContain('const SUPPORT_FAQ_ITEMS =');
  });
});

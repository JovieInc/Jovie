import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORT_SEO_COPY } from './supportCopy';

const webRoot = resolve(import.meta.dirname, '..');
const readSource = (path: string) =>
  readFileSync(resolve(webRoot, path), 'utf8');

describe('shared support language', () => {
  it('uses profile and account metadata for the shared support page', () => {
    expect(SUPPORT_SEO_COPY.keywords).toContain('Jovie profile help');
    expect(SUPPORT_SEO_COPY.keywords).not.toContain('artist profile support');
  });

  it('routes article answers to the canonical Help Center instead of duplicating them', () => {
    const route = readSource('app/(marketing)/support/page.tsx');
    const component = readSource('components/organisms/SupportPageContent.tsx');
    const channels = readSource('app/(marketing)/support/SupportContent.tsx');
    expect(route).toContain("from '@/data/supportCopy'");
    expect(route).not.toContain('SUPPORT_FAQ_ITEMS');
    expect(component).not.toContain('FaqSection');
    expect(channels).toContain('${DOCS_URL}/docs');
    expect(channels).toContain('${DOCS_URL}/contact');
  });
});

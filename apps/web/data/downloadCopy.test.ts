import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lintCopy } from '@jovie/copy';
import { describe, expect, it } from 'vitest';

import { DOWNLOAD_COPY } from './downloadCopy';

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../app/(marketing)/download/page.tsx'),
  'utf8'
);

const forbidden = [
  /\bnative\b/i,
  /\balpha\b/i,
  /testflight/i,
  /internal alpha/i,
];

function customerStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) {
    for (const entry of value) customerStrings(entry, out);
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) customerStrings(entry, out);
  }
  return out;
}

const headlines = [
  DOWNLOAD_COPY.headline,
  DOWNLOAD_COPY.platforms.mac.title,
  DOWNLOAD_COPY.platforms.iphone.title,
  DOWNLOAD_COPY.workflowTitle,
  DOWNLOAD_COPY.installTitle,
  DOWNLOAD_COPY.footerTitle,
  DOWNLOAD_COPY.faqHeading,
  ...DOWNLOAD_COPY.features.map(feature => feature.title),
  ...DOWNLOAD_COPY.installCards.map(card => card.title),
];

describe('download copy', () => {
  it('passes the marketing copy lint', () => {
    const strings = customerStrings(DOWNLOAD_COPY);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(lintCopy(text, { register: 'jovie-marketing' }).blocking).toEqual(
        []
      );
    }
    for (const text of headlines) {
      expect(
        lintCopy(text, { register: 'jovie-marketing', headline: true }).blocking
      ).toEqual([]);
    }
  });

  it('does not call the Mac app native or describe a private phone test', () => {
    const surface = `${pageSource}\n${customerStrings(DOWNLOAD_COPY).join('\n')}`;
    for (const pattern of forbidden) {
      expect(surface).not.toMatch(pattern);
    }
    expect(pageSource).toContain("from '@/data/downloadCopy'");
    expect(pageSource).not.toContain('ios-alpha');
    expect(pageSource).not.toContain('disabled');
  });
});

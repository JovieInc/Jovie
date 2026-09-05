import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const homeCss = readFileSync(
  path.resolve(__dirname, '../../../app/(home)/home.css'),
  'utf8'
);
const certifiedSectionsCss = homeCss.slice(
  homeCss.indexOf('HOMEPAGE CERTIFIED SECTIONS START'),
  homeCss.indexOf('HOMEPAGE CERTIFIED SECTIONS END')
);

describe('homepage closing CTA spacing contract', () => {
  it('keeps substantial, symmetric breathing room at desktop and mobile widths', () => {
    expect(certifiedSectionsCss).toContain(
      'padding-block: clamp(var(--space-32), 14vw, calc(var(--space-24) * 2));'
    );
    expect(certifiedSectionsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.homepage-close\s*\{\s*padding-block:\s*var\(--space-32\);\s*\}/
    );
  });
});

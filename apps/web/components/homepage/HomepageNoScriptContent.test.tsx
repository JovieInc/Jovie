import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HomepageNoScriptContent } from './HomepageNoScriptContent';

const CONTENT_RATIO_TARGET = 0.05;

// Official Is Agentic scan at 2026-08-30T09:17:52.555Z:
// 1,778 content characters / 68,806 script-free body bytes = 2.6%.
const REPORTED_BODY_BYTES = 68_806;
const REPORTED_CONTENT_CHARACTERS = 1_778;
const homepageSource = readFileSync(
  path.resolve(process.cwd(), 'app/(home)/page.tsx'),
  'utf8'
);
const homepageCss = readFileSync(
  path.resolve(process.cwd(), 'app/(home)/home.css'),
  'utf8'
);

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function contentRatio(bodyBytes: number, contentCharacters: number): number {
  return contentCharacters / bodyBytes;
}

describe('HomepageNoScriptContent', () => {
  it('is mounted after the existing homepage content', () => {
    expect(homepageSource).toContain(
      "import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';"
    );
    expect(homepageSource).toContain('<HomepageNoScriptContent />');
    expect(homepageSource.indexOf('{children}')).toBeLessThan(
      homepageSource.indexOf('<HomepageNoScriptContent />')
    );
  });

  it('keeps a canonical, user-readable fallback in the HTML document', () => {
    const rawMarkup = renderToStaticMarkup(<HomepageNoScriptContent />);
    const document = new DOMParser().parseFromString(
      `<body>${rawMarkup}</body>`,
      'text/html'
    );
    const fallbackSection = document.querySelector(
      'section.homepage-no-script-content'
    );

    expect(fallbackSection).not.toBeNull();
    expect(rawMarkup).not.toContain('<noscript');
    expect(fallbackSection?.querySelector('h2')?.textContent).toBe(
      'Jovie for artists'
    );
    expect(fallbackSection?.textContent).toContain(
      HOMEPAGE_LAUNCH_COPY.hero.subhead
    );
    expect(fallbackSection?.textContent).toContain(
      HOMEPAGE_LAUNCH_COPY.faq[0].answer
    );
    expect(fallbackSection?.hasAttribute('hidden')).toBe(false);
    expect(fallbackSection?.getAttribute('aria-hidden')).toBeNull();
  });

  it('hides only the progressive fallback for scripting-enabled browsers', () => {
    expect(homepageCss).toMatch(
      /@media\s*\(scripting:\s*enabled\)[\s\S]*?\.homepage-no-script-content\s*\{[\s\S]*?display:\s*none/
    );
    const defaultRule = homepageCss.match(
      /\.homepage-no-script-content\s*\{[\s\S]*?\}/
    )?.[0];
    expect(defaultRule).toBeDefined();
    expect(defaultRule).not.toContain('display: none');
  });

  it('passes the reported 5% ratio while keeping the old result red', () => {
    const rawMarkup = renderToStaticMarkup(<HomepageNoScriptContent />);
    const document = new DOMParser().parseFromString(
      `<body>${rawMarkup}</body>`,
      'text/html'
    );
    const fallbackText = normalizedText(
      document.querySelector('section.homepage-no-script-content')
        ?.textContent ?? ''
    );
    const fallbackBytes = Buffer.byteLength(rawMarkup, 'utf8');

    const oldRatio = contentRatio(
      REPORTED_BODY_BYTES,
      REPORTED_CONTENT_CHARACTERS
    );
    const ratioWithFallback = contentRatio(
      REPORTED_BODY_BYTES + fallbackBytes,
      REPORTED_CONTENT_CHARACTERS + fallbackText.length
    );

    // Deliberate red: removing the fallback returns the observed 2.6% result.
    expect(oldRatio).toBeLessThan(CONTENT_RATIO_TARGET);
    expect(fallbackText.length).toBeGreaterThan(1_800);
    expect(ratioWithFallback).toBeGreaterThanOrEqual(CONTENT_RATIO_TARGET);
  });
});

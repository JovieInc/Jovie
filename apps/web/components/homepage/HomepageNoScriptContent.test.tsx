import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HomepageNoScriptContent } from './HomepageNoScriptContent';

const homepageSource = readFileSync(
  path.resolve(process.cwd(), 'app/(home)/page.tsx'),
  'utf8'
);
const homepageCss = readFileSync(
  path.resolve(process.cwd(), 'app/(home)/home.css'),
  'utf8'
);

function renderFallback() {
  const rawMarkup = renderToStaticMarkup(<HomepageNoScriptContent />);
  const document = new DOMParser().parseFromString(
    `<body>${rawMarkup}</body>`,
    'text/html'
  );
  return {
    rawMarkup,
    section: document.querySelector('section.homepage-no-script-content'),
  };
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

  it('mirrors the nine certified sections in order', () => {
    const { rawMarkup, section } = renderFallback();
    const text = section?.textContent ?? '';

    expect(section).not.toBeNull();
    expect(rawMarkup).not.toContain('<noscript');
    expect(section?.querySelector('h2')?.textContent).toBe(
      HOMEPAGE_LAUNCH_COPY.hero.headline
    );
    expect(section?.hasAttribute('hidden')).toBe(false);
    expect(section?.getAttribute('aria-hidden')).toBeNull();

    const ordered = [
      HOMEPAGE_LAUNCH_COPY.hero.subhead,
      HOMEPAGE_LAUNCH_COPY.certified.proof.statement,
      ...HOMEPAGE_LAUNCH_COPY.certified.sections.flatMap(item => [
        item.headline,
        item.body,
      ]),
      HOMEPAGE_LAUNCH_COPY.certified.close.headline,
      HOMEPAGE_LAUNCH_COPY.certified.close.support,
    ];
    let cursor = -1;
    for (const line of ordered) {
      const index = text.indexOf(line, cursor + 1);
      expect(
        index,
        `fallback is missing or misorders: ${line}`
      ).toBeGreaterThan(cursor);
      cursor = index;
    }

    // The only conversion is the name search; the fallback links it to /start.
    const links = [...(section?.querySelectorAll('a') ?? [])];
    expect(links.map(link => link.textContent)).toEqual([
      HOMEPAGE_LAUNCH_COPY.hero.search.action,
      'Contact support',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('/start');
    expect(text).not.toMatch(/Get started|Drop more music|waitlist/i);
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
});

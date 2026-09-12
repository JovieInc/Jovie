import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/layout.tsx'),
  'utf8'
);

describe('root layout scripts', () => {
  it('keeps global bootstrap scripts outside client-rendered script tags', () => {
    expect(layoutSource).not.toContain("import Script from 'next/script';");
    expect(layoutSource).toContain(
      "<script src='/electron-runtime-init.js' />"
    );
    expect(layoutSource).toContain("<script src='/theme-init.js' />");
    expect(layoutSource).not.toContain('beforeInteractive');
  });

  it('loads GA consent init as a same-origin script instead of CSP-blocked inline code', () => {
    const gaConsentTag = layoutSource.match(
      /<script(?=[^>]*id='ga-consent-init')(?=[^>]*src='\/ga-consent-init\.js')[^>]*\/>/
    )?.[0];

    expect(gaConsentTag).toBeDefined();
    expect(layoutSource).not.toContain('buildGoogleConsentInitScript');
    expect(layoutSource).not.toContain('dangerouslySetInnerHTML');
    expect(layoutSource).not.toContain('buildGoogleAnalyticsConfigScript');
  });

  it('binds generated font variables on html where inherited typography tokens resolve', () => {
    const htmlTag = layoutSource.match(
      /<html\s[\s\S]*?(?=\sdata-auth-mock=)/
    )?.[0];
    expect(htmlTag).toBeDefined();
    expect(htmlTag).toContain(
      'className={`dark ${inter.variable} ${satoshi.variable}`}'
    );
    const bodyClass = layoutSource.match(
      /const bodyClassName\s*=\s*(['"`])([\s\S]*?)\1;/
    )?.[2];
    expect(bodyClass).toBe('font-sans antialiased bg-base text-primary-token');
    expect(layoutSource).toContain('<body className={bodyClassName}>');
    // This guards the root ownership that previously resolved --font-sans
    // against a fallback before body-local variables existed. Actual glyph
    // selection is verified by CDP platform fonts, not this source test.
  });

  it('keeps bundled Inter eligible for late loading and preserves Satoshi display identity', () => {
    const interConfig = layoutSource.match(
      /const inter = localFont\(\{([\s\S]*?)\}\);/
    )?.[1];
    const satoshiConfig = layoutSource.match(
      /const satoshi = localFont\(\{([\s\S]*?)\}\);/
    )?.[1];
    expect(interConfig).toBeDefined();
    expect(satoshiConfig).toBeDefined();
    expect(interConfig).toContain("src: '../public/fonts/Inter-Latin.woff2'");
    expect(interConfig).toContain("variable: '--font-inter'");
    expect(interConfig).toContain("weight: '100 900'");
    expect(interConfig).toContain("display: 'swap'");
    expect(interConfig).not.toContain("display: 'optional'");
    expect(satoshiConfig).toContain(
      "src: '../public/fonts/Satoshi-Latin.woff2'"
    );
    expect(satoshiConfig).toContain("variable: '--font-satoshi'");
    expect(satoshiConfig).toContain("weight: '300 900'");
    expect(satoshiConfig).toContain("display: 'swap'");
  });
});

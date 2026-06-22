import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRedirectsBlock(): string {
  const nextConfigPath = [
    resolve(process.cwd(), 'next.config.js'),
    resolve(process.cwd(), 'apps/web/next.config.js'),
  ].find(existsSync);

  expect(nextConfigPath).toBeDefined();

  const source = readFileSync(nextConfigPath as string, 'utf8');
  const redirectsStart = source.indexOf('async redirects()');

  expect(redirectsStart).toBeGreaterThanOrEqual(0);
  const rewritesStart = source.indexOf('async rewrites()', redirectsStart);
  const redirectsEnd =
    rewritesStart > redirectsStart ? rewritesStart : source.length;
  expect(redirectsEnd).toBeGreaterThan(redirectsStart);

  return source.slice(redirectsStart, redirectsEnd);
}

describe('marketing pricing route redirects', () => {
  it('does not redirect /pricing back to the homepage', () => {
    const redirectsBlock = readRedirectsBlock();

    expect(redirectsBlock).toContain("source: '/sign-up'");
    expect(redirectsBlock).not.toMatch(
      /source:\s*['"`]\/pricing['"`][\s\S]*?destination:\s*['"`]\/['"`]/
    );
  });
});

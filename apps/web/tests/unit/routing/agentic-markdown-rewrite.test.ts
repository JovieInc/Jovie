import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type RouteCondition = {
  readonly type: string;
  readonly key: string;
  readonly value?: string;
};

type RewriteRule = {
  readonly source: string;
  readonly destination: string;
  readonly has?: readonly RouteCondition[];
  readonly missing?: readonly RouteCondition[];
};

async function loadConfig() {
  const nextConfigModule = await import('../../../next.config.js');
  return nextConfigModule.default ?? nextConfigModule;
}

describe('agentic Markdown negotiation routing (JOV-5412)', () => {
  it('routes only root requests with an explicit Markdown Accept range', async () => {
    const nextConfig = await loadConfig();
    const rewrites = await nextConfig.rewrites();
    const beforeFiles = (rewrites.beforeFiles ?? []) as readonly RewriteRule[];
    const rootRewrite = beforeFiles.find(rule => rule.source === '/');

    expect(rootRewrite).toMatchObject({
      source: '/',
      destination: '/jovie-agentic/home?__jovie_agentic_html=1',
      has: [
        {
          type: 'header',
          key: 'accept',
          value:
            '(?:[^,]+,\\s*)*[Tt][Ee][Xx][Tt]/[Mm][Aa][Rr][Kk][Dd][Oo][Ww][Nn](?:\\s*;[^,]*)?(?:\\s*,.*)?',
        },
      ],
      missing: [{ type: 'query', key: '__jovie_agentic_html' }],
    });

    const acceptPattern = rootRewrite?.has?.[0]?.value;
    expect(acceptPattern).toBeDefined();
    const matcher = new RegExp(`^${acceptPattern}$`);
    expect(matcher.test('text/html,application/xhtml+xml')).toBe(false);
    expect(matcher.test('text/markdown;q=0.8, text/html;q=0.9')).toBe(true);
    expect(matcher.test('TEXT/MARKDOWN')).toBe(true);
    expect(matcher.test('text/markdownish')).toBe(false);
  });

  it('advertises Accept as a cache key for the canonical HTML homepage', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'next.config.js'),
      'utf8'
    );
    const rootRuleStart = source.indexOf("source: '/',");
    const rootRule = source.slice(rootRuleStart, rootRuleStart + 220);

    expect(rootRule).toContain("{ key: 'Vary', value: 'Accept' }");
  });
});

import { describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import { GET as getLlmsFull } from '@/app/llms-full.txt/route';

describe('GET /llms.txt', () => {
  it('includes When to use Jovie jobs and developer-resource discovery', async () => {
    const res = getLlmsTxt();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const body = await res.text();
    expect(body).toContain('## When to use Jovie');
    expect(body).toContain('/api/v1/{username}');
    expect(body).toContain('GET https://jov.ie/api/v1');
    expect(body).toContain('https://jov.ie/developers');
    expect(body).toContain('active v1 lifecycle boundary');
    expect(body).toContain(
      '**API versioning and deprecation policy**: https://jov.ie/api-versioning'
    );
    expect(body).toContain('## Jovie developer resources');
    expect(body).toContain('https://jov.ie/llms.txt');
    expect(body).toContain('/openapi.json');
    expect(body).toContain('https://jov.ie/developers');
    expect(body).toContain('https://jov.ie/cli');
    expect(body).toContain('/api/v1/openapi.json');
    expect(body).toContain('/api/mcp/{username}');
    expect(body).toContain('https://docs.jov.ie');
    expect(body).toContain(
      'the public artist API and anonymous MCP tools are read-only'
    );
    expect(body).toContain(
      'owner-only merch and video tools are listed in the manifest and require authenticated ownership'
    );
    expect(body).not.toContain('Instagram: @meetjovie');
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-protected-resource/api/ovie/mcp'
    );
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-authorization-server/api/ovie/oauth'
    );
  });
});

describe('GET /llms-full.txt', () => {
  it('repeats the same when-to-use and developer-resource guidance', async () => {
    const body = await getLlmsFull().text();
    expect(body).toContain('## When to use Jovie');
    expect(body).toContain('## Jovie developer resources');
    expect(body).toContain('/openapi.json');
    expect(body).toContain(
      'owner-only merch and video tools are listed in the manifest and require authenticated ownership'
    );
    expect(body).not.toContain('Instagram: @meetjovie');
    expect(body).not.toContain('**Instagram**: @meetjovie');
    expect(body).not.toContain('$149');
    expect(body).toContain('Artist Visibility Pro ($199/mo)');
    expect(body).toContain('Enterprise (Custom)');
    expect(body).toContain('Planned — not included today');
    expect(body).not.toContain('Max tier');
    expect(body).not.toContain('14-day Pro trial');
  });

  it('separates search crawling, user fetching, and training policy in both files', async () => {
    for (const body of [
      await getLlmsTxt().text(),
      await getLlmsFull().text(),
    ]) {
      expect(body).toContain('## Crawling, fetching, and training');
      expect(body).toContain(
        'These are three separate policies; do not infer one from another.'
      );
      expect(body).toContain('**Search crawling**: https://jov.ie/robots.txt');
      expect(body).toContain('https://jov.ie/sitemap.xml');
      expect(body).toContain('is not blocked by that omission');
      expect(body).toContain('**User-initiated fetching**');
      expect(body).toContain('not required for search ranking');
      expect(body).toContain('**Training**');
      expect(body).toContain('does not publish a training-use policy');
      expect(body).toContain('not a training-policy claim');
    }
  });

  it('keeps the guidance free of private agent surfaces and secrets', async () => {
    for (const body of [
      await getLlmsTxt().text(),
      await getLlmsFull().text(),
    ]) {
      expect(body).not.toMatch(
        /\bSummer\b|\bEve\b|\bgbrain\b|\bsymphony\b|\bhermes\b/i
      );
      expect(body).not.toMatch(/internal MCP|MCP_INTERNAL|api[-_ ]?key[:= ]/i);
      expect(body).not.toMatch(/GITHUB_TOKEN|SUPABASE|ANTHROPIC_API_KEY/i);
    }
  });
});

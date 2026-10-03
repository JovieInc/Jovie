import { describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import { GET as getLlmsFull } from '@/app/llms-full.txt/route';
import { LEGAL_ENTITY_NAME } from '@/constants/app';

describe('public discovery privacy and resource links', () => {
  it.each([
    ['concise', getLlmsTxt],
    ['full', getLlmsFull],
  ] as const)(
    'keeps %s discovery focused on public product identity',
    async (_name, get) => {
      const body = await get().text();
      expect(body).not.toContain(LEGAL_ENTITY_NAME);
      expect(body).not.toMatch(
        /legal entity|\bfounded\b|incorporat|trademark|rebrand.{0,40}\b20\d{2}\b/iu
      );
      expect(body).toContain('jov.ie');
      expect(body).toContain('separate, unrelated company');
      expect(body).toContain('[Help Center](https://docs.jov.ie/docs)');
      expect(body).toContain('[Support](https://jov.ie/support)');
      expect(body).toContain('[Pricing](https://jov.ie/pricing)');
    }
  );
});

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
      '[API versioning and deprecation policy](https://jov.ie/api-versioning)'
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
      'the public profile API and anonymous MCP tools are read-only'
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
    expect(body).toContain(
      'Capability maturity and account access remain separate from a feature being described publicly.'
    );
    expect(body).toContain('Self-hosted Better Auth');
    expect(body).not.toContain('**Authentication**: Clerk');
    expect(body).not.toContain('Max tier');
    expect(body).not.toContain('14-day Pro trial');
  });
});

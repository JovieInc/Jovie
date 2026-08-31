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
  });
});

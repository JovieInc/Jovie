import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
  LEGAL_ENTITY_NAME: 'Jovie Technology Inc.',
}));

const { GET } = await import('./route');

describe('GET /llms.txt', () => {
  it('returns 200 plain text with when-to-use guidance and canonical developer resources', async () => {
    const res = GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('## When to use Jovie');
    expect(body).toContain(
      'Look up a public independent-artist profile (name, bio, DSP and social links) at https://jov.ie/{username}'
    );
    expect(body).toContain('GET https://jov.ie/api/v1/{username}');
    expect(body).toContain('GET https://jov.ie/api/v1');
    expect(body).toContain('https://jov.ie/developers');
    expect(body).toContain('https://jov.ie/cli');
    expect(body).toContain('active v1 lifecycle boundary');
    expect(body).toContain(
      '**API versioning and deprecation policy**: https://jov.ie/api-versioning'
    );
    expect(body).toContain('https://jov.ie/{username}/llms.txt');
    expect(body).toContain('https://jov.ie/{username}/{slug}');
    expect(body).toContain('https://jov.ie/llms.txt');
    expect(body).toContain('https://jov.ie/openapi.json');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain(
      'General public writes or OAuth — the public artist API and anonymous MCP tools are read-only; owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes'
    );
    expect(body).toContain(
      '**Founder-only Ovie control**: https://jov.ie/api/ovie/mcp — OAuth 2.1 MCP with scopes `ovie:read, ovie:write`; not public artist API access'
    );
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-protected-resource/api/ovie/mcp'
    );
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-authorization-server/api/ovie/oauth'
    );
  });

  it('keeps public developer access read-only and does not invent extra surfaces', async () => {
    const body = await GET().text();

    expect(body).toContain(
      'the public artist API and anonymous MCP tools are read-only'
    );
    expect(body).toContain('/api/mcp/{username}');
    expect(body).toContain(
      'owner-only merch and video tools are listed in the manifest and require authenticated ownership'
    );
    expect(body).not.toContain('Instagram: @meetjovie');
    expect(body).toContain('scopes `ovie:read, ovie:write`');
    expect(body).not.toMatch(/public artist API access.*write/i);
    expect(body).not.toMatch(/MCP server for Jovie/i);
  });
});

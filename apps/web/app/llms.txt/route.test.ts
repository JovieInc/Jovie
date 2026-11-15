import { describe, expect, it, vi } from 'vitest';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { auditLlmsTxtStructure } from '@/lib/seo/agent-site-readiness';

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
      'Look up a claimable public profile for work, links, and identity at https://jov.ie/{username}'
    );
    expect(body).toContain('GET https://jov.ie/api/v1/{username}');
    expect(body).toContain('GET https://jov.ie/api/v1');
    expect(body).toContain('https://jov.ie/developers');
    expect(body).toContain('https://jov.ie/cli');
    expect(body).toContain('npm install --global @jovie/cli');
    expect(body).toContain('[Jovie API docs](https://jov.ie/developers)');
    expect(body).toContain(
      '[Jovie OpenAPI 3.1 spec](https://jov.ie/openapi.json)'
    );
    expect(body).toContain('active v1 lifecycle boundary');
    expect(body).toContain(
      '[API versioning and deprecation policy](https://jov.ie/api-versioning)'
    );
    expect(body).toContain('https://jov.ie/{username}/llms.txt');
    expect(body).toContain('https://jov.ie/{username}/{slug}');
    expect(body).toContain('https://jov.ie/llms.txt');
    expect(body).toContain('https://jov.ie/openapi.json');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain(
      'General public writes or OAuth: the public profile API and anonymous per-profile MCP tools are read-only; owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes'
    );
    expect(body).toContain(
      '[Founder-only Ovie control](https://jov.ie/api/ovie/mcp) — OAuth 2.1 MCP with scopes `ovie:read, ovie:write`; not public profile API access'
    );
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-protected-resource/api/ovie/mcp'
    );
    expect(body).toContain(
      'https://jov.ie/.well-known/oauth-authorization-server/api/ovie/oauth'
    );
  });

  it('satisfies the seo:certify llms.txt structure audit (JOV-7259)', async () => {
    const body = await GET().text();
    const failed = auditLlmsTxtStructure(body).filter(
      check => check.status === 'failed'
    );
    expect(failed).toEqual([]);
  });

  it('discovers the anonymous draft connector and checkout handoff under when-to-use guidance', async () => {
    const body = await GET().text();
    const whenToUse = body
      .split('## When to use Jovie')[1]
      ?.split('Do not use Jovie for:')[0];

    expect(whenToUse).toMatch(
      /anonymous agent connector at https:\/\/jov\.ie\/api\/mcp\b/
    );
    expect(whenToUse).toContain('https://jov.ie/developers/agents');
    expect(whenToUse).toMatch(/unpublished.*draft/i);
    expect(whenToUse).toMatch(/start_upgrade.*checkout entry URL/);
    expect(whenToUse).toMatch(/person.*completes.*purchase on Jovie/);
    const connectorResource = body
      .split('\n')
      .find(line => line.startsWith('- [Agent draft connector]('));
    expect(connectorResource).toContain('(https://jov.ie/api/mcp)');
    expect(connectorResource).toMatch(
      new RegExp(`\\b${snapshot.tools.length} tools\\b`)
    );
    for (const tool of snapshot.tools) {
      expect(connectorResource).toContain(tool.name);
    }
  });

  it('scopes read-only access to anonymous per-profile tools and preserves owner-only requirements', async () => {
    const body = await GET().text();

    expect(body).toContain(
      'the public profile API and anonymous per-profile MCP tools are read-only'
    );
    expect(body).toContain('/api/mcp/{username}');
    expect(body).toContain(
      'owner-only merch and video tools are listed in the manifest and require authenticated ownership'
    );
    expect(body).not.toContain('anonymous MCP tools are read-only');
    expect(body).not.toContain('Instagram: @meetjovie');
    expect(body).toContain('scopes `ovie:read, ovie:write`');
    expect(body).not.toMatch(/public profile API access.*write/i);
    expect(body).not.toMatch(/MCP server for Jovie/i);
  });
  it('exposes canonical offer truth and the decision-gated attribution handoff', async () => {
    const body = await GET().text();
    expect(body).toContain('$12/mo');
    expect(body).toContain('Self-serve');
    expect(body).not.toContain('Limited access');
    expect(body).toContain('/api/acquisition/agent-handoff');
    expect(body).toContain('requires human purchase confirmation');
  });
});

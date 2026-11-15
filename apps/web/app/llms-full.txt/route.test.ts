import { describe, expect, it, vi } from 'vitest';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
  LEGAL_ENTITY_NAME: 'Jovie Technology Inc.',
}));

const { GET } = await import('./route');

describe('GET /llms-full.txt', () => {
  it('returns source-backed plain text with current auth and access semantics', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('**Authentication**: Self-hosted Better Auth');
    expect(body).not.toContain('**Authentication**: Clerk');
    expect(body).toContain(
      'Opt-in audience notifications require enrolled access'
    );
    expect(body).toContain(
      'Advanced analytics and audience CRM capabilities require enrolled access'
    );
    expect(body).toContain('**Free ($0)**');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain('## When to use Jovie');
  });

  it('discovers draft writes separately from anonymous profile reads and authenticated owner tools', async () => {
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
    expect(body).toContain(
      'the public profile API and anonymous per-profile MCP tools are read-only'
    );
    expect(body).toContain(
      'owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes'
    );
    expect(body).not.toContain('anonymous MCP tools are read-only');
  });
});

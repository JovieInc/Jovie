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
    expect(body).toContain('https://jov.ie/{username}/llms.txt');
    expect(body).toContain('https://jov.ie/{username}/{slug}');
    expect(body).toContain('https://jov.ie/llms.txt');
    expect(body).toContain('https://jov.ie/openapi.json');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain(
      'Writes, a CLI, or OAuth scopes — public developer access is read-only'
    );
  });

  it('keeps public developer access read-only and does not invent extra surfaces', async () => {
    const body = await GET().text();

    expect(body).toContain('public developer access is read-only');
    expect(body).toContain('/api/mcp/{username}');
    expect(body).not.toMatch(/OAuth scopes for/i);
    expect(body).not.toMatch(/\bwrite capability\b/i);
    expect(body).not.toMatch(/MCP server for Jovie/i);
  });
});

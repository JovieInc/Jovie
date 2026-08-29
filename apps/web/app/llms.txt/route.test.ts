import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /llms.txt', () => {
  it('serves the static guide as plain text', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=86400, s-maxage=86400'
    );
  });

  it('explains the public jobs Jovie is suited for', async () => {
    const body = await GET().text();

    expect(body).toContain('## When to use Jovie');
    expect(body).toContain(
      'An AI agent should use Jovie when helping an independent musician who needs a public profile and release links in one place.'
    );
    expect(body).toContain(
      'Use https://jov.ie/{username} for a public artist profile with music, social links, tour dates, and a bio.'
    );
    expect(body).toContain(
      'Use https://jov.ie/{username}/{slug} for a release smart link that directs fans to the right streaming platform.'
    );
    expect(body).toContain(
      'Make an unauthenticated, read-only GET request to https://jov.ie/api/v1/{username} to retrieve a public artist profile, releases, tour events, and merch as JSON.'
    );
    expect(body).toContain(
      'Use Jovie to collect fan contacts, track engagement, and segment listeners.'
    );
    expect(body).toContain(
      'Use Jovie to manage release tasks and notify fans when new music is released.'
    );
  });

  it('links the canonical machine-readable developer resources', async () => {
    const body = await GET().text();

    expect(body).toContain('## Developer Resources');
    expect(body).toContain('https://jov.ie/llms.txt');
    expect(body).toContain('https://jov.ie/llms-full.txt');
    expect(body).toContain('https://jov.ie/openapi.json');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain('https://jov.ie/api/v1/{username}');
    expect(body).toContain('https://docs.jov.ie/docs/getting-started');
  });

  it('does not advertise unsupported agent capabilities', async () => {
    const body = await GET().text();

    expect(body).not.toMatch(/\b(?:CLI|OAuth|MCP)\b/i);
    expect(body).not.toMatch(/\bwrite capability\b/i);
  });
});

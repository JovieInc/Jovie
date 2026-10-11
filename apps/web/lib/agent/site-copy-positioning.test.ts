import { describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import {
  buildHomepageMarkdown,
  buildNotFoundMarkdown,
} from '@/lib/agent/homepage-markdown';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

const ARTIST_ONLY_FRAMING = [
  /independent-artist/i,
  /Artist Workflows/,
  /Artist release smart links/,
  /public artist API/i,
  /per-artist/i,
  /\bfans?\b/i,
  /\bvisitors?\b/i,
  /what the web says about you/i,
] as const;

function expectCreatorPositioning(body: string): void {
  for (const pattern of ARTIST_ONLY_FRAMING) {
    expect(body).not.toMatch(pattern);
  }
  expect(body).toContain('audience');
  expect(body).not.toMatch(/\bAI\b.*generally available/i);
}

describe('agent-facing site copy positioning (JOV-7638 follow-up)', () => {
  it('keeps /llms.txt on the shared creator identity, with music as one workflow', async () => {
    const body = await getLlmsTxt().text();

    expectCreatorPositioning(body);
    expect(body).toContain(COMPANY_IDENTITY.definition);
    expect(body).toContain('### Public Profile');
    expect(body).toContain('### Music workflows');
    expect(body).toContain(
      'Audience notifications, advanced analytics, and release planning require enrolled access'
    );
    expect(body).toContain(
      'AI-assistant capabilities are in limited testing with enrolled access'
    );
    expect(body).toContain(
      '[Release smart links](https://jov.ie/{username}/{slug})'
    );
    expect(body).toContain('GET https://jov.ie/api/v1/{username}');
    expect(body).toContain('https://jov.ie/api/mcp/{username}');
  });

  it('describes public jobs for a creator profile and keeps the read-only boundary', () => {
    const body = buildSiteLlmsGuidance();

    expectCreatorPositioning(body);
    expect(body).toContain(
      'Look up a claimable public profile for work, links, and identity at https://jov.ie/{username}'
    );
    expect(body).toContain(
      'Route the audience to the correct streaming platform for a specific release via a smart link at https://jov.ie/{username}/{slug}'
    );
    expect(body).toContain(
      '[Public profile API](https://jov.ie/api/v1/{username})'
    );
    expect(body).toContain(
      '[Per-profile MCP](https://jov.ie/api/mcp/{username})'
    );
    expect(body).toContain(
      '[Per-profile llms.txt](https://jov.ie/{username}/llms.txt)'
    );
    expect(body).toContain(
      'the public profile API and anonymous MCP tools are read-only'
    );
  });

  it('projects the approved homepage identity instead of the music launch document', () => {
    const body = buildHomepageMarkdown();

    expectCreatorPositioning(body);
    expect(body.startsWith(`# ${HOMEPAGE_IDENTITY_COPY.hero.headline}`)).toBe(
      true
    );
    expect(body).toContain(HOMEPAGE_IDENTITY_COPY.hero.subhead);
    expect(body).toContain(COMPANY_IDENTITY.definition);
    expect(body).toContain('Your presence, resolved.');
    expect(body).toContain('Make it your Jovie profile.');
    expect(body).not.toContain('All your music');
    expect(body).not.toContain('Connect your music');
  });

  it('names the public profile API on the markdown 404 without artist-only framing', () => {
    const body = buildNotFoundMarkdown();

    expect(body).toContain(
      'Public profile API: https://jov.ie/api/v1/{username}'
    );
    expect(body).not.toMatch(/public artist API/i);
    expect(body).not.toMatch(/\bfans?\b/i);
    expect(body).not.toMatch(/\bvisitors?\b/i);
  });
});

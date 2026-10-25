import { describe, expect, it } from 'vitest';
import {
  AGENT_SKILLS,
  buildAgentSkillsIndex,
  buildAiCatalog,
  buildApiCatalog,
  buildMcpServerCard,
  buildPoppyManifest,
  CONTENT_SIGNAL,
  serializeRobots,
  skillDigest,
} from './discovery';

const ORIGIN = 'https://jov.ie';

describe('agent discovery documents', () => {
  it('skills index digests match the served SKILL.md bytes', () => {
    const index = buildAgentSkillsIndex(ORIGIN);
    expect(index.$schema).toBe(
      'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
    );
    expect(index.skills).toHaveLength(AGENT_SKILLS.length);
    for (const entry of index.skills) {
      const skill = AGENT_SKILLS.find(item => item.name === entry.name);
      expect(skill).toBeDefined();
      expect(entry.digest).toBe(skillDigest(skill!.body));
      expect(entry.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.url).toBe(
        `${ORIGIN}/.well-known/agent-skills/${entry.name}/SKILL.md`
      );
      expect(entry.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every skill body starts with matching frontmatter', () => {
    for (const skill of AGENT_SKILLS) {
      expect(skill.body.startsWith(`---\nname: ${skill.name}\n`)).toBe(true);
    }
  });

  it('api catalog is an RFC 9727 linkset with service-desc and service-doc', () => {
    const { linkset } = buildApiCatalog(ORIGIN);
    expect(linkset.length).toBeGreaterThan(0);
    for (const entry of linkset) {
      expect(entry.anchor).toMatch(/^https:\/\/jov\.ie\//);
      expect(entry['service-desc'][0].href).toMatch(/^https:\/\/jov\.ie\//);
      expect(entry['service-doc'][0].href).toMatch(/^https:\/\/jov\.ie\//);
    }
  });

  it('server card names the live anonymous MCP endpoint and requires no auth', () => {
    const card = buildMcpServerCard(ORIGIN);
    expect(card.serverInfo.name).toBe('jovie-music-identity');
    expect(card.transport.endpoint).toBe(`${ORIGIN}/api/music/mcp`);
    expect(card.authentication.required).toBe(false);
    expect(card.tools.map(tool => tool.name).sort()).toEqual([
      'fetch',
      'resolve',
      'search',
    ]);
  });

  it('ARD entries carry url and never inline data', () => {
    const catalog = buildAiCatalog(ORIGIN);
    expect(catalog.entries.length).toBeGreaterThan(0);
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(/^urn:air:jov\.ie:/);
      expect(entry.url).toMatch(/^https:\/\/jov\.ie\//);
      expect('data' in entry).toBe(false);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('poppy manifest declares the organization and no sessions', () => {
    const manifest = buildPoppyManifest();
    expect(manifest.organization.domain).toBe('jov.ie');
    expect(Object.keys(manifest)).toEqual([
      'protocol_version',
      'organization',
      'web',
    ]);
    expect(manifest.web).toEqual({});
  });
});

describe('serializeRobots', () => {
  const body = serializeRobots({
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/app/', '/api/'] },
      { userAgent: 'GPTBot', allow: ['/', '/llms.txt'], disallow: ['/app/'] },
    ],
    sitemap: 'https://jov.ie/sitemap.xml',
    host: 'https://jov.ie',
  });

  it('keeps Next ordering and puts Content-Signal in every group', () => {
    expect(body).toBe(
      [
        'User-Agent: *',
        'Allow: /',
        'Disallow: /app/',
        'Disallow: /api/',
        `Content-Signal: ${CONTENT_SIGNAL}`,
        '',
        'User-Agent: GPTBot',
        'Allow: /',
        'Allow: /llms.txt',
        'Disallow: /app/',
        `Content-Signal: ${CONTENT_SIGNAL}`,
        '',
        'Host: https://jov.ie',
        'Sitemap: https://jov.ie/sitemap.xml',
        '',
      ].join('\n')
    );
  });

  it('declares all three signals', () => {
    for (const key of ['ai-train', 'search', 'ai-input'])
      expect(CONTENT_SIGNAL).toContain(`${key}=`);
  });
});

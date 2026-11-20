import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/app';
import {
  generateStaticParams,
  GET as getSkill,
} from './agent-skills/[name]/SKILL.md/route';
import { GET as getIndex } from './agent-skills/index.json/route';
import { GET as getAiCatalog } from './ai-catalog.json/route';
import { GET as getApiCatalog } from './api-catalog/route';
import { GET as getMcpCard } from './mcp/server-card.json/route';
import { GET as getPoppy } from './poppy.json/route';

describe('public agent-discovery responses', () => {
  it.each([
    ['skills index', getIndex, 'application/json'],
    ['AI catalog', getAiCatalog, 'application/json'],
    ['API catalog', getApiCatalog, 'application/linkset+json'],
    ['MCP server card', getMcpCard, 'application/json'],
    ['website manifest', getPoppy, 'application/json'],
  ])(
    '%s is anonymous, cacheable JSON with CORS',
    async (_name, get, contentType) => {
      const response = get();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(contentType);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=300, s-maxage=3600'
      );
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(JSON.parse(await response.text())).toBeTypeOf('object');
    }
  );

  it('every indexed skill resolves to exactly the advertised UTF-8 digest', async () => {
    const index = await getIndex().json();
    expect(index.skills.length).toBeGreaterThan(0);
    expect(generateStaticParams()).toEqual(
      index.skills.map((skill: { name: string }) => ({ name: skill.name }))
    );
    for (const skill of index.skills) {
      expect(skill.url).toBe(
        `${BASE_URL}/.well-known/agent-skills/${skill.name}/SKILL.md`
      );
      const response = await getSkill(new Request(skill.url), {
        params: Promise.resolve({ name: skill.name }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      );
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=300, s-maxage=3600'
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(
        skill.digest
      );
      expect(bytes.toString('utf8')).toContain(`name: ${skill.name}\n`);
    }
  });

  it('unknown skill names return an empty 404 rather than a fallback skill', async () => {
    const response = await getSkill(
      new Request(`${BASE_URL}/.well-known/agent-skills/unknown/SKILL.md`),
      {
        params: Promise.resolve({ name: 'unknown' }),
      }
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('catalogs advertise only the existing public API, MCP and skills surfaces', async () => {
    const catalog = await getApiCatalog().json();
    expect(
      catalog.linkset.map((entry: { anchor: string }) => entry.anchor)
    ).toEqual([`${BASE_URL}/api/v1`, `${BASE_URL}/api/music/mcp`]);
    expect(catalog.linkset[0]['service-desc'][0].href).toBe(
      `${BASE_URL}/openapi.json`
    );
    expect(catalog.linkset[0]['service-doc'][0].href).toBe(
      `${BASE_URL}/developers`
    );
    expect(catalog.linkset[0].describedby[0].href).toBe(`${BASE_URL}/llms.txt`);
    const aiCatalog = await getAiCatalog().json();
    expect(
      aiCatalog.entries.map((entry: { url: string }) => entry.url)
    ).toEqual([
      `${BASE_URL}/.well-known/mcp/server-card.json`,
      `${BASE_URL}/openapi.json`,
      `${BASE_URL}/.well-known/agent-skills/index.json`,
    ]);
    const card = await getMcpCard().json();
    expect(card.authentication).toEqual({ required: false });
    expect(card.transport).toEqual({
      type: 'streamable-http',
      endpoint: `${BASE_URL}/api/music/mcp`,
    });
    expect(await getPoppy().json()).toEqual({
      protocol_version: '0.1',
      organization: { name: 'Jovie', domain: 'jov.ie' },
      web: {},
    });
  });
});

/**
 * Contract for the domain write registry (write-registry.json):
 * every domain module exists and exports what it claims, and every agent,
 * chat and MCP tool maps to a registered domain function, a read, a generator
 * or a named debt. Debt only shrinks. Origin: the chat createRelease tool and
 * the release form saved different state (2026-10-26).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ROUTE_TOOL_IDS } from '@/lib/chat/chat-tool-inventory';
import registry from './write-registry.json';

const WEB_ROOT = join(__dirname, '../..');
const read = (path: string, root = WEB_ROOT) =>
  readFileSync(join(root, path), 'utf8');

/** Tools whose commit path still bypasses a domain function. Lower, never raise. */
const DEBT_CEILING = 5;

type Tool = { kind: string; domain?: string; reason?: string };
const tools = registry.agentTools as Record<string, Tool>;

function names(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map(m => m[1]);
}

function liveToolIds(): string[] {
  const route = read('app/api/mcp/[username]/route.ts');
  const start = route.indexOf('function buildToolDescriptors');
  const descriptors = route.slice(start, route.indexOf('\n}\n', start));
  const artist = names(descriptors, /^ {6}name: '([^']+)'/gm);
  const draft = names(
    read('lib/agent-acquisition/api.ts'),
    /^ {4}name: '([^']+)'/gm
  );
  const chatgpt = names(
    read('lib/chatgpt/directory/contract.ts'),
    /^ {4}name: '([^']+)'/gm
  );
  return [
    ...CHAT_ROUTE_TOOL_IDS.map(id => `chat:${id}`),
    ...artist.map(id => `mcp:artist:${id}`),
    ...draft.map(id => `mcp:draft:${id}`),
    ...chatgpt.map(id => `mcp:chatgpt:${id}`),
  ];
}

describe('domain write registry', () => {
  it('lists every domain module with the exports it claims', () => {
    for (const d of registry.domains) {
      const src = read(d.module.replace(/^apps\/web\//, ''));
      for (const name of d.exports) {
        const exported = new RegExp(
          `export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`
        );
        expect(
          exported.test(src),
          `${d.id}: ${d.module} must export ${name}`
        ).toBe(true);
      }
    }
  });

  it('declares core tables that exist in the schema under those SQL names', () => {
    const dir = join(WEB_ROOT, 'lib/db/schema');
    const schema = readdirSync(dir)
      .filter(f => f.endsWith('.ts') && !f.includes('.test.'))
      .map(f => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    for (const [key, sqlName] of Object.entries(registry.coreTables)) {
      const declared = new RegExp(
        `export const ${key} = pgTable\\(\\s*'${sqlName}'`
      );
      expect(declared.test(schema), `${key} -> ${sqlName}`).toBe(true);
    }
  });

  it('maps every live chat and MCP tool to a registered kind, and nothing stale', () => {
    const live = liveToolIds().toSorted();
    expect(Object.keys(tools).toSorted()).toEqual(live);
  });

  it('points every domain tool at a registered domain', () => {
    const ids = new Set(registry.domains.map(d => d.id));
    for (const [tool, t] of Object.entries(tools)) {
      if (t.kind === 'domain') expect(ids.has(t.domain ?? ''), tool).toBe(true);
      expect(['domain', 'read', 'generate', 'debt']).toContain(t.kind);
    }
  });

  it('keeps tool debt named and shrinking', () => {
    const debt = Object.entries(tools).filter(([, t]) => t.kind === 'debt');
    for (const [tool, t] of debt) expect(t.reason, tool).toBeTruthy();
    expect(debt.length).toBeLessThanOrEqual(DEBT_CEILING);
  });
});

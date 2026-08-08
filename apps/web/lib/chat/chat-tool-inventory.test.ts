/**
 * Chat tool inventory drift guard (JOV-3013).
 *
 * Ensures live chat tool ids stay registered in CHAT_ROUTE_TOOL_IDS and that
 * PUBLIC_SKILL_REGISTRY is treated as a productized subset — not the chat
 * tool surface of truth.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_SKILL_REGISTRY, SKILL_REGISTRY } from '@/lib/agents/registry';
import {
  assertChatToolsRegistered,
  CHAT_ROUTE_TOOL_ID_SET,
  CHAT_ROUTE_TOOL_IDS,
} from './chat-tool-inventory';

const REPO_WEB_ROOT = join(__dirname, '../..');

function extractRouteToolKeys(functionName: string): string[] {
  const routePath = join(REPO_WEB_ROOT, 'app/api/chat/route.ts');
  const source = readFileSync(routePath, 'utf8');
  const start = source.indexOf(`function ${functionName}`);
  expect(start, `expected ${functionName} in chat route`).toBeGreaterThan(-1);
  const end = source.indexOf('\nfunction ', start + 1);
  const body = source.slice(start, end === -1 ? undefined : end);
  const keys = body.matchAll(
    /(?:^|\n)\s+([a-zA-Z][a-zA-Z0-9_]*):\s*(?:create[A-Za-z0-9_]*\(|tool\()/g
  );
  return [...new Set([...keys].map(match => match[1]))];
}

function extractAccountToolKeys(): string[] {
  const path = join(REPO_WEB_ROOT, 'lib/chat/account-tools.ts');
  const source = readFileSync(path, 'utf8');
  const keys = source.matchAll(
    /(?:^|\n)\s{4}([a-zA-Z][a-zA-Z0-9_]*):\s*tool\(/g
  );
  return [...new Set([...keys].map(match => match[1]))];
}

describe('CHAT_ROUTE_TOOL_IDS inventory', () => {
  it('has unique ids', () => {
    expect(new Set(CHAT_ROUTE_TOOL_IDS).size).toBe(CHAT_ROUTE_TOOL_IDS.length);
  });

  it('covers free, paid, account, and locked tools wired in the chat route', () => {
    const freeKeys = extractRouteToolKeys('buildFreeChatTools');
    const paidKeys = extractRouteToolKeys('buildChatTools');
    const accountKeys = extractAccountToolKeys();
    // manageTasks is plan-locked via locked-tools (not built in free/paid factories).
    const liveKeys = new Set([
      ...freeKeys,
      ...paidKeys,
      ...accountKeys,
      'manageTasks',
    ]);

    const missing = [...liveKeys].filter(
      name => !CHAT_ROUTE_TOOL_ID_SET.has(name)
    );
    expect(missing, `unregistered live tools: ${missing.join(', ')}`).toEqual(
      []
    );

    // Inventory should not lag far behind live surface size.
    expect(liveKeys.size).toBeGreaterThanOrEqual(25);
    expect(CHAT_ROUTE_TOOL_IDS.length).toBeGreaterThanOrEqual(liveKeys.size);
  });

  it('assertChatToolsRegistered accepts inventory members', () => {
    const tools = Object.fromEntries(
      CHAT_ROUTE_TOOL_IDS.map(id => [id, { ok: true }])
    );
    expect(() => assertChatToolsRegistered(tools)).not.toThrow();
  });

  it('assertChatToolsRegistered fails closed with sorted unregistered tools', () => {
    expect(() =>
      assertChatToolsRegistered(
        {
          zetaTool: {},
          alphaTool: {},
        },
        new Set()
      )
    ).toThrow(
      'Chat tools missing from CHAT_ROUTE_TOOL_IDS: alphaTool, zetaTool.'
    );
  });
});

describe('PUBLIC_SKILL_REGISTRY partial-catalog boundary (JOV-3013)', () => {
  it('exports PUBLIC_SKILL_REGISTRY as the same object as SKILL_REGISTRY', () => {
    expect(PUBLIC_SKILL_REGISTRY).toBe(SKILL_REGISTRY);
  });

  it('is intentionally smaller than the live chat tool inventory', () => {
    const catalogSize = Object.keys(PUBLIC_SKILL_REGISTRY).length;
    expect(catalogSize).toBeGreaterThanOrEqual(1);
    expect(catalogSize).toBeLessThan(CHAT_ROUTE_TOOL_IDS.length);
  });

  it('documents partial-catalog intent in the registry module source', () => {
    const source = readFileSync(
      join(REPO_WEB_ROOT, 'lib/agents/registry.ts'),
      'utf8'
    );
    expect(source).toContain('PUBLIC_SKILL_REGISTRY');
    expect(source).toMatch(/partial catalog/i);
    expect(source).toContain('CHAT_ROUTE_TOOL_IDS');
  });

  it('does not require every chat tool id to exist in the skill catalog', () => {
    const chatOnlyExamples = [
      'proposeProfileEdit',
      'submitFeedback',
      'showAccountStatus',
      'voicePromo',
      'updateMerchCard',
    ] as const;

    for (const id of chatOnlyExamples) {
      expect(CHAT_ROUTE_TOOL_ID_SET.has(id)).toBe(true);
      expect(
        Object.hasOwn(PUBLIC_SKILL_REGISTRY, id),
        `${id} must stay chat-inventory-only unless productized`
      ).toBe(false);
    }
  });
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { extractLastUserText } from '@/lib/chat/message-text';
import { canUseLightModel } from '@/lib/chat/run';

function userMessage(text: string): UIMessage {
  return {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

describe('chat turn latency helpers', () => {
  it('extracts the latest user text once for downstream consumers', () => {
    const messages = [
      userMessage('older request'),
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'done' }],
      } as UIMessage,
      userMessage('change my display name to Aurora'),
    ];

    expect(extractLastUserText(messages)).toBe(
      'change my display name to Aurora'
    );
  });

  it('reuses precomputed last user text for light-model heuristics', () => {
    const messages = [userMessage('change my display name to Aurora')];

    expect(
      canUseLightModel(messages, true, 'change my display name to Aurora')
    ).toBe(true);
  });
});

describe('chat route gate fan-out', () => {
  it('checks kill-switch gates in parallel', async () => {
    const routePath = path.join(process.cwd(), 'app/api/chat/route.ts');
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain('checkGatesForUser(userId, [');
    expect(source).toContain('CHAT_KILL_SWITCH_GATES.DISABLED');
    expect(source).toContain('CHAT_KILL_SWITCH_GATES.FORCE_LIGHT');
    expect(source).not.toMatch(
      /await checkGateForUser\([\s\S]*?await checkGateForUser\(/
    );
  });
});

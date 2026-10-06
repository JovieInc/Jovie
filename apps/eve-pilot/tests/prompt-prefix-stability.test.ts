import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
// Eve's own harness compaction, as patched in patches/eve@0.70.3.patch.
import { compactMessages } from '../node_modules/eve/dist/src/harness/compaction.js';

const big = (seed: number) => ({
  type: 'json' as const,
  value: { data: `${seed}`.padEnd(10_000, 'x') },
});

function exchange(i: number): ModelMessage[] {
  return [
    { role: 'user', content: `question ${i}` },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: `c${i}`,
          toolName: 'web_fetch',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: `c${i}`,
          toolName: 'web_fetch',
          output: big(i),
        },
      ],
    },
    { role: 'assistant', content: `answer ${i}` },
  ];
}

const config = {
  threshold: 30_000,
  recentWindowSize: 10,
  thresholdPercent: 0.5,
};

describe('stable prompt prefix across compactions (summer-config#109)', () => {
  it('re-compacting an already compacted history leaves every earlier message unchanged', async () => {
    const history = Array.from({ length: 14 }, (_, i) => exchange(i)).flat();
    const turnN = await compactMessages(
      history,
      null as never,
      config as never
    );
    // Turn N+1 appends one more exchange and compacts again.
    const turnN1 = await compactMessages(
      [...turnN, ...exchange(14)],
      null as never,
      config as never
    );
    const older = turnN.slice(0, turnN.length - 10);
    expect(older.length).toBeGreaterThan(0);
    expect(turnN1.slice(0, older.length)).toEqual(older);
    // The patch makes the tool-result cap idempotent: a capped result is
    // never re-truncated (which nested escapes and broke prompt caching).
    const capped = older.find(message => message.role === 'tool');
    expect(JSON.stringify(capped)).toContain('[Truncated by eve');
    expect(JSON.stringify(capped)).not.toContain('\\\\"[Truncated by eve');
  });
});

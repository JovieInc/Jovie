import { describe, expect, it } from 'vitest';

import {
  countIn,
  scannable,
  tighten,
  violations,
} from '../../ai-call-guard.mjs';

describe('ai-call-guard', () => {
  it('counts raw generate/stream imports, gateway clients and gateway URLs', () => {
    expect(
      countIn(
        "import { generateText, tool } from 'ai';\nconst u = 'https://ai-gateway.vercel.sh/v1';"
      )
    ).toBe(2);
    expect(countIn("import { createGateway } from '@ai-sdk/gateway';")).toBe(1);
    expect(countIn("import { convertToModelMessages } from 'ai';")).toBe(0);
    expect(countIn("import { generateText } from '@/lib/ai/sdk';")).toBe(0);
  });

  it('skips the shared layer, tests and docs', () => {
    expect(scannable('apps/web/lib/ai/sdk.ts')).toBe(false);
    expect(scannable('apps/web/lib/x.test.ts')).toBe(false);
    expect(scannable('apps/web/lib/x.ts')).toBe(true);
  });

  it('flags growth and a new file, and only shrinks the ratchet', () => {
    expect(violations({ a: 2, b: 1 }, { a: 1 })).toEqual([
      { file: 'a', found: 2, allowed: 1 },
      { file: 'b', found: 1, allowed: 0 },
    ]);
    expect(tighten({ a: 1 }, { a: 3, b: 1 })).toEqual({ a: 1 });
  });
});

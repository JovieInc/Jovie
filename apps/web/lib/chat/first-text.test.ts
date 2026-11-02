import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  where: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: hoisted.where }) }),
  },
}));
vi.mock('@/lib/db/schema/chat', () => ({
  chatTurns: { id: 'id', firstTextAt: 'first_text_at' },
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: hoisted.warn } }));

import { createFirstTextMarker } from './first-text';

const delta = (text: string) =>
  ({ chunk: { type: 'text-delta', text } }) as never;

describe('createFirstTextMarker', () => {
  beforeEach(() => {
    hoisted.where.mockReset().mockResolvedValue(undefined);
    hoisted.warn.mockReset();
  });

  it('stamps once on the first non-empty text delta', () => {
    const onChunk = createFirstTextMarker('turn-1');
    onChunk(delta('Hi'));
    onChunk(delta(' there'));
    expect(hoisted.where).toHaveBeenCalledTimes(1);
  });

  it('ignores empty, whitespace-only and non-text chunks', () => {
    const onChunk = createFirstTextMarker('turn-1');
    onChunk(delta(''));
    onChunk(delta('  \n'));
    onChunk({ chunk: { type: 'reasoning-delta', text: 'thinking' } } as never);
    onChunk({ chunk: { type: 'tool-call' } } as never);
    expect(hoisted.where).not.toHaveBeenCalled();
    onChunk(delta('Hello'));
    expect(hoisted.where).toHaveBeenCalledTimes(1);
  });

  it('swallows DB errors without throwing', async () => {
    hoisted.where.mockRejectedValue(new Error('db down'));
    const onChunk = createFirstTextMarker('turn-1');
    expect(() => onChunk(delta('Hello'))).not.toThrow();
    await vi.waitFor(() => expect(hoisted.warn).toHaveBeenCalledTimes(1));
  });

  it('swallows synchronous DB throws', () => {
    hoisted.where.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const onChunk = createFirstTextMarker('turn-1');
    expect(() => onChunk(delta('Hello'))).not.toThrow();
    expect(hoisted.warn).toHaveBeenCalledTimes(1);
  });
});

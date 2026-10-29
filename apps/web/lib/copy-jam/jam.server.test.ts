import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  transcribe: vi.fn(),
  classify: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: async (k: string) => mocks.store.get(k) ?? null,
    set: async (k: string, v: unknown) => void mocks.store.set(k, v),
    setIfAbsent: async (k: string, v: unknown) =>
      mocks.store.has(k) ? false : (mocks.store.set(k, v), true),
    compareAndSet: async (k: string, _e: unknown, n: unknown) => (
      mocks.store.set(k, n), true
    ),
  }),
}));
vi.mock('./ai.server', () => ({
  transcribeAudio: mocks.transcribe,
  classifyLeftovers: mocks.classify,
}));

import { COPY_ROWS } from './inventory';
import { runJam } from './jam.server';

const [a, b] = [COPY_ROWS[0]!.id, COPY_ROWS[1]!.id];
const spoken = (id: string) => id.replace('-', ' ');

describe('runJam', () => {
  beforeEach(() => {
    mocks.store.clear();
    mocks.transcribe.mockReset();
    mocks.classify.mockReset().mockResolvedValue([]);
  });

  it('transcribes audio, stores the rule-parsed verdicts, and records the jam', async () => {
    mocks.transcribe.mockResolvedValue(
      `${spoken(a)} sucks, too long. ${spoken(b)} great.`
    );
    const r = await runJam({
      audio: new ArrayBuffer(8),
      by: 'tim',
      source: 'ovie-voice',
    });
    expect(r.applied.map(x => [x.copyId, x.verdict, x.via])).toEqual([
      [a, 'sucks', 'rule'],
      [b, 'great', 'rule'],
    ]);
    expect(
      (mocks.store.get(`copy-jam/verdict/${a}`) as { note: string }).note
    ).toBe('too long');
    expect(mocks.store.has(`copy-jam/jam/${r.jamId}`)).toBe(true);
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it('sends only leftovers to the model and applies what it settles', async () => {
    mocks.classify.mockResolvedValue([
      { copyIds: [a], verdict: 'meh', note: 'make it warmer' },
    ]);
    const r = await runJam({
      transcript: `${spoken(a)} hmm that feels cold`,
      by: 'tim',
      source: 'ovie-voice',
    });
    expect(r.applied).toEqual([
      { copyId: a, verdict: 'meh', note: 'make it warmer', via: 'model' },
    ]);
    expect(r.unmatched).toEqual([]);
  });

  it('keeps rule verdicts and reports leftovers when the relay is down', async () => {
    mocks.classify.mockRejectedValue(new Error('down'));
    const r = await runJam({
      transcript: `${spoken(a)} great. ${spoken(b)} hmm`,
      by: 'tim',
      source: 'ovie-voice',
    });
    expect(r.applied.map(x => x.copyId)).toEqual([a]);
    expect(r.unmatched.map(x => x.copyIds)).toEqual([[b]]);
  });
});

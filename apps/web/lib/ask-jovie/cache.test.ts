import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AskJovieAnswer, answerProfileQuestion } from './answer';

const { getMock, setMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ get: getMock, set: setMock }),
}));

import { cacheAskJovieAnswer } from './cache';

const answer = answerProfileQuestion('latest release', {
  username: 'luna',
  displayName: 'Luna Vale',
  releases: [{ id: 'release_1', title: 'Glasshouse', slug: 'glasshouse' }],
});

describe('cacheAskJovieAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(null);
    setMock.mockResolvedValue('OK');
  });

  it('writes normalized answer objects under the source-revision key', async () => {
    const result = await cacheAskJovieAnswer(answer);

    expect(result).toEqual({ answer, cacheStatus: 'miss' });
    expect(getMock).toHaveBeenCalledWith(answer.provenance.cacheKey);
    expect(setMock).toHaveBeenCalledWith(answer.provenance.cacheKey, answer, {
      ex: 3600,
    });

    getMock.mockResolvedValue(answer);
    const hotTraffic = await Promise.all(
      Array.from({ length: 1000 }, () => cacheAskJovieAnswer(answer))
    );
    expect(hotTraffic.every(item => item.cacheStatus === 'hit')).toBe(true);
  });

  it('bypasses unknown answers so raw unanswered questions are never cached', async () => {
    const unknown: AskJovieAnswer = {
      kind: 'unknown',
      intent: 'unknown',
      routing: { ...answer.routing, answerTier: null },
      provenance: {
        sourceRevision: 'ask-jovie-v1-abc12345',
        cacheKey: null,
        entityIds: [],
      },
    };

    await expect(cacheAskJovieAnswer(unknown)).resolves.toEqual({
      answer: unknown,
      cacheStatus: 'bypass',
    });
    expect(getMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskJovieProfileContext } from '@/lib/ask-jovie/answer';

const { limitMock, loadContextMock, cacheAnswerMock, insertMock, valuesMock } =
  vi.hoisted(() => ({
    limitMock: vi.fn(),
    loadContextMock: vi.fn(),
    cacheAnswerMock: vi.fn(),
    insertMock: vi.fn(),
    valuesMock: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ limit: limitMock }),
  generalLimiter: { limit: limitMock },
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/ask-jovie/context', () => ({
  loadAskJovieContext: loadContextMock,
}));
vi.mock('@/lib/ask-jovie/cache', () => ({
  cacheAskJovieAnswer: cacheAnswerMock,
}));
vi.mock('@/lib/db', () => ({ db: { insert: insertMock } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST } from './route';

const context: AskJovieProfileContext = {
  username: 'tim',
  displayName: 'Tim White',
  releases: [
    {
      id: 'release_1',
      title: 'Never Say a Word',
      releaseType: 'single',
      releaseDate: '2026-09-20',
      slug: 'never-say-a-word',
      artworkUrl: 'https://cdn.test/never-say-a-word.jpg',
    },
  ],
  tourDates: [],
  links: [],
};

function questionRequest(question: string) {
  return new NextRequest('https://jov.ie/api/profile/tim/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'question', question }),
  });
}

describe('POST /api/profile/[username]/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue({ success: true });
    loadContextMock.mockResolvedValue({
      context,
      creatorProfileId: 'profile_1',
    });
    cacheAnswerMock.mockImplementation(answer =>
      Promise.resolve({ answer, cacheStatus: 'miss' })
    );
    valuesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: valuesMock });
  });

  it('returns a deterministic canonical card and stores normalized telemetry', async () => {
    const response = await POST(questionRequest('Does Tim have a new song?'), {
      params: Promise.resolve({ username: 'tim' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      answered: true,
      intent: 'latest_release',
      text: "Tim White's latest release is Never Say a Word, released September 20, 2026.",
      card: {
        kind: 'music',
        title: 'Never Say a Word',
        cta: { label: 'Listen', href: '/tim/never-say-a-word' },
      },
      telemetry: {
        classifierTier: 1,
        answerTier: 0,
        modelCalls: 0,
        fullyLoadedCostUsd: 0,
        cacheStatus: 'miss',
      },
    });
    expect(loadContextMock).toHaveBeenCalledWith('tim', {
      releases: true,
      tourDates: false,
      merch: false,
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile_1',
        kind: 'question',
        category: 'latest_release',
        message: 'Asked about latest release',
        context: expect.objectContaining({
          answerable: true,
          entityType: 'music',
          entityId: 'never-say-a-word',
          renderedAction: 'Listen',
        }),
      })
    );
    expect(JSON.stringify(valuesMock.mock.calls[0]?.[0])).not.toContain(
      'Does Tim have a new song?'
    );
  });
});

import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProofBriefError } from './contract';
import { CERTIFIED_PROOF_BRIEF } from './fixture';
import { PROOF_BRIEF_CARD_SIZE } from './image';

const mocks = vi.hoisted(() => ({
  imageResponse: vi.fn(),
  loadShareFonts: vi.fn(async () => ({ satoshi: new ArrayBuffer(8) })),
}));

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse extends Response {
    constructor(
      public element: unknown,
      public options?: { headers?: Record<string, string> }
    ) {
      super(null, options);
      mocks.imageResponse(element, options);
    }
  },
}));

vi.mock('@/lib/share/image-utils', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/share/image-utils')>();
  return { ...mod, loadShareFonts: mocks.loadShareFonts };
});

import { GET as proofBriefGET } from '@/app/api/share/proof-brief/route';

const NOW = new Date('2026-09-30T00:00:00.000Z');

describe('certified proof image route', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  function request(url: string): NextRequest {
    return { nextUrl: new URL(url) } as NextRequest;
  }

  it('rejects malformed and unknown image requests', async () => {
    expect(
      (await proofBriefGET(request('https://jov.ie/api/share/proof-brief')))
        .status
    ).toBe(400);
    const unknown = await proofBriefGET(
      request('https://jov.ie/api/share/proof-brief?brief=pb_missing')
    );
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['', 'text', '1.5', '1x', '-1', '0', '9007199254740992', '1&rev=2'])(
    'rejects a malformed revision %j instead of falling back to a current card',
    async rev => {
      const url = `https://example.test/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}&rev=${rev}`;
      const response = await proofBriefGET(request(url));
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  );

  it('rejects a private or expired brief before loading fonts or creating an image', async () => {
    const resolver = vi.spyOn(
      await import('./resolve'),
      'resolveCertifiedProofBrief'
    );
    const url = 'https://example.test/api/share/proof-brief?brief=synthetic';
    try {
      for (const [snapshot, status] of [
        [{ ...CERTIFIED_PROOF_BRIEF, privacy: 'private' }, 403],
        [{ ...CERTIFIED_PROOF_BRIEF, expiresAt: NOW.toISOString() }, 410],
      ] as const) {
        resolver.mockReturnValueOnce(snapshot);
        mocks.loadShareFonts.mockClear();
        mocks.imageResponse.mockClear();
        const response = await proofBriefGET(request(url));
        expect(response.status).toBe(status);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(mocks.loadShareFonts).not.toHaveBeenCalled();
        expect(mocks.imageResponse).not.toHaveBeenCalled();
      }
    } finally {
      resolver.mockRestore();
    }
  });

  it('renders the fresh pinned card without caching past its certification', async () => {
    const b = CERTIFIED_PROOF_BRIEF;
    const response = await proofBriefGET(
      request(
        `https://jov.ie/api/share/proof-brief?brief=${b.briefId}&rev=${b.revision}`
      )
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...PROOF_BRIEF_CARD_SIZE })
    );
  });

  it('fails closed when fonts or rendering fail', async () => {
    const url = `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}`;
    mocks.loadShareFonts.mockRejectedValueOnce(new Error('font missing'));
    expect((await proofBriefGET(request(url))).status).toBe(500);

    for (const [error, status] of [
      [new ProofBriefError('x', 'privacy-scope'), 403],
      [new ProofBriefError('x', 'stale-brief'), 410],
      [new ProofBriefError('x', 'invalid-brief'), 400],
    ] as const) {
      mocks.imageResponse.mockImplementationOnce(() => {
        throw error;
      });
      expect((await proofBriefGET(request(url))).status).toBe(status);
    }
  });
});

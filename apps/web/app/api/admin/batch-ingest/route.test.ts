import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  detect: vi.fn(),
  context: vi.fn(),
  extraction: vi.fn(),
  existing: vi.fn(),
  create: vi.fn(),
  reingest: vi.fn(),
  social: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
}));
vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({
  detectFullExtractionPlatform: mocks.detect,
  resolveFullExtractionContext: mocks.context,
  fetchFullExtractionProfile: mocks.extraction,
}));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  checkExistingProfile: mocks.existing,
}));
vi.mock('@/lib/ingestion/flows/reingest-flow', () => ({
  handleNewProfileIngest: mocks.create,
  handleReingestProfile: mocks.reingest,
}));
vi.mock('@/lib/ingestion/flows/social-platform-ingest', () => ({
  ingestSocialPlatformUrl: mocks.social,
}));

import { POST } from './route';

const profile = { id: 'profile-fixture', username: 'testartist' };
const url = 'https://linktr.ee/testartist';
const request = (urls = [url]) =>
  new Request('https://example.test/api/admin/batch-ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
  });

describe('batch import outcome truth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: true });
    mocks.detect.mockReturnValue({ isLinktree: true, isLaylo: false });
    mocks.context.mockReturnValue({
      ok: true,
      validatedUrl: url,
      handle: 'testartist',
    });
    mocks.existing.mockResolvedValue({
      finalHandle: 'testartist',
      isReingest: true,
      existing: profile,
    });
    mocks.extraction.mockResolvedValue({
      displayName: 'Test Artist',
      links: [],
    });
  });

  it('preserves a failed reingestion warning instead of counting HTTP 207 as success', async () => {
    const warning =
      'Profile updated but link extraction had issues: failed to save links';
    mocks.reingest.mockResolvedValue(
      NextResponse.json({ ok: false, profile, warning }, { status: 207 })
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      results: [
        {
          status: 'error',
          reason: warning,
          profileId: profile.id,
          username: profile.username,
        },
      ],
      summary: { total: 1, success: 0, skipped: 0, error: 1 },
    });
  });

  it('reports incomplete new profiles even when their producer returns HTTP 200 and ok true', async () => {
    mocks.existing.mockResolvedValue({ finalHandle: 'testartist' });
    const warning =
      'Profile created but link extraction had issues: failed to save links';
    mocks.create.mockResolvedValue(
      NextResponse.json({ ok: true, profile, warning })
    );
    expect(await (await POST(request())).json()).toMatchObject({
      results: [{ status: 'error', reason: warning, profileId: profile.id }],
      summary: { success: 0, error: 1 },
    });
  });

  it('counts mixed complete, partial and conflicting social imports independently', async () => {
    mocks.detect.mockReturnValue({ isLinktree: false, isLaylo: false });
    mocks.social
      .mockResolvedValueOnce(NextResponse.json({ ok: true, profile }))
      .mockResolvedValueOnce(
        NextResponse.json({
          ok: true,
          profile,
          warning: 'Profile exists but failed to add link',
        })
      )
      .mockResolvedValueOnce(
        NextResponse.json({ error: 'Profile already exists.' }, { status: 409 })
      );
    const response = await POST(
      request([
        'https://instagram.com/one',
        'https://instagram.com/two',
        'https://instagram.com/three',
      ])
    );
    const body = await response.json();
    expect(
      body.results.map((entry: { status: string }) => entry.status)
    ).toEqual(['success', 'error', 'skipped']);
    expect(body.summary).toEqual({
      total: 3,
      success: 1,
      skipped: 1,
      error: 1,
    });
  });

  it('rejects a successful HTTP response without a profile receipt', async () => {
    mocks.reingest.mockResolvedValue(NextResponse.json({ ok: true }));
    expect(await (await POST(request())).json()).toMatchObject({
      results: [
        {
          status: 'error',
          reason: 'Ingestion did not return a profile receipt.',
        },
      ],
      summary: { success: 0, error: 1 },
    });
  });

  it.each([
    { status: 207, payload: { ok: true, profile } },
    { status: 200, payload: { ok: false, profile } },
    { status: 200, payload: { profile } },
  ])(
    'does not infer completion from HTTP $status alone',
    async ({ status, payload }) => {
      mocks.reingest.mockResolvedValue(NextResponse.json(payload, { status }));
      expect(await (await POST(request())).json()).toMatchObject({
        results: [
          { status: 'error', reason: 'Profile ingestion did not complete.' },
        ],
        summary: { success: 0, error: 1 },
      });
    }
  );

  it('retains the normalized username for a complete import', async () => {
    mocks.reingest.mockResolvedValue(
      NextResponse.json({
        ok: true,
        profile: { id: profile.id, usernameNormalized: 'testartist' },
      })
    );
    expect(await (await POST(request())).json()).toMatchObject({
      results: [
        { status: 'success', profileId: profile.id, username: 'testartist' },
      ],
      summary: { success: 1, error: 0 },
    });
  });

  it('does not import for a caller without operator authority', async () => {
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: false });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.reingest).not.toHaveBeenCalled();
    expect(mocks.social).not.toHaveBeenCalled();
  });
});

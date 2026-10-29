import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  certifyProfile: vi.fn(),
  certifyEntry: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({ verifyCronRequest: mocks.verify }));
vi.mock('@/lib/waitlist/profile-certification-runner.server', () => ({
  certifyProfile: mocks.certifyProfile,
  certifyWaitlistEntry: mocks.certifyEntry,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

import { POST } from './route';

const ENTRY = '11111111-2222-4333-8444-555555555555';
const PROFILE = '66666666-7777-4888-8999-aaaaaaaaaaaa';

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/waitlist/profile-certification', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/internal/waitlist/profile-certification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue(null);
  });

  it('rejects callers without the cron secret', async () => {
    mocks.verify.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await post({ entryId: ENTRY });
    expect(response.status).toBe(401);
    expect(mocks.certifyEntry).not.toHaveBeenCalled();
  });

  it('requires exactly one of entryId or profileId', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ entryId: ENTRY, profileId: PROFILE })).status).toBe(
      400
    );
  });

  it('certifies a waitlist entry and attaches walk evidence', async () => {
    const evidence = {
      videoUrl: 'https://example.com/walk.webm',
      screenshots: [
        { step: 'invite', url: 'https://example.com/1.png', verdict: 'pass' },
      ],
    };
    mocks.certifyEntry.mockResolvedValue({
      outcome: 'certified',
      receipt: { status: 'passed' },
    });
    const response = await post({ entryId: ENTRY, evidence });
    expect(response.status).toBe(200);
    expect(mocks.certifyEntry).toHaveBeenCalledWith({
      entryId: ENTRY,
      trigger: 'manual',
      remediate: undefined,
      evidence,
    });
  });

  it('reports an entry without a profile', async () => {
    mocks.certifyEntry.mockResolvedValue({ outcome: 'no_profile' });
    const response = await post({ entryId: ENTRY });
    expect(await response.json()).toEqual({ ok: true, outcome: 'no_profile' });
  });

  it('certifies a profile id and 404s an unknown one', async () => {
    mocks.certifyProfile.mockResolvedValueOnce({ status: 'failed' });
    expect((await post({ profileId: PROFILE })).status).toBe(200);
    mocks.certifyProfile.mockResolvedValueOnce(null);
    expect((await post({ profileId: PROFILE })).status).toBe(404);
  });

  it('returns 503 and reports when certification throws', async () => {
    mocks.certifyEntry.mockRejectedValue(new Error('ledger down'));
    expect((await post({ entryId: ENTRY })).status).toBe(503);
    expect(mocks.capture).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSwitchActiveProfile, mockCaptureError, mockParseJsonBody } =
  vi.hoisted(() => ({
    mockSwitchActiveProfile: vi.fn(),
    mockCaptureError: vi.fn(),
    mockParseJsonBody: vi.fn(),
  }));

vi.mock('@/app/app/(shell)/dashboard/actions/switch-profile', () => ({
  switchActiveProfile: mockSwitchActiveProfile,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

import { POST } from '@/app/api/dashboard/profile/switch/route';

describe('POST /api/dashboard/profile/switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when profileId is missing', async () => {
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: {},
    });

    const response = await POST(
      new Request('http://localhost/api/dashboard/profile/switch', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Profile ID is required',
    });
    expect(mockSwitchActiveProfile).not.toHaveBeenCalled();
  });

  it('returns action result on success', async () => {
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { profileId: '11111111-1111-4111-8111-111111111111' },
    });
    mockSwitchActiveProfile.mockResolvedValue({ success: true });

    const response = await POST(
      new Request('http://localhost/api/dashboard/profile/switch', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockSwitchActiveProfile).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('maps Unauthorized to 401', async () => {
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { profileId: '11111111-1111-4111-8111-111111111111' },
    });
    mockSwitchActiveProfile.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
    });

    const response = await POST(
      new Request('http://localhost/api/dashboard/profile/switch', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('returns 500 and captures unexpected errors', async () => {
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { profileId: '11111111-1111-4111-8111-111111111111' },
    });
    mockSwitchActiveProfile.mockRejectedValue(new Error('boom'));

    const response = await POST(
      new Request('http://localhost/api/dashboard/profile/switch', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Something went wrong',
    });
    expect(mockCaptureError).toHaveBeenCalled();
  });
});

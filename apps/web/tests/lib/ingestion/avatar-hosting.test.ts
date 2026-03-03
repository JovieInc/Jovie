import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureWarningMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock('@/lib/env-server', () => ({
  env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: (...args: unknown[]) => captureWarningMock(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) },
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

vi.mock('@/lib/ingestion/magic-profile-avatar', () => ({
  maybeCopyIngestionAvatarFromLinks: vi.fn().mockResolvedValue(null),
}));

import { copyAvatarToBlob } from '@/lib/ingestion/flows/avatar-hosting';

describe('avatar-hosting copyAvatarToBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles missing content-type header without toLowerCase crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['avatar-bytes']), { status: 200 })
      )
    );

    const result = await copyAvatarToBlob(
      'https://example.com/avatar.png',
      'artist'
    );

    expect(result).toBeNull();
    expect(captureWarningMock).toHaveBeenCalledOnce();
    const capturedError = captureWarningMock.mock.calls[0]?.[1];
    expect(capturedError).toBeInstanceOf(TypeError);
    expect((capturedError as TypeError).message).toBe(
      'Unsupported content type: '
    );
  });
});

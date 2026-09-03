import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  BLOB_READ_WRITE_TOKEN: undefined as string | undefined,
  BLOB_STORE_ID: undefined as string | undefined,
}));

vi.mock('@/lib/env-server', () => ({ env: mockEnv }));

describe('blob-config', () => {
  beforeEach(() => {
    mockEnv.BLOB_READ_WRITE_TOKEN = undefined;
    mockEnv.BLOB_STORE_ID = undefined;
  });

  it('omits the token option when Vercel Blob uses OIDC', async () => {
    mockEnv.BLOB_STORE_ID = 'store_123';

    const { getBlobCommandOptions, isBlobStorageConfigured } = await import(
      './blob-config'
    );

    expect(isBlobStorageConfigured()).toBe(true);
    expect(getBlobCommandOptions()).toEqual({});
  });

  it('includes the static token option when one is configured', async () => {
    mockEnv.BLOB_READ_WRITE_TOKEN = '  token_123  ';

    const { getBlobCommandOptions, isBlobStorageConfigured } = await import(
      './blob-config'
    );

    expect(isBlobStorageConfigured()).toBe(true);
    expect(getBlobCommandOptions()).toEqual({ token: 'token_123' });
  });
});

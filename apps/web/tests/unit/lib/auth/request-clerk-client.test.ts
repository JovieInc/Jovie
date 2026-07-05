import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClerkClient, mockCreateClerkClient, headersMock } = vi.hoisted(
  () => ({
    mockClerkClient: vi.fn(),
    mockCreateClerkClient: vi.fn(),
    headersMock: vi.fn(),
  })
);

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: mockCreateClerkClient,
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

const ORIGINAL_ENV = {
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  clerkPublishableKeyStaging: process.env.CLERK_PUBLISHABLE_KEY_STAGING,
  clerkSecretKeyStaging: process.env.CLERK_SECRET_KEY_STAGING,
};

function restoreEnv() {
  for (const [key, value] of [
    ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', ORIGINAL_ENV.clerkPublishableKey],
    ['CLERK_SECRET_KEY', ORIGINAL_ENV.clerkSecretKey],
    ['CLERK_PUBLISHABLE_KEY_STAGING', ORIGINAL_ENV.clerkPublishableKeyStaging],
    ['CLERK_SECRET_KEY_STAGING', ORIGINAL_ENV.clerkSecretKeyStaging],
  ] as const) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('request Clerk client resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    headersMock.mockReset();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_production';
    process.env.CLERK_SECRET_KEY = 'sk_live_production';
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    delete process.env.CLERK_SECRET_KEY_STAGING;
    mockClerkClient.mockResolvedValue({ source: 'next' });
    mockCreateClerkClient.mockReturnValue({ source: 'backend' });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses backend Clerk client with production keys for production hosts', async () => {
    const { getRequestClerkClient } = await import(
      '@/lib/auth/request-clerk-client'
    );
    const request = new Request('https://jov.ie/api/mobile/v1/me');

    await expect(getRequestClerkClient(request)).resolves.toEqual({
      source: 'backend',
    });
    expect(mockCreateClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_live_production',
      secretKey: 'sk_live_production',
    });
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('uses explicit staging Clerk keys for staging hosts', async () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging';

    const { getRequestClerkClient } = await import(
      '@/lib/auth/request-clerk-client'
    );
    const request = new Request('https://jov.ie/api/mobile/v1/me', {
      headers: {
        'x-forwarded-host': 'staging.jov.ie',
      },
    });

    await expect(getRequestClerkClient(request)).resolves.toEqual({
      source: 'backend',
    });
    expect(mockCreateClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_live_staging',
      secretKey: 'sk_live_staging',
    });
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('uses explicit staging Clerk keys for server actions on staging hosts', async () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging';
    process.env.CLERK_SECRET_KEY_STAGING = 'sk_live_staging';
    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
      })
    );

    const { getServerClerkClient } = await import(
      '@/lib/auth/request-clerk-client'
    );

    await expect(getServerClerkClient()).resolves.toEqual({
      source: 'backend',
    });
    expect(mockCreateClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_live_staging',
      secretKey: 'sk_live_staging',
    });
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('returns null for staging hosts when the staging secret is unavailable', async () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging';
    headersMock.mockResolvedValue(
      new Headers({
        host: 'staging.jov.ie',
      })
    );

    const { getServerClerkClient } = await import(
      '@/lib/auth/request-clerk-client'
    );

    await expect(getServerClerkClient()).resolves.toBeNull();
    expect(mockCreateClerkClient).not.toHaveBeenCalled();
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('fails closed when staging host lacks a staging secret', async () => {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = 'pk_live_staging';

    const { getRequestClerkClient } = await import(
      '@/lib/auth/request-clerk-client'
    );
    const request = new Request('https://staging.jov.ie/api/mobile/v1/me');

    await expect(getRequestClerkClient(request)).rejects.toThrow(
      'Staging Clerk secret unavailable: staging_missing'
    );
    expect(mockCreateClerkClient).not.toHaveBeenCalled();
    expect(mockClerkClient).not.toHaveBeenCalled();
  });
});

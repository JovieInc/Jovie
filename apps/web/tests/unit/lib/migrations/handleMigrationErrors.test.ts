import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWarn } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  logger: {
    warn: mockWarn,
  },
}));

describe('handleMigrationErrors', () => {
  beforeEach(() => {
    mockWarn.mockClear();
  });

  it('returns fallback for creator_profiles migration errors', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      { code: '42P01', message: 'relation "creator_profiles" does not exist' },
      { userId: 'user_123', operation: 'creator_profiles' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: [] });
    expect(mockWarn).toHaveBeenCalledWith(
      '[Dashboard] creator_profiles schema migration in progress; treating as needs onboarding',
      { userId: 'user_123', operation: 'creator_profiles' }
    );
  });

  it('returns fallback when creator_profiles columns are missing', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      {
        message:
          'column "profile_name" of relation "creator_profiles" does not exist',
      },
      { userId: 'user_123', operation: 'creator_profiles' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: [] });
  });

  it('returns fallback for user_settings migration errors', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      { code: '42P02', message: 'parameter missing' },
      { userId: 'user_123', operation: 'user_settings' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: undefined });
    expect(mockWarn).toHaveBeenCalledWith(
      '[Dashboard] user_settings migration in progress',
      { userId: 'user_123', operation: 'user_settings' }
    );
  });

  it('returns fallback for social_links migration errors', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      { code: '42703', message: 'missing column' },
      { userId: 'user_123', operation: 'social_links_count' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: false });
    expect(mockWarn).toHaveBeenCalledWith(
      '[Dashboard] social_links migration in progress',
      { userId: 'user_123', operation: 'social_links_count' }
    );
  });

  it('returns fallback when social_links columns are missing', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      {
        message: 'column "state" of relation "social_links" does not exist',
      },
      { userId: 'user_123', operation: 'social_links_count' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: false });
    expect(mockWarn).toHaveBeenCalledWith(
      '[Dashboard] social_links.state column missing; treating as no links',
      { userId: 'user_123', operation: 'social_links_count' }
    );
  });

  it('returns fallback when music links columns are missing', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(
      {
        message: 'column "state" of relation "social_links" does not exist',
      },
      { userId: 'user_123', operation: 'music_links_count' }
    );

    expect(result).toEqual({ shouldRetry: false, fallbackData: false });
    expect(mockWarn).toHaveBeenCalledWith(
      '[Dashboard] social_links.state column missing; treating as no music links',
      { userId: 'user_123', operation: 'music_links_count' }
    );
  });

  it('returns retry for non-migration errors', async () => {
    const { handleMigrationErrors } = await import(
      '@/lib/migrations/handleMigrationErrors'
    );

    const result = handleMigrationErrors(new Error('Boom'), {
      userId: 'user_123',
      operation: 'creator_profiles',
    });

    expect(result).toEqual({ shouldRetry: true, error: 'Boom' });
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

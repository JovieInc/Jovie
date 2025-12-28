import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockCookiesGet = vi.hoisted(() => vi.fn());
const mockCookiesSet = vi.hoisted(() => vi.fn());
const mockCookiesDelete = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: mockCookiesGet,
      set: mockCookiesSet,
      delete: mockCookiesDelete,
    })
  ),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
  adminAuditLog: {},
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

describe('Admin Impersonation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset environment
    process.env = { ...originalEnv };
    process.env.URL_ENCRYPTION_KEY = 'test-secret-key-for-impersonation';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('isImpersonationEnabled', () => {
    it('returns false when no secret is configured', async () => {
      delete process.env.IMPERSONATION_SECRET;
      delete process.env.URL_ENCRYPTION_KEY;

      const { isImpersonationEnabled } = await import(
        '@/lib/admin/impersonation'
      );
      expect(isImpersonationEnabled()).toBe(false);
    });

    it('returns true when URL_ENCRYPTION_KEY is set (non-production)', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      // NODE_ENV defaults to 'test' in vitest

      const { isImpersonationEnabled } = await import(
        '@/lib/admin/impersonation'
      );
      // In test/dev environment, returns true when key is set
      expect(isImpersonationEnabled()).toBe(true);
    });

    it('returns false in production without ENABLE_IMPERSONATION flag', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      // Use a flag to simulate production mode
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.ENABLE_IMPERSONATION;

      const { isImpersonationEnabled } = await import(
        '@/lib/admin/impersonation'
      );
      expect(isImpersonationEnabled()).toBe(false);

      vi.unstubAllEnvs();
    });

    it('returns true in production with ENABLE_IMPERSONATION=true', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      vi.stubEnv('NODE_ENV', 'production');
      process.env.ENABLE_IMPERSONATION = 'true';

      const { isImpersonationEnabled } = await import(
        '@/lib/admin/impersonation'
      );
      expect(isImpersonationEnabled()).toBe(true);

      vi.unstubAllEnvs();
    });
  });

  describe('startImpersonation', () => {
    it('returns error when impersonation is disabled', async () => {
      delete process.env.IMPERSONATION_SECRET;
      delete process.env.URL_ENCRYPTION_KEY;

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Impersonation is disabled');
    });

    it('returns error when requester is not an admin', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(false);

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation('not-admin', 'target-clerk-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authorized - admin access required');
    });

    it('returns error when admin user not found in database', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([]);

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin user not found in database');
    });

    it('returns error when target user not found', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'admin-db-id' }]) // Admin found
        .mockResolvedValueOnce([]); // Target not found

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Target user not found');
    });

    it('returns error when trying to impersonate deleted user', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'admin-db-id' }]) // Admin found
        .mockResolvedValueOnce([{ id: 'target-db-id', deletedAt: new Date() }]); // Target deleted

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot impersonate deleted or banned user');
    });

    it('returns error when trying to impersonate banned user', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'admin-db-id' }])
        .mockResolvedValueOnce([{ id: 'target-db-id', status: 'banned' }]);

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot impersonate deleted or banned user');
    });

    it('returns error when trying to self-impersonate', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'admin-db-id' }])
        .mockResolvedValueOnce([{ id: 'admin-db-id', status: 'active' }]);

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation('same-clerk-id', 'same-clerk-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot impersonate yourself');
    });

    it('successfully starts impersonation session', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockIsAdmin.mockResolvedValue(true);

      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'admin-db-id' }])
        .mockResolvedValueOnce([
          { id: 'target-db-id', status: 'active', deletedAt: null },
        ]);

      mockDbSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      // Mock audit log insert
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({ values: mockValues });

      const { startImpersonation } = await import('@/lib/admin/impersonation');
      const result = await startImpersonation(
        'admin-clerk-id',
        'target-clerk-id',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(result.success).toBe(true);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'jovie_impersonate',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      );
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('endImpersonation', () => {
    it('clears the impersonation cookie', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockCookiesGet.mockReturnValue(undefined);

      const { endImpersonation } = await import('@/lib/admin/impersonation');
      const result = await endImpersonation();

      expect(result.success).toBe(true);
      expect(mockCookiesDelete).toHaveBeenCalledWith('jovie_impersonate');
    });
  });

  describe('getImpersonationState', () => {
    it('returns null when impersonation is disabled', async () => {
      delete process.env.IMPERSONATION_SECRET;
      delete process.env.URL_ENCRYPTION_KEY;

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
    });

    it('returns null when no cookie is present', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockCookiesGet.mockReturnValue(undefined);

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
    });

    it('returns null and clears cookie for invalid token format', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockCookiesGet.mockReturnValue({ value: 'invalid-token-format' });

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
      expect(mockCookiesDelete).toHaveBeenCalledWith('jovie_impersonate');
    });
  });

  describe('isImpersonating', () => {
    it('returns false when not impersonating', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';
      mockCookiesGet.mockReturnValue(undefined);

      const { isImpersonating } = await import('@/lib/admin/impersonation');
      const result = await isImpersonating();

      expect(result).toBe(false);
    });
  });

  describe('Security', () => {
    it('validates token signature correctly', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';

      // Create a token with tampered signature
      const tamperedToken =
        'admin-clerk:admin-db:target-clerk:target-db:1234567890:1234567890:tampered-signature';
      mockCookiesGet.mockReturnValue({ value: tamperedToken });

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
      expect(mockCookiesDelete).toHaveBeenCalledWith('jovie_impersonate');
    });

    it('rejects expired tokens', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';

      // Create a token with expired timestamp
      const expiredTime = Date.now() - 20 * 60 * 1000; // 20 minutes ago
      const expiredToken = `admin-clerk:admin-db:target-clerk:target-db:${expiredTime}:${expiredTime}:fake-signature`;
      mockCookiesGet.mockReturnValue({ value: expiredToken });

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
      expect(mockCookiesDelete).toHaveBeenCalledWith('jovie_impersonate');
    });

    it('rejects future-dated tokens (clock skew protection)', async () => {
      process.env.URL_ENCRYPTION_KEY = 'test-key';

      // Create a token with future timestamp (beyond allowed clock skew)
      const futureTime = Date.now() + 60 * 1000; // 1 minute in future
      const futureToken = `admin-clerk:admin-db:target-clerk:target-db:${futureTime}:${futureTime + 15 * 60 * 1000}:fake-signature`;
      mockCookiesGet.mockReturnValue({ value: futureToken });

      const { getImpersonationState } = await import(
        '@/lib/admin/impersonation'
      );
      const result = await getImpersonationState();

      expect(result).toBeNull();
      expect(mockCookiesDelete).toHaveBeenCalledWith('jovie_impersonate');
    });
  });

  describe('ImpersonationError', () => {
    it('creates error with correct name', async () => {
      const { ImpersonationError } = await import('@/lib/admin/impersonation');
      const error = new ImpersonationError('Test error');

      expect(error.name).toBe('ImpersonationError');
      expect(error.message).toBe('Test error');
    });
  });
});

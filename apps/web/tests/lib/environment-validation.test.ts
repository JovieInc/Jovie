import { describe, expect, it, vi } from 'vitest';
import {
  validateAndLogEnvironment,
  validateEnvironment,
} from '@/lib/env-server';
import {
  validateDatabaseEnvironment,
  validateEnvironmentForApiRoute,
  validateEnvironmentForMiddleware,
} from '@/lib/startup/environment-validator';

describe('Environment Validation', () => {
  describe('validateEnvironment', () => {
    it('should validate environment variables for runtime context', () => {
      const result = validateEnvironment('runtime');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('critical');
    });

    it('should validate environment variables for build context', () => {
      const result = validateEnvironment('build');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('critical');
    });

    it('should have different validation for runtime vs build context', () => {
      const runtimeResult = validateEnvironment('runtime');
      const buildResult = validateEnvironment('build');

      // Build context should be more lenient (fewer critical errors)
      expect(buildResult.critical.length).toBeLessThanOrEqual(
        runtimeResult.critical.length
      );
    });

    it('flags missing AI_GATEWAY_API_KEY as critical in preview', () => {
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
      process.env.VERCEL_ENV = 'preview';
      delete process.env.AI_GATEWAY_API_KEY;

      try {
        const result = validateEnvironment('runtime');

        expect(
          result.critical.some(message =>
            message.includes('AI_GATEWAY_API_KEY is required')
          )
        ).toBe(true);
      } finally {
        if (originalVercelEnv) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }

        if (originalGatewayKey) {
          process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
        } else {
          delete process.env.AI_GATEWAY_API_KEY;
        }
      }
    });

    it('passes AI gateway validation when AI_GATEWAY_API_KEY is set in preview', () => {
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
      process.env.VERCEL_ENV = 'preview';
      process.env.AI_GATEWAY_API_KEY = 'test-ai-gateway-key';

      try {
        const result = validateEnvironment('runtime');

        expect(
          result.critical.some(message =>
            message.includes('AI_GATEWAY_API_KEY is required')
          )
        ).toBe(false);
      } finally {
        if (originalVercelEnv) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }

        if (originalGatewayKey) {
          process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
        } else {
          delete process.env.AI_GATEWAY_API_KEY;
        }
      }
    });
  });

  describe('validateAndLogEnvironment', () => {
    it('should run validation and return results', () => {
      // Mock console to avoid spam in tests
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        const result = validateAndLogEnvironment('runtime');

        expect(result).toHaveProperty('valid');
        expect(consoleSpy).toHaveBeenCalled();
      } finally {
        consoleSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('validateDatabaseEnvironment', () => {
    it('should fail when DATABASE_URL is not set', () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const result = validateDatabaseEnvironment();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('DATABASE_URL is not set');
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        }
      }
    });

    it('should validate correct PostgreSQL URLs', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/mydb';

      try {
        const result = validateDatabaseEnvironment();

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('should reject invalid database URLs', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'not-a-valid-url';

      try {
        const result = validateDatabaseEnvironment();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('should reject URLs with invalid protocols', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/mydb';

      try {
        const result = validateDatabaseEnvironment();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid database protocol');
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('should require database name in URL', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/';

      try {
        const result = validateDatabaseEnvironment();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Database name is missing');
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });
  });

  describe('validateEnvironmentForApiRoute', () => {
    it('should validate required environment variables for API routes', () => {
      const result = validateEnvironmentForApiRoute(['NODE_ENV']);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should detect missing required variables', () => {
      const result = validateEnvironmentForApiRoute([
        'NONEXISTENT_VAR',
        'ANOTHER_MISSING_VAR',
      ]);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('NONEXISTENT_VAR');
      expect(result.missing).toContain('ANOTHER_MISSING_VAR');
    });

    it('should return empty missing array when all variables are present', () => {
      const originalVar = process.env.TEST_VAR;
      process.env.TEST_VAR = 'test-value';

      try {
        const result = validateEnvironmentForApiRoute(['TEST_VAR']);

        expect(result.valid).toBe(true);
        expect(result.missing).toHaveLength(0);
      } finally {
        if (originalVar) {
          process.env.TEST_VAR = originalVar;
        } else {
          delete process.env.TEST_VAR;
        }
      }
    });
  });

  describe('validateEnvironmentForMiddleware', () => {
    it('should validate basic middleware requirements', () => {
      const result = validateEnvironmentForMiddleware();

      expect(typeof result).toBe('boolean');
    });

    it('should return true when Clerk key is present', () => {
      const originalKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_something';

      try {
        const result = validateEnvironmentForMiddleware();

        expect(result).toBe(true);
      } finally {
        if (originalKey) {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalKey;
        } else {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        }
      }
    });

    it('should return false when Clerk key is missing', () => {
      const originalKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        const result = validateEnvironmentForMiddleware();

        expect(result).toBe(false);
      } finally {
        if (originalKey) {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalKey;
        }
      }
    });
  });
});

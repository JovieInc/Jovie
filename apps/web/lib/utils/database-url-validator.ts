/**
 * Shared database URL validation utilities
 * Centralizes PostgreSQL connection string validation logic
 */

export interface DatabaseUrlValidationResult {
  valid: boolean;
  error?: string;
  protocol?: string;
  hostname?: string;
  pathname?: string;
}

/**
 * Valid PostgreSQL protocols
 */
export const VALID_DATABASE_PROTOCOLS = [
  'postgres:',
  'postgresql:',
  'postgres+tcp:',
  'postgresql+tcp:',
] as const;

/**
 * Validates a PostgreSQL database URL format
 * @param url - The database URL to validate
 * @returns Validation result with details
 */
export function validateDatabaseUrl(url: string): DatabaseUrlValidationResult {
  if (!url) {
    return { valid: false, error: 'DATABASE_URL is not set' };
  }

  let result: DatabaseUrlValidationResult;

  try {
    const parsed = new URL(url);
    const isProtocolValid = VALID_DATABASE_PROTOCOLS.includes(
      parsed.protocol as (typeof VALID_DATABASE_PROTOCOLS)[number]
    );

    // Validate protocol
    if (!isProtocolValid) {
      result = {
        valid: false,
        error: `Invalid database protocol: ${parsed.protocol}. Expected one of: ${VALID_DATABASE_PROTOCOLS.join(', ')}`,
        protocol: parsed.protocol,
      };
    } else if (!parsed.hostname) {
      // Validate hostname
      result = {
        valid: false,
        error: 'Database hostname is missing',
        protocol: parsed.protocol,
      };
    } else if (!parsed.pathname || parsed.pathname === '/') {
      // Validate database name (pathname should exist and not be just '/')
      result = {
        valid: false,
        error: 'Database name is missing from URL path',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        pathname: parsed.pathname,
      };
    } else {
      result = {
        valid: true,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        pathname: parsed.pathname,
      };
    }
  } catch (error) {
    result = {
      valid: false,
      error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  return result;
}

/**
 * Simple boolean check for Zod schema validation
 * @param url - The database URL to validate
 * @returns true if valid, false otherwise
 */
export function isDatabaseUrlValid(url?: string): boolean {
  if (!url) return true; // Allow empty during build time
  return validateDatabaseUrl(url).valid;
}

/**
 * Get standardized error message for database URL validation
 */
export function getDatabaseUrlErrorMessage(): string {
  return `DATABASE_URL must be a valid PostgreSQL connection string (${VALID_DATABASE_PROTOCOLS.join(' | ')}//user:pass@host:port/dbname)`;
}

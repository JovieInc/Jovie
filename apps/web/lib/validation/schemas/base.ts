import { z } from 'zod';

/**
 * Base validation schemas for common Zod primitives.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in hot-path API routes.
 *
 * @see https://github.com/colinhacks/zod#basic-usage
 */

/**
 * Device type schema for analytics tracking.
 * Used in audience click/visit tracking endpoints.
 */
export const deviceTypeSchema = z.enum([
  'mobile',
  'desktop',
  'tablet',
  'unknown',
]);

/**
 * Inferred TypeScript type for device types.
 */
export type DeviceType = z.infer<typeof deviceTypeSchema>;

/**
 * Link type schema for categorizing social/streaming links.
 * Used in click tracking and link management endpoints.
 */
export const linkTypeSchema = z.enum(['listen', 'social', 'tip', 'other']);

/**
 * Inferred TypeScript type for link types.
 */
export type LinkType = z.infer<typeof linkTypeSchema>;

/**
 * UUID validation schema.
 * Validates that a string is a valid UUID v4 format.
 */
export const uuidSchema = z.string().uuid();

/**
 * Set of allowed URL protocols for HTTP URL validation.
 */
const allowedUrlProtocols = new Set(['http:', 'https:']);

/**
 * Validates that a URL uses http or https protocol.
 * Returns false for malformed URLs or non-http(s) protocols.
 */
const hasSafeHttpProtocol = (value: string): boolean => {
  try {
    const url = new URL(value);
    return allowedUrlProtocols.has(url.protocol);
  } catch {
    return false;
  }
};

/**
 * HTTP URL validation schema.
 * Validates that a string is a properly formatted URL with http or https protocol.
 * Includes trimming, max length validation, and protocol verification.
 *
 * NOTE: This schema only validates protocol. For SSRF-safe URLs (e.g., avatar URLs),
 * use safeHttpUrlSchema which also blocks private/internal IPs.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(hasSafeHttpProtocol, 'URL must start with http or https');

/**
 * Private IP patterns for SSRF protection.
 * Covers both IPv4 and IPv6 private/internal address ranges.
 */
const PRIVATE_IP_PATTERNS = [
  // IPv4 patterns
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // Class A private (10.0.0.0/8)
  /^172\.(1[6-9]|2\d|3[0-1])\./, // Class B private (172.16.0.0/12)
  /^192\.168\./, // Class C private (192.168.0.0/16)
  /^169\.254\./, // Link-local (169.254.0.0/16)
  /^0\./, // Current network (0.0.0.0/8)
  // IPv6 patterns
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local (fe80::/10)
  /^fc[0-9a-f]{2}:/i, // IPv6 unique local fc00::/7 (fc00::/8)
  /^fd[0-9a-f]{2}:/i, // IPv6 unique local fc00::/7 (fd00::/8)
  /^\[::1\]$/, // IPv6 loopback in bracket notation
  /^\[fe80:/i, // IPv6 link-local in bracket notation
  /^\[fc[0-9a-f]{2}:/i, // IPv6 unique local in bracket notation
  /^\[fd[0-9a-f]{2}:/i, // IPv6 unique local in bracket notation
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
]);

/**
 * Validates a URL is safe from SSRF attacks by checking for private IPs and internal hosts.
 */
const isSsrfSafeUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    // Block known internal hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return false;
    }

    // Block private IP addresses
    if (PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname))) {
      return false;
    }

    // Block internal domain suffixes
    if (
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.localhost')
    ) {
      return false;
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname.includes('metadata')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * SSRF-safe HTTP URL validation schema.
 * Validates URL format, protocol, AND blocks private/internal addresses.
 * Use this for any URL that will be fetched server-side (e.g., avatar URLs).
 */
export const safeHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(hasSafeHttpProtocol, 'URL must start with http or https')
  .refine(isSsrfSafeUrl, 'URL must not point to internal or private addresses');

/**
 * Generic metadata schema for extensible key-value pairs.
 * Used in tracking events for additional context data.
 */
export const metadataSchema = z.record(z.string(), z.unknown());

/**
 * Inferred TypeScript type for metadata records.
 */
export type Metadata = z.infer<typeof metadataSchema>;

/**
 * Optional UUID schema for cases where the field may be omitted.
 */
export const optionalUuidSchema = uuidSchema.optional();

/**
 * Optional device type schema for cases where the field may be omitted.
 */
export const optionalDeviceTypeSchema = deviceTypeSchema.optional();

/**
 * Optional HTTP URL schema for cases where the field may be omitted.
 */
export const optionalHttpUrlSchema = httpUrlSchema.optional();

/**
 * Optional metadata schema for cases where the field may be omitted.
 */
export const optionalMetadataSchema = metadataSchema.optional();

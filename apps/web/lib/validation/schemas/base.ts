import { z } from 'zod';
import {
  BLOCKED_HOSTNAMES,
  INTERNAL_DOMAIN_SUFFIXES,
  isPrivateIpAddress,
  METADATA_HOSTNAMES,
} from '@/lib/constants/url-safety';

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
    if (isPrivateIpAddress(hostname)) {
      return false;
    }

    // Block internal domain suffixes
    if (INTERNAL_DOMAIN_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
      return false;
    }

    // Block cloud metadata endpoints
    if (METADATA_HOSTNAMES.has(hostname) || hostname.includes('metadata')) {
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

/**
 * URL Validation Pipeline Components
 *
 * Modular validators for URL safety, protocol, and scheme checks.
 * Extracted to reduce cognitive complexity and eliminate duplication.
 */

/**
 * Dangerous URL schemes that should be rejected.
 */
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|ftp):/i;

/**
 * Validation result for URL safety checks.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates that URL doesn't use dangerous schemes.
 * Rejects javascript:, data:, vbscript:, file:, and ftp: schemes.
 *
 * @param url - The URL to validate
 * @returns Validation result with reason if invalid
 */
export function validateScheme(url: string): ValidationResult {
  if (DANGEROUS_SCHEMES.test(url)) {
    return {
      valid: false,
      reason: 'Dangerous or unsupported URL scheme',
    };
  }
  return { valid: true };
}

/**
 * Validates that URL is not protocol-relative (doesn't start with //).
 * Protocol-relative URLs inherit the caller's protocol, which can be unsafe.
 *
 * @param url - The URL to validate
 * @returns Validation result with reason if invalid
 */
export function validateNotProtocolRelative(url: string): ValidationResult {
  if (url.startsWith('//')) {
    return {
      valid: false,
      reason: 'Protocol-relative URLs not allowed',
    };
  }
  return { valid: true };
}

/**
 * Validates that URL uses HTTPS protocol.
 * Ensures secure connections for all ingestion operations.
 *
 * @param url - The URL string (may or may not include protocol)
 * @returns Validation result with reason if invalid
 */
export function validateHttpsProtocol(url: string): ValidationResult {
  try {
    const urlToCheck = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(urlToCheck);

    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        reason: 'URL must use HTTPS protocol',
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      reason: 'Invalid URL format',
    };
  }
}

/**
 * Runs all safety validation checks on a URL.
 * Combines scheme, protocol-relative, and HTTPS checks into a single pipeline.
 *
 * @param url - The URL to validate
 * @returns True if URL passes all safety checks
 */
export function isUrlSafe(url: string): boolean {
  const trimmed = url.trim();

  const validators = [
    validateScheme(trimmed),
    validateNotProtocolRelative(trimmed),
    validateHttpsProtocol(trimmed),
  ];

  return validators.every(result => result.valid);
}

/**
 * Runs all safety validation checks and returns detailed result.
 * Use this when you need to know why a URL failed validation.
 *
 * @param url - The URL to validate
 * @returns Validation result with reason if invalid
 */
export function validateUrlSafety(url: string): ValidationResult {
  const trimmed = url.trim();

  const schemeResult = validateScheme(trimmed);
  if (!schemeResult.valid) return schemeResult;

  const protocolRelativeResult = validateNotProtocolRelative(trimmed);
  if (!protocolRelativeResult.valid) return protocolRelativeResult;

  const httpsResult = validateHttpsProtocol(trimmed);
  if (!httpsResult.valid) return httpsResult;

  return { valid: true };
}

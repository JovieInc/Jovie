import type { LinkType } from '@/types/db';

// Valid link types enum for validation
const VALID_LINK_TYPES = ['listen', 'social', 'tip', 'other'] as const;

// Username validation regex
// (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Validation error result
 */
export interface ValidationError {
  error: string;
  status: number;
}

/**
 * Validated track request data
 */
export interface ValidatedTrackRequest {
  handle: string;
  linkType: LinkType;
  target: string;
  linkId?: string;
  source?: 'qr' | 'link';
}

/**
 * Validate if a string is a valid URL
 */
function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that all required fields are present
 */
export function validateRequiredFields(body: {
  handle?: string;
  linkType?: LinkType;
  target?: string;
}): ValidationError | null {
  if (!body.handle || !body.linkType || !body.target) {
    return {
      error:
        'Missing required fields: handle, linkType, and target are required',
      status: 400,
    };
  }
  return null;
}

/**
 * Validate handle format
 */
export function validateHandle(handle: string): ValidationError | null {
  if (!USERNAME_REGEX.test(handle)) {
    return {
      error:
        'Invalid handle format. Must be 3-30 alphanumeric characters, underscores, or hyphens',
      status: 400,
    };
  }
  return null;
}

/**
 * Validate link type is valid
 */
export function validateLinkType(linkType: string): ValidationError | null {
  if (
    !VALID_LINK_TYPES.includes(linkType as (typeof VALID_LINK_TYPES)[number])
  ) {
    return {
      error: `Invalid linkType. Must be one of: ${VALID_LINK_TYPES.join(', ')}`,
      status: 400,
    };
  }
  return null;
}

/**
 * Validate target URL format if it looks like a URL
 */
export function validateTarget(target: string): ValidationError | null {
  if (typeof target !== 'string' || target.trim().length === 0) {
    return {
      error: 'Invalid target',
      status: 400,
    };
  }

  const looksLikeUrl = target.includes('://') || target.startsWith('www.');

  if (looksLikeUrl && !isValidURL(target)) {
    return {
      error: 'Invalid target URL format',
      status: 400,
    };
  }

  return null;
}

/**
 * Normalize source to valid type
 */
export function normalizeSource(source: unknown): 'qr' | 'link' | undefined {
  if (typeof source !== 'string') return undefined;
  const normalized = source.trim().toLowerCase();
  if (normalized === 'qr') return 'qr';
  if (normalized === 'link') return 'link';
  return undefined;
}

/**
 * Validate entire track request
 * Returns validation error or validated data
 */
export function validateTrackRequest(
  body: unknown
): { data: ValidatedTrackRequest } | { error: ValidationError } {
  if (typeof body !== 'object' || body === null) {
    return {
      error: {
        error: 'Invalid request body',
        status: 400,
      },
    };
  }

  const { handle, linkType, target, linkId, source } = body as {
    handle?: string;
    linkType?: LinkType;
    target?: string;
    linkId?: string;
    source?: unknown;
  };

  // Run all validations
  const requiredError = validateRequiredFields({ handle, linkType, target });
  if (requiredError) return { error: requiredError };

  const handleError = validateHandle(handle!);
  if (handleError) return { error: handleError };

  const linkTypeError = validateLinkType(linkType!);
  if (linkTypeError) return { error: linkTypeError };

  const targetError = validateTarget(target!);
  if (targetError) return { error: targetError };

  // All validations passed
  return {
    data: {
      handle: handle!,
      linkType: linkType!,
      target: target!,
      linkId,
      source: normalizeSource(source),
    },
  };
}

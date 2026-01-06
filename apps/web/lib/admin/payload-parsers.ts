import { type NextRequest } from 'next/server';

/**
 * Type guard to check if value is a non-empty string array
 */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.length > 0)
  );
}

/**
 * Parses JSON or FormData from a request
 */
async function parseRequestBody<T>(
  request: NextRequest,
  parseJson: (json: unknown) => T,
  parseFormData: (formData: FormData) => T
): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const json = await request.json();
    return parseJson(json);
  }

  const formData = await request.formData();
  return parseFormData(formData);
}

// ============================================================================
// TOGGLE PAYLOADS (Single boolean field)
// ============================================================================

export type ToggleMarketingPayload = {
  profileId: string;
  nextMarketingOptOut: boolean;
};

export async function parseToggleMarketingPayload(
  request: NextRequest
): Promise<ToggleMarketingPayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as {
        profileId?: string;
        nextMarketingOptOut?: boolean;
      };

      if (
        !payload.profileId ||
        typeof payload.nextMarketingOptOut !== 'boolean'
      ) {
        throw new Error('profileId and nextMarketingOptOut are required');
      }

      return {
        profileId: payload.profileId,
        nextMarketingOptOut: payload.nextMarketingOptOut,
      };
    },
    // FormData parser
    formData => {
      const profileId = formData.get('profileId');
      const nextMarketingOptOut = formData.get('nextMarketingOptOut');

      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new Error('profileId is required');
      }

      const marketingOptOut =
        typeof nextMarketingOptOut === 'string'
          ? nextMarketingOptOut === 'true'
          : false;

      return {
        profileId,
        nextMarketingOptOut: marketingOptOut,
      };
    }
  );
}

export type ToggleFeaturedPayload = {
  profileId: string;
  nextFeatured: boolean;
};

export async function parseToggleFeaturedPayload(
  request: NextRequest
): Promise<ToggleFeaturedPayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileId?: string; nextFeatured?: boolean };

      if (!payload.profileId || typeof payload.nextFeatured !== 'boolean') {
        throw new Error('profileId and nextFeatured are required');
      }

      return {
        profileId: payload.profileId,
        nextFeatured: payload.nextFeatured,
      };
    },
    // FormData parser
    formData => {
      const profileId = formData.get('profileId');
      const nextFeatured = formData.get('nextFeatured');

      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new Error('profileId is required');
      }

      const isFeatured =
        typeof nextFeatured === 'string' ? nextFeatured === 'true' : true;

      return {
        profileId,
        nextFeatured: isFeatured,
      };
    }
  );
}

export type ToggleVerifyPayload = {
  profileId: string;
  nextVerified: boolean;
};

export async function parseToggleVerifyPayload(
  request: NextRequest
): Promise<ToggleVerifyPayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileId?: string; nextVerified?: boolean };

      if (!payload.profileId || typeof payload.nextVerified !== 'boolean') {
        throw new Error('profileId and nextVerified are required');
      }

      return {
        profileId: payload.profileId,
        nextVerified: payload.nextVerified,
      };
    },
    // FormData parser
    formData => {
      const profileId = formData.get('profileId');
      const nextVerified = formData.get('nextVerified');

      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new Error('profileId is required');
      }

      const isVerified =
        typeof nextVerified === 'string' ? nextVerified === 'true' : true;

      return {
        profileId,
        nextVerified: isVerified,
      };
    }
  );
}

// ============================================================================
// DELETE PAYLOAD
// ============================================================================

export type DeletePayload = {
  profileId: string;
};

export async function parseDeletePayload(
  request: NextRequest
): Promise<DeletePayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileId?: string };

      if (!payload.profileId) {
        throw new Error('profileId is required');
      }

      return {
        profileId: payload.profileId,
      };
    },
    // FormData parser
    formData => {
      const profileId = formData.get('profileId');

      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new Error('profileId is required');
      }

      return {
        profileId,
      };
    }
  );
}

// ============================================================================
// BULK PAYLOADS (Array of profile IDs + optional boolean)
// ============================================================================

export type BulkFeaturePayload = {
  profileIds: string[];
  nextFeatured: boolean;
};

export async function parseBulkFeaturePayload(
  request: NextRequest
): Promise<BulkFeaturePayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileIds?: unknown; nextFeatured?: boolean };

      if (
        !isStringArray(payload.profileIds) ||
        typeof payload.nextFeatured !== 'boolean'
      ) {
        throw new Error('profileIds and nextFeatured are required');
      }

      return {
        profileIds: payload.profileIds,
        nextFeatured: payload.nextFeatured,
      };
    },
    // FormData parser
    formData => {
      const profileIdsRaw = formData.get('profileIds');
      const nextFeatured = formData.get('nextFeatured');

      if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
        throw new Error('profileIds is required');
      }

      const parsed = JSON.parse(profileIdsRaw) as unknown;
      if (!isStringArray(parsed)) {
        throw new Error('profileIds must be an array');
      }

      const isFeatured =
        typeof nextFeatured === 'string' ? nextFeatured === 'true' : true;

      return {
        profileIds: parsed,
        nextFeatured: isFeatured,
      };
    }
  );
}

export type BulkVerifyPayload = {
  profileIds: string[];
  nextVerified: boolean;
};

export async function parseBulkVerifyPayload(
  request: NextRequest
): Promise<BulkVerifyPayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileIds?: unknown; nextVerified?: boolean };

      if (
        !isStringArray(payload.profileIds) ||
        typeof payload.nextVerified !== 'boolean'
      ) {
        throw new Error('profileIds and nextVerified are required');
      }

      return {
        profileIds: payload.profileIds,
        nextVerified: payload.nextVerified,
      };
    },
    // FormData parser
    formData => {
      const profileIdsRaw = formData.get('profileIds');
      const nextVerified = formData.get('nextVerified');

      if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
        throw new Error('profileIds is required');
      }

      const parsed = JSON.parse(profileIdsRaw) as unknown;
      if (!isStringArray(parsed)) {
        throw new Error('profileIds must be an array');
      }

      const isVerified =
        typeof nextVerified === 'string' ? nextVerified === 'true' : true;

      return {
        profileIds: parsed,
        nextVerified: isVerified,
      };
    }
  );
}

export type BulkRefreshPayload = {
  profileIds: string[];
};

export async function parseBulkRefreshPayload(
  request: NextRequest
): Promise<BulkRefreshPayload> {
  return parseRequestBody(
    request,
    // JSON parser
    json => {
      const payload = json as { profileIds?: unknown };

      if (!isStringArray(payload.profileIds)) {
        throw new Error('profileIds is required');
      }

      return { profileIds: payload.profileIds };
    },
    // FormData parser
    formData => {
      const profileIdsRaw = formData.get('profileIds');

      if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
        throw new Error('profileIds is required');
      }

      const parsed = JSON.parse(profileIdsRaw) as unknown;
      if (!isStringArray(parsed)) {
        throw new Error('profileIds must be an array');
      }

      return { profileIds: parsed };
    }
  );
}

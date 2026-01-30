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

/**
 * Generic toggle payload parser factory.
 * Reduces code duplication for single-field toggle operations.
 * @internal
 */
function createToggleParser<TKey extends string>(
  fieldName: TKey,
  defaultValue = true
) {
  type Payload = { profileId: string } & Record<TKey, boolean>;

  return async (request: NextRequest): Promise<Payload> => {
    return parseRequestBody(
      request,
      // JSON parser
      json => {
        const payload = json as { profileId?: string } & Partial<
          Record<TKey, boolean>
        >;

        if (!payload.profileId || typeof payload[fieldName] !== 'boolean') {
          throw new TypeError(`profileId and ${fieldName} are required`);
        }

        return {
          profileId: payload.profileId,
          [fieldName]: payload[fieldName],
        } as Payload;
      },
      // FormData parser
      formData => {
        const profileId = formData.get('profileId');
        const fieldValue = formData.get(fieldName);

        if (typeof profileId !== 'string' || profileId.length === 0) {
          throw new TypeError('profileId is required');
        }

        const boolValue =
          typeof fieldValue === 'string' ? fieldValue === 'true' : defaultValue;

        return {
          profileId,
          [fieldName]: boolValue,
        } as Payload;
      }
    );
  };
}

export type ToggleMarketingPayload = {
  profileId: string;
  nextMarketingOptOut: boolean;
};

export const parseToggleMarketingPayload =
  createToggleParser<'nextMarketingOptOut'>('nextMarketingOptOut', false);

export type ToggleFeaturedPayload = {
  profileId: string;
  nextFeatured: boolean;
};

export const parseToggleFeaturedPayload =
  createToggleParser<'nextFeatured'>('nextFeatured');

export type ToggleVerifyPayload = {
  profileId: string;
  nextVerified: boolean;
};

export const parseToggleVerifyPayload =
  createToggleParser<'nextVerified'>('nextVerified');

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
        throw new TypeError('profileId is required');
      }

      return {
        profileId: payload.profileId,
      };
    },
    // FormData parser
    formData => {
      const profileId = formData.get('profileId');

      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new TypeError('profileId is required');
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

/**
 * Generic bulk payload parser factory.
 * Reduces code duplication for bulk operations with optional boolean field.
 * @internal
 */
function createBulkParser<TKey extends string>(
  fieldName?: TKey,
  defaultValue = true
) {
  type Payload = { profileIds: string[] } & (TKey extends string
    ? Record<TKey, boolean>
    : object);

  return async (request: NextRequest): Promise<Payload> => {
    return parseRequestBody(
      request,
      // JSON parser
      json => {
        const payload = json as { profileIds?: unknown } & (TKey extends string
          ? Partial<Record<TKey, boolean>>
          : object);

        if (!isStringArray(payload.profileIds)) {
          throw new TypeError('profileIds is required');
        }

        if (fieldName) {
          const fieldValue = (payload as Record<string, unknown>)[fieldName];
          if (typeof fieldValue !== 'boolean') {
            throw new TypeError(`profileIds and ${fieldName} are required`);
          }
          return {
            profileIds: payload.profileIds,
            [fieldName]: fieldValue,
          } as Payload;
        }

        return { profileIds: payload.profileIds } as Payload;
      },
      // FormData parser
      formData => {
        const profileIdsRaw = formData.get('profileIds');

        if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
          throw new TypeError('profileIds is required');
        }

        const parsed = JSON.parse(profileIdsRaw) as unknown;
        if (!isStringArray(parsed)) {
          throw new TypeError('profileIds must be an array');
        }

        if (fieldName) {
          const fieldValue = formData.get(fieldName);
          const boolValue =
            typeof fieldValue === 'string'
              ? fieldValue === 'true'
              : defaultValue;

          return {
            profileIds: parsed,
            [fieldName]: boolValue,
          } as Payload;
        }

        return { profileIds: parsed } as Payload;
      }
    );
  };
}

export type BulkFeaturePayload = {
  profileIds: string[];
  nextFeatured: boolean;
};

export const parseBulkFeaturePayload =
  createBulkParser<'nextFeatured'>('nextFeatured');

export type BulkVerifyPayload = {
  profileIds: string[];
  nextVerified: boolean;
};

export const parseBulkVerifyPayload =
  createBulkParser<'nextVerified'>('nextVerified');

export type BulkRefreshPayload = {
  profileIds: string[];
};

export const parseBulkRefreshPayload = createBulkParser();

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL, getProfileUrl } from '@/constants/domains';
import type { DbOrTransaction } from '@/lib/db';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { slugify } from '@/lib/utm/build-url';

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
export const AUDIENCE_SOURCE_PAGE_SIZE = 100;

export async function parseSourceRequestJson(
  request: NextRequest
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Malformed JSON');
  }
}

export function buildAudienceSourceErrorResponse(
  error: string,
  status: number
) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

type ParsedRouteParamsResult<T> =
  | { readonly data: T; readonly response?: never }
  | {
      readonly data?: never;
      readonly response: ReturnType<typeof NextResponse.json>;
    };

export function parseAudienceSourceRouteParams<T>(
  rawParams: unknown,
  schema: z.ZodType<T>,
  error: string
): ParsedRouteParamsResult<T> {
  const parsedParams = schema.safeParse(rawParams);
  if (!parsedParams.success) {
    return {
      response: buildAudienceSourceErrorResponse(error, 400),
    };
  }

  return { data: parsedParams.data };
}

type ParsedPayloadResult<T> =
  | { readonly data: T; readonly response?: never }
  | {
      readonly data?: never;
      readonly response: ReturnType<typeof NextResponse.json>;
    };

export async function parseAudienceSourcePayload<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  invalidPayloadError: string
): Promise<ParsedPayloadResult<T>> {
  let body: unknown;
  try {
    body = await parseSourceRequestJson(request);
  } catch {
    return {
      response: buildAudienceSourceErrorResponse('Malformed JSON', 400),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: buildAudienceSourceErrorResponse(invalidPayloadError, 400),
    };
  }

  return { data: parsed.data };
}

export async function parseAudienceSourcePatchRequest<TParams, TPayload>(
  request: NextRequest,
  rawParams: unknown,
  paramsSchema: z.ZodType<TParams>,
  paramsError: string,
  payloadSchema: z.ZodType<TPayload>,
  payloadError: string
): Promise<
  | {
      readonly params: TParams;
      readonly payload: TPayload;
      readonly response?: never;
    }
  | {
      readonly params?: never;
      readonly payload?: never;
      readonly response: ReturnType<typeof NextResponse.json>;
    }
> {
  const parsedParams = parseAudienceSourceRouteParams(
    rawParams,
    paramsSchema,
    paramsError
  );
  if (parsedParams.response) {
    return { response: parsedParams.response };
  }

  const parsedPayload = await parseAudienceSourcePayload(
    request,
    payloadSchema,
    payloadError
  );
  if (parsedPayload.response) {
    return { response: parsedPayload.response };
  }

  return {
    params: parsedParams.data,
    payload: parsedPayload.data,
  };
}

export async function verifyAudienceSourceProfileOrResponse(
  tx: DbOrTransaction,
  profileId: string,
  clerkUserId: string
) {
  const profile = await verifyProfileOwnership(tx, profileId, clerkUserId);
  if (!profile) {
    return {
      response: buildAudienceSourceErrorResponse('Profile not found', 404),
    };
  }

  return { profile };
}

export function buildAudienceSourceShortLinkUrl(code: string): string {
  return new URL(`/s/${code}`, BASE_URL).toString();
}

export function withAudienceSourceShortLink<
  T extends { readonly code: string },
>(link: T): T & { shortUrl: string } {
  return {
    ...link,
    shortUrl: buildAudienceSourceShortLinkUrl(link.code),
  };
}

function buildAudienceSourceSlugFallback(
  value: string,
  prefix: string
): string {
  const normalized = value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const sanitized = normalized.replaceAll(/[^a-z0-9]+/g, '-');
  const trimmed = trimEdgeDashes(sanitized);

  if (trimmed) {
    return trimmed;
  }

  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }

  return `${prefix}-${hash.toString(36)}`;
}

function trimEdgeDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') {
    start += 1;
  }
  while (end > 0 && value[end - 1] === '-') {
    end -= 1;
  }

  return value.slice(start, end);
}

function resolveAudienceSourceSlug(value: string, prefix: string): string {
  const slug = slugify(value);
  return slug || buildAudienceSourceSlugFallback(value, prefix);
}

export function buildAudienceSourceUtmParams(
  groupName: string,
  linkName: string,
  options?: {
    readonly source?: string;
    readonly medium?: string;
  }
) {
  return {
    source: options?.source ?? 'qr_code',
    medium: options?.medium ?? 'print',
    campaign: resolveAudienceSourceSlug(groupName, 'campaign'),
    content: resolveAudienceSourceSlug(linkName, 'content'),
  };
}

export async function resolveAudienceSourceDestinationUrl(
  tx: DbOrTransaction,
  profileId: string
): Promise<string> {
  const [profileRow] = await tx
    .select({ username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profileRow?.username ? getProfileUrl(profileRow.username) : BASE_URL;
}

/**
 * Profile Validation
 *
 * Schema and validation functions for profile updates.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import { profileUpdateSchema } from '@/lib/validation/schemas';
import { normalizeUsername } from '@/lib/validation/username';
import { validateUsernameCore } from '@/lib/validation/username-core';
import { ALLOWED_PROFILE_FIELDS, NO_STORE_HEADERS } from './constants';

/**
 * Extended profile update schema with username validation.
 *
 * A profile that already owns a reserved fixture handle must still be able to
 * save other fields. Renaming onto a reserved handle stays rejected.
 */
function profileUpdateSchemaFor(currentUsername?: string | null) {
  return profileUpdateSchema
    .superRefine((data, ctx) => {
      if (data.username === undefined) return;
      const validation = validateUsernameCore(data.username);
      if (validation.isValid) return;
      const normalized = normalizeUsername(data.username);
      const keepingOwnedReservedHandle =
        currentUsername != null &&
        normalizeUsername(currentUsername) === normalized &&
        validation.errorCode === 'RESERVED' &&
        isReservedPublicProfileIdentity(normalized);
      if (keepingOwnedReservedHandle) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['username'],
        message: validation.error ?? 'Username is invalid or reserved',
      });
    })
    .transform(data => {
      if (data.username !== undefined) {
        return { ...data, username: normalizeUsername(data.username) };
      }
      return data;
    });
}

export const ProfileUpdateSchema = profileUpdateSchemaFor();

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export type UpdatesValidationResult =
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export function validateUpdatesPayload(
  updates: unknown
): UpdatesValidationResult {
  if (
    typeof updates !== 'object' ||
    updates === null ||
    Array.isArray(updates)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid updates payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No changes detected' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const unknownFields = updateKeys.filter(
    key => !ALLOWED_PROFILE_FIELDS.has(key)
  );

  if (unknownFields.length > 0) {
    const label = unknownFields.length > 1 ? 'fields' : 'field';
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Unsupported ${label}: ${unknownFields.join(', ')}`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, updates: updates as Record<string, unknown> };
}

export type ParsedUpdatesResult =
  | { ok: true; parsed: ProfileUpdateInput }
  | { ok: false; response: NextResponse };

export function parseProfileUpdates(
  updates: Record<string, unknown>,
  options?: { readonly currentUsername?: string | null }
): ParsedUpdatesResult {
  const parsedUpdatesResult = profileUpdateSchemaFor(
    options?.currentUsername
  ).safeParse(updates);
  if (!parsedUpdatesResult.success) {
    const firstError = parsedUpdatesResult.error.issues[0]?.message;
    return {
      ok: false,
      response: NextResponse.json(
        { error: firstError || 'Invalid profile updates' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, parsed: parsedUpdatesResult.data };
}

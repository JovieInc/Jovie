/**
 * Profile Validation
 *
 * Schema and validation functions for profile updates.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { profileUpdateSchema } from '@/lib/validation/schemas';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import { ALLOWED_PROFILE_FIELDS, NO_STORE_HEADERS } from './constants';

/**
 * Extended profile update schema with username validation.
 *
 * Extends the centralized profileUpdateSchema with route-specific
 * username validation using validateUsername and normalizeUsername.
 */
export const ProfileUpdateSchema = profileUpdateSchema
  .superRefine((data, ctx) => {
    if (data.username !== undefined) {
      const validation = validateUsername(data.username);
      if (!validation.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['username'],
          message: validation.error ?? 'Username is invalid or reserved',
        });
      }
    }
  })
  .transform(data => {
    if (data.username !== undefined) {
      return { ...data, username: normalizeUsername(data.username) };
    }
    return data;
  });

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
  updates: Record<string, unknown>
): ParsedUpdatesResult {
  const parsedUpdatesResult = ProfileUpdateSchema.safeParse(updates);
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

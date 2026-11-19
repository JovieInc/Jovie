/**
 * Branded (nominal) IDs and music-identifier schemas.
 *
 * Why: every id in the codebase is a plain `string`, so any id string is
 * assignable to any id slot — a releaseId can flow into a trackId parameter
 * and TypeScript cannot tell. A phantom `__brand` property gives each id its
 * own nominal type at zero runtime cost.
 *
 * Pattern: brand at the edge. Parse untrusted input through the schema below
 * (or wrap a trusted value with the `parse*` helper) at the module that owns
 * the entity, and let the branded type flow outward. Branded ids remain
 * assignable TO `string`, so plain-string call sites keep working while
 * adoption is incremental — no big-bang signature rewrite.
 *
 * ISRC/UPC stay strings (never numbers): both can carry leading zeros, and
 * numeric coercion silently destroys them. `UpcSchema` recovers the common
 * numeric-coercion case (a UPC-A whose leading zero was dropped becomes 11
 * digits) by zero-padding back to 12 and validating the GS1 check digit —
 * anything that fails the check digit is rejected, never guessed at.
 *
 * Follow-up plan (later PRs, package by package): add drizzle `.$type<UserId>()`
 * on PK/FK columns in apps/web/lib/db/schema/** so query results come out
 * branded, then tighten function signatures outward from there. DB column
 * types and migrations are NOT touched by that work; it is type-level only.
 */

import { z } from 'zod';

/**
 * Nominal typing via a phantom property. `T` stays structurally intact
 * (a `UserId` is still usable anywhere a `string` is), while two different
 * brands are no longer assignable to each other.
 */
export type Brand<T, B extends string> = T & {
  readonly __brand: B;
};

// ============================================================================
// Entity IDs (UUIDs)
// ============================================================================

export type UserId = Brand<string, 'UserId'>;
export type CreatorProfileId = Brand<string, 'CreatorProfileId'>;
export type ReleaseId = Brand<string, 'ReleaseId'>;
export type TrackId = Brand<string, 'TrackId'>;
export type RecordingId = Brand<string, 'RecordingId'>;

export const UserIdSchema = z.uuid().transform(v => v as UserId);
export const CreatorProfileIdSchema = z
  .uuid()
  .transform(v => v as CreatorProfileId);
export const ReleaseIdSchema = z.uuid().transform(v => v as ReleaseId);
export const TrackIdSchema = z.uuid().transform(v => v as TrackId);
export const RecordingIdSchema = z.uuid().transform(v => v as RecordingId);

export function parseUserId(value: string): UserId {
  return UserIdSchema.parse(value);
}

export function isUserId(value: string): value is UserId {
  return UserIdSchema.safeParse(value).success;
}

export function parseCreatorProfileId(value: string): CreatorProfileId {
  return CreatorProfileIdSchema.parse(value);
}

export function isCreatorProfileId(value: string): value is CreatorProfileId {
  return CreatorProfileIdSchema.safeParse(value).success;
}

export function parseReleaseId(value: string): ReleaseId {
  return ReleaseIdSchema.parse(value);
}

export function isReleaseId(value: string): value is ReleaseId {
  return ReleaseIdSchema.safeParse(value).success;
}

export function parseTrackId(value: string): TrackId {
  return TrackIdSchema.parse(value);
}

export function isTrackId(value: string): value is TrackId {
  return TrackIdSchema.safeParse(value).success;
}

export function parseRecordingId(value: string): RecordingId {
  return RecordingIdSchema.parse(value);
}

export function isRecordingId(value: string): value is RecordingId {
  return RecordingIdSchema.safeParse(value).success;
}

// ============================================================================
// ISRC — International Standard Recording Code
// ============================================================================

export type Isrc = Brand<string, 'Isrc'>;

export const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export const IsrcSchema = z
  .string()
  .transform(v => v.toUpperCase().replaceAll(/[-\s]/g, ''))
  .pipe(z.string().regex(ISRC_PATTERN))
  .transform(v => v as Isrc);

/** Normalize (uppercase, separators stripped) and validate; throws on invalid. */
export function parseIsrc(value: string): Isrc {
  return IsrcSchema.parse(value);
}

/** Normalize and validate; returns null instead of throwing on invalid input. */
export function safeParseIsrc(value: string): Isrc | null {
  const result = IsrcSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isIsrc(value: string): value is Isrc {
  return IsrcSchema.safeParse(value).success;
}

// ============================================================================
// UPC / EAN — Universal Product Code (UPC-A: 12 digits, EAN-13: 13 digits)
// ============================================================================

export type Upc = Brand<string, 'Upc'>;

/**
 * GS1 check digit: from the rightmost digit, weights alternate 3,1,3,…
 * (UPC-A odd positions x3; EAN-13 even positions x3 — same recurrence).
 */
function gtinCheckDigitValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) {
    const weight = (digits.length - 1 - i) % 2 === 1 ? 3 : 1;
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export const UpcSchema = z
  .string()
  .transform(v => v.trim().replaceAll(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d{11,13}$/)
      /**
       * Recover numeric coercion: a UPC-A with a leading zero loses it when
       * some upstream layer treats the code as a number. Zero-pad back to 12
       * and let the check digit below arbitrate — a false recovery is
       * impossible because the padded code must still validate.
       */
      .transform(v => (v.length === 11 ? `0${v}` : v))
      .refine(gtinCheckDigitValid, 'GTIN check digit failed')
  )
  .transform(v => v as Upc);

/**
 * Normalize (whitespace/separators stripped, leading zeros preserved) and
 * validate; throws on invalid.
 */
export function parseUpc(value: string): Upc {
  return UpcSchema.parse(value);
}

/** Normalize and validate; returns null instead of throwing on invalid input. */
export function safeParseUpc(value: string): Upc | null {
  const result = UpcSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isUpc(value: string): value is Upc {
  return UpcSchema.safeParse(value).success;
}

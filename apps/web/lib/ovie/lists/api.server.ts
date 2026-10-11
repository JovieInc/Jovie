import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import { MAX_RATING } from './model';

export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const;

/**
 * Ovie is founder-only: the existing admin + privacy-lock gate is the whole
 * boundary (no feature flag, per Tim 2026-10-04).
 */
export async function guardListsApi(): Promise<NextResponse | null> {
  return requireOvieApiAccess();
}

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

const creatorId = z.string().uuid();

export const listActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), creatorId }),
  z.object({ type: z.literal('remove'), creatorId }),
  z.object({
    type: z.literal('swipe'),
    creatorId,
    direction: z.enum(['left', 'right']),
  }),
  z.object({
    type: z.literal('rate'),
    creatorId,
    rating: z.number().int().min(1).max(MAX_RATING).nullable(),
  }),
  z.object({ type: z.literal('favorite'), creatorId, favorite: z.boolean() }),
  z.object({ type: z.literal('accept_suggestion'), creatorId }),
  z.object({ type: z.literal('reject_suggestion'), creatorId }),
  z.object({ type: z.literal('rename'), name: z.string() }),
  z.object({ type: z.literal('pin'), pinned: z.boolean() }),
]);

/** `suggest` is server-only: clients ask for suggestions, never inject them. */
export const listPatchSchema = z.object({
  actions: z.array(listActionSchema).min(1).max(50),
});

export const listCreateSchema = z.object({ name: z.string() });

/**
 * POST /api/catalog/collaborators/match
 *
 * Resolves an external collaborator signal against a catalog snapshot and returns
 * confidence-scored release matches.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  type CatalogSnapshot,
  type CollaboratorSignalInput,
  founderDemoCatalogSnapshot,
  matchCollaboratorSignal,
} from '@/lib/catalog';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const catalogCollaboratorSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  providerIds: z
    .array(
      z.object({
        provider: z.string(),
        providerId: z.string(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
});

const catalogReleaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  artistNames: z.array(z.string()),
  releaseDate: z.string().optional(),
});

const catalogSnapshotSchema = z.object({
  ownerArtistName: z.string(),
  collaborators: z.array(catalogCollaboratorSchema),
  releases: z.array(catalogReleaseSchema),
});

const requestSchema = z.object({
  signal: z.object({
    text: z.string(),
    provider: z.string().optional(),
    providerId: z.string().optional(),
  }),
  catalog: catalogSnapshotSchema.optional(),
  fixture: z.enum(['founder-demo']).optional(),
});

function resolveCatalogSnapshot(input: {
  catalog?: CatalogSnapshot;
  fixture?: 'founder-demo';
}): CatalogSnapshot {
  if (input.catalog) {
    return input.catalog;
  }

  if (input.fixture === 'founder-demo' || !input.fixture) {
    return founderDemoCatalogSnapshot;
  }

  return founderDemoCatalogSnapshot;
}

export async function POST(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const signal: CollaboratorSignalInput = parsed.data.signal;
    if (!signal.text.trim() && !signal.providerId) {
      return NextResponse.json(
        {
          success: false,
          error: 'signal.text or signal.providerId is required',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const catalog = resolveCatalogSnapshot(parsed.data);
    const result = matchCollaboratorSignal(catalog, signal);

    if (!result) {
      return NextResponse.json(
        {
          success: true,
          matched: false,
          collaborator: null,
          releases: [],
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        matched: true,
        collaborator: {
          id: result.resolver.collaborator.id,
          name: result.resolver.collaborator.name,
          confidence: result.resolver.confidence,
          matchMethod: result.resolver.matchMethod,
        },
        releases: result.matches.map(match => ({
          id: match.release.id,
          title: match.release.title,
          slug: match.release.slug,
          confidence: match.confidence,
          reason: match.reason,
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Catalog collaborator match failed', error, {
      route: '/api/catalog/collaborators/match',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

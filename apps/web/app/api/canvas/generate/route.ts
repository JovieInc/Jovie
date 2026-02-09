import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { CORS_HEADERS } from '@/lib/http/headers';
import {
  buildCanvasMetadata,
  getCanvasGenerationJob,
  startCanvasGeneration,
  validateArtworkForCanvas,
} from '@/lib/services/canvas/service';

export const maxDuration = 30;

const generateCanvasSchema = z.object({
  releaseId: z.string().uuid(),
  motionType: z
    .enum(['zoom', 'pan', 'particles', 'morph', 'ambient'])
    .optional()
    .default('ambient'),
  removeText: z.boolean().optional().default(true),
  upscale: z.boolean().optional().default(true),
});

const statusCheckSchema = z.object({
  jobId: z.string().uuid(),
});

/**
 * POST /api/canvas/generate
 *
 * Start a canvas generation job for a release.
 * Returns the job ID for polling status.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const parseResult = generateCanvasSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { releaseId, motionType, removeText, upscale } = parseResult.data;

  try {
    // Verify the release belongs to the user
    const [release] = await db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        artworkUrl: discogReleases.artworkUrl,
        creatorProfileId: discogReleases.creatorProfileId,
        metadata: discogReleases.metadata,
      })
      .from(discogReleases)
      .where(eq(discogReleases.id, releaseId))
      .limit(1);

    if (!release) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Verify the authenticated user owns this release's profile
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        clerkId: users.clerkId,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, release.creatorProfileId))
      .limit(1);

    if (!profile || profile.clerkId !== userId) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Validate artwork
    if (!release.artworkUrl) {
      return NextResponse.json(
        {
          error: 'No artwork available',
          message:
            'This release has no album artwork. Upload artwork first, then generate a canvas.',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const artworkValidation = validateArtworkForCanvas(release.artworkUrl);
    if (!artworkValidation.valid) {
      return NextResponse.json(
        { error: artworkValidation.error },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Start the generation job
    const job = await startCanvasGeneration(release.creatorProfileId, {
      releaseId: release.id,
      artworkUrl: release.artworkUrl,
      releaseTitle: release.title,
      artistName: profile.displayName ?? 'Artist',
      style: {
        motionType,
        removeText,
        upscale,
      },
    });

    // Update release metadata to track canvas generation
    await db
      .update(discogReleases)
      .set({
        metadata: {
          ...(release.metadata ?? {}),
          ...buildCanvasMetadata('not_set'),
          canvasJobId: job.id,
        },
        updatedAt: new Date(),
      })
      .where(eq(discogReleases.id, releaseId));

    Sentry.addBreadcrumb({
      category: 'canvas',
      message: 'Canvas generation started via API',
      data: { jobId: job.id, releaseId },
      level: 'info',
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        status: job.status,
        message:
          'Canvas generation job created. Video generation will be available once an AI video provider is configured.',
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'canvas-generation' },
      extra: { userId, releaseId },
    });

    return NextResponse.json(
      { error: 'Failed to start canvas generation' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * GET /api/canvas/generate?jobId=xxx
 *
 * Check the status of a canvas generation job.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const { searchParams } = new URL(req.url);
  const parseResult = statusCheckSchema.safeParse({
    jobId: searchParams.get('jobId'),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid jobId parameter' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const job = getCanvasGenerationJob(parseResult.data.jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      jobId: job.id,
      status: job.status,
      releaseId: job.releaseId,
      result: job.result ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
    { headers: CORS_HEADERS }
  );
}

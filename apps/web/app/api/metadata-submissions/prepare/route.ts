import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import {
  prepareMetadataSubmissions,
  verifySubmissionProfileOwnership,
} from '@/lib/submission-agent/service';

const prepareRequestSchema = z.object({
  profileId: z.string().uuid(),
  releaseId: z.string().uuid().optional(),
  providerIds: z.array(z.string().min(1)).optional(),
});

export async function POST(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = prepareRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const ownership = await verifySubmissionProfileOwnership(
      parsed.data.profileId,
      userId
    );
    if (!ownership) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    const result = await prepareMetadataSubmissions(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await captureError('Metadata submission prepare failed', error, {
      route: '/api/metadata-submissions/prepare',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import {
  FOUNDER_REVIEW_AUDIO_TYPES,
  FOUNDER_REVIEW_MAX_AUDIO_BYTES,
  founderReviewBlobPrefix,
} from '@/lib/founder-review/contract';
import { founderReviewErrorResponse } from '@/lib/founder-review/route-error';
import {
  assertFounderReviewTargetOwnership,
  FounderReviewError,
  recordFounderReviewUploadLease,
  resolveFounderReviewUserId,
} from '@/lib/founder-review/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const UploadQuerySchema = z.object({
  sessionId: z.string().uuid(),
  segmentId: z.string().uuid(),
  targetType: z.enum(['inbox-card', 'founder-note']),
  targetId: z.string().trim().min(1).max(200),
  sourceKind: z.string().trim().min(1).max(120),
});

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    let authenticatedUpload:
      | {
          readonly appUserId: string;
          readonly query: z.infer<typeof UploadQuerySchema>;
          readonly prefix: string;
        }
      | undefined;
    if (body.type === 'blob.generate-client-token') {
      const { userId, error } = await requireAuth();
      if (error) return error;
      const query = UploadQuerySchema.safeParse({
        sessionId: request.nextUrl.searchParams.get('sessionId'),
        segmentId: request.nextUrl.searchParams.get('segmentId'),
        targetType: request.nextUrl.searchParams.get('targetType'),
        targetId: request.nextUrl.searchParams.get('targetId'),
        sourceKind: request.nextUrl.searchParams.get('sourceKind'),
      });
      if (!query.success) {
        throw new FounderReviewError(
          'invalid-founder-review-upload-query',
          400
        );
      }
      const appUserId = await resolveFounderReviewUserId(userId);
      await assertFounderReviewTargetOwnership({
        userId: appUserId,
        target: {
          type: query.data.targetType,
          id: query.data.targetId,
          title: 'Pending founder review upload',
          sourceKind: query.data.sourceKind,
          category: 'upload',
        },
      });
      authenticatedUpload = {
        appUserId,
        query: query.data,
        prefix: founderReviewBlobPrefix({
          userId: appUserId,
          sessionId: query.data.sessionId,
          segmentId: query.data.segmentId,
          target: {
            type: query.data.targetType,
            id: query.data.targetId,
            sourceKind: query.data.sourceKind,
          },
        }),
      };
    }
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async pathname => {
        if (!authenticatedUpload) {
          throw new FounderReviewError(
            'founder-review-upload-unauthorized',
            401
          );
        }
        if (!pathname.startsWith(authenticatedUpload.prefix)) {
          throw new FounderReviewError(
            'invalid-founder-review-media-path',
            422
          );
        }
        return {
          allowedContentTypes: [...FOUNDER_REVIEW_AUDIO_TYPES],
          maximumSizeInBytes: FOUNDER_REVIEW_MAX_AUDIO_BYTES,
          tokenPayload: JSON.stringify({
            userId: authenticatedUpload.appUserId,
            ...authenticatedUpload.query,
          }),
        };
      },
      onUploadCompleted: async upload => {
        await recordFounderReviewUploadLease(upload);
      },
    });
    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (caught) {
    return founderReviewErrorResponse(
      caught,
      '/api/inbox/founder-reviews/upload-token'
    );
  }
}

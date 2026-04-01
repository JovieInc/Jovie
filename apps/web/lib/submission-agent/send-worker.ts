import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metadataSubmissionRequests } from '@/lib/db/schema/metadata-submissions';
import { getSubmissionProvider } from './providers/registry';
import {
  getStoredSubmissionPackage,
  loadCanonicalSubmissionContext,
} from './service';

export async function processQueuedMetadataSubmissions(params?: {
  requestIds?: string[];
  limit?: number;
}) {
  const queuedRequests = params?.requestIds?.length
    ? await db
        .select()
        .from(metadataSubmissionRequests)
        .where(inArray(metadataSubmissionRequests.id, params.requestIds))
        .orderBy(asc(metadataSubmissionRequests.createdAt))
    : await db
        .select()
        .from(metadataSubmissionRequests)
        .where(eq(metadataSubmissionRequests.status, 'queued'))
        .orderBy(asc(metadataSubmissionRequests.createdAt))
        .limit(params?.limit ?? 10);

  const results: Array<{
    requestId: string;
    status: string;
    providerMessageId?: string;
    error?: string;
  }> = [];

  for (const request of queuedRequests) {
    if (request.status !== 'queued') {
      continue;
    }

    const provider = getSubmissionProvider(request.providerId);
    if (!provider?.send) {
      await db
        .update(metadataSubmissionRequests)
        .set({
          status: 'failed',
          lastError: `Provider ${request.providerId} does not support send`,
          updatedAt: new Date(),
        })
        .where(eq(metadataSubmissionRequests.id, request.id));

      results.push({
        requestId: request.id,
        status: 'failed',
        error: `Provider ${request.providerId} does not support send`,
      });
      continue;
    }

    const storedPackage = await getStoredSubmissionPackage(request.id);
    if (!storedPackage) {
      await db
        .update(metadataSubmissionRequests)
        .set({
          status: 'failed',
          lastError: 'Prepared package artifacts are missing',
          updatedAt: new Date(),
        })
        .where(eq(metadataSubmissionRequests.id, request.id));

      results.push({
        requestId: request.id,
        status: 'failed',
        error: 'Prepared package artifacts are missing',
      });
      continue;
    }

    const canonical = await loadCanonicalSubmissionContext({
      profileId: request.creatorProfileId,
      releaseId: request.releaseId,
    });
    const sendResult = await provider.send({
      request,
      package: storedPackage,
      canonical,
    });

    if (sendResult.status === 'sent') {
      await db
        .update(metadataSubmissionRequests)
        .set({
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: sendResult.providerMessageId ?? null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(metadataSubmissionRequests.id, request.id));

      results.push({
        requestId: request.id,
        status: 'sent',
        providerMessageId: sendResult.providerMessageId,
      });
      continue;
    }

    await db
      .update(metadataSubmissionRequests)
      .set({
        status: 'failed',
        lastError: sendResult.error ?? 'Unknown send failure',
        updatedAt: new Date(),
      })
      .where(eq(metadataSubmissionRequests.id, request.id));

    results.push({
      requestId: request.id,
      status: 'failed',
      error: sendResult.error ?? 'Unknown send failure',
    });
  }

  return results;
}

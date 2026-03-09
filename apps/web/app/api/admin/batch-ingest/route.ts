import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  detectFullExtractionPlatform,
  fetchFullExtractionProfile,
  resolveFullExtractionContext,
} from '@/lib/ingestion/flows/full-extraction-flow';
import { checkExistingProfile } from '@/lib/ingestion/flows/profile-operations';
import {
  handleNewProfileIngest,
  handleReingestProfile,
} from '@/lib/ingestion/flows/reingest-flow';
import { ingestSocialPlatformUrl } from '@/lib/ingestion/flows/social-platform-ingest';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { batchCreatorIngestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface BatchIngestResult {
  input: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  profileId?: string;
  username?: string;
}

async function ingestUrlEntry(entry: string): Promise<BatchIngestResult> {
  const normalizedInput = normalizeUrl(entry);

  try {
    const { isLinktree, isLaylo, linktreeValidatedUrl } =
      detectFullExtractionPlatform(normalizedInput);

    let response: NextResponse;
    if (isLinktree || isLaylo) {
      const context = resolveFullExtractionContext(
        normalizedInput,
        isLaylo,
        linktreeValidatedUrl
      );

      if (!context.ok) {
        return {
          input: normalizedInput,
          status: 'error',
          reason: 'Invalid URL format for ingestion.',
        };
      }

      const { validatedUrl, handle } = context;
      const existingCheck = await checkExistingProfile(handle);

      if (!existingCheck.finalHandle) {
        return {
          input: normalizedInput,
          status: 'error',
          reason: 'Unable to allocate unique username.',
        };
      }

      if (existingCheck.existing?.isClaimed) {
        return {
          input: normalizedInput,
          status: 'skipped',
          reason: 'Profile already claimed.',
        };
      }

      const extraction = await fetchFullExtractionProfile(
        isLaylo,
        validatedUrl,
        handle
      );
      const displayName = extraction.displayName?.trim() || handle;

      if (existingCheck.isReingest && existingCheck.existing) {
        response = await handleReingestProfile({
          existing: existingCheck.existing,
          extraction,
          displayName,
        });
      } else {
        response = await handleNewProfileIngest({
          finalHandle: existingCheck.finalHandle,
          displayName,
          hostedAvatarUrl: extraction.avatarUrl ?? null,
          extraction,
        });
      }
    } else {
      response = await ingestSocialPlatformUrl(normalizedInput);
    }

    const payload = (await response.json()) as {
      profile?: { id?: string; username?: string; usernameNormalized?: string };
      error?: string;
      details?: string;
    };

    if (response.ok) {
      return {
        input: normalizedInput,
        status: 'success',
        profileId: payload.profile?.id,
        username:
          payload.profile?.username ?? payload.profile?.usernameNormalized,
      };
    }

    if (response.status === 409) {
      return {
        input: normalizedInput,
        status: 'skipped',
        reason: payload.details ?? payload.error ?? 'Profile already exists.',
      };
    }

    return {
      input: normalizedInput,
      status: 'error',
      reason: payload.details ?? payload.error ?? 'Failed to ingest URL.',
    };
  } catch (error) {
    await captureError('Batch URL ingest: entry ingestion failed', error, {
      route: '/api/admin/batch-ingest',
      input: normalizedInput,
    });

    return {
      input: normalizedInput,
      status: 'error',
      reason: getSafeErrorMessage(error, 'Failed to ingest URL.'),
    };
  }
}

async function resolveAdminEntitlements(
  _route: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  if (!entitlements.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const authResult = await resolveAdminEntitlements(
      '/api/admin/batch-ingest'
    );
    if (!authResult.ok) return authResult.response;

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/batch-ingest',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = batchCreatorIngestSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const results: BatchIngestResult[] = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < parsed.data.urls.length; i += CONCURRENCY) {
      const batch = parsed.data.urls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(ingestUrlEntry));
      results.push(...batchResults);
    }

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          success: results.filter(r => r.status === 'success').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          error: results.filter(r => r.status === 'error').length,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Batch URL ingest: request processing failed', error, {
      route: '/api/admin/batch-ingest',
    });
    return NextResponse.json(
      {
        error: 'Failed to process batch URL ingest',
        details: getSafeErrorMessage(error, 'An unexpected error occurred.'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

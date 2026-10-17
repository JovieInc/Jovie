import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/domains';
import { RefreshLockBusyError } from '@/lib/connectors/token-vault';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { requireLibraryProfileAccess } from '@/lib/library/track-drawer.server';
import {
  applyYouTubeLink,
  rollbackYouTubeLink,
  YOUTUBE_LINK_WRITE_SCOPE,
} from '@/lib/youtube-library/link-apply';
import { linkCommandSchema } from '@/lib/youtube-library/link-contract';
import {
  loadYouTubeLinkContext,
  loadYouTubeLinkWriter,
  previewYouTubeLink,
} from '@/lib/youtube-library/link-service';
import {
  withYouTubeLinkStore,
  YouTubeLinkBusyError,
} from '@/lib/youtube-library/link-store';

// The provider writer and approval hashing require Node crypto.
export const runtime = 'nodejs';
export const maxDuration = 120;
type Params = { params: Promise<{ videoId: string }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

async function handle(request: Request, { params }: Params, write: boolean) {
  try {
    const { videoId } = await params;
    const command = write
      ? linkCommandSchema.safeParse(await request.json().catch(() => null))
      : null;
    const profile = z
      .string()
      .uuid()
      .safeParse(
        write
          ? command?.success && command.data.creatorProfileId
          : new URL(request.url).searchParams.get('creatorProfileId')
      );
    if (
      !profile.success ||
      !/^[\w-]{1,128}$/.test(videoId) ||
      (write && !command?.success)
    )
      return json({ error: 'Invalid payload' }, 400);
    const auth = await requireLibraryProfileAccess(profile.data);
    if (auth.error) return auth.error;
    const context = await loadYouTubeLinkContext(
      auth.userId,
      profile.data,
      videoId
    );
    if (!context) return json({ error: 'Imported video was not found' }, 404);
    if (!write) return json(await previewYouTubeLink(context));
    if (
      !context.accountId ||
      !context.scopes?.includes(YOUTUBE_LINK_WRITE_SCOPE)
    )
      return json(
        { error: 'Reconnect YouTube with description editing access.' },
        409
      );
    const writer = await loadYouTubeLinkWriter(context);
    if (!writer)
      return json({ error: 'Reconnect YouTube to refresh access.' }, 409);
    if (!command?.success) return json({ error: 'Invalid approval' }, 400);
    const data = command.data;
    const result = await withYouTubeLinkStore(
      context.accountId,
      videoId,
      store =>
        data.action === 'rollback'
          ? rollbackYouTubeLink({
              videoId,
              operationKey: data.operationKey,
              sourceVersion: data.sourceVersion,
              approvedBy: auth.userId,
              writer,
              store,
            })
          : applyYouTubeLink({
              videoId,
              videoUrl: context.video.url,
              expectedUrl: context.expectedUrl,
              extraHosts: [new URL(BASE_URL).hostname],
              approval: data.approval,
              approvedBy: auth.userId,
              auth: { state: 'ok', scopes: context.scopes ?? [] },
              writer,
              store,
            })
    );
    if (!result.ok) return json({ error: result.error }, 409);
    return json({ ok: true });
  } catch (error) {
    if (
      error instanceof YouTubeLinkBusyError ||
      error instanceof RefreshLockBusyError
    )
      return json(
        {
          error: 'An update is in progress. Refresh the preview and try again.',
        },
        409
      );
    // Provider errors never expose credentials or arbitrary provider messages.
    await captureError('YouTube link request failed', error, {
      route: '/api/youtube-library/videos/[videoId]/link',
      method: write ? 'POST' : 'GET',
    });
    return json(
      {
        error:
          'YouTube could not be checked. Refresh the preview or reconnect YouTube.',
      },
      502
    );
  }
}
export const GET = (request: Request, params: Params) =>
  handle(request, params, false);
export const POST = (request: Request, params: Params) =>
  handle(request, params, true);

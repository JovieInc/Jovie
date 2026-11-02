/**
 * JOV-5883 / JOV-9337 — Tim-channel preview and link inspection receipt.
 *
 * Paste-channel preview may consume a free image-generation allowance. The
 * Connect stage only reads live descriptions and proposes changes; this runner
 * never approves or applies them. Exact proposals must be reviewed and applied
 * through Jovie's existing approved link workflow.
 */

import type { YouTubeVideoSnippetRecord } from '../youtube-library/link-apply';
import {
  inspectYouTubeLink,
  type YouTubeLinkPlan,
} from '../youtube-library/link-inspect';
import {
  type AcquisitionPreflightResult,
  runYouTubeGrowthPreflight,
} from './kernel';
import {
  qualifyRegularlyUploadingChannel,
  YOUTUBE_CLOSED_LOOP_EXPERIMENT_ID,
  YOUTUBE_CLOSED_LOOP_VARIANT_ID,
} from './youtube-closed-loop';

export const YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA =
  'jovie.youtube-closed-loop-dogfood/v1' as const;

export const YOUTUBE_CLOSED_LOOP_DOGFOOD_STAGES = [
  'paste_channel',
  'free_thumbnails',
  'connect_apply',
  'receipt',
] as const;
export type YoutubeClosedLoopDogfoodStage =
  (typeof YOUTUBE_CLOSED_LOOP_DOGFOOD_STAGES)[number];

export const YOUTUBE_CLOSED_LOOP_DOGFOOD_THUMBNAIL_COUNT = 3;

export interface YoutubeDogfoodChannel {
  readonly id: string;
  readonly title: string;
  readonly handle: string | null;
}

export interface YoutubeDogfoodPreviewItem {
  readonly videoId: string;
  readonly title: string;
  readonly beforeUrl: string;
  readonly afterUrl: string | null;
  readonly publishedAt?: string | null;
}

/**
 * Result of the paste-channel surface: the same payload the
 * `/api/youtube-thumbnails/preview` route returns to a visitor.
 */
export interface YoutubeDogfoodPastePreview {
  readonly channel: YoutubeDogfoodChannel;
  readonly mode: 'preview_only' | 'before_after';
  readonly items: readonly YoutubeDogfoodPreviewItem[];
}

export type YoutubeDogfoodAuth =
  | { readonly state: 'ok'; readonly scopes: readonly string[] }
  | { readonly state: 'missing' | 'revoked' };

export interface YoutubeDogfoodSnippetReader {
  getVideo(videoId: string): Promise<YouTubeVideoSnippetRecord | null>;
}

export interface YoutubeClosedLoopDogfoodDeps {
  /** Golden-path entry point — paste a handle/link/id, get the preview payload. */
  readonly pasteChannelPreview: (
    channelInput: string
  ) => Promise<YoutubeDogfoodPastePreview>;
  /** Read-only Connect interface; possession of a grant never approves a write. */
  readonly reader?: YoutubeDogfoodSnippetReader;
  /** Connect grant state; missing/revoked access blocks inspection honestly. */
  readonly auth?: YoutubeDogfoodAuth;
  readonly now?: Date;
}

export interface YoutubeDogfoodStageResult {
  readonly stage: YoutubeClosedLoopDogfoodStage;
  readonly status: 'pass' | 'fail' | 'blocked';
  readonly summary: string;
}

export interface YoutubeDogfoodLinkApplyResult {
  readonly videoId: string;
  readonly title: string;
  readonly planStatus: YouTubeLinkPlan['status'];
  readonly action: YouTubeLinkPlan['action'];
  readonly applied: boolean;
  readonly verified: boolean;
  readonly error: string | null;
  /** Exact read-only proposal; absent when the target could not be inspected. */
  readonly plan?: YouTubeLinkPlan;
}

export interface YoutubeClosedLoopDogfoodReceipt {
  readonly schema: typeof YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA;
  readonly correlationId: string;
  readonly observedAt: string;
  readonly experimentId: typeof YOUTUBE_CLOSED_LOOP_EXPERIMENT_ID;
  readonly variantIdentity: typeof YOUTUBE_CLOSED_LOOP_VARIANT_ID;
  readonly channelInput: string;
  readonly channel: YoutubeDogfoodChannel | null;
  readonly stages: readonly YoutubeDogfoodStageResult[];
  readonly thumbnails: {
    readonly requested: number;
    readonly received: number;
    readonly beforeAfterPairs: number;
    readonly mode: 'preview_only' | 'before_after' | null;
    readonly items: readonly YoutubeDogfoodPreviewItem[];
  };
  readonly apply: {
    readonly authState: 'ok' | 'missing' | 'revoked' | 'unattempted';
    readonly videosEvaluated: number;
    readonly linksInserted: number;
    readonly linksAlreadyVerified: number;
    readonly results: readonly YoutubeDogfoodLinkApplyResult[];
  };
  readonly qualification: ReturnType<
    typeof qualifyRegularlyUploadingChannel
  > | null;
  readonly preflightReadiness: AcquisitionPreflightResult | null;
  readonly guardrails: {
    readonly officialApiOnly: true;
    readonly thumbnailsSetCalled: false;
    readonly videosUpdateCalls: number;
    readonly adsArmed: false;
    readonly sendRemainsHuman: true;
  };
  readonly outcome: 'pass' | 'blocked' | 'fail';
  readonly blocker: string | null;
}

function stage(
  name: YoutubeClosedLoopDogfoodStage,
  status: YoutubeDogfoodStageResult['status'],
  summary: string
): YoutubeDogfoodStageResult {
  return { stage: name, status, summary };
}

interface DogfoodVideoTarget {
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
}

async function runConnectInspectionStage(input: {
  readonly videos: readonly DogfoodVideoTarget[];
  readonly channelId: string;
  readonly expectedUrl: string;
  readonly deps: YoutubeClosedLoopDogfoodDeps;
}): Promise<{
  readonly stage: YoutubeDogfoodStageResult;
  readonly authState: 'ok' | 'missing' | 'revoked' | 'unattempted';
  readonly results: readonly YoutubeDogfoodLinkApplyResult[];
  readonly videosUpdateCalls: 0;
  readonly linksInserted: 0;
  readonly linksAlreadyVerified: number;
}> {
  const { deps } = input;
  const auth = deps.auth ?? { state: 'missing' as const };
  if (!deps.reader || auth.state !== 'ok') {
    return {
      stage: stage(
        'connect_apply',
        'blocked',
        'Link inspection unavailable: Connect read access is missing or revoked. Live apply not attempted.'
      ),
      authState: auth.state,
      results: [],
      videosUpdateCalls: 0,
      linksInserted: 0,
      linksAlreadyVerified: 0,
    };
  }

  const results: YoutubeDogfoodLinkApplyResult[] = [];
  let linksAlreadyVerified = 0;
  const blocked = (video: DogfoodVideoTarget, error: string) => {
    results.push({
      videoId: video.videoId,
      title: video.title,
      planStatus: 'unknown',
      action: 'none',
      applied: false,
      verified: false,
      error,
    });
  };
  for (const video of input.videos) {
    if (
      typeof input.channelId !== 'string' ||
      !input.channelId.trim() ||
      typeof video.videoId !== 'string' ||
      !/^[\w-]{1,128}$/.test(video.videoId)
    ) {
      blocked(video, 'invalid-target');
      continue;
    }
    let live: YouTubeVideoSnippetRecord | null;
    try {
      live = await deps.reader.getVideo(video.videoId);
    } catch {
      blocked(video, 'provider-read-failed');
      continue;
    }
    if (!live) {
      blocked(video, 'video-unavailable');
      continue;
    }
    if (
      live.id !== video.videoId ||
      live.snippet.channelId !== input.channelId
    ) {
      blocked(video, 'identity-mismatch');
      continue;
    }
    const plan = inspectYouTubeLink({
      description: live.snippet.description,
      expectedUrl: input.expectedUrl,
      videoUrl: video.url,
    });
    const verified = plan.status === 'verified';
    if (verified) linksAlreadyVerified += 1;
    results.push({
      videoId: video.videoId,
      title: video.title,
      planStatus: plan.status,
      action: plan.action,
      applied: false,
      verified,
      error: verified
        ? null
        : (plan.blockedReason ??
          (plan.status === 'unknown' ? 'inspection-unresolved' : null)),
      plan,
    });
  }

  const unresolved = results.filter(result => result.error !== null).length;
  return {
    stage: stage(
      'connect_apply',
      'blocked',
      `Link inspection complete: ${results.length} target(s), ${linksAlreadyVerified} already correct, ${unresolved} unresolved. Live apply not attempted. Review each exact proposal and apply through Jovie's approved link workflow.`
    ),
    authState: 'ok',
    results,
    videosUpdateCalls: 0,
    linksInserted: 0,
    linksAlreadyVerified,
  };
}

/**
 * Run the Tim-channel dogfood. Pure orchestration — every external surface
 * (paste preview, Connect reader, auth) is injected, so the same loop runs
 * against production via the script or against fakes in tests.
 */
export async function runYoutubeClosedLoopDogfood(input: {
  readonly channelInput: string;
  /** Canonical Jovie smart link to inspect, e.g. https://jov.ie/tim. */
  readonly expectedUrl: string;
  readonly deps: YoutubeClosedLoopDogfoodDeps;
  readonly correlationId?: string;
}): Promise<YoutubeClosedLoopDogfoodReceipt> {
  const now = input.deps.now ?? new Date();
  const observedAt = now.toISOString();
  const stages: YoutubeDogfoodStageResult[] = [];
  const base = {
    schema: YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA,
    correlationId:
      input.correlationId ?? `youtube-closed-loop-dogfood:${observedAt}`,
    observedAt,
    experimentId: YOUTUBE_CLOSED_LOOP_EXPERIMENT_ID,
    variantIdentity: YOUTUBE_CLOSED_LOOP_VARIANT_ID,
    channelInput: input.channelInput,
  } as const;

  const finish = (
    partial: Omit<
      YoutubeClosedLoopDogfoodReceipt,
      keyof typeof base | 'stages' | 'outcome' | 'blocker'
    >,
    outcome: YoutubeClosedLoopDogfoodReceipt['outcome'],
    blocker: string | null
  ): YoutubeClosedLoopDogfoodReceipt => {
    stages.push(
      stage(
        'receipt',
        'pass',
        `Receipt ${YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA} emitted; outcome=${outcome}.`
      )
    );
    return { ...base, stages, ...partial, outcome, blocker };
  };

  // Stage 1 — paste channel.
  let preview: YoutubeDogfoodPastePreview;
  try {
    preview = await input.deps.pasteChannelPreview(input.channelInput);
  } catch (error) {
    stages.push(
      stage(
        'paste_channel',
        'fail',
        `Paste preview failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return finish(
      {
        channel: null,
        thumbnails: {
          requested: YOUTUBE_CLOSED_LOOP_DOGFOOD_THUMBNAIL_COUNT,
          received: 0,
          beforeAfterPairs: 0,
          mode: null,
          items: [],
        },
        apply: {
          authState: 'unattempted',
          videosEvaluated: 0,
          linksInserted: 0,
          linksAlreadyVerified: 0,
          results: [],
        },
        qualification: null,
        preflightReadiness: null,
        guardrails: {
          officialApiOnly: true,
          thumbnailsSetCalled: false,
          videosUpdateCalls: 0,
          adsArmed: false,
          sendRemainsHuman: true,
        },
      },
      'fail',
      'paste_channel'
    );
  }
  stages.push(
    stage(
      'paste_channel',
      'pass',
      `Resolved ${preview.channel.title} (${preview.channel.id}) from pasted input.`
    )
  );

  // Stage 2 — 3 free thumbnails before/after.
  const items = preview.items.slice(
    0,
    YOUTUBE_CLOSED_LOOP_DOGFOOD_THUMBNAIL_COUNT
  );
  const beforeAfterPairs = items.filter(
    item => item.beforeUrl && item.afterUrl
  ).length;
  const thumbnailsOk =
    items.length === YOUTUBE_CLOSED_LOOP_DOGFOOD_THUMBNAIL_COUNT &&
    items.every(item => Boolean(item.beforeUrl)) &&
    preview.mode === 'before_after' &&
    beforeAfterPairs >= 1;
  stages.push(
    stage(
      'free_thumbnails',
      thumbnailsOk ? 'pass' : 'blocked',
      thumbnailsOk
        ? `${items.length} previews returned, ${beforeAfterPairs} before/after pair(s) (mode=${preview.mode}).`
        : `Preview degraded: ${items.length} item(s), mode=${preview.mode}, ${beforeAfterPairs} before/after pair(s).`
    )
  );

  // Stage 3 — inspect links only; retain the blocked apply stage in v1 receipts.
  const targets: DogfoodVideoTarget[] = items.map(item => ({
    videoId: item.videoId,
    title: item.title,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`,
  }));
  const applyStage = await runConnectInspectionStage({
    videos: targets,
    channelId: preview.channel.id,
    expectedUrl: input.expectedUrl,
    deps: input.deps,
  });
  stages.push(applyStage.stage);

  // ICP qualification only when publish dates were observed; the public
  // preview payload omits them, so a null verdict is honest "unknown".
  const qualification = items.some(item => item.publishedAt)
    ? qualifyRegularlyUploadingChannel({
        videos: items.map(item => ({
          videoId: item.videoId,
          publishedAt: item.publishedAt ?? null,
        })),
        now,
      })
    : null;

  const preflightReadiness = runYouTubeGrowthPreflight({
    channelId: preview.channel.id,
    channelTitle: preview.channel.title,
    videoCount: items.length,
    generatedCount: beforeAfterPairs,
    mode: preview.mode,
    altersFaces: false,
  });

  return finish(
    {
      channel: preview.channel,
      thumbnails: {
        requested: YOUTUBE_CLOSED_LOOP_DOGFOOD_THUMBNAIL_COUNT,
        received: items.length,
        beforeAfterPairs,
        mode: preview.mode,
        items,
      },
      apply: {
        authState: applyStage.authState,
        videosEvaluated: applyStage.results.length,
        linksInserted: applyStage.linksInserted,
        linksAlreadyVerified: applyStage.linksAlreadyVerified,
        results: applyStage.results,
      },
      qualification,
      preflightReadiness,
      guardrails: {
        officialApiOnly: true,
        thumbnailsSetCalled: false,
        videosUpdateCalls: applyStage.videosUpdateCalls,
        adsArmed: false,
        sendRemainsHuman: true,
      },
    },
    'blocked',
    !thumbnailsOk ? 'free_thumbnails' : 'connect_apply'
  );
}

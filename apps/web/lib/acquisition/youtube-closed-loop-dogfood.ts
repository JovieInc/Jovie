/**
 * JOV-5883 — automated Tim-channel dogfood of the YouTube closed loop
 * (JOV-5881). Drives the golden path programmatically so the run is a
 * receipt, not a manual walk:
 *
 *   paste channel → 3 free thumbs before/after → Connect apply →
 *   titles/descriptions + Jovie link insert → receipt
 *
 * Official YouTube Data API only. No spend beyond the free preview
 * allowance. `thumbnails.set` is never called — thumbnail apply stays
 * denied per the experiment guardrails; the only write is artist-owned
 * `videos.update` (snippet title/description) through the Connect token.
 */

import {
  applyYouTubeLink,
  approvalFromPlan,
  createMemoryYouTubeLinkStore,
  hashDescription,
  sourceVersionFor,
  type YouTubeLinkApplyStore,
  type YouTubeSnippetWriter,
} from '../youtube-library/link-apply';
import {
  inspectYouTubeLink,
  type YouTubeLinkPlan,
} from '../youtube-library/link-inspect';
import {
  type AcquisitionMachineCertification,
  machineCertifyYouTubeGrowth,
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

export interface YoutubeClosedLoopDogfoodDeps {
  /** Golden-path entry point — paste a handle/link/id, get the preview payload. */
  readonly pasteChannelPreview: (
    channelInput: string
  ) => Promise<YoutubeDogfoodPastePreview>;
  /** Connect-side writer used for the link apply stage. */
  readonly writer?: YouTubeSnippetWriter;
  /** Connect grant state; 'missing' blocks the apply stage honestly. */
  readonly auth?: YoutubeDogfoodAuth;
  /** Apply-operation store; defaults to an in-memory store for the run. */
  readonly store?: YouTubeLinkApplyStore;
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
  readonly machineCertification: AcquisitionMachineCertification | null;
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

async function runConnectApplyStage(input: {
  readonly videos: readonly DogfoodVideoTarget[];
  readonly expectedUrl: string;
  readonly deps: YoutubeClosedLoopDogfoodDeps;
  readonly now: Date;
}): Promise<{
  readonly stage: YoutubeDogfoodStageResult;
  readonly authState: 'ok' | 'missing' | 'revoked' | 'unattempted';
  readonly results: readonly YoutubeDogfoodLinkApplyResult[];
  readonly videosUpdateCalls: number;
  readonly linksInserted: number;
  readonly linksAlreadyVerified: number;
}> {
  const { deps } = input;
  const auth = deps.auth ?? { state: 'missing' as const };
  if (!deps.writer || auth.state !== 'ok') {
    return {
      stage: stage(
        'connect_apply',
        'blocked',
        'Connect apply skipped: no authorized YouTube snippet writer (token missing or revoked).'
      ),
      authState: auth.state,
      results: [],
      videosUpdateCalls: 0,
      linksInserted: 0,
      linksAlreadyVerified: 0,
    };
  }

  const writer = deps.writer;
  const store = deps.store ?? createMemoryYouTubeLinkStore();
  let videosUpdateCalls = 0;
  const countingWriter: YouTubeSnippetWriter = {
    getVideo: videoId => writer.getVideo(videoId),
    updateVideo: async update => {
      videosUpdateCalls += 1;
      return writer.updateVideo(update);
    },
  };

  const results: YoutubeDogfoodLinkApplyResult[] = [];
  let linksInserted = 0;
  let linksAlreadyVerified = 0;
  for (const video of input.videos) {
    const live = await writer.getVideo(video.videoId);
    if (!live) {
      results.push({
        videoId: video.videoId,
        title: video.title,
        planStatus: 'unknown',
        action: 'none',
        applied: false,
        verified: false,
        error: 'not-imported',
      });
      continue;
    }
    const plan = inspectYouTubeLink({
      description: live.snippet.description,
      expectedUrl: input.expectedUrl,
      videoUrl: video.url,
    });
    if (plan.action === 'none' || plan.blockedReason) {
      if (plan.status === 'verified') linksAlreadyVerified += 1;
      results.push({
        videoId: video.videoId,
        title: video.title,
        planStatus: plan.status,
        action: plan.action,
        applied: false,
        verified: plan.status === 'verified',
        error: plan.blockedReason,
      });
      continue;
    }
    const approval = approvalFromPlan({
      videoId: video.videoId,
      plan,
      sourceVersion: sourceVersionFor(live.snippet.description, live.etag),
    });
    if (
      approval.proposedDescriptionSha256 !==
      hashDescription(plan.proposedDescription)
    ) {
      results.push({
        videoId: video.videoId,
        title: video.title,
        planStatus: plan.status,
        action: plan.action,
        applied: false,
        verified: false,
        error: 'invalid-approval',
      });
      continue;
    }
    const applied = await applyYouTubeLink({
      videoId: video.videoId,
      videoUrl: video.url,
      expectedUrl: input.expectedUrl,
      approval,
      auth,
      writer: countingWriter,
      store,
      now: input.now,
    });
    const ok = applied.ok && applied.status === 'verified';
    // The returned plan is the post-write re-inspection (action 'none');
    // count the insert by the pre-apply plan that drove the write.
    if (ok && plan.action === 'insert') linksInserted += 1;
    results.push({
      videoId: video.videoId,
      title: video.title,
      planStatus: applied.plan?.status ?? plan.status,
      action: applied.plan?.action ?? plan.action,
      applied: true,
      verified: ok,
      error: applied.ok ? null : applied.error,
    });
  }

  const failed = results.filter(item => item.applied && !item.verified);
  return {
    stage: stage(
      'connect_apply',
      failed.length === 0 ? 'pass' : 'fail',
      failed.length === 0
        ? `Connect apply verified: ${linksInserted} link insert(s), ${linksAlreadyVerified} already correct.`
        : `${failed.length} apply operation(s) failed verification.`
    ),
    authState: 'ok',
    results,
    videosUpdateCalls,
    linksInserted,
    linksAlreadyVerified,
  };
}

/**
 * Run the Tim-channel dogfood. Pure orchestration — every external surface
 * (paste preview, Connect writer, auth) is injected, so the same loop runs
 * against production via the script or against fakes in tests.
 */
export async function runYoutubeClosedLoopDogfood(input: {
  readonly channelInput: string;
  /** Canonical Jovie smart link to insert, e.g. https://jov.ie/tim. */
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
        machineCertification: null,
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

  // Stage 3 — Connect apply: titles/descriptions + Jovie link insert.
  const targets: DogfoodVideoTarget[] = items.map(item => ({
    videoId: item.videoId,
    title: item.title,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`,
  }));
  const applyStage = await runConnectApplyStage({
    videos: targets,
    expectedUrl: input.expectedUrl,
    deps: input.deps,
    now,
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

  const machineCertification = machineCertifyYouTubeGrowth({
    channelId: preview.channel.id,
    channelTitle: preview.channel.title,
    videoCount: items.length,
    generatedCount: beforeAfterPairs,
    mode: preview.mode,
    altersFaces: false,
  });

  let outcome: YoutubeClosedLoopDogfoodReceipt['outcome'] = 'pass';
  let blocker: string | null = null;
  if (stages.some(item => item.status === 'fail')) {
    outcome = 'fail';
    blocker = stages.find(item => item.status === 'fail')?.stage ?? null;
  } else if (!thumbnailsOk || applyStage.stage.status === 'blocked') {
    outcome = 'blocked';
    blocker = !thumbnailsOk ? 'free_thumbnails' : 'connect_apply';
  }

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
        videosEvaluated: targets.length,
        linksInserted: applyStage.linksInserted,
        linksAlreadyVerified: applyStage.linksAlreadyVerified,
        results: applyStage.results,
      },
      qualification,
      machineCertification,
      guardrails: {
        officialApiOnly: true,
        thumbnailsSetCalled: false,
        videosUpdateCalls: applyStage.videosUpdateCalls,
        adsArmed: false,
        sendRemainsHuman: true,
      },
    },
    outcome,
    blocker
  );
}

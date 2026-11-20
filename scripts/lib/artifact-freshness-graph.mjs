/**
 * Artifact freshness stage graph (JOV-5368 slice).
 *
 * Invariant: merged ≠ certified ≠ published ≠ feed ≠ installed ≠ running.
 * No stage may infer the next from a green workflow name or version string.
 * Device stages (installed/running) stay explicit `unknown` until a heartbeat
 * receipt exists — this module never invents them.
 */

export const ARTIFACT_FRESHNESS_SCHEMA = 'jovie-artifact-freshness/v1';

export const STAGES = Object.freeze([
  'certified',
  'published',
  'feed',
  'installed',
  'running',
]);

/**
 * @typedef {{
 *   readonly status: 'known' | 'unknown' | 'missing';
 *   readonly sourceRevision?: string | null;
 *   readonly version?: string | null;
 *   readonly at?: string | null;
 *   readonly verified?: boolean;
 *   readonly reason?: string | null;
 * }} StageReceipt
 *
 * @typedef {{
 *   readonly channel: 'production' | 'staging';
 *   readonly stages: Readonly<Record<string, StageReceipt>>;
 *   readonly mismatches: ReadonlyArray<{
 *     readonly from: string;
 *     readonly to: string;
 *     readonly code: string;
 *     readonly reason: string;
 *     readonly pagesSummer: boolean;
 *   }>;
 *   readonly desktopRelevantSincePublished?: boolean | null;
 * }} ChannelGraph
 */

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * @param {StageReceipt | null | undefined} stage
 * @returns {boolean}
 */
function isKnownSha(stage) {
  return (
    stage?.status === 'known' &&
    typeof stage.sourceRevision === 'string' &&
    FULL_SHA.test(stage.sourceRevision)
  );
}

/**
 * Loose stage input — {@link normalizeStage} validates status before use.
 * @typedef {{
 *   readonly status?: string;
 *   readonly sourceRevision?: string | null;
 *   readonly version?: string | null;
 *   readonly at?: string | null;
 *   readonly verified?: boolean;
 *   readonly reason?: string | null;
 * }} StageReceiptInput
 *
 * Reconcile one channel's stage receipts into a mismatch list.
 * @param {{
 *   readonly channel: 'production' | 'staging';
 *   readonly certified?: StageReceiptInput | null;
 *   readonly published?: StageReceiptInput | null;
 *   readonly feed?: StageReceiptInput | null;
 *   readonly installed?: StageReceiptInput | null;
 *   readonly running?: StageReceiptInput | null;
 *   readonly desktopRelevantSincePublished?: boolean | null;
 *   readonly publishInFlight?: boolean | null;
 * }} input
 * @returns {ChannelGraph}
 */
export function reconcileArtifactFreshness(input) {
  const channel = input.channel;
  const stages = {
    certified: normalizeStage(input.certified),
    published: normalizeStage(input.published),
    feed: normalizeStage(input.feed),
    installed: normalizeStage(input.installed ?? { status: 'unknown' }),
    running: normalizeStage(input.running ?? { status: 'unknown' }),
  };
  /** @type {ChannelGraph['mismatches'][number][]} */
  const mismatches = [];

  if (stages.published.status === 'missing') {
    mismatches.push({
      from: 'certified',
      to: 'published',
      code: 'published-missing',
      reason: `${channel}: no published desktop release receipt.`,
      pagesSummer: true,
    });
  } else if (
    stages.published.status === 'known' &&
    stages.published.verified !== true
  ) {
    mismatches.push({
      from: 'published',
      to: 'feed',
      code: 'publication-unverified',
      reason:
        stages.published.reason ??
        `${channel}: published assets/feed identity is unverified.`,
      pagesSummer: true,
    });
  }

  if (
    stages.published.status === 'known' &&
    stages.published.verified === true &&
    stages.feed.status === 'known' &&
    stages.feed.verified === true
  ) {
    if (
      stages.published.sourceRevision &&
      stages.feed.sourceRevision &&
      stages.published.sourceRevision !== stages.feed.sourceRevision
    ) {
      mismatches.push({
        from: 'published',
        to: 'feed',
        code: 'feed-source-mismatch',
        reason: `${channel}: published source ${stages.published.sourceRevision.slice(0, 12)} differs from feed ${stages.feed.sourceRevision.slice(0, 12)}.`,
        pagesSummer: true,
      });
    }
    if (
      stages.published.version &&
      stages.feed.version &&
      stages.published.version !== stages.feed.version
    ) {
      mismatches.push({
        from: 'published',
        to: 'feed',
        code: 'feed-version-mismatch',
        reason: `${channel}: published version ${stages.published.version} differs from feed ${stages.feed.version}.`,
        pagesSummer: true,
      });
    }
  }

  const desktopRelevantSincePublished =
    input.desktopRelevantSincePublished === true
      ? true
      : input.desktopRelevantSincePublished === false
        ? false
        : null;

  if (
    isKnownSha(stages.certified) &&
    isKnownSha(stages.published) &&
    stages.certified.sourceRevision !== stages.published.sourceRevision
  ) {
    if (desktopRelevantSincePublished === true) {
      // Stamp PR keep-owned = normal publish path; record without paging Summer.
      // null publishInFlight = stamp lookup incomplete — never false-page.
      if (input.publishInFlight === true) {
        mismatches.push({
          from: 'certified',
          to: 'published',
          code: 'certified-unpublished-inflight',
          reason: `${channel}: certified ${stages.certified.sourceRevision.slice(0, 12)} is desktop-relevant ahead of published ${stages.published.sourceRevision.slice(0, 12)}; desktop stamp PR is in flight.`,
          pagesSummer: false,
        });
      } else if (input.publishInFlight == null) {
        mismatches.push({
          from: 'certified',
          to: 'published',
          code: 'certified-unpublished-stamp-unknown',
          reason: `${channel}: certified ${stages.certified.sourceRevision.slice(0, 12)} is desktop-relevant ahead of published ${stages.published.sourceRevision.slice(0, 12)}; stamp in-flight state was not observed.`,
          pagesSummer: false,
        });
      } else {
        mismatches.push({
          from: 'certified',
          to: 'published',
          code: 'certified-unpublished',
          reason: `${channel}: certified ${stages.certified.sourceRevision.slice(0, 12)} is desktop-relevant ahead of published ${stages.published.sourceRevision.slice(0, 12)}.`,
          pagesSummer: true,
        });
      }
    } else if (desktopRelevantSincePublished === null) {
      // git diff failed / unobserved — never treat as green for Summer close.
      mismatches.push({
        from: 'certified',
        to: 'published',
        code: 'certified-relevance-unknown',
        reason: `${channel}: certified ${stages.certified.sourceRevision.slice(0, 12)} differs from published ${stages.published.sourceRevision.slice(0, 12)} but desktop relevance was not observed.`,
        pagesSummer: false,
      });
    }
  }

  if (
    isKnownSha(stages.installed) &&
    isKnownSha(stages.published) &&
    stages.installed.sourceRevision !== stages.published.sourceRevision
  ) {
    mismatches.push({
      from: 'published',
      to: 'installed',
      code: 'installed-behind',
      reason: `${channel}: installed ${stages.installed.sourceRevision.slice(0, 12)} differs from published ${stages.published.sourceRevision.slice(0, 12)}.`,
      pagesSummer: true,
    });
  }

  if (
    isKnownSha(stages.running) &&
    isKnownSha(stages.installed) &&
    stages.running.sourceRevision !== stages.installed.sourceRevision
  ) {
    mismatches.push({
      from: 'installed',
      to: 'running',
      code: 'running-stale',
      reason: `${channel}: running ${stages.running.sourceRevision.slice(0, 12)} differs from installed ${stages.installed.sourceRevision.slice(0, 12)}.`,
      pagesSummer: true,
    });
  }

  return { channel, stages, mismatches, desktopRelevantSincePublished };
}

/**
 * @param {StageReceiptInput | null | undefined} stage
 * @returns {StageReceipt}
 */
function normalizeStage(stage) {
  if (!stage || typeof stage !== 'object') {
    return { status: 'unknown', reason: 'stage receipt absent' };
  }
  if (!['known', 'unknown', 'missing'].includes(stage.status)) {
    return { status: 'unknown', reason: 'stage status invalid' };
  }
  return {
    status: /** @type {StageReceipt['status']} */ (stage.status),
    sourceRevision: stage.sourceRevision ?? null,
    version: stage.version ?? null,
    at: stage.at ?? null,
    verified: stage.verified === true,
    reason: stage.reason ?? null,
  };
}

/**
 * Build the durable receipt Summer/Ovi can read.
 * @param {{
 *   readonly generatedAt?: string;
 *   readonly channels: ReadonlyArray<ChannelGraph>;
 * }} input
 */
export function buildArtifactFreshnessReceipt(input) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const mismatches = input.channels.flatMap(channel =>
    channel.mismatches.map(mismatch => ({
      channel: channel.channel,
      ...mismatch,
    }))
  );
  return {
    schema: ARTIFACT_FRESHNESS_SCHEMA,
    generatedAt,
    channels: input.channels,
    red: mismatches.some(m => m.pagesSummer),
    pageSummer: mismatches.filter(m => m.pagesSummer),
  };
}

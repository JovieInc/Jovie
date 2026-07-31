/**
 * Per-channel packaging correlations (face / text / topic / length).
 *
 * Groups rankable videos by packaging attributes and compares mean
 * watch_minutes_per_impression. Pure — learning-layer annotations are merged
 * by the report builder.
 */

import {
  durationBucket,
  isRankable,
  meanWatchMinutesPerImpression,
  titleLengthBucket,
  watchMinutesPerImpression,
} from './metrics';
import type {
  ChannelVideoMetrics,
  ChannelWinSignal,
  CorrelationDimension,
  CorrelationGroup,
  LearningLayerWinAnnotation,
  MetricSource,
} from './types';

/** Minimum videos per group before we surface a correlation. */
export const MIN_GROUP_SAMPLE = 3;

/** Absolute lift vs channel mean required to call a “win” signal. */
export const MIN_LIFT_ABS = 0.08;

function groupMean(videos: readonly ChannelVideoMetrics[]): number {
  if (videos.length === 0) return 0;
  const sum = videos.reduce((acc, v) => acc + watchMinutesPerImpression(v), 0);
  return sum / videos.length;
}

function confidenceFromSample(
  sampleSize: number
): ChannelWinSignal['confidence'] {
  if (sampleSize >= 20) return 'high';
  if (sampleSize >= 8) return 'medium';
  return 'low';
}

function buildGroup(
  dimension: CorrelationDimension,
  key: string,
  label: string,
  videos: readonly ChannelVideoMetrics[],
  channelMean: number
): CorrelationGroup | null {
  if (videos.length < MIN_GROUP_SAMPLE) return null;
  const mean = groupMean(videos);
  const lift =
    channelMean > 0 ? (mean - channelMean) / channelMean : mean > 0 ? 1 : 0;
  return {
    key,
    dimension,
    label,
    sampleSize: videos.length,
    meanWatchMinutesPerImpression: mean,
    liftVsChannelMean: lift,
  };
}

function partitionByBoolean(
  videos: readonly ChannelVideoMetrics[],
  pick: (v: ChannelVideoMetrics) => boolean | null,
  dimension: CorrelationDimension,
  trueLabel: string,
  falseLabel: string,
  channelMean: number
): CorrelationGroup[] {
  const yes: ChannelVideoMetrics[] = [];
  const no: ChannelVideoMetrics[] = [];
  for (const video of videos) {
    const value = pick(video);
    if (value === true) yes.push(video);
    else if (value === false) no.push(video);
  }
  return [
    buildGroup(dimension, `${dimension}:true`, trueLabel, yes, channelMean),
    buildGroup(dimension, `${dimension}:false`, falseLabel, no, channelMean),
  ].filter((g): g is CorrelationGroup => g !== null);
}

function partitionByKey(
  videos: readonly ChannelVideoMetrics[],
  pick: (v: ChannelVideoMetrics) => string | null,
  dimension: CorrelationDimension,
  labelFor: (key: string) => string,
  channelMean: number
): CorrelationGroup[] {
  const buckets = new Map<string, ChannelVideoMetrics[]>();
  for (const video of videos) {
    const key = pick(video);
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(video);
    else buckets.set(key, [video]);
  }
  const groups: CorrelationGroup[] = [];
  for (const [key, list] of buckets) {
    const group = buildGroup(
      dimension,
      `${dimension}:${key}`,
      labelFor(key),
      list,
      channelMean
    );
    if (group) groups.push(group);
  }
  return groups;
}

function signalFromGroups(
  dimension: CorrelationDimension,
  groups: readonly CorrelationGroup[],
  source: MetricSource
): ChannelWinSignal | null {
  if (groups.length < 2) {
    // Single group with strong positive lift can still be informative
    const only = groups[0];
    if (!only || Math.abs(only.liftVsChannelMean) < MIN_LIFT_ABS) return null;
    return {
      dimension,
      summary: `${only.label} averages ${only.meanWatchMinutesPerImpression.toFixed(3)} watch-min/impression (${formatLift(only.liftVsChannelMean)} vs channel mean).`,
      winningLabel: only.liftVsChannelMean > 0 ? only.label : null,
      losingLabel: only.liftVsChannelMean < 0 ? only.label : null,
      liftPercent: only.liftVsChannelMean * 100,
      sampleSize: only.sampleSize,
      confidence: confidenceFromSample(only.sampleSize),
      groups,
      source,
    };
  }

  const sorted = groups
    .slice()
    .sort(
      (a, b) =>
        b.meanWatchMinutesPerImpression - a.meanWatchMinutesPerImpression
    );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (!best || !worst || best.key === worst.key) return null;

  const relativeLift =
    worst.meanWatchMinutesPerImpression > 0
      ? (best.meanWatchMinutesPerImpression -
          worst.meanWatchMinutesPerImpression) /
        worst.meanWatchMinutesPerImpression
      : best.meanWatchMinutesPerImpression > 0
        ? 1
        : 0;

  if (
    relativeLift < MIN_LIFT_ABS &&
    Math.abs(best.liftVsChannelMean) < MIN_LIFT_ABS
  ) {
    return null;
  }

  return {
    dimension,
    summary: `${best.label} outperforms ${worst.label} on watch-min/impression (${formatLift(relativeLift)} relative lift).`,
    winningLabel: best.label,
    losingLabel: worst.label,
    liftPercent: relativeLift * 100,
    sampleSize: best.sampleSize + worst.sampleSize,
    confidence: confidenceFromSample(best.sampleSize + worst.sampleSize),
    groups: sorted,
    source,
  };
}

function formatLift(lift: number): string {
  const pct = Math.abs(lift * 100).toFixed(0);
  if (lift > 0) return `+${pct}%`;
  if (lift < 0) return `−${pct}%`;
  return '0%';
}

function reportingSource(metricKeys: readonly string[]): MetricSource {
  return {
    kind: 'youtube_reporting_api',
    label: 'YouTube Reporting API',
    metricKeys,
  };
}

/**
 * Compute channel win signals from packaging attributes on ranked videos.
 */
export function computeChannelCorrelations(
  videos: readonly ChannelVideoMetrics[]
): ChannelWinSignal[] {
  const rankable = videos.filter(isRankable);
  if (rankable.length < MIN_GROUP_SAMPLE * 2) return [];

  const channelMean = meanWatchMinutesPerImpression(rankable);
  const signals: ChannelWinSignal[] = [];
  const source = reportingSource([
    'watch_minutes_per_impression',
    'impressions',
    'watch_minutes',
  ]);

  const faceGroups = partitionByBoolean(
    rankable,
    v => v.hasFace,
    'face',
    'Face in thumbnail',
    'No face in thumbnail',
    channelMean
  );
  const faceSignal = signalFromGroups('face', faceGroups, source);
  if (faceSignal) signals.push(faceSignal);

  const textGroups = partitionByBoolean(
    rankable,
    v => v.hasText,
    'text',
    'Text on thumbnail',
    'No text on thumbnail',
    channelMean
  );
  const textSignal = signalFromGroups('text', textGroups, source);
  if (textSignal) signals.push(textSignal);

  const topicGroups = partitionByKey(
    rankable,
    v => (v.topic?.trim() ? v.topic.trim().toLowerCase() : null),
    'topic',
    key => `Topic: ${key}`,
    channelMean
  );
  const topicSignal = signalFromGroups('topic', topicGroups, source);
  if (topicSignal) signals.push(topicSignal);

  const titleGroups = partitionByKey(
    rankable,
    v => titleLengthBucket(v.titleWordCount),
    'title_length',
    key => `Title length: ${key}`,
    channelMean
  );
  const titleSignal = signalFromGroups('title_length', titleGroups, source);
  if (titleSignal) signals.push(titleSignal);

  const durationGroups = partitionByKey(
    rankable,
    v => durationBucket(v.durationSeconds),
    'duration',
    key => `Video length: ${key}`,
    channelMean
  );
  const durationSignal = signalFromGroups('duration', durationGroups, source);
  if (durationSignal) signals.push(durationSignal);

  return signals.sort(
    (a, b) => Math.abs(b.liftPercent) - Math.abs(a.liftPercent)
  );
}

/**
 * Merge learning-layer (experiment) annotations into win signals when the
 * observed sample is strong enough. Annotations supplement, not replace,
 * metric-derived correlations.
 */
export function mergeLearningLayerAnnotations(
  signals: readonly ChannelWinSignal[],
  annotations: readonly LearningLayerWinAnnotation[] | undefined
): ChannelWinSignal[] {
  if (!annotations?.length) return [...signals];

  const byDimension = new Map(signals.map(s => [s.dimension, s]));
  const merged: ChannelWinSignal[] = [...signals];

  for (const annotation of annotations) {
    if (annotation.source !== 'observed') continue;
    if (annotation.sampleSize < 50 || annotation.confidence < 0.8) continue;

    const existing = byDimension.get(annotation.dimension);
    const learningSource: MetricSource = {
      kind: 'learning_layer',
      label: 'Channel packaging learning layer',
      metricKeys: ['experiment_lift', annotation.dimension],
    };

    if (existing) {
      // Annotate existing metric correlation with learning-layer evidence
      const idx = merged.findIndex(s => s.dimension === annotation.dimension);
      if (idx >= 0) {
        merged[idx] = {
          ...existing,
          summary: `${existing.summary} Learning layer: ${annotation.summary}`,
          source: {
            kind: 'learning_layer',
            label: `${existing.source.label} + learning layer`,
            metricKeys: [
              ...existing.source.metricKeys,
              ...learningSource.metricKeys,
            ],
          },
        };
      }
    } else {
      merged.push({
        dimension: annotation.dimension,
        summary: annotation.summary,
        winningLabel: null,
        losingLabel: null,
        liftPercent: annotation.liftPercent,
        sampleSize: annotation.sampleSize,
        confidence:
          annotation.confidence >= 0.95
            ? 'high'
            : annotation.confidence >= 0.85
              ? 'medium'
              : 'low',
        groups: [],
        source: learningSource,
      });
    }
  }

  return merged;
}

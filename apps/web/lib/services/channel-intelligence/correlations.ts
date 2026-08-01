/**
 * Per-channel packaging correlations (JOV-3193).
 *
 * Surfaces what correlates with wins on THIS channel:
 * face vs no-face, text vs none, topic, length.
 *
 * Optional learning-layer rules (channel-rules) are merged as high-confidence
 * findings when they override global priors.
 */

import type {
  ChannelPackagingRules,
  PackagingDimension,
} from '@/lib/services/packaging-intelligence/channel-rules';
import {
  CONFIDENCE_THRESHOLD,
  MIN_SAMPLE_SIZE,
} from '@/lib/services/packaging-intelligence/channel-rules';
import {
  isEligibleForRank,
  lengthBucket,
  lengthBucketLabel,
  watchMinutesPerImpression,
} from './metrics';
import type {
  ChannelVideoMetrics,
  CorrelationDimension,
  CorrelationFinding,
  MetricSource,
} from './types';

/** Min videos per segment before emitting a correlation finding. */
export const MIN_SEGMENT_SAMPLE = 3;

interface SegmentAgg {
  readonly dimension: CorrelationDimension;
  readonly segmentKey: string;
  readonly segment: string;
  readonly wmpiSum: number;
  readonly sampleSize: number;
  readonly videoIds: string[];
}

function confidenceFromSample(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 20) return 'high';
  if (sampleSize >= 8) return 'medium';
  return 'low';
}

function segmentForFace(hasFace: boolean | null): {
  key: string;
  label: string;
} | null {
  if (hasFace === null) return null;
  return hasFace
    ? { key: 'face:yes', label: 'Face' }
    : { key: 'face:no', label: 'No face' };
}

function segmentForText(hasText: boolean | null): {
  key: string;
  label: string;
} | null {
  if (hasText === null) return null;
  return hasText
    ? { key: 'text:yes', label: 'Text overlay' }
    : { key: 'text:no', label: 'No text' };
}

function segmentForTopic(topic: string | null): {
  key: string;
  label: string;
} | null {
  if (!topic?.trim()) return null;
  const normalized = topic.trim().toLowerCase();
  return {
    key: `topic:${normalized}`,
    label: `Topic: ${topic.trim()}`,
  };
}

function segmentForLength(durationSeconds: number | null): {
  key: string;
  label: string;
} | null {
  const bucket = lengthBucket(durationSeconds);
  if (!bucket) return null;
  return {
    key: `length:${bucket}`,
    label: lengthBucketLabel(bucket),
  };
}

function accumulate(
  map: Map<string, SegmentAgg>,
  dimension: CorrelationDimension,
  seg: { key: string; label: string } | null,
  wmpi: number,
  videoId: string
): void {
  if (!seg) return;
  const existing = map.get(seg.key);
  if (existing) {
    map.set(seg.key, {
      ...existing,
      wmpiSum: existing.wmpiSum + wmpi,
      sampleSize: existing.sampleSize + 1,
      videoIds: [...existing.videoIds, videoId],
    });
  } else {
    map.set(seg.key, {
      dimension,
      segmentKey: seg.key,
      segment: seg.label,
      wmpiSum: wmpi,
      sampleSize: 1,
      videoIds: [videoId],
    });
  }
}

function toFinding(
  agg: SegmentAgg,
  channelMean: number
): CorrelationFinding | null {
  if (agg.sampleSize < MIN_SEGMENT_SAMPLE) return null;
  const avg = agg.wmpiSum / agg.sampleSize;
  const liftVsChannel = channelMean > 0 ? (avg - channelMean) / channelMean : 0;
  const sources: MetricSource[] = [
    {
      kind: 'youtube_reporting_api',
      label: 'YouTube Reporting API',
      videoIds: agg.videoIds,
      detail: `Segment mean WMPI across ${agg.sampleSize} videos`,
    },
    {
      kind: 'derived',
      label: 'Channel correlation',
      detail: `liftVsChannel = (segmentMean − channelMean) / channelMean`,
    },
  ];

  return {
    dimension: agg.dimension,
    segment: agg.segment,
    segmentKey: agg.segmentKey,
    avgWatchMinutesPerImpression: avg,
    sampleSize: agg.sampleSize,
    liftVsChannel,
    confidence: confidenceFromSample(agg.sampleSize),
    sources,
  };
}

/**
 * Computes face / text / topic / length correlations against channel mean WMPI.
 * Returns findings sorted by absolute lift descending (strongest signals first).
 */
export function computeChannelCorrelations(
  videos: readonly ChannelVideoMetrics[]
): {
  readonly findings: CorrelationFinding[];
  readonly channelMeanWmpi: number;
} {
  const eligible = videos.filter(isEligibleForRank);
  if (eligible.length === 0) {
    return { findings: [], channelMeanWmpi: 0 };
  }

  const wmpiValues = eligible.map(watchMinutesPerImpression);
  const channelMean = wmpiValues.reduce((a, b) => a + b, 0) / wmpiValues.length;

  const segments = new Map<string, SegmentAgg>();
  for (const v of eligible) {
    const wmpi = watchMinutesPerImpression(v);
    accumulate(segments, 'face', segmentForFace(v.hasFace), wmpi, v.videoId);
    accumulate(segments, 'text', segmentForText(v.hasText), wmpi, v.videoId);
    accumulate(segments, 'topic', segmentForTopic(v.topic), wmpi, v.videoId);
    accumulate(
      segments,
      'length',
      segmentForLength(v.durationSeconds),
      wmpi,
      v.videoId
    );
  }

  const findings = [...segments.values()]
    .map(agg => toFinding(agg, channelMean))
    .filter((f): f is CorrelationFinding => f !== null)
    .sort((a, b) => Math.abs(b.liftVsChannel) - Math.abs(a.liftVsChannel));

  return { findings, channelMeanWmpi: channelMean };
}

const DIMENSION_LABEL: Record<PackagingDimension, string> = {
  face: 'Face',
  text: 'Text overlay',
  titleLength: 'Title length',
};

/**
 * Merges learning-layer channel rules into correlation findings when they
 * meet the observed-override threshold (sample + confidence).
 */
export function findingsFromLearningLayer(
  rules: ChannelPackagingRules | null | undefined
): CorrelationFinding[] {
  if (!rules) return [];

  const out: CorrelationFinding[] = [];
  for (const dim of ['face', 'text', 'titleLength'] as const) {
    const rule = rules.dimensions[dim];
    if (!rule) continue;
    if (
      rule.sampleSize < MIN_SAMPLE_SIZE ||
      rule.confidence < CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    const dimension: CorrelationDimension =
      dim === 'titleLength' ? 'length' : dim;
    const direction =
      rule.liftDirection === 'positive'
        ? 'helps'
        : rule.liftDirection === 'negative'
          ? 'hurts'
          : 'neutral';
    const segment =
      dim === 'titleLength'
        ? `Title length (${direction})`
        : `${DIMENSION_LABEL[dim]} (${direction})`;

    out.push({
      dimension,
      segment,
      segmentKey: `learning:${dim}:${rule.liftDirection}`,
      avgWatchMinutesPerImpression: 0,
      sampleSize: rule.sampleSize,
      // liftPercent is percentage points; normalize to fraction for consistency
      liftVsChannel: rule.liftPercent / 100,
      confidence:
        rule.confidence >= 0.9
          ? 'high'
          : rule.confidence >= 0.8
            ? 'medium'
            : 'low',
      sources: [
        {
          kind: 'learning_layer',
          label: 'Channel packaging rules',
          detail: `Observed ${dim} lift from ${rule.sampleSize} experiment impressions (confidence ${(rule.confidence * 100).toFixed(0)}%)`,
        },
      ],
    });
  }

  return out;
}

/** Positive-lift findings (what works), strongest first. */
export function selectWhatWorks(
  findings: readonly CorrelationFinding[],
  limit = 5
): CorrelationFinding[] {
  return findings
    .filter(f => f.liftVsChannel > 0)
    .sort((a, b) => b.liftVsChannel - a.liftVsChannel)
    .slice(0, limit);
}

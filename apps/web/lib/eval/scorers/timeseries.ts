/**
 * Time-series aggregation + anomaly detection for online scorer trends.
 */

import { smoothRubricScore } from './rubric';
import type {
  ScoreAnomaly,
  ScoreObservation,
  ScorerCriterion,
  ScoreTimeSeriesBucket,
  TimeSeriesGranularity,
} from './types';

export const DEFAULT_ANOMALY_DROP_THRESHOLD = 0.75;
export const DEFAULT_ANOMALY_CONSECUTIVE_BUCKETS = 2;

function floorToBucket(
  timestamp: string,
  granularity: TimeSeriesGranularity
): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  if (granularity === 'daily') {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    ).toISOString();
  }

  if (granularity === 'six-hourly') {
    const hour = Math.floor(date.getUTCHours() / 6) * 6;
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        hour
      )
    ).toISOString();
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    )
  ).toISOString();
}

export function aggregateScoreObservations(
  observations: readonly ScoreObservation[],
  granularity: TimeSeriesGranularity
): ScoreTimeSeriesBucket[] {
  const grouped = new Map<
    string,
    { criterion: ScorerCriterion; scores: number[] }
  >();

  for (const observation of observations) {
    const bucketStart = floorToBucket(observation.timestamp, granularity);
    const key = `${observation.criterion}:${bucketStart}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.scores.push(observation.score);
    } else {
      grouped.set(key, {
        criterion: observation.criterion,
        scores: [observation.score],
      });
    }
  }

  const buckets: ScoreTimeSeriesBucket[] = [];
  for (const [key, value] of grouped.entries()) {
    const bucketStart = key.split(':').slice(1).join(':');
    const mean =
      value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length;
    buckets.push({
      granularity,
      bucketStart,
      criterion: value.criterion,
      count: value.scores.length,
      mean,
      smoothedMean: mean,
    });
  }

  return buckets.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export function applyBucketSmoothing(
  buckets: readonly ScoreTimeSeriesBucket[]
): ScoreTimeSeriesBucket[] {
  const byCriterion = new Map<ScorerCriterion, ScoreTimeSeriesBucket[]>();

  for (const bucket of buckets) {
    const list = byCriterion.get(bucket.criterion) ?? [];
    list.push(bucket);
    byCriterion.set(bucket.criterion, list);
  }

  const smoothed: ScoreTimeSeriesBucket[] = [];

  for (const criterionBuckets of byCriterion.values()) {
    criterionBuckets.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
    let previous: number | undefined;

    for (const bucket of criterionBuckets) {
      const smoothedMean = smoothRubricScore(previous, bucket.mean);
      previous = smoothedMean;
      smoothed.push({ ...bucket, smoothedMean });
    }
  }

  return smoothed.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export function detectScoreAnomalies(
  buckets: readonly ScoreTimeSeriesBucket[],
  options: {
    readonly dropThreshold?: number;
    readonly consecutiveBuckets?: number;
  } = {}
): ScoreAnomaly[] {
  const dropThreshold = options.dropThreshold ?? DEFAULT_ANOMALY_DROP_THRESHOLD;
  const consecutiveBuckets =
    options.consecutiveBuckets ?? DEFAULT_ANOMALY_CONSECUTIVE_BUCKETS;

  const byCriterion = new Map<ScorerCriterion, ScoreTimeSeriesBucket[]>();
  for (const bucket of buckets) {
    const list = byCriterion.get(bucket.criterion) ?? [];
    list.push(bucket);
    byCriterion.set(bucket.criterion, list);
  }

  const anomalies: ScoreAnomaly[] = [];

  for (const [criterion, criterionBuckets] of byCriterion.entries()) {
    const sorted = [...criterionBuckets].sort((a, b) =>
      a.bucketStart.localeCompare(b.bucketStart)
    );

    if (sorted.length <= consecutiveBuckets) continue;

    const baseline = sorted.slice(0, -consecutiveBuckets);
    const baselineMean =
      baseline.reduce((sum, bucket) => sum + bucket.smoothedMean, 0) /
      baseline.length;

    const recent = sorted.slice(-consecutiveBuckets);
    const allBelowThreshold = recent.every(
      bucket => bucket.smoothedMean < baselineMean - dropThreshold
    );

    if (allBelowThreshold) {
      anomalies.push({
        criterion,
        granularity: recent[0]?.granularity ?? 'hourly',
        bucketStart: recent[0]?.bucketStart ?? '',
        currentMean: recent[recent.length - 1]?.smoothedMean ?? 0,
        baselineMean,
        consecutiveBuckets,
      });
    }
  }

  return anomalies;
}

export function toScoreObservations(
  results: readonly { criterion: ScorerCriterion; score: number }[],
  traceId: string,
  timestamp: string
): ScoreObservation[] {
  return results.map(result => ({
    criterion: result.criterion,
    score: result.score,
    timestamp,
    traceId,
  }));
}

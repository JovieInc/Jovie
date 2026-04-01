import type {
  SubmissionIssueDraft,
  SubmissionMonitoringBaseline,
} from '../types';

function normalize(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

export function diffSubmissionMonitoringData(
  baseline: SubmissionMonitoringBaseline,
  live: SubmissionMonitoringBaseline
): SubmissionIssueDraft[] {
  const issues: SubmissionIssueDraft[] = [];

  const deterministicStringFields: Array<
    'releaseTitle' | 'releaseDate' | 'upc'
  > = ['releaseTitle', 'releaseDate', 'upc'];

  for (const field of deterministicStringFields) {
    const expected = normalize(
      typeof baseline[field] === 'string'
        ? (baseline[field] as string | null)
        : null
    );
    const observed = normalize(
      typeof live[field] === 'string' ? (live[field] as string | null) : null
    );

    if (!expected) {
      continue;
    }

    if (observed !== expected) {
      issues.push({
        field,
        issueType: 'mismatch',
        severity: 'high',
        expectedValue: expected,
        observedValue: observed,
      });
    }
  }

  if (
    typeof baseline.trackCount === 'number' &&
    typeof live.trackCount === 'number' &&
    baseline.trackCount !== live.trackCount
  ) {
    issues.push({
      field: 'trackCount',
      issueType: 'mismatch',
      severity: 'high',
      expectedValue: String(baseline.trackCount),
      observedValue: String(live.trackCount),
    });
  }

  if (baseline.hasCredits === true && live.hasCredits === false) {
    issues.push({
      field: 'credits',
      issueType: 'mismatch',
      severity: 'high',
      expectedValue: 'present',
      observedValue: 'missing',
    });
  }

  if (baseline.hasArtwork === true && live.hasArtwork === false) {
    issues.push({
      field: 'artwork',
      issueType: 'mismatch',
      severity: 'high',
      expectedValue: 'present',
      observedValue: 'missing',
    });
  }

  if (baseline.hasBio === true && live.hasBio === false) {
    issues.push({
      field: 'bio',
      issueType: 'review_required',
      severity: 'medium',
      expectedValue: 'present',
      observedValue: 'missing',
    });
  }

  if (baseline.hasArtistImage === true && live.hasArtistImage === false) {
    issues.push({
      field: 'artistImage',
      issueType: 'review_required',
      severity: 'medium',
      expectedValue: 'present',
      observedValue: 'missing',
    });
  }

  return issues;
}

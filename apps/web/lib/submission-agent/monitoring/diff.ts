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

type DeterministicStringField = 'releaseTitle' | 'releaseDate' | 'upc';

function checkDeterministicStringField(
  baseline: SubmissionMonitoringBaseline,
  live: SubmissionMonitoringBaseline,
  field: DeterministicStringField
): SubmissionIssueDraft | null {
  const expected = normalize(
    typeof baseline[field] === 'string'
      ? (baseline[field] as string | null)
      : null
  );
  if (!expected) {
    return null;
  }

  const observed = normalize(
    typeof live[field] === 'string' ? (live[field] as string | null) : null
  );
  if (observed === expected) {
    return null;
  }

  return {
    field,
    issueType: 'mismatch',
    severity: 'high',
    expectedValue: expected,
    observedValue: observed,
  };
}

function checkNumericTrackCount(
  baseline: SubmissionMonitoringBaseline,
  live: SubmissionMonitoringBaseline
): SubmissionIssueDraft | null {
  if (typeof baseline.trackCount !== 'number') {
    return null;
  }

  const liveTrackCount =
    typeof live.trackCount === 'number' ? live.trackCount : null;
  if (liveTrackCount !== null && baseline.trackCount === liveTrackCount) {
    return null;
  }

  return {
    field: 'trackCount',
    issueType: 'mismatch',
    severity: 'high',
    expectedValue: String(baseline.trackCount),
    observedValue: liveTrackCount === null ? null : String(liveTrackCount),
  };
}

function checkPresenceFlag(params: {
  baselineValue: boolean | undefined;
  liveValue: boolean | undefined;
  field: string;
  issueType: SubmissionIssueDraft['issueType'];
  severity: SubmissionIssueDraft['severity'];
}): SubmissionIssueDraft | null {
  if (!(params.baselineValue === true && params.liveValue === false)) {
    return null;
  }

  return {
    field: params.field,
    issueType: params.issueType,
    severity: params.severity,
    expectedValue: 'present',
    observedValue: 'missing',
  };
}

export function diffSubmissionMonitoringData(
  baseline: SubmissionMonitoringBaseline,
  live: SubmissionMonitoringBaseline
): SubmissionIssueDraft[] {
  const issues: SubmissionIssueDraft[] = [];

  for (const field of ['releaseTitle', 'releaseDate', 'upc'] as const) {
    const issue = checkDeterministicStringField(baseline, live, field);
    if (issue) {
      issues.push(issue);
    }
  }

  const trackCountIssue = checkNumericTrackCount(baseline, live);
  if (trackCountIssue) {
    issues.push(trackCountIssue);
  }

  for (const issue of [
    checkPresenceFlag({
      baselineValue: baseline.hasCredits,
      liveValue: live.hasCredits,
      field: 'credits',
      issueType: 'mismatch',
      severity: 'high',
    }),
    checkPresenceFlag({
      baselineValue: baseline.hasArtwork,
      liveValue: live.hasArtwork,
      field: 'artwork',
      issueType: 'mismatch',
      severity: 'high',
    }),
    checkPresenceFlag({
      baselineValue: baseline.hasBio,
      liveValue: live.hasBio,
      field: 'bio',
      issueType: 'review_required',
      severity: 'medium',
    }),
    checkPresenceFlag({
      baselineValue: baseline.hasArtistImage,
      liveValue: live.hasArtistImage,
      field: 'artistImage',
      issueType: 'review_required',
      severity: 'medium',
    }),
  ]) {
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

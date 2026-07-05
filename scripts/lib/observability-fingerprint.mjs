import { createHash } from 'node:crypto';

const FINGERPRINT_PREFIX = 'obs-fp';

/**
 * Stable fingerprint for observability reports.
 * Same crash signature from any client maps to one GitHub issue.
 */
export function fingerprintObservabilityReport(report) {
  const platform = normalizePart(report.platform);
  const kind = normalizePart(report.kind);
  const title = normalizePart(report.title);
  const message = normalizePart(report.message);
  const release = normalizePart(report.release);
  const stacktrace = normalizeStacktrace(report.stacktrace);

  const canonical = [platform, kind, title, message, release, stacktrace].join(
    '\n'
  );
  const digest = createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 16);

  return `${FINGERPRINT_PREFIX}-${digest}`;
}

export function observabilityFingerprintLabel(fingerprint) {
  return `observability-fingerprint:${fingerprint}`;
}

export function parseOccurrenceCount(body) {
  const match = body.match(/<!--\s*observability-occurrences:(\d+)\s*-->/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function withOccurrenceCount(body, count) {
  const withoutMarker = body.replace(
    /<!--\s*observability-occurrences:\d+\s*-->\n?/,
    ''
  );
  return `<!-- observability-occurrences:${count} -->\n${withoutMarker.trimStart()}`;
}

function normalizePart(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function normalizeStacktrace(stacktrace) {
  if (typeof stacktrace !== 'string' || stacktrace.trim().length === 0) {
    return '';
  }

  return stacktrace
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join('\n');
}

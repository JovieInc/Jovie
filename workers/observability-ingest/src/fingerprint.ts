import type { ObservabilityReport } from './report';

const FINGERPRINT_PREFIX = 'obs-fp';

export async function fingerprintObservabilityReport(
  report: ObservabilityReport
): Promise<string> {
  const canonical = [
    normalizePart(report.platform),
    normalizePart(report.kind),
    normalizePart(report.title),
    normalizePart(report.message),
    normalizePart(report.release),
    normalizeStacktrace(report.stacktrace),
  ].join('\n');

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );

  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  return `${FINGERPRINT_PREFIX}-${hex.slice(0, 16)}`;
}

function normalizePart(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeStacktrace(stacktrace: string | undefined): string {
  if (!stacktrace?.trim()) {
    return '';
  }

  return stacktrace
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join('\n');
}

import {
  fingerprintObservabilityReport,
  observabilityFingerprintLabel,
  parseOccurrenceCount,
  withOccurrenceCount,
} from './lib/observability-fingerprint.mjs';

const DEFAULT_LABELS = ['observability', 'automated', 'codex'];

export function buildObservabilityIssuePayload(report, occurrenceDelta = 1) {
  const fingerprint = fingerprintObservabilityReport(report);
  const fingerprintLabel = observabilityFingerprintLabel(fingerprint);
  const title = `[${report.platform}] ${report.kind}: ${report.title}`.slice(
    0,
    240
  );

  const body = withOccurrenceCount(
    [
      '## Observability report',
      '',
      `- **Platform:** ${report.platform}`,
      `- **Kind:** ${report.kind}`,
      `- **Release:** ${report.release}`,
      `- **Environment:** ${report.environment ?? 'unknown'}`,
      `- **Fingerprint:** \`${fingerprint}\``,
      '',
      '### Message',
      '',
      report.message?.trim() || '_No message provided._',
      '',
      '### Stack trace',
      '',
      '```',
      report.stacktrace?.trim() || 'No stack trace provided.',
      '```',
    ].join('\n'),
    Math.max(1, occurrenceDelta)
  );

  return {
    fingerprint,
    fingerprintLabel,
    title,
    body,
    labels: [...DEFAULT_LABELS, fingerprintLabel],
    occurrenceDelta: Math.max(1, occurrenceDelta),
  };
}

export function mergeObservabilityIssue(existingIssue, occurrenceDelta) {
  const nextCount =
    parseOccurrenceCount(existingIssue.body ?? '') + occurrenceDelta;

  return {
    number: existingIssue.number,
    body: withOccurrenceCount(existingIssue.body ?? '', nextCount),
    occurrenceCount: nextCount,
  };
}

export function shouldDispatchObservabilityReport({
  lastDispatchedAt,
  now = Date.now(),
  cooldownMs = 60_000,
}) {
  if (!lastDispatchedAt) {
    return true;
  }

  return now - lastDispatchedAt >= cooldownMs;
}

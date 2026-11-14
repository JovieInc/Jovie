/** Shared exception metadata and calendar-date validation. */
const LINEAR_ISSUE = /^JOV-\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function expiryMs(expiresOn) {
  if (typeof expiresOn !== 'string' || !ISO_DATE.test(expiresOn)) return NaN;
  const expiry = Date.parse(`${expiresOn}T23:59:59.999Z`);
  return Number.isFinite(expiry) &&
    new Date(expiry).toISOString().slice(0, 10) === expiresOn
    ? expiry
    : NaN;
}

export function exceptionMetadataIssues(entry, prefix) {
  /** @type {string[]} */
  const issues = [];
  if (typeof entry?.owner !== 'string' || entry.owner.trim() === '') {
    issues.push(`${prefix}: owner is required`);
  }
  if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 10) {
    issues.push(`${prefix}: reason is required`);
  }
  if (!LINEAR_ISSUE.test(entry?.issue ?? '')) {
    issues.push(`${prefix}: Linear issue is required (JOV-NNNN)`);
  }
  const hasRemoval =
    typeof entry?.removalCondition === 'string' &&
    entry.removalCondition.trim() !== '';
  const hasExpiry = Number.isFinite(expiryMs(entry?.expiresOn));
  if (entry?.expiresOn !== undefined && entry.expiresOn !== '' && !hasExpiry) {
    issues.push(`${prefix}: expiresOn must be a valid date (YYYY-MM-DD)`);
  }
  if (!hasRemoval && !hasExpiry) {
    issues.push(`${prefix}: removal condition or expiry is required`);
  }
  if (typeof entry?.evidence !== 'string' || entry.evidence.trim() === '') {
    issues.push(`${prefix}: evidence is required`);
  }
  return issues;
}

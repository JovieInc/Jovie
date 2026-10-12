import { familyOf, isDependency, isSecret, REPO_SLUG } from './fingerprint.mjs';

export function bucket(finding) {
  if (isSecret(finding)) return 'secret-human';
  if (isDependency(finding)) return 'dependency-ledger';
  if (['critical', 'high'].includes(finding?.severity)) return 'issue';
  if (finding?.severity === 'medium') {
    const repo = REPO_SLUG[finding?.repo] ?? 'unknown';
    return `group:sec-${repo}-${familyOf(finding)}-grp`;
  }
  return 'ledger';
}

export function pageWorthy(finding, context = {}) {
  if (!context.baselineDone) return false;
  if (finding?.severity === 'critical') return true;
  if (isSecret(finding) && finding?.validated === true) return true;
  if (finding?.severity !== 'high' || finding?.validated !== true) return false;
  const file = String(finding.file ?? '');
  const text = `${file} ${finding.rule_id ?? ''} ${finding.title ?? ''}`;
  return (
    /(?:^|\/)(?:auth|authz|authorization|billing|stripe|tenant|webhooks?)(?:\/|$)/i.test(
      file
    ) || /ssrf|tenant|authz|authorization|billing|webhook/i.test(text)
  );
}

import { classOf, isDependency, isSecret, REPO_SLUG } from './fingerprint.mjs';

const PAGE_PATH =
  /(?:^|\/)(auth|authz|authori[sz]ation|billing|stripe|webhook|webhooks|tenant)(?:\/|$)/i;
const PAGE_TEXT = /ssrf|tenant|authz|authorization|billing|webhook/i;

/**
 * @param {{ repo?: string, severity?: string, source?: string, cwe?: number[], rule_id?: string | null, package?: string | null, kind?: string | null }} finding
 * @returns {'issue' | 'ledger' | 'dependency-ledger' | 'secret-human' | `group:${string}`}
 */
export function bucket(finding) {
  if (isSecret(finding)) return 'secret-human';
  if (isDependency(finding)) return 'dependency-ledger';
  if (finding?.severity === 'critical' || finding?.severity === 'high')
    return 'issue';
  if (finding?.severity === 'medium') {
    const slug = REPO_SLUG[String(finding.repo ?? '')] ?? 'unknown';
    return `group:${slug}-${classOf(finding)}`;
  }
  return 'ledger';
}

/**
 * Page only a new post-baseline critical, a verified secret, or a validated
 * high in auth, authz, tenant isolation, billing, webhooks, or SSRF.
 * @param {{ severity?: string, validated?: boolean, source?: string, cwe?: number[], rule_id?: string | null, file?: string | null, title?: string, package?: string | null, kind?: string | null }} finding
 * @param {{ baselineDone?: boolean }} [context]
 */
export function pageWorthy(finding, context = {}) {
  if (!context.baselineDone) return false;
  if (finding?.severity === 'critical') return true;
  if (isSecret(finding) && finding?.validated === true) return true;
  if (finding?.severity === 'high' && finding?.validated === true) {
    const file = String(finding.file ?? '');
    const text = `${file} ${finding.rule_id ?? ''} ${finding.title ?? ''}`;
    if (PAGE_PATH.test(file) || PAGE_TEXT.test(text)) return true;
  }
  return false;
}

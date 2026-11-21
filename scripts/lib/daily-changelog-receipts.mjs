/**
 * Repo-size budget (docs/ci/repository-health.md): the per-candidate `audit`
 * list in `daily-changelog-receipt/v1` comments was write-only (nothing reads
 * it back; `pending` and `deferred` carry the follow-up ids) yet it re-listed
 * every unpublished PR each day, ~1.2 MB across 17 receipts. Receipts keep
 * `auditCounts` instead; the plan's full `audit` still feeds the writer proof.
 */
import { DAILY_RECEIPT_SCHEMA, insertDailyDigest } from './daily-changelog.mjs';

const RECEIPT_COMMENT_RE =
  /<!--\s*daily-changelog-receipt\/v1\s+(\{[\s\S]*?\})\s*-->/g;

/** Count candidate audit rows by reason, keys sorted for stable receipts. */
export function countAuditReasons(audit = []) {
  const counts = {};
  for (const row of audit) counts[row.reason] = (counts[row.reason] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

/**
 * Replace `audit` with `auditCounts` in every persisted receipt. Other
 * fields, key order and the visible digest lines (which `contentHash`
 * covers) stay untouched; malformed comments are left as-is so
 * `extractDailyReceipts` still fails closed. Idempotent.
 */
export function compactDailyReceipts(markdown) {
  return markdown.replace(RECEIPT_COMMENT_RE, (comment, json) => {
    let receipt;
    try {
      receipt = JSON.parse(json);
    } catch {
      return comment;
    }
    if (!Array.isArray(receipt.audit)) return comment;
    const compacted = {};
    for (const [key, value] of Object.entries(receipt))
      if (key === 'audit') compacted.auditCounts = countAuditReasons(value);
      else compacted[key] = value;
    return `<!-- ${DAILY_RECEIPT_SCHEMA} ${JSON.stringify(compacted)} -->`;
  });
}

/** Insert a digest block after compacting older receipts (see above). */
export function insertCompactedDigest(markdown, block, windowKey) {
  return insertDailyDigest(compactDailyReceipts(markdown), block, windowKey);
}

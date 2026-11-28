/**
 * Pull-record normalization and conflict-hold classification for the Linear
 * merge lifecycle, relocated from linear-sync-on-merge.mjs (JOV-14764) so that
 * module stays inside its shrink-only size budget while the doctor-owned
 * exclusion lands. linear-sync-on-merge.mjs re-exports both, so existing
 * importers keep working.
 *
 * doctorOwnedIssue: issues the lanes doctor filer owns never enter the jov.ie
 * merge lifecycle. Every issue the doctor files carries a `<!-- doctor-key: -->`
 * body marker, and a fix awaiting its host install carries a
 * `<!-- doctor-fix: -->` marker — only the lanes doctor moves them, and their
 * Done is install-gated on the lanes release receipt
 * (scripts/lanes/doctor_release.py), never on a merge (JOV-14764).
 */

/**
 * @param {unknown} pull
 * @returns {{
 *   number: number,
 *   title: string,
 *   body: string,
 *   state: string,
 *   draft: boolean,
 *   headRef: string,
 *   url: string,
 * }}
 */
export function normalizePullRequest(pull) {
  const record =
    pull && typeof pull === 'object'
      ? /** @type {Record<string, unknown>} */ (pull)
      : {};
  const head =
    record.head && typeof record.head === 'object'
      ? /** @type {{ ref?: unknown }} */ (record.head)
      : {};
  const number = Number(record.number);
  return {
    number: Number.isInteger(number) ? number : 0,
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    state: String(record.state ?? '').toLowerCase(),
    draft: record.draft === true || record.isDraft === true,
    headRef:
      typeof head.ref === 'string'
        ? head.ref
        : typeof record.headRef === 'string'
          ? record.headRef
          : typeof record.headRefName === 'string'
            ? record.headRefName
            : '',
    url:
      typeof record.html_url === 'string'
        ? record.html_url
        : typeof record.url === 'string'
          ? record.url
          : '',
  };
}

/**
 * `remediation:pr-<n>-conflict` issues track one pull request that carried a
 * lane-fix hold for over a day. Nothing posts their green marker, so they
 * held Validating forever after the pull request closed or merged (11 of 12
 * on 2026-10-21). The check is resolved when a complete open-PR scan no
 * longer lists that pull request; an incomplete scan proves nothing (null).
 *
 * @param {{ labels?: readonly string[] }} issue
 * @param {{ pulls: readonly object[], complete?: boolean }} openPulls
 * @returns {boolean | null}
 */
export function conflictRemediationResolved(issue, openPulls) {
  const numbers = (issue.labels ?? [])
    .map(label => /^remediation:pr-(\d+)-conflict$/.exec(String(label))?.[1])
    .filter(Boolean)
    .map(Number);
  if (numbers.length === 0) return null;
  if (openPulls?.complete !== true) return null;
  const open = new Set(
    openPulls.pulls.map(pull => normalizePullRequest(pull).number)
  );
  return numbers.every(number => !open.has(number));
}

/**
 * @param {{ description?: unknown }} issue
 * @returns {boolean}
 */
export function doctorOwnedIssue(issue) {
  return /<!-- doctor-(?:key|fix):/.test(String(issue?.description ?? ''));
}

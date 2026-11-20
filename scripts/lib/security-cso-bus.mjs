// Thin Summer fleet-bus consumer for CSO/security work (SEC-13).
// Linear `security` / `area:security` issues and high SARIF alerts become
// investigate packets; close is refused until a fix PR is linked.

import { createHash } from 'node:crypto';

export const INVESTIGATE_MARKER = '<!-- jovie-security-investigate -->';
export const SECURITY_LABELS = Object.freeze(['security', 'area:security']);

const PR_LINK = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/gi;
const SECADV_TITLE = /\[secadv-/i;
const SECURITY_TITLE = /\[security\]/i;

/** @param {string} text */
export function linkedFixPrs(text) {
  return [...new Set(String(text ?? '').match(PR_LINK) ?? [])];
}

/**
 * @param {{ ruleId?: string, tool?: string, path?: string, message?: string, severity?: string }} finding
 */
export function sarifFingerprint(finding) {
  const raw = [
    finding.tool ?? 'sarif',
    finding.ruleId ?? 'unknown',
    finding.path ?? '',
    finding.message ?? '',
  ].join('|');
  return `csarf-${createHash('sha256').update(raw).digest('hex').slice(0, 12)}`;
}

/**
 * Build the investigate packet body Summer/Gem act on.
 * @param {{
 *   kind: string,
 *   fingerprint: string,
 *   title: string,
 *   severity?: string,
 *   evidence?: string,
 *   sourceUrl?: string,
 * }} input
 */
export function buildInvestigatePacket(input) {
  const severity = input.severity ?? 'high';
  return [
    INVESTIGATE_MARKER,
    `schema: jovie.security-investigate/v1`,
    `kind: ${input.kind}`,
    `fingerprint: ${input.fingerprint}`,
    `severity: ${severity}`,
    '',
    '## Investigate',
    input.title,
    '',
    '## Evidence',
    input.evidence?.trim() || '(none)',
    '',
    '## Source',
    input.sourceUrl || '(none)',
    '',
    '## Done',
    '- Link a fix PR in this issue (`https://github.com/.../pull/N`).',
    '- Close only after the fix lands and (for advisories) Production verifies.',
  ].join('\n');
}

/**
 * @param {{ title?: string, description?: string, labels?: Array<string | { name?: string }>, identifier?: string, url?: string }} issue
 */
export function linearSecurityCandidate(issue) {
  const labels = (issue.labels ?? []).map(l =>
    typeof l === 'string' ? l : String(l.name ?? '')
  );
  const title = String(issue.title ?? '');
  const labeled = SECURITY_LABELS.some(name => labels.includes(name));
  const titled = SECADV_TITLE.test(title) || SECURITY_TITLE.test(title);
  if (!labeled && !titled) return null;
  const fingerprint =
    title.match(
      /\(dsec-[0-9a-f]{12}\)|\(csarf-[0-9a-f]{12}\)|\[secadv-[^\]]+\]/i
    )?.[0] ??
    `csec-${createHash('sha256').update(title).digest('hex').slice(0, 12)}`;
  return {
    kind: 'linear-security',
    fingerprint: fingerprint.replace(/[^\w:-]+/g, '').slice(0, 64),
    title,
    identifier: issue.identifier,
    sourceUrl: issue.url,
    evidence: String(issue.description ?? '').slice(0, 2000),
    hasPacket: String(issue.description ?? '').includes(INVESTIGATE_MARKER),
    fixPrs: linkedFixPrs(issue.description),
  };
}

/**
 * High/critical SARIF-style alerts → investigate candidates.
 * @param {{ ruleId?: string, tool?: string, path?: string, message?: string, severity?: string, url?: string }[]} alerts
 */
export function sarifHighCandidates(alerts) {
  return (alerts ?? [])
    .filter(alert => {
      const severity = String(alert.severity ?? '').toLowerCase();
      return (
        severity === 'error' || severity === 'high' || severity === 'critical'
      );
    })
    .map(alert => {
      const fingerprint = sarifFingerprint(alert);
      return {
        kind: 'sarif-high',
        fingerprint,
        title: `[security][${alert.severity ?? 'high'}] ${alert.ruleId ?? 'finding'} (${fingerprint})`,
        severity: alert.severity ?? 'high',
        evidence: [alert.path, alert.message].filter(Boolean).join('\n'),
        sourceUrl: alert.url,
        hasPacket: false,
        fixPrs: [],
      };
    });
}

/**
 * Plan bus actions: ensure investigate packet; block close without fix PR.
 * @param {{
 *   linearIssues?: any[],
 *   sarifAlerts?: any[],
 *   closingIdentifiers?: string[],
 * }} input
 */
export function planCsoBusActions(input) {
  const ensure = [];
  for (const issue of input.linearIssues ?? []) {
    const candidate = linearSecurityCandidate(issue);
    if (!candidate) continue;
    if (!candidate.hasPacket) {
      ensure.push({
        action: 'ensure-investigate-packet',
        ...candidate,
        packet: buildInvestigatePacket(candidate),
      });
    }
  }
  for (const candidate of sarifHighCandidates(input.sarifAlerts)) {
    ensure.push({
      action: 'ensure-investigate-packet',
      ...candidate,
      packet: buildInvestigatePacket(candidate),
    });
  }
  const blockClose = [];
  for (const id of input.closingIdentifiers ?? []) {
    const issue = (input.linearIssues ?? []).find(
      row => row.identifier === id || row.id === id
    );
    const candidate = issue ? linearSecurityCandidate(issue) : null;
    const prs = candidate?.fixPrs ?? linkedFixPrs(issue?.description);
    if (!prs.length) {
      blockClose.push({
        action: 'block-close',
        identifier: id,
        reason: 'security-close-requires-fix-pr-link',
      });
    }
  }
  return { ensure, blockClose };
}

/** Close gate used by intake/consumers before marking Done. */
export function requireFixPrBeforeClose(description) {
  const prs = linkedFixPrs(description);
  if (!prs.length) {
    return {
      ok: false,
      reason: 'security-close-requires-fix-pr-link',
    };
  }
  return { ok: true, prs };
}

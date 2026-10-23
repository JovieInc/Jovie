/**
 * Operator copy for internal diagnostics. The lanes doctor, certification
 * inventory and capacity feed publish machine strings ("failed=45, next
 * retry=None; inspect event-delivery.json", absolute binary paths). Those
 * belong in the details views, not in Home banners or summary rows.
 */

/** Absolute or home-relative filesystem paths, including Windows drives. */
const FILESYSTEM_PATH =
  /(?:~\/|(?<![\w.:/])(?:\/(?:home|Users|root|tmp|var|opt|private|usr|etc|mnt|srv|Library|bin|sbin|Volumes)\/)|\b[A-Za-z]:[\\/])[^\s'"`,;)]*/g;

/** "inspect event-delivery.json" style hints that point at local files. */
const LOCAL_FILE_HINT =
  /;?\s*(?:inspect|see|check|read)\s+[\w./-]+\.(?:json|jsonl|log|txt|ya?ml)\b/gi;

/** key=value diagnostics, e.g. "failed=45, exhausted=0". */
const KEY_VALUE = /\b[a-z][\w ]{0,24}=[^\s,;]+/i;

interface DiagnosticRule {
  readonly match: RegExp;
  readonly copy: (match: RegExpMatchArray) => string;
}

const RULES: readonly DiagnosticRule[] = [
  {
    match:
      /remediation action lacks authoritative acknowledgement(?:.*?failed=(\d+))?/i,
    copy: match => {
      const failed = Number(match[1] ?? 0);
      return failed > 0
        ? `Remediation alerts are not being acknowledged (${failed} failed delivery records)`
        : 'Remediation alerts are not being acknowledged';
    },
  },
];

/**
 * Drop filesystem paths, keeping only the last segment ("codex"), so a row can
 * still name the tool without exposing the host layout.
 */
export function redactFilesystemPaths(value: string): string {
  return value.replace(FILESYSTEM_PATH, path => {
    const segments = path.split(/[\\/]/).filter(Boolean);
    return segments.at(-1) ?? '';
  });
}

/** True when a string reads as a machine diagnostic rather than a sentence. */
export function looksLikeDiagnostic(value: string): boolean {
  FILESYSTEM_PATH.lastIndex = 0;
  LOCAL_FILE_HINT.lastIndex = 0;
  return (
    FILESYSTEM_PATH.test(value) ||
    LOCAL_FILE_HINT.test(value) ||
    KEY_VALUE.test(value)
  );
}

/**
 * Plain operator copy for one internal alert. Known diagnostics get a written
 * sentence; unknown machine strings get a generic one (the raw text stays on
 * the details view); plain sentences pass through with paths redacted.
 */
export function operatorAlertCopy(raw: string): string {
  const text = raw.trim();
  for (const rule of RULES) {
    const match = text.match(rule.match);
    if (match) return rule.copy(match);
  }
  if (looksLikeDiagnostic(text))
    return 'Shipping automation reported a problem';
  return redactFilesystemPaths(text);
}

/**
 * Source-unavailable warnings for a decision list: one issue is shown in
 * full, more collapse to a count so the warning stays one line. The caller
 * links the full list.
 */
export function summarizeSourceIssues(
  issues: readonly string[],
  maxInline = 1
): string | null {
  const shown = [
    ...new Set(
      issues.map(issue => redactFilesystemPaths(issue.trim())).filter(Boolean)
    ),
  ];
  if (shown.length === 0) return null;
  if (shown.length <= maxInline)
    return `Source needs attention. ${shown.join(' ')}`;
  return `${shown.length} source issues need attention.`;
}

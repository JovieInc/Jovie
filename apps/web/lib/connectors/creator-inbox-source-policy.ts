import { WORKFLOW_CAPTURE_REQUEST_KIND } from './suggested-action-kinds';

/** Explicit operator provenance stays in Ovie. Ambiguous legacy kinds are retained. */
export const OPERATOR_INBOX_SOURCE_PREFIXES = [
  'founder.',
  'ops.',
  'ovie.',
] as const;

export function isCreatorInboxSourceKind(kind: string): boolean {
  const normalized = kind.toLowerCase();
  return (
    normalized !== WORKFLOW_CAPTURE_REQUEST_KIND &&
    !OPERATOR_INBOX_SOURCE_PREFIXES.some(prefix =>
      normalized.startsWith(prefix)
    )
  );
}

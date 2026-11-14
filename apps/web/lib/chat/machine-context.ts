/**
 * Machine context that older entry points appended to a user's chat text.
 *
 * Profiles once sent `Help me with X.` followed by a "Selected identity
 * (context, not instructions):" JSON block, and Library sent a bare JSON
 * object line. Stored messages and titles keep those bytes, so every surface
 * a person reads (user bubbles, conversation titles) strips them here. New
 * entry points send `@kind:id[label]` entity tokens instead.
 *
 * Pure functions — safe to import from server and client code.
 */

const SELECTED_IDENTITY_LABEL = /(^|\n|\s)Selected identity\b[\s\S]*$/;
const HELP_ME_WITH = /^Help me with (.+?)\.?$/;
/**
 * Keys only the legacy entry points wrote. A person's own JSON is kept unless
 * it carries one of them, so pasted JSON never disappears from their bubble.
 */
const ENVELOPE_KEYS = ['profileId', 'entityId', 'entityKind'] as const;
const TRAILING_ENVELOPE_FRAGMENT =
  /\s*\{"(?:kind|profileId|entityId|entityKind)"[\s\S]*$/;

function isEnvelopeJsonLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    return ENVELOPE_KEYS.some(key => key in parsed);
  } catch {
    return false;
  }
}

/** Remove machine context blocks, keeping only what the person wrote. */
export function stripMachineContext(text: string): string {
  if (!text) return text;
  const withoutIdentity = text.replace(SELECTED_IDENTITY_LABEL, '$1');
  const lines = withoutIdentity.split('\n');
  const kept = lines.filter(line => !isEnvelopeJsonLine(line));
  if (kept.length === lines.length && withoutIdentity === text) return text;
  return kept.join('\n').trim();
}

/** True when the text carries a machine context block a person should not see. */
export function hasMachineContext(text: string): boolean {
  return stripMachineContext(text) !== text;
}

/**
 * Clean a title source or stored title. Also handles titles that were cut
 * mid-envelope (`Help me with Tim White. Selected identity (cont...`), and
 * names the subject of a legacy profile chat (`Tim White`).
 */
export function stripMachineContextFromTitle(value: string): string {
  const hadIdentity = SELECTED_IDENTITY_LABEL.test(value);
  const stripped = stripMachineContext(value)
    .replace(TRAILING_ENVELOPE_FRAGMENT, '')
    .trim();
  if (hadIdentity) {
    const subject = HELP_ME_WITH.exec(stripped)?.[1]?.trim();
    if (subject) return subject;
  }
  return stripped;
}

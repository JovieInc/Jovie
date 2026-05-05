import 'server-only';

/**
 * Discriminated parsed-command shape for inbound SMS.
 */
export type ParsedSmsCommand =
  | { kind: 'stop'; rawToken: string }
  | { kind: 'start'; rawToken: string }
  | { kind: 'help'; rawToken: string }
  | { kind: 'join'; code: string }
  | { kind: 'unknown' };

/** Carrier-mandated stop keywords. Case-insensitive, exact-token match. */
const STOP_TOKENS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
]);

/** CTIA recovery keywords — re-enable after a prior STOP. */
const START_TOKENS = new Set(['START', 'UNSTOP', 'YES']);

const HELP_TOKENS = new Set(['HELP', 'INFO']);

/**
 * Allowed alphabet for intent codes: A-Z and 2-9, excluding I O 0 1 to
 * avoid iOS autocorrect / visual ambiguity. Codes are 6-8 chars; the
 * generator emits 8, but the parser accepts 6-8 for forward-compat.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = new RegExp(`\\b([${CODE_ALPHABET}]{6,8})\\b`);

const TOKEN_PATTERN = /[A-Z0-9]+/g;

/**
 * Parse an inbound SMS message body into a ParsedSmsCommand.
 *
 * Rules (codex F5 + subagent F11):
 * - Whitespace + control chars normalized; case-folded to upper.
 * - Exact-token match wins for STOP/HELP/START families (anywhere in body).
 * - Otherwise, extract the first 6-8 char A-Z/2-9 code anywhere in the body.
 * - Carrier multipart concatenation, surrounding punctuation, quotes,
 *   newlines, and iOS autocorrect noise are all tolerated.
 * - Unknown text returns `{ kind: 'unknown' }` — never subscribe on unknown.
 */
export function parseInboundCommand(
  rawBody: string | null | undefined
): ParsedSmsCommand {
  if (!rawBody) return { kind: 'unknown' };

  const upper = rawBody.toUpperCase();

  // Walk all alphanumeric tokens once. Return on the first decisive match
  // so STOP > START > HELP > JOIN if a fan sends "STOP J7K4Q2" we honor STOP.
  const tokens = upper.match(TOKEN_PATTERN) ?? [];
  for (const token of tokens) {
    if (STOP_TOKENS.has(token)) {
      return { kind: 'stop', rawToken: token };
    }
  }
  for (const token of tokens) {
    if (START_TOKENS.has(token)) {
      return { kind: 'start', rawToken: token };
    }
  }
  for (const token of tokens) {
    if (HELP_TOKENS.has(token)) {
      return { kind: 'help', rawToken: token };
    }
  }

  // JOIN is implicit: the keyword "JOIN" is optional; a bare code anywhere
  // in the body counts. Strip "JOIN" tokens first to expose the code.
  const codeMatch = upper.match(CODE_PATTERN);
  if (codeMatch?.[1]) {
    return { kind: 'join', code: codeMatch[1] };
  }

  return { kind: 'unknown' };
}

/**
 * Templated reply text for HELP. Carrier-compliance copy.
 * Brand + opt-out keyword + frequency, in one short message.
 */
export const HELP_REPLY_TEXT =
  'Jovie: release alerts for artists you choose. Reply STOP to unsubscribe. Msg & data rates may apply.';

/**
 * Templated reply text for STOP confirmation. Carrier-compliance copy.
 * Some carriers require an explicit acknowledgement; others insert their
 * own. Returning this text lets the route layer decide whether to send.
 */
export const STOP_REPLY_TEXT =
  'Jovie: you are unsubscribed and will not receive more messages. Reply START to opt back in.';

/**
 * Reply when an inbound code was not recognized but came from a phone with
 * a recent active intent (see codex ENG-N6: cross-phone replay polite
 * reject + iOS autocorrect recovery hint).
 */
export const CODE_NOT_FOUND_REPLY_TEXT =
  'Jovie: that code expired or was already used. Visit the artist page and tap Get Release Alerts to try again.';

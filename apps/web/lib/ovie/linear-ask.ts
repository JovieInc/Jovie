/**
 * Asks filed as Linear issues labelled `tim-action-required` can offer
 * one-click answers with an `Options: A | B` line in the description.
 * Agents read the founder's answer back from the issue comment that
 * `POST /api/admin/hud/tim-actions` writes before closing the issue.
 */
export interface LinearAsk {
  /** Description without the options line, trimmed for display. */
  readonly body: string;
  /** One-click answers in the order the asker listed them (max 4). */
  readonly options: readonly string[];
}

const OPTIONS_LINE = /^[ \t]*options[ \t]*:[ \t]*(.+)$/im;
const MAX_OPTIONS = 4;
const MAX_OPTION_LENGTH = 40;
const MAX_BODY_LENGTH = 600;

export const LINEAR_ANSWER_MAX_LENGTH = 2000;

export function parseLinearAsk(
  description: string | null | undefined
): LinearAsk {
  const text = (description ?? '').replace(/\r\n/g, '\n');
  const match = OPTIONS_LINE.exec(text);
  const options = match
    ? [
        ...new Set(
          match[1]
            .split('|')
            .map(option => option.trim())
            .filter(
              option => option.length > 0 && option.length <= MAX_OPTION_LENGTH
            )
        ),
      ].slice(0, MAX_OPTIONS)
    : [];
  const body = (match ? text.replace(match[0], '') : text)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    body:
      body.length > MAX_BODY_LENGTH
        ? `${body.slice(0, MAX_BODY_LENGTH - 1).trimEnd()}…`
        : body,
    options,
  };
}

/** The comment an agent reads back; one line, attributable, plain text. */
export function linearAnswerComment(answer: string): string {
  return `Answered in Ovie: ${answer.trim()}`;
}

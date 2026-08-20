export const FEEDBACK_SLACK_MAX_CHARS = 280;
const EMAIL_IN_TEXT = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function redactFeedbackMessageForSlack(message: string): string {
  const redacted = message.replace(EMAIL_IN_TEXT, '[REDACTED_EMAIL]');
  if (redacted.length <= FEEDBACK_SLACK_MAX_CHARS) return redacted;
  return `${redacted.slice(0, FEEDBACK_SLACK_MAX_CHARS)}…`;
}

export interface SlackFeedbackNotification {
  text: string;
  blocks: {
    type: 'section' | 'context';
    text?: {
      type: 'mrkdwn';
      text: string;
    };
    elements?: {
      type: 'mrkdwn';
      text: string;
    }[];
  }[];
}

export function buildSlackFeedbackNotification(params: {
  readonly message: string;
  readonly name: string;
  readonly source: string;
  readonly pathname?: string | null;
}): SlackFeedbackNotification {
  const text = `💬 ${params.name} submitted feedback`;
  const contextLine = [
    `Source: ${params.source}`,
    params.pathname ? `Path: ${params.pathname}` : null,
  ]
    .filter(Boolean)
    .join('  •  ');
  const safeMessage = redactFeedbackMessageForSlack(params.message);

  return {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💬 *${params.name}* submitted feedback`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: contextLine,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${safeMessage}`,
        },
      },
    ],
  };
}

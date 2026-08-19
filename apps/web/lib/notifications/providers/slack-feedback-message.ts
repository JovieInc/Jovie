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
          text: `> ${params.message}`,
        },
      },
    ],
  };
}

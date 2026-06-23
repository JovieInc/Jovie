import type { TasteIssue } from '../linear';
import { getTasteSlackCardByIssueId, saveTasteSlackCard } from './card-store';
import {
  addTasteSlackReactions,
  getTasteSlackChannelId,
  isTasteSlackConfigured,
  postTasteSlackMessage,
} from './slack-api';

const LABEL_DISPLAY: Record<string, string> = {
  'needs:taste': 'Taste call',
  'needs:human': 'Human action',
};

function buildSlackBlocks(issue: TasteIssue): string {
  const labelDisplay = LABEL_DISPLAY[issue.label] ?? issue.label;
  return JSON.stringify([
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${issue.identifier}* — ${issue.title}\n<${issue.url}|Open in Linear>`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${labelDisplay}* · ${issue.priorityLabel}${
            issue.blockingReason ? ` · ${issue.blockingReason}` : ''
          }`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'React :+1: to unblock · :-1: to route back',
        },
      ],
    },
  ]);
}

export interface PostTasteSlackCardResult {
  readonly posted: boolean;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly messageTs?: string;
}

export async function postTasteSlackCard(
  issue: TasteIssue,
  storePath?: string
): Promise<PostTasteSlackCardResult> {
  if (!isTasteSlackConfigured()) {
    return {
      posted: false,
      skipped: true,
      reason: 'Slack not configured',
    };
  }

  const existing = await getTasteSlackCardByIssueId(issue.id, storePath);
  if (existing) {
    return {
      posted: false,
      skipped: true,
      reason: 'Card already posted',
      messageTs: existing.messageTs,
    };
  }

  const channel = getTasteSlackChannelId();
  if (!channel) {
    return {
      posted: false,
      skipped: true,
      reason: 'TASTE_SLACK_CHANNEL_ID not configured',
    };
  }

  const text = `Taste inbox: ${issue.identifier} — ${issue.title}`;
  const post = await postTasteSlackMessage({
    channel,
    text,
    blocks: buildSlackBlocks(issue),
  });

  if (!post.ok || !post.messageTs) {
    return {
      posted: false,
      skipped: false,
      reason: post.error ?? 'Failed to post Slack card',
    };
  }

  await addTasteSlackReactions({
    channel,
    messageTs: post.messageTs,
  });

  await saveTasteSlackCard(
    {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      label: issue.label,
      channel,
      messageTs: post.messageTs,
      postedAt: new Date().toISOString(),
    },
    storePath
  );

  return {
    posted: true,
    skipped: false,
    messageTs: post.messageTs,
  };
}

/**
 * Slack Notification Provider
 *
 * Sends admin notifications to Slack via incoming webhooks.
 * Used for internal alerts about user activity (claims, signups, upgrades, waitlist).
 *
 * @see https://api.slack.com/messaging/webhooks
 */

import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

interface SlackBlock {
  type: 'section' | 'divider' | 'context';
  text?: {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
  }>;
}

export interface SlackNotificationResult {
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
  error?: string;
}

export const SLACK_ENABLED = Boolean(env.SLACK_WEBHOOK_URL);

/**
 * Send a message to Slack via webhook.
 *
 * @param message - The message to send
 * @returns Result indicating success, skip, or error
 */
export async function sendSlackMessage(
  message: SlackMessage
): Promise<SlackNotificationResult> {
  if (!SLACK_ENABLED || !env.SLACK_WEBHOOK_URL) {
    return {
      status: 'skipped',
      detail: 'SLACK_WEBHOOK_URL not configured',
    };
  }

  try {
    const response = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${errorText}`);
    }

    return {
      status: 'sent',
      detail: 'Message sent to Slack',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown Slack error';

    captureError('[notifications] Slack sendMessage error', error, {
      text: message.text.slice(0, 100),
    });

    return {
      status: 'error',
      error: errorMessage,
    };
  }
}

/**
 * Send a profile claim notification to Slack.
 *
 * @param name - The name of the user who claimed their profile
 * @param profileUrl - Optional URL to the claimed profile
 */
export async function notifySlackProfileClaimed(
  name: string,
  profileUrl?: string
): Promise<SlackNotificationResult> {
  const text = `🎉 ${name} just claimed their Jovie profile!`;
  const message: SlackMessage = profileUrl
    ? {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎉 *${name}* just claimed their Jovie profile!\n<${profileUrl}|View profile>`,
            },
          },
        ],
      }
    : { text };

  const result = await sendSlackMessage(message);
  if (result.status === 'sent') {
    logger.info('[slack] Profile claimed notification sent', { name });
  }
  return result;
}

/**
 * Send an upgrade notification to Slack.
 *
 * @param name - The name of the user who upgraded
 * @param plan - The plan they upgraded to (e.g., "Pro")
 */
export async function notifySlackUpgrade(
  name: string,
  plan = 'Pro'
): Promise<SlackNotificationResult> {
  const text = `⬆️ ${name} just upgraded to ${plan}!`;
  const result = await sendSlackMessage({ text });
  if (result.status === 'sent') {
    logger.info('[slack] Upgrade notification sent', { name, plan });
  }
  return result;
}

/**
 * Send a signup notification to Slack.
 *
 * @param name - The name of the user who signed up
 * @param email - Optional email of the user
 */
export async function notifySlackSignup(
  name: string,
  email?: string
): Promise<SlackNotificationResult> {
  const text = `👋 ${name} just signed up for Jovie!`;
  const message: SlackMessage = email
    ? {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👋 *${name}* just signed up for Jovie!`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'plain_text',
                text: `Email: ${email}`,
                emoji: false,
              },
            ],
          },
        ],
      }
    : { text };

  const result = await sendSlackMessage(message);
  if (result.status === 'sent') {
    logger.info('[slack] Signup notification sent', { name });
  }
  return result;
}

/**
 * Send a Growth plan early access request notification to Slack.
 *
 * @param name - The name of the user requesting access
 * @param email - The email of the user
 * @param currentPlan - The user's current plan
 * @param reason - What feature they're most excited about
 */
export async function notifySlackGrowthRequest(
  name: string,
  email: string,
  currentPlan: string,
  reason: string
): Promise<SlackNotificationResult> {
  const text = `🚀 ${name} requested early access to the Growth plan!`;
  const message: SlackMessage = {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚀 *${name}* requested early access to the *Growth* plan!`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📧 ${email}  •  Current plan: *${currentPlan}*`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${reason}`,
        },
      },
    ],
  };

  const result = await sendSlackMessage(message);
  if (result.status === 'sent') {
    logger.info('[slack] Growth access request notification sent', {
      name,
      email,
    });
  }
  return result;
}

/**
 * Send a waitlist notification to Slack.
 *
 * @param name - The name of the user who joined the waitlist
 * @param email - Optional email of the user
 */
export async function notifySlackWaitlist(
  name: string,
  email?: string
): Promise<SlackNotificationResult> {
  const text = `📝 ${name} just joined the waitlist!`;
  const message: SlackMessage = email
    ? {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📝 *${name}* just joined the waitlist!`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'plain_text',
                text: `Email: ${email}`,
                emoji: false,
              },
            ],
          },
        ],
      }
    : { text };

  const result = await sendSlackMessage(message);
  if (result.status === 'sent') {
    logger.info('[slack] Waitlist notification sent', { name });
  }
  return result;
}

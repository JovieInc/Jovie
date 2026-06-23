import { getTasteSlackCardByMessageTs } from './card-store';
import {
  TASTE_AUTHORITY_SLACK_USER_ID,
  TASTE_BUILD_AGENT_SLACK_USER_ID,
  TASTE_SLACK_APPROVE_REACTION,
  TASTE_SLACK_REJECT_REACTION,
} from './constants';
import { writeTastePreference } from './gbrain-preference';
import {
  approveTasteInboxIssue,
  rejectTasteInboxIssue,
} from './linear-actions';

export interface SlackReactionAddedEvent {
  readonly type: 'reaction_added';
  readonly user: string;
  readonly reaction: string;
  readonly item: {
    readonly type: string;
    readonly channel: string;
    readonly ts: string;
  };
}

export type TasteSlackReactionResult =
  | { readonly handled: false; readonly reason: string }
  | {
      readonly handled: true;
      readonly decision: 'approved' | 'rejected';
      readonly issueId: string;
      readonly identifier: string;
    };

export function shouldIgnoreTasteSlackReaction(userId: string): boolean {
  return userId === TASTE_BUILD_AGENT_SLACK_USER_ID;
}

export function isAuthoritativeTasteSlackReaction(userId: string): boolean {
  return userId === TASTE_AUTHORITY_SLACK_USER_ID;
}

export async function handleTasteSlackReaction(
  event: SlackReactionAddedEvent,
  options: {
    readonly linearApiKey?: string;
    readonly storePath?: string;
  } = {}
): Promise<TasteSlackReactionResult> {
  if (event.type !== 'reaction_added') {
    return { handled: false, reason: 'Not a reaction_added event' };
  }

  if (shouldIgnoreTasteSlackReaction(event.user)) {
    return { handled: false, reason: 'Ignored build-agent reaction' };
  }

  if (!isAuthoritativeTasteSlackReaction(event.user)) {
    return { handled: false, reason: 'Ignored non-authoritative reaction' };
  }

  if (
    event.reaction !== TASTE_SLACK_APPROVE_REACTION &&
    event.reaction !== TASTE_SLACK_REJECT_REACTION
  ) {
    return { handled: false, reason: 'Ignored non-vote reaction' };
  }

  const card = await getTasteSlackCardByMessageTs(
    event.item.ts,
    options.storePath
  );
  if (!card) {
    return { handled: false, reason: 'No taste card for message timestamp' };
  }

  const apiKey = options.linearApiKey ?? process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return { handled: false, reason: 'LINEAR_API_KEY not configured' };
  }

  const decision =
    event.reaction === TASTE_SLACK_APPROVE_REACTION ? 'approved' : 'rejected';

  if (decision === 'approved') {
    await approveTasteInboxIssue({
      apiKey,
      issueId: card.issueId,
      identifier: card.identifier,
      label: card.label,
      reviewerSlackUserId: event.user,
    });
  } else {
    await rejectTasteInboxIssue({
      apiKey,
      issueId: card.issueId,
      identifier: card.identifier,
      label: card.label,
      reviewerSlackUserId: event.user,
    });
  }

  await writeTastePreference({
    issueId: card.issueId,
    identifier: card.identifier,
    title: card.title,
    label: card.label,
    decision,
    reviewerSlackUserId: event.user,
    linearUrl: `https://linear.app/jovie/issue/${card.identifier}`,
  });

  return {
    handled: true,
    decision,
    issueId: card.issueId,
    identifier: card.identifier,
  };
}

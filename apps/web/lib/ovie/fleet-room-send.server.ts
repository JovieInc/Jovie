import 'server-only';

import { linearCommentToRoomEvent } from '@/lib/agent-room/linear-source';
import { writeAgentRoomEvents } from '@/lib/agent-room/store.server';
import {
  OVIE_FLEET_ROOM_ID,
  OVIE_FLEET_ROSTER,
  OVIE_FLEET_SENDER_ID,
} from '@/lib/ovie/fleet-room';
import {
  configuredFleetRoomDeps,
  type FleetRoomDeps,
} from '@/lib/ovie/fleet-room.server';

export const FLEET_ROOM_MESSAGE_MAX_CHARS = 2_000;

export type FleetRoomSendResult =
  | {
      readonly status: 'sent';
      readonly eventId: string;
      readonly thread: string;
    }
  | {
      readonly status: 'rejected';
      readonly reason: 'unknown-agent' | 'empty' | 'too-long';
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'linear-unconfigured' | 'thread-missing' | 'post-failed';
    };

/** The fleet-bus convention: a `[From → To]` prefix and no @mention. */
/** True when this environment can post to Linear, so the composer can show. */
export function fleetRoomCanSend(
  deps: Pick<FleetRoomDeps, 'linear'> = configuredFleetRoomDeps()
): boolean {
  return Boolean(deps.linear);
}

export function fleetRoomMessageBody(agentName: string, text: string): string {
  const sender = OVIE_FLEET_ROSTER.agents.find(
    agent => agent.id === OVIE_FLEET_SENDER_ID
  );
  return `[${sender?.name ?? 'Tim'} → ${agentName}] ${text}`;
}

const ISSUE_ID_QUERY = `query FleetRoomThread($ref: String!) {
  issue(id: $ref) { id identifier title url }
}`;

const COMMENT_MUTATION = `mutation FleetRoomSend($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id createdAt }
  }
}`;

interface ThreadNode {
  readonly id: string;
  readonly identifier: string;
  readonly title: string | null;
  readonly url: string | null;
}

/**
 * Talk to an agent: one Linear comment on that agent's home thread, from the
 * founder's Linear account. The comment is written into the room at once
 * under its Linear id, so the webhook echo is an idempotent upsert.
 */
export async function sendFleetRoomMessage(
  input: { readonly agentId: string; readonly text: string },
  deps: FleetRoomDeps = configuredFleetRoomDeps()
): Promise<FleetRoomSendResult> {
  const agent = OVIE_FLEET_ROSTER.agents.find(
    entry => entry.id === input.agentId && entry.kind === 'agent'
  );
  if (!agent?.homeThread)
    return { status: 'rejected', reason: 'unknown-agent' };
  const text = input.text.trim();
  if (!text) return { status: 'rejected', reason: 'empty' };
  if (text.length > FLEET_ROOM_MESSAGE_MAX_CHARS)
    return { status: 'rejected', reason: 'too-long' };
  if (!deps.linear)
    return { status: 'unavailable', reason: 'linear-unconfigured' };

  const { issue } = await deps.linear<{ issue: ThreadNode | null }>(
    ISSUE_ID_QUERY,
    { ref: agent.homeThread.ref }
  );
  if (!issue) return { status: 'unavailable', reason: 'thread-missing' };

  const body = fleetRoomMessageBody(agent.name, text);
  const { commentCreate } = await deps.linear<{
    commentCreate: {
      success: boolean;
      comment: { id: string; createdAt: string } | null;
    };
  }>(COMMENT_MUTATION, { issueId: issue.id, body });
  if (!commentCreate.success || !commentCreate.comment)
    return { status: 'unavailable', reason: 'post-failed' };

  const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
    id: commentCreate.comment.id,
    body,
    createdAt: commentCreate.comment.createdAt,
    userId: null,
    issue: { identifier: issue.identifier, title: issue.title, url: issue.url },
  });
  // The comment is posted; a store miss only waits for the webhook echo.
  if (event && deps.redis) {
    await writeAgentRoomEvents(deps.redis, OVIE_FLEET_ROOM_ID, [event]).catch(
      () => undefined
    );
  }
  return {
    status: 'sent',
    eventId: event?.id ?? `linear-comment:${commentCreate.comment.id}`,
    thread: issue.identifier,
  };
}

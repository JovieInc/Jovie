import {
  AGENT_ROOM_EVENT_SCHEMA,
  type AgentRoomEvent,
  type AgentRoomRoster,
  classifyMessageKind,
  discoveredAgentId,
  parseSpeakerPrefix,
  resolveRosterAgent,
  resolveRosterUser,
  roomExcerpt,
} from '@jovie/agent-transport-contracts/agent-room';

/**
 * The Linear source for an agent room. Linear is the fleet bus
 * (canon/FLEET.md#fleet-bus): agents talk in issue comments. A comment joins
 * the room when its speaker is known, either from a `[From → To]` prefix (the
 * fleet convention, since several agents post from one account) or from a
 * provider account only one agent uses (an installed Linear agent app).
 * Unattributed comments (bot receipts, Tim's own notes) stay out.
 */
export interface LinearRoomComment {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly userId: string | null;
  readonly issue: {
    readonly identifier: string;
    readonly title: string | null;
    readonly url: string | null;
  };
}

function resolveTarget(roster: AgentRoomRoster, label: string): string {
  if (/^(?:the\s+)?fleet$/iu.test(label.trim())) return 'fleet';
  return resolveRosterAgent(roster, label)?.id ?? discoveredAgentId(label);
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'linear.app'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function linearCommentToRoomEvent(
  roster: AgentRoomRoster,
  comment: LinearRoomComment
): AgentRoomEvent | null {
  if (!comment.id || !comment.issue.identifier) return null;
  const at = Date.parse(comment.createdAt);
  if (!Number.isFinite(at)) return null;

  const prefix = parseSpeakerPrefix(comment.body);
  let agentId: string;
  let speakerLabel: string;
  let to: string | null = null;
  let text = comment.body;
  if (prefix) {
    const agent = resolveRosterAgent(roster, prefix.from);
    agentId = agent?.id ?? discoveredAgentId(prefix.from);
    speakerLabel = agent?.name ?? prefix.from;
    to = resolveTarget(roster, prefix.to);
    text = prefix.rest;
  } else {
    const agent = resolveRosterUser(roster, comment.userId);
    if (!agent) return null;
    agentId = agent.id;
    speakerLabel = agent.name;
  }

  return {
    schema: AGENT_ROOM_EVENT_SCHEMA,
    id: `linear-comment:${comment.id}`,
    roomId: roster.roomId,
    source: 'linear',
    at: new Date(at).toISOString(),
    agentId,
    speakerLabel: speakerLabel.slice(0, 80),
    to: to?.slice(0, 80) ?? null,
    kind: classifyMessageKind(text),
    excerpt: roomExcerpt(text),
    thread: {
      ref: comment.issue.identifier.slice(0, 64),
      title: comment.issue.title?.slice(0, 240) ?? null,
      url: safeUrl(comment.issue.url),
    },
  };
}

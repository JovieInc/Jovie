import { z } from 'zod';

/**
 * Agent room: one shared contract for "who is in the room and what did they
 * say", built once for Ovie's fleet and reused by Jovie customers' own agents.
 *
 * Everything here is pure and deterministic. Sources (Linear today; a
 * customer's Jovie agent runs later) normalize their records into
 * `AgentRoomEvent`s; a store keeps them; `projectAgentRoom` turns the stored
 * events plus a roster into the view a screen renders. No provider call and no
 * model call happens on the read path. See docs/operations/AGENT_ROOM.md.
 */
export const AGENT_ROOM_EVENT_SCHEMA = 'jovie.agent-room-event/v1' as const;

/** Bounded room size: the store trims to this many newest events. */
export const AGENT_ROOM_MAX_EVENTS = 500;
/** Events a view renders. */
export const AGENT_ROOM_VIEW_EVENTS = 100;
export const AGENT_ROOM_EXCERPT_CHARS = 280;
/** An agent that spoke within this window reads as active. */
export const AGENT_ROOM_ACTIVE_MS = 30 * 60_000;
/** An agent that spoke within this window reads as recent. */
export const AGENT_ROOM_RECENT_MS = 24 * 60 * 60_000;

const roomId = z.string().regex(/^[a-z][a-z0-9-]*:[A-Za-z0-9._-]{1,128}$/u);
const agentId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u);

export const agentRoomEventSchema = z.object({
  schema: z.literal(AGENT_ROOM_EVENT_SCHEMA),
  /** Stable source identity, e.g. `linear-comment:<uuid>`. Upserts replace. */
  id: z.string().min(1).max(200),
  roomId,
  source: z.enum(['linear']),
  at: z.string().datetime(),
  agentId,
  /** The speaker as the source named it, for agents not on the roster. */
  speakerLabel: z.string().min(1).max(80),
  /** Addressee: an agent id, `fleet`, or null when the message names none. */
  to: z.string().max(80).nullable(),
  kind: z.enum(['message', 'error']),
  excerpt: z.string().max(AGENT_ROOM_EXCERPT_CHARS + 1),
  thread: z.object({
    ref: z.string().min(1).max(64),
    title: z.string().max(240).nullable(),
    url: z.string().url().nullable(),
  }),
});

export type AgentRoomEvent = z.infer<typeof agentRoomEventSchema>;

export type AgentRoomAgentKind = 'agent' | 'human';

/**
 * A known participant. `aliases` match a `[Name → Target]` speaker prefix
 * (case-insensitive, and also against a parenthesised alias such as
 * `Claude Duet (Elsa)`); `sourceUserIds` match a provider account that only
 * this agent posts from (an installed Linear agent app, for example).
 */
export interface AgentRoomRosterEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: AgentRoomAgentKind;
  readonly role: string;
  readonly aliases: readonly string[];
  readonly sourceUserIds?: readonly string[];
  /** Thread where a message to this agent is posted (slice 2). */
  readonly homeThread?: { readonly ref: string; readonly url: string };
}

export interface AgentRoomRoster {
  readonly roomId: string;
  readonly title: string;
  readonly agents: readonly AgentRoomRosterEntry[];
}

export type AgentRoomPresence =
  | 'active'
  | 'recent'
  | 'quiet'
  | 'blocked'
  | 'unseen';

export interface AgentRoomAgentView {
  readonly id: string;
  readonly name: string;
  readonly kind: AgentRoomAgentKind;
  readonly role: string;
  readonly onRoster: boolean;
  readonly presence: AgentRoomPresence;
  readonly lastAt: string | null;
  readonly lastExcerpt: string | null;
  readonly lastThread: AgentRoomEvent['thread'] | null;
  readonly events24h: number;
}

export interface AgentRoomEventView extends AgentRoomEvent {
  readonly agentName: string;
  readonly toName: string | null;
}

export interface AgentRoomView {
  readonly roomId: string;
  readonly title: string;
  readonly generatedAt: string;
  readonly agents: readonly AgentRoomAgentView[];
  readonly events: readonly AgentRoomEventView[];
  readonly counts: {
    readonly active: number;
    readonly blocked: number;
    readonly events24h: number;
  };
}

const SPEAKER_PREFIX =
  /^\s*\[([^\]\n→]{1,80}?)\s*(?:→|->)\s*([^\]\n]{1,80}?)\s*\]\s*/u;
// Provider failure receipts, not talk about limits: "Codex couldn't start a
// task…", "You have reached your Codex usage limits", "Rate limited…". Only a
// message's first line is read, where a receipt states its failure.
const FAILURE_PATTERNS: readonly RegExp[] = [
  /\bcouldn'?t start a task\b/iu,
  /\b(?:reached|hit|exceeded)\s+(?:your\s+|the\s+)?(?:[\w-]+\s+){0,3}(?:usage|rate)\s+limits?\b/iu,
  /\bno available environments?\b/iu,
  /^\s*rate[- ]limited\b/iu,
];

export interface SpeakerPrefix {
  readonly from: string;
  readonly to: string;
  readonly rest: string;
}

/** `[Lola → Claude Duet] text` → `{ from: 'Lola', to: 'Claude Duet', rest }`. */
export function parseSpeakerPrefix(body: string): SpeakerPrefix | null {
  const match = SPEAKER_PREFIX.exec(body);
  if (!match) return null;
  return {
    from: match[1].trim(),
    to: match[2].trim(),
    rest: body.slice(match[0].length),
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

/** Names a label can match: itself and any parenthesised alias inside it. */
function labelCandidates(label: string): string[] {
  const names = [normalizeName(label)];
  const paren = /\(([^)]+)\)/u.exec(label);
  if (paren) {
    names.push(normalizeName(paren[1]));
    names.push(normalizeName(label.replace(paren[0], '')));
  }
  return names;
}

export function resolveRosterAgent(
  roster: AgentRoomRoster,
  label: string
): AgentRoomRosterEntry | null {
  const candidates = labelCandidates(label);
  for (const agent of roster.agents) {
    const names = [agent.id, agent.name, ...agent.aliases].map(normalizeName);
    if (candidates.some(candidate => names.includes(candidate))) return agent;
  }
  return null;
}

export function resolveRosterUser(
  roster: AgentRoomRoster,
  sourceUserId: string | null | undefined
): AgentRoomRosterEntry | null {
  if (!sourceUserId) return null;
  return (
    roster.agents.find(agent => agent.sourceUserIds?.includes(sourceUserId)) ??
    null
  );
}

/** A deterministic id for a speaker who is not on the roster. */
export function discoveredAgentId(label: string): string {
  const slug = normalizeName(label)
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 56);
  return slug ? `x-${slug}` : 'x-unknown';
}

export function classifyMessageKind(text: string): AgentRoomEvent['kind'] {
  const firstLine = text.trim().split('\n', 1)[0] ?? '';
  return FAILURE_PATTERNS.some(pattern => pattern.test(firstLine))
    ? 'error'
    : 'message';
}

/**
 * Plain, bounded text for a feed row: no HTML comments (machine receipts), no
 * markdown emphasis, code fences or table rules, single spaces, cut on a word.
 */
export function roomExcerpt(text: string): string {
  const plain = text
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, ' ')
    .replace(/```[\s\S]*?(?:```|$)/gu, ' ')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gmu, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`#>]+/gu, '')
    .replace(/\|/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (plain.length <= AGENT_ROOM_EXCERPT_CHARS) return plain;
  const cut = plain.slice(0, AGENT_ROOM_EXCERPT_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > AGENT_ROOM_EXCERPT_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Newest first; ties broken by id so the order never depends on input order. */
export function compareRoomEvents(
  a: AgentRoomEvent,
  b: AgentRoomEvent
): number {
  const delta = Date.parse(b.at) - Date.parse(a.at);
  if (delta !== 0) return delta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function presenceFor(
  latest: AgentRoomEvent | undefined,
  nowMs: number
): AgentRoomPresence {
  if (!latest) return 'unseen';
  const age = nowMs - Date.parse(latest.at);
  // A failure blocks for a day at most; after that the agent reads as quiet.
  if (latest.kind === 'error' && age <= AGENT_ROOM_RECENT_MS) return 'blocked';
  if (age <= AGENT_ROOM_ACTIVE_MS) return 'active';
  if (age <= AGENT_ROOM_RECENT_MS) return 'recent';
  return 'quiet';
}

const PRESENCE_ORDER: Record<AgentRoomPresence, number> = {
  blocked: 0,
  active: 1,
  recent: 2,
  quiet: 3,
  unseen: 4,
};

/**
 * The room a screen renders. Pure: the same events, roster and clock always
 * give the same view. Roster agents keep their roster order within a presence
 * band; speakers not on the roster follow, named as the source named them.
 */
export function projectAgentRoom(
  roster: AgentRoomRoster,
  input: readonly AgentRoomEvent[],
  now: Date
): AgentRoomView {
  const nowMs = now.getTime();
  const byId = new Map<string, AgentRoomEvent>();
  for (const event of input) {
    if (event.roomId !== roster.roomId) continue;
    const previous = byId.get(event.id);
    if (!previous || Date.parse(event.at) >= Date.parse(previous.at))
      byId.set(event.id, event);
  }
  const events = [...byId.values()].sort(compareRoomEvents);

  const names = new Map<string, string>();
  for (const agent of roster.agents) names.set(agent.id, agent.name);
  for (const event of events)
    if (!names.has(event.agentId)) names.set(event.agentId, event.speakerLabel);

  const latestByAgent = new Map<string, AgentRoomEvent>();
  const recentCount = new Map<string, number>();
  for (const event of events) {
    if (!latestByAgent.has(event.agentId))
      latestByAgent.set(event.agentId, event);
    if (nowMs - Date.parse(event.at) <= AGENT_ROOM_RECENT_MS)
      recentCount.set(event.agentId, (recentCount.get(event.agentId) ?? 0) + 1);
  }

  const rosterIds = new Set(roster.agents.map(agent => agent.id));
  const view = (
    id: string,
    meta: Pick<AgentRoomAgentView, 'name' | 'kind' | 'role' | 'onRoster'>
  ): AgentRoomAgentView => {
    const latest = latestByAgent.get(id);
    return {
      id,
      ...meta,
      presence: presenceFor(latest, nowMs),
      lastAt: latest?.at ?? null,
      lastExcerpt: latest?.excerpt ?? null,
      lastThread: latest?.thread ?? null,
      events24h: recentCount.get(id) ?? 0,
    };
  };
  const rosterViews = roster.agents.map(agent =>
    view(agent.id, {
      name: agent.name,
      kind: agent.kind,
      role: agent.role,
      onRoster: true,
    })
  );
  const discoveredViews = [...latestByAgent.keys()]
    .filter(id => !rosterIds.has(id))
    .sort()
    .map(id =>
      view(id, {
        name: names.get(id) ?? id,
        kind: 'agent',
        role: 'Not on the roster',
        onRoster: false,
      })
    );
  const order = new Map(
    [...rosterViews, ...discoveredViews].map((agent, index) => [
      agent.id,
      index,
    ])
  );
  const agents = [...rosterViews, ...discoveredViews].sort(
    (a, b) =>
      PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] ||
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );

  const shown = events.slice(0, AGENT_ROOM_VIEW_EVENTS).map(event => ({
    ...event,
    agentName: names.get(event.agentId) ?? event.speakerLabel,
    toName:
      event.to === null
        ? null
        : event.to === 'fleet'
          ? 'Fleet'
          : (names.get(event.to) ?? event.to),
  }));

  return {
    roomId: roster.roomId,
    title: roster.title,
    generatedAt: now.toISOString(),
    agents,
    events: shown,
    counts: {
      active: agents.filter(agent => agent.presence === 'active').length,
      blocked: agents.filter(agent => agent.presence === 'blocked').length,
      events24h: events.filter(
        event => nowMs - Date.parse(event.at) <= AGENT_ROOM_RECENT_MS
      ).length,
    },
  };
}

/** Decode a stored event; anything that fails the schema is dropped. */
export function decodeAgentRoomEvent(value: unknown): AgentRoomEvent | null {
  let candidate = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = agentRoomEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

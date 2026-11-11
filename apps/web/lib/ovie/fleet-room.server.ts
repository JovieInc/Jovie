import 'server-only';

import {
  type AgentRoomView,
  parseSpeakerPrefix,
  projectAgentRoom,
  resolveRosterUser,
} from '@jovie/agent-transport-contracts/agent-room';
import { after } from 'next/server';
import {
  type LinearRoomComment,
  linearCommentToRoomEvent,
} from '@/lib/agent-room/linear-source';
import {
  type AgentRoomRedis,
  type AgentRoomWriteReceipt,
  readAgentRoomEvents,
  writeAgentRoomEvents,
} from '@/lib/agent-room/store.server';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { getRedis } from '@/lib/redis';
import {
  OVIE_FLEET_HOME_THREADS,
  OVIE_FLEET_ROOM_ID,
  OVIE_FLEET_ROSTER,
} from './fleet-room';

/**
 * Ovie fleet room wiring. Event path: the signed Linear webhook hands each
 * comment here and an attributed one is upserted (one bounded issue read when
 * the payload lacks the issue identifier). Backstop: the frequent cron's
 * hourly slot reads recent comments on `fleet` issues and the agents' home
 * threads through the same normalizer. Read path: one Redis HGETALL and a
 * pure projection; no provider or model call.
 */

export type LinearGraphql = <T>(
  query: string,
  variables: Record<string, unknown>
) => Promise<T>;

export interface FleetRoomDeps {
  readonly redis: AgentRoomRedis | null;
  readonly linear: LinearGraphql | null;
}

function configuredLinear(): LinearGraphql | null {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) return null;
  return async <T>(query: string, variables: Record<string, unknown>) => {
    const payload = await fetchWithTimeout<{ data?: T; errors?: unknown[] }>(
      'https://api.linear.app/graphql',
      {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        timeout: 4_500,
      }
    );
    if (payload.errors?.length || !payload.data)
      throw new Error('linear_provider_unavailable');
    return payload.data;
  };
}

export function configuredFleetRoomDeps(): FleetRoomDeps {
  return {
    redis: getRedis() as unknown as AgentRoomRedis | null,
    linear: configuredLinear(),
  };
}

export type FleetRoomReadback =
  | { readonly status: 'ok'; readonly view: AgentRoomView }
  | {
      readonly status: 'unavailable';
      readonly reason: 'redis-unavailable' | 'store-read-failed';
      readonly view: AgentRoomView;
    };

export async function readOvieFleetRoom(
  now = new Date(),
  deps: Pick<FleetRoomDeps, 'redis'> = configuredFleetRoomDeps()
): Promise<FleetRoomReadback> {
  const empty = projectAgentRoom(OVIE_FLEET_ROSTER, [], now);
  if (!deps.redis)
    return { status: 'unavailable', reason: 'redis-unavailable', view: empty };
  try {
    const events = await readAgentRoomEvents(deps.redis, OVIE_FLEET_ROOM_ID);
    return {
      status: 'ok',
      view: projectAgentRoom(OVIE_FLEET_ROSTER, events, now),
    };
  } catch {
    return { status: 'unavailable', reason: 'store-read-failed', view: empty };
  }
}

// ---------------------------------------------------------------------------
// Event path: Linear webhook

interface WebhookCommentData {
  readonly id?: unknown;
  readonly body?: unknown;
  readonly createdAt?: unknown;
  readonly userId?: unknown;
  readonly user?: { readonly id?: unknown } | null;
  readonly issueId?: unknown;
  readonly issue?: {
    readonly id?: unknown;
    readonly identifier?: unknown;
    readonly title?: unknown;
    readonly url?: unknown;
  } | null;
}

export interface FleetRoomWebhookPayload {
  readonly type?: unknown;
  readonly action?: unknown;
  readonly url?: unknown;
  readonly data?: unknown;
}

const ISSUE_URL = /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]*-\d+)/u;
const LINEAR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

type IssueRef = LinearRoomComment['issue'];

async function issueRefFor(
  data: WebhookCommentData,
  payloadUrl: string | null,
  linear: LinearGraphql | null
): Promise<IssueRef | null> {
  const identifier = str(data.issue?.identifier);
  if (identifier)
    return {
      identifier,
      title: str(data.issue?.title),
      url: str(data.issue?.url) ?? payloadUrl?.split('#')[0] ?? null,
    };
  const fromUrl = payloadUrl ? ISSUE_URL.exec(payloadUrl) : null;
  if (fromUrl)
    return {
      identifier: fromUrl[1],
      title: str(data.issue?.title),
      url: fromUrl[0],
    };
  const issueId = str(data.issueId) ?? str(data.issue?.id);
  if (!issueId || !LINEAR_UUID.test(issueId) || !linear) return null;
  const result = await linear<{
    issue?: { identifier?: string; title?: string; url?: string } | null;
  }>(
    'query FleetRoomIssue($id: String!) { issue(id: $id) { identifier title url } }',
    { id: issueId }
  );
  const issue = result.issue;
  return issue?.identifier
    ? {
        identifier: issue.identifier,
        title: issue.title ?? null,
        url: issue.url ?? null,
      }
    : null;
}

export type FleetRoomIngestResult =
  | { readonly status: 'ignored'; readonly reason: string }
  | ({ readonly status: 'written' } & AgentRoomWriteReceipt);

/**
 * Upsert one signed Linear Comment event. Never throws on an unattributed or
 * malformed comment; provider and store errors propagate to the caller, which
 * records them without changing the webhook's response.
 */
export async function ingestFleetRoomLinearWebhook(
  payload: FleetRoomWebhookPayload,
  deps: FleetRoomDeps = configuredFleetRoomDeps()
): Promise<FleetRoomIngestResult> {
  if (payload.type !== 'Comment')
    return { status: 'ignored', reason: 'not-a-comment' };
  if (payload.action !== 'create' && payload.action !== 'update')
    return { status: 'ignored', reason: 'not-an-upsert' };
  const data = (payload.data ?? {}) as WebhookCommentData;
  const id = str(data.id);
  const body = str(data.body);
  const createdAt = str(data.createdAt);
  if (!id || !body || !createdAt)
    return { status: 'ignored', reason: 'incomplete-comment' };
  const userId = str(data.userId) ?? str(data.user?.id);
  // Cheap attribution check before any provider read.
  if (
    !parseSpeakerPrefix(body) &&
    !resolveRosterUser(OVIE_FLEET_ROSTER, userId)
  )
    return { status: 'ignored', reason: 'unattributed' };
  if (!deps.redis) return { status: 'ignored', reason: 'redis-unavailable' };

  const issue = await issueRefFor(data, str(payload.url), deps.linear);
  if (!issue) return { status: 'ignored', reason: 'no-issue' };
  const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
    id,
    body,
    createdAt,
    userId,
    issue,
  });
  if (!event) return { status: 'ignored', reason: 'unattributed' };
  const receipt = await writeAgentRoomEvents(deps.redis, OVIE_FLEET_ROOM_ID, [
    event,
  ]);
  return { status: 'written', ...receipt };
}

/**
 * The webhook route's hook: runs after the response, so the room never adds
 * latency to or changes the outcome of the existing dispatch path. A failure
 * is recorded and left for the hourly backstop.
 */
export function scheduleFleetRoomWebhook(payload: FleetRoomWebhookPayload) {
  const task = async () => {
    try {
      await ingestFleetRoomLinearWebhook(payload);
    } catch (error) {
      await captureError('Fleet room webhook ingest failed', error, {
        route: '/api/webhooks/linear',
      });
    }
  };
  try {
    after(task);
  } catch {
    // Outside a request scope (scripts, tests): run without blocking.
    void task();
  }
}

// ---------------------------------------------------------------------------
// Backstop: bounded sync over `fleet` issues and home threads

const ISSUES_PER_SYNC = 20;
const COMMENTS_PER_ISSUE = 30;
const SYNC_WINDOW_DAYS = 7;

interface SyncIssueNode {
  readonly identifier: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly comments: {
    readonly nodes: readonly {
      readonly id: string;
      readonly body: string;
      readonly createdAt: string;
      readonly user: { readonly id: string } | null;
    }[];
  };
}

const ISSUE_FIELDS = `identifier title url comments(first: ${COMMENTS_PER_ISSUE}, orderBy: createdAt) { nodes { id body createdAt user { id } } }`;

export function fleetRoomSyncQuery(homeThreads: readonly string[]): string {
  const homes = homeThreads
    .map(
      (_, index) => `home${index}: issue(id: $home${index}) { ${ISSUE_FIELDS} }`
    )
    .join(' ');
  const params = homeThreads.map((_, index) => `$home${index}: String!`);
  return `query FleetRoomSync($since: DateTimeOrDuration!${params.map(p => `, ${p}`).join('')}) { fleet: issues(first: ${ISSUES_PER_SYNC}, orderBy: updatedAt, filter: { labels: { name: { eqIgnoreCase: "fleet" } }, updatedAt: { gt: $since } }) { nodes { ${ISSUE_FIELDS} } } ${homes} }`;
}

export type FleetRoomSyncReceipt =
  | {
      readonly status: 'ok';
      readonly issues: number;
      readonly comments: number;
      readonly written: number;
      readonly trimmed: number;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'redis-unavailable' | 'linear-unconfigured';
    };

export async function syncOvieFleetRoom(
  now = new Date(),
  deps: FleetRoomDeps = configuredFleetRoomDeps()
): Promise<FleetRoomSyncReceipt> {
  if (!deps.redis)
    return { status: 'unavailable', reason: 'redis-unavailable' };
  if (!deps.linear)
    return { status: 'unavailable', reason: 'linear-unconfigured' };
  const since = new Date(
    now.getTime() - SYNC_WINDOW_DAYS * 24 * 60 * 60_000
  ).toISOString();
  const variables: Record<string, unknown> = { since };
  OVIE_FLEET_HOME_THREADS.forEach((ref, index) => {
    variables[`home${index}`] = ref;
  });
  const data = await deps.linear<
    { fleet?: { nodes?: SyncIssueNode[] } } & Record<
      string,
      SyncIssueNode | { nodes?: SyncIssueNode[] } | null | undefined
    >
  >(fleetRoomSyncQuery(OVIE_FLEET_HOME_THREADS), variables);

  // A home thread can also carry the `fleet` label; merge its comments.
  const issues = new Map<string, SyncIssueNode>();
  const add = (node: SyncIssueNode | null | undefined) => {
    if (!node?.identifier) return;
    const previous = issues.get(node.identifier);
    const seen = new Set(previous?.comments.nodes.map(c => c.id) ?? []);
    issues.set(node.identifier, {
      ...node,
      comments: {
        nodes: [
          ...(previous?.comments.nodes ?? []),
          ...(node.comments?.nodes ?? []).filter(c => !seen.has(c.id)),
        ],
      },
    });
  };
  for (const node of data.fleet?.nodes ?? []) add(node);
  OVIE_FLEET_HOME_THREADS.forEach((_, index) => {
    add(data[`home${index}`] as SyncIssueNode | null | undefined);
  });

  let comments = 0;
  const events = [];
  for (const issue of issues.values()) {
    for (const comment of issue.comments?.nodes ?? []) {
      comments += 1;
      const event = linearCommentToRoomEvent(OVIE_FLEET_ROSTER, {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        userId: comment.user?.id ?? null,
        issue: {
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        },
      });
      if (event) events.push(event);
    }
  }
  const receipt = await writeAgentRoomEvents(
    deps.redis,
    OVIE_FLEET_ROOM_ID,
    events
  );
  return { status: 'ok', issues: issues.size, comments, ...receipt };
}

type SubJobRunner<T> = (
  name: string,
  fn: () => Promise<Record<string, unknown>>
) => Promise<T>;

/** The frequent cron's hourly backstop slot (minute under 15), one query. */
export async function fleetRoomCronJob<T>(
  minute: number,
  run: SubJobRunner<T>,
  sync: (now: Date) => Promise<FleetRoomSyncReceipt> = now =>
    syncOvieFleetRoom(now)
): Promise<T | { success: true; skipped: true }> {
  if (minute >= 15) return { success: true, skipped: true };
  return run('fleetRoom', async () => ({ ...(await sync(new Date())) }));
}

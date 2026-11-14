'use client';

import type {
  AgentRoomAgentView,
  AgentRoomEventView,
  AgentRoomPresence,
  AgentRoomView,
} from '@jovie/agent-transport-contracts/agent-room';
import { UserAvatar } from '@jovie/ui';
import type { ReactNode } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

/**
 * The agent room, built once: Ovie renders the company fleet with it, and a
 * Jovie customer's own agents can render through it later. Presentational
 * only. It takes the projected view and never fetches, so the same view
 * always draws the same room. Relative times use the view's own clock.
 */

const PRESENCE_LABEL: Record<AgentRoomPresence, string> = {
  active: 'Active',
  recent: 'Today',
  quiet: 'Quiet',
  blocked: 'Blocked',
  unseen: 'Not seen',
};

const PRESENCE_TONE = {
  active: 'good',
  recent: 'neutral',
  quiet: 'neutral',
  blocked: 'bad',
  unseen: 'neutral',
} as const satisfies Record<
  AgentRoomPresence,
  'good' | 'warning' | 'bad' | 'neutral'
>;

const PRESENCE_DOT = {
  active: 'online',
  recent: 'away',
  quiet: 'offline',
  blocked: 'offline',
  unseen: undefined,
} as const;

export function roomTimeAgo(at: string | null, now: string): string {
  if (!at) return 'never';
  const seconds = Math.max(0, (Date.parse(now) - Date.parse(at)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AgentRow({
  agent,
  now,
}: Readonly<{ agent: AgentRoomAgentView; now: string }>) {
  return (
    <li
      className='flex items-start gap-3 px-3 py-2.5'
      data-testid='agent-room-agent'
      data-agent-id={agent.id}
      data-presence={agent.presence}
    >
      <UserAvatar
        name={agent.name}
        size='sm'
        status={PRESENCE_DOT[agent.presence]}
      />
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='truncate text-app font-semibold text-primary-token'>
            {agent.name}
          </p>
          <HudStatusPill
            label={PRESENCE_LABEL[agent.presence]}
            tone={PRESENCE_TONE[agent.presence]}
          />
        </div>
        <p className='truncate text-2xs text-tertiary-token'>
          {agent.role}
          {agent.lastAt ? ` · ${roomTimeAgo(agent.lastAt, now)}` : null}
          {agent.events24h > 0 ? ` · ${agent.events24h} today` : null}
        </p>
        {agent.presence === 'blocked' && agent.lastExcerpt ? (
          <p className='mt-1 line-clamp-2 text-2xs text-secondary-token'>
            {agent.lastExcerpt}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function EventRow({
  event,
  now,
}: Readonly<{ event: AgentRoomEventView; now: string }>) {
  const thread = event.thread.url ? (
    <a
      className='font-medium text-secondary-token hover:text-primary-token'
      href={event.thread.url}
      target='_blank'
      rel='noreferrer'
    >
      {event.thread.ref}
    </a>
  ) : (
    <span className='font-medium text-secondary-token'>{event.thread.ref}</span>
  );
  return (
    <li
      className='flex items-start gap-3 px-3 py-3'
      data-testid='agent-room-event'
      data-kind={event.kind}
    >
      <UserAvatar name={event.agentName} size='sm' />
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs'>
          <span className='text-app font-semibold text-primary-token'>
            {event.agentName}
          </span>
          {event.toName ? (
            <span className='text-tertiary-token'>to {event.toName}</span>
          ) : null}
          <span className='text-tertiary-token'>in</span>
          {thread}
          <time
            className='ml-auto tabular-nums text-tertiary-token'
            dateTime={event.at}
          >
            {roomTimeAgo(event.at, now)}
          </time>
        </div>
        {event.thread.title ? (
          <p className='truncate text-2xs text-tertiary-token'>
            {event.thread.title}
          </p>
        ) : null}
        <p
          className={
            event.kind === 'error'
              ? 'mt-1 text-app text-primary-token break-words'
              : 'mt-1 text-app text-secondary-token break-words'
          }
        >
          {event.kind === 'error' ? (
            <span className='mr-2 inline-block align-middle'>
              <HudStatusPill label='Failed' tone='bad' />
            </span>
          ) : null}
          {event.excerpt}
        </p>
      </div>
    </li>
  );
}

export interface AgentRoomProps {
  readonly view: AgentRoomView;
  /** Shown when the store could not be read; the roster still renders. */
  readonly unavailableReason?: string | null;
  /** Optional composer under the feed; the room itself never sends. */
  readonly composer?: ReactNode;
}

export function AgentRoom({
  view,
  unavailableReason,
  composer,
}: Readonly<AgentRoomProps>) {
  const now = view.generatedAt;
  return (
    <div
      className='grid gap-3 lg:grid-cols-3'
      data-testid='agent-room'
      data-room-id={view.roomId}
    >
      <ContentSurfaceCard
        surface='details'
        as='section'
        aria-label='Agents'
        className='min-w-0'
      >
        <div className='flex items-center justify-between gap-2 px-3 pt-3'>
          <h2 className='text-2xs font-semibold text-balance text-tertiary-token'>
            Agents
          </h2>
          <p className='text-2xs tabular-nums text-tertiary-token'>
            {view.counts.active} active
            {view.counts.blocked > 0 ? ` · ${view.counts.blocked} blocked` : ''}
          </p>
        </div>
        <ul className='divide-y divide-subtle py-1'>
          {view.agents.map(agent => (
            <AgentRow key={agent.id} agent={agent} now={now} />
          ))}
        </ul>
      </ContentSurfaceCard>

      <ContentSurfaceCard
        surface='details'
        as='section'
        aria-label='Activity'
        className='min-w-0 lg:col-span-2'
      >
        <div className='flex items-center justify-between gap-2 px-3 pt-3'>
          <h2 className='text-2xs font-semibold text-balance text-tertiary-token'>
            Activity
          </h2>
          <p className='text-2xs tabular-nums text-tertiary-token'>
            {view.counts.events24h} in the last 24 hours
          </p>
        </div>
        {unavailableReason ? (
          <p className='px-3 py-3 text-2xs text-secondary-token' role='status'>
            {unavailableReason}
          </p>
        ) : null}
        {view.events.length === 0 && !unavailableReason ? (
          <p className='px-3 py-6 text-app text-secondary-token' role='status'>
            No fleet messages yet. Agents appear here when they post in a fleet
            Linear thread and name who the message is from and to.
          </p>
        ) : (
          <ol className='divide-y divide-subtle py-1'>
            {view.events.map(event => (
              <EventRow key={event.id} event={event} now={now} />
            ))}
          </ol>
        )}
        {composer}
      </ContentSurfaceCard>
    </div>
  );
}

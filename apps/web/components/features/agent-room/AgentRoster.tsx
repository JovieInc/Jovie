import type {
  AgentRoomAgentView,
  AgentRoomPresence,
} from '@jovie/agent-transport-contracts/agent-room';
import { UserAvatar } from '@jovie/ui';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { cn } from '@/lib/utils';

/**
 * The canonical dense agent roster row set (JOV-12641): one ~44px row per
 * participant showing name, platform role, and trustworthy presence state.
 * Presence semantics live here so every roster surface (Agents page, fleet
 * Room) reads liveness, recency, and blocked failures the same way.
 */

export const AGENT_PRESENCE_LABEL: Record<AgentRoomPresence, string> = {
  active: 'Active',
  recent: 'Today',
  quiet: 'Quiet',
  blocked: 'Blocked',
  unseen: 'Not seen',
};

export const AGENT_PRESENCE_TONE = {
  active: 'good',
  recent: 'neutral',
  quiet: 'neutral',
  blocked: 'bad',
  unseen: 'neutral',
} as const satisfies Record<
  AgentRoomPresence,
  'good' | 'warning' | 'bad' | 'neutral'
>;

export const AGENT_PRESENCE_DOT = {
  active: 'online',
  recent: 'away',
  quiet: 'offline',
  blocked: 'offline',
  unseen: undefined,
} as const;

function AgentRosterRow({ agent }: Readonly<{ agent: AgentRoomAgentView }>) {
  return (
    <li
      className='flex min-h-11 items-center gap-3 px-3 py-1.5'
      data-testid='agent-room-agent'
      data-agent-id={agent.id}
      data-presence={agent.presence}
    >
      <UserAvatar
        name={agent.name}
        size='sm'
        status={AGENT_PRESENCE_DOT[agent.presence]}
      />
      <div className='min-w-0 flex-1'>
        <div className='flex items-baseline gap-2'>
          <p className='truncate text-app font-semibold text-primary-token'>
            {agent.name}
          </p>
          <p className='truncate text-2xs text-tertiary-token'>{agent.role}</p>
        </div>
        {agent.presence === 'blocked' && agent.lastExcerpt ? (
          <p className='mt-0.5 line-clamp-2 text-2xs text-secondary-token'>
            {agent.lastExcerpt}
          </p>
        ) : null}
      </div>
      <HudStatusPill
        label={AGENT_PRESENCE_LABEL[agent.presence]}
        tone={AGENT_PRESENCE_TONE[agent.presence]}
      />
    </li>
  );
}

export interface AgentRosterProps {
  readonly agents: readonly AgentRoomAgentView[];
  readonly className?: string;
}

/**
 * Dense agent roster. Presentational only: it takes the projected room view's
 * agents and never fetches. The list is the scroll region's content — pane
 * scroll ownership is decided by the caller through `className`.
 */
export function AgentRoster({ agents, className }: Readonly<AgentRosterProps>) {
  return (
    <ul
      className={cn('divide-y divide-subtle py-1', className)}
      data-testid='agent-roster'
    >
      {agents.map(agent => (
        <AgentRosterRow key={agent.id} agent={agent} />
      ))}
    </ul>
  );
}

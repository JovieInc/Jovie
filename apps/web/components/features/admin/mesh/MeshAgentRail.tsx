'use client';

import { Button } from '@jovie/ui';
import { Network, Send } from 'lucide-react';
import { AdminDetailRail } from '@/components/features/admin/layout/AdminDetailRail';
import {
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
} from '@/components/molecules/drawer';
import type {
  EntityCardModel,
  EntityStatusTone,
} from '@/components/organisms/entity-card';
import { EntityCard } from '@/components/organisms/entity-card';
import type { MeshAgentSnapshot } from '@/lib/ovie/mesh/types';

export interface MeshAgentRailProps {
  readonly agent: MeshAgentSnapshot | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onPing: (agentId: string) => void;
  readonly pingPending: boolean;
}

function formatMeshTimestamp(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function statusTone(status: MeshAgentSnapshot['status']): EntityStatusTone {
  if (status === 'live') return 'live';
  if (status === 'stale') return 'scheduled';
  return 'neutral';
}

/** The agent's EntityCard, built with the shared card adapter vocabulary. */
export function meshAgentToEntityCard(
  agent: MeshAgentSnapshot
): EntityCardModel {
  return {
    id: `mesh-agent-${agent.id}`,
    kind: 'ai',
    eyebrow: 'Mesh Agent',
    title: agent.label,
    meta: `Receive mode: ${agent.receiveMode}`,
    status: {
      label:
        agent.status === 'unknown'
          ? 'Status unknown'
          : agent.status === 'live'
            ? 'Active'
            : 'Stale',
      tone: statusTone(agent.status),
    },
    interactive: true,
    imageAlt: '',
  };
}

function UnknownNote({ children }: { readonly children: string }) {
  return <span className='text-tertiary-token'>{children}</span>;
}

/**
 * Right rail for one mesh agent (JOV-8937): EntityCard plus the last few
 * messages, open asks, and watcher-log gaps. Read-only except the ping.
 */
export function MeshAgentRail({
  agent,
  isOpen,
  onClose,
  onPing,
  pingPending,
}: Readonly<MeshAgentRailProps>) {
  return (
    <AdminDetailRail
      isOpen={isOpen}
      ariaLabel='Mesh agent details'
      data-testid='mesh-agent-rail'
      hideMinimalHeaderBar
      onKeyDown={keyboardEvent => {
        if (keyboardEvent.key === 'Escape') onClose();
      }}
      entityHeader={
        <EntityHeader
          thumbnail={
            <EntityHeaderThumbnail
              variant='person'
              name={agent?.label ?? 'Agent'}
              icon={<Network className='size-4' aria-hidden='true' />}
              size={40}
            />
          }
          eyebrow='Mesh Agent'
          title={agent?.label ?? 'Agent'}
          subtitle={agent ? `Receive mode: ${agent.receiveMode}` : undefined}
          actions={
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => agent && onPing(agent.id)}
              disabled={pingPending || !agent}
              data-testid='mesh-ping-button'
            >
              <Send className='size-3.5' aria-hidden='true' />
              Ping
            </Button>
          }
          bodyClassName='pr-8'
        />
      }
    >
      {agent ? (
        <>
          <DrawerSection
            sectionKind='facts'
            title='Agent'
            collapsible={false}
            surface='card'
          >
            <EntityCard
              model={meshAgentToEntityCard(agent)}
              treatment='detailed'
              className='w-full'
              dataTestId='mesh-agent-entity-card'
            />
          </DrawerSection>
          <DrawerSection
            sectionKind='status'
            title='Mailbox'
            collapsible={false}
            surface='card'
          >
            {agent.recentMessages === null ? (
              <UnknownNote>Mailbox unavailable.</UnknownNote>
            ) : agent.recentMessages.length === 0 ? (
              <UnknownNote>No recent messages.</UnknownNote>
            ) : (
              <ul className='space-y-1.5' aria-label='Recent Mesh Messages'>
                {agent.recentMessages.slice(0, 5).map(message => (
                  <li
                    key={`${message.direction}-${message.at ?? 'unknown'}-${message.summary}`}
                    className='text-xs text-secondary-token'
                    data-testid='mesh-mailbox-message'
                  >
                    <span className='text-tertiary-token'>
                      {message.direction === 'sent' ? 'To agent' : 'From agent'}
                      {' · '}
                      {formatMeshTimestamp(message.at)}
                    </span>
                    <span className='block'>{message.summary}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs'>
              <div>
                <dt className='text-tertiary-token'>Last sent</dt>
                <dd className='text-secondary-token'>
                  {formatMeshTimestamp(agent.lastSentAt)}
                </dd>
              </div>
              <div>
                <dt className='text-tertiary-token'>Last received</dt>
                <dd className='text-secondary-token'>
                  {formatMeshTimestamp(agent.lastReceivedAt)}
                </dd>
              </div>
            </dl>
          </DrawerSection>
          <DrawerSection
            sectionKind='details'
            title='Open asks'
            collapsible={false}
            surface='card'
          >
            {agent.waitingOnTim ? (
              <span
                className='text-xs text-secondary-token'
                data-testid='mesh-waiting-on-tim'
              >
                Waiting on Tim: {agent.waitingOnTim}
              </span>
            ) : (
              <UnknownNote>Nothing waiting on Tim.</UnknownNote>
            )}
          </DrawerSection>
          <DrawerSection
            sectionKind='details'
            title='Gaps'
            collapsible={false}
            surface='card'
          >
            {agent.gaps === null ? (
              <UnknownNote>Watcher log unavailable.</UnknownNote>
            ) : agent.gaps.length === 0 ? (
              <UnknownNote>No watcher gaps.</UnknownNote>
            ) : (
              <ul className='space-y-1.5' aria-label='Mesh Watcher Gaps'>
                {agent.gaps.map(gap => (
                  <li
                    key={gap}
                    className='text-xs text-secondary-token'
                    data-testid='mesh-watcher-gap'
                  >
                    {gap}
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>
        </>
      ) : (
        <DrawerSection
          sectionKind='details'
          title='Agent'
          collapsible={false}
          surface='card'
        >
          <UnknownNote>Select an agent to view its mesh details.</UnknownNote>
        </DrawerSection>
      )}
    </AdminDetailRail>
  );
}

'use client';

import { Input } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { AGENT_PRESENCE_LABEL } from '@/components/features/agent-room/AgentRoster';
import {
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
} from '@/components/molecules/drawer';
import { AdminDetailRail } from '@/features/admin/layout/AdminDetailRail';
import type { FleetAgentTableRow } from '@/lib/ovie/fleet-agents';

export interface FleetAgentRailProps {
  readonly row: FleetAgentTableRow | null;
  readonly displayName: string;
  readonly onDisplayNameChange: (name: string) => void;
  readonly onClose: () => void;
}

const STATUS_LABEL: Record<FleetAgentTableRow['status'], string> = {
  live: 'Live',
  degraded: 'Degraded',
  draft: 'Draft',
};

function statusTone(
  status: FleetAgentTableRow['status']
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (status === 'live') return 'good';
  if (status === 'degraded') return 'warning';
  return 'neutral';
}

export function FleetAgentRail({
  row,
  displayName,
  onDisplayNameChange,
  onClose,
}: FleetAgentRailProps) {
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => {
    setDraftName(displayName);
  }, [displayName, row?.id]);

  if (!row) {
    return (
      <AdminDetailRail
        isOpen={false}
        ariaLabel='Fleet agent profile'
        scrollStrategy='child'
        title='Agent profile'
        onClose={onClose}
        headerMode='minimal'
        isEmpty
        emptyMessage='Select an agent to view profile, status, and readiness gates.'
      >
        {null}
      </AdminDetailRail>
    );
  }

  const presence = row.presence;

  return (
    <AdminDetailRail
      isOpen
      ariaLabel={`${displayName} profile`}
      scrollStrategy='child'
      title={displayName}
      onClose={onClose}
      headerMode='minimal'
    >
      <EntityHeader
        title={displayName}
        subtitle={row.role}
        thumbnail={
          <EntityHeaderThumbnail variant='person' name={displayName} />
        }
        statusGlyph={
          <HudStatusPill
            label={STATUS_LABEL[row.status]}
            tone={statusTone(row.status)}
          />
        }
      />
      {presence ? (
        <p className='px-3 text-2xs text-tertiary-token'>
          Presence:{' '}
          <span className='text-secondary-token'>
            {AGENT_PRESENCE_LABEL[presence]}
          </span>
        </p>
      ) : null}

      <DrawerSection title='Display name'>
        <Input
          value={draftName}
          onChange={event => {
            const next = event.target.value;
            setDraftName(next);
            onDisplayNameChange(next);
          }}
          aria-label='Display Name'
          data-testid='fleet-agent-display-name'
        />
        <p className='mt-1.5 text-2xs text-tertiary-token'>
          Saves locally for now; persistence lands with fleet agent profiles.
        </p>
      </DrawerSection>

      <DrawerSection title='Fleet id'>
        <p className='font-mono text-xs text-secondary-token'>{row.fleetId}</p>
      </DrawerSection>

      <DrawerSection title='Readiness gaps'>
        <ul
          className='flex flex-col gap-2'
          data-testid='fleet-agent-readiness-gaps'
        >
          {row.readinessGaps.length === 0 ? (
            <li className='text-xs text-secondary-token'>No gaps on record.</li>
          ) : (
            row.readinessGaps.map(gap => (
              <li
                key={gap}
                className='flex items-center justify-between gap-2 text-xs'
              >
                <span className='text-primary-token'>{gap}</span>
                <span className='text-tertiary-token'>
                  Pending verification
                </span>
              </li>
            ))
          )}
        </ul>
      </DrawerSection>
    </AdminDetailRail>
  );
}

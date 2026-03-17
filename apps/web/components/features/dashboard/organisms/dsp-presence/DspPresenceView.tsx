'use client';

import { useState } from 'react';
import type { DspPresenceData } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceCard } from './DspPresenceCard';
import { DspPresenceEmptyState } from './DspPresenceEmptyState';
import { DspPresenceSidebar } from './DspPresenceSidebar';
import { DspPresenceSummary } from './DspPresenceSummary';

interface DspPresenceViewProps {
  readonly data: DspPresenceData;
}

export function DspPresenceView({ data }: DspPresenceViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const selectedItem =
    data.items.find(i => i.matchId === selectedMatchId) ?? null;

  if (data.items.length === 0) {
    return <DspPresenceEmptyState />;
  }

  return (
    <div className='flex h-full min-h-0 flex-row'>
      {/* Main content */}
      <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
        <DspPresenceSummary
          confirmedCount={data.confirmedCount}
          suggestedCount={data.suggestedCount}
          totalCount={data.items.length}
        />

        <div className='flex-1 min-h-0 overflow-y-auto p-4 lg:p-6'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {data.items.map(item => (
              <DspPresenceCard
                key={item.matchId}
                item={item}
                isSelected={item.matchId === selectedMatchId}
                onSelect={() =>
                  setSelectedMatchId(
                    item.matchId === selectedMatchId ? null : item.matchId
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>

      {/* Detail sidebar */}
      <DspPresenceSidebar
        item={selectedItem}
        onClose={() => setSelectedMatchId(null)}
      />
    </div>
  );
}

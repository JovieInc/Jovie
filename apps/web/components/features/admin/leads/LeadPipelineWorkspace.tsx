'use client';

import { useState } from 'react';
import { LeadKeywordsManager } from '@/features/admin/leads/LeadKeywordsManager';
import { LeadPipelineControls } from '@/features/admin/leads/LeadPipelineControls';
import { LeadTable } from '@/features/admin/leads/LeadTable';
import { UnifiedUrlIntake } from '@/features/admin/leads/UnifiedUrlIntake';

export function LeadPipelineWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] xl:items-start'>
        <div className='space-y-4'>
          <LeadPipelineControls />
          <UnifiedUrlIntake
            onSubmitted={() => setRefreshKey(value => value + 1)}
          />
        </div>
        <LeadKeywordsManager />
      </div>
      <LeadTable refreshKey={refreshKey} />
    </div>
  );
}

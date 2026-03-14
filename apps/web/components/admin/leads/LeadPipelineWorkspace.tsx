'use client';

import { useState } from 'react';
import { LeadKeywordsManager } from '@/components/admin/leads/LeadKeywordsManager';
import { LeadPipelineControls } from '@/components/admin/leads/LeadPipelineControls';
import { LeadTable } from '@/components/admin/leads/LeadTable';
import { UnifiedUrlIntake } from '@/components/admin/leads/UnifiedUrlIntake';

export function LeadPipelineWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className='space-y-4'>
      <LeadPipelineControls />
      <UnifiedUrlIntake onSubmitted={() => setRefreshKey(value => value + 1)} />
      <LeadKeywordsManager />
      <LeadTable refreshKey={refreshKey} />
    </div>
  );
}

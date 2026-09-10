'use client';

import { Download } from 'lucide-react';
import { OpportunityCard } from '@/components/organisms/opportunity-card/OpportunityCard';
import { useRuntimeUpdate } from '@/components/shell/RuntimeUpdateProvider';

export function InboxRuntimeNotification() {
  const update = useRuntimeUpdate();
  if (!update?.available) return null;
  return (
    <section
      aria-label='App Updates'
      className='mb-3'
      data-testid='inbox-runtime-notification'
    >
      <OpportunityCard
        format='compact'
        title={update.title}
        description={update.description}
        icon={<Download className='size-3.5' />}
        disabled={update.busy}
        onSelect={update.apply}
      />
    </section>
  );
}

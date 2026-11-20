'use client';

import { UtmBuilderDialog } from '@/components/features/profile/UtmBuilderDialog';
import { UTM_LINKS_FIXTURE } from '@/data/utmLinksCopy';
import './UtmLinksBuilder.css';

/**
 * Client island: the server page cannot pass dialog callbacks. The wrapper
 * reserves the builder's final height so the hero never shifts.
 */
export function UtmLinksBuilder() {
  return (
    <div className='utm-links-builder'>
      <UtmBuilderDialog
        embedded
        open
        baseUrl={UTM_LINKS_FIXTURE.baseUrl}
        initialValues={UTM_LINKS_FIXTURE.values}
      />
    </div>
  );
}

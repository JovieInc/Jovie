'use client';

import { UtmBuilderDialog } from '@/components/features/profile/UtmBuilderDialog';
import { UTM_LINKS_FIXTURE } from '@/data/utmLinksCopy';

/** Client island: the server page cannot pass dialog callbacks. */
export function UtmLinksBuilder() {
  return (
    <UtmBuilderDialog
      embedded
      open
      baseUrl={UTM_LINKS_FIXTURE.baseUrl}
      initialValues={UTM_LINKS_FIXTURE.values}
    />
  );
}

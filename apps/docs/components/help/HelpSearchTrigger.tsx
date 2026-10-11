'use client';

import { HelpCenterSearch } from '@/components/HelpCenterSearch';

/**
 * Stable search slot for the Help Center utility bar. Wraps the Pagefind-
 * backed `HelpCenterSearch` so the shell composition stays fixed while the
 * underlying engine can be restyled or replaced in one place.
 */
export function HelpSearchTrigger() {
  return (
    <search className='help-search'>
      <HelpCenterSearch variant='desktop-only' />
      <HelpCenterSearch variant='mobile-only' />
    </search>
  );
}

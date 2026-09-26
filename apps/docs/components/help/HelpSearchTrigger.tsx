'use client';

import { Search } from 'nextra/components';

/**
 * Stable search slot for the Help Center utility bar. Wraps the Nextra
 * Pagefind-backed `Search` so later issues can restyle or replace the
 * underlying engine without touching the shell composition.
 */
export function HelpSearchTrigger() {
  return (
    <search className='help-search'>
      <Search placeholder='Search Help Center…' className='help-search-input' />
    </search>
  );
}

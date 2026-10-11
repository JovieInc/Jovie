import { HelpNav } from './HelpNav';
import type { HelpNavItem } from './types';

/**
 * Fixed left rail on desktop. Hidden below the tablet breakpoint where the
 * drawer in `HelpNavDrawer` takes over navigation.
 */
export function HelpSidebar({ nav }: { nav: HelpNavItem[] }) {
  return (
    <nav aria-label='Help Center' className='help-sidebar'>
      <HelpNav nav={nav} />
    </nav>
  );
}

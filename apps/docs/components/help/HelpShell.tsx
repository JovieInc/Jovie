import type { ReactNode } from 'react';
import { HelpMain } from './HelpMain';
import { HelpSidebar } from './HelpSidebar';
import { HelpTopbar } from './HelpTopbar';
import type { HelpNavItem } from './types';

/**
 * Help Center product shell: a dark carbon field framing a warm near-white
 * rounded window with a utility bar, desktop nav rail, and article column.
 * Replaces the stock Nextra theme chrome while keeping the MDX content
 * engine untouched.
 */
export function HelpShell({
  nav,
  children,
}: {
  nav: HelpNavItem[];
  children: ReactNode;
}) {
  return (
    <div className='help-field'>
      <a className='help-skip' href='#help-main'>
        Skip to content
      </a>
      <div className='help-window'>
        <HelpTopbar nav={nav} />
        <div className='help-body'>
          <HelpSidebar nav={nav} />
          <HelpMain>{children}</HelpMain>
        </div>
      </div>
    </div>
  );
}

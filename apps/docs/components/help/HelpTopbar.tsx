import Link from 'next/link';
import { HelpNavDrawer } from './HelpNavDrawer';
import { HelpSearchTrigger } from './HelpSearchTrigger';
import { HelpThemeToggle } from './HelpThemeToggle';
import { JovieMark } from './JovieMark';
import type { HelpNavItem } from './types';

/**
 * Utility bar across the top of the Help Center window: brand, persistent
 * search, and utility links. Rendered once per layout so navigation and
 * search never shift between pages.
 */
export function HelpTopbar({ nav }: { nav: HelpNavItem[] }) {
  return (
    <header className='help-topbar'>
      <div className='help-topbar-side'>
        <HelpNavDrawer nav={nav} />
        <Link href='/' className='help-brand'>
          <JovieMark />
          <span className='help-brand-name'>Jovie</span>
          <span className='help-brand-sep' aria-hidden='true' />
          <span className='help-brand-product'>Help Center</span>
        </Link>
      </div>
      <div className='help-topbar-center'>
        <HelpSearchTrigger />
      </div>
      <div className='help-topbar-side help-topbar-actions'>
        <a
          className='help-topbar-link help-topbar-link-optional'
          href='https://jov.ie/changelog'
        >
          What&apos;s new
        </a>
        <a
          className='help-topbar-link help-topbar-cta'
          href='https://jov.ie/app'
        >
          Open Jovie
        </a>
        <HelpThemeToggle />
      </div>
    </header>
  );
}

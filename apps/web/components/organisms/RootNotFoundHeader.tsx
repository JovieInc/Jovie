import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

/**
 * Server-rendered twin of `<MarketingHeader variant='minimal' />`: the wordmark
 * and a Sign in link, with no state and no effects.
 *
 * The root `app/not-found.tsx` is part of every route's initial load, so its
 * chrome must not reach the `HeaderNav` client graph (auth client, user
 * menu, mobile nav, motion). Keep this file free of `'use client'` and of
 * client-only imports.
 *
 * - `root-not-found-chrome-parity.test.tsx` holds this markup equal to the
 *   minimal `MarketingHeader`; change both together.
 * - `root-not-found-client-graph.test.ts` fails if a heavy client module
 *   becomes reachable from the root 404.
 */
export function RootNotFoundHeader() {
  return (
    <header
      data-testid='header-nav'
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.header}
      data-presentation='default'
      className='header-nav fixed top-0 left-0 right-0 w-full transition-colors duration-subtle motion-reduce:transition-none border-b'
      style={{
        fontSynthesisWeight: 'none',
        borderColor: 'var(--linear-border-default)',
        backgroundColor: 'var(--linear-bg-header)',
        zIndex: 'var(--z-index-site-header)',
        backdropFilter: 'blur(var(--blur-header))',
        WebkitBackdropFilter: 'blur(var(--blur-header))',
        minWidth: 0,
        minHeight: 0,
        /* iOS safe area: push header content below the notch/Dynamic Island */
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <nav
        className='mx-auto w-full px-5 sm:px-6 max-w-public-content lg:px-0'
        aria-label='Primary Navigation'
      >
        <div className='flex h-(--linear-header-height) w-full items-center gap-3 sm:gap-4 md:gap-6'>
          <div className='flex items-center'>
            <LogoLink
              logoSize='xs'
              logoMarkSize='marketing'
              variant='word'
              className='rounded-md'
            />
          </div>

          <div className='flex-1' aria-hidden='true' />

          <div className='flex items-center gap-1'>
            {/* Plain link: client navigation still opens the root `@auth`
                intercepted sign-in, and a reload falls back to /signin. */}
            <Link
              href={APP_ROUTES.SIGNIN}
              prefetch={false}
              className='focus-ring-themed text-header-text-link hover:text-header-text-link-hover'
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

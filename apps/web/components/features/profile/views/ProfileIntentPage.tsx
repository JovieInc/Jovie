import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PROFILE_VIEW_REGISTRY, type ProfileViewKey } from './registry';

export interface ProfileIntentPageProps {
  readonly mode: Exclude<ProfileViewKey, 'profile'>;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly children: ReactNode;
}

/**
 * Routed-page wrapper around a `ProfileIntentView` body. Plan PR 3a-2b
 * flips the mode route files (`/[username]/listen`, `/pay`, …) off their
 * current 308-redirect-to-query-param pattern and onto this component, so
 * each surface becomes a real SSR'd page with self-canonical URL and
 * shareable chrome.
 *
 * Intentionally minimal for now:
 *
 * - Compact top chrome: back chevron to `/[handle]`, title (mode), subtitle
 *   (mode description from the registry). The title is the scan target.
 * - Body slot for the view component.
 *
 * Sibling-mode footer rail (plan spec for SEO internal linking on mobile
 * direct landings) is deliberately NOT here yet — it needs per-profile
 * visibility flags to hide data-less views, which the route files can
 * provide once they're wired in the next slice. Landing the rail
 * concurrently would put the "cut over to routed pages" and "polish the
 * new chrome" changes in the same diff and make both harder to review.
 */
export function ProfileIntentPage({
  mode,
  artistName,
  artistHandle,
  children,
}: ProfileIntentPageProps) {
  const entry = PROFILE_VIEW_REGISTRY[mode];

  return (
    <main className='mx-auto flex min-h-dvh w-full max-w-(--profile-shell-max-width) flex-col bg-[color:var(--profile-drawer-bg)] text-primary-token'>
      <header className='relative flex items-center gap-2.5 px-5 pb-3 pt-5'>
        <Link
          href={`/${artistHandle}`}
          className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-white/44 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
          aria-label={`Back to ${artistName}`}
          data-testid='profile-intent-page-back'
        >
          <ChevronLeft className='h-4 w-4' />
        </Link>
        <div className='min-w-0 flex-1'>
          <h1 className='truncate text-mid font-[590] leading-[1.08] tracking-[-0.018em] text-primary-token'>
            {entry.title}
          </h1>
          {entry.subtitle ? (
            <p className='mt-0.5 truncate text-3xs font-[440] leading-[1.1] tracking-[-0.01em] text-white/46'>
              {entry.subtitle}
            </p>
          ) : null}
        </div>
      </header>
      <div className='mx-5 h-px bg-white/[0.06]' />
      <section
        className='flex-1 overflow-y-auto px-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] pt-3'
        data-testid='profile-intent-page-body'
      >
        {children}
      </section>
    </main>
  );
}

import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';
import { APP_ROUTES } from '@/constants/routes';
import type { SharedView } from '@/lib/views/service.server';
import { SaveViewAction } from './SaveViewAction';
import { ViewAnalytics, ViewSignupCard } from './ViewAnalytics';
import { ViewRenderer } from './ViewRenderer';

type SharedViewPageView = Pick<SharedView, 'title' | 'spec' | 'updatedAt'>;

/** Dashboard-looking frame for a shared view; signed-in viewers can save it to their dashboards. */
export function SharedViewPage({
  view,
  token,
  signedIn,
  viewerOwnsView = false,
}: Readonly<{
  view: SharedViewPageView;
  token: string;
  signedIn: boolean;
  viewerOwnsView?: boolean;
}>) {
  return (
    <div className='flex min-h-dvh bg-base text-primary-token'>
      <ViewAnalytics signedIn={signedIn} />
      <div
        aria-hidden='true'
        className='hidden w-14 shrink-0 border-r border-subtle bg-surface-0 md:block'
      />
      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='flex items-center gap-3 border-b border-subtle px-4 py-3'>
          <LogoLink href='/' logoSize='xs' />
          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-medium'>{view.title}</h1>
            <p className='text-2xs text-tertiary-token'>
              Updated{' '}
              <time dateTime={view.updatedAt.toISOString()}>
                {view.updatedAt.toISOString().slice(0, 10)}
              </time>
            </p>
          </div>
          {signedIn ? (
            <SaveViewAction token={token} viewerOwnsView={viewerOwnsView} />
          ) : (
            <Link
              href={APP_ROUTES.SIGNIN}
              className='text-xs text-secondary-token hover:text-primary-token'
            >
              Sign in
            </Link>
          )}
        </header>
        <main className='mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6'>
          {view.spec.description ? (
            <p className='text-sm tabular-nums text-secondary-token'>
              {view.spec.description}
            </p>
          ) : null}
          {signedIn ? null : <ViewSignupCard />}
          <ViewRenderer spec={view.spec} />
        </main>
      </div>
    </div>
  );
}

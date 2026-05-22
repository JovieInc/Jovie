import Link from 'next/link';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function NotFound() {
  return (
    <PublicPageShell mainClassName='bg-[color:var(--profile-stage-bg)] text-white'>
      <div
        data-testid='not-found'
        className='profile-viewport flex min-h-[calc(100dvh-var(--public-shell-header-offset))] items-center justify-center px-4 py-12'
      >
        <div className='w-full max-w-sm rounded-[var(--profile-card-radius)] border border-[color:var(--profile-panel-border)] bg-[color:var(--profile-content-bg)] px-5 py-6 text-center shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl'>
          <p className='text-[11px] font-medium tracking-[0.02em] text-white/42'>
            404
          </p>
          <h1 className='mt-2 text-[18px] font-semibold tracking-[-0.018em] text-white'>
            Profile not found
          </h1>
          <p className='mx-auto mt-2 max-w-[26ch] text-[13px] leading-5 text-white/56'>
            This profile may have moved or the link may be incorrect.
          </p>

          <div className='mt-5 flex justify-center'>
            <Link
              href='/'
              className='inline-flex h-10 items-center justify-center rounded-[var(--profile-action-radius)] bg-white px-4 text-[13px] font-semibold tracking-[-0.005em] text-black transition-opacity duration-subtle hover:opacity-90'
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}

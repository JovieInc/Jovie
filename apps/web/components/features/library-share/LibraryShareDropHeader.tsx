import Image from 'next/image';
import { DEFAULT_LIBRARY_SHARE_ACCENT } from '@/lib/library-share/constants';
import type { LibraryShareDropPublicView } from '@/lib/library-share/types';

interface LibraryShareDropHeaderProps {
  readonly view: Pick<
    LibraryShareDropPublicView,
    | 'title'
    | 'message'
    | 'artistName'
    | 'artistAvatarUrl'
    | 'logoUrl'
    | 'accentColor'
    | 'assets'
  >;
}

export function LibraryShareDropHeader({ view }: LibraryShareDropHeaderProps) {
  const accent = view.accentColor ?? DEFAULT_LIBRARY_SHARE_ACCENT;
  const logo = view.logoUrl ?? view.artistAvatarUrl;

  return (
    <header
      className='border-b border-subtle px-4 py-8 sm:px-6 lg:px-8'
      data-testid='library-share-drop-header'
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 12%, transparent), transparent)`,
      }}
    >
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='flex min-w-0 items-center gap-4'>
          {logo ? (
            <Image
              src={logo}
              alt=''
              width={56}
              height={56}
              className='h-14 w-14 rounded-2xl border border-subtle object-cover'
            />
          ) : (
            <span
              className='grid h-14 w-14 place-items-center rounded-2xl border border-subtle text-lg font-semibold text-primary-token'
              style={{
                background: `color-mix(in srgb, ${accent} 18%, transparent)`,
              }}
              aria-hidden='true'
            >
              {view.artistName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className='min-w-0'>
            <p className='text-xs font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
              Press kit · {view.artistName}
            </p>
            <h1 className='mt-1 truncate text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'>
              {view.title}
            </h1>
            {view.message ? (
              <p className='mt-2 max-w-2xl text-sm leading-6 text-secondary-token'>
                {view.message}
              </p>
            ) : null}
          </div>
        </div>
        <p className='shrink-0 text-sm text-tertiary-token'>
          {view.assets.length} asset{view.assets.length === 1 ? '' : 's'}
        </p>
      </div>
    </header>
  );
}

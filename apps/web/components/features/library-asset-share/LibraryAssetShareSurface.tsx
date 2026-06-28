'use client';

import { ExternalLink, Lock, Unlock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { LibraryAssetSharePublicView } from '@/lib/library/asset-share';
import { formatLibraryAssetVisibility } from '@/lib/library/asset-share';
import { cn } from '@/lib/utils';

export function LibraryAssetShareSurface({
  view,
}: {
  readonly view: LibraryAssetSharePublicView;
}) {
  const primaryHref = view.smartLinkPath ?? null;

  return (
    <main className='mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6'>
      <header className='space-y-2'>
        <p className='text-3xs uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          Shared Asset
        </p>
        <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
          {view.title}
        </h1>
        <p className='text-sm text-secondary-token'>{view.artistName}</p>
      </header>

      {view.artworkUrl ? (
        <div className='relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-subtle'>
          <Image
            src={view.artworkUrl}
            alt={`${view.title} artwork`}
            fill
            sizes='(max-width: 640px) 100vw, 384px'
            className='object-cover'
            unoptimized
          />
        </div>
      ) : null}

      <div
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs',
          view.visibility === 'public'
            ? 'border-emerald-400/30 text-emerald-300'
            : 'border-amber-400/30 text-amber-200'
        )}
      >
        {view.visibility === 'public' ? (
          <Unlock className='h-3 w-3' strokeWidth={2.25} />
        ) : (
          <Lock className='h-3 w-3' strokeWidth={2.25} />
        )}
        {formatLibraryAssetVisibility(view.visibility)} link
      </div>

      <div className='flex flex-wrap gap-2'>
        {primaryHref ? (
          <Link
            href={primaryHref}
            className='system-b-library-action system-b-library-action--standard inline-flex items-center gap-1.5 border border-subtle px-3 py-2 text-sm'
          >
            Open Release
            <ExternalLink className='h-3.5 w-3.5' />
          </Link>
        ) : null}
        {view.previewUrl ? (
          <audio controls preload='none' className='w-full'>
            <source src={view.previewUrl} />
            <track kind='captions' />
          </audio>
        ) : null}
      </div>
    </main>
  );
}

import { ArrowUpRight, Bell } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { PublishedCoverageView } from '@/lib/press/coverage';

/**
 * Owned press-coverage page (press-to-audience pilot arm B, JOV-7408).
 *
 * Makes the two roles unmistakable: the publisher wrote the story, the
 * creator curated this introduction. No impersonation, no paywall bypass,
 * no subscription wall in front of the source link.
 */
export function PressCoverageSurface({
  view,
}: {
  readonly view: PublishedCoverageView;
}) {
  const { creator } = view;
  const publisher = view.publisherName ?? view.publisherDomain;
  const publishedDate = view.publishedAt
    ? new Date(view.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <main className='mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6'>
      <header className='flex items-center gap-3'>
        {creator.avatarUrl ? (
          <Image
            src={creator.avatarUrl}
            alt=''
            width={40}
            height={40}
            className='h-10 w-10 rounded-full object-cover'
            unoptimized
          />
        ) : null}
        <div>
          <p className='text-3xs uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
            Press · shared by {creator.displayName}
          </p>
          <p className='text-sm text-secondary-token'>
            Curated on Jovie — the original story lives at{' '}
            {view.publisherDomain}.
          </p>
        </div>
      </header>

      <article className='rounded-xl border border-subtle bg-(--linear-bg-surface) p-5 space-y-4'>
        <p className='text-2xs font-medium uppercase tracking-[0.08em] text-quaternary-token'>
          {publisher}
          {publishedDate ? ` · ${publishedDate}` : ''}
        </p>
        {view.headline ? (
          <h1 className='text-xl font-semibold tracking-tight text-primary-token'>
            {view.headline}
          </h1>
        ) : (
          <h1 className='text-xl font-semibold tracking-tight text-primary-token'>
            Coverage of {creator.displayName} in {publisher}
          </h1>
        )}
        {view.excerpt ? (
          <blockquote className='border-l-2 border-subtle pl-3 text-sm text-secondary-token'>
            <span className='sr-only'>
              {view.excerptKind === 'excerpt'
                ? `Excerpt from ${publisher}`
                : `Summary by ${creator.displayName}`}
            </span>
            {view.excerpt}
          </blockquote>
        ) : null}
      </article>

      <div className='flex flex-col gap-2 sm:flex-row'>
        {view.outboundPath ? (
          <a
            href={view.outboundPath}
            className='inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
          >
            Read on {publisher}
            <ArrowUpRight className='h-4 w-4' aria-hidden />
          </a>
        ) : (
          <a
            href={view.sourceUrl}
            rel='nofollow noopener noreferrer'
            className='inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
          >
            Read on {publisher}
            <ArrowUpRight className='h-4 w-4' aria-hidden />
          </a>
        )}
        <Link
          href={`/${creator.usernameNormalized}?mode=subscribe`}
          className='inline-flex items-center justify-center gap-1.5 rounded-lg border border-subtle px-4 py-2.5 text-sm font-medium text-primary-token transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
        >
          <Bell className='h-4 w-4' aria-hidden />
          Get my next release
        </Link>
      </div>

      <p className='text-2xs text-quaternary-token'>
        {creator.displayName} shared this coverage on Jovie. You can go straight
        to the original article — no sign-up required.
      </p>
    </main>
  );
}

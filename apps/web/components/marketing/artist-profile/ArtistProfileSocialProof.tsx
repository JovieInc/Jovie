import Link from 'next/link';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileSocialProofProps {
  readonly socialProof: ArtistProfileLandingCopy['socialProof'];
  readonly proofData: ArtistProfileSocialProofData;
}

export function ArtistProfileSocialProof({
  socialProof,
  proofData,
}: Readonly<ArtistProfileSocialProofProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='max-w-[34rem]'>
        <h2 aria-label={socialProof.headline} className={SHELL_H2_CLASS}>
          <span className='block'>Built by an artist.</span>
          <span className='block'>For artists.</span>
        </h2>
        <p className={cn(SHELL_LEAD_CLASS, 'mt-5 max-w-[30rem] sm:mt-6')}>
          {socialProof.intro}
        </p>
      </div>

      {proofData.hasRealQuotes ? (
        <div className='mt-6 grid gap-4 lg:grid-cols-3'>
          {proofData.quotes.map(quote => (
            <article
              key={quote.id}
              className='rounded-[1.1rem] bg-white/[0.018] p-5'
            >
              <p className='text-sm leading-[1.7] text-primary-token'>
                {quote.quote}
              </p>
              <p className='mt-5 text-app font-medium text-primary-token'>
                {quote.name}
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>{quote.role}</p>
            </article>
          ))}
        </div>
      ) : null}

      {!proofData.hasRealQuotes && proofData.founderQuote ? (
        <article className='mx-auto mt-6 max-w-280 overflow-hidden rounded-[1.9rem] border border-black/10 bg-white dark:bg-surface-1 px-6 py-6 text-black dark:text-white shadow-[0_22px_60px_rgba(0,0,0,0.16)] sm:px-8 sm:py-7 lg:px-10 lg:py-8'>
          <blockquote className='max-w-3xl text-pretty text-[clamp(1.375rem,2.4vw,2rem)] font-semibold leading-[1.18] tracking-[-0.025em] text-black dark:text-white'>
            “{proofData.founderQuote.quote}”
          </blockquote>
          <div className='mt-6 flex flex-col gap-1 text-left'>
            <p className='text-sm font-medium tracking-[-0.02em] text-black dark:text-white'>
              {proofData.founderQuote.name}
            </p>
            <p className='text-xs tracking-[-0.01em] text-secondary-token'>
              {proofData.founderQuote.role}
            </p>
            <Link
              href={proofData.founderQuote.profileHref}
              className='mt-3 inline-flex w-fit font-mono text-xs tracking-[-0.02em] text-secondary-token transition-colors hover:text-primary-token'
            >
              {proofData.founderQuote.profileLabel}
            </Link>
          </div>
        </article>
      ) : null}

      {!proofData.hasRealQuotes && !proofData.founderQuote ? (
        <p className='mt-6 text-app leading-[1.65] text-tertiary-token'>
          {proofData.founderFallback}
        </p>
      ) : null}
    </ArtistProfileSectionShell>
  );
}

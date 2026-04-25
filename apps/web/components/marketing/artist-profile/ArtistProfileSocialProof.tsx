import Link from 'next/link';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
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
        <h2
          aria-label={socialProof.headline}
          className='max-w-none text-[clamp(2.8rem,5vw,4.1rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'
        >
          <span className='block'>Real Artists.</span>
          <span className='mt-1 block'>Real Workflows.</span>
        </h2>
        <p className='mt-5 max-w-[28rem] text-[clamp(1rem,1.55vw,1.16rem)] leading-[1.65] tracking-[-0.02em] text-secondary-token'>
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
              <p className='text-[14px] leading-[1.7] text-primary-token'>
                {quote.quote}
              </p>
              <p className='mt-5 text-[13px] font-medium text-primary-token'>
                {quote.name}
              </p>
              <p className='mt-1 text-[12px] text-tertiary-token'>
                {quote.role}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {!proofData.hasRealQuotes && proofData.founderQuote ? (
        <article className='mx-auto mt-8 max-w-[1120px] overflow-hidden rounded-[1.9rem] border border-black/10 bg-white px-6 py-7 text-black shadow-[0_22px_60px_rgba(0,0,0,0.16)] sm:px-8 sm:py-9 lg:px-10 lg:py-10'>
          <blockquote className='max-w-[50rem] text-pretty text-[clamp(1.45rem,2.7vw,2.35rem)] font-semibold leading-[1.12] tracking-[-0.045em] text-black'>
            “{proofData.founderQuote.quote}”
          </blockquote>
          <div className='mt-6 flex flex-col gap-1 text-left'>
            <p className='text-[14px] font-medium tracking-[-0.02em] text-black'>
              {proofData.founderQuote.name}
            </p>
            <p className='text-[12px] tracking-[-0.01em] text-black/56'>
              {proofData.founderQuote.role}
            </p>
            <Link
              href={proofData.founderQuote.profileHref}
              className='mt-3 inline-flex w-fit font-mono text-[12px] tracking-[-0.02em] text-black/56 transition-colors hover:text-black'
            >
              {proofData.founderQuote.profileLabel}
            </Link>
          </div>
        </article>
      ) : null}

      {!proofData.hasRealQuotes && !proofData.founderQuote ? (
        <p className='mt-6 text-[13px] leading-[1.65] text-tertiary-token'>
          {proofData.founderFallback}
        </p>
      ) : null}
    </ArtistProfileSectionShell>
  );
}

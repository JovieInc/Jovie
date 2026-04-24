import Image from 'next/image';
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
          className='max-w-none text-[clamp(2.7rem,5.25vw,4.6rem)] font-[650] leading-[0.94] tracking-[-0.072em] text-primary-token'
        >
          <span className='block'>Real Artists.</span>
          <span className='mt-1 block'>Real Workflows.</span>
        </h2>
        <p className='mt-5 max-w-[28rem] text-[clamp(1rem,1.55vw,1.16rem)] leading-[1.65] tracking-[-0.02em] text-secondary-token'>
          {socialProof.intro}
        </p>
      </div>

      <div className='mx-auto mt-8 grid max-w-[1120px] gap-4 lg:grid-cols-3'>
        {proofData.profileCards.map(card => (
          <article
            key={card.id}
            className='overflow-hidden rounded-[1.15rem] bg-white/[0.018]'
          >
            <div className='relative aspect-[4/3]'>
              <Image
                src={card.src}
                alt={`${card.name} profile image`}
                fill
                sizes='(max-width: 1024px) 100vw, 360px'
                className='object-cover'
              />
              <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,0.06),rgba(8,9,12,0.72)_100%)]' />
              <div className='absolute inset-x-0 bottom-0 z-10 p-5'>
                <p className='font-mono text-[12px] tracking-[-0.02em] text-white/70'>
                  jov.ie/{card.handle}
                </p>
                <p className='mt-2 text-[20px] font-medium tracking-[-0.02em] text-white'>
                  {card.name}
                </p>
                <p className='mt-2 text-[13px] leading-[1.6] text-white/72'>
                  {card.supportingLine}
                </p>
              </div>
            </div>
          </article>
        ))}
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
        <article className='mx-auto mt-6 max-w-[1120px] overflow-hidden rounded-[1.9rem] border border-black/10 bg-white px-6 py-6 text-black shadow-[0_22px_60px_rgba(0,0,0,0.16)] sm:px-8 sm:py-7 lg:px-10 lg:py-8'>
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

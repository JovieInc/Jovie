import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
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
    <ArtistProfileSectionShell className='py-24 sm:py-28 lg:py-32'>
      <ArtistProfileSectionHeader
        align='center'
        headline={socialProof.headline}
        body={socialProof.intro}
        className='max-w-[40rem]'
        bodyClassName='mx-auto max-w-[30rem]'
        headlineClassName='max-w-[11ch] text-[clamp(2.8rem,5vw,4.3rem)]'
      />

      <div className='mx-auto mt-10 grid max-w-[1120px] gap-4 lg:grid-cols-3'>
        {proofData.profileCards.map(card => (
          <article
            key={card.id}
            className='overflow-hidden rounded-[1.25rem] bg-white/[0.02]'
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
              className='rounded-[1.15rem] bg-white/[0.02] p-5'
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

      {!proofData.hasRealQuotes ? (
        <p className='mt-6 text-[13px] leading-[1.65] text-tertiary-token'>
          {proofData.founderFallback}
        </p>
      ) : null}
    </ArtistProfileSectionShell>
  );
}

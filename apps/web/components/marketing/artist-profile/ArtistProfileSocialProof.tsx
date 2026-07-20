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
  if (!proofData.hasRealQuotes) {
    return null;
  }

  return (
    <ArtistProfileSectionShell>
      <ArtistProfileSectionHeader
        align='left'
        headline={socialProof.headline}
        body={socialProof.intro}
        className='max-w-3xl'
      />

      <div className='mt-10 grid gap-4 lg:grid-cols-3'>
        {proofData.quotes.map(quote => (
          <article key={quote.id} className='border-t border-subtle pt-5'>
            <p className='text-sm leading-relaxed text-primary-token'>
              {quote.quote}
            </p>
            <p className='mt-6 text-app font-semibold text-primary-token'>
              {quote.name}
            </p>
            <p className='mt-1 text-xs text-tertiary-token'>{quote.role}</p>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}

import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import type { FeaturedCreator } from '@/lib/featured-creators';

interface HomeLiveProofSectionProps {
  readonly creators: readonly FeaturedCreator[];
}

function getSupportingLine(creator: FeaturedCreator): string {
  if (creator.latestReleaseTitle) {
    return creator.latestReleaseType
      ? `${creator.latestReleaseType} · ${creator.latestReleaseTitle}`
      : creator.latestReleaseTitle;
  }

  if (creator.tagline) {
    return creator.tagline;
  }

  return 'Artist profile live on Jovie';
}

function ProofCard({
  creator,
  featured = false,
}: Readonly<{
  creator: FeaturedCreator;
  featured?: boolean;
}>) {
  return (
    <Link
      href={`/${creator.handle}`}
      className={`homepage-proof-tile focus-ring-themed group ${
        featured ? 'md:col-span-2 md:min-h-[26rem]' : 'min-h-[16rem]'
      }`}
    >
      <div className='absolute inset-0'>
        <Image
          src={creator.src}
          alt={`${creator.name} profile photo`}
          fill
          sizes={
            featured
              ? '(max-width: 767px) 100vw, 900px'
              : '(max-width: 767px) 100vw, 420px'
          }
          className='object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]'
        />
      </div>
      <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,12,0.12),rgba(5,7,12,0.3)_35%,rgba(5,7,12,0.82)_100%)]' />

      <div className='relative z-10 flex h-full flex-col justify-between p-5 sm:p-6'>
        <div className='flex items-start justify-between gap-3'>
          <div className='homepage-proof-chip'>Live Profile</div>
          <div className='homepage-proof-icon-wrap'>
            <ArrowUpRight className='h-4 w-4' />
          </div>
        </div>

        <div className='homepage-proof-caption'>
          <p className='text-[12px] font-[540] text-white/56'>
            jov.ie/{creator.handle}
          </p>
          <p className='mt-2 text-[1.55rem] font-[620] tracking-[-0.03em] text-primary-token'>
            {creator.name}
          </p>
          <p className='mt-2 max-w-[26rem] text-[13px] leading-[1.65] text-white/64'>
            {getSupportingLine(creator)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function HomeLiveProofSection({
  creators,
}: Readonly<HomeLiveProofSectionProps>) {
  const [featured, ...supporting] = creators;

  if (!featured) {
    return null;
  }

  return (
    <section
      id='homepage-live-proof'
      data-testid='homepage-live-proof'
      className='border-t border-subtle bg-page py-20 sm:py-24 lg:py-28'
      aria-labelledby='homepage-live-proof-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='max-w-[34rem]'>
            <h2
              id='homepage-live-proof-heading'
              className='marketing-h2-linear text-primary-token'
            >
              See it live.
            </h2>
            <p className='mt-4 max-w-[31rem] text-[15px] leading-[1.7] text-secondary-token sm:text-[16px]'>
              Real artist profiles. Real release moments.
            </p>
          </div>

          <div className='homepage-proof-board mt-10 grid gap-4 md:grid-cols-2'>
            <ProofCard creator={featured} featured />
            {supporting.map(creator => (
              <ProofCard
                key={`${creator.id}-${creator.handle}`}
                creator={creator}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

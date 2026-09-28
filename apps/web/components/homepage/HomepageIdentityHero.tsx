// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx
import Image from 'next/image';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import {
  MarketingHero,
  MarketingHeroPhoto,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import './HomepageIdentity.css';

export type HomepageIdentityHeroCopy = typeof HOMEPAGE_IDENTITY_COPY.hero;

export interface HomepageIdentityHeroProps {
  readonly copy?: HomepageIdentityHeroCopy;
  readonly headingId?: string;
}

const HERO_TEXTURE = {
  src: '/assets/generated/homepage-hero-technical-texture-v1.webp',
  width: 1600,
  height: 900,
} as const;

const PREVIEW_PORTRAIT = '/assets/generated/homepage-identity-portrait-v1.webp';

/**
 * Homepage identity + link-claim hero (Pen STAGING Cyuz2 / xm2iz, Tim
 * 2026-09-28): one headline, one support line, and an illustrative claimed
 * page whose only action is claiming jov.ie/you. No product screenshot and
 * nothing single-ICP on the homepage.
 */
export function HomepageIdentityHero({
  copy = HOMEPAGE_IDENTITY_COPY.hero,
  headingId = 'homepage-identity-hero-heading',
}: HomepageIdentityHeroProps) {
  const { preview, claim } = copy;

  return (
    <div
      className='homepage-claim-hero marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'
      data-homepage-testid='homepage-hero-shell'
      data-marketing-owner='apps/web/components/homepage/HomepageIdentityHero.tsx'
    >
      <HomepageCertifiedExposure />
      <MarketingHeroPhoto {...HERO_TEXTURE} />
      <div
        aria-hidden='true'
        className='marketing-hero-backdrop pointer-events-none absolute inset-0'
      />
      <MarketingHero
        variant='split'
        headingId={headingId}
        testId='marketing-section-hero'
      >
        <div className='max-w-xl'>
          <p className='marketing-kicker'>{copy.kicker}</p>
          <h1
            id={headingId}
            className='marketing-h1-linear mt-6 text-primary-token'
          >
            {copy.headline.split(/(?<=\.) /).map(line => (
              <span key={line} className='block'>
                {line}
              </span>
            ))}
          </h1>
          <p className='marketing-lead-linear mt-6 max-w-xl text-secondary-token'>
            {copy.subhead}
          </p>
        </div>
        <MarketingSurfaceCard
          variant='floating'
          glowTone='none'
          testId='homepage-claim-card'
          className='product-claim-card w-full max-w-120'
          contentClassName='flex flex-col gap-4 px-5 py-5 sm:gap-5 sm:px-9 sm:py-10'
        >
          <div className='hidden items-center gap-4 sm:flex'>
            <Image
              alt={preview.portraitAlt}
              className='homepage-claim-hero__portrait size-14 shrink-0 rounded-full object-cover'
              height={112}
              priority
              src={PREVIEW_PORTRAIT}
              width={112}
            />
            <p className='product-claim-card__status text-secondary-token'>
              {preview.label}
            </p>
          </div>
          <p className='product-claim-card__path text-primary-token'>
            <span className='text-tertiary-token'>{claim.domain}</span>
            <span>{preview.handle}</span>
          </p>
          <p className='hidden text-base text-secondary-token sm:block'>
            {preview.name} · {preview.role}
          </p>
          <p className='text-sm text-tertiary-token'>{preview.note}</p>
          <div className='w-full' data-testid='homepage-editorial-hero-search'>
            <ProductClaimHandleForm
              domain={claim.domain}
              placeholder={claim.placeholder}
              submitLabel={claim.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
          </div>
        </MarketingSurfaceCard>
      </MarketingHero>
    </div>
  );
}

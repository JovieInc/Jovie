import Image from 'next/image';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import '@/components/marketing/MarketingRouteHero.css';
import { MarketingContainer, MarketingHero } from '@/components/marketing';

export const revalidate = false;

export default function PrivacyLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <MarketingHero
        variant='unstyled'
        headingId='privacy-hero-heading'
        testId='privacy-hero'
        className='marketing-hero-dock marketing-hero-dock--inset relative w-full overflow-hidden pt-20 pb-12 sm:pt-24 lg:pt-28'
      >
        <div className='marketing-route-hero__media' aria-hidden='true'>
          <Image
            src='/images/hero/legal-privacy-hero.webp'
            alt=''
            fill
            sizes='100vw'
            priority
          />
        </div>
        <div className='marketing-route-hero__scrim' aria-hidden='true' />
        <div
          className='marketing-route-hero__accent marketing-route-hero__accent--purple'
          aria-hidden='true'
        />
        <MarketingContainer
          width='page'
          className='marketing-route-hero__content'
        >
          <p className='text-sm font-medium text-tertiary-token'>Legal</p>
          {/*
            A visual, non-heading title: LegalHero below renders the page's
            one true <h1> (doc.title). aria-labelledby only needs a matching
            id, not a heading element, so this avoids a duplicate H1.
          */}
          <p
            id='privacy-hero-heading'
            className='system-b-marketing-route-title mt-6 max-w-3xl text-primary-token line-clamp-2'
          >
            Privacy Policy
          </p>
          <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
            How your Jovie profile and account data are collected, used, and
            protected.
          </p>
        </MarketingContainer>
      </MarketingHero>
      <MarketingContentShell className='public-legal-content'>
        {children}
      </MarketingContentShell>
    </>
  );
}

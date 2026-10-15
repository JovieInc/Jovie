import Image from 'next/image';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import '@/components/marketing/MarketingRouteHero.css';
import { MarketingContainer, MarketingHero } from '@/components/marketing';

export const revalidate = false;

export default function TermsLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <MarketingHero
        variant='unstyled'
        headingId='terms-hero-heading'
        testId='terms-hero'
        className='marketing-hero-dock marketing-hero-dock--inset relative w-full overflow-hidden pt-20 pb-12 sm:pt-24 lg:pt-28'
      >
        <div className='marketing-route-hero__media' aria-hidden='true'>
          <Image
            src='/images/hero/legal-terms-hero.webp'
            alt=''
            fill
            sizes='100vw'
            priority
          />
        </div>
        <div className='marketing-route-hero__scrim' aria-hidden='true' />
        <div
          className='marketing-route-hero__accent marketing-route-hero__accent--pink'
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
            id='terms-hero-heading'
            className='system-b-marketing-route-title mt-6 max-w-3xl text-primary-token line-clamp-2'
          >
            Terms of Service
          </p>
          <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
            The policies for your Jovie profile: accounts, content,
            subscriptions, acceptable use, and dispute resolution.
          </p>
        </MarketingContainer>
      </MarketingHero>
      <MarketingContentShell className='public-legal-content'>
        {children}
      </MarketingContentShell>
    </>
  );
}

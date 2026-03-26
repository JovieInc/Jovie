import { BrainCircuit, Radio, Users } from 'lucide-react';
import { FigCard, MarketingContainer } from '@/components/marketing';
import { ProductScreenshot } from './ProductScreenshot';

export function AIFeaturesSection() {
  return (
    <section className='section-glow section-spacing-linear'>
      <MarketingContainer width='landing'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div>
              <p className='marketing-kicker'>AI Context</p>
              <h2 className='marketing-h2-linear mt-6 max-w-[16ch] text-primary-token'>
                Every release gets a marketing team.
              </h2>
            </div>

            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Automatic pitch generation, presence management, and audience
                intelligence — the marketing overhead that used to take days,
                handled for every release.
              </p>
            </div>
          </div>
        </div>

        <div
          className='reveal-on-scroll homepage-section-stack grid gap-3.5 md:grid-cols-3'
          data-delay='80'
        >
          <FigCard
            title='Pitch generation'
            description='AI writes release pitches tailored to playlist curators and press contacts from your release metadata.'
            icon={<BrainCircuit className='h-5 w-5' />}
          />
          <FigCard
            title='Presence management'
            description='Your profile, smart links, and release pages stay in sync across every platform automatically.'
            icon={<Radio className='h-5 w-5' />}
          />
          <FigCard
            title='Audience intelligence'
            description='See who your fans are, where they came from, and what converts — all in one CRM you own.'
            icon={<Users className='h-5 w-5' />}
          />
        </div>

        {/* Audience CRM screenshot */}
        <div className='reveal-on-scroll mt-12 lg:mt-16' data-delay='120'>
          <ProductScreenshot
            src='/product-screenshots/audience-crm.png'
            alt='Jovie audience CRM showing fan contacts with source tracking and engagement data'
            width={2880}
            height={1800}
            title='Jovie — Audience'
            skipCheck
          />
        </div>
      </MarketingContainer>
    </section>
  );
}

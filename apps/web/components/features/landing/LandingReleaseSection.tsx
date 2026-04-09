import { BellRing, Sparkles } from 'lucide-react';
import {
  MarketingContainer,
  MarketingMetricCard,
  MarketingSectionIntro,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';

const PROOF_POINTS = [
  {
    label: 'Imported automatically',
    testId: 'landing-release-proof-imported',
  },
  {
    label: 'Fans notified',
    testId: 'landing-release-proof-fans-notified',
  },
] as const;

export function LandingReleaseSection() {
  return (
    <section
      aria-labelledby='landing-release-heading'
      className='section-spacing-linear-sm relative overflow-hidden'
      data-testid='landing-release-section'
    >
      <MarketingContainer width='page'>
        <div className='homepage-section-shell'>
          <MarketingSectionIntro
            eyebrow='Release automation'
            title='Release day, automated.'
            titleId='landing-release-heading'
            titleClassName='max-w-[11ch]'
            description='Jovie should remove launch busywork, not decorate it. The proof is a cleaner release workspace, a faster smart-link flow, and less manual work every time music drops.'
            badges={PROOF_POINTS}
            asideClassName='grid gap-3 sm:grid-cols-2 lg:justify-self-end'
            aside={
              <>
                <MarketingMetricCard
                  icon={<Sparkles className='h-3.5 w-3.5 text-primary-token' />}
                  label='Imported automatically'
                  value='6 DSPs live'
                  description='Links ready the moment the release lands.'
                />
                <MarketingMetricCard
                  icon={<BellRing className='h-3.5 w-3.5 text-primary-token' />}
                  label='Fans notified'
                  value='482'
                  valueAside='41.3% click rate'
                  description='The launch message goes out with the release instead of after it.'
                />
              </>
            }
          />

          <div className='homepage-section-stack'>
            <MarketingSurfaceCard
              className='relative p-4 sm:p-5 lg:p-6'
              glowTone='none'
            >
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-16 top-0 h-40 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(94,106,210,0.18), transparent 72%)',
                }}
              />

              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-sidebar.png'
                alt='Release detail dashboard showing a smart link sidebar, release automation, and platform destinations'
                width={2880}
                height={1800}
                title='Release workspace'
                chrome='minimal'
                skipCheck
                testId='landing-release-screenshot'
                className='rounded-[1.15rem]'
              />
            </MarketingSurfaceCard>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

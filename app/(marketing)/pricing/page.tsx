import Link from 'next/link';
import { PricingTierCard } from '@/components/molecules/PricingTierCard';
import { Container } from '@/components/site/Container';

export default function PricingPage() {
  const freeFeatures = [
    'Blazing-fast profiles, SEO-optimized',
    'AI-driven personalization',
    'Smart deep links (/listen, /tip, etc.)',
    'Clean dark/light mode',
    'App deep links (no browser friction)',
    'Conversion-focused analytics',
    'Unique Jovie handle (jov.ie/yourname)',
  ];

  const proFeatures = [
    'Everything in Free',
    'No Jovie branding - Your profile, your brand',
    'Capture any identifier - Email, phone, or Spotify',
    "Remember your fans across visits - See who's new, who's back",
    'Segment new vs. returning listeners - Understand your audience',
    "See what's working - Simple reports, clear insights",
  ];

  const growthFeatures = [
    'Everything in Pro',
    'Automated follow-ups - Playlist adds, drop reminders',
    'Test what converts - A/B headlines and offers',
    'Retarget your fans on Meta - Stay top of mind',
    "Smart suggestions - We'll tell you what to do next",
  ];

  return (
    <div className='bg-base text-primary-token'>
      <Container size='lg'>
        <div className='py-20 sm:py-28'>
          {/* Header */}
          <div className='text-center mb-20'>
            <h1 className='leading-[1.1]'>
              Find a plan to grow your audience.
            </h1>
            <p className='mx-auto mt-6 max-w-2xl text-lg text-secondary-token'>
              Jovie supports artists of all sizes, with pricing that scales.
            </p>
          </div>

          {/* Three-tier pricing grid */}
          <div className='max-w-6xl mx-auto'>
            <div className='grid md:grid-cols-3 gap-6'>
              <PricingTierCard
                name='Free'
                description='Everything you need to start.'
                price='$0'
                period='forever'
                ctaHref='/waitlist?plan=free'
                ctaLabel='Join waitlist →'
                features={freeFeatures}
                footer={
                  <div>
                    <p className='mb-2 text-xs font-medium uppercase tracking-wide text-tertiary-token'>
                      Optional Add-on
                    </p>
                    <p className='mb-1 text-sm font-medium text-primary-token'>
                      Remove Jovie branding
                    </p>
                    <p className='mb-3 text-sm text-secondary-token'>
                      $5/mo or $50/year
                    </p>
                    <Link
                      href='/waitlist?plan=branding'
                      className='text-sm text-secondary-token hover:text-primary-token'
                    >
                      Learn more →
                    </Link>
                  </div>
                }
              />

              <PricingTierCard
                name='Pro'
                description='Your identity. Your data.'
                price='$39'
                period='/month'
                ctaHref='/waitlist?plan=pro'
                ctaLabel='Join waitlist →'
                ctaVariant='primary'
                features={proFeatures}
                highlighted={true}
                className='bg-surface-0'
              />

              <PricingTierCard
                name='Growth'
                description='Automate. Retarget. Scale.'
                price='$99'
                period='/month'
                ctaHref='/waitlist?plan=growth'
                ctaLabel='Join waitlist →'
                features={growthFeatures}
              />
            </div>

            {/* Footer note */}
            <p className='mt-8 text-center text-sm text-tertiary-token'>
              30-day money-back guarantee. Cancel anytime.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}

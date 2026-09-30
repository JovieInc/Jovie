// @coverage-via apps/web/tests/unit/pay/pay-landing-system-b-source.test.tsx
import {
  Calendar,
  Mail,
  MapPin,
  QrCode,
  Scan,
  Send,
  Store,
  Users,
} from 'lucide-react';
import {
  MarketingContainer,
  MarketingHero,
  MarketingHeroPhoto,
  MarketingPageShell,
} from '@/components/marketing';
import { ClaimHandleForm } from '@/features/home/claim-handle';

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

const PAY_HERO_PHOTO = {
  src: '/images/marketing-hero/pay.webp',
  width: 1600,
  height: 901,
} as const;

function TipsHero() {
  return (
    <section className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'>
      <MarketingHeroPhoto {...PAY_HERO_PHOTO} />
      <div className='hero-glow pointer-events-none absolute inset-0' />
      <MarketingHero
        variant='centered'
        className='items-start text-left'
        headingId='pay-hero-heading'
        testId='pay-hero'
      >
        <p className='marketing-kicker'>Pay</p>
        {/* ui-casing-allow: marketing display headline */}
        {/* eslint-disable @jovie/canonical-ui-label-casing -- Preserve approved sentence-case marketing copy while adding binding evidence. */}
        <h1
          id='pay-hero-heading'
          className='marketing-h1-linear mt-6 max-w-2xl text-primary-token'
        >
          Turn every payment into a follower.
        </h1>
        {/* eslint-enable @jovie/canonical-ui-label-casing */}

        <p className='marketing-lead-linear mt-6 max-w-[33rem] text-secondary-token'>
          Scan the code, pay in seconds, and land on a Jovie profile that keeps
          the relationship going after the moment ends.
        </p>

        <div className='mt-8 w-full max-w-[29rem] text-left'>
          <ClaimHandleForm />
        </div>

        <p className='mt-4 text-[length:var(--linear-label-size)] text-tertiary-token'>
          Free forever. No credit card required.
        </p>
      </MarketingHero>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  How It Works                                                              */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    icon: QrCode,
    title: 'Get your QR code',
    description:
      'We generate a unique QR code linked to your Jovie profile. Print it for a tip jar, a counter, or a table, anywhere someone is ready to pay you.',
  },
  {
    icon: Scan,
    title: 'They scan and pay',
    description:
      'Someone scans the code, pays in seconds, and lands on your profile. No app download required. Works with any phone camera.',
  },
  {
    icon: Mail,
    title: "You get their email, they get what's next",
    description:
      'You capture their contact info. They get an automatic thank-you with links to whatever you want them to see next.',
  },
] as const;

function HowItWorksSection() {
  return (
    <section className='relative z-10 bg-surface-page pt-(--linear-section-pt-lg) pb-(--linear-section-pb-md)'>
      <MarketingContainer width='landing'>
        <div className='mx-auto max-w-300'>
          <div className='homepage-section-intro'>
            <div>
              <p className='marketing-kicker'>How it works</p>
              {/* ui-casing-allow: marketing display headline */}
              <h2 className='marketing-h2-linear mt-6 max-w-[12ch] text-primary-token'>
                Three steps to your first follower.
              </h2>
            </div>
            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Put a QR code where people already pay, capture their contact
                info, and send them directly to what matters most without
                another tool in the loop.
              </p>
            </div>
          </div>

          <div className='homepage-section-stack grid grid-cols-1 gap-6 md:grid-cols-3'>
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className='homepage-surface-card relative flex flex-col rounded-[1rem] p-7 text-left'
              >
                <div className='flex h-11 w-11 items-center justify-center rounded-xl border border-subtle bg-surface-1'>
                  <step.icon className='h-6 w-6 text-secondary-token' />
                </div>
                <span className='mt-5 text-[length:var(--linear-label-size)] text-tertiary-token'>
                  Step {i + 1}
                </span>
                <h3 className='mt-2 text-lg font-medium tracking-tight text-primary-token'>
                  {step.title}
                </h3>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Benefits                                                                  */
/* -------------------------------------------------------------------------- */

const BENEFITS = [
  {
    icon: Users,
    title: 'Every payment becomes a contact',
    description:
      'Stop losing people after the moment passes. Every payment automatically captures their contact info so you can keep the conversation going.',
  },
  {
    icon: Send,
    title: 'Auto thank-you with your links',
    description:
      'The moment they pay, they receive a personalized thank-you with links to whatever matters most, your music, your site, or your next release.',
  },
  {
    icon: MapPin,
    title: 'See who paid you and where',
    description:
      'Track every payment by location and time. Know which places and moments bring in your biggest supporters.',
  },
] as const;

function BenefitsSection() {
  return (
    <section className='relative z-10 bg-base pt-(--linear-section-pt-md) pb-(--linear-section-pb-md)'>
      <MarketingContainer width='landing'>
        <div className='mx-auto max-w-300'>
          <div className='marketing-divider mb-14' />

          <div className='homepage-section-intro'>
            <div>
              <p className='marketing-kicker'>Why it matters</p>
              {/* ui-casing-allow: marketing display headline */}
              <h2 className='marketing-h2-linear mt-6 max-w-[11ch] text-primary-token xl:leading-tight'>
                Payments are just the beginning.
              </h2>
            </div>
            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Every dollar someone drops in your jar is a signal. Jovie helps
                you act on it while the moment is still warm.
              </p>
            </div>
          </div>

          <div className='homepage-section-stack grid grid-cols-1 gap-6 md:grid-cols-3'>
            {BENEFITS.map(benefit => (
              <div
                key={benefit.title}
                className='homepage-surface-card flex flex-col rounded-[1rem] p-7'
              >
                <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-surface-1'>
                  <benefit.icon className='h-5 w-5 text-secondary-token' />
                </div>
                <h3 className='mt-5 text-lg font-medium tracking-tight text-primary-token'>
                  {benefit.title}
                </h3>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Social Proof / Use Cases                                                  */
/* -------------------------------------------------------------------------- */

const USE_CASES = [
  // ui-casing-allow: marketing display label
  { icon: Store, label: 'Market stalls' },
  // ui-casing-allow: marketing display label
  { icon: Users, label: 'Service providers' },
  // ui-casing-allow: marketing display label
  { icon: Calendar, label: 'Live events' },
  // ui-casing-allow: marketing display label
  { icon: Scan, label: 'Pop-up shops' },
] as const;

function SocialProofSection() {
  return (
    <section className='relative z-10 bg-surface-page pt-(--linear-section-pt-md) pb-(--linear-section-pb-md)'>
      <MarketingContainer width='landing'>
        <div className='mx-auto max-w-300'>
          <div className='homepage-section-intro'>
            <div>
              <p className='marketing-kicker'>
                Built for getting paid in person
              </p>
              {/* ui-casing-allow: marketing display headline */}
              <h2 className='marketing-h2-linear mt-6 max-w-[12ch] text-primary-token'>
                Perfect for every setup.
              </h2>
            </div>
            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Whether you are behind a counter or on a stage, Jovie turns a
                moment of payment into a reachable audience.
              </p>
            </div>
          </div>

          <div className='homepage-section-stack grid grid-cols-2 gap-4 sm:grid-cols-4'>
            {USE_CASES.map(uc => (
              <div
                key={uc.label}
                className='homepage-surface-card flex flex-col items-center gap-3 rounded-[1rem] p-6'
              >
                <div className='flex h-11 w-11 items-center justify-center rounded-xl border border-subtle bg-surface-1'>
                  <uc.icon className='h-5 w-5 text-secondary-token' />
                </div>
                <span className='text-sm font-medium text-primary-token'>
                  {uc.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                 */
/* -------------------------------------------------------------------------- */

function TipsFinalCTA() {
  return (
    <section className='relative z-10 bg-surface-page pt-(--linear-section-pt-lg) pb-(--linear-section-pb-lg)'>
      <MarketingContainer width='landing'>
        <div className='marketing-divider mb-12' />

        <div className='grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start'>
          <div className='max-w-[31rem]'>
            <p className='marketing-kicker'>Claim your handle</p>
            {/* ui-casing-allow: marketing display headline */}
            <h2 className='marketing-h2-linear mt-6 text-primary-token'>
              Start turning payments into followers.
            </h2>
            <p className='mt-4 marketing-lead-linear text-secondary-token'>
              Keep the QR code simple, the follow-up automatic, and the next
              step clear.
            </p>
          </div>

          <div className='homepage-surface-card rounded-[1rem] p-2'>
            <ClaimHandleForm />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Export                                                               */
/* -------------------------------------------------------------------------- */

export function PayLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <TipsHero />
      <HowItWorksSection />
      <BenefitsSection />
      <SocialProofSection />
      <TipsFinalCTA />
    </MarketingPageShell>
  );
}

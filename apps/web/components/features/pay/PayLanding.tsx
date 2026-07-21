import {
  Mail,
  MapPin,
  Mic,
  Music,
  QrCode,
  Scan,
  Send,
  Store,
  Users,
} from 'lucide-react';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { ClaimHandleForm } from '@/features/home/claim-handle';

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function TipsHero() {
  return (
    <section className='relative overflow-hidden'>
      <div className='hero-glow pointer-events-none absolute inset-0' />
      <MarketingHero variant='centered' className='items-start text-left'>
        <p className='marketing-kicker'>Pay</p>
        {/* ui-casing-allow: marketing display headline */}
        <h1 className='marketing-h1-linear mt-6 max-w-[10ch] text-primary-token'>
          Turn every payment into a fan.
        </h1>

        <p className='marketing-lead-linear mt-6 max-w-[33rem] text-secondary-token'>
          Scan. Pay. Stream. One QR code turns a stranger into a superfan and
          keeps the relationship going after the show ends.
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
    title: 'Print your QR code',
    description:
      'We generate a unique QR code linked to your Jovie profile. Print it, stick it on your tip jar, or display it at your merch table.',
  },
  {
    icon: Scan,
    title: 'Fan scans & pays',
    description:
      'A fan scans the code, leaves a payment, and lands on your profile. No app download required. Works with any phone camera.',
  },
  {
    icon: Mail,
    title: 'You get their email + they get your music',
    description:
      'You capture their contact info. They get an automatic thank-you with links to stream your music everywhere.',
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
                Three steps to your first fan.
              </h2>
            </div>
            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Put a QR code where people already pay, capture their contact
                info, and send them directly into your music without another
                tool in the loop.
              </p>
            </div>
          </div>

          <div className='homepage-section-stack mt-0 grid grid-cols-1 gap-6 md:grid-cols-3'>
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
    title: 'Every payment becomes a fan email',
    description:
      'Stop losing fans after the show. Every payment automatically captures their contact info so you can keep the conversation going.',
  },
  {
    icon: Send,
    title: 'Auto thank-you with your music links',
    description:
      'The moment they pay, fans receive a personalized thank-you with links to stream your music on Spotify, Apple Music, and more.',
  },
  {
    icon: MapPin,
    title: 'See who paid you and where',
    description:
      'Track every payment by location and time. Know which venues, events, and cities your biggest fans come from.',
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
              <h2 className='marketing-h2-linear mt-6 max-w-[11ch] text-primary-token'>
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

          <div className='homepage-section-stack mt-0 grid grid-cols-1 gap-6 md:grid-cols-3'>
            {BENEFITS.map(benefit => (
              <div
                key={benefit.title}
                className='homepage-surface-card flex flex-col rounded-[1rem] p-7'
              >
                <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-surface-1'>
                  <benefit.icon className='h-5 w-5 text-secondary-token' />
                </div>
                <h3 className='mt-5 text-base font-medium tracking-tight text-primary-token'>
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
  { icon: Music, label: 'Buskers' },
  // ui-casing-allow: marketing display label
  { icon: Mic, label: 'Open mic nights' },
  // ui-casing-allow: marketing display label
  { icon: Store, label: 'Merch tables' },
  // ui-casing-allow: marketing display label
  { icon: Users, label: 'House shows' },
] as const;

function SocialProofSection() {
  return (
    <section className='relative z-10 bg-surface-page pt-(--linear-section-pt-md) pb-(--linear-section-pb-md)'>
      <MarketingContainer width='landing'>
        <div className='mx-auto max-w-300'>
          <div className='homepage-section-intro'>
            <div>
              <p className='marketing-kicker'>Built for real-world artists</p>
              {/* ui-casing-allow: marketing display headline */}
              <h2 className='marketing-h2-linear mt-6 max-w-[10ch] text-primary-token'>
                Perfect for every stage.
              </h2>
            </div>
            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Whether you are playing a subway platform or a sold-out basement
                show, Jovie turns your audience into a reachable fan base.
              </p>
            </div>
          </div>

          <div className='homepage-section-stack mt-0 grid grid-cols-2 gap-4 sm:grid-cols-4'>
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
              Start turning payments into fans.
            </h2>
            <p className='mt-4 marketing-lead-linear text-secondary-token'>
              Keep the QR code simple, the follow-up automatic, and the listener
              path clean.
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

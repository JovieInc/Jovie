import { Button } from '@jovie/ui';
import {
  ArrowRight,
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
import Link from 'next/link';
import { ClaimHandleForm } from '@/components/home/claim-handle';
import { Container } from '@/components/site/Container';

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function TipsHero() {
  return (
    <section className='relative flex flex-col items-center overflow-hidden px-5 sm:px-6 pt-(--linear-section-pt-lg) pb-(--linear-section-pb-md)'>
      {/* Ambient glow */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(120,119,198,0.12), transparent)',
        }}
      />

      <div className='relative z-10 flex w-full max-w-(--linear-content-max) flex-col items-center text-center heading-gap-linear'>
        <h1 className='marketing-h1-linear max-w-(--linear-hero-h1-width) text-(--linear-text-primary)'>
          Turn every tip into a fan.
        </h1>

        <p className='marketing-lead-linear mx-auto mt-6 max-w-xl text-(--linear-text-secondary)'>
          Scan. Tip. Stream. One QR code turns a stranger{' '}
          <br className='hidden sm:block' />
          into a superfan.
        </p>

        <div className='mt-8 w-full max-w-[480px] text-left'>
          <ClaimHandleForm />
        </div>

        <p className='mt-3 flex items-center justify-center gap-2 text-(--linear-label-size) font-(--linear-font-weight-medium) tracking-(--linear-tracking-wide) text-(--linear-text-tertiary)'>
          <span
            aria-hidden='true'
            className='inline-block h-1.5 w-1.5 rounded-full bg-(--linear-success) shadow-[0_0_8px_var(--linear-success)]'
          />{' '}
          Free forever. No credit card.
        </p>
      </div>
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
    title: 'Fan scans & tips',
    description:
      'A fan scans the code, leaves a tip, and lands on your profile. No app download required. Works with any phone camera.',
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
    <section
      className='relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-lg)',
        paddingBottom: 'var(--linear-section-pb-md)',
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-(--linear-content-max)'>
          <div className='text-center'>
            <p className='text-(--linear-label-size) font-(--linear-font-weight-medium) uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
              How it works
            </p>
            <h2 className='marketing-h2-linear mt-4 text-(--linear-text-primary)'>
              Three steps to your first fan.
            </h2>
          </div>

          <div className='mt-14 grid grid-cols-1 gap-8 md:grid-cols-3'>
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className='relative flex flex-col items-center rounded-xl border border-(--linear-border-subtle) p-8 text-center'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                }}
              >
                <div className='flex h-12 w-12 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)]'>
                  <step.icon className='h-6 w-6 text-(--linear-text-secondary)' />
                </div>
                <span className='mt-5 text-(--linear-label-size) font-(--linear-font-weight-medium) text-(--linear-text-tertiary)'>
                  Step {i + 1}
                </span>
                <h3 className='mt-2 text-lg font-medium tracking-tight text-(--linear-text-primary)'>
                  {step.title}
                </h3>
                <p className='mt-3 text-sm leading-relaxed text-(--linear-text-secondary)'>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Benefits                                                                  */
/* -------------------------------------------------------------------------- */

const BENEFITS = [
  {
    icon: Users,
    title: 'Every tip becomes a fan email',
    description:
      'Stop losing fans after the show. Every tip automatically captures their contact info so you can keep the conversation going.',
  },
  {
    icon: Send,
    title: 'Auto thank-you with your music links',
    description:
      'The moment they tip, fans receive a personalized thank-you with links to stream your music on Spotify, Apple Music, and more.',
  },
  {
    icon: MapPin,
    title: 'See who tipped you and where',
    description:
      'Track every tip by location and time. Know which venues, events, and cities your biggest fans come from.',
  },
] as const;

function BenefitsSection() {
  return (
    <section
      className='relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-md)',
        paddingBottom: 'var(--linear-section-pb-md)',
        backgroundColor: 'var(--linear-bg-footer)',
      }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-(--linear-content-max)'>
          {/* Gradient separator */}
          <div
            aria-hidden='true'
            className='mb-14 h-px max-w-(--linear-container-max) mx-auto'
            style={{
              background:
                'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
            }}
          />

          <div className='text-center'>
            <p className='text-(--linear-label-size) font-(--linear-font-weight-medium) uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
              Why it matters
            </p>
            <h2 className='marketing-h2-linear mt-4 text-(--linear-text-primary)'>
              Tips are just the beginning.
            </h2>
            <p className='marketing-lead-linear mx-auto mt-4 max-w-xl text-(--linear-text-secondary)'>
              Every dollar someone drops in your jar is a signal. Jovie helps
              you act on it.
            </p>
          </div>

          <div className='mt-14 grid grid-cols-1 gap-6 md:grid-cols-3'>
            {BENEFITS.map(benefit => (
              <div
                key={benefit.title}
                className='flex flex-col rounded-xl border border-(--linear-border-subtle) p-8'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                }}
              >
                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)]'>
                  <benefit.icon className='h-5 w-5 text-(--linear-text-secondary)' />
                </div>
                <h3 className='mt-5 text-base font-medium tracking-tight text-(--linear-text-primary)'>
                  {benefit.title}
                </h3>
                <p className='mt-3 text-sm leading-relaxed text-(--linear-text-secondary)'>
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Social Proof / Use Cases                                                  */
/* -------------------------------------------------------------------------- */

const USE_CASES = [
  { icon: Music, label: 'Buskers' },
  { icon: Mic, label: 'Open mic nights' },
  { icon: Store, label: 'Merch tables' },
  { icon: Users, label: 'House shows' },
] as const;

function SocialProofSection() {
  return (
    <section
      className='relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-md)',
        paddingBottom: 'var(--linear-section-pb-md)',
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-3xl text-center'>
          <p className='text-(--linear-label-size) font-(--linear-font-weight-medium) uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
            Built for real-world artists
          </p>
          <h2 className='marketing-h2-linear mt-4 text-(--linear-text-primary)'>
            Perfect for every stage.
          </h2>
          <p className='marketing-lead-linear mx-auto mt-4 max-w-xl text-(--linear-text-secondary)'>
            Whether you are playing a subway platform or a sold-out basement
            show, Jovie turns your audience into a reachable fan base.
          </p>

          <div className='mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4'>
            {USE_CASES.map(uc => (
              <div
                key={uc.label}
                className='flex flex-col items-center gap-3 rounded-xl border border-(--linear-border-subtle) p-6'
                style={{ backgroundColor: 'var(--linear-bg-surface-0)' }}
              >
                <div className='flex h-11 w-11 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)]'>
                  <uc.icon className='h-5 w-5 text-(--linear-text-secondary)' />
                </div>
                <span className='text-sm font-medium text-(--linear-text-primary)'>
                  {uc.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                 */
/* -------------------------------------------------------------------------- */

function TipsFinalCTA() {
  return (
    <section
      className='relative z-10'
      style={{
        paddingTop: 'var(--linear-section-pt-lg)',
        paddingBottom: '140px',
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      <Container size='homepage'>
        {/* Gradient separator */}
        <div
          aria-hidden='true'
          className='mb-12 h-px max-w-(--linear-container-max) mx-auto'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <div className='mx-auto flex max-w-2xl flex-col items-center text-center'>
          <h2 className='marketing-h2-linear text-(--linear-text-primary)'>
            Claim your handle. <br className='hidden sm:block' />
            Start turning tips into fans.
          </h2>
          <p className='mt-4 marketing-lead-linear text-(--linear-text-secondary)'>
            Free forever. No credit card required.
          </p>

          <div className='mt-8 w-full max-w-[480px] text-left'>
            <ClaimHandleForm />
          </div>

          <div className='mt-6'>
            <Button
              size='lg'
              className='btn-linear-signup h-(--linear-button-height-md) px-6'
              asChild
            >
              <Link href='/signup'>
                Claim Your Handle
                <ArrowRight className='ml-2 h-4 w-4' />
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Export                                                               */
/* -------------------------------------------------------------------------- */

export function TipsLanding() {
  return (
    <div
      className='relative min-h-screen'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      <TipsHero />
      <HowItWorksSection />
      <BenefitsSection />
      <SocialProofSection />
      <TipsFinalCTA />
    </div>
  );
}

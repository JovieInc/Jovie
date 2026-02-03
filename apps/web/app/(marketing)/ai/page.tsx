import type { Metadata } from 'next';
import {
  ArrowRight,
  Brain,
  FlaskConical,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL, BRAND } from '@/constants/app';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${BRAND.ai.name} — ${BRAND.ai.tagline}`;
  const description =
    'AI that actually understands music. Personalized CTAs, automatic experiments, cross-artist learning. Your page gets smarter every day.';

  return {
    title,
    description,
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: `${APP_URL}/ai`,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/ai`,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${APP_URL}/og/default.png`],
    },
  };
}

const capabilities = [
  {
    icon: Target,
    title: 'Personalized CTAs',
    description:
      'Different fans see different actions. Spotify users get Spotify. Apple Music fans get Apple Music. New visitors see capture forms first.',
    iconColor: 'text-violet-500',
  },
  {
    icon: FlaskConical,
    title: 'Automatic experiments',
    description:
      'Jovie A/B tests everything—headlines, button copy, timing, layout—so you get better results without lifting a finger.',
    iconColor: 'text-blue-500',
  },
  {
    icon: TrendingUp,
    title: 'Cross-artist learning',
    description:
      'Fan behavior from across the platform teaches Jovie what works. New artists benefit from day one.',
    iconColor: 'text-green-500',
  },
  {
    icon: Zap,
    title: 'Instant optimization',
    description:
      'Every visit updates the model. No waiting for monthly reports. Your page improves in real-time.',
    iconColor: 'text-amber-500',
  },
];

const howItWorks = [
  {
    step: '1',
    title: 'Identify the fan',
    description:
      'Known user, captured contact, or anonymous visitor—Jovie uses the best available signal to understand who's visiting.',
  },
  {
    step: '2',
    title: 'Read their context',
    description:
      'Subscription status, preferred platform, geographic signals, recency, and propensity scores all inform the next step.',
  },
  {
    step: '3',
    title: 'Decide the action',
    description:
      'One primary CTA, optimized for this specific visitor. Not identified? Capture first. Already subscribed? Route to their platform.',
  },
  {
    step: '4',
    title: 'Measure and learn',
    description:
      'Every impression, click, and conversion feeds back into the model. What works for your audience improves automatically.',
  },
];

export default function AIPage() {
  return (
    <div className='relative min-h-screen bg-base text-primary-token'>
      {/* Hero */}
      <section className='relative overflow-hidden py-16 sm:py-20 lg:py-24'>
        <Container className='relative'>
          <div className='max-w-4xl mx-auto text-center'>
            <p className='text-[13px] leading-5 font-[510] text-accent tracking-wide uppercase mb-4'>
              {BRAND.ai.name}
            </p>

            <h1 className='text-4xl font-bold tracking-tight text-primary-token sm:text-5xl lg:text-6xl leading-[1.08]'>
              {BRAND.ai.tagline}
            </h1>

            <p className='mt-6 text-lg leading-relaxed text-secondary-token sm:text-xl max-w-2xl mx-auto'>
              Behind the scenes, Jovie runs an always-on decision loop that
              optimizes every page for every visitor on every visit.
            </p>

            <div className='mt-10 flex flex-col items-center gap-3'>
              <Link
                href='/waitlist'
                className='group inline-flex items-center justify-center gap-2 h-12 px-8 rounded-[10px] bg-btn-primary text-btn-primary-foreground text-base font-medium transition-all duration-300 hover:opacity-95 focus-ring-themed'
              >
                Request early access
                <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
              </Link>
              <Link
                href='#capabilities'
                className='text-sm text-secondary-token hover:text-primary-token transition-colors'
              >
                See capabilities ↓
              </Link>
            </div>

            <div className='mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-tertiary-token'>
              <span className='inline-flex items-center gap-2'>
                <Sparkles className='h-4 w-4 text-accent' />
                AI-native from day one
              </span>
              <span className='inline-flex items-center gap-2'>
                <Brain className='h-4 w-4 text-accent' />
                Music-specific models
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* Capabilities */}
      <section
        id='capabilities'
        className='py-20 sm:py-24 border-t border-subtle'
      >
        <Container>
          <div className='max-w-5xl mx-auto'>
            <div className='text-center mb-12'>
              <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
                What Jovie AI does for you
              </h2>
              <p className='mt-4 text-secondary-token max-w-xl mx-auto'>
                Intelligence that runs 24/7, so you can focus on making music.
              </p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              {capabilities.map(capability => {
                const Icon = capability.icon;
                return (
                  <div
                    key={capability.title}
                    className='p-6 rounded-xl border border-subtle bg-surface-0'
                  >
                    <div className='flex items-center gap-3 mb-3'>
                      <div className='flex items-center justify-center w-10 h-10 rounded-lg bg-surface-1'>
                        <Icon className={`w-5 h-5 ${capability.iconColor}`} />
                      </div>
                      <h3 className='text-base font-medium text-primary-token'>
                        {capability.title}
                      </h3>
                    </div>
                    <p className='text-sm leading-relaxed text-secondary-token'>
                      {capability.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      {/* How It Works */}
      <section className='py-20 sm:py-24 border-t border-subtle bg-surface-0'>
        <Container>
          <div className='max-w-5xl mx-auto'>
            <div className='text-center mb-12'>
              <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
                The decision loop
              </h2>
              <p className='mt-4 text-secondary-token max-w-xl mx-auto'>
                Every page view triggers a four-step optimization cycle.
              </p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
              {howItWorks.map(step => (
                <div key={step.step} className='relative'>
                  <div className='text-5xl font-bold text-accent/20 mb-2'>
                    {step.step}
                  </div>
                  <h3 className='text-base font-medium text-primary-token mb-2'>
                    {step.title}
                  </h3>
                  <p className='text-sm leading-relaxed text-tertiary-token'>
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className='py-20 sm:py-24 border-t border-subtle'>
        <Container>
          <div className='max-w-2xl mx-auto text-center'>
            <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
              Ready to let AI work for you?
            </h2>
            <p className='mt-4 text-secondary-token'>
              Create a Jovie Profile and let the AI start learning your
              audience.
            </p>
            <div className='mt-8 flex flex-col sm:flex-row items-center justify-center gap-3'>
              <Link
                href='/waitlist'
                className='inline-flex items-center justify-center gap-2 h-12 px-8 rounded-[10px] bg-btn-primary text-btn-primary-foreground text-base font-medium transition-colors hover:opacity-95 focus-ring-themed'
              >
                Request early access
                <ArrowRight className='h-4 w-4' />
              </Link>
              <Link
                href='/profiles'
                className='inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[10px] border border-subtle bg-surface-0 text-primary-token text-sm font-medium transition-colors hover:bg-surface-1 focus-ring-themed'
              >
                Learn about Profiles
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}

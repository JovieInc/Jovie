import type { Metadata } from 'next';
import Link from 'next/link';
import { SharedMarketingHero } from '@/components/features/landing/SharedMarketingHero';
import { VoiceDemoVisual } from '@/components/features/landing/VoiceDemoVisual';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Voice Cloning for Creators | Jovie',
  description:
    // ui-casing-allow: metadata sentence with brand name ElevenLabs
    'Turn any YouTube video into your trained AI voice in minutes. Consent-first cloning powered by ElevenLabs. Use it for promos, replies, and radio drops inside your Jovie flows.',
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/voice',
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/voice`,
    title: 'Voice Cloning for Creators | Jovie',
    description:
      'Clone your voice from YouTube. Train once. Sound like you everywhere.',
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: 'Jovie voice cloning hero',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voice Cloning for Creators | Jovie',
    description:
      'Clone your voice from YouTube. Train once. Sound like you everywhere.',
    images: [`${BASE_URL}/og/default.png`],
  },
  robots: NOINDEX_ROBOTS,
};

export default function VoiceLandingPage() {
  const sectionWrapClassName = 'mx-auto w-full max-w-5xl px-6 sm:px-8 lg:px-12';

  return (
    <main className='bg-base text-primary-token'>
      <SharedMarketingHero
        eyebrow='Voice Cloning'
        title={
          <>
            Clone your voice.
            <br className='hidden sm:block' /> From any YouTube video.
          </>
        }
        body={
          <>
            Paste a clip. We train a model that sounds exactly like you.
            Generate promos, replies, and drops that fans swear are live. Full
            consent. Full control. Runs in your Jovie flows.
          </>
        }
        media={<VoiceDemoVisual />}
        headingId='voice-hero-heading'
        titleTestId='voice-hero-title'
        sectionTestId='voice-hero-section'
        primaryCtaLabel='Start voice cloning'
        primaryCtaHref={APP_ROUTES.START}
        ctaEventName='voice_landing_cta_start'
        primaryCtaTestId='voice-hero-primary-cta'
        secondaryCtaLabel='See pricing'
        secondaryCtaHref={APP_ROUTES.PRICING}
        subcopy='Free tier available. 2 min to first clone.'
        proofPoints={[
          'YouTube to trained model',
          'ElevenLabs powered',
          'Consent logged',
          'Works in replies & promos',
        ]}
      />

      {/* How it works — explicit 4 steps from voice skill */}
      <section className='border-t border-subtle bg-panel py-16 sm:py-20'>
        <div className={sectionWrapClassName}>
          <div className='mx-auto max-w-3xl text-center'>
            <p className='homepage-section-eyebrow'>Four steps</p>
            <h2 className='mt-3 text-2xl font-semibold tracking-tight text-primary-token'>
              Your Voice. Trained. Ready.
            </h2>
            <p className='mt-3 text-mid leading-7 text-secondary-token'>
              Async, consent-first, and built on the same infra that powers
              Jovie&apos;s creator automation.
            </p>
          </div>

          <div className='mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {[
              {
                n: '01',
                title: 'Link your clip',
                desc: 'Paste any public YouTube URL or upload a 60–90s voice sample. We extract clean audio.',
              },
              {
                n: '02',
                title: 'Consent & start train',
                desc: 'Review the ElevenLabs consent flow. One click starts the async job. Webhook notifies when ready.',
              },
              {
                n: '03',
                title: 'Review your model',
                desc: 'Listen to test generations. Approve or re-train with better source. You own the model.',
              },
              {
                n: '04',
                title: 'Use it everywhere',
                desc: 'Generate voice replies, radio drops, and promo audio directly from your Jovie dashboard or API.',
              },
            ].map(step => (
              <article
                key={step.n}
                className='rounded-3xl border border-subtle bg-base p-6'
              >
                <div className='text-xs font-mono tracking-widest text-tertiary-token'>
                  {step.n}
                </div>
                <h3 className='mt-3 text-lg font-semibold text-primary-token'>
                  {step.title}
                </h3>
                <p className='mt-2 text-sm leading-6 text-secondary-token'>
                  {step.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & product signals */}
      <section className='py-16 sm:py-20'>
        <div className={sectionWrapClassName}>
          <div className='mx-auto max-w-3xl'>
            <div className='rounded-3xl border border-subtle bg-panel px-8 py-10'>
              <h3 className='text-xl font-semibold'>
                Built For Creators Who Care About Consent.
              </h3>
              <ul className='mt-6 list-disc space-y-3 pl-5 text-mid leading-7 text-secondary-token'>
                <li>Explicit opt-in recorded before any training run.</li>
                <li>
                  Models stay private to your account until you publish a voice
                  drop.
                </li>
                <li>Delete or re-train anytime. No lock-in.</li>
                <li>
                  Same async job + webhook pattern used for video and other
                  heavy skills.
                </li>
              </ul>
              <div className='mt-8 flex flex-wrap gap-3'>
                <Link
                  href={APP_ROUTES.START}
                  className='btn-linear-primary'
                  data-testid='voice-trust-cta'
                >
                  Start your first clone
                </Link>
                <Link
                  href={APP_ROUTES.SUPPORT}
                  className='inline-flex h-10 items-center rounded-full border border-subtle px-4 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-1'
                >
                  Talk to the team
                </Link>
              </div>
              <p className='mt-4 text-xs text-tertiary-token'>
                Voice infrastructure shipped in PR 9882 (YouTube to ElevenLabs)
                + webhook/cron layer PR 9881.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA band */}
      <section className='border-t border-subtle bg-surface-0 py-14 text-primary-token'>
        <div className={sectionWrapClassName}>
          <div className='mx-auto flex max-w-2xl flex-col items-center gap-4 text-center'>
            <h2 className='text-3xl font-semibold tracking-tight'>
              Ready To Sound Like You — Everywhere?
            </h2>
            <p className='text-secondary-token'>
              The same voice that fans already know, now available on demand.
            </p>
            <Link
              href={APP_ROUTES.START}
              className='btn-linear-primary mt-2'
              data-testid='voice-final-cta'
            >
              Clone my voice now
            </Link>
            <span className='text-xs text-tertiary-token'>
              Free tier. Cancel anytime. No card required.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

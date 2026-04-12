import { Button } from '@jovie/ui';
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  Headphones,
  Mail,
  Play,
  QrCode,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { Container } from '@/components/site/Container';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ClaimHandleForm } from '@/features/home/claim-handle';

import { getCanonicalSurface } from '@/lib/canonical-surfaces';

export const revalidate = false;

const ARTIST_PROFILES_TITLE = 'Artist Profiles';
const ARTIST_PROFILES_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILES_DESCRIPTION =
  'Claim your free artist profile on Jovie. One link that adapts to every release, tour, and campaign — built for independent artists.';
const ARTIST_PROFILES_URL = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;
const ARTIST_PROFILES_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_PROFILES_TITLE,
  description: ARTIST_PROFILES_DESCRIPTION,
  keywords: [
    'artist profile',
    'link in bio for musicians',
    'smart links',
    'music artist page',
    'linktree alternative for artists',
    'music link in bio',
    'creator profile',
    'artist bio',
  ],
  alternates: {
    canonical: ARTIST_PROFILES_URL,
  },
  openGraph: {
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    url: ARTIST_PROFILES_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: ARTIST_PROFILES_OG_IMAGE,
        secureUrl: ARTIST_PROFILES_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ARTIST_PROFILES_TITLE,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    images: [ARTIST_PROFILES_OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
};

const PUBLIC_PROFILE_REVIEW_ROUTE =
  getCanonicalSurface('public-profile').reviewRoute;

/* -------------------------------------------------------------------------- */
/*  Adaptive profile modes                                                     */
/* -------------------------------------------------------------------------- */

const PROFILE_MODES = [
  {
    label: 'Upcoming release',
    description: 'Countdown + Notify me',
    icon: BellRing,
    tone: 'violet' as const,
  },
  {
    label: 'Release day',
    description: 'Listen now with smart routing to their preferred platform',
    icon: Play,
    tone: 'emerald' as const,
  },
  {
    label: 'Touring',
    description: 'Nearby fans see ticket dates first',
    icon: CalendarDays,
    tone: 'sky' as const,
  },
  {
    label: 'No campaign',
    description: 'Latest release + full catalog + fan capture',
    icon: Headphones,
    tone: 'amber' as const,
  },
] as const;

type ModeTone = (typeof PROFILE_MODES)[number]['tone'];

const TONE_CLASSES: Record<
  ModeTone,
  { border: string; bg: string; text: string }
> = {
  violet: {
    border: 'border-violet-400/20',
    bg: 'bg-violet-400/10',
    text: 'text-violet-300',
  },
  emerald: {
    border: 'border-emerald-400/20',
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-300',
  },
  sky: {
    border: 'border-sky-400/20',
    bg: 'bg-sky-400/10',
    text: 'text-sky-300',
  },
  amber: {
    border: 'border-amber-400/20',
    bg: 'bg-amber-400/10',
    text: 'text-amber-300',
  },
};

/* -------------------------------------------------------------------------- */
/*  Contact roles                                                              */
/* -------------------------------------------------------------------------- */

const CONTACT_ROLES = [
  'Booking',
  'Press',
  'Management',
  'Brand collabs',
] as const;

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ArtistProfilesPage() {
  return (
    <MarketingPageShell>
      {/* ── Hero ── */}
      <section
        className='relative overflow-hidden pb-14 pt-[5.75rem] md:pb-20 md:pt-[6.25rem]'
        aria-labelledby='artist-profiles-heading'
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem]' />

        <MarketingHero variant='split' className='relative'>
          <div className='max-w-[36rem]'>
            <h1
              id='artist-profiles-heading'
              className='marketing-h1-linear text-primary-token'
            >
              One link. Every release.
            </h1>
            <p className='mt-5 max-w-[34rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
              Put jov.ie/username in your bio once. Before a drop it becomes a
              countdown. On release day it becomes the best place to listen.
              Between campaigns it keeps collecting fans, tickets, tips, and
              business inquiries.
            </p>

            <div className='mt-8 flex flex-wrap items-center gap-3'>
              <Button asChild size='lg'>
                <Link href={APP_ROUTES.SIGNUP}>Claim your profile</Link>
              </Button>
              <Button asChild variant='ghost' size='lg'>
                <Link href={PUBLIC_PROFILE_REVIEW_ROUTE}>
                  See a live example
                </Link>
              </Button>
            </div>
          </div>

          <div
            data-testid='artist-profiles-hero-surface'
            className='relative flex justify-center'
          >
            <div className='relative'>
              {/* Ambient glow behind phone */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute -inset-12 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(129,140,248,0.28), transparent 60%)',
                }}
              />
              <div className='relative w-[248px] overflow-hidden rounded-[2rem] border border-white/15 shadow-[0_34px_90px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)] lg:w-[276px]'>
                <Image
                  src='/product-screenshots/profile-phone.png'
                  alt='Jovie artist profile showing fan actions, smart links, and listening destinations'
                  width={390}
                  height={844}
                  sizes='276px'
                  className='w-full'
                  priority
                />
              </div>
            </div>
          </div>
        </MarketingHero>
      </section>

      {/* ── The problem ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Every extra click loses fans.
            </h2>
            <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
              Today your audience navigates a maze of disconnected tools.
              Competitors split the experience across bio pages, smart-link
              pages, pre-save pages, and ticket pages.
            </p>

            <div className='mt-10 grid gap-6 sm:grid-cols-2'>
              {/* Old stack */}
              <div className='rounded-2xl border border-white/8 bg-white/[0.02] p-6'>
                <p className='text-[11px] font-[560] tracking-[0.04em] uppercase text-white/30'>
                  The old stack
                </p>
                <div className='mt-4 flex flex-wrap items-center gap-2 text-[13px] text-white/50'>
                  {['Instagram bio', 'Linktree', 'Release link', 'DSP'].map(
                    (step, i) => (
                      <span key={step} className='flex items-center gap-2'>
                        {i > 0 && (
                          <ChevronRight
                            className='h-3 w-3 text-white/20'
                            aria-hidden='true'
                          />
                        )}
                        <span>{step}</span>
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Jovie stack */}
              <div className='rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-6 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'>
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
                />
                <p className='text-[11px] font-[560] tracking-[0.04em] uppercase text-white/50'>
                  With Jovie
                </p>
                <div className='mt-4 flex flex-wrap items-center gap-2 text-[13px] text-white/80'>
                  {['Instagram bio', 'Jovie profile'].map((step, i) => (
                    <span key={step} className='flex items-center gap-2'>
                      {i > 0 && (
                        <ChevronRight
                          className='h-3 w-3 text-white/30'
                          aria-hidden='true'
                        />
                      )}
                      <span>{step}</span>
                    </span>
                  ))}
                </div>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {['Listen', 'Notify', 'Tickets', 'Tip', 'Contact'].map(
                    action => (
                      <span
                        key={action}
                        className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60'
                      >
                        {action}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── How the profile adapts ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              One profile that always shows fans what to do next.
            </h2>
            <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
              Count down to a drop, send fans to listen, show local tickets, and
              keep contact info one tap away.
            </p>

            <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {PROFILE_MODES.map(mode => {
                const Icon = mode.icon;
                const toneClass = TONE_CLASSES[mode.tone];
                return (
                  <div
                    key={mode.label}
                    className='relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'
                  >
                    <div
                      aria-hidden='true'
                      className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
                    />
                    <div className='relative'>
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${toneClass.border} ${toneClass.bg}`}
                      >
                        <Icon
                          className={`h-4 w-4 ${toneClass.text}`}
                          aria-hidden='true'
                        />
                      </div>
                      <p className='mt-3 text-[14px] font-[560] text-white'>
                        {mode.label}
                      </p>
                      <p className='mt-1 text-[12px] leading-[1.5] text-white/45'>
                        {mode.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Turn profile traffic into an audience you own ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Turn bio clicks into fans you can reach again.
            </h2>
            <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
              Fans subscribe once. Jovie sends new-music notifications
              automatically. Every release compounds instead of starting from
              zero.
            </p>

            <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {[
                {
                  icon: UserPlus,
                  title: 'Fans subscribe once',
                  body: 'One tap on your profile. No forms, no extra apps.',
                },
                {
                  icon: Sparkles,
                  title: 'Automatic release notifications',
                  body: 'Drop a song and your fans hear about it. No templates, no campaigns.',
                },
                {
                  icon: Mail,
                  title: 'Retargeting in one system',
                  body: 'Every fan, every release, every data point in one place.',
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className='relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,31,0.98),rgba(13,14,19,0.98))] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'
                  >
                    <div
                      aria-hidden='true'
                      className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
                    />
                    <div className='relative'>
                      <Icon
                        className='h-5 w-5 text-white/40'
                        aria-hidden='true'
                      />
                      <p className='mt-3 text-[14px] font-[560] text-white'>
                        {item.title}
                      </p>
                      <p className='mt-1 text-[12px] leading-[1.5] text-white/45'>
                        {item.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Stay reachable for the deals that matter ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Stay reachable for the deals that matter.
            </h2>
            <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
              Your full contact team, accessible from your profile without
              cluttering the homepage. Labels, agencies, and brands find who
              they need in one tap.
            </p>

            <div className='mt-8 flex flex-wrap gap-3'>
              {CONTACT_ROLES.map(role => (
                <span
                  key={role}
                  className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/60'
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Make live moments worth more ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Make live moments worth more.
            </h2>
            <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.75] text-secondary-token sm:text-[16px]'>
              When someone tips you at a show, Jovie captures their email, sends
              a thank-you with a playlist link, and adds them to your audience.
              That person goes from cash in hand to streams on the train home.
            </p>

            <div className='mt-8 flex items-center gap-3'>
              <div className='flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]'>
                <QrCode className='h-5 w-5 text-white/50' aria-hidden='true' />
              </div>
              <p className='text-[13px] text-white/50'>
                QR code or deep link to your tip page. Three preset amounts.
                Apple Pay or Venmo.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Set it up once ── */}
      <section className='border-b border-subtle bg-page py-16 sm:py-20 lg:py-24'>
        <Container size='homepage'>
          <div className='mx-auto max-w-[1120px]'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Set it up once.
            </h2>

            <div className='mt-8 space-y-3'>
              {[
                'Claim your handle or import your existing presence',
                'Connect Spotify to import your catalog',
                'Connect Bandsintown if you tour',
                'Add your contact team',
                'Publish jov.ie/username',
              ].map((step, i) => (
                <div
                  key={step}
                  className='flex items-center gap-3 text-[15px] text-white/60'
                >
                  <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-medium text-white/40'>
                    {i + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── Final CTA ── */}
      <section
        className='section-glow section-glow-cta relative z-10 overflow-hidden'
        style={{
          borderTop: '1px solid var(--linear-border-subtle)',
          paddingTop: 'var(--linear-cta-section-pt)',
          paddingBottom: 'var(--linear-cta-section-pb)',
        }}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
          style={{
            width: '600px',
            height: '400px',
            background:
              'radial-gradient(ellipse at center, oklch(18% 0.04 270 / 0.3), transparent 65%)',
            filter: 'blur(40px)',
          }}
        />

        <MarketingContainer width='landing'>
          <div className='relative mx-auto max-w-[38rem] text-center'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Claim your profile now.
            </h2>

            <p className='mt-4 text-[15px] leading-[1.6] text-secondary-token sm:text-[16px]'>
              One link that adapts to every release, tour, and campaign.
            </p>

            <div
              data-testid='artist-profiles-cta-form'
              className='mx-auto mt-7 w-full max-w-[27rem]'
            >
              <ClaimHandleForm />
            </div>

            <p className='mt-5 text-[10px] tracking-[0.01em] text-quaternary-token'>
              Free forever.
            </p>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}

import { Button } from '@jovie/ui';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingHeroPhoto,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { SmartLinkMaker } from './SmartLinkMaker';
import { SmartLinksDemo } from './SmartLinksDemo';

const SMART_LINKS_HERO_PHOTO = {
  src: '/images/marketing-hero/smart-links.webp',
  width: 1600,
  height: 686,
} as const;

const steps = [
  [
    '01',
    'Land on the release',
    'Artwork and artist come first. Every available music app lives in one dial.',
  ],
  [
    '02',
    'Choose once',
    'Slide, tap, or use the arrow keys. Stream Now follows the selected service.',
  ],
  [
    '03',
    'Come back already set',
    'Your choice follows the next release. You can always switch.',
  ],
] as const;

export function SmartLinksLanding({
  showMaker = false,
}: {
  readonly showMaker?: boolean;
}) {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section
        aria-labelledby='smart-links-title'
        className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden py-14 sm:py-24'
      >
        <MarketingHeroPhoto {...SMART_LINKS_HERO_PHOTO} />
        <MarketingContainer width='page' className='relative z-3'>
          <div className='grid items-center gap-12 lg:grid-cols-2'>
            <div>
              <p className='homepage-section-eyebrow'>SMART LINKS</p>
              <h1
                id='smart-links-title'
                className='marketing-h1-linear mt-5 max-w-3xl text-balance line-clamp-2'
              >
                One Link. Their Music App.
              </h1>
              <p className='mt-6 max-w-xl text-base leading-7 text-secondary-token sm:text-lg'>
                Let visitors choose where to listen. The action stays put while
                the service moves, and their choice follows the next song.
              </p>
              <div className='mt-8 flex flex-wrap gap-3'>
                <Button asChild variant='primary' size='md'>
                  <Link href={`${APP_ROUTES.SIGNUP}?source=smart-links`}>
                    Create a Smart Link
                  </Link>
                </Button>
                <Button asChild variant='secondary' size='md'>
                  <Link
                    href='/tim/never-say-a-word?noredirect=1'
                    prefetch={false}
                  >
                    Open the live example
                  </Link>
                </Button>
              </div>
              <p className='mt-5 text-xs leading-5 text-tertiary-token'>
                Try the dial. Supported devices give a light haptic tick when
                the selection changes.
              </p>
            </div>
            <SmartLinksDemo />
          </div>
        </MarketingContainer>
      </section>

      <section
        id='how-it-works'
        aria-labelledby='smart-links-how'
        className='border-t border-subtle py-16 sm:py-22'
      >
        <MarketingContainer width='page'>
          <p className='homepage-section-eyebrow'>A THREE-BEAT HANDOFF</p>
          <h2
            id='smart-links-how'
            className='mt-4 text-balance line-clamp-2 text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            Choose Your Sound. Once.
          </h2>
          <div className='mt-10 grid gap-6 md:grid-cols-3'>
            {steps.map(([number, title, body]) => (
              <article key={number} className='border-t border-subtle pt-5'>
                <p className='font-mono text-xs text-tertiary-token'>
                  {number}
                </p>
                <h3 className='mt-4 text-lg font-semibold'>{title}</h3>
                <p className='mt-3 text-sm leading-6 text-secondary-token'>
                  {body}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </section>

      {showMaker ? (
        <>
          {/* marketing-copy: draft — pending marketing-copy review */}
          <section
            aria-labelledby='make-jovie-link'
            className='border-t border-subtle py-16 sm:py-22'
          >
            <MarketingContainer width='page'>
              <h2
                id='make-jovie-link'
                className='text-balance text-3xl font-semibold tracking-tight sm:text-4xl'
              >
                Make a Jovie link
              </h2>
              <SmartLinkMaker />
              <div className='mx-auto mt-8 max-w-xl text-sm leading-6 text-secondary-token'>
                <p>Use it in ChatGPT, Claude, or your terminal.</p>
                <p className='mt-2 font-mono text-xs'>
                  https://jov.ie/api/chatgpt/mcp
                </p>
                <p className='mt-2 font-mono text-xs'>
                  npx skills add JovieInc/Jovie --skill jovie-smart-link
                </p>
              </div>
            </MarketingContainer>
          </section>
          <section
            id='pricing'
            aria-labelledby='jovie-link-plans'
            className='border-t border-subtle py-16 sm:py-22'
          >
            <MarketingContainer width='page'>
              <h2
                id='jovie-link-plans'
                className='text-balance text-3xl font-semibold tracking-tight sm:text-4xl'
              >
                Plans
              </h2>
              <div className='mt-8 grid gap-6 md:grid-cols-2'>
                <article className='border-t border-subtle pt-5'>
                  <h3 className='text-lg font-semibold'>Free</h3>
                  <p className='mt-3 text-sm leading-6 text-secondary-token'>
                    3 links a month. Jovie attribution on the page.
                  </p>
                </article>
                <article className='border-t border-subtle pt-5'>
                  <h3 className='text-lg font-semibold'>Links</h3>
                  <p className='mt-3 text-sm leading-6 text-secondary-token'>
                    $10/mo. Unlimited links, click analytics, no attribution,
                    your own handle in the URL.
                  </p>
                </article>
              </div>
            </MarketingContainer>
          </section>
        </>
      ) : null}

      <section
        aria-labelledby='smart-links-cta'
        className='py-16 text-center sm:py-22'
      >
        <MarketingContainer width='page'>
          <h2
            id='smart-links-cta'
            className='text-balance line-clamp-2 text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            Make Every Link Sing.
          </h2>
          <p className='mx-auto mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            Give every release a home that takes visitors to their chosen music
            app.
          </p>
          <div className='mt-8'>
            <Button asChild variant='secondary' size='md'>
              <Link
                href={`${APP_ROUTES.SIGNUP}?source=smart-links&intent=create`}
              >
                Create a Smart Link
              </Link>
            </Button>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}

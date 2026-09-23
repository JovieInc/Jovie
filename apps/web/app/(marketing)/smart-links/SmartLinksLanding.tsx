import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { SmartLinksDemo } from './SmartLinksDemo';

const STEPS = [
  {
    number: '01',
    title: 'Land on the release',
    body: 'Artwork and artist come first. Every available streaming service lives in one focused dial.',
  },
  {
    number: '02',
    title: 'Choose once',
    body: 'Slide, tap, or use the arrow keys. The fixed Stream Now action follows the selected service.',
  },
  {
    number: '03',
    title: 'Come back already set',
    body: 'The settled choice is remembered for the next visit and the next release. Fans can always switch.',
  },
] as const;

export function SmartLinksLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section aria-labelledby='smart-links-title' className='py-14 sm:py-24'>
        <MarketingContainer width='page'>
          <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]'>
            <div>
              <p className='homepage-section-eyebrow'>MUSIC SMART LINKS</p>
              <h1
                id='smart-links-title'
                className='marketing-h1-linear mt-5 max-w-3xl text-balance'
              >
                One Release Link. Their Music App.
              </h1>
              <p className='mt-6 max-w-xl text-base leading-7 text-secondary-token sm:text-lg'>
                A native-feeling way to pick where to listen. The action stays
                put while the service moves, and the choice carries to the next
                song.
              </p>
              <div className='mt-8 flex flex-wrap gap-3'>
                <Button asChild variant='primary' size='md'>
                  <Link href={`${APP_ROUTES.SIGNUP}?source=smart-links`}>
                    Create a Smart Link
                  </Link>
                </Button>
                <Button asChild variant='secondary' size='md'>
                  <Link href='/tim/never-say-a-word?noredirect=1'>
                    Open the live example
                  </Link>
                </Button>
              </div>
              <p className='mt-5 text-xs leading-5 text-tertiary-token'>
                Try the dial. On supported devices, changing the selection gives
                a light haptic tick.
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
            className='mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            Choose Your Sound. Once.
          </h2>
          <div className='mt-10 grid gap-6 md:grid-cols-3'>
            {STEPS.map(step => (
              <article
                key={step.number}
                className='border-t border-subtle pt-5'
              >
                <p className='font-mono text-xs text-tertiary-token'>
                  {step.number}
                </p>
                <h3 className='mt-4 text-lg font-semibold'>{step.title}</h3>
                <p className='mt-3 text-sm leading-6 text-secondary-token'>
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </section>

      <section
        id='next-release'
        aria-labelledby='smart-links-next'
        className='bg-panel py-16 sm:py-22'
      >
        <MarketingContainer width='page'>
          <div className='grid gap-10 lg:grid-cols-2 lg:items-end'>
            <div>
              <p className='homepage-section-eyebrow'>THE 100× EXPERIENCE</p>
              <h2
                id='smart-links-next'
                className='mt-4 max-w-xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl'
              >
                The Next Release Already Knows Where To Play.
              </h2>
            </div>
            <p className='max-w-xl text-base leading-7 text-secondary-token'>
              Switch services in the demo, then tap “See the next release.” The
              dial keeps the selection. On real Smart Links, the settled
              preference is remembered across releases while the fan stays in
              control.
            </p>
          </div>
          <div className='mt-10 grid gap-4 sm:grid-cols-3'>
            <div className='rounded-2xl border border-subtle bg-surface-0 p-6'>
              <p className='text-sm font-semibold'>
                A little physical feedback
              </p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                A light haptic tick accompanies selection where the browser
                supports it.
              </p>
            </div>
            <div className='rounded-2xl border border-subtle bg-surface-0 p-6'>
              <p className='text-sm font-semibold'>Built for every input</p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                Swipe, tap, or use the keyboard. Reduced motion skips the
                animated snap.
              </p>
            </div>
            <div className='rounded-2xl border border-subtle bg-surface-0 p-6'>
              <p className='text-sm font-semibold'>Always a clear exit</p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                The main action is fixed; fans can still change service whenever
                they want.
              </p>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='smart-links-cta'
        className='py-16 text-center sm:py-22'
      >
        <MarketingContainer width='page'>
          <h2
            id='smart-links-cta'
            className='text-balance text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            Make The Link Feel Like The Music.
          </h2>
          <p className='mx-auto mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            Give every release a home that takes fans straight to their chosen
            streaming service.
          </p>
          <div className='mt-8'>
            <Button asChild variant='primary' size='md'>
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

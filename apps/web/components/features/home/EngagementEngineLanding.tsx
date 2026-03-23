import { Button } from '@jovie/ui/atoms/button';
import { ArrowRight, MessagesSquare, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { MarketingHero, MarketingSectionFrame } from '@/components/marketing';

export function EngagementEngineLanding() {
  return (
    <div className='relative min-h-screen bg-base text-primary-token'>
      <section className='relative overflow-hidden'>
        <div className='hero-glow pointer-events-none absolute inset-0 -z-10' />

        <MarketingHero variant='centered' className='items-start text-left'>
          <p className='marketing-kicker'>
            Built for DJs, indie artists, and AI-first creators
          </p>

          <h1 className='marketing-h1-linear mt-6 max-w-[11ch] text-primary-token'>
            Attention is the bottleneck.
            <span className='text-secondary-token'> Keep it.</span>
          </h1>

          <p className='marketing-lead-linear mt-6 max-w-[34rem] text-secondary-token'>
            Making music is easy now. Getting the right people to care, come
            back, and buy is the hard part. Jovie helps you collect a warm list
            and re-engage automatically.
          </p>

          <div className='mt-10 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap'>
            <Button asChild variant='primary' size='hero' className='group'>
              <Link href='/signup'>
                Get started free
                <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
              </Link>
            </Button>
            <Link
              href='#system'
              className='inline-flex h-11 items-center rounded-md border border-subtle px-4 text-sm text-secondary-token transition-colors hover:border-default hover:text-primary-token'
            >
              See the system
            </Link>
          </div>

          <div className='mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-tertiary-token'>
            <span className='inline-flex items-center gap-2'>
              <Target className='h-4 w-4' />
              Personalized per fan
            </span>
            <span className='inline-flex items-center gap-2'>
              <Sparkles className='h-4 w-4' />
              Always-on engagement
            </span>
            <span className='inline-flex items-center gap-2'>
              <MessagesSquare className='h-4 w-4' />
              Timely follow-ups
            </span>
          </div>
        </MarketingHero>
      </section>

      <MarketingSectionFrame
        className='border-t border-subtle'
        eyebrow='The System'
      >
        <div
          className='max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16'
          id='system'
        >
          <div>
            <p className='text-xs font-medium tracking-wide uppercase text-secondary-token mb-3'>
              The problem
            </p>
            <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
              The old playbook can’t keep up.
            </h2>
            <p className='mt-4 text-base text-secondary-token leading-relaxed'>
              Most artists are still using static destinations and occasional
              blasts. It’s predictable—and it’s expensive.
            </p>

            <div className='mt-8 space-y-5'>
              <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                <h3 className='text-sm font-semibold text-primary-token'>
                  Low conversion
                </h3>
                <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                  Everyone sees the same thing, so nobody feels seen.
                </p>
              </div>

              <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                <h3 className='text-sm font-semibold text-primary-token'>
                  Low engagement
                </h3>
                <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                  Fans only hear from you occasionally, so messages get ignored.
                </p>
              </div>
            </div>

            <p className='mt-8 text-sm text-tertiary-token'>
              To grow, you need ongoing 1:1 hooks that adapt in the moment.
            </p>
          </div>

          <div>
            <p className='text-xs font-medium tracking-wide uppercase text-secondary-token mb-3'>
              What replaces it
            </p>
            <h2 className='text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
              A Jovie profile that behaves like an engine.
            </h2>
            <p className='mt-4 text-base text-secondary-token leading-relaxed'>
              Jovie personalizes the page per fan and triggers timely follow-ups
              based on what they just did—so fans stay warm and your conversions
              go up.
            </p>

            <div className='mt-8 grid grid-cols-1 gap-4'>
              <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                <h3 className='text-sm font-semibold text-primary-token'>
                  Collect intent
                </h3>
                <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                  Collect email first. Add SMS when you’re ready. Keep your
                  audience reachable even if they bounce.
                </p>
              </div>

              <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                <h3 className='text-sm font-semibold text-primary-token'>
                  Personalize instantly
                </h3>
                <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                  The next best action changes per fan—based on what they care
                  about right now.
                </p>
              </div>

              <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                <h3 className='text-sm font-semibold text-primary-token'>
                  Follow up automatically
                </h3>
                <p className='mt-2 text-sm text-secondary-token leading-relaxed'>
                  Timely 1:1 nudges that feel human, without you living in your
                  inbox.
                </p>
              </div>
            </div>

            <div className='mt-10 flex flex-col sm:flex-row gap-3'>
              <Link
                href='/signup'
                className='inline-flex items-center justify-center gap-2 h-12 px-6 rounded-md bg-btn-primary text-btn-primary-foreground text-sm font-medium transition-colors hover:opacity-95 focus-ring-themed'
              >
                Get started free
                <ArrowRight className='h-4 w-4' />
              </Link>
              <Link
                href='/'
                className='inline-flex items-center justify-center gap-2 h-12 px-6 rounded-md border border-subtle bg-surface-0 text-primary-token text-sm font-medium transition-colors hover:bg-surface-1 focus-ring-themed'
              >
                Learn more
              </Link>
            </div>

            <p className='mt-4 text-xs text-tertiary-token'>
              For DJs, indie artists, and AI-first creators shipping fast.
            </p>
          </div>
        </div>
      </MarketingSectionFrame>
    </div>
  );
}

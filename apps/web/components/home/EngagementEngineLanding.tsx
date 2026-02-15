import { ArrowRight, MessagesSquare, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function EngagementEngineLanding() {
  return (
    <div className='relative min-h-screen bg-base text-primary-token'>
      <section className='relative overflow-hidden py-16 sm:py-20 lg:py-24'>
        <div className='absolute inset-0 -z-10'>
          <div className='absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.25),transparent)]' />
          <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[56px_56px]' />
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]' />
        </div>

        <Container className='relative'>
          <div className='max-w-4xl mx-auto text-center'>
            <div className='mb-6 inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium rounded-full bg-surface-1 text-secondary-token border border-subtle'>
              <span className='relative flex h-1.5 w-1.5'>
                <span className='animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75' />
                <span className='relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500' />
              </span>{' '}
              Built for DJs, indie artists, and AI-first creators
            </div>

            <h1 className='text-4xl font-bold tracking-tight text-primary-token sm:text-6xl lg:text-7xl leading-[1.05]'>
              Attention is the bottleneck.
              <br />
              <span className='text-transparent bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text'>
                Keep it.
              </span>
            </h1>

            <p className='mt-6 text-lg leading-relaxed text-secondary-token sm:text-xl max-w-2xl mx-auto'>
              Making music is easy now. Getting the right people to care, come
              back, and buy is the hard part.
              <br />
              Jovie helps you collect a warm list and re-engage automatically.
            </p>

            <div className='mt-10 flex flex-col items-center gap-3'>
              <Link
                href='/signup'
                className='group inline-flex items-center justify-center gap-2 h-14 px-10 rounded-md bg-btn-primary text-btn-primary-foreground text-base font-medium transition-all duration-300 hover:scale-[1.02] hover:shadow-lg focus-ring-themed'
              >
                Get started free
                <ArrowRight className='h-4 w-4 transition-transform group-hover:translate-x-0.5' />
              </Link>
              <Link
                href='#system'
                className='text-xs text-secondary-token hover:text-primary-token transition-colors'
              >
                See the system ↓
              </Link>
            </div>

            <div className='mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-tertiary-token'>
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
          </div>
        </Container>
      </section>

      <section id='system' className='py-20 sm:py-24 border-t border-subtle'>
        <Container>
          <div className='max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16'>
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
                    Fans only hear from you occasionally, so messages get
                    ignored.
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
                Jovie personalizes the page per fan and triggers timely
                follow-ups based on what they just did—so fans stay warm and
                your conversions go up.
              </p>

              <div className='mt-8 grid grid-cols-1 gap-4'>
                <div className='rounded-2xl border border-subtle bg-surface-1 p-6'>
                  <h3 className='text-sm font-semibold text-primary-token'>
                    Capture intent
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
                    Timely 1:1 nudges that feel human, without you living in
                    your inbox.
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
                  href='/link-in-bio'
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
        </Container>
      </section>
    </div>
  );
}

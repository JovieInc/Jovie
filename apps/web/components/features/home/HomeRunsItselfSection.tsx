import { CheckCircle2, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';
import { HOME_INFRASTRUCTURE_SIGNALS } from './home-scroll-scenes';

function InfrastructureCard({
  id,
  eyebrow,
  title,
  body,
}: Readonly<(typeof HOME_INFRASTRUCTURE_SIGNALS)[number]>) {
  if (id === 'sync') {
    return (
      <article className='homepage-bento-card homepage-bento-card-lead md:col-span-2'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='homepage-bento-eyebrow'>{eyebrow}</p>
            <h3 className='homepage-bento-title mt-3'>{title}</h3>
          </div>
          <span className='homepage-bento-chip'>Imported</span>
        </div>

        <div className='mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.9fr)]'>
          <div className='homepage-bento-surface'>
            <div className='flex items-center gap-3'>
              <div className='h-14 w-14 rounded-[1rem] bg-[linear-gradient(135deg,#6b7ce8,#1d2235_68%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' />
              <div className='min-w-0'>
                <p className='truncate text-[16px] font-[590] tracking-[-0.02em] text-primary-token'>
                  The Deep End
                </p>
                <p className='mt-1 text-[12px] text-white/48'>
                  Single · Presave active
                </p>
              </div>
            </div>
            <div className='mt-5 grid grid-cols-3 gap-2'>
              <div className='homepage-bento-stat'>
                <span className='homepage-bento-stat-label'>Artwork</span>
                <span className='homepage-bento-stat-value'>Synced</span>
              </div>
              <div className='homepage-bento-stat'>
                <span className='homepage-bento-stat-label'>Links</span>
                <span className='homepage-bento-stat-value'>Ready</span>
              </div>
              <div className='homepage-bento-stat'>
                <span className='homepage-bento-stat-label'>Timing</span>
                <span className='homepage-bento-stat-value'>Locked</span>
              </div>
            </div>
          </div>

          <div className='space-y-3 rounded-[1.35rem] border border-white/8 bg-black/28 p-4'>
            <div className='homepage-bento-timeline-row'>
              <span className='homepage-bento-dot bg-emerald-300' />
              <span>Spotify import completed</span>
            </div>
            <div className='homepage-bento-timeline-row'>
              <span className='homepage-bento-dot bg-blue-300' />
              <span>Presave page scheduled</span>
            </div>
            <div className='homepage-bento-timeline-row'>
              <span className='homepage-bento-dot bg-white/30' />
              <span>Release-day switch armed</span>
            </div>
          </div>
        </div>

        <p className='homepage-bento-body mt-5 max-w-[42rem]'>{body}</p>
      </article>
    );
  }

  if (id === 'switch') {
    return (
      <article className='homepage-bento-card'>
        <p className='homepage-bento-eyebrow'>{eyebrow}</p>
        <h3 className='homepage-bento-title mt-3'>{title}</h3>
        <div className='mt-5 rounded-[1.35rem] border border-white/8 bg-black/28 p-4'>
          <div className='flex items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-3 text-[13px] text-white/72'>
            <span>Presave</span>
            <span className='rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/52'>
              live at midnight
            </span>
          </div>
          <div className='mt-3 flex items-center justify-center'>
            <div className='h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]' />
          </div>
          <div className='mt-3 flex items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] px-3 py-3 text-[13px] text-white/84'>
            <span>Listen</span>
            <Sparkles className='h-4 w-4 text-white/54' />
          </div>
        </div>
        <p className='homepage-bento-body mt-4'>{body}</p>
      </article>
    );
  }

  if (id === 'tasks') {
    return (
      <article className='homepage-bento-card'>
        <p className='homepage-bento-eyebrow'>{eyebrow}</p>
        <h3 className='homepage-bento-title mt-3'>{title}</h3>
        <div className='mt-5 space-y-2 rounded-[1.35rem] border border-white/8 bg-black/28 p-4'>
          {[
            'Release copy approved',
            'Presave CTA confirmed',
            'Launch message queued',
          ].map(task => (
            <div
              key={task}
              className='flex items-center gap-3 rounded-[1rem] border border-white/7 bg-white/[0.04] px-3 py-3 text-[13px] text-white/72'
            >
              <CheckCircle2 className='h-4 w-4 text-emerald-300' />
              <span>{task}</span>
            </div>
          ))}
        </div>
        <p className='homepage-bento-body mt-4'>{body}</p>
      </article>
    );
  }

  return (
    <article className='homepage-bento-card'>
      <p className='homepage-bento-eyebrow'>{eyebrow}</p>
      <h3 className='homepage-bento-title mt-3'>{title}</h3>
      <div className='mt-5 rounded-[1.35rem] border border-white/8 bg-black/28 p-4'>
        <div className='rounded-[1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4'>
          <p className='text-[11px] font-[560] tracking-[0.06em] text-white/40'>
            New Music
          </p>
          <p className='mt-2 text-[15px] font-[590] tracking-[-0.02em] text-white/88'>
            Tim White just dropped &quot;Take Me Over&quot;
          </p>
          <p className='mt-2 text-[12px] leading-[1.6] text-white/52'>
            The artist voice, release art, and call-to-action stay branded.
          </p>
        </div>
      </div>
      <p className='homepage-bento-body mt-4'>{body}</p>
    </article>
  );
}

export function HomeRunsItselfSection() {
  return (
    <section
      data-testid='homepage-infrastructure-section'
      className='border-t border-subtle bg-page py-20 sm:py-24 lg:py-28'
      aria-labelledby='homepage-infrastructure-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='max-w-[34rem]'>
            <h2
              id='homepage-infrastructure-heading'
              className='marketing-h2-linear text-primary-token'
            >
              Runs itself underneath.
            </h2>
            <p className='mt-4 max-w-[31rem] text-[15px] leading-[1.72] text-secondary-token sm:text-[16px]'>
              Jovie keeps the profile current around each release, so artists
              stop rebuilding the same flow every time.
            </p>
          </div>

          <div className='homepage-bento-board mt-10 grid gap-4 md:grid-cols-2'>
            {HOME_INFRASTRUCTURE_SIGNALS.map(signal => (
              <InfrastructureCard key={signal.id} {...signal} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

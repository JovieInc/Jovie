import { BellRing, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';
import { FlatlineCurve, MomentumCurve } from '@/features/home/MomentumCurves';

type BentoTone = 'action' | 'success' | 'notification' | 'trend';

interface BentoCardProps {
  readonly heading: string;
  readonly tone?: BentoTone;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

function BentoCard({
  heading,
  tone = 'action',
  className = '',
  children,
}: BentoCardProps) {
  return (
    <article
      className={`system-b-home-bento-card relative min-h-40 overflow-hidden rounded-2xl border border-subtle bg-surface-1 p-6 transition-colors duration-subtle hover:bg-surface-2 ${className}`}
      data-tone={tone}
    >
      <div className='relative'>
        <h3 className='text-mid font-semibold tracking-normal text-primary-token'>
          {heading}
        </h3>
        {children}
      </div>
    </article>
  );
}

function GenerateReleasePlanCard() {
  return (
    <BentoCard
      heading='Generate a release plan.'
      tone='action'
      className='sm:col-span-2'
    >
      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <span className='inline-flex min-h-9 items-center gap-2 rounded-full border border-subtle bg-surface-2 px-3 py-2 text-xs font-medium text-secondary-token'>
          <Sparkles className='h-3.5 w-3.5 text-accent' aria-hidden='true' />
          Generate Release Plan
        </span>
        <div className='flex items-center gap-1.5 text-2xs text-tertiary-token'>
          <span className='h-1 w-1 rounded-full bg-success' />
          <span>Brief loaded</span>
        </div>
      </div>
    </BentoCard>
  );
}

function TasksTrackCard() {
  return (
    <BentoCard heading='Tasks track themselves.' tone='success'>
      <div className='mt-4 space-y-2.5'>
        <div className='flex min-h-5 items-center gap-2'>
          <CheckCircle2
            className='h-3.5 w-3.5 text-success'
            aria-hidden='true'
          />
          <span className='text-xs text-tertiary-token line-through'>
            Metadata verified
          </span>
        </div>
        <div className='flex min-h-5 items-center gap-2'>
          <span className='h-3.5 w-3.5 rounded-full border border-info' />
          <span className='text-xs text-secondary-token'>
            Upload Canvas to Spotify
          </span>
        </div>
        <div className='flex min-h-5 items-center gap-2'>
          <Circle
            className='h-3.5 w-3.5 text-quaternary-token'
            aria-hidden='true'
          />
          <span className='text-xs text-secondary-token'>
            Pitch to editorial playlists
          </span>
        </div>
      </div>
    </BentoCard>
  );
}

function FansKnowCard() {
  return (
    <BentoCard heading='Fans know before you do.' tone='notification'>
      <div className='mt-4 space-y-2'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-6 w-6 items-center justify-center rounded-full border border-accent/20 bg-accent/10'>
            <BellRing className='h-3 w-3 text-accent' aria-hidden='true' />
          </div>
          <span className='text-xs text-secondary-token'>
            Fans notified automatically
          </span>
        </div>
        <p className='pl-8 text-2xs text-tertiary-token'>In their timezone.</p>
      </div>
    </BentoCard>
  );
}

function NeverStartFromZeroCard() {
  return (
    <BentoCard heading='Never start from zero.' tone='trend'>
      <div className='mt-3 space-y-2'>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-2xs font-medium text-secondary-token'>
            With Jovie
          </p>
          <p className='text-3xs text-info'>Compounding</p>
        </div>
        <div className='h-14 min-h-8'>
          <MomentumCurve />
        </div>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-2xs font-medium text-tertiary-token'>Without</p>
          <p className='text-3xs text-quaternary-token'>Flatline</p>
        </div>
        <div className='h-8 min-h-8'>
          <FlatlineCurve />
        </div>
      </div>
    </BentoCard>
  );
}

export function BentoFeatureGrid() {
  return (
    <section
      className='border-b border-subtle bg-page py-20 sm:py-24 lg:py-28'
      aria-labelledby='bento-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-linear-content'>
          <h2
            id='bento-heading'
            className='marketing-h2-linear text-primary-token'
          >
            A command center for your career.
          </h2>

          <div className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <GenerateReleasePlanCard />
            <TasksTrackCard />
            <FansKnowCard />
            <NeverStartFromZeroCard />
          </div>
        </div>
      </Container>
    </section>
  );
}

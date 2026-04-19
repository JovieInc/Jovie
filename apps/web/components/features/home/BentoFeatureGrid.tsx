import { BellRing, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Container } from '@/components/site/Container';
import { FlatlineCurve, MomentumCurve } from '@/features/home/MomentumCurves';

type BentoGlowTone = 'violet' | 'emerald' | 'blue';

const GLOW_CLASSES: Record<BentoGlowTone, string> = {
  violet:
    'bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.12),transparent_58%)]',
  emerald:
    'bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.10),transparent_58%)]',
  blue: 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.10),transparent_58%)]',
};

interface BentoCardProps {
  readonly heading: string;
  readonly glowTone?: BentoGlowTone;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

function BentoCard({
  heading,
  glowTone = 'violet',
  className = '',
  children,
}: BentoCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors duration-normal hover:bg-white/[0.05] ${className}`}
    >
      {/* Top edge highlight */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]'
      />
      {/* Inner border glow */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-[1px] rounded-[inherit] border border-white/6'
      />
      {/* Ambient glow */}
      <div
        aria-hidden='true'
        className={`pointer-events-none absolute inset-0 ${GLOW_CLASSES[glowTone]}`}
      />

      <div className='relative'>
        <h3 className='text-[15px] font-[560] tracking-[-0.01em] text-white'>
          {heading}
        </h3>
        {children}
      </div>
    </div>
  );
}

function GenerateReleasePlanCard() {
  return (
    <BentoCard
      heading='Generate a release plan.'
      glowTone='violet'
      className='col-span-1 sm:col-span-2 min-h-[10rem]'
    >
      <div className='mt-4 flex items-center gap-3'>
        <span className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[12px] font-medium text-white/60'>
          <Sparkles className='h-3.5 w-3.5' aria-hidden='true' />
          Generate Release Plan
        </span>
        <div className='flex items-center gap-1.5 text-[11px] text-white/60'>
          <span className='h-1 w-1 rounded-full bg-emerald-400/60' />
          <span>Brief loaded</span>
        </div>
      </div>
    </BentoCard>
  );
}

function TasksTrackCard() {
  return (
    <BentoCard
      heading='Tasks track themselves.'
      glowTone='emerald'
      className='min-h-[10rem]'
    >
      <div className='mt-4 space-y-2.5'>
        <div className='flex items-center gap-2'>
          <CheckCircle2
            className='h-3.5 w-3.5 text-emerald-400'
            aria-hidden='true'
          />
          <span className='text-[12px] text-white/65 line-through'>
            Metadata verified
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <span className='h-3.5 w-3.5 rounded-full border-2 border-sky-400' />
          <span className='text-[12px] text-white/80'>
            Upload Canvas to Spotify
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <Circle className='h-3.5 w-3.5 text-white/20' aria-hidden='true' />
          <span className='text-[12px] text-white/80'>
            Pitch to editorial playlists
          </span>
        </div>
      </div>
    </BentoCard>
  );
}

function FansKnowCard() {
  return (
    <BentoCard
      heading='Fans know before you do.'
      glowTone='violet'
      className='min-h-[10rem]'
    >
      <div className='mt-4 space-y-2'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/20 bg-violet-400/10'>
            <BellRing className='h-3 w-3 text-violet-300' aria-hidden='true' />
          </div>
          <span className='text-[12px] text-white/78'>
            Fans notified automatically
          </span>
        </div>
        <p className='pl-[34px] text-[11px] text-white/58'>
          In their timezone.
        </p>
      </div>
    </BentoCard>
  );
}

function NeverStartFromZeroCard() {
  return (
    <BentoCard
      heading='Never start from zero.'
      glowTone='blue'
      className='min-h-[10rem]'
    >
      <div className='mt-3 space-y-2'>
        <div className='flex items-center justify-between'>
          <p className='text-[11px] font-[530] text-white/72'>With Jovie</p>
          <p className='text-[10px] text-emerald-300/90'>Compounding</p>
        </div>
        <div className='h-[3.5rem]'>
          <MomentumCurve />
        </div>
        <div className='flex items-center justify-between'>
          <p className='text-[11px] font-[530] text-white/58'>Without</p>
          <p className='text-[10px] text-white/50'>Flatline</p>
        </div>
        <div className='h-[2rem]'>
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
        <div className='mx-auto max-w-[1200px]'>
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

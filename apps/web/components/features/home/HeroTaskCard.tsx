import { AlertTriangle, CalendarClock, CircleCheckBig } from 'lucide-react';
import type { HomepageTaskCard } from './home-surface-seed';

const STATUS_CONFIG = {
  ready: {
    icon: CircleCheckBig,
    label: 'Ready',
    iconClassName: 'text-emerald-300',
    pillClassName:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-100/90',
  },
  blocked: {
    icon: AlertTriangle,
    label: 'Blocked',
    iconClassName: 'text-amber-300',
    pillClassName: 'border-amber-400/20 bg-amber-400/10 text-amber-100/90',
  },
  today: {
    icon: CalendarClock,
    label: 'Today',
    iconClassName: 'text-sky-300',
    pillClassName: 'border-sky-400/20 bg-sky-400/10 text-sky-100/90',
  },
} as const;

interface HeroTaskCardProps {
  readonly task: HomepageTaskCard;
  readonly compact?: boolean;
}

export function HeroTaskCard({
  task,
  compact = false,
}: Readonly<HeroTaskCardProps>) {
  const status = STATUS_CONFIG[task.statusTone];
  const Icon = status.icon;

  return (
    <div
      className={[
        'relative overflow-hidden rounded-[1.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-primary-token shadow-[0_24px_80px_rgba(0,0,0,0.32),0_4px_18px_rgba(0,0,0,0.22)]',
        compact ? 'p-3' : 'p-4',
      ].join(' ')}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)]'
      />

      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[11px] tracking-[0.08em] text-white/45'>
            Release Task
          </p>
          <h3
            className={[
              'mt-1 font-[580] tracking-[-0.02em] text-white',
              compact ? 'text-[13px] leading-5' : 'text-[14px] leading-5',
            ].join(' ')}
          >
            {task.title}
          </h3>
        </div>

        <span
          className={[
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium',
            status.pillClassName,
          ].join(' ')}
        >
          <Icon className={['h-3 w-3', status.iconClassName].join(' ')} />
          {task.statusLabel}
        </span>
      </div>

      <div className='mt-4 flex items-center justify-between gap-3 text-[11px] text-white/62'>
        <span>{task.meta}</span>
        <span className='text-white/78'>{task.dueLabel}</span>
      </div>
    </div>
  );
}

'use client';

// ---------------------------------------------------------------------------
// Right-rail design shotgun. Five 388px-wide rails laid out horizontally,
// each rendering the same mock release entity (Bahamas — Lost in the
// Light) so the comparison evaluates layout strategy alone, not data.
// ---------------------------------------------------------------------------

import {
  Archive,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Disc3,
  ExternalLink,
  Link as LinkIcon,
  Music,
  Pencil,
  Pin,
  Play,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

const CARBON_VARS: React.CSSProperties = {
  ['--linear-bg-page' as string]: '#06070a',
  ['--linear-app-content-surface' as string]: '#0a0c0f',
  ['--linear-app-shell-border' as string]: '#171a20',
  ['--linear-app-shell-radius' as string]: '12px',
  ['--surface-0' as string]: '#0a0b0e',
  ['--surface-1' as string]: '#101216',
  ['--surface-2' as string]: '#161a20',
  ['--text-primary' as string]: 'rgba(255,255,255,0.92)',
  ['--text-secondary' as string]: 'rgba(255,255,255,0.66)',
  ['--text-tertiary' as string]: 'rgba(255,255,255,0.46)',
  ['--text-quaternary' as string]: 'rgba(255,255,255,0.32)',
};

// ---------------------------------------------------------------------------
// Shared mock data — one release that all 5 rails render
// ---------------------------------------------------------------------------

type DspKey = 'spotify' | 'apple' | 'youtube' | 'tidal' | 'amazon';
type DspStatus = 'live' | 'pending' | 'error' | 'missing';

const DSP_LABEL: Record<DspKey, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube Music',
  tidal: 'Tidal',
  amazon: 'Amazon Music',
};

const DSP_GLYPH: Record<DspKey, string> = {
  spotify: 'S',
  apple: 'A',
  youtube: 'Y',
  tidal: 'T',
  amazon: 'M',
};

const DSP_COLOR: Record<DspKey, string> = {
  spotify: 'bg-emerald-500/85',
  apple: 'bg-rose-400/85',
  youtube: 'bg-red-500/85',
  tidal: 'bg-sky-400/85',
  amazon: 'bg-amber-400/85',
};

const DSP_STATUS_DOT: Record<DspStatus, string> = {
  live: 'bg-white/35',
  pending: 'bg-amber-300/70',
  error: 'bg-rose-400/85',
  missing: 'bg-white/12',
};

const release = {
  id: 'lost-in-the-light',
  title: 'Lost in the Light',
  artist: 'Bahamas',
  album: 'Bahamas Is Afie',
  type: 'Single' as 'Single' | 'EP' | 'Album',
  status: 'live' as 'live' | 'scheduled' | 'announced' | 'draft' | 'hidden',
  releaseDate: '2026-04-12',
  bpm: 96,
  key: 'A min',
  durationSec: 213,
  weeklyStreams: 12_400,
  weeklyDelta: 8,
  shareUrl: 'jov.ie/bahamas/lost-in-the-light',
  dsps: {
    spotify: 'live',
    apple: 'live',
    youtube: 'live',
    tidal: 'live',
    amazon: 'pending',
  } as Record<DspKey, DspStatus>,
  cues: [
    { at: 6, kind: 'intro', label: 'Intro' },
    { at: 26, kind: 'verse', label: 'Verse 1' },
    { at: 52, kind: 'chorus', label: 'Chorus' },
    { at: 73, kind: 'verse', label: 'Verse 2' },
    { at: 88, kind: 'drop', label: 'Drop' },
    { at: 124, kind: 'bridge', label: 'Bridge' },
    { at: 168, kind: 'outro', label: 'Outro' },
  ],
  tasksOpen: 2,
  pitchReady: true,
};

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function RightRailShotgunPage() {
  return (
    <div
      className='shotgun min-h-dvh w-full bg-(--linear-bg-page) text-primary-token flex flex-col'
      style={{
        ...CARBON_VARS,
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      }}
    >
      <style>{`
        .shotgun :focus { outline: none; }
        .shotgun :focus-visible {
          outline: 1.5px solid rgba(103, 232, 249, 0.45);
          outline-offset: 1px;
          border-radius: 4px;
        }
      `}</style>

      <header className='shrink-0 h-12 px-5 flex items-center gap-3 border-b border-(--linear-app-shell-border)'>
        <Link
          href='/exp/shell-v1'
          className='inline-flex items-center gap-1 text-[12px] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
        >
          <ChevronLeft className='h-3 w-3' strokeWidth={2.25} />
          Back to shell
        </Link>
        <span className='text-quaternary-token/60 text-[12px]'>·</span>
        <span
          className='text-[13px] font-semibold text-primary-token'
          style={{ letterSpacing: '-0.012em' }}
        >
          Right rail shotgun
        </span>
        <span className='text-quaternary-token text-[11.5px]'>
          /exp/right-rail-shotgun
        </span>
      </header>

      <div className='flex-1 overflow-x-auto overflow-y-hidden'>
        <div className='flex min-w-max h-full divide-x divide-(--linear-app-shell-border)'>
          <RailColumn
            label='A. Single scroll'
            description='Refined baseline — header → stats → perf → DSPs → cues → activity → sticky footer.'
          >
            <RailA />
          </RailColumn>
          <RailColumn
            label='B. Sectioned tabs'
            description='Sticky header + horizontal tab strip; each tab owns its own scroll.'
          >
            <RailB />
          </RailColumn>
          <RailColumn
            label='C. Accordion stack'
            description='Sticky header + collapsible rows. Stats + Performance open by default; summary chips on closed rows.'
          >
            <RailC />
          </RailColumn>
          <RailColumn
            label='D. Command-palette'
            description='Sticky header + search + grouped action list with shortcut chips. Data is secondary.'
          >
            <RailD />
          </RailColumn>
          <RailColumn
            label='E. Split-rail cards'
            description='Sticky header + vertical stack of separately framed elevated cards.'
          >
            <RailE />
          </RailColumn>
        </div>
      </div>
    </div>
  );
}

function RailColumn({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className='w-[388px] shrink-0 flex flex-col h-[calc(100dvh-48px)]'>
      <div className='shrink-0 px-4 pt-3 pb-2 border-b border-(--linear-app-shell-border)/60'>
        <p className='text-[10.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {label}
        </p>
        <p className='mt-1 text-[11.5px] text-tertiary-token leading-snug'>
          {description}
        </p>
      </div>
      <div className='flex-1 min-h-0 flex flex-col bg-(--linear-app-content-surface) overflow-hidden'>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function ArtworkTile({ size = 56 }: { size?: number }) {
  return (
    <div
      className='shrink-0 rounded-md border border-(--linear-app-shell-border) bg-(--surface-2) overflow-hidden grid place-items-center'
      style={{ height: size, width: size }}
    >
      <div
        className='h-full w-full grid place-items-center text-[14px] font-semibold text-primary-token'
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(103,232,249,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0) 70%), linear-gradient(135deg, hsl(220, 35%, 14%), hsl(220, 30%, 6%))',
        }}
      >
        L
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: 'Single' | 'EP' | 'Album' }) {
  return (
    <span className='inline-flex items-center h-[16px] px-1.5 rounded text-[9.5px] font-medium uppercase tracking-[0.06em] border border-(--linear-app-shell-border) text-tertiary-token bg-(--surface-1)/40'>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: typeof release.status }) {
  const cfg: Record<typeof release.status, { label: string; dot: string }> = {
    live: { label: 'Live', dot: 'bg-white/35' },
    scheduled: { label: 'Scheduled', dot: 'bg-amber-300/70' },
    announced: { label: 'Announced', dot: 'bg-cyan-300/75' },
    draft: { label: 'Draft', dot: 'bg-white/15' },
    hidden: {
      label: 'Hidden',
      dot: 'bg-transparent border border-quaternary-token/45 border-dashed',
    },
  };
  const c = cfg[status];
  return (
    <span className='inline-flex items-center gap-1.5 h-[18px] pl-1.5 pr-2 rounded border border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token text-[10px] font-caption uppercase tracking-[0.06em]'>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
      <span className='text-secondary-token'>{c.label}</span>
    </span>
  );
}

function HeaderCard() {
  return (
    <section className='shrink-0 px-4 pt-4 pb-3 border-b border-(--linear-app-shell-border)/60'>
      <div className='flex items-stretch gap-3'>
        <ArtworkTile size={64} />
        <div className='flex-1 min-w-0 flex flex-col justify-between py-0.5'>
          <div className='flex items-center gap-1.5'>
            <TypeBadge type={release.type} />
            <StatusBadge status={release.status} />
          </div>
          <h2
            className='text-[15px] font-semibold text-primary-token leading-tight truncate'
            style={{ letterSpacing: '-0.014em' }}
          >
            {release.title}
          </h2>
          <p className='text-[11.5px] text-tertiary-token truncate'>
            {release.artist} · {release.album}
          </p>
        </div>
      </div>
      <ShareUrlRow />
      <ActionRow />
    </section>
  );
}

function ShareUrlRow() {
  const [copied, setCopied] = useState(false);
  return (
    <div className='mt-3 flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md border border-(--linear-app-shell-border) bg-(--surface-0)/60 text-[11.5px] text-tertiary-token'>
      <LinkIcon
        className='h-3 w-3 text-quaternary-token shrink-0'
        strokeWidth={2.25}
      />
      <span className='flex-1 truncate font-mono tabular-nums'>
        {release.shareUrl}
      </span>
      <button
        type='button'
        onClick={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        aria-label='Copy share URL'
      >
        {copied ? (
          <CheckCircle2 className='h-3 w-3 text-cyan-300' strokeWidth={2.25} />
        ) : (
          <Copy className='h-3 w-3' strokeWidth={2.25} />
        )}
      </button>
      <button
        type='button'
        className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        aria-label='Open share URL'
      >
        <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
      </button>
    </div>
  );
}

function ActionRow() {
  return (
    <div className='mt-3 flex items-center gap-1.5'>
      <button
        type='button'
        className='inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium bg-white text-black hover:bg-white/90 transition-colors duration-150 ease-out'
      >
        <Play
          className='h-3 w-3 translate-x-px'
          strokeWidth={2.5}
          fill='currentColor'
        />
        Play
      </button>
      <button
        type='button'
        className='inline-flex items-center h-7 px-2.5 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
      >
        Open
      </button>
      <button
        type='button'
        className='ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md text-tertiary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 hover:text-primary-token transition-colors duration-150 ease-out'
        aria-label='Pin'
      >
        <Pin className='h-3.5 w-3.5' strokeWidth={2.25} />
      </button>
    </div>
  );
}

function StatsTriad() {
  return (
    <div className='grid grid-cols-3 gap-2 rounded-md border border-(--linear-app-shell-border)/60 bg-(--surface-0)/50 px-3 py-2.5'>
      <Stat label='BPM' value={String(release.bpm)} tabular />
      <Stat label='Key' value={release.key} mono />
      <Stat
        label='Length'
        value={`${Math.floor(release.durationSec / 60)}:${String(
          release.durationSec % 60
        ).padStart(2, '0')}`}
        tabular
      />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  tabular,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tabular?: boolean;
}) {
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='text-[9.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
        {label}
      </span>
      <span
        className={cn(
          'text-[13px] text-primary-token',
          mono && 'font-mono tracking-wide',
          tabular && 'tabular-nums'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PerformanceBlock() {
  const points = useMemo(() => {
    const arr: number[] = [];
    let v = release.weeklyStreams * 0.85;
    for (let i = 0; i < 14; i++) {
      const noise = Math.sin(i * 1.7) * 0.5 + 0.5;
      v = v + (noise - 0.5) * release.weeklyStreams * 0.18;
      arr.push(Math.max(0, v));
    }
    arr[arr.length - 1] = release.weeklyStreams;
    return arr;
  }, []);
  return (
    <div>
      <div className='flex items-baseline gap-2'>
        <span className='text-[18px] font-semibold text-primary-token tabular-nums'>
          {release.weeklyStreams.toLocaleString()}
        </span>
        <span className='text-[10.5px] text-tertiary-token'>streams · 7d</span>
        <span className='ml-auto inline-flex items-center gap-0.5 text-[11px] tabular-nums text-cyan-200/85'>
          <ArrowUp className='h-3 w-3' strokeWidth={2.25} />
          {release.weeklyDelta}%
        </span>
      </div>
      <Sparkline points={points} />
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 340;
  const h = 36;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className='mt-2 w-full h-9 block'
      preserveAspectRatio='none'
      role='img'
      aria-label='14-day stream sparkline'
    >
      <title>Stream trend, 14 days</title>
      <path d={fillPath} fill='rgba(103,232,249,0.10)' />
      <path
        d={path}
        fill='none'
        stroke='rgba(165,243,252,0.8)'
        strokeWidth={1.5}
      />
    </svg>
  );
}

function DistributionList({ compact }: { compact?: boolean }) {
  const order: DspKey[] = ['spotify', 'apple', 'youtube', 'tidal', 'amazon'];
  return (
    <ul className='flex flex-col'>
      {order.map(dsp => {
        const status = release.dsps[dsp];
        return (
          <li
            key={dsp}
            className={cn(
              'flex items-center gap-2.5 text-[12px] text-secondary-token',
              compact ? 'h-6' : 'h-7'
            )}
          >
            <span
              className={cn(
                'h-[16px] w-[16px] rounded-full grid place-items-center text-[8px] font-semibold text-white shrink-0',
                status === 'missing'
                  ? 'bg-quaternary-token/40 opacity-60'
                  : DSP_COLOR[dsp]
              )}
            >
              {DSP_GLYPH[dsp]}
            </span>
            <span className='flex-1 truncate'>{DSP_LABEL[dsp]}</span>
            <span className='inline-flex items-center gap-1.5'>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  DSP_STATUS_DOT[status]
                )}
              />
              <span className='text-[10px] uppercase tracking-[0.06em] text-quaternary-token'>
                {status}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CueRibbon() {
  const total = release.durationSec;
  return (
    <div>
      <div className='relative h-1 rounded-full bg-(--surface-2) mt-1'>
        {release.cues.map(c => {
          const pct = (c.at / total) * 100;
          return (
            <span
              key={c.at}
              aria-hidden='true'
              className='absolute top-1/2 -translate-y-1/2 h-2 w-0.5 rounded-full bg-cyan-300/60'
              style={{ left: `${pct}%` }}
            />
          );
        })}
      </div>
      <ul className='mt-2 flex flex-col'>
        {release.cues.slice(0, 5).map(c => (
          <li key={c.at}>
            <button
              type='button'
              className='w-full flex items-center gap-2.5 h-7 px-1 rounded text-[12px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token transition-colors duration-150 ease-out'
            >
              <span className='tabular-nums text-[10.5px] text-quaternary-token w-9 text-left'>
                {Math.floor(c.at / 60)}:{String(c.at % 60).padStart(2, '0')}
              </span>
              <span className='flex-1 text-left truncate'>{c.label}</span>
              <span className='text-[10px] uppercase tracking-[0.06em] text-quaternary-token capitalize'>
                {c.kind}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityBlock() {
  return (
    <div className='flex flex-col gap-1.5'>
      <ActivityRow
        icon={Disc3}
        label={`${release.tasksOpen} open tasks`}
        meta='Last touched 2h ago'
      />
      <ActivityRow
        icon={Sparkles}
        label='Editorial pitch ready'
        meta='Confirmed by Jovie'
        accent
      />
      <ActivityRow
        icon={Calendar}
        label='Drops Apr 12, 2026'
        meta='In 3 days'
      />
    </div>
  );
}

function ActivityRow({
  icon: Icon,
  label,
  meta,
  accent,
}: {
  icon: typeof Disc3;
  label: string;
  meta: string;
  accent?: boolean;
}) {
  return (
    <div className='flex items-center gap-2.5 px-2.5 h-9 rounded-md border border-(--linear-app-shell-border)/70 bg-(--surface-0)/40'>
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          accent ? 'text-cyan-300/85' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <span className='flex-1 min-w-0 text-[12.5px] text-secondary-token truncate'>
        {label}
      </span>
      <span className='text-[10.5px] text-quaternary-token tabular-nums'>
        {meta}
      </span>
    </div>
  );
}

function FooterActions() {
  return (
    <footer className='shrink-0 grid grid-cols-2 gap-1.5 p-3 border-t border-(--linear-app-shell-border)/70 bg-(--surface-0)/50'>
      <FooterBtn icon={LinkIcon}>Smart link</FooterBtn>
      <FooterBtn icon={Copy}>Duplicate</FooterBtn>
      <FooterBtn icon={ExternalLink}>Open page</FooterBtn>
      <FooterBtn icon={Archive} danger>
        Archive
      </FooterBtn>
    </footer>
  );
}

function FooterBtn({
  icon: Icon,
  children,
  danger,
}: {
  icon: typeof Copy;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type='button'
      className={cn(
        'inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[12px] border border-(--linear-app-shell-border) bg-(--surface-0) transition-colors duration-150 ease-out',
        danger
          ? 'text-rose-300/85 hover:bg-rose-500/10 hover:text-rose-200'
          : 'text-secondary-token hover:bg-surface-1/60 hover:text-primary-token'
      )}
    >
      <Icon className='h-3 w-3' strokeWidth={2.25} />
      {children}
    </button>
  );
}

function SectionLabel({
  label,
  trailing,
}: {
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className='flex items-center justify-between pb-1.5'>
      <span className='text-[9.5px] uppercase tracking-[0.12em] text-quaternary-token font-semibold'>
        {label}
      </span>
      {trailing}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A. Single scroll
// ---------------------------------------------------------------------------

function RailA() {
  return (
    <>
      <HeaderCard />
      <div className='flex-1 min-h-0 overflow-y-auto'>
        <section className='px-4 py-3 border-b border-(--linear-app-shell-border)/50'>
          <StatsTriad />
        </section>
        <section className='px-4 py-3 border-b border-(--linear-app-shell-border)/50'>
          <SectionLabel label='Performance' />
          <PerformanceBlock />
        </section>
        <section className='px-4 py-3 border-b border-(--linear-app-shell-border)/50'>
          <SectionLabel
            label='Distribution'
            trailing={
              <span className='text-[10px] tabular-nums text-tertiary-token'>
                4/5 live
              </span>
            }
          />
          <DistributionList />
        </section>
        <section className='px-4 py-3 border-b border-(--linear-app-shell-border)/50'>
          <SectionLabel
            label='Cues'
            trailing={
              <span className='text-[10px] tabular-nums text-tertiary-token'>
                {release.cues.length}
              </span>
            }
          />
          <CueRibbon />
        </section>
        <section className='px-4 py-3'>
          <SectionLabel label='Activity' />
          <ActivityBlock />
        </section>
      </div>
      <FooterActions />
    </>
  );
}

// ---------------------------------------------------------------------------
// B. Sectioned tabs
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'distribution' | 'cues' | 'activity';

function RailB() {
  const [tab, setTab] = useState<TabId>('overview');
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'distribution', label: 'Distribution' },
    { id: 'cues', label: 'Cues' },
    { id: 'activity', label: 'Activity' },
  ];
  return (
    <>
      <HeaderCard />
      <div className='shrink-0 flex items-center gap-0.5 px-2 border-b border-(--linear-app-shell-border)/60'>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type='button'
              onClick={() => setTab(t.id)}
              className={cn(
                'h-9 px-3 text-[11.5px] font-caption tracking-[-0.005em] transition-colors duration-150 ease-out border-b -mb-px',
                active
                  ? 'text-primary-token border-cyan-300/70'
                  : 'text-tertiary-token border-transparent hover:text-primary-token'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto'>
        {tab === 'overview' && (
          <div className='px-4 py-3 space-y-4'>
            <StatsTriad />
            <div>
              <SectionLabel label='Performance' />
              <PerformanceBlock />
            </div>
          </div>
        )}
        {tab === 'distribution' && (
          <div className='px-4 py-3'>
            <SectionLabel
              label='DSPs'
              trailing={
                <span className='text-[10px] tabular-nums text-tertiary-token'>
                  4/5 live
                </span>
              }
            />
            <DistributionList />
          </div>
        )}
        {tab === 'cues' && (
          <div className='px-4 py-3'>
            <SectionLabel
              label='Cues'
              trailing={
                <span className='text-[10px] tabular-nums text-tertiary-token'>
                  {release.cues.length}
                </span>
              }
            />
            <CueRibbon />
          </div>
        )}
        {tab === 'activity' && (
          <div className='px-4 py-3'>
            <SectionLabel label='Activity' />
            <ActivityBlock />
          </div>
        )}
      </div>
      <FooterActions />
    </>
  );
}

// ---------------------------------------------------------------------------
// C. Accordion stack
// ---------------------------------------------------------------------------

type AccordionKey =
  | 'stats'
  | 'performance'
  | 'distribution'
  | 'cues'
  | 'activity';

function RailC() {
  const [open, setOpen] = useState<Record<AccordionKey, boolean>>({
    stats: true,
    performance: true,
    distribution: false,
    cues: false,
    activity: false,
  });
  const toggle = (k: AccordionKey) =>
    setOpen(prev => ({ ...prev, [k]: !prev[k] }));
  return (
    <>
      <HeaderCard />
      <div className='flex-1 min-h-0 overflow-y-auto'>
        <AccordionRow
          label='Stats'
          summary='96 BPM · A min · 3:33'
          openState={open.stats}
          onToggle={() => toggle('stats')}
        >
          <StatsTriad />
        </AccordionRow>
        <AccordionRow
          label='Performance'
          summary={`${release.weeklyStreams.toLocaleString()} · +${release.weeklyDelta}%`}
          openState={open.performance}
          onToggle={() => toggle('performance')}
        >
          <PerformanceBlock />
        </AccordionRow>
        <AccordionRow
          label='Distribution'
          summary='4/5 live · Amazon pending'
          openState={open.distribution}
          onToggle={() => toggle('distribution')}
        >
          <DistributionList />
        </AccordionRow>
        <AccordionRow
          label='Cues'
          summary={`${release.cues.length} markers`}
          openState={open.cues}
          onToggle={() => toggle('cues')}
        >
          <CueRibbon />
        </AccordionRow>
        <AccordionRow
          label='Activity'
          summary='2 open tasks'
          openState={open.activity}
          onToggle={() => toggle('activity')}
        >
          <ActivityBlock />
        </AccordionRow>
      </div>
      <FooterActions />
    </>
  );
}

function AccordionRow({
  label,
  summary,
  openState,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  openState: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className='border-b border-(--linear-app-shell-border)/50'>
      <button
        type='button'
        onClick={onToggle}
        className='w-full flex items-center gap-2 h-10 px-4 text-left hover:bg-surface-1/30 transition-colors duration-150 ease-out'
      >
        {openState ? (
          <ChevronDown
            className='h-3 w-3 text-tertiary-token shrink-0'
            strokeWidth={2.25}
          />
        ) : (
          <ChevronRight
            className='h-3 w-3 text-tertiary-token shrink-0'
            strokeWidth={2.25}
          />
        )}
        <span className='text-[11.5px] uppercase tracking-[0.06em] text-tertiary-token font-semibold'>
          {label}
        </span>
        {!openState && (
          <span className='ml-auto text-[11px] text-quaternary-token tabular-nums truncate'>
            {summary}
          </span>
        )}
      </button>
      <div
        className='overflow-hidden'
        style={{
          maxHeight: openState ? 600 : 0,
          opacity: openState ? 1 : 0,
          transition: `max-height 320ms ${EASE_CINEMATIC}, opacity 200ms ease-out`,
        }}
      >
        <div className='px-4 pb-3'>{children}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// D. Command-palette driven
// ---------------------------------------------------------------------------

type CommandGroup = {
  label: string;
  items: Array<{
    label: string;
    icon: typeof Copy;
    shortcut?: string;
  }>;
};

const COMMAND_GROUPS: CommandGroup[] = [
  {
    label: 'Share',
    items: [
      { label: 'Copy smart link', icon: LinkIcon, shortcut: '⌘L' },
      { label: 'Copy share image', icon: Copy },
      { label: 'Send to fans (50)', icon: Send, shortcut: '⌘E' },
    ],
  },
  {
    label: 'Promote',
    items: [
      { label: 'Send Spotify pitch', icon: Sparkles },
      { label: 'Generate Canvas', icon: Sparkles },
      { label: 'Generate lyric video', icon: Sparkles },
      { label: 'Schedule Instagram drop', icon: Calendar },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Edit metadata', icon: Pencil, shortcut: '⌘E' },
      { label: 'Pin to top', icon: Pin },
      { label: 'Duplicate', icon: Copy, shortcut: '⌘D' },
      { label: 'Archive', icon: Archive },
    ],
  },
  {
    label: 'Navigate',
    items: [
      { label: 'Open release page', icon: ExternalLink, shortcut: '↵' },
      { label: 'View tasks (2)', icon: Disc3 },
      { label: 'View related tracks', icon: Music },
      { label: 'View audience', icon: Users },
    ],
  },
];

function RailD() {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_GROUPS;
    return COMMAND_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(it => it.label.toLowerCase().includes(q)),
    })).filter(g => g.items.length > 0);
  }, [query]);
  return (
    <>
      <HeaderCard />
      <div className='shrink-0 px-3 py-2 border-b border-(--linear-app-shell-border)/60'>
        <div className='flex items-center gap-2 h-8 px-2.5 rounded-md border border-(--linear-app-shell-border) bg-(--surface-0)/60 focus-within:border-cyan-400/40 transition-colors duration-150 ease-out'>
          <Search
            className='h-3.5 w-3.5 text-quaternary-token shrink-0'
            strokeWidth={2.25}
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='What can I do with this?'
            className='flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] text-primary-token placeholder:text-quaternary-token'
          />
          <kbd className='inline-flex items-center h-4 px-1 rounded text-[9.5px] font-caption uppercase tracking-[0.04em] text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
            /
          </kbd>
        </div>
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto py-1'>
        {filtered.map(g => (
          <div key={g.label} className='py-1.5'>
            <p className='px-4 pb-1 text-[9.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
              {g.label}
            </p>
            <div className='flex flex-col'>
              {g.items.map(it => (
                <button
                  key={it.label}
                  type='button'
                  className='flex items-center gap-2.5 h-8 px-4 text-left text-[12.5px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token transition-colors duration-150 ease-out'
                >
                  <it.icon
                    className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
                    strokeWidth={2.25}
                  />
                  <span className='flex-1 truncate'>{it.label}</span>
                  {it.shortcut && (
                    <kbd className='inline-flex items-center h-4 px-1 rounded text-[9.5px] font-caption uppercase tracking-[0.04em] text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
                      {it.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className='px-4 py-6 text-center text-[12px] text-tertiary-token'>
            No commands match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// E. Split-rail cards
// ---------------------------------------------------------------------------

function RailE() {
  return (
    <>
      <HeaderCard />
      <div className='flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5'>
        <SplitCard label='Distribution' meta='4/5 live'>
          <DistributionList compact />
        </SplitCard>
        <SplitCard
          label='Performance'
          meta={
            <span className='inline-flex items-center gap-0.5 text-cyan-200/85'>
              <ArrowUp className='h-3 w-3' strokeWidth={2.25} />
              {release.weeklyDelta}%
            </span>
          }
        >
          <PerformanceBlock />
        </SplitCard>
        <SplitCard label='Cues' meta={`${release.cues.length} markers`}>
          <CueRibbon />
        </SplitCard>
        <SplitCard label='Tasks' meta={`${release.tasksOpen} open`}>
          <ActivityBlock />
        </SplitCard>
      </div>
      <FooterActions />
    </>
  );
}

function SplitCard({
  label,
  meta,
  children,
}: {
  label: string;
  meta: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className='rounded-lg border border-(--linear-app-shell-border) bg-(--surface-0)/60 overflow-hidden'>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        className='w-full flex items-center justify-between gap-2 h-9 px-3 hover:bg-surface-1/30 transition-colors duration-150 ease-out'
      >
        <span className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {label}
        </span>
        <span className='text-[11px] tabular-nums text-tertiary-token inline-flex items-center gap-1.5'>
          {meta}
          {open ? (
            <ChevronUp
              className='h-3 w-3 text-quaternary-token'
              strokeWidth={2.25}
            />
          ) : (
            <ChevronDown
              className='h-3 w-3 text-quaternary-token'
              strokeWidth={2.25}
            />
          )}
        </span>
      </button>
      {open && <div className='px-3 pb-3'>{children}</div>}
    </section>
  );
}

import type { MomentType } from './demo-plan';

export const MOMENT_COLOR: Readonly<Record<MomentType, string>> = {
  single:
    'bg-emerald-500/10 border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/20',
  remix:
    'bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-100 hover:bg-fuchsia-500/25',
  acoustic:
    'bg-amber-500/10 border-amber-500/40 text-amber-100 hover:bg-amber-500/20',
  lyric_video:
    'bg-sky-500/10 border-sky-500/40 text-sky-100 hover:bg-sky-500/20',
  visualizer:
    'bg-indigo-500/10 border-indigo-500/40 text-indigo-100 hover:bg-indigo-500/20',
  merch_drop:
    'bg-orange-500/10 border-orange-500/40 text-orange-100 hover:bg-orange-500/20',
  tour_tie_in:
    'bg-rose-500/10 border-rose-500/40 text-rose-100 hover:bg-rose-500/20',
  media_appearance:
    'bg-cyan-500/10 border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/20',
  anniversary:
    'bg-violet-500/10 border-violet-500/40 text-violet-100 hover:bg-violet-500/20',
};

export const MOMENT_LABEL: Readonly<Record<MomentType, string>> = {
  single: 'Single',
  remix: 'Remix',
  acoustic: 'Acoustic',
  lyric_video: 'Lyric video',
  visualizer: 'Visualizer',
  merch_drop: 'Merch drop',
  tour_tie_in: 'Tour tie-in',
  media_appearance: 'Media',
  anniversary: 'Anniversary',
};

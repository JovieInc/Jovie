'use client';

// ---------------------------------------------------------------------------
// Library V1 — release-native media library.
//
// Object model: Asset → Variant → Release moment → Destination.
// Three modes: Browse (grid/table), Inspect (right drawer), Viewer (later).
// Layout: 220px left rail (saved views + filters) | center (top bar + grid)
//         | 388px animated right drawer.
//
// Build #1 priority: date-sorted grid, table view, left-rail filters,
// saved views, search, right-side detail drawer, inline metadata,
// destination-aware downloads.
// ---------------------------------------------------------------------------

import {
  ArrowDownToLine,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  Clock,
  Copy,
  Disc3,
  Eye,
  Film,
  Grid3x3,
  Image as ImageIcon,
  LayoutList,
  Mic2,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

// Carbon palette (locked theme — same tokens as shell-v1).
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

type AssetType =
  | 'cover'
  | 'reel'
  | 'visualizer'
  | 'lyric_clip'
  | 'alt_crop'
  | 'remix_art'
  | 'master';

type Aspect = '1:1' | '9:16' | '16:9' | '4:5';
type Status = 'approved' | 'review' | 'draft' | 'archived';
type Channel =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'apple'
  | 'smartlink'
  | 'email';
type GeneratedBy = 'jovie' | 'manual' | 'edited';

interface Asset {
  id: string;
  title: string;
  type: AssetType;
  aspect: Aspect;
  release: string;
  status: Status;
  channels: Channel[];
  generatedBy: GeneratedBy;
  generatedByModel?: string;
  capturedAt: string;
  addedAt: string;
  durationSec?: number;
  width: number;
  height: number;
  poster: string;
  favorite: boolean;
  versionCount: number;
  popularity: number;
  alt: string;
  tags: string[];
  promptSeed?: string;
}

const RELEASES = [
  { id: 'this-noise', title: 'This Noise', color: '#22d3ee' },
  { id: 'lost-frequency', title: 'Lost Frequency', color: '#a78bfa' },
  { id: 'glass-empires', title: 'Glass Empires', color: '#fb923c' },
  { id: 'echo-tape', title: 'Echo Tape', color: '#34d399' },
  { id: 'lucid-hours', title: 'Lucid Hours', color: '#f472b6' },
];

const TYPE_LABELS: Record<AssetType, string> = {
  cover: 'Cover',
  reel: 'Reel',
  visualizer: 'Visualizer',
  lyric_clip: 'Lyric clip',
  alt_crop: 'Alt crop',
  remix_art: 'Remix art',
  master: 'Master',
};

const TYPE_ICONS: Record<AssetType, typeof ImageIcon> = {
  cover: ImageIcon,
  reel: Film,
  visualizer: Disc3,
  lyric_clip: Mic2,
  alt_crop: ImageIcon,
  remix_art: ImageIcon,
  master: Disc3,
};

const STATUS_LABELS: Record<Status, string> = {
  approved: 'Approved',
  review: 'Review',
  draft: 'Draft',
  archived: 'Archived',
};

const STATUS_DOT: Record<Status, string> = {
  approved: 'bg-emerald-400',
  review: 'bg-amber-400',
  draft: 'bg-white/30',
  archived: 'bg-white/15',
};

const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  spotify: 'Spotify',
  apple: 'Apple Music',
  smartlink: 'Smart link',
  email: 'Email',
};

const ASPECTS: Aspect[] = ['1:1', '9:16', '16:9', '4:5'];
const TYPES: AssetType[] = [
  'cover',
  'reel',
  'visualizer',
  'lyric_clip',
  'alt_crop',
  'remix_art',
  'master',
];

// Deterministic mock data — repeatable visuals across reloads.
function generateAssets(): Asset[] {
  const seeds: Array<
    Partial<Asset> & Pick<Asset, 'title' | 'type' | 'release'>
  > = [
    {
      title: 'This Noise — cover (final)',
      type: 'cover',
      release: 'this-noise',
    },
    {
      title: 'This Noise — vertical teaser 01',
      type: 'reel',
      release: 'this-noise',
    },
    {
      title: 'This Noise — vertical teaser 02',
      type: 'reel',
      release: 'this-noise',
    },
    {
      title: 'This Noise — visualizer A',
      type: 'visualizer',
      release: 'this-noise',
    },
    {
      title: 'This Noise — visualizer B',
      type: 'visualizer',
      release: 'this-noise',
    },
    {
      title: 'This Noise — chorus lyric clip',
      type: 'lyric_clip',
      release: 'this-noise',
    },
    {
      title: 'This Noise — square crop alt',
      type: 'alt_crop',
      release: 'this-noise',
    },
    {
      title: 'This Noise — remix art (Carbon)',
      type: 'remix_art',
      release: 'this-noise',
    },
    {
      title: 'Lost Frequency — cover',
      type: 'cover',
      release: 'lost-frequency',
    },
    {
      title: 'Lost Frequency — reel cut 01',
      type: 'reel',
      release: 'lost-frequency',
    },
    {
      title: 'Lost Frequency — reel cut 02',
      type: 'reel',
      release: 'lost-frequency',
    },
    {
      title: 'Lost Frequency — visualizer A',
      type: 'visualizer',
      release: 'lost-frequency',
    },
    {
      title: 'Lost Frequency — alt crop wide',
      type: 'alt_crop',
      release: 'lost-frequency',
    },
    {
      title: 'Lost Frequency — master',
      type: 'master',
      release: 'lost-frequency',
    },
    { title: 'Glass Empires — cover', type: 'cover', release: 'glass-empires' },
    {
      title: 'Glass Empires — vertical promo',
      type: 'reel',
      release: 'glass-empires',
    },
    {
      title: 'Glass Empires — visualizer',
      type: 'visualizer',
      release: 'glass-empires',
    },
    {
      title: 'Glass Empires — lyric clip 01',
      type: 'lyric_clip',
      release: 'glass-empires',
    },
    {
      title: 'Glass Empires — lyric clip 02',
      type: 'lyric_clip',
      release: 'glass-empires',
    },
    {
      title: 'Glass Empires — remix art',
      type: 'remix_art',
      release: 'glass-empires',
    },
    { title: 'Echo Tape — cover', type: 'cover', release: 'echo-tape' },
    { title: 'Echo Tape — reel teaser', type: 'reel', release: 'echo-tape' },
    {
      title: 'Echo Tape — visualizer A',
      type: 'visualizer',
      release: 'echo-tape',
    },
    {
      title: 'Echo Tape — visualizer B',
      type: 'visualizer',
      release: 'echo-tape',
    },
    {
      title: 'Echo Tape — alt crop portrait',
      type: 'alt_crop',
      release: 'echo-tape',
    },
    { title: 'Lucid Hours — cover', type: 'cover', release: 'lucid-hours' },
    {
      title: 'Lucid Hours — reel cut 01',
      type: 'reel',
      release: 'lucid-hours',
    },
    {
      title: 'Lucid Hours — reel cut 02',
      type: 'reel',
      release: 'lucid-hours',
    },
    {
      title: 'Lucid Hours — visualizer',
      type: 'visualizer',
      release: 'lucid-hours',
    },
    { title: 'Lucid Hours — master', type: 'master', release: 'lucid-hours' },
  ];

  const aspectByType: Record<AssetType, Aspect> = {
    cover: '1:1',
    reel: '9:16',
    visualizer: '16:9',
    lyric_clip: '9:16',
    alt_crop: '4:5',
    remix_art: '1:1',
    master: '1:1',
  };

  // Stable status / channel cycle for deterministic look.
  const statusCycle: Status[] = [
    'approved',
    'approved',
    'review',
    'draft',
    'approved',
    'review',
    'approved',
    'archived',
  ];

  const channelByType: Record<AssetType, Channel[]> = {
    cover: ['spotify', 'apple', 'smartlink'],
    reel: ['instagram', 'tiktok'],
    visualizer: ['youtube'],
    lyric_clip: ['instagram', 'tiktok'],
    alt_crop: ['smartlink', 'email'],
    remix_art: ['smartlink'],
    master: ['spotify', 'apple'],
  };

  const generatedCycle: GeneratedBy[] = [
    'jovie',
    'jovie',
    'edited',
    'manual',
    'jovie',
  ];

  return seeds.map((seed, i) => {
    const aspect = aspectByType[seed.type];
    const [aw, ah] = aspect.split(':').map(Number) as [number, number];
    const baseW = aspect === '9:16' ? 540 : aspect === '16:9' ? 960 : 720;
    const baseH = Math.round((baseW * ah) / aw);
    const status = statusCycle[i % statusCycle.length];
    const generatedBy = generatedCycle[i % generatedCycle.length];
    const dayOffset = (i * 1.7) % 14;
    const captured = new Date(Date.now() - dayOffset * 86400000).toISOString();
    const added = new Date(
      Date.now() - Math.max(0, dayOffset - 1) * 86400000
    ).toISOString();
    const releaseColor =
      RELEASES.find(r => r.id === seed.release)?.color ?? '#22d3ee';
    const poster = posterFor(seed.type, releaseColor, i);
    return {
      id: `asset-${String(i + 1).padStart(2, '0')}`,
      title: seed.title,
      type: seed.type,
      aspect,
      release: seed.release,
      status,
      channels: channelByType[seed.type],
      generatedBy,
      generatedByModel:
        generatedBy === 'jovie'
          ? 'jovie/visual-1'
          : generatedBy === 'edited'
            ? 'manual edit · jovie/visual-1'
            : 'manual upload',
      capturedAt: captured,
      addedAt: added,
      durationSec:
        seed.type === 'reel' ||
        seed.type === 'visualizer' ||
        seed.type === 'lyric_clip'
          ? 12 + (i % 6) * 4
          : undefined,
      width: baseW,
      height: baseH,
      poster,
      favorite: i % 5 === 0,
      versionCount: 1 + (i % 4),
      popularity: 100 - i * 3,
      alt: `${TYPE_LABELS[seed.type]} for ${RELEASES.find(r => r.id === seed.release)?.title}`,
      tags: tagsFor(seed.type, seed.release),
      promptSeed:
        generatedBy === 'jovie'
          ? `${TYPE_LABELS[seed.type].toLowerCase()} for ${RELEASES.find(r => r.id === seed.release)?.title}, carbon palette, electric cyan accent, restrained motion`
          : undefined,
    };
  });
}

function posterFor(type: AssetType, releaseColor: string, i: number): string {
  // Inline SVG data URI — deterministic, no network. Tinted with release color.
  const seed = (i * 53 + 17) % 360;
  const hue1 = seed;
  const hue2 = (seed + 80) % 360;
  const grain =
    type === 'cover' || type === 'master' || type === 'remix_art'
      ? 'circle'
      : 'lines';
  // eslint-disable-next-line @jovie/icon-usage -- inline SVG poster string, not a UI icon
  const svg = `<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 800 800'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue1}, 50%, 18%)'/><stop offset='1' stop-color='hsl(${hue2}, 60%, 8%)'/></linearGradient><radialGradient id='r' cx='0.7' cy='0.3' r='0.8'><stop offset='0' stop-color='${releaseColor}' stop-opacity='0.55'/><stop offset='1' stop-color='${releaseColor}' stop-opacity='0'/></radialGradient></defs><rect width='800' height='800' fill='url(%23g)'/><rect width='800' height='800' fill='url(%23r)'/>${
    grain === 'circle'
      ? `<circle cx='${200 + ((i * 17) % 400)}' cy='${200 + ((i * 23) % 400)}' r='${120 + ((i * 7) % 80)}' fill='${releaseColor}' fill-opacity='0.18'/>`
      : `<g stroke='${releaseColor}' stroke-opacity='0.22' stroke-width='1.5'><line x1='0' y1='${200 + i * 6}' x2='800' y2='${260 + i * 4}'/><line x1='0' y1='${360 + i * 5}' x2='800' y2='${420 + i * 3}'/><line x1='0' y1='${520 + i * 4}' x2='800' y2='${560 + i * 2}'/></g>`
  }</svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/#/g, '%23').replace(/"/g, "'")}`;
}

function tagsFor(type: AssetType, release: string): string[] {
  const base = [release.replace(/-/g, ' ')];
  if (type === 'cover') return [...base, 'cover', 'square'];
  if (type === 'reel') return [...base, 'vertical', 'short-form'];
  if (type === 'visualizer') return [...base, 'wide', 'visualizer'];
  if (type === 'lyric_clip') return [...base, 'vertical', 'lyrics'];
  if (type === 'alt_crop') return [...base, 'crop', 'alt'];
  if (type === 'remix_art') return [...base, 'remix', 'art'];
  return [...base, 'master'];
}

type SortKey = 'addedAt' | 'capturedAt' | 'status' | 'popularity';
type ViewMode = 'grid' | 'table';
type SavedViewId =
  | 'all'
  | 'approved'
  | 'reels'
  | 'review'
  | 'this-noise'
  | 'this-week';

interface SavedView {
  id: SavedViewId;
  label: string;
  predicate: (a: Asset) => boolean;
}

const SAVED_VIEWS: SavedView[] = [
  { id: 'all', label: 'All assets', predicate: () => true },
  {
    id: 'approved',
    label: 'Approved',
    predicate: a => a.status === 'approved',
  },
  {
    id: 'reels',
    label: '9:16 only',
    predicate: a => a.aspect === '9:16',
  },
  {
    id: 'review',
    label: 'Needs review',
    predicate: a => a.status === 'review',
  },
  {
    id: 'this-noise',
    label: 'This Noise',
    predicate: a => a.release === 'this-noise',
  },
  {
    id: 'this-week',
    label: 'Generated this week',
    predicate: a => {
      const days = (Date.now() - new Date(a.addedAt).getTime()) / 86400000;
      return days <= 7 && a.generatedBy === 'jovie';
    },
  },
];

interface Filters {
  types: Set<AssetType>;
  aspects: Set<Aspect>;
  releases: Set<string>;
  statuses: Set<Status>;
  channels: Set<Channel>;
  generatedBy: Set<GeneratedBy>;
}

function emptyFilters(): Filters {
  return {
    types: new Set(),
    aspects: new Set(),
    releases: new Set(),
    statuses: new Set(),
    channels: new Set(),
    generatedBy: new Set(),
  };
}

function hasFilters(f: Filters): boolean {
  return (
    f.types.size +
      f.aspects.size +
      f.releases.size +
      f.statuses.size +
      f.channels.size +
      f.generatedBy.size >
    0
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function LibraryV1Page() {
  const allAssets = useMemo(() => generateAssets(), []);
  const [savedView, setSavedView] = useState<SavedViewId>('all');
  const [filters, setFilters] = useState<Filters>(() => emptyFilters());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('addedAt');
  const [view, setView] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(allAssets.filter(a => a.favorite).map(a => a.id))
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(emptyFilters());
  }, []);

  const filteredAssets = useMemo(() => {
    const savedPredicate =
      SAVED_VIEWS.find(v => v.id === savedView)?.predicate ?? (() => true);
    const q = search.trim().toLowerCase();
    return allAssets
      .filter(savedPredicate)
      .filter(a => {
        if (filters.types.size && !filters.types.has(a.type)) return false;
        if (filters.aspects.size && !filters.aspects.has(a.aspect))
          return false;
        if (filters.releases.size && !filters.releases.has(a.release))
          return false;
        if (filters.statuses.size && !filters.statuses.has(a.status))
          return false;
        if (filters.channels.size) {
          const hit = a.channels.some(c => filters.channels.has(c));
          if (!hit) return false;
        }
        if (filters.generatedBy.size && !filters.generatedBy.has(a.generatedBy))
          return false;
        if (q) {
          const hay = `${a.title} ${a.tags.join(' ')} ${a.alt}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'addedAt') return b.addedAt.localeCompare(a.addedAt);
        if (sort === 'capturedAt')
          return b.capturedAt.localeCompare(a.capturedAt);
        if (sort === 'status') return a.status.localeCompare(b.status);
        return b.popularity - a.popularity;
      });
  }, [allAssets, savedView, filters, search, sort]);

  const selected = filteredAssets.find(a => a.id === selectedId) ?? null;

  // Keep selection valid when filter changes.
  useEffect(() => {
    if (selectedId && !filteredAssets.find(a => a.id === selectedId)) {
      setSelectedId(null);
      setDrawerOpen(false);
    }
  }, [filteredAssets, selectedId]);

  // Window-level keyboard nav (arrow keys + Enter + Esc + favorite).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inField) {
        if (e.key === 'Escape') (target as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') {
        if (drawerOpen) setDrawerOpen(false);
        return;
      }
      if (!filteredAssets.length) return;
      const idx = Math.max(
        0,
        filteredAssets.findIndex(a => a.id === selectedId)
      );
      const cols = view === 'grid' ? 4 : 1;
      let next = idx;
      if (e.key === 'ArrowRight')
        next = Math.min(filteredAssets.length - 1, idx + 1);
      else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
      else if (e.key === 'ArrowDown')
        next = Math.min(filteredAssets.length - 1, idx + cols);
      else if (e.key === 'ArrowUp') next = Math.max(0, idx - cols);
      else if (e.key === 'Enter') {
        if (selectedId) setDrawerOpen(true);
        return;
      } else if (e.key.toLowerCase() === 'f' && selectedId) {
        toggleFavorite(selectedId);
        return;
      } else if (e.key === '/') {
        e.preventDefault();
        const inp = document.getElementById(
          'library-search'
        ) as HTMLInputElement | null;
        inp?.focus();
        return;
      } else {
        return;
      }
      e.preventDefault();
      setSelectedId(filteredAssets[next].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filteredAssets, selectedId, drawerOpen, view, toggleFavorite]);

  return (
    <div
      className='h-full w-full grid bg-(--linear-bg-page) text-primary-token'
      style={{
        ...CARBON_VARS,
        gridTemplateColumns: '220px 1fr',
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      }}
    >
      <LeftRail
        savedView={savedView}
        onSavedView={setSavedView}
        assets={allAssets}
        filters={filters}
        onFilters={setFilters}
        onClearAll={clearAllFilters}
      />
      <div
        className='relative grid overflow-hidden'
        style={{
          gridTemplateColumns: drawerOpen ? '1fr 388px' : '1fr 0px',
          transition: `grid-template-columns ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
      >
        <div className='flex flex-col min-w-0 overflow-hidden'>
          <TopBar
            search={search}
            onSearch={setSearch}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            count={filteredAssets.length}
          />
          <div className='flex-1 overflow-y-auto'>
            {filteredAssets.length === 0 ? (
              <EmptyState onClear={clearAllFilters} />
            ) : view === 'grid' ? (
              <Grid
                assets={filteredAssets}
                selectedId={selectedId}
                favorites={favorites}
                onSelect={id => {
                  setSelectedId(id);
                  setDrawerOpen(true);
                }}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <Table
                assets={filteredAssets}
                selectedId={selectedId}
                favorites={favorites}
                onSelect={id => {
                  setSelectedId(id);
                  setDrawerOpen(true);
                }}
                onToggleFavorite={toggleFavorite}
              />
            )}
          </div>
          <StatusBar
            count={filteredAssets.length}
            total={allAssets.length}
            sort={sort}
          />
        </div>
        <Drawer
          asset={selected}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail — saved views + faceted filters with live counts
// ---------------------------------------------------------------------------
function LeftRail({
  savedView,
  onSavedView,
  assets,
  filters,
  onFilters,
  onClearAll,
}: {
  savedView: SavedViewId;
  onSavedView: (v: SavedViewId) => void;
  assets: Asset[];
  filters: Filters;
  onFilters: (f: Filters) => void;
  onClearAll: () => void;
}) {
  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const counts = {
    types: countBy(assets, a => a.type),
    aspects: countBy(assets, a => a.aspect),
    releases: countBy(assets, a => a.release),
    statuses: countBy(assets, a => a.status),
    channels: countByMany(assets, a => a.channels),
    generatedBy: countBy(assets, a => a.generatedBy),
  };

  return (
    <aside className='h-full overflow-y-auto border-r border-(--linear-app-shell-border) bg-(--surface-0) flex flex-col'>
      <div className='shrink-0 px-3 pt-3 pb-2'>
        <div className='flex items-center gap-2 px-1 py-1'>
          <JovieMark className='h-4 w-4 text-primary-token' />
          <span
            className='text-[13.5px] font-semibold text-primary-token'
            style={{ letterSpacing: '-0.01em' }}
          >
            Library
          </span>
        </div>
      </div>

      <div className='shrink-0 px-2 pb-2'>
        <SectionHead label='Views' />
        <div className='flex flex-col gap-px'>
          {SAVED_VIEWS.map(v => {
            const count = assets.filter(v.predicate).length;
            const active = savedView === v.id;
            return (
              <button
                key={v.id}
                type='button'
                onClick={() => onSavedView(v.id)}
                className={cn(
                  'flex items-center gap-2 h-7 px-2 rounded-md text-[12.5px] transition-colors duration-150 ease-out',
                  active
                    ? 'bg-surface-1/80 text-primary-token'
                    : 'text-secondary-token hover:bg-surface-1/50 hover:text-primary-token'
                )}
              >
                <span className='flex-1 text-left truncate'>{v.label}</span>
                <span className='text-[11px] tabular-nums text-quaternary-token'>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className='flex-1 overflow-y-auto px-2 pb-3'>
        <div className='flex items-center justify-between px-2 pt-3 pb-1'>
          <SectionHead label='Filters' inline />
          {hasFilters(filters) && (
            <button
              type='button'
              onClick={onClearAll}
              className='text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
            >
              Clear
            </button>
          )}
        </div>

        <FacetGroup label='Asset type'>
          {TYPES.map(t => (
            <FacetRow
              key={t}
              label={TYPE_LABELS[t]}
              count={counts.types.get(t) ?? 0}
              active={filters.types.has(t)}
              onClick={() =>
                onFilters({ ...filters, types: toggle(filters.types, t) })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup label='Aspect'>
          {ASPECTS.map(a => (
            <FacetRow
              key={a}
              label={a}
              mono
              count={counts.aspects.get(a) ?? 0}
              active={filters.aspects.has(a)}
              onClick={() =>
                onFilters({ ...filters, aspects: toggle(filters.aspects, a) })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup label='Release'>
          {RELEASES.map(r => (
            <FacetRow
              key={r.id}
              label={r.title}
              colorDot={r.color}
              count={counts.releases.get(r.id) ?? 0}
              active={filters.releases.has(r.id)}
              onClick={() =>
                onFilters({
                  ...filters,
                  releases: toggle(filters.releases, r.id),
                })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup label='Status'>
          {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
            <FacetRow
              key={s}
              label={STATUS_LABELS[s]}
              statusDot={s}
              count={counts.statuses.get(s) ?? 0}
              active={filters.statuses.has(s)}
              onClick={() =>
                onFilters({ ...filters, statuses: toggle(filters.statuses, s) })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup label='Channel'>
          {(Object.keys(CHANNEL_LABELS) as Channel[]).map(c => (
            <FacetRow
              key={c}
              label={CHANNEL_LABELS[c]}
              count={counts.channels.get(c) ?? 0}
              active={filters.channels.has(c)}
              onClick={() =>
                onFilters({ ...filters, channels: toggle(filters.channels, c) })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup label='Generated by'>
          {(['jovie', 'edited', 'manual'] as GeneratedBy[]).map(g => (
            <FacetRow
              key={g}
              label={
                g === 'jovie'
                  ? 'Jovie'
                  : g === 'edited'
                    ? 'Jovie + edited'
                    : 'Manual upload'
              }
              count={counts.generatedBy.get(g) ?? 0}
              active={filters.generatedBy.has(g)}
              onClick={() =>
                onFilters({
                  ...filters,
                  generatedBy: toggle(filters.generatedBy, g),
                })
              }
            />
          ))}
        </FacetGroup>
      </div>
    </aside>
  );
}

function countBy<T, K>(items: T[], key: (x: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function countByMany<T, K>(items: T[], key: (x: T) => K[]): Map<K, number> {
  const m = new Map<K, number>();
  for (const item of items) {
    for (const k of key(item)) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function SectionHead({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <p
      className={cn(
        'text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold',
        !inline && 'px-2 pt-2 pb-1'
      )}
    >
      {label}
    </p>
  );
}

function FacetGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className='pt-2'>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        className='w-full flex items-center gap-1 px-2 py-1 text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform duration-150 ease-out',
            open && 'rotate-90'
          )}
        />
        <span className='flex-1 text-left'>{label}</span>
      </button>
      {open && <div className='flex flex-col gap-px pt-0.5'>{children}</div>}
    </div>
  );
}

function FacetRow({
  label,
  count,
  active,
  onClick,
  mono,
  colorDot,
  statusDot,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  mono?: boolean;
  colorDot?: string;
  statusDot?: Status;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 h-6 pl-3 pr-2 rounded-md text-[12px] transition-colors duration-150 ease-out',
        active
          ? 'bg-surface-1/80 text-primary-token'
          : 'text-secondary-token hover:bg-surface-1/50 hover:text-primary-token'
      )}
    >
      {colorDot && (
        <span
          className='h-2 w-2 rounded-full shrink-0'
          style={{ background: colorDot }}
        />
      )}
      {statusDot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            STATUS_DOT[statusDot]
          )}
        />
      )}
      <span
        className={cn(
          'flex-1 text-left truncate',
          mono && 'font-mono text-[11.5px] tracking-wide'
        )}
      >
        {label}
      </span>
      <span className='text-[10.5px] tabular-nums text-quaternary-token'>
        {count}
      </span>
      {active && (
        <span
          className='h-1.5 w-1.5 rounded-full bg-cyan-300 shrink-0'
          aria-hidden
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Top bar — search, sort, view toggle, generate CTA
// ---------------------------------------------------------------------------
function TopBar({
  search,
  onSearch,
  sort,
  onSort,
  view,
  onView,
  count,
}: {
  search: string;
  onSearch: (s: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  count: number;
}) {
  return (
    <header className='shrink-0 h-12 px-4 flex items-center gap-3 border-b border-(--linear-app-shell-border) bg-(--linear-bg-page)/95 backdrop-blur-xl'>
      <h1
        className='text-[14px] font-semibold text-primary-token'
        style={{ letterSpacing: '-0.01em' }}
      >
        Library
      </h1>
      <span className='text-[12px] text-quaternary-token tabular-nums'>
        {count.toString().padStart(2, '0')}
      </span>

      <div className='ml-3 flex-1 max-w-[420px]'>
        <SearchInput value={search} onChange={onSearch} />
      </div>

      <div className='ml-auto flex items-center gap-2'>
        <SortDropdown sort={sort} onSort={onSort} />
        <ViewToggle view={view} onView={onView} />
        <GenerateButton />
      </div>
    </header>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div
      className={cn(
        'flex items-center gap-2 h-8 px-2.5 rounded-md border transition-colors duration-150 ease-out',
        focused
          ? 'border-cyan-400/40 bg-(--surface-1)/70'
          : 'border-(--linear-app-shell-border) bg-(--surface-0) hover:border-white/10'
      )}
    >
      <Search
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          focused ? 'text-primary-token' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <input
        id='library-search'
        ref={ref}
        type='search'
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder='Search assets, tags, releases'
        className='flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] text-primary-token placeholder:text-quaternary-token'
      />
      {value ? (
        <button
          type='button'
          onClick={() => onChange('')}
          className='shrink-0 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border) transition-colors duration-150 ease-out'
          aria-label='Clear search'
        >
          Clear
        </button>
      ) : (
        <kbd className='shrink-0 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
          /
        </kbd>
      )}
    </div>
  );
}

function SortDropdown({
  sort,
  onSort,
}: {
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const labels: Record<SortKey, string> = {
    addedAt: 'Date added',
    capturedAt: 'Date captured',
    status: 'Status',
    popularity: 'Popularity',
  };
  return (
    <div className='relative'>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        className='inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
      >
        <ArrowUpDown className='h-3 w-3' strokeWidth={2.25} />
        <span>{labels[sort]}</span>
        <ChevronDown className='h-3 w-3' strokeWidth={2.25} />
      </button>
      {open && (
        <>
          <button
            type='button'
            aria-label='Close menu'
            tabIndex={-1}
            className='fixed inset-0 z-40 cursor-default'
            onClick={() => setOpen(false)}
          />
          <div className='absolute right-0 top-9 z-50 min-w-[180px] rounded-md border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.32)] p-1'>
            {(Object.keys(labels) as SortKey[]).map(k => (
              <button
                key={k}
                type='button'
                onClick={() => {
                  onSort(k);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left h-7 px-2 rounded text-[12px] flex items-center gap-2',
                  k === sort
                    ? 'text-primary-token bg-surface-1/60'
                    : 'text-secondary-token hover:bg-surface-1/40 hover:text-primary-token'
                )}
              >
                <span className='flex-1'>{labels[k]}</span>
                {k === sort && (
                  <CheckCircle2 className='h-3 w-3 text-cyan-300' />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onView,
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  return (
    <div className='inline-flex h-7 rounded-md border border-(--linear-app-shell-border) bg-(--surface-0) p-0.5'>
      <button
        type='button'
        onClick={() => onView('grid')}
        className={cn(
          'h-6 w-7 rounded-[5px] grid place-items-center transition-colors duration-150 ease-out',
          view === 'grid'
            ? 'bg-surface-2/80 text-primary-token'
            : 'text-quaternary-token hover:text-primary-token'
        )}
        aria-label='Grid view'
      >
        <Grid3x3 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </button>
      <button
        type='button'
        onClick={() => onView('table')}
        className={cn(
          'h-6 w-7 rounded-[5px] grid place-items-center transition-colors duration-150 ease-out',
          view === 'table'
            ? 'bg-surface-2/80 text-primary-token'
            : 'text-quaternary-token hover:text-primary-token'
        )}
        aria-label='Table view'
      >
        <LayoutList className='h-3.5 w-3.5' strokeWidth={2.25} />
      </button>
    </div>
  );
}

function GenerateButton() {
  return (
    <button
      type='button'
      className='inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium bg-cyan-300 text-black hover:bg-cyan-200 transition-colors duration-150 ease-out'
    >
      <Sparkles className='h-3.5 w-3.5' strokeWidth={2.25} />
      <span>Generate</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Grid + table views
// ---------------------------------------------------------------------------
function Grid({
  assets,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  assets: Asset[];
  selectedId: string | null;
  favorites: Set<string>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div
      className='p-4 grid gap-3'
      style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
    >
      {assets.map(a => (
        <AssetCard
          key={a.id}
          asset={a}
          selected={selectedId === a.id}
          favorite={favorites.has(a.id)}
          onSelect={() => onSelect(a.id)}
          onToggleFavorite={() => onToggleFavorite(a.id)}
        />
      ))}
    </div>
  );
}

function AssetCard({
  asset,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  asset: Asset;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const release = RELEASES.find(r => r.id === asset.release);
  const TypeIcon = TYPE_ICONS[asset.type];
  return (
    <button
      type='button'
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col text-left rounded-[10px] border bg-(--linear-app-content-surface) overflow-hidden transition-colors duration-150 ease-out',
        selected
          ? 'border-cyan-400/50'
          : 'border-(--linear-app-shell-border) hover:border-white/15'
      )}
    >
      {selected && (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-0 rounded-[10px]'
          style={{
            boxShadow:
              'inset 2px 0 0 0 #67e8f9, inset 0 0 0 1px rgba(103,232,249,0.08)',
          }}
        />
      )}
      <Poster asset={asset} />
      <div className='flex flex-col gap-1 px-2.5 pt-2 pb-2.5 min-w-0'>
        <div className='flex items-center gap-1.5 min-w-0'>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              STATUS_DOT[asset.status]
            )}
          />
          <p
            className='text-[12.5px] font-medium text-primary-token truncate'
            style={{ letterSpacing: '-0.005em' }}
          >
            {asset.title}
          </p>
        </div>
        <div className='flex items-center gap-1.5 text-[10.5px] text-quaternary-token'>
          <TypeIcon className='h-3 w-3' strokeWidth={2.25} />
          <span>{TYPE_LABELS[asset.type]}</span>
          <span className='opacity-50'>·</span>
          <span className='font-mono tracking-wide'>{asset.aspect}</span>
          <span className='opacity-50'>·</span>
          <span
            className='inline-flex items-center gap-1 truncate'
            style={{ color: 'rgba(255,255,255,0.46)' }}
          >
            <span
              className='h-1.5 w-1.5 rounded-full shrink-0'
              style={{ background: release?.color }}
            />
            <span className='truncate'>{release?.title}</span>
          </span>
        </div>
      </div>
      <button
        type='button'
        onClick={e => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          'absolute top-2 right-2 h-6 w-6 rounded-md grid place-items-center transition-colors duration-150 ease-out',
          favorite
            ? 'text-amber-300 bg-black/50 backdrop-blur'
            : 'text-quaternary-token bg-black/40 backdrop-blur opacity-0 group-hover:opacity-100 hover:text-amber-300'
        )}
        aria-label={favorite ? 'Unfavorite' : 'Favorite'}
      >
        <Star
          className='h-3 w-3'
          strokeWidth={2.25}
          fill={favorite ? 'currentColor' : 'none'}
        />
      </button>
      <span className='absolute top-2 left-2 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-primary-token bg-black/55 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out'>
        Inspect
      </span>
    </button>
  );
}

function Poster({ asset }: { asset: Asset }) {
  const aspectPad =
    asset.aspect === '1:1'
      ? '100%'
      : asset.aspect === '9:16'
        ? '177.78%'
        : asset.aspect === '16:9'
          ? '56.25%'
          : '125%'; // 4:5
  return (
    <div className='relative w-full overflow-hidden bg-black'>
      <div style={{ paddingBottom: aspectPad }} />
      <div
        role='img'
        aria-label={asset.alt}
        className='absolute inset-0 bg-center bg-cover'
        style={{ backgroundImage: `url("${asset.poster}")` }}
      />
      {asset.durationSec && (
        <span className='absolute bottom-1.5 right-1.5 inline-flex items-center h-4 px-1.5 rounded text-[9.5px] font-caption text-primary-token bg-black/60 backdrop-blur'>
          {Math.floor(asset.durationSec / 60)}:
          {String(asset.durationSec % 60).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}

function Table({
  assets,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  assets: Asset[];
  selectedId: string | null;
  favorites: Set<string>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div className='px-2 py-2'>
      <div
        className='grid items-center px-2 py-1.5 text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token border-b border-(--linear-app-shell-border) sticky top-0 bg-(--linear-bg-page)/95 backdrop-blur z-10'
        style={{
          gridTemplateColumns: '32px 48px 1fr 100px 80px 1fr 100px 110px 28px',
        }}
      >
        <span />
        <span />
        <span>Title</span>
        <span>Type</span>
        <span>Aspect</span>
        <span>Release</span>
        <span>Status</span>
        <span className='text-right'>Added</span>
        <span />
      </div>
      <div className='flex flex-col'>
        {assets.map(a => {
          const selected = selectedId === a.id;
          const release = RELEASES.find(r => r.id === a.release);
          const TypeIcon = TYPE_ICONS[a.type];
          const fav = favorites.has(a.id);
          return (
            // biome-ignore lint/a11y/useSemanticElements: row contains a nested favorite <button>; cannot use <button> here
            <div
              key={a.id}
              role='button'
              tabIndex={0}
              onClick={() => onSelect(a.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(a.id);
                }
              }}
              className={cn(
                'group relative grid items-center px-2 py-1 text-[12.5px] text-secondary-token text-left transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40',
                selected
                  ? 'bg-cyan-400/[0.08] text-primary-token'
                  : 'hover:bg-surface-1/40 hover:text-primary-token'
              )}
              style={{
                gridTemplateColumns:
                  '32px 48px 1fr 100px 80px 1fr 100px 110px 28px',
              }}
            >
              {selected && (
                <span
                  aria-hidden
                  className='pointer-events-none absolute inset-0'
                  style={{ boxShadow: 'inset 2px 0 0 0 #67e8f9' }}
                />
              )}
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  onToggleFavorite(a.id);
                }}
                className={cn(
                  'inline-grid place-items-center h-6 w-6 rounded-md transition-colors duration-150 ease-out',
                  fav
                    ? 'text-amber-300'
                    : 'text-quaternary-token hover:text-amber-300'
                )}
                aria-label={fav ? 'Unfavorite' : 'Favorite'}
              >
                <Star
                  className='h-3 w-3'
                  strokeWidth={2.25}
                  fill={fav ? 'currentColor' : 'none'}
                />
              </button>
              <span className='h-8 w-9 rounded-[4px] overflow-hidden bg-black'>
                <span
                  className='block h-full w-full bg-center bg-cover'
                  style={{ backgroundImage: `url("${a.poster}")` }}
                />
              </span>
              <span className='truncate text-primary-token font-medium pr-3'>
                {a.title}
              </span>
              <span className='inline-flex items-center gap-1.5 text-tertiary-token'>
                <TypeIcon className='h-3 w-3' strokeWidth={2.25} />
                {TYPE_LABELS[a.type]}
              </span>
              <span className='font-mono text-[11.5px] text-tertiary-token tracking-wide'>
                {a.aspect}
              </span>
              <span className='inline-flex items-center gap-1.5 truncate'>
                <span
                  className='h-1.5 w-1.5 rounded-full shrink-0'
                  style={{ background: release?.color }}
                />
                <span className='truncate text-tertiary-token'>
                  {release?.title}
                </span>
              </span>
              <span className='inline-flex items-center gap-1.5 text-tertiary-token'>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    STATUS_DOT[a.status]
                  )}
                />
                {STATUS_LABELS[a.status]}
              </span>
              <span className='text-right text-tertiary-token tabular-nums'>
                {relativeTime(a.addedAt)}
              </span>
              <span className='inline-grid place-items-center text-quaternary-token opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out'>
                <MoreHorizontal className='h-3.5 w-3.5' strokeWidth={2.25} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right drawer — inline metadata, version stack, downloads, activity
// ---------------------------------------------------------------------------
function Drawer({
  asset,
  open,
  onClose,
  favorites,
  onToggleFavorite,
}: {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAlt, setDraftAlt] = useState('');
  const [draftTags, setDraftTags] = useState('');

  useEffect(() => {
    if (!asset) return;
    setDraftTitle(asset.title);
    setDraftAlt(asset.alt);
    setDraftTags(asset.tags.join(', '));
    setEditing(false);
  }, [asset]);

  return (
    <aside
      aria-hidden={!open}
      className='h-full overflow-hidden border-l border-(--linear-app-shell-border) bg-(--surface-0)'
      style={{
        opacity: open ? 1 : 0,
        transition: `opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
      }}
    >
      {asset && (
        <div className='h-full overflow-y-auto'>
          <div className='sticky top-0 z-10 flex items-center justify-between px-3 h-10 border-b border-(--linear-app-shell-border) bg-(--surface-0)/95 backdrop-blur'>
            <span className='text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token'>
              Asset
            </span>
            <div className='flex items-center gap-1'>
              <button
                type='button'
                onClick={() => onToggleFavorite(asset.id)}
                className={cn(
                  'h-6 w-6 rounded-md grid place-items-center transition-colors duration-150 ease-out',
                  favorites.has(asset.id)
                    ? 'text-amber-300'
                    : 'text-quaternary-token hover:text-amber-300'
                )}
                aria-label='Favorite'
              >
                <Star
                  className='h-3.5 w-3.5'
                  strokeWidth={2.25}
                  fill={favorites.has(asset.id) ? 'currentColor' : 'none'}
                />
              </button>
              <button
                type='button'
                onClick={onClose}
                className='h-6 w-6 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
                aria-label='Close'
              >
                <X className='h-3.5 w-3.5' strokeWidth={2.25} />
              </button>
            </div>
          </div>

          <div className='p-3'>
            <div className='rounded-[8px] overflow-hidden border border-(--linear-app-shell-border) bg-black'>
              <Poster asset={asset} />
            </div>
          </div>

          <div className='px-4 pb-3'>
            {editing ? (
              <div className='flex flex-col gap-2'>
                <input
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  className='w-full bg-(--surface-1)/80 border border-(--linear-app-shell-border) rounded-md px-2 py-1.5 text-[14px] font-semibold text-primary-token outline-none focus:border-cyan-400/40'
                />
                <textarea
                  value={draftAlt}
                  onChange={e => setDraftAlt(e.target.value)}
                  rows={2}
                  className='w-full bg-(--surface-1)/80 border border-(--linear-app-shell-border) rounded-md px-2 py-1.5 text-[12.5px] text-secondary-token outline-none focus:border-cyan-400/40 resize-none'
                  placeholder='Alt text'
                />
                <input
                  value={draftTags}
                  onChange={e => setDraftTags(e.target.value)}
                  className='w-full bg-(--surface-1)/80 border border-(--linear-app-shell-border) rounded-md px-2 py-1.5 text-[12px] text-secondary-token outline-none focus:border-cyan-400/40'
                  placeholder='Comma-separated tags'
                />
                <div className='flex items-center gap-1.5 pt-1'>
                  <button
                    type='button'
                    onClick={() => setEditing(false)}
                    className='h-7 px-3 rounded-md text-[12px] bg-cyan-300 text-black hover:bg-cyan-200 transition-colors duration-150 ease-out'
                  >
                    Save
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setDraftTitle(asset.title);
                      setDraftAlt(asset.alt);
                      setDraftTags(asset.tags.join(', '));
                      setEditing(false);
                    }}
                    className='h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type='button'
                className='group/title w-full flex items-start gap-2 -mx-2 -my-1 px-2 py-1 rounded-md hover:bg-surface-1/40 cursor-text text-left'
                onClick={() => setEditing(true)}
                aria-label='Edit title and alt text'
              >
                <div className='flex-1 min-w-0'>
                  <h2
                    className='text-[15px] font-semibold text-primary-token truncate'
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    {asset.title}
                  </h2>
                  <p className='text-[12px] text-tertiary-token mt-0.5'>
                    {asset.alt}
                  </p>
                </div>
                <span className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token opacity-0 group-hover/title:opacity-100 transition-opacity duration-150 ease-out'>
                  Edit
                </span>
              </button>
            )}

            <div className='flex flex-wrap gap-1 pt-2'>
              {(editing ? draftTags.split(',') : asset.tags).map(t => {
                const trimmed = t.trim();
                if (!trimmed) return null;
                return (
                  <span
                    key={trimmed}
                    className='inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-caption text-tertiary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'
                  >
                    {trimmed}
                  </span>
                );
              })}
            </div>
          </div>

          <DrawerSection label='Release moment'>
            <ReleaseMoment asset={asset} />
          </DrawerSection>

          <DrawerSection label='Channels'>
            <div className='flex flex-wrap gap-1'>
              {asset.channels.map(c => (
                <span
                  key={c}
                  className='inline-flex items-center h-6 px-2 rounded-md text-[11.5px] text-secondary-token bg-(--surface-1)/70 border border-(--linear-app-shell-border)'
                >
                  {CHANNEL_LABELS[c]}
                </span>
              ))}
            </div>
          </DrawerSection>

          <DrawerSection label={`Versions · ${asset.versionCount}`}>
            <VersionStack asset={asset} />
          </DrawerSection>

          <DrawerSection label='Generated by'>
            <div className='flex items-center gap-2'>
              {asset.generatedBy === 'jovie' ? (
                <Sparkles
                  className='h-3.5 w-3.5 text-cyan-300'
                  strokeWidth={2.25}
                />
              ) : asset.generatedBy === 'edited' ? (
                <Sparkles
                  className='h-3.5 w-3.5 text-amber-300'
                  strokeWidth={2.25}
                />
              ) : (
                <CircleDashed
                  className='h-3.5 w-3.5 text-tertiary-token'
                  strokeWidth={2.25}
                />
              )}
              <span className='text-[12.5px] text-secondary-token'>
                {asset.generatedByModel}
              </span>
            </div>
            {asset.promptSeed && (
              <p className='mt-2 text-[11.5px] text-tertiary-token leading-relaxed'>
                {asset.promptSeed}
              </p>
            )}
          </DrawerSection>

          <DrawerSection label='Activity'>
            <ActivityRow
              icon={Eye}
              label='Views'
              value={(asset.popularity * 12).toLocaleString()}
            />
            <ActivityRow
              icon={ArrowDownToLine}
              label='Downloads'
              value={(asset.popularity * 0.4).toFixed(0)}
            />
            <ActivityRow
              icon={Clock}
              label='Captured'
              value={relativeTime(asset.capturedAt)}
            />
            <ActivityRow
              icon={Plus}
              label='Added'
              value={relativeTime(asset.addedAt)}
            />
          </DrawerSection>

          <div className='px-3 py-3 sticky bottom-0 bg-gradient-to-t from-(--surface-0) via-(--surface-0)/95 to-transparent border-t border-(--linear-app-shell-border)'>
            <div className='grid grid-cols-3 gap-1.5'>
              <DownloadButton label='Original' sub='Source · 1080×1920' />
              <DownloadButton label='Preview' sub='Web · 720p' />
              <DownloadButton label='Preset' sub='Reel · 1080×1920' primary />
            </div>
            <div className='flex items-center gap-1.5 pt-2'>
              <SecondaryAction icon={Share2} label='Share link' />
              <SecondaryAction icon={Copy} label='Duplicate' />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className='px-4 py-3 border-t border-(--linear-app-shell-border)/70'>
      <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold pb-2'>
        {label}
      </p>
      {children}
    </section>
  );
}

function ReleaseMoment({ asset }: { asset: Asset }) {
  const release = RELEASES.find(r => r.id === asset.release);
  return (
    <div className='flex items-center gap-2.5 p-2 rounded-md bg-(--surface-1)/60 border border-(--linear-app-shell-border)'>
      <span
        className='h-7 w-7 rounded-md grid place-items-center'
        style={{ background: `${release?.color}22`, color: release?.color }}
      >
        <Disc3 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </span>
      <div className='flex-1 min-w-0'>
        <p
          className='text-[12.5px] font-medium text-primary-token truncate'
          style={{ letterSpacing: '-0.005em' }}
        >
          {release?.title}
        </p>
        <p className='text-[11px] text-tertiary-token'>
          Release · drops in {((asset.id.charCodeAt(7) % 9) + 3).toString()}{' '}
          days
        </p>
      </div>
      <button
        type='button'
        className='text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
      >
        Open
      </button>
    </div>
  );
}

function VersionStack({ asset }: { asset: Asset }) {
  const versions = Array.from({ length: asset.versionCount }).map((_, i) => ({
    n: asset.versionCount - i,
    current: i === 0,
    relative: i === 0 ? 'now' : `${i * 2}d ago`,
  }));
  return (
    <div className='flex flex-col gap-1'>
      {versions.map(v => (
        <div
          key={v.n}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors duration-150 ease-out',
            v.current
              ? 'border-cyan-400/30 bg-cyan-400/[0.06]'
              : 'border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/40'
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              v.current ? 'bg-cyan-300' : 'bg-quaternary-token'
            )}
          />
          <span className='text-[12px] text-primary-token tabular-nums font-mono'>
            v{v.n}
          </span>
          <span className='text-[11px] text-quaternary-token'>
            {v.relative}
          </span>
          <span className='ml-auto'>
            {v.current ? (
              <span className='text-[10px] uppercase tracking-[0.06em] text-cyan-300'>
                Current
              </span>
            ) : (
              <button
                type='button'
                className='text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
              >
                Make current
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-center gap-2 py-1'>
      <Icon className='h-3 w-3 text-quaternary-token' strokeWidth={2.25} />
      <span className='text-[11.5px] text-tertiary-token flex-1'>{label}</span>
      <span className='text-[12px] text-primary-token tabular-nums'>
        {value}
      </span>
    </div>
  );
}

function DownloadButton({
  label,
  sub,
  primary,
}: {
  label: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <button
      type='button'
      className={cn(
        'flex flex-col items-start gap-0.5 h-12 px-2.5 rounded-md transition-colors duration-150 ease-out text-left',
        primary
          ? 'bg-cyan-300 text-black hover:bg-cyan-200'
          : 'border border-(--linear-app-shell-border) bg-(--surface-0) text-secondary-token hover:bg-surface-1/60 hover:text-primary-token'
      )}
    >
      <span className='text-[11.5px] font-medium leading-none'>{label}</span>
      <span
        className={cn(
          'text-[10px] leading-none',
          primary ? 'text-black/70' : 'text-quaternary-token'
        )}
      >
        {sub}
      </span>
    </button>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
}: {
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      type='button'
      className='flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[11.5px] text-secondary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 hover:text-primary-token transition-colors duration-150 ease-out'
    >
      <Icon className='h-3 w-3' strokeWidth={2.25} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status bar + empty state
// ---------------------------------------------------------------------------
function StatusBar({
  count,
  total,
  sort,
}: {
  count: number;
  total: number;
  sort: SortKey;
}) {
  const sortLabels: Record<SortKey, string> = {
    addedAt: 'Date added',
    capturedAt: 'Date captured',
    status: 'Status',
    popularity: 'Popularity',
  };
  return (
    <footer className='shrink-0 h-7 px-3 flex items-center gap-3 border-t border-(--linear-app-shell-border) text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token bg-(--surface-0)/60'>
      <span className='tabular-nums'>
        {count} of {total}
      </span>
      <span>·</span>
      <span>Sorted by {sortLabels[sort]}</span>
      <span className='ml-auto'>
        <kbd className='inline-flex items-center h-4 px-1 rounded text-[9.5px] font-caption uppercase text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
          /
        </kbd>{' '}
        search
        <span className='mx-2 opacity-40'>·</span>
        <kbd className='inline-flex items-center h-4 px-1 rounded text-[9.5px] font-caption uppercase text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
          ↵
        </kbd>{' '}
        inspect
        <span className='mx-2 opacity-40'>·</span>
        <kbd className='inline-flex items-center h-4 px-1 rounded text-[9.5px] font-caption uppercase text-quaternary-token bg-(--surface-2)/60 border border-(--linear-app-shell-border)'>
          F
        </kbd>{' '}
        favorite
      </span>
    </footer>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className='h-full grid place-items-center px-6'>
      <div className='max-w-md text-center'>
        <div className='inline-grid place-items-center h-12 w-12 rounded-full bg-(--surface-1) border border-(--linear-app-shell-border) mx-auto'>
          <Circle
            className='h-5 w-5 text-quaternary-token'
            strokeWidth={2.25}
          />
        </div>
        <h2
          className='mt-4 text-[15px] font-semibold text-primary-token'
          style={{ letterSpacing: '-0.01em' }}
        >
          Nothing matches yet
        </h2>
        <p className='mt-1.5 text-[12.5px] text-tertiary-token'>
          Try widening your filters or searching for a release name, channel, or
          asset type.
        </p>
        <div className='mt-3'>
          <button
            type='button'
            onClick={onClear}
            className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-primary-token bg-(--surface-1) border border-(--linear-app-shell-border) hover:bg-surface-2/80 transition-colors duration-150 ease-out'
          >
            Clear all filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Jovie mark
// ---------------------------------------------------------------------------
function JovieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 353.68 347.97'
      className={className}
      shapeRendering='geometricPrecision'
      aria-hidden='true'
    >
      <path
        fill='currentColor'
        d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z'
      />
    </svg>
  );
}

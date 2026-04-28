'use client';

// ---------------------------------------------------------------------------
// DESIGN RULE — NO AI-SLOP GRADIENTS ON UI CHROME
// ---------------------------------------------------------------------------
// Multi-stop purple/pink/blue gradients (violet-→fuchsia-→blue and friends)
// are the #1 visual tell of AI-generated UI. They read as cheap and
// undesigned, no matter how careful the rest of the work is.
//
// DO NOT use them on:
//   • Brand marks, logos, avatars
//   • Active/selected/hover states
//   • Buttons, badges, pills, chips
//   • Borders, dividers, accent bars
//   • Progress hairlines or focus rings
//
// Use solid tokens (text-primary, bg-surface-1, etc.) or single-stop tonal
// shifts of the same hue. If you reach for a gradient, audit the next day.
//
// EXCEPTION: the audio waveform's purple→pink→blue gradient is a deliberate
// hero accent — it's content, not chrome (encodes frequency register), and
// it's the *one* visual moment that's allowed to draw the eye this hard.
// There is room for ONE such hero gradient per screen — and really one per
// app. If you want to add a second, kill the first.
// ---------------------------------------------------------------------------
// KEYBOARD SHORTCUT RULE
// ---------------------------------------------------------------------------
// Every keyboard shortcut MUST be discoverable in two places:
//   1. The button or affordance it triggers — `title="Action (⌘K)"`,
//      ideally rendered as a styled Tooltip with a kbd chip on the right.
//   2. A central registry — see SHORTCUTS in `@/lib/shortcuts` — so a
//      "keyboard shortcuts" sheet can ship later without hunting them down.
// Format: `⌘K`, `⌥/`, `Hold ⌘J`, `[`, `Esc`. Use `⌘` not `Cmd`, `⌥` not
// `Alt`, for visual density.

import {
  Activity,
  Archive,
  ArrowRight,
  ArrowUpDown,
  AudioLines,
  AudioWaveform,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Disc3,
  ExternalLink,
  Flag,
  Heart,
  Inbox,
  LayoutDashboard,
  Library as LibraryIcon,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  SquarePen,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Asset as LibraryAsset,
  Filters as LibraryFiltersType,
  SavedViewId as LibrarySavedViewId,
  SortKey as LibrarySortKey,
  ViewMode as LibraryViewMode,
} from '@/app/exp/library-v1/page';
import {
  emptyFilters as emptyLibraryFilters,
  generateAssets as generateLibraryAssets,
  Drawer as LibraryDrawer,
  EmptyState as LibraryEmptyState,
  Grid as LibraryGrid,
  LeftRail as LibraryLeftRail,
  SortDropdown as LibrarySortDropdown,
  StatusBar as LibraryStatusBar,
  Table as LibraryTable,
  ViewToggle as LibraryViewToggle,
} from '@/app/exp/library-v1/page';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
import { ActionPill } from '@/components/shell/ActionPill';
import { ActivityHoverRow } from '@/components/shell/ActivityHoverRow';
import { AgentPulse } from '@/components/shell/AgentPulse';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { AssigneeChip } from '@/components/shell/AssigneeChip';
import { AudioBar } from '@/components/shell/AudioBar';
import { ColumnLabel } from '@/components/shell/ColumnLabel';
import { ContextMenuOverlay } from '@/components/shell/ContextMenuOverlay';
import { CuesPanel } from '@/components/shell/CuesPanel';
import { DrawerHero as ProductionDrawerHero } from '@/components/shell/DrawerHero';
import { DrawerTabStrip } from '@/components/shell/DrawerTabStrip';
import { DropDateChip } from '@/components/shell/DropDateChip';
import {
  type DspAvatarItem,
  DspAvatarStack,
} from '@/components/shell/DspAvatarStack';
import { DueChip } from '@/components/shell/DueChip';
import { EntityHoverLink } from '@/components/shell/EntityPopover';
import { EntityThreadGlyph } from '@/components/shell/EntityThreadGlyph';
import { InlineEditRow } from '@/components/shell/InlineEditRow';
import { InstallBanner } from '@/components/shell/InstallBanner';
import { JovieOverlay } from '@/components/shell/JovieOverlay';
import { LabelPills } from '@/components/shell/LabelPills';
import { LyricsList } from '@/components/shell/LyricsList';
import { LyricsView } from '@/components/shell/LyricsView';
import { MetaPill } from '@/components/shell/MetaPill';
import { MobilePlayerCard } from '@/components/shell/MobilePlayerCard';
import {
  PerformanceCard,
  type PerformanceRangeKey,
} from '@/components/shell/PerformanceCard';
import { PickerAction } from '@/components/shell/PickerAction';
import { PickerLink } from '@/components/shell/PickerLink';
import { PickerToggle } from '@/components/shell/PickerToggle';
import { PillSearch } from '@/components/shell/PillSearch';
import { PlayingBars } from '@/components/shell/PlayingBars';
import { PriorityGlyph } from '@/components/shell/PriorityGlyph';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import { RowWaveform } from '@/components/shell/RowWaveform';
import { SettingsRow } from '@/components/shell/SettingsRow';
import {
  type EntityPopoverData,
  ShellDropdown,
} from '@/components/shell/ShellDropdown';
import { ShellLoader } from '@/components/shell/ShellLoader';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { SidebarNavItem } from '@/components/shell/SidebarNavItem';
import {
  type NowPlayingTrack,
  SidebarNowPlaying,
} from '@/components/shell/SidebarNowPlaying';
import { SidebarSection } from '@/components/shell/SidebarSection';
import { SidebarThreadsSection } from '@/components/shell/SidebarThreadsSection';
import { SmartLinkRow } from '@/components/shell/SmartLinkRow';
import type { SparklineTrend } from '@/components/shell/Sparkline';
import { Stat } from '@/components/shell/Stat';
import { StatusBadge } from '@/components/shell/StatusBadge';
import { SuggestionCard } from '@/components/shell/SuggestionCard';
import { TabletPlayerCard } from '@/components/shell/TabletPlayerCard';
import { TaskStatusIcon } from '@/components/shell/TaskStatusIcon';
import { ThreadAudioCard } from '@/components/shell/ThreadAudioCard';
import { ThreadImageCard } from '@/components/shell/ThreadImageCard';
import { ThreadTurn } from '@/components/shell/ThreadTurn';
import { ThreadVideoCard } from '@/components/shell/ThreadVideoCard';
import { ThreadView as ShellThreadView } from '@/components/shell/ThreadView';
import { Tooltip } from '@/components/shell/Tooltip';
import { TypeBadge } from '@/components/shell/TypeBadge';
import { dropDateMeta } from '@/lib/format-drop-date';
// ---------------------------------------------------------------------------
// DESIGN RULE — NO AI-SLOP GRADIENTS ON UI CHROME
// ---------------------------------------------------------------------------
// Multi-stop purple/pink/blue gradients (violet-→fuchsia-→blue and friends)
// are the #1 visual tell of AI-generated UI. They read as cheap and
// undesigned, no matter how careful the rest of the work is.
//
// DO NOT use them on:
//   • Brand marks, logos, avatars
//   • Active/selected/hover states
//   • Buttons, badges, pills, chips
//   • Borders, dividers, accent bars
//   • Progress hairlines or focus rings
//
// Use solid tokens (text-primary, bg-surface-1, etc.) or single-stop tonal
// shifts of the same hue. If you reach for a gradient, audit the next day.
//
// EXCEPTION: the audio waveform's purple→pink→blue gradient is a deliberate
// hero accent — it's content, not chrome (encodes frequency register), and
// it's the *one* visual moment that's allowed to draw the eye this hard.
// There is room for ONE such hero gradient per screen — and really one per
// app. If you want to add a second, kill the first.
// ---------------------------------------------------------------------------
// KEYBOARD SHORTCUT RULE
// ---------------------------------------------------------------------------
// Every keyboard shortcut MUST be discoverable in two places:
//   1. The button or affordance it triggers — `title="Action (⌘K)"`,
//      ideally rendered as a styled Tooltip with a kbd chip on the right.
//   2. A central registry — see SHORTCUTS in `@/lib/shortcuts` — so a
//      "keyboard shortcuts" sheet can ship later without hunting them down.
import { SHORTCUTS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

type Variant = 'a' | 'b' | 'c' | 'd' | 'e';
type CanvasView =
  | 'demo'
  | 'releases'
  | 'tracks'
  | 'tasks'
  | 'library'
  | 'lyrics'
  | 'settings'
  | 'thread'
  | 'onboarding';

type TrackInfo = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  bpm: number;
  key: string;
  version: string;
  durationSec: number;
  isrc: string;
  hasLyrics: boolean;
};

const toNowPlayingTrack = (t: TrackInfo): NowPlayingTrack => ({
  trackTitle: t.title,
  artistName: t.artist,
  artworkUrl: t.artwork,
});

// Live-editable palette. The page wrapper writes these as CSS custom
// properties so the dev picker can mutate them in real time.
type Palette = {
  page: string;
  surface0: string;
  surface1: string;
  surface2: string;
  contentSurface: string;
  border: string;
};
const PALETTE_PRESETS: Record<string, Palette> = {
  'Cool Black': {
    page: '#08090b',
    surface0: '#0c0e11',
    surface1: '#13161b',
    surface2: '#191d23',
    contentSurface: '#0d0f13',
    border: '#1a1d23',
  },
  Carbon: {
    page: '#06070a',
    surface0: '#0a0b0e',
    surface1: '#101216',
    surface2: '#161a20',
    contentSurface: '#0a0c0f',
    border: '#171a20',
  },
  Graphite: {
    // Slightly lighter / more readable while staying cool.
    page: '#0a0c0f',
    surface0: '#0e1115',
    surface1: '#161a20',
    surface2: '#1d2229',
    contentSurface: '#0f1216',
    border: '#1d2128',
  },
};

// Inline Jovie brand mark — small SVG so the experiment file stays
// self-contained (the production Logo component imports next/image).
// Most transitions snap (150ms ease-out). Layout transformations get
// a cinematic curve — the kind of thing you only get on macOS / Apple
// surfaces, where the system invests motion budget in revealing structure.
const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

// Selected/focused row treatment — electric cyan accent. Calibrated to
// stay invisible at low brightness (the "DJ on a red-eye flight" test):
// Selection language: a small pill-chip on the left edge (h-3.5 w-[3px]
// rounded-full) plus a soft cyan bg tint. The inset 2px bar didn't follow
// the row's rounded-md corners gracefully — the pill is its own rounded
// shape, vertically centered, so it reads as a deliberate accent instead
// of a slab against rounded corners. Both keyboard focus and drawer
// selection trigger it.
const SELECTED_ROW_CLASSES = [
  'data-[focused]:bg-[rgb(34_211_238/0.06)]',
  'data-[focused]:hover:bg-[rgb(34_211_238/0.10)]',
  'data-[selected]:bg-[rgb(34_211_238/0.08)]',
  'data-[selected]:hover:bg-[rgb(34_211_238/0.12)]',
  // Pseudo-element pill chip
  "before:content-['']",
  'before:absolute before:left-0.5 before:top-1/2 before:-translate-y-1/2',
  'before:h-3.5 before:w-[3px] before:rounded-full before:bg-cyan-300/0',
  'data-[focused]:before:bg-cyan-300/85',
  'data-[selected]:before:bg-cyan-300/85',
  'before:transition-colors before:duration-150 before:ease-out',
].join(' ');

const TRACK = {
  title: 'Lost in the Light',
  artist: 'Bahamas',
  album: 'Bahamas Is Afie',
  version: 'Album Version',
  bpm: 96,
  key: 'A min',
  artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
  currentTime: 78,
  duration: 213,
};

// Demo loop section (percent-of-track) used when loopMode === 'section'.
const LOOP_SECTION = { from: 31, to: 58 };

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  // Optional: when present, clicking the item invokes this. Most sidebar
  // items are visual placeholders in the design pass, but a few (Library)
  // wire to the canvas view to demo the surface.
  onActivate?: () => void;
};
type Workspace = {
  id: string;
  name: string;
  initials: string;
  items: NavItem[];
};

// Core items that span all artists / contexts. Search lives at the top of
// the sidebar (replaces the previous Inbox slot) so it's always one click
// away — and the canvas-subheader search icon goes away too.
const CORE_ITEMS: NavItem[] = [
  { icon: Search, label: 'Search' },
  { icon: Activity, label: 'Tasks' },
  { icon: LibraryIcon, label: 'Library' },
];

// Threads = jobs. Each Jovie action (UI button or chat message) creates
// a thread that auto-renames as it runs. Status drives the dot color
// (running = cyan pulse, complete = neutral, errored = rose). Click a
// thread → opens it in the canvas; the related entity (track, release,
// task) also gets a small loading glyph linked to the same thread.
type ThreadStatus = 'running' | 'complete' | 'errored';
type Thread = {
  id: string;
  title: string;
  status: ThreadStatus;
  entityKind?: 'release' | 'track' | 'task';
  entityId?: string;
  // ISO timestamp — most recent first when sorted descending.
  updatedAt: string;
  // Whether the user has opened the thread since it last updated. Unread
  // rows highlight in the sidebar so they pull attention.
  unread?: boolean;
};

const THREADS: Thread[] = [
  {
    id: 'thr-1',
    title: 'Generating lyric video for Lost in the Light',
    status: 'running',
    entityKind: 'release',
    entityId: 'lost-in-the-light',
    updatedAt: '2026-04-26T09:48:00Z',
  },
  {
    id: 'thr-2',
    title: 'Drafting Detroit booking pitch',
    status: 'running',
    updatedAt: '2026-04-26T09:31:00Z',
  },
  {
    id: 'thr-3',
    title: 'Spotify Canvas regenerated for Stronger Than That',
    status: 'complete',
    entityKind: 'release',
    entityId: 'stronger-than-that',
    updatedAt: '2026-04-26T08:12:00Z',
    unread: true,
  },
  {
    id: 'thr-4',
    title: 'Apple Music spatial render',
    status: 'errored',
    entityKind: 'task',
    entityId: 'J-119',
    updatedAt: '2026-04-25T22:04:00Z',
    unread: true,
  },
  {
    id: 'thr-5',
    title: 'Weekly playlist pitch sweep',
    status: 'complete',
    updatedAt: '2026-04-25T16:30:00Z',
    unread: true,
  },
  {
    id: 'thr-6',
    title: 'Rendering 9:16 lyric video for All the Time',
    status: 'running',
    entityKind: 'task',
    entityId: 'J-126',
    updatedAt: '2026-04-26T09:55:00Z',
  },
];

const ARTIST_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Disc3, label: 'Releases' },
  { icon: BarChart3, label: 'Insights' },
  { icon: Users, label: 'Audience' },
  { icon: Heart, label: 'Tipping' },
];

const ADMIN_ITEMS: NavItem[] = [
  { icon: Users, label: 'Users' },
  { icon: Inbox, label: 'Waitlist' },
  { icon: Activity, label: 'Activity' },
];

const ARTIST_WORKSPACES: Workspace[] = [
  { id: 'bahamas', name: 'Bahamas', initials: 'BA', items: ARTIST_ITEMS },
  { id: 'sade', name: 'Sade', initials: 'SA', items: [] },
];

const ADMIN_WORKSPACE: Workspace = {
  id: 'admin',
  name: 'Admin',
  initials: 'AD',
  items: ADMIN_ITEMS,
};

// --- Releases mock ---------------------------------------------------------
type ReleaseType = 'Single' | 'EP' | 'Album';
type DspKey = 'spotify' | 'apple' | 'youtube' | 'tidal';
type DspStatus = 'live' | 'pending' | 'error' | 'missing';
type ReleaseAgentState =
  | 'idle'
  | 'rescanning-dsps'
  | 'generating-pitch'
  | 'syncing-art';

type CueKind = 'intro' | 'verse' | 'chorus' | 'drop' | 'bridge' | 'outro';
type Cue = { at: number; kind: CueKind; label: string };

type Release = {
  id: string;
  title: string;
  artist: string;
  album: string;
  type: ReleaseType;
  releaseDate: string; // ISO date
  artwork: string;
  bpm: number;
  key: string;
  version: string;
  durationSec: number;
  dsps: Record<DspKey, DspStatus>;
  weeklyStreams: number;
  weeklyDelta: number; // signed percent
  tasksOpen: number;
  pitchReady: boolean;
  agent: ReleaseAgentState;
  waveformSeed: number; // for procedural row waveform
  cues: Cue[];
};

const RELEASES: Release[] = [
  {
    id: 'lost-in-the-light',
    title: 'Lost in the Light',
    artist: 'Bahamas',
    album: 'Bahamas Is Afie',
    type: 'Single',
    releaseDate: '2026-04-12',
    artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
    bpm: 96,
    key: 'A min',
    version: 'Album Version',
    dsps: { spotify: 'live', apple: 'live', youtube: 'live', tidal: 'live' },
    weeklyStreams: 12_400,
    weeklyDelta: 8,
    tasksOpen: 0,
    pitchReady: true,
    agent: 'idle',
    durationSec: 213,
    waveformSeed: 1,
    cues: [
      { at: 6, kind: 'intro', label: 'Intro' },
      { at: 26, kind: 'verse', label: 'Verse 1' },
      { at: 52, kind: 'chorus', label: 'Chorus' },
      { at: 73, kind: 'verse', label: 'Verse 2' },
      { at: 88, kind: 'drop', label: 'Drop' },
    ],
  },
  {
    id: 'stronger-than-that',
    title: 'Stronger Than That',
    artist: 'Bahamas',
    album: 'Sad Hunk',
    type: 'EP',
    releaseDate: '2026-03-28',
    artwork: 'https://picsum.photos/seed/stronger-than-that/400/400',
    bpm: 112,
    key: 'D maj',
    version: 'Studio',
    dsps: {
      spotify: 'live',
      apple: 'live',
      youtube: 'pending',
      tidal: 'missing',
    },
    weeklyStreams: 8_730,
    weeklyDelta: 3,
    tasksOpen: 2,
    pitchReady: false,
    agent: 'rescanning-dsps',
    durationSec: 198,
    waveformSeed: 7,
    cues: [
      { at: 4, kind: 'intro', label: 'Intro' },
      { at: 30, kind: 'verse', label: 'Verse' },
      { at: 60, kind: 'drop', label: 'Drop' },
      { at: 96, kind: 'bridge', label: 'Bridge' },
    ],
  },
  {
    id: 'all-the-time',
    title: 'All the Time',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Single',
    releaseDate: '2026-05-09',
    artwork: 'https://picsum.photos/seed/all-the-time/400/400',
    bpm: 88,
    key: 'F maj',
    version: 'Single Edit',
    dsps: {
      spotify: 'pending',
      apple: 'pending',
      youtube: 'missing',
      tidal: 'missing',
    },
    weeklyStreams: 0,
    weeklyDelta: 0,
    tasksOpen: 5,
    pitchReady: false,
    agent: 'generating-pitch',
    durationSec: 224,
    waveformSeed: 11,
    cues: [
      { at: 8, kind: 'intro', label: 'Intro' },
      { at: 40, kind: 'verse', label: 'Verse' },
      { at: 78, kind: 'chorus', label: 'Chorus' },
      { at: 124, kind: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'sunshine-on-my-back',
    title: 'Sunshine on My Back',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Album',
    releaseDate: '2026-02-04',
    artwork: 'https://picsum.photos/seed/sunshine-on-my-back/400/400',
    bpm: 124,
    key: 'C maj',
    version: 'Album',
    dsps: { spotify: 'live', apple: 'live', youtube: 'live', tidal: 'error' },
    weeklyStreams: 24_180,
    weeklyDelta: -4,
    tasksOpen: 1,
    pitchReady: true,
    agent: 'idle',
    durationSec: 247,
    waveformSeed: 17,
    cues: [
      { at: 12, kind: 'intro', label: 'Intro' },
      { at: 48, kind: 'verse', label: 'Verse' },
      { at: 90, kind: 'chorus', label: 'Chorus' },
      { at: 132, kind: 'drop', label: 'Drop' },
      { at: 180, kind: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'opening-act',
    title: 'Opening Act',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Single',
    releaseDate: '2026-01-19',
    artwork: 'https://picsum.photos/seed/opening-act/400/400',
    bpm: 102,
    key: 'G maj',
    version: 'Studio',
    dsps: { spotify: 'live', apple: 'live', youtube: 'live', tidal: 'live' },
    weeklyStreams: 6_240,
    weeklyDelta: 12,
    tasksOpen: 0,
    pitchReady: true,
    agent: 'idle',
    durationSec: 184,
    waveformSeed: 23,
    cues: [
      { at: 5, kind: 'intro', label: 'Intro' },
      { at: 22, kind: 'verse', label: 'Verse' },
      { at: 60, kind: 'chorus', label: 'Chorus' },
      { at: 110, kind: 'bridge', label: 'Bridge' },
    ],
  },
  {
    id: 'bittersweet',
    title: 'Bittersweet',
    artist: 'Bahamas',
    album: 'Bahamas Is Afie',
    type: 'Single',
    releaseDate: '2025-12-02',
    artwork: 'https://picsum.photos/seed/bittersweet/400/400',
    bpm: 76,
    key: 'B min',
    version: 'Acoustic',
    dsps: { spotify: 'live', apple: 'live', youtube: 'live', tidal: 'live' },
    weeklyStreams: 3_810,
    weeklyDelta: -2,
    tasksOpen: 0,
    pitchReady: true,
    agent: 'idle',
    durationSec: 232,
    waveformSeed: 31,
    cues: [
      { at: 6, kind: 'intro', label: 'Intro' },
      { at: 28, kind: 'verse', label: 'Verse 1' },
      { at: 70, kind: 'chorus', label: 'Chorus' },
      { at: 110, kind: 'verse', label: 'Verse 2' },
      { at: 150, kind: 'outro', label: 'Outro' },
    ],
  },
];

const DSP_LABEL: Record<DspKey, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube Music',
  tidal: 'TIDAL',
};
const DSP_ORDER: DspKey[] = ['spotify', 'apple', 'youtube', 'tidal'];
const DSP_GLYPH: Record<DspKey, string> = {
  spotify: 'S',
  apple: 'A',
  youtube: 'Y',
  tidal: 'T',
};
const DSP_COLOR: Record<DspKey, string> = {
  spotify: 'bg-emerald-500/90',
  apple: 'bg-rose-400/90',
  youtube: 'bg-red-500/90',
  tidal: 'bg-sky-400/90',
};
// Calm DSP status dots — live is the default state and stays neutral.
// Errors retain a clear rose so they read as needing attention.
const DSP_STATUS_DOT: Record<DspStatus, string> = {
  live: 'bg-white/35',
  pending: 'bg-amber-300/70',
  error: 'bg-rose-400/85',
  missing: 'bg-white/12',
};

function releaseDspItems(release: Release): DspAvatarItem[] {
  return DSP_ORDER.map(dsp => ({
    id: dsp,
    status: release.dsps[dsp],
    label: DSP_LABEL[dsp],
    glyph: DSP_GLYPH[dsp],
    colorClass: DSP_COLOR[dsp],
  }));
}

// --- Entity popover demo data ----------------------------------------------
// Adapter helpers + placeholder teammate/contact records that ShellDropdown
// rows feed into the EntityPopover primitive. Releases / artists derive from
// the existing RELEASES const so the popover always agrees with the table
// surface.

function releaseToEntityPopover(r: Release): EntityPopoverData {
  return {
    kind: 'release',
    id: r.id,
    label: r.title,
    thumbnail: r.artwork,
    artist: r.artist,
    releaseType: r.type,
    releaseDate: r.releaseDate,
    totalTracks: r.type === 'Single' ? 1 : r.type === 'EP' ? 5 : 11,
    durationSec: r.durationSec,
    status:
      r.dsps.spotify === 'live' ? 'Live' : r.pitchReady ? 'Ready' : 'Draft',
  };
}

const ENTITY_RELEASES: EntityPopoverData[] = RELEASES.map(
  releaseToEntityPopover
);

const ENTITY_ARTISTS: EntityPopoverData[] = [
  {
    kind: 'artist',
    id: 'bahamas',
    label: 'Bahamas',
    handle: 'bahamasmusic',
    followers: 482_000,
    verified: true,
    popularity: 64,
  },
  {
    kind: 'artist',
    id: 'sade',
    label: 'Sade',
    handle: 'sade',
    followers: 9_400_000,
    verified: true,
    popularity: 81,
  },
  {
    kind: 'artist',
    id: 'frank-ocean',
    label: 'Frank Ocean',
    handle: 'frankocean',
    followers: 14_200_000,
    verified: true,
    popularity: 88,
  },
  {
    kind: 'artist',
    id: 'tycho',
    label: 'Tycho',
    handle: 'tycho',
    followers: 1_100_000,
    verified: true,
    popularity: 70,
  },
  {
    kind: 'artist',
    id: 'tim-white',
    label: 'Tim White',
    handle: 'timwhite',
    followers: 1_240,
    isYou: true,
  },
];

// Placeholder teammates — extend EntityRefMeta with a real Teammate kind when
// the contact/team domain ships. For now this lets us demo the canonical
// "Assign to..." entity hover surface end-to-end.
const ENTITY_TEAMMATES: EntityPopoverData[] = [
  {
    kind: 'teammate',
    id: 'tw',
    label: 'Tim White',
    handle: 'timwhite',
    role: 'Founder',
    status: 'active',
    email: 't@timwhite.co',
  },
  {
    kind: 'teammate',
    id: 'eg',
    label: 'Erica Gibson',
    handle: 'ericag',
    role: 'A&R',
    status: 'active',
    email: 'erica@jov.ie',
  },
  {
    kind: 'teammate',
    id: 'jh',
    label: 'Jonas Hart',
    handle: 'jonash',
    role: 'Producer',
    status: 'idle',
    email: 'jonas@jov.ie',
  },
  {
    kind: 'teammate',
    id: 'mw',
    label: 'Maya Wren',
    handle: 'mayawren',
    role: 'Manager',
    status: 'away',
    email: 'maya@jov.ie',
  },
];

const ENTITY_EVENTS: EntityPopoverData[] = [
  {
    kind: 'event',
    id: 'detroit-2026',
    label: 'Detroit · Movement Festival',
    eventDate: '2026-05-23',
    city: 'Detroit, MI',
    capacity: 35_000,
    status: 'Confirmed',
    eventType: 'tour',
  },
  {
    kind: 'event',
    id: 'la-listening',
    label: 'LA Listening Party',
    eventDate: '2026-05-09',
    city: 'Los Angeles, CA',
    capacity: 120,
    status: 'On sale',
    eventType: 'meetup',
  },
];

const ENTITY_TRACKS_DEMO: EntityPopoverData[] = [
  {
    kind: 'track',
    id: 'lost-in-the-light-track',
    label: 'Lost in the Light',
    artist: 'Bahamas',
    releaseTitle: 'Bahamas Is Afie',
    durationSec: 213,
    bpm: 96,
    keyName: 'A min',
  },
  {
    kind: 'track',
    id: 'stronger-than-that-track',
    label: 'Stronger Than That',
    artist: 'Bahamas',
    releaseTitle: 'Sad Hunk',
    durationSec: 198,
    bpm: 112,
    keyName: 'D maj',
  },
];

const ENTITY_CURRENT_USER: EntityPopoverData = {
  kind: 'contact',
  id: 'me',
  label: 'Tim White',
  handle: 'timwhite',
  role: 'Founder',
  status: 'You',
};

// Module-scoped context so menu components rendered deep in the tree can
// route entity activations (clicked artist link in a release card, hovered
// teammate name, etc.) back to the shell's view+drawer state without prop
// drilling through every list/row.
const EntityActivateContext = createContext<
  ((entity: EntityPopoverData) => void) | undefined
>(undefined);
function useEntityActivate() {
  return useContext(EntityActivateContext);
}

// Lookups so inline links in copy (release drawer artist/album, chat
// @-mentions, etc.) can resolve to the same EntityPopoverData the dropdown
// uses. Falls through to a minimal stub when the entity isn't in the demo.
function lookupArtistEntity(name: string): EntityPopoverData {
  const found = ENTITY_ARTISTS.find(
    a => a.kind === 'artist' && a.label === name
  );
  if (found) return found;
  return { kind: 'artist', id: `artist:${name}`, label: name };
}
function lookupReleaseEntityByAlbum(
  album: string,
  excludeId?: string
): EntityPopoverData {
  // Album titles are not always unique to a single release in the demo —
  // pick the first match that isn't the current row. Falls through to a
  // minimal stub so the popover still renders for off-roster album names.
  const found = ENTITY_RELEASES.find(
    r => r.kind === 'release' && r.label === album && r.id !== excludeId
  );
  if (found) return found;
  return { kind: 'release', id: `release:${album}`, label: album };
}

// --- Tracks mock (catalog rows for Tracks view) ----------------------------
type TrackStatus = 'live' | 'scheduled' | 'draft' | 'announced' | 'hidden';
type Track = {
  id: string;
  releaseId: string | null;
  title: string;
  artist: string;
  album: string;
  type: ReleaseType;
  bpm: number;
  keyNormal: string;
  keyCamelot: string;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  durationSec: number;
  isrc?: string;
  status: TrackStatus;
  hasVideo: boolean;
  hasCanvas: boolean;
  artwork: string;
  bpmTone: 'low' | 'mid' | 'high'; // visual emphasis
  waveformSeed: number;
  cues: Cue[];
};

const ARTIST_POOL = [
  'Bahamas',
  'Sade',
  'Frank Ocean',
  'Anderson .Paak',
  'Tim White',
  'Erica Gibson',
  'Tycho',
  'Bonobo',
  'Khruangbin',
  'BADBADNOTGOOD',
];
const TITLE_POOL = [
  'Lost in the Light',
  'Stronger Than That',
  'All the Time',
  'Sunshine on My Back',
  'Opening Act',
  'Bittersweet',
  'Late Night Drift',
  'Slow Burn',
  'High Tide',
  'Echo Chamber',
  'Ghost in the Garden',
  'Paper Hearts',
  'Velvet Sky',
  'Hold the Line',
  'Soft Landing',
  'Midnight Oil',
  'Forty Days',
  'Outer Sun',
  'Trade Winds',
  'Summer Static',
  'Mirage',
  'Long Way Home',
  'Underwater',
  'Cold Coast',
  'Open Door',
  'Static Bloom',
  'Cinnamon',
  'Through the Rain',
  'After Hours',
  'Lift Off',
  'Halfway There',
  'Ferris Wheel',
  'Magnetic',
  'Daydream',
  'Wide Open',
  'Lower Skies',
  'Stationary',
  'Pacific',
  'Outline',
  'Quiet Now',
];
const ALBUM_POOL = [
  'Earthtones',
  'Bahamas Is Afie',
  'Sad Hunk',
  'Live to Be Free',
  'Mid-set',
  'B-sides',
  '—',
];
const KEY_PAIRS: Array<[string, string]> = [
  ['A min', '8A'],
  ['D maj', '10B'],
  ['F maj', '7B'],
  ['C maj', '8B'],
  ['G maj', '9B'],
  ['B min', '10A'],
  ['E min', '12A'],
  ['F min', '4A'],
  ['G min', '6A'],
  ['Bb maj', '6B'],
  ['Eb min', '2A'],
  ['A maj', '11B'],
];
const ARTWORK_POOL = [
  'https://picsum.photos/seed/jovie-art-a/400/400',
  'https://picsum.photos/seed/jovie-art-b/400/400',
  'https://picsum.photos/seed/jovie-art-c/400/400',
  'https://picsum.photos/seed/jovie-art-d/400/400',
  'https://picsum.photos/seed/jovie-art-e/400/400',
  'https://picsum.photos/seed/jovie-art-f/400/400',
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[Math.abs(i) % arr.length];
}
function generateTracks(n: number): Track[] {
  const out: Track[] = [];
  for (let i = 0; i < n; i++) {
    // Roughly 1 in 5 tracks are collabs.
    const isCollab = i % 5 === 4;
    const aIdx = (i * 7 + 3) % ARTIST_POOL.length;
    const bIdx = (aIdx + 3 + (i % 4)) % ARTIST_POOL.length;
    const artist = isCollab
      ? `${ARTIST_POOL[aIdx]} & ${ARTIST_POOL[bIdx]}`
      : ARTIST_POOL[aIdx];
    const titleBase = pick(TITLE_POOL, i * 11);
    const versionTag =
      i % 7 === 0
        ? ' (Extended Mix)'
        : i % 7 === 3
          ? ' (Acoustic)'
          : i % 7 === 5
            ? ' (Live)'
            : '';
    const title = `${titleBase}${versionTag}`;
    const album = pick(ALBUM_POOL, i * 3);
    const bpm = 64 + Math.round(((i * 13) % 80) * 1.2);
    const [keyN, keyC] = pick(KEY_PAIRS, i * 5);
    const rating = (((i * 3) % 5) + 1) as Track['rating'];
    const energy = (((i * 7) % 9) + 1) as Track['energy'];
    const durationSec = 90 + ((i * 17) % 280);
    const status: TrackStatus =
      i % 17 === 0
        ? 'hidden'
        : i % 11 === 0
          ? 'draft'
          : i % 13 === 0
            ? 'scheduled'
            : i % 19 === 0
              ? 'announced'
              : 'live';
    const hasVideo = i % 6 === 0;
    const hasCanvas = i % 3 === 0;
    const bpmTone: Track['bpmTone'] =
      bpm >= 124 ? 'high' : bpm <= 90 ? 'low' : 'mid';
    out.push({
      id: `track-${i}`,
      releaseId: i < RELEASES.length ? RELEASES[i].id : null,
      title,
      artist,
      album,
      type: i % 8 === 0 ? 'Album' : i % 5 === 0 ? 'EP' : 'Single',
      bpm,
      keyNormal: keyN,
      keyCamelot: keyC,
      rating,
      energy,
      durationSec,
      isrc:
        status === 'draft' ? undefined : `USRC125${String(i).padStart(5, '0')}`,
      status,
      hasVideo,
      hasCanvas,
      artwork: pick(ARTWORK_POOL, i * 2),
      bpmTone,
      waveformSeed: i * 13 + 1,
      cues: [
        { at: 4 + (i % 6), kind: 'intro', label: 'Intro' },
        { at: 24 + (i % 12), kind: 'verse', label: 'Verse' },
        { at: 52 + (i % 18), kind: 'chorus', label: 'Chorus' },
        ...(i % 3 === 0
          ? [
              {
                at: 88 + (i % 20),
                kind: 'drop' as CueKind,
                label: 'Drop',
              },
            ]
          : []),
      ],
    });
  }
  return out;
}

const TRACKS: Track[] = [
  {
    id: 'lost-in-the-light-track',
    releaseId: 'lost-in-the-light',
    title: 'Lost in the Light',
    artist: 'Bahamas',
    album: 'Bahamas Is Afie',
    type: 'Single',
    bpm: 96,
    keyNormal: 'A min',
    keyCamelot: '8A',
    rating: 5,
    energy: 6,
    durationSec: 213,
    isrc: 'USRC12500001',
    status: 'live',
    hasVideo: true,
    hasCanvas: true,
    artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
    bpmTone: 'mid',
    waveformSeed: 1,
    cues: [
      { at: 6, kind: 'intro', label: 'Intro' },
      { at: 26, kind: 'verse', label: 'Verse 1' },
      { at: 52, kind: 'chorus', label: 'Chorus' },
      { at: 88, kind: 'drop', label: 'Drop' },
    ],
  },
  {
    id: 'lost-extended-mix',
    releaseId: 'lost-in-the-light',
    title: 'Lost in the Light',
    artist: 'Bahamas',
    album: 'Bahamas Is Afie',
    type: 'Single',
    bpm: 124,
    keyNormal: 'A min',
    keyCamelot: '8A',
    rating: 4,
    energy: 8,
    durationSec: 348,
    isrc: 'USRC12500002',
    status: 'live',
    hasVideo: false,
    hasCanvas: true,
    artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
    bpmTone: 'high',
    waveformSeed: 2,
    cues: [
      { at: 12, kind: 'intro', label: 'Intro' },
      { at: 40, kind: 'verse', label: 'Verse' },
      { at: 96, kind: 'drop', label: 'Drop' },
      { at: 200, kind: 'bridge', label: 'Breakdown' },
    ],
  },
  {
    id: 'stronger',
    releaseId: 'stronger-than-that',
    title: 'Stronger Than That',
    artist: 'Bahamas',
    album: 'Sad Hunk',
    type: 'EP',
    bpm: 112,
    keyNormal: 'D maj',
    keyCamelot: '10B',
    rating: 4,
    energy: 7,
    durationSec: 198,
    isrc: 'USRC12500003',
    status: 'live',
    hasVideo: false,
    hasCanvas: true,
    artwork: 'https://picsum.photos/seed/stronger-than-that/400/400',
    bpmTone: 'mid',
    waveformSeed: 7,
    cues: [
      { at: 4, kind: 'intro', label: 'Intro' },
      { at: 30, kind: 'verse', label: 'Verse' },
      { at: 60, kind: 'drop', label: 'Drop' },
      { at: 96, kind: 'bridge', label: 'Bridge' },
    ],
  },
  {
    id: 'all-the-time',
    releaseId: 'all-the-time',
    title: 'All the Time',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Single',
    bpm: 88,
    keyNormal: 'F maj',
    keyCamelot: '7B',
    rating: 3,
    energy: 4,
    durationSec: 224,
    status: 'scheduled',
    hasVideo: false,
    hasCanvas: false,
    artwork: 'https://picsum.photos/seed/all-the-time/400/400',
    bpmTone: 'low',
    waveformSeed: 11,
    cues: [
      { at: 8, kind: 'intro', label: 'Intro' },
      { at: 40, kind: 'verse', label: 'Verse' },
      { at: 78, kind: 'chorus', label: 'Chorus' },
    ],
  },
  {
    id: 'sunshine',
    releaseId: 'sunshine-on-my-back',
    title: 'Sunshine on My Back',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Album',
    bpm: 124,
    keyNormal: 'C maj',
    keyCamelot: '8B',
    rating: 5,
    energy: 9,
    durationSec: 247,
    isrc: 'USRC12500005',
    status: 'live',
    hasVideo: true,
    hasCanvas: true,
    artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
    bpmTone: 'high',
    waveformSeed: 17,
    cues: [
      { at: 12, kind: 'intro', label: 'Intro' },
      { at: 48, kind: 'verse', label: 'Verse' },
      { at: 90, kind: 'chorus', label: 'Chorus' },
      { at: 132, kind: 'drop', label: 'Drop' },
    ],
  },
  {
    id: 'opening-act',
    releaseId: 'opening-act',
    title: 'Opening Act',
    artist: 'Bahamas',
    album: 'Earthtones',
    type: 'Single',
    bpm: 102,
    keyNormal: 'G maj',
    keyCamelot: '9B',
    rating: 4,
    energy: 5,
    durationSec: 184,
    isrc: 'USRC12500006',
    status: 'live',
    hasVideo: false,
    hasCanvas: false,
    artwork: 'https://picsum.photos/seed/stronger-than-that/400/400',
    bpmTone: 'mid',
    waveformSeed: 23,
    cues: [
      { at: 5, kind: 'intro', label: 'Intro' },
      { at: 22, kind: 'verse', label: 'Verse' },
      { at: 60, kind: 'chorus', label: 'Chorus' },
    ],
  },
  {
    id: 'bittersweet',
    releaseId: 'bittersweet',
    title: 'Bittersweet',
    artist: 'Bahamas',
    album: 'Bahamas Is Afie',
    type: 'Single',
    bpm: 76,
    keyNormal: 'B min',
    keyCamelot: '10A',
    rating: 3,
    energy: 3,
    durationSec: 232,
    isrc: 'USRC12500007',
    status: 'live',
    hasVideo: false,
    hasCanvas: true,
    artwork: 'https://picsum.photos/seed/all-the-time/400/400',
    bpmTone: 'low',
    waveformSeed: 31,
    cues: [
      { at: 6, kind: 'intro', label: 'Intro' },
      { at: 28, kind: 'verse', label: 'Verse' },
      { at: 70, kind: 'chorus', label: 'Chorus' },
    ],
  },
  {
    id: 'untitled-demo-04',
    releaseId: null,
    title: 'Untitled Demo 04',
    artist: 'Bahamas',
    album: '—',
    type: 'Single',
    bpm: 118,
    keyNormal: 'E min',
    keyCamelot: '12A',
    rating: 2,
    energy: 6,
    durationSec: 142,
    status: 'draft',
    hasVideo: false,
    hasCanvas: false,
    artwork: 'https://picsum.photos/seed/lost-in-the-light/400/400',
    bpmTone: 'mid',
    waveformSeed: 37,
    cues: [
      { at: 8, kind: 'intro', label: 'Intro' },
      { at: 30, kind: 'verse', label: 'Sketch' },
    ],
  },
  ...generateTracks(50),
];

// --- Tasks mock -----------------------------------------------------------
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
type TaskAssignee = 'you' | 'jovie';
type Task = {
  id: string; // J-NNN
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: TaskAssignee;
  releaseId: string | null;
  dueIso: string | null;
  updatedIso: string;
  labels: string[];
};

const TASKS: Task[] = [
  {
    id: 'J-128',
    title: 'Confirm artwork for Lost in the Light',
    description:
      'Final mastered files came back. Need to approve the cover art crop for the Spotify Canvas before the smart link goes live next Friday.',
    status: 'in_progress',
    priority: 'high',
    assignee: 'you',
    releaseId: 'lost-in-the-light',
    dueIso: '2026-04-30',
    updatedIso: '2026-04-25',
    labels: ['design', 'distribution'],
  },
  {
    id: 'J-127',
    title: 'Approve playlist pitch for Stronger Than That',
    description:
      'Jovie drafted a 3-paragraph pitch tuned for indie-folk Spotify editorial. Skim it, edit anything that feels off, and submit.',
    status: 'todo',
    priority: 'high',
    assignee: 'you',
    releaseId: 'stronger-than-that',
    dueIso: '2026-04-28',
    updatedIso: '2026-04-25',
    labels: ['pitch'],
  },
  {
    id: 'J-126',
    title: 'Generate vertical lyric video for All the Time',
    description:
      'Stems are uploaded. Jovie will render a 9:16 lyric video with three style passes; pick one when ready.',
    status: 'in_progress',
    priority: 'medium',
    assignee: 'jovie',
    releaseId: 'all-the-time',
    dueIso: '2026-05-02',
    updatedIso: '2026-04-25',
    labels: ['video', 'social'],
  },
  {
    id: 'J-125',
    title: 'Schedule Instagram teaser carousel',
    status: 'todo',
    priority: 'medium',
    assignee: 'you',
    releaseId: 'all-the-time',
    dueIso: '2026-05-05',
    updatedIso: '2026-04-24',
    labels: ['social'],
  },
  {
    id: 'J-124',
    title: 'Reply to Tom (booking) about July Brooklyn show',
    status: 'todo',
    priority: 'urgent',
    assignee: 'you',
    releaseId: null,
    dueIso: '2026-04-26',
    updatedIso: '2026-04-25',
    labels: ['inbox'],
  },
  {
    id: 'J-123',
    title: 'Backfill UPC for Sunshine on My Back',
    description:
      'TIDAL flagged the missing UPC. Jovie can pull it from the distributor — confirm the metadata is accurate before sync.',
    status: 'backlog',
    priority: 'medium',
    assignee: 'jovie',
    releaseId: 'sunshine-on-my-back',
    dueIso: null,
    updatedIso: '2026-04-23',
    labels: ['distribution'],
  },
  {
    id: 'J-122',
    title: 'Outreach: Pitchfork rising column',
    status: 'in_progress',
    priority: 'low',
    assignee: 'jovie',
    releaseId: null,
    dueIso: '2026-05-12',
    updatedIso: '2026-04-22',
    labels: ['press'],
  },
  {
    id: 'J-121',
    title: 'Tag Bittersweet stems for the remix pack',
    status: 'todo',
    priority: 'low',
    assignee: 'you',
    releaseId: 'bittersweet',
    dueIso: null,
    updatedIso: '2026-04-22',
    labels: ['catalog'],
  },
  {
    id: 'J-120',
    title: 'Draft setlist for the May 18 acoustic set',
    status: 'backlog',
    priority: 'medium',
    assignee: 'you',
    releaseId: null,
    dueIso: '2026-05-14',
    updatedIso: '2026-04-21',
    labels: ['live'],
  },
  {
    id: 'J-119',
    title: 'Confirm Apple Music spatial audio render',
    status: 'done',
    priority: 'low',
    assignee: 'jovie',
    releaseId: 'opening-act',
    dueIso: null,
    updatedIso: '2026-04-20',
    labels: ['distribution'],
  },
  {
    id: 'J-118',
    title: 'Cancel: Old TikTok cross-post automation',
    status: 'cancelled',
    priority: 'none',
    assignee: 'you',
    releaseId: null,
    dueIso: null,
    updatedIso: '2026-04-18',
    labels: [],
  },
  {
    id: 'J-117',
    title: 'Update bio on Spotify for Artists',
    status: 'done',
    priority: 'low',
    assignee: 'you',
    releaseId: null,
    dueIso: null,
    updatedIso: '2026-04-17',
    labels: ['profile'],
  },
];

// --- Lyrics mock -----------------------------------------------------------
// Karaoke-style timed lyrics for the currently playing track ("Lost in the
// Light", 213s). Sixteen lines, hand-paced so verses breathe and the chorus
// lands on the cue at 0:52. Bahamas-ish: warm, wistful, road-weary.
type LyricLine = { startSec: number; text: string };
const MOCK_LYRICS: LyricLine[] = [
  { startSec: 6, text: 'I was sleeping in the back of the car' },
  { startSec: 18, text: 'Watching the highway turn into stars' },
  { startSec: 30, text: 'You were humming a tune I forgot' },
  { startSec: 42, text: 'Half a song from a place we both lost' },
  { startSec: 54, text: 'Oh, lost in the light, lost in the light' },
  { startSec: 66, text: 'Carry me home through the long Carolina night' },
  { startSec: 80, text: 'Headlights bleed through the window glass' },
  { startSec: 94, text: 'And the radio plays like nothing has passed' },
  { startSec: 108, text: 'I keep your name like a coin in my coat' },
  { startSec: 122, text: 'Spend it slow when the cold gets close' },
  { startSec: 136, text: 'Oh, lost in the light, lost in the light' },
  { startSec: 150, text: "I'll find you again on the other side" },
  { startSec: 164, text: 'Tell me the part where the morning comes' },
  { startSec: 176, text: 'Tell me you waited, tell me you come' },
  { startSec: 190, text: 'Lost in the light, lost in the light' },
  { startSec: 202, text: 'Carry me home, carry me home tonight' },
];

function trackFromRelease(r: Release): TrackInfo {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    artwork: r.artwork,
    bpm: r.bpm,
    key: r.key,
    version: r.version,
    durationSec: r.durationSec,
    // Synthesized ISRC for the design pass — real wiring lives in production.
    // Format: country (2) + registrant (3) + year (2) + designation (5) = 12.
    isrc: `USJV126${String(
      Math.abs(
        r.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)
      ) % 100000
    ).padStart(5, '0')}`,
    // Only the canonical demo track has timed lyrics in MOCK_LYRICS; other
    // releases play but expose no lyrics surface (Mic2 hides for them).
    hasLyrics: r.id === 'lost-in-the-light',
  };
}

function relativeDate(iso: string, now = new Date('2026-04-25')) {
  const d = new Date(iso);
  const days = Math.round(
    (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1 && days < 14) return `in ${days}d`;
  if (days < -1 && days > -14) return `${-days}d ago`;
  if (days >= 14 && days < 60) return `in ${Math.round(days / 7)}w`;
  if (days <= -14 && days > -60) return `${Math.round(-days / 7)}w ago`;
  if (days >= 60) return `in ${Math.round(days / 30)}mo`;
  return `${Math.round(-days / 30)}mo ago`;
}

function formatStreams(n: number) {
  if (n === 0) return '—';
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function ShellV1Experiment() {
  const [variant, setVariant] = useState<Variant>('a');
  const [sidebarMode, setSidebarMode] = useState<'docked' | 'floating'>(
    'docked'
  );
  // Tighter, library-style sidebar density. Off = current shell sidebar
  // (workspace dropdowns, h-7 items). On = flat, h-6 items, no nesting.
  const [peekOpen, setPeekOpen] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [loopMode, setLoopMode] = useState<'off' | 'track' | 'section'>('off');
  const [waveformOn, setWaveformOn] = useState(true);
  // Cinematic cold-start: bloom (centered logo) → reveal (logo glides
  // toward sidebar position, app fades in) → done.
  const [loaderPhase, setLoaderPhase] = useState<'bloom' | 'reveal' | 'done'>(
    'bloom'
  );
  const [view, setView] = useState<CanvasView>('demo');
  // Install / upgrade banner — togglable from the dev picker so the
  // styled state is reviewable. Off by default.
  const [installBannerOpen, setInstallBannerOpen] = useState(false);
  // Subview is the page-scoped filter shown in the canvas subheader. Each
  // canvas view defines its own subview list. Reset to the canonical
  // default for the new view: releases → 'releases', tracks/tasks → 'all'.
  const defaultSubviewFor = (v: CanvasView) =>
    v === 'releases' ? 'releases' : 'all';
  const [subview, setSubview] = useState<string>(defaultSubviewFor('demo'));
  useEffect(() => {
    setSubview(defaultSubviewFor(view));
  }, [view]);
  const [playingReleaseId, setPlayingReleaseId] = useState<string>(
    RELEASES[0].id
  );
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );
  // Mock playback position in seconds for the currently playing track.
  // Click a row's waveform → updates this → bottom bar's scrub reflects it.
  const [currentTimeSec, setCurrentTimeSec] = useState(78);
  const [lyricsLines, setLyricsLines] = useState<LyricLine[]>(MOCK_LYRICS);
  // Push-to-talk Jovie: hold ⌘J anywhere to dictate. Mock for the design pass.
  const [jovieListening, setJovieListening] = useState(false);
  const [palette, setPalette] = useState<Palette>(PALETTE_PRESETS.Carbon);
  // Search state lives at the page level so click-artist / click-title in
  // any view can populate it and open the breadcrumb-takeover.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPills, setSearchPills] = useState<FilterPill[]>([]);
  const [keyMode, setKeyMode] = useState<'normal' | 'camelot'>('normal');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // Threads the user has opened in this session — clears the per-thread
  // unread highlight in the sidebar.
  const [readThreadIds, setReadThreadIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const openThread = (id: string) => {
    setSelectedThreadId(id);
    setView('thread');
    setReadThreadIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const decoratedThreads = useMemo<Thread[]>(
    () =>
      THREADS.map(t =>
        t.unread && readThreadIds.has(t.id) ? { ...t, unread: false } : t
      ),
    [readThreadIds]
  );
  // Library state — lifted to the shell so the sidebar (filters/saved
  // views) and canvas (grid/table/drawer) share the same source of truth.
  // Standalone /exp/library-v1 still owns its own state internally.
  const libraryAllAssets = useMemo(() => generateLibraryAssets(), []);
  const [librarySavedView, setLibrarySavedView] =
    useState<LibrarySavedViewId>('all');
  const [libraryFilters, setLibraryFilters] = useState<LibraryFiltersType>(() =>
    emptyLibraryFilters()
  );
  const [librarySort, setLibrarySort] = useState<LibrarySortKey>('addedAt');
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>('account');
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>('grid');
  const [librarySelectedId, setLibrarySelectedId] = useState<string | null>(
    null
  );
  const [libraryDrawerOpen, setLibraryDrawerOpen] = useState(false);
  const [libraryFavorites, setLibraryFavorites] = useState<Set<string>>(
    () => new Set(libraryAllAssets.filter(a => a.favorite).map(a => a.id))
  );
  const toggleLibraryFavorite = (id: string) => {
    setLibraryFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearLibraryFilters = () => setLibraryFilters(emptyLibraryFilters());
  // Right-click context menu state. Lives at the shell level so only one
  // menu is open at a time and Esc / outside-click can dismiss globally.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const openContextMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Mock action — design pass surfaces Esc + dismissal but doesn't mutate
  // the data set. Console-noop keeps the menu interactive.
  const noop = (label: string) => () => console.info(`[shell-v1] ${label}`);

  const onReleaseContextMenu = (e: React.MouseEvent, release: Release) => {
    openContextMenu(e, [
      {
        label: 'Play',
        icon: Play,
        shortcut: 'playPause',
        onSelect: () => {
          setPlayingReleaseId(release.id);
          setIsPlaying(true);
        },
      },
      {
        label: 'Open release',
        icon: ExternalLink,
        onSelect: () => setSelectedReleaseId(release.id),
      },
      {
        label: 'Pin to top',
        icon: Pin,
        onSelect: noop(`pin ${release.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Copy smart link',
        icon: LinkIcon,
        shortcut: '⌘L',
        onSelect: noop(`copy link ${release.id}`),
      },
      {
        label: 'Duplicate',
        icon: Copy,
        shortcut: '⌘D',
        onSelect: noop(`duplicate ${release.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Archive',
        icon: Archive,
        tone: 'danger',
        onSelect: noop(`archive ${release.id}`),
      },
    ]);
  };

  // Drawer overflow menu — same shape as the row context menu, plus a
  // Close item at the bottom (since the X button was merged into the
  // overflow ellipsis).
  const onDrawerMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    release: Release
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.right - 4,
      y: rect.bottom + 6,
      items: [
        {
          label: 'Play',
          icon: Play,
          shortcut: 'playPause',
          onSelect: () => {
            setPlayingReleaseId(release.id);
            setIsPlaying(true);
          },
        },
        {
          label: 'Pin to top',
          icon: Pin,
          onSelect: noop(`pin ${release.id}`),
        },
        { kind: 'separator' },
        {
          label: 'Copy smart link',
          icon: LinkIcon,
          shortcut: '⌘L',
          onSelect: noop(`copy link ${release.id}`),
        },
        {
          label: 'Duplicate',
          icon: Copy,
          shortcut: '⌘D',
          onSelect: noop(`duplicate ${release.id}`),
        },
        {
          label: 'Archive',
          icon: Archive,
          tone: 'danger',
          onSelect: noop(`archive ${release.id}`),
        },
        { kind: 'separator' },
        {
          label: 'Close drawer',
          icon: X,
          shortcut: 'closeOverlay',
          onSelect: () => setSelectedReleaseId(null),
        },
      ],
    });
  };

  const onTrackContextMenu = (e: React.MouseEvent, track: Track) => {
    openContextMenu(e, [
      {
        label: 'Play',
        icon: Play,
        shortcut: 'playPause',
        onSelect: () => {
          if (track.releaseId) {
            setPlayingReleaseId(track.releaseId);
            setIsPlaying(true);
          }
        },
      },
      {
        label: 'Add to release',
        icon: UserPlus,
        onSelect: noop(`add ${track.id} to release`),
      },
      {
        label: 'Edit metadata',
        icon: Pencil,
        shortcut: '⌘E',
        onSelect: noop(`edit ${track.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Copy share link',
        icon: LinkIcon,
        shortcut: '⌘L',
        onSelect: noop(`copy link ${track.id}`),
      },
      {
        label: 'Duplicate',
        icon: Copy,
        shortcut: '⌘D',
        onSelect: noop(`duplicate ${track.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Delete',
        icon: Trash2,
        tone: 'danger',
        onSelect: noop(`delete ${track.id}`),
      },
    ]);
  };

  const onThreadContextMenu = (e: React.MouseEvent, thread: Thread) => {
    openContextMenu(e, [
      {
        label: 'Open thread',
        icon: ExternalLink,
        onSelect: () => openThread(thread.id),
      },
      { kind: 'separator' },
      {
        label: 'Copy as Markdown',
        icon: Copy,
        onSelect: noop(`copy md ${thread.id}`),
      },
      {
        label: 'Copy thread ID',
        icon: Copy,
        onSelect: noop(`copy id ${thread.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Archive',
        icon: Archive,
        onSelect: noop(`archive ${thread.id}`),
      },
      {
        label: 'Delete',
        icon: Trash2,
        tone: 'danger',
        onSelect: noop(`delete ${thread.id}`),
      },
    ]);
  };

  // Routes an entity activation (clicked artist link inside a release card,
  // hovered chip in the drawer, etc.) to the right surface. Today only
  // releases have a real surface — they open the right-rail. Other kinds
  // log a noop so the action wires end-to-end without dead clicks.
  const onEntityActivate = useCallback(
    (entity: EntityPopoverData) => {
      if (entity.kind === 'release') {
        const match = RELEASES.find(
          r => r.id === entity.id || r.title === entity.label
        );
        if (match) {
          setView('releases');
          setSelectedReleaseId(match.id);
          return;
        }
      }
      console.info(`[shell-v1] activate entity ${entity.kind}:${entity.id}`);
    },
    [setView, setSelectedReleaseId]
  );

  const onTaskContextMenu = (e: React.MouseEvent, task: Task) => {
    openContextMenu(e, [
      {
        label: task.status === 'done' ? 'Mark in progress' : 'Mark complete',
        icon: CheckCircle2,
        shortcut: '⌘↵',
        onSelect: noop(`toggle ${task.id}`),
      },
      {
        label:
          task.assignee === 'jovie' ? 'Reassign to me' : 'Reassign to Jovie',
        icon: Sparkles,
        onSelect: noop(`reassign ${task.id}`),
      },
      {
        label: task.priority === 'high' ? 'Lower priority' : 'Raise priority',
        icon: Flag,
        onSelect: noop(`priority ${task.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Open release',
        icon: ExternalLink,
        disabled: !task.releaseId,
        onSelect: () => task.releaseId && setSelectedReleaseId(task.releaseId),
      },
      {
        label: 'Copy task ID',
        icon: Copy,
        onSelect: noop(`copy id ${task.id}`),
      },
      { kind: 'separator' },
      {
        label: 'Delete',
        icon: Trash2,
        tone: 'danger',
        onSelect: noop(`delete ${task.id}`),
      },
    ]);
  };

  const artistOptions = useMemo(
    () =>
      Array.from(new Set(TRACKS.flatMap(t => t.artist.split(/ & | feat\. /)))),
    []
  );
  const titleOptions = useMemo(
    () => Array.from(new Set(TRACKS.map(t => t.title))).slice(0, 30),
    []
  );
  const albumOptions = useMemo(
    () => Array.from(new Set(TRACKS.map(t => t.album).filter(a => a !== '—'))),
    []
  );

  function addPill(field: FilterField, value: string) {
    setSearchPills(prev => {
      // Merge into existing same-field same-op pill as an OR value.
      const existing = prev.find(p => p.field === field && p.op === 'is');
      if (existing) {
        if (existing.values.includes(value)) return prev;
        return prev.map(p =>
          p.id === existing.id ? { ...p, values: [...p.values, value] } : p
        );
      }
      return [
        ...prev,
        {
          id: `${field}-${value}-${Date.now()}`,
          field,
          op: 'is',
          values: [value],
        },
      ];
    });
    setSearchOpen(true);
  }
  const playingRelease = RELEASES.find(r => r.id === playingReleaseId);
  const currentTrack: TrackInfo = playingRelease
    ? trackFromRelease(playingRelease)
    : trackFromRelease(RELEASES[0]);

  // Cinematic cold-start sequence. Three phases, total ~900ms:
  //   bloom  (0..380ms): black canvas + centered Jovie mark scales in
  //   reveal (380..900): mark glides toward the sidebar position; the app
  //                      fades in underneath at the same time
  //   done             : overlay gone, sidebar mark in place
  useEffect(() => {
    const t1 = setTimeout(() => setLoaderPhase('reveal'), 380);
    const t2 = setTimeout(() => setLoaderPhase('done'), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const mounted = loaderPhase !== 'bloom';

  // Force the sidebar to floating (and disable the peek hot zone) while
  // the user is in onboarding. When they cross the threshold (setView
  // back to 'demo' or similar), the sidebar reveals via its existing
  // dock animation — no extra plumbing required.
  useEffect(() => {
    if (view === 'onboarding') {
      setSidebarMode('floating');
      setBarCollapsed(true);
    }
  }, [view]);

  // ScreeningRoom mode — chrome (sidebar, header, subheader, audio bar)
  // fades to 0 over 600ms while staying mounted. The canvas takes over.
  // Triggers when we're in a "full-screen canvas" view (lyrics today,
  // video viewer next). Exit via Esc (handled per view) or the floating
  // restore button bottom-right.
  const cinematic = view === 'lyrics';
  // Onboarding takes over the entire canvas — sidebar collapses, audio
  // bar hides, header chrome falls away. The chat IS the surface; the
  // shell reveals itself only after the user crosses the onboarding line.
  const onboardingActive = view === 'onboarding';
  const cinematicStyle = cinematic
    ? {
        opacity: 0,
        pointerEvents: 'none' as const,
        transition: `opacity 600ms ${EASE_CINEMATIC}`,
      }
    : { transition: `opacity 600ms ${EASE_CINEMATIC}` };

  const pct =
    (currentTimeSec / (playingRelease?.durationSec ?? TRACK.duration)) * 100;

  // Spacebar = playback toggle. Sidebar collapse uses [ (Linear-style),
  // bar visibility uses Cmd/Ctrl+\. Hold ⌘J anywhere to dictate to Jovie.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      // Jovie push-to-talk works even from inside fields (it's the universal
      // command surface). Other shortcuts respect text-input focus.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setJovieListening(true);
        return;
      }
      if (inField) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (
        e.key === '[' ||
        (e.key === 'Tab' &&
          !e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey)
      ) {
        e.preventDefault();
        setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'));
      } else if (
        ((e.metaKey || e.ctrlKey) && e.key === '\\') ||
        e.key === '`'
      ) {
        e.preventDefault();
        setBarCollapsed(v => !v);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setWaveformOn(v => !v);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setView(v => (v === 'lyrics' ? 'demo' : 'lyrics'));
      } else if (e.key === 'Escape' && view === 'lyrics') {
        e.preventDefault();
        setView('demo');
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (
        e.key === 'Meta' ||
        e.key === 'Control' ||
        e.key === 'j' ||
        e.key === 'J'
      ) {
        setJovieListening(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [view]);

  return (
    <EntityActivateContext.Provider value={onEntityActivate}>
      <div
        // Cool-tone palette override. Subtle blue-shift on the surface tokens
        // so the grays feel electric / nightlife rather than corporate.
        // Keep the change tiny — only a few units of hue + a touch more density.
        style={
          {
            // Live-editable palette tokens (controlled by the dev picker).
            '--linear-bg-page': palette.page,
            '--linear-bg-surface-0': palette.surface0,
            '--linear-bg-surface-1': palette.surface1,
            '--linear-bg-surface-2': palette.surface2,
            '--linear-app-content-surface': palette.contentSurface,
            '--linear-app-shell-border': palette.border,
            '--linear-app-shell-radius': '12px',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'scale(1)' : 'scale(0.985)',
            transition: `opacity 600ms ${EASE_CINEMATIC}, transform 600ms ${EASE_CINEMATIC}, background-color 200ms ease-out`,
          } as React.CSSProperties
        }
        className='shell-v1 flex h-dvh w-full overflow-hidden bg-(--linear-bg-page) lg:gap-2 lg:p-2'
      >
        {/* Theme focus-visible globally inside this experiment so we never get
          the browser's royal-blue ring on any tabbable element. Cyan-300 at
          40% with offset matching the page surface — same hue as our hero
          accent so focus reads as part of the theme, not a system overlay. */}
        <style>{`
        .shell-v1 :focus { outline: none; }
        /* Soft cyan glow instead of a harsh outline — uses box-shadow
           so it inherits the element's border-radius automatically and
           reads as a halo, not a hard ring. Two-stop shadow: tight inner
           band + wider blur for the bloom. The transition lives on the
           base element so the ring fades in/out instead of snapping. */
        .shell-v1 button,
        .shell-v1 [role='button'],
        .shell-v1 input,
        .shell-v1 textarea,
        .shell-v1 select,
        .shell-v1 [tabindex='0'] {
          transition-property: box-shadow, border-color, background-color, color;
          transition-duration: 150ms;
          transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
        }
        .shell-v1 :focus-visible {
          outline: none;
          box-shadow:
            0 0 0 1px rgba(103, 232, 249, 0.18),
            0 0 0 6px rgba(103, 232, 249, 0.08);
        }
        .shell-v1 button:focus-visible,
        .shell-v1 [role='button']:focus-visible,
        .shell-v1 input:focus-visible,
        .shell-v1 textarea:focus-visible,
        .shell-v1 [tabindex='0']:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 1px rgba(103, 232, 249, 0.18),
            0 0 0 6px rgba(103, 232, 249, 0.08);
        }
        /* Surgical opt-outs: text fields whose container already owns its
           own focus-within affordance (pill border, surface tint), where a
           second ring on the bare input reads as a stack of competing
           borders. Keep the global focus-visible everywhere else for a11y. */
        .shell-v1 textarea[aria-label='Chat message input']:focus-visible {
          outline: none;
        }
        .shell-v1 input[aria-label='Filter tracks']:focus-visible {
          outline: none;
        }
        /* Flatter, more subdued chat composer — drop the layered drop
           shadow + soften the border so the pill recedes into the canvas
           instead of floating above it. Inline styles on the surface
           need the !important to win. */
        .shell-v1 [data-testid='chat-composer-surface'] {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 1px 0 rgba(0, 0, 0, 0.18) !important;
          border-color: rgba(255, 255, 255, 0.07) !important;
        }
        /* Subtle grain on the canvas content surface. Single static SVG
           noise overlay rasterized once and GPU-composited per frame —
           no animation, no per-frame work. ~5% mix-overlay so it reads
           as paper roughness without coloring the design. Performance
           cost ≈ 0 after first paint. */
        .shell-v1 .canvas-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          mix-blend-mode: overlay;
          opacity: 0.06;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 200px 200px;
        }
        /* Calm-breath: replaces animate-pulse + animate-ping for ambient
           "Jovie is working" affordances. Slower (3.6s vs 2s), narrower
           opacity range (0.85↔0.55 vs 0.5↔1), and the halo never fully
           expands so peripheral motion stays subliminal instead of
           pulling focus. */
        @keyframes calm-breath {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.55; }
        }
        @keyframes calm-halo {
          0% { transform: scale(0.95); opacity: 0.45; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .anim-calm-breath {
          animation: calm-breath 3.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .anim-calm-halo {
          animation: calm-halo 3.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
        {/* Docked sidebar — always mounted; width + opacity animate so the
          canvas slides over smoothly when the user pins/unpins. Dims to 0
          when ScreeningRoom mode is active (cinematic). */}
        <div
          className='hidden lg:flex h-full overflow-hidden shrink-0'
          style={{
            width: sidebarMode === 'docked' && !onboardingActive ? 224 : 0,
            opacity:
              cinematic || onboardingActive
                ? 0
                : sidebarMode === 'docked'
                  ? 1
                  : 0,
            transform:
              sidebarMode === 'docked' && !onboardingActive
                ? 'translateX(0)'
                : 'translateX(-12px)',
            pointerEvents: cinematic || onboardingActive ? 'none' : undefined,
            transition: `width ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity 600ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
          }}
          aria-hidden={
            sidebarMode !== 'docked' || cinematic || onboardingActive
          }
        >
          <Sidebar
            variant='docked'
            onPin={() => setSidebarMode('floating')}
            onSelectView={setView}
            activeView={view}
            tight={false}
            threads={decoratedThreads}
            activeThreadId={selectedThreadId}
            onSelectThread={openThread}
            onThreadContextMenu={onThreadContextMenu}
            libraryAssetCount={libraryAllAssets.length}
            nowPlaying={{
              track: currentTrack,
              isPlaying,
              barCollapsed,
              onPlay: () => setIsPlaying(p => !p),
            }}
            installBanner={{
              open: installBannerOpen,
              onDismiss: () => setInstallBannerOpen(false),
            }}
            libraryProps={
              view === 'library'
                ? {
                    allAssets: libraryAllAssets,
                    savedView: librarySavedView,
                    onSavedView: setLibrarySavedView,
                    filters: libraryFilters,
                    onFilters: setLibraryFilters,
                    onClearAll: clearLibraryFilters,
                  }
                : undefined
            }
            settingsProps={
              view === 'settings'
                ? {
                    activeSection: settingsSection,
                    onSelectSection: setSettingsSection,
                  }
                : undefined
            }
          />
        </div>

        {/* Floating peek layer — always mounted; visibility driven by mode + hover */}
        <FloatingSidebarLayer
          active={sidebarMode === 'floating' && !onboardingActive}
          peekOpen={peekOpen}
          onSetPeekOpen={setPeekOpen}
          onPin={() => {
            setPeekOpen(false);
            setSidebarMode('docked');
          }}
          onSelectView={setView}
          activeView={view}
          tight={false}
          threads={decoratedThreads}
          activeThreadId={selectedThreadId}
          onSelectThread={openThread}
          onThreadContextMenu={onThreadContextMenu}
          libraryAssetCount={libraryAllAssets.length}
          nowPlaying={{
            track: currentTrack,
            isPlaying,
            barCollapsed,
            onPlay: () => setIsPlaying(p => !p),
          }}
          installBanner={{
            open: installBannerOpen,
            onDismiss: () => setInstallBannerOpen(false),
          }}
        />

        {/* Detailed now-playing — visible when the audio bar is OPEN.
          Sits flush with the main content area's left edge (not under
          the sidebar). Carries full info (album art + title + chips).
          When the bar collapses, the COMPACT version takes over — it
          renders inside the sidebar bottom slot. The two never appear
          together. */}
        <div
          aria-hidden={barCollapsed}
          // Sits inside the same 32px gutter the audio bar uses (px-8) so
          // the album art aligns to a virtual grid as if the canvas's
          // content area extended down past it.
          className='hidden lg:block fixed bottom-[26px] z-30 w-[224px]'
          style={{
            left: sidebarMode === 'docked' ? 264 : 32,
            opacity: barCollapsed ? 0 : 1,
            transform: barCollapsed ? 'translateY(8px)' : 'translateY(0)',
            pointerEvents: barCollapsed ? 'none' : 'auto',
            transition: `opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, left ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
          }}
        >
          <div className='px-1 pb-0'>
            <SidebarNowPlaying
              collapsed={false}
              isPlaying={isPlaying}
              onPlay={() => setIsPlaying(p => !p)}
              playOverlayVisible={barCollapsed}
              track={toNowPlayingTrack(currentTrack)}
            />
          </div>
        </div>

        <div
          className='flex min-h-0 min-w-0 flex-1 flex-col lg:gap-2'
          style={{
            // Reserve room for the fixed-bottom AudioBar so canvas content
            // never sits hidden underneath. Falls to 0 when collapsed.
            paddingBottom:
              barCollapsed || cinematic || onboardingActive ? 0 : 80,
            transition:
              cinematic || onboardingActive
                ? `padding-bottom 600ms ${EASE_CINEMATIC}`
                : 'padding-bottom 150ms ease-out',
          }}
        >
          <main className='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-0 lg:rounded-[var(--linear-app-shell-radius)] lg:border lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)]'>
            {/* Static grain overlay — adds a subtle paper roughness so the
              dark surface doesn't read as flat slab. Pointer-events off,
              no animation; GPU-composited at zero per-frame cost. */}
            <div className='canvas-grain' aria-hidden='true' />
            {!onboardingActive && (
              <div style={cinematicStyle}>
                <Header
                  sidebarMode={sidebarMode}
                  onToggleSidebar={() =>
                    setSidebarMode(m =>
                      m === 'docked' ? 'floating' : 'docked'
                    )
                  }
                  searchOpen={searchOpen}
                  searchPills={searchPills}
                  onSearchOpenChange={setSearchOpen}
                  onPillsChange={setSearchPills}
                  artistOptions={artistOptions}
                  titleOptions={titleOptions}
                  albumOptions={albumOptions}
                  view={view}
                  rightRailOpen={selectedReleaseId !== null}
                  onToggleRightRail={() =>
                    setSelectedReleaseId(id =>
                      id === null ? (RELEASES[0]?.id ?? null) : null
                    )
                  }
                />
              </div>
            )}
            {!onboardingActive && (
              <div style={cinematicStyle}>
                <CanvasSubheader
                  subviews={subviewsForView(view, RELEASES, TRACKS, TASKS)}
                  subview={subview}
                  onSubview={setSubview}
                  onAddView={
                    view === 'releases'
                      ? () =>
                          console.info('[shell-v1] save current filter as view')
                      : undefined
                  }
                  extraToolbar={
                    view === 'library' ? (
                      <>
                        <LibrarySortDropdown
                          sort={librarySort}
                          onSort={setLibrarySort}
                        />
                        <LibraryViewToggle
                          view={libraryViewMode}
                          onView={setLibraryViewMode}
                        />
                      </>
                    ) : view === 'releases' ||
                      view === 'tracks' ||
                      view === 'tasks' ? (
                      <>
                        <CanvasFilterDropdown view={view} />
                        <CanvasSortDropdown view={view} />
                      </>
                    ) : undefined
                  }
                />
              </div>
            )}
            <div className='relative flex-1 min-h-0 overflow-hidden flex'>
              <div className='flex-1 min-h-0 min-w-0 overflow-y-auto'>
                {view === 'onboarding' ? (
                  <OnboardingCanvas
                    onComplete={() => {
                      setView('demo');
                      setSidebarMode('docked');
                    }}
                  />
                ) : view === 'demo' ? (
                  <DashboardHome />
                ) : view === 'releases' ? (
                  subview === 'tracks' ? (
                    // View-builder: under the Releases shell, switching to
                    // the Tracks subview swaps the canvas to the tracks
                    // table without changing breadcrumbs. Same data, finer
                    // grain.
                    <TracksView
                      tracks={TRACKS}
                      pills={searchPills}
                      playingId={playingReleaseId}
                      isPlaying={isPlaying}
                      currentTimeSec={currentTimeSec}
                      keyMode={keyMode}
                      onKeyModeToggle={() =>
                        setKeyMode(m => (m === 'normal' ? 'camelot' : 'normal'))
                      }
                      onPlay={id => {
                        setPlayingReleaseId(id);
                        setIsPlaying(true);
                      }}
                      onSeek={(id, sec) => {
                        setPlayingReleaseId(id);
                        setCurrentTimeSec(sec);
                        setIsPlaying(true);
                      }}
                      onFilter={(field, value) => addPill(field, value)}
                      onContextMenu={onTrackContextMenu}
                      onOpenThread={openThread}
                    />
                  ) : (
                    <ReleasesView
                      releases={RELEASES}
                      playingId={playingReleaseId}
                      isPlaying={isPlaying}
                      currentTimeSec={currentTimeSec}
                      selectedId={selectedReleaseId}
                      drawerOpen={selectedReleaseId !== null}
                      onSelect={setSelectedReleaseId}
                      onPlay={(id, autoplay) => {
                        setPlayingReleaseId(id);
                        if (autoplay) setIsPlaying(true);
                        else setIsPlaying(p => !p || playingReleaseId !== id);
                      }}
                      onSeek={(id, sec) => {
                        setPlayingReleaseId(id);
                        setCurrentTimeSec(sec);
                        setIsPlaying(true);
                      }}
                      onFilterByArtist={name => addPill('artist', name)}
                      onContextMenu={onReleaseContextMenu}
                      onOpenThread={openThread}
                    />
                  )
                ) : view === 'tracks' ? (
                  <TracksView
                    tracks={
                      subview === 'live'
                        ? TRACKS.filter(t => t.status === 'live')
                        : subview === 'scheduled'
                          ? TRACKS.filter(t => t.status === 'scheduled')
                          : subview === 'announced'
                            ? TRACKS.filter(t => t.status === 'announced')
                            : subview === 'drafts'
                              ? TRACKS.filter(t => t.status === 'draft')
                              : subview === 'hidden'
                                ? TRACKS.filter(t => t.status === 'hidden')
                                : TRACKS
                    }
                    pills={searchPills}
                    playingId={playingReleaseId}
                    isPlaying={isPlaying}
                    currentTimeSec={currentTimeSec}
                    keyMode={keyMode}
                    onKeyModeToggle={() =>
                      setKeyMode(m => (m === 'normal' ? 'camelot' : 'normal'))
                    }
                    onPlay={id => {
                      setPlayingReleaseId(id);
                      setIsPlaying(true);
                    }}
                    onSeek={(id, sec) => {
                      setPlayingReleaseId(id);
                      setCurrentTimeSec(sec);
                      setIsPlaying(true);
                    }}
                    onFilter={(field, value) => addPill(field, value)}
                    onContextMenu={onTrackContextMenu}
                    onOpenThread={openThread}
                  />
                ) : view === 'lyrics' ? (
                  <LyricsView
                    track={currentTrack}
                    durationSec={playingRelease?.durationSec ?? TRACK.duration}
                    currentTimeSec={currentTimeSec}
                    lines={lyricsLines}
                    onLinesChange={setLyricsLines}
                    onSeek={sec => setCurrentTimeSec(sec)}
                  />
                ) : view === 'library' ? (
                  <LibraryShellEmbed
                    allAssets={libraryAllAssets}
                    savedView={librarySavedView}
                    filters={libraryFilters}
                    sort={librarySort}
                    viewMode={libraryViewMode}
                    selectedId={librarySelectedId}
                    drawerOpen={libraryDrawerOpen}
                    favorites={libraryFavorites}
                    searchText={searchPills.flatMap(p => p.values).join(' ')}
                    onSelect={setLibrarySelectedId}
                    onSetDrawerOpen={setLibraryDrawerOpen}
                    onToggleFavorite={toggleLibraryFavorite}
                    onClearFilters={clearLibraryFilters}
                  />
                ) : view === 'settings' ? (
                  <SettingsView section={settingsSection} />
                ) : view === 'thread' ? (
                  <ThreadView
                    thread={
                      THREADS.find(t => t.id === selectedThreadId) ?? THREADS[0]
                    }
                  />
                ) : (
                  <TasksView
                    tasks={
                      subview === 'mine'
                        ? TASKS.filter(t => t.assignee === 'you')
                        : subview === 'jovie'
                          ? TASKS.filter(t => t.assignee === 'jovie')
                          : TASKS
                    }
                    onContextMenu={onTaskContextMenu}
                    onOpenRelease={id => {
                      setView('releases');
                      setSelectedReleaseId(id);
                    }}
                    onOpenThread={openThread}
                  />
                )}
              </div>
              {/* Drawer floats above the canvas — elevated, not pushed-aside.
                Wrapper drives slide-in/out + drop shadow; inner drawer
                handles its own opacity + slight translate. Pointer events
                gate so the canvas is interactive while the drawer animates
                away. */}
              <div
                aria-hidden={
                  !(view === 'releases' && selectedReleaseId !== null)
                }
                className='absolute inset-y-0 right-0 z-30 w-[412px] pointer-events-none'
                style={{
                  transform:
                    view === 'releases' && selectedReleaseId !== null
                      ? 'translateX(0)'
                      : 'translateX(calc(100% + 16px))',
                  transition: `transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
                }}
              >
                <div className='h-full pointer-events-auto shadow-[0_24px_48px_-16px_rgba(0,0,0,0.55),-1px_0_0_0_rgba(255,255,255,0.04)]'>
                  <ReleaseDrawer
                    release={
                      view === 'releases' && selectedReleaseId
                        ? (RELEASES.find(r => r.id === selectedReleaseId) ??
                          null)
                        : null
                    }
                    onClose={() => setSelectedReleaseId(null)}
                    onPlay={id => {
                      setPlayingReleaseId(id);
                      setIsPlaying(true);
                    }}
                    onSeek={(id, sec) => {
                      setPlayingReleaseId(id);
                      setCurrentTimeSec(sec);
                      setIsPlaying(true);
                    }}
                    onOpenTasks={() => setView('tasks')}
                    onMenu={onDrawerMenu}
                    onEntityActivate={onEntityActivate}
                  />
                </div>
              </div>
            </div>
            {/* Bottom-right corner restore — the only on-canvas affordance
                back to the audio bar when it's collapsed. ChevronUp signals
                the direction the bar will travel when revealed (up from the
                bottom edge). */}
            <Tooltip
              label='Show audio bar'
              shortcut={SHORTCUTS.toggleBar}
              side='top'
            >
              <button
                type='button'
                onClick={() => setBarCollapsed(false)}
                aria-label='Show audio bar (`)'
                className='absolute bottom-3 right-3 z-30 hidden lg:grid h-7 w-7 place-items-center rounded-md text-quaternary-token hover:text-primary-token hover:bg-surface-1/70 transition-[opacity,color,background-color] duration-150 ease-out'
                style={{
                  opacity:
                    barCollapsed && !cinematic && !onboardingActive ? 1 : 0,
                  pointerEvents:
                    barCollapsed && !cinematic && !onboardingActive
                      ? 'auto'
                      : 'none',
                }}
              >
                <ChevronUp className='h-4 w-4' strokeWidth={2.25} />
              </button>
            </Tooltip>
          </main>
        </div>

        {/* AudioBar — fixed full-viewport-width so the transport buttons stay
            centered regardless of sidebar dock state, drawer open/close, or
            canvas reflow. Earlier rendering inside the canvas column meant
            buttons shifted horizontally whenever the column width changed. */}
        <div
          aria-hidden={barCollapsed || cinematic || onboardingActive}
          className='fixed inset-x-0 bottom-0 z-30 hidden lg:block overflow-hidden bg-(--linear-bg-page)'
          style={{
            maxHeight: barCollapsed || cinematic || onboardingActive ? 0 : 80,
            opacity: barCollapsed || cinematic || onboardingActive ? 0 : 1,
            pointerEvents: cinematic || onboardingActive ? 'none' : undefined,
            transition:
              cinematic || onboardingActive
                ? `max-height 600ms ${EASE_CINEMATIC}, opacity 600ms ${EASE_CINEMATIC}`
                : `max-height 150ms ease-out, opacity 150ms ease-out`,
          }}
        >
          <AudioBar
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(p => !p)}
            onCollapse={() => setBarCollapsed(true)}
            currentTime={currentTimeSec}
            duration={TRACK.duration}
            loopMode={loopMode}
            onCycleLoop={() =>
              setLoopMode(m =>
                m === 'off' ? 'track' : m === 'track' ? 'section' : 'off'
              )
            }
            loopSection={loopMode === 'section' ? LOOP_SECTION : undefined}
            waveformOn={waveformOn}
            onToggleWaveform={() => setWaveformOn(v => !v)}
            lyricsActive={view === 'lyrics'}
            onOpenLyrics={() =>
              setView(v => (v === 'lyrics' ? 'demo' : 'lyrics'))
            }
            track={currentTrack}
          />
        </div>

        {/* Mobile/tablet floating playback cards (lg+ uses the full bar).
            Always mounted; fades + drops 6px on collapse so the bar retires
            instead of popping off. */}
        <div
          aria-hidden={barCollapsed || cinematic || onboardingActive}
          style={{
            opacity: barCollapsed || cinematic || onboardingActive ? 0 : 1,
            transform:
              barCollapsed || cinematic || onboardingActive
                ? 'translateY(6px)'
                : 'translateY(0)',
            pointerEvents:
              barCollapsed || cinematic || onboardingActive ? 'none' : 'auto',
            transition: `opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
          }}
        >
          <MobilePlayerCard
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(p => !p)}
            pct={pct}
            track={toNowPlayingTrack(currentTrack)}
          />
          <TabletPlayerCard
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(p => !p)}
            currentTime={currentTimeSec}
            duration={TRACK.duration}
            track={toNowPlayingTrack(currentTrack)}
          />
        </div>

        <VariantPicker
          variant={variant}
          onVariant={setVariant}
          sidebarFloating={sidebarMode === 'floating'}
          onSidebar={() =>
            setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'))
          }
          barCollapsed={barCollapsed}
          onBar={() => setBarCollapsed(v => !v)}
          waveformOn={waveformOn}
          onWaveform={() => setWaveformOn(v => !v)}
          view={view}
          onView={setView}
          palette={palette}
          onPalette={setPalette}
          installBannerOpen={installBannerOpen}
          onInstallBanner={() => setInstallBannerOpen(v => !v)}
        />

        <JovieOverlay listening={jovieListening} />
        <ShellLoader phase={loaderPhase} />
        {/* ScreeningRoom exit — single icon in the top-right corner.
          Click or Esc returns to chrome view. No text, no extra
          surface — just a dim X that brightens on hover. */}
        <button
          type='button'
          onClick={() => setView('demo')}
          aria-label='Exit screening room (Esc)'
          title='Exit screening room (Esc)'
          className='fixed top-4 right-4 z-50 h-7 w-7 grid place-items-center rounded-md text-quaternary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
          style={{
            opacity: cinematic ? 1 : 0,
            pointerEvents: cinematic ? 'auto' : 'none',
            transition: `opacity 600ms ${EASE_CINEMATIC}`,
          }}
        >
          <X className='h-4 w-4' strokeWidth={2.25} />
        </button>
        <ContextMenuOverlay
          state={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      </div>
    </EntityActivateContext.Provider>
  );
}

// Cold-start loader. Black canvas with the Jovie mark blooming centered,
// then gliding toward where it lives in the sidebar (~24px x 24px from
// top-left of the page) while the app fades in underneath. The mark in
// the sidebar takes over visually at the end. Pointer-events disabled
// throughout so first interactions don't accidentally land on the overlay.
function FloatingSidebarLayer({
  active,
  peekOpen,
  onSetPeekOpen,
  onPin,
  onSelectView,
  activeView,
  tight,
  threads,
  activeThreadId,
  onSelectThread,
  onThreadContextMenu,
  libraryAssetCount,
  nowPlaying,
  installBanner,
}: {
  active: boolean;
  peekOpen: boolean;
  onSetPeekOpen: (open: boolean) => void;
  onPin: () => void;
  onSelectView?: (v: CanvasView) => void;
  activeView?: CanvasView;
  tight?: boolean;
  threads: Thread[];
  activeThreadId?: string | null;
  onSelectThread?: (id: string) => void;
  onThreadContextMenu?: (e: React.MouseEvent, thread: Thread) => void;
  libraryAssetCount: number;
  nowPlaying?: {
    track: TrackInfo;
    isPlaying: boolean;
    barCollapsed: boolean;
    onPlay: () => void;
  };
  installBanner?: { open: boolean; onDismiss: () => void };
}) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open() {
    if (!active) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    onSetPeekOpen(true);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onSetPeekOpen(false), 180);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const visible = active && peekOpen;

  return (
    <>
      {/* Hot zone — invisible 8px column at the left edge of the viewport */}
      {active && (
        <div
          aria-hidden='true'
          className='hidden lg:block fixed top-0 bottom-0 left-0 w-2 z-30'
          onMouseEnter={open}
        />
      )}
      {/* Floating peek card */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same */}
      <div
        className='hidden lg:flex fixed top-2 bottom-2 left-2 z-40 w-[224px] rounded-[var(--linear-app-shell-radius)] border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[var(--linear-app-shell-shadow)] overflow-hidden'
        style={{
          transform: visible
            ? 'translateX(0)'
            : 'translateX(calc(-100% - 8px))',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: `transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
      >
        <Sidebar
          variant='floating'
          onPin={onPin}
          onSelectView={onSelectView}
          activeView={activeView}
          tight={tight}
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onThreadContextMenu={onThreadContextMenu}
          libraryAssetCount={libraryAssetCount}
          nowPlaying={nowPlaying}
          installBanner={installBanner}
        />
      </div>
    </>
  );
}

function Sidebar({
  variant,
  onPin,
  onSelectView,
  activeView,
  tight,
  libraryProps,
  settingsProps,
  threads,
  activeThreadId,
  onSelectThread,
  onThreadContextMenu,
  libraryAssetCount,
  nowPlaying,
  installBanner,
}: {
  variant: 'docked' | 'floating';
  onPin: () => void;
  onSelectView?: (v: CanvasView) => void;
  activeView?: CanvasView;
  tight?: boolean;
  // When provided, the sidebar context-shifts into library mode: brand
  // row swaps to a `← Library` back chip and the body becomes the
  // library's saved-views + facet filters (lifted from /exp/library-v1).
  libraryProps?: {
    allAssets: LibraryAsset[];
    savedView: LibrarySavedViewId;
    onSavedView: (v: LibrarySavedViewId) => void;
    filters: LibraryFiltersType;
    onFilters: (f: LibraryFiltersType) => void;
    onClearAll: () => void;
  };
  // Mirror of libraryProps for settings: when provided, the sidebar
  // body swaps to the settings section nav and the brand row becomes
  // a `← Settings` back chip.
  settingsProps?: {
    activeSection: SettingsSectionId;
    onSelectSection: (id: SettingsSectionId) => void;
  };
  threads: Thread[];
  activeThreadId?: string | null;
  onSelectThread?: (id: string) => void;
  onThreadContextMenu?: (e: React.MouseEvent, thread: Thread) => void;
  // Asset count for the Library nav item — when 0, hide the row.
  libraryAssetCount: number;
  // Simplified now-playing pinned to the sidebar bottom. Only renders
  // when the audio bar is open at the bottom of the canvas — that's
  // when the floating bottom-left card disappears and is replaced by
  // this in-sidebar row.
  nowPlaying?: {
    track: TrackInfo;
    isPlaying: boolean;
    barCollapsed: boolean;
    onPlay: () => void;
  };
  // Optional install-prompt card pinned right above now-playing.
  // Animated in/out by the parent toggling `open`.
  installBanner?: { open: boolean; onDismiss: () => void };
}) {
  const inLibraryMode = !!libraryProps;
  const inSettingsMode = !!settingsProps;
  const inContextMode = inLibraryMode || inSettingsMode;
  const contextLabel = inLibraryMode ? 'Library' : 'Settings';
  const collapsed = false;
  // Header trailing-button affordance morphs through three states:
  //   1. Hover: pin/unpin (transient hint, fades after 3s of inactivity)
  //   2. Just opened (first 3s): pin/unpin always visible — the user
  //      may want to dismiss the sidebar they just opened.
  //   3. Settled: morphs into "New chat" — the primary write affordance
  //      once the user has decided to keep the sidebar open.
  const [pinVisible, setPinVisible] = useState(true);
  const [justOpened, setJustOpened] = useState(true);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function bumpPinVisibility() {
    setPinVisible(true);
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => setPinVisible(false), 3000);
  }

  useEffect(() => {
    bumpPinVisibility();
    setJustOpened(true);
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setJustOpened(false), 3000);
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
      if (openTimer.current) clearTimeout(openTimer.current);
    };
  }, [variant]);
  // Once the user is settled in the sidebar, the trailing button is
  // always visible (it's now "New chat", not a transient hint).
  const trailingVisible = justOpened ? pinVisible : true;
  const showPin = justOpened;
  // Per-workspace open state. Active workspace defaults open.
  const [openWs, setOpenWs] = useState<Record<string, boolean>>({
    bahamas: true,
    sade: false,
    admin: false,
  });

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: pin button visibility hint, decorative reveal only
    <aside
      className={cn(
        'relative flex flex-col h-full shrink-0',
        tight ? 'w-[212px]' : 'w-[224px]'
      )}
      onMouseEnter={bumpPinVisibility}
      onMouseMove={bumpPinVisibility}
    >
      {/* Brand row — Jovie wordmark doubles as the user-menu trigger.
          Click anywhere on the row to drop the user menu. In library
          (or settings) mode the brand row swaps to a `← Section` back
          chip, mirroring the Linear settings nav pattern.
          Height matches the canvas breadcrumb header (h-10) so the
          sidebar brand and breadcrumb share one visual row. */}
      <div className='px-2 h-10 flex items-center shrink-0'>
        <div className='relative flex items-center h-7 gap-2.5 w-full'>
          {inContextMode ? (
            <button
              type='button'
              onClick={() => onSelectView?.('demo')}
              aria-label={`Back from ${contextLabel}`}
              className='flex-1 inline-flex items-center gap-2 h-7 pl-2.5 pr-2 rounded-md hover:bg-surface-1/60 transition-colors duration-150 ease-out cursor-pointer min-w-0 text-secondary-token hover:text-primary-token'
            >
              <ChevronLeft
                className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                strokeWidth={2.25}
              />
              <span
                className='text-[13px] font-semibold tracking-[-0.012em] flex-1 truncate text-left'
                style={{ letterSpacing: '-0.012em' }}
              >
                Back
              </span>
            </button>
          ) : (
            <UserMenu>
              <span className='flex-1 inline-flex items-center gap-2.5 h-7 pl-3 pr-2 rounded-md hover:bg-surface-1/60 transition-colors duration-150 ease-out cursor-pointer min-w-0'>
                <BrandLogo
                  size={16}
                  rounded={false}
                  className='shrink-0 text-primary-token'
                  aria-hidden
                />
                <span className='text-[13.5px] font-semibold tracking-[-0.02em] text-primary-token flex-1 truncate'>
                  Jovie
                </span>
                <ChevronDown
                  className='h-3 w-3 text-quaternary-token shrink-0'
                  strokeWidth={2.25}
                />
              </span>
            </UserMenu>
          )}
          <button
            type='button'
            onClick={() => {
              if (showPin) onPin();
              else onSelectView?.('demo');
            }}
            className='absolute right-2 h-5 w-5 rounded-full grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-[opacity,color,background-color] duration-300 ease-out'
            style={{
              opacity: trailingVisible ? 1 : 0,
              pointerEvents: trailingVisible ? 'auto' : 'none',
            }}
            aria-label={
              showPin
                ? variant === 'floating'
                  ? 'Dock sidebar'
                  : 'Float sidebar (auto-hide)'
                : 'New chat'
            }
            title={
              showPin
                ? variant === 'floating'
                  ? 'Dock sidebar'
                  : 'Float sidebar (auto-hide)'
                : 'New chat'
            }
            tabIndex={trailingVisible ? 0 : -1}
          >
            {/* Crossfade between pin (just-opened) and SquarePen
                (settled). Both icons live in the same slot; only one
                is visible at a time, but the morph is a calm fade
                rather than a snap. */}
            <span className='relative h-2.5 w-2.5'>
              <span
                aria-hidden='true'
                className='absolute inset-0 grid place-items-center transition-opacity duration-300 ease-out'
                style={{ opacity: showPin ? 1 : 0 }}
              >
                {variant === 'floating' ? (
                  <Pin className='h-2.5 w-2.5' strokeWidth={2.25} />
                ) : (
                  <PinOff className='h-2.5 w-2.5' strokeWidth={2.25} />
                )}
              </span>
              <span
                aria-hidden='true'
                className='absolute inset-0 grid place-items-center transition-opacity duration-300 ease-out'
                style={{ opacity: showPin ? 0 : 1 }}
              >
                <SquarePen className='h-2.5 w-2.5' strokeWidth={2.25} />
              </span>
            </span>
          </button>
        </div>
      </div>

      {inLibraryMode && libraryProps ? (
        <nav className='flex-1 overflow-y-auto'>
          <LibraryLeftRail
            noChrome
            savedView={libraryProps.savedView}
            onSavedView={libraryProps.onSavedView}
            assets={libraryProps.allAssets}
            filters={libraryProps.filters}
            onFilters={libraryProps.onFilters}
            onClearAll={libraryProps.onClearAll}
          />
        </nav>
      ) : inSettingsMode && settingsProps ? (
        <nav className='flex-1 overflow-y-auto px-2 pt-2 pb-3 space-y-px'>
          {SETTINGS_SECTIONS.map(s => {
            const active = settingsProps.activeSection === s.id;
            return (
              <button
                key={s.id}
                type='button'
                onClick={() => settingsProps.onSelectSection(s.id)}
                className={cn(
                  'w-full flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-md text-left transition-colors duration-150 ease-out',
                  active
                    ? 'bg-surface-1/80 text-primary-token'
                    : 'text-secondary-token hover:bg-surface-1/50 hover:text-primary-token'
                )}
              >
                <span
                  className={cn(
                    'text-[12.5px] font-medium tracking-[-0.005em]',
                    s.id === 'danger' && 'text-rose-300/90'
                  )}
                >
                  {s.label}
                </span>
                <span className='text-[10.5px] text-quaternary-token leading-tight'>
                  {s.description}
                </span>
              </button>
            );
          })}
        </nav>
      ) : (
        <nav
          className={cn(
            'flex-1 overflow-y-auto px-2 pb-2',
            tight ? 'space-y-3' : 'space-y-5'
          )}
        >
          {/* Cross-context items (no label, just the items). Tasks +
              Library hide entirely when their underlying lists are
              empty — no point taking sidebar real estate for nothing. */}
          <div className='space-y-px'>
            {CORE_ITEMS.filter(item => {
              if (item.label === 'Tasks' && TASKS.length === 0) return false;
              if (item.label === 'Library' && libraryAssetCount === 0)
                return false;
              return true;
            }).map(item => {
              const view: CanvasView | null =
                item.label === 'Library'
                  ? 'library'
                  : item.label === 'Tasks'
                    ? 'tasks'
                    : null;
              return (
                <SidebarNavItem
                  key={item.label}
                  item={{
                    ...item,
                    active:
                      view !== null && activeView === view ? true : item.active,
                    onActivate:
                      view && onSelectView
                        ? () => onSelectView(view)
                        : undefined,
                  }}
                  collapsed={collapsed}
                  tight={tight}
                />
              );
            })}
          </div>

          {/* Threads — auto-named jobs Jovie is running. Most recent
              5 inline; the rest expand on demand. Status dot drives
              tone (running cyan / complete neutral / errored rose). */}
          <SidebarThreadsSection
            threads={threads}
            activeThreadId={
              activeView === 'thread' ? (activeThreadId ?? null) : null
            }
            onSelect={onSelectThread}
            onThreadContextMenu={onThreadContextMenu}
            tight={tight}
            collapsed={collapsed}
          />

          {/* Artists */}
          <div className='space-y-3'>
            {!collapsed && (
              <div className='px-3 pb-1'>
                <span className='text-[9.5px] font-medium uppercase tracking-[0.12em] text-quaternary-token/85'>
                  Artists
                </span>
              </div>
            )}
            {ARTIST_WORKSPACES.map(ws => (
              <SidebarSection
                key={ws.id}
                name={ws.name}
                open={openWs[ws.id] ?? false}
                onToggle={() =>
                  setOpenWs(s => ({ ...s, [ws.id]: !(s[ws.id] ?? false) }))
                }
                itemCount={ws.items.length}
                collapsed={collapsed}
                tight={tight}
              >
                {ws.items.map(item => (
                  <SidebarNavItem
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    nested={!collapsed}
                    tight={tight}
                  />
                ))}
              </SidebarSection>
            ))}
          </div>

          {/* Admin — separate, no section header */}
          <div>
            <SidebarSection
              name={ADMIN_WORKSPACE.name}
              open={openWs[ADMIN_WORKSPACE.id] ?? false}
              onToggle={() =>
                setOpenWs(s => ({
                  ...s,
                  [ADMIN_WORKSPACE.id]: !(s[ADMIN_WORKSPACE.id] ?? false),
                }))
              }
              itemCount={ADMIN_WORKSPACE.items.length}
              collapsed={collapsed}
              tight={tight}
            >
              {ADMIN_WORKSPACE.items.map(item => (
                <SidebarNavItem
                  key={item.label}
                  item={item}
                  collapsed={collapsed}
                  nested={!collapsed}
                  tight={tight}
                />
              ))}
            </SidebarSection>
          </div>
        </nav>
      )}

      {/* Install-prompt card — sits right above the now-playing slot.
          Only renders when the parent toggles installBanner.open. */}
      {installBanner && (
        <InstallBanner
          open={installBanner.open}
          onDismiss={installBanner.onDismiss}
        />
      )}

      {/* Sidebar-bottom now-playing — simplified compact player.
          Visible only when the audio bar is COLLAPSED. The detailed
          floating card (with chips) takes over when the bar opens, and
          slides under the main content area's left edge. Two states,
          two surfaces, never co-resident.
          Bottom inset (`pb-7` = 28px) lines the card up 8px above the
          main content area's bottom edge. The canvas sits ~20px above
          the page edge (peek strip + lg:gap-2), so 20 + 8 = 28. */}
      <div
        aria-hidden={nowPlaying?.barCollapsed === false}
        className='shrink-0 px-2 pb-7 pt-1 overflow-hidden'
        style={{
          maxHeight: nowPlaying && nowPlaying.barCollapsed ? 64 : 0,
          opacity: nowPlaying && nowPlaying.barCollapsed ? 1 : 0,
          transform:
            nowPlaying && nowPlaying.barCollapsed
              ? 'translateY(0)'
              : 'translateY(8px)',
          transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
      >
        {nowPlaying && (
          <SidebarBottomNowPlaying
            track={toNowPlayingTrack(nowPlaying.track)}
            isPlaying={nowPlaying.isPlaying}
            onPlay={nowPlaying.onPlay}
          />
        )}
      </div>
    </aside>
  );
}

// Breadcrumb is section-only — no artist segment. Filtering by artist
// happens via the search-takeover (typing an artist name adds a pill),
// not by routing. Returns a single-crumb trail keyed off the current view.
function breadcrumbForView(
  view: CanvasView
): Array<{ label: string; emphasis?: boolean }> {
  const map: Record<CanvasView, string> = {
    demo: 'Dashboard',
    releases: 'Releases',
    tracks: 'Tracks',
    tasks: 'Tasks',
    library: 'Library',
    lyrics: 'Lyrics',
    settings: 'Settings',
    thread: 'Thread',
    onboarding: 'Onboarding',
  };
  return [{ label: map[view], emphasis: true }];
}

// Subheader strip — page-scoped subview tabs on the left, page toolbar on
// the right. Releases / Tracks / Tasks live in the *nav* (left sidebar);
// this strip is purely for sub-views OF the current page (e.g. Releases →
// All / Singles / EPs / Albums).
function CanvasSubheader({
  subviews,
  subview,
  onSubview,
  extraToolbar,
  onAddView,
}: {
  subviews: { id: string; label: string; count?: number }[];
  subview: string;
  onSubview: (id: string) => void;
  // Optional view-specific toolbar slot, rendered inline before the
  // shared search + panel-right buttons. Used by Library to host its
  // sort dropdown + grid/table toggle without owning its own header.
  extraToolbar?: React.ReactNode;
  // When provided, renders a trailing "+" chip after the subview pills
  // — entry point for saving the current filter combination as a new
  // view. Releases and Library opt-in.
  onAddView?: () => void;
}) {
  // Collapse entirely when there's nothing to render — keeps thread,
  // demo, and lyrics from carrying a 40px empty band under the header.
  if (subviews.length === 0 && !extraToolbar && !onAddView) return null;
  return (
    <div className='shrink-0 h-10 px-3 flex items-center gap-2 border-b border-(--linear-app-shell-border)/50'>
      <div className='flex items-center gap-0.5 min-w-0'>
        {subviews.map(t => {
          const active = subview === t.id;
          return (
            <button
              key={t.id}
              type='button'
              onClick={() => onSubview(t.id)}
              className={cn(
                'h-7 px-2.5 rounded-md text-[12.5px] font-caption tracking-[-0.012em] transition-colors duration-150 ease-out inline-flex items-center gap-1.5',
                active
                  ? 'text-primary-token bg-surface-1/80'
                  : 'text-tertiary-token hover:text-primary-token hover:bg-surface-1/50'
              )}
            >
              <span>{t.label}</span>
              {typeof t.count === 'number' && (
                <span
                  className={cn(
                    'text-[10.5px] tabular-nums',
                    active ? 'text-tertiary-token' : 'text-quaternary-token'
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        {onAddView && (
          <Tooltip label='Save current filter as a view'>
            <button
              type='button'
              onClick={onAddView}
              aria-label='Add view'
              className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/50 transition-colors duration-150 ease-out'
            >
              <Plus className='h-3.5 w-3.5' strokeWidth={2.25} />
            </button>
          </Tooltip>
        )}
      </div>
      {extraToolbar && (
        <div className='ml-auto flex items-center gap-1.5'>{extraToolbar}</div>
      )}
    </div>
  );
}

// Canvas Filter dropdown — showcase surface for searchable + nested
// dropdown patterns. Lives in the subheader for releases / tracks / tasks.
// State is local to the dropdown for the design pass; production will lift
// it to the relevant view's filter state.
function CanvasFilterDropdown({ view }: { view: CanvasView }) {
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [dateRange, setDateRange] = useState('any');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(true);
  return (
    <ShellDropdown
      align='end'
      side='bottom'
      sideOffset={6}
      width={232}
      searchable
      searchPlaceholder='Filter…'
      trigger={
        <Tooltip label='Filter'>
          <button
            type='button'
            aria-label='Filter'
            className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 data-[state=open]:text-primary-token data-[state=open]:bg-surface-1/60'
          >
            <Flag className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
      }
    >
      <ShellDropdown.Label>Status</ShellDropdown.Label>
      <ShellDropdown.RadioGroup value={status} onValueChange={setStatus}>
        <ShellDropdown.RadioItem value='all' label='Any status' />
        <ShellDropdown.RadioItem value='live' label='Live' />
        <ShellDropdown.RadioItem value='scheduled' label='Scheduled' />
        <ShellDropdown.RadioItem value='draft' label='Draft' />
      </ShellDropdown.RadioGroup>
      {view !== 'tasks' ? (
        <>
          <ShellDropdown.Separator />
          <ShellDropdown.Label>Kind</ShellDropdown.Label>
          <ShellDropdown.RadioGroup value={kind} onValueChange={setKind}>
            <ShellDropdown.RadioItem value='all' label='Any kind' />
            <ShellDropdown.RadioItem value='single' label='Single' />
            <ShellDropdown.RadioItem value='ep' label='EP' />
            <ShellDropdown.RadioItem value='album' label='Album' />
          </ShellDropdown.RadioGroup>
        </>
      ) : null}
      <ShellDropdown.Separator />
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger
          icon={Calendar}
          label='Date range'
          description={
            dateRange === 'any'
              ? 'Any date'
              : dateRange === '7d'
                ? 'Last 7 days'
                : dateRange === '30d'
                  ? 'Last 30 days'
                  : 'Last 90 days'
          }
        />
        <ShellDropdown.SubContent>
          <ShellDropdown.RadioGroup
            value={dateRange}
            onValueChange={setDateRange}
          >
            <ShellDropdown.RadioItem value='any' label='Any date' />
            <ShellDropdown.RadioItem value='7d' label='Last 7 days' />
            <ShellDropdown.RadioItem value='30d' label='Last 30 days' />
            <ShellDropdown.RadioItem value='90d' label='Last 90 days' />
          </ShellDropdown.RadioGroup>
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Separator />
      <ShellDropdown.CheckboxItem
        label='Include drafts'
        checked={includeDrafts}
        onCheckedChange={setIncludeDrafts}
      />
      <ShellDropdown.CheckboxItem
        label='Include archived'
        checked={includeArchived}
        onCheckedChange={setIncludeArchived}
      />
    </ShellDropdown>
  );
}

function CanvasSortDropdown({ view }: { view: CanvasView }) {
  const [sortKey, setSortKey] = useState(
    view === 'tasks' ? 'priority' : 'releaseDate'
  );
  const [descending, setDescending] = useState(true);
  const fields =
    view === 'tasks'
      ? [
          { value: 'priority', label: 'Priority' },
          { value: 'dueDate', label: 'Due date' },
          { value: 'updatedAt', label: 'Updated' },
        ]
      : [
          { value: 'releaseDate', label: 'Release date' },
          { value: 'title', label: 'Title' },
          { value: 'streams', label: 'Weekly streams' },
          { value: 'addedAt', label: 'Added' },
        ];
  return (
    <ShellDropdown
      align='end'
      side='bottom'
      sideOffset={6}
      width={196}
      trigger={
        <Tooltip label='Sort'>
          <button
            type='button'
            aria-label='Sort'
            className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 data-[state=open]:text-primary-token data-[state=open]:bg-surface-1/60'
          >
            <ArrowUpDown className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
      }
    >
      <ShellDropdown.Label>Sort by</ShellDropdown.Label>
      <ShellDropdown.RadioGroup value={sortKey} onValueChange={setSortKey}>
        {fields.map(f => (
          <ShellDropdown.RadioItem
            key={f.value}
            value={f.value}
            label={f.label}
          />
        ))}
      </ShellDropdown.RadioGroup>
      <ShellDropdown.Separator />
      <ShellDropdown.CheckboxItem
        label='Descending'
        checked={descending}
        onCheckedChange={setDescending}
        shortcut='D'
      />
    </ShellDropdown>
  );
}

// Defines the per-page subview list. Subviews are filters scoped to the
// current canvas view, with live counts. Returning [] hides the strip.
function subviewsForView(
  view: CanvasView,
  releases: Release[],
  tracks: Track[],
  tasks: Task[]
): { id: string; label: string; count?: number }[] {
  if (view === 'releases') {
    // View-builder: the two foundational catalog cuts (Releases, Tracks)
    // are the defaults. Singles/EPs/Albums are no longer their own subviews
    // — that filter belongs in a saved-view the user opts into. The "+"
    // chip is the entry point for saving the current filter combination
    // ("has video", "scheduled this month", "missing on Apple") as a
    // first-class view.
    return [
      { id: 'releases', label: 'Releases', count: releases.length },
      { id: 'tracks', label: 'Tracks', count: tracks.length },
    ];
  }
  if (view === 'tracks') {
    return [
      { id: 'all', label: 'All', count: tracks.length },
      {
        id: 'live',
        label: 'Live',
        count: tracks.filter(t => t.status === 'live').length,
      },
      {
        id: 'scheduled',
        label: 'Scheduled',
        count: tracks.filter(t => t.status === 'scheduled').length,
      },
      {
        id: 'announced',
        label: 'Announced',
        count: tracks.filter(t => t.status === 'announced').length,
      },
      {
        id: 'drafts',
        label: 'Drafts',
        count: tracks.filter(t => t.status === 'draft').length,
      },
      {
        id: 'hidden',
        label: 'Hidden',
        count: tracks.filter(t => t.status === 'hidden').length,
      },
    ];
  }
  if (view === 'tasks') {
    return [
      { id: 'all', label: 'All', count: tasks.length },
      {
        id: 'mine',
        label: 'Assigned to me',
        count: tasks.filter(t => t.assignee === 'you').length,
      },
      {
        id: 'jovie',
        label: 'Assigned to Jovie',
        count: tasks.filter(t => t.assignee === 'jovie').length,
      },
    ];
  }
  // Demo / lyrics get no subview strip — return [] and the row collapses
  // to just the right-side toolbar.
  return [];
}

function Header({
  sidebarMode,
  onToggleSidebar,
  searchOpen,
  searchPills,
  onSearchOpenChange,
  onPillsChange,
  artistOptions,
  titleOptions,
  albumOptions,
  view,
  rightRailOpen,
  onToggleRightRail,
}: {
  sidebarMode: 'docked' | 'floating';
  onToggleSidebar: () => void;
  searchOpen: boolean;
  searchPills: FilterPill[];
  onSearchOpenChange: (open: boolean) => void;
  onPillsChange: (next: FilterPill[]) => void;
  artistOptions: string[];
  titleOptions: string[];
  albumOptions: string[];
  view: CanvasView;
  rightRailOpen: boolean;
  onToggleRightRail: () => void;
}) {
  const trail = breadcrumbForView(view);
  const sidebarHidden = sidebarMode === 'floating';

  // Cmd+K opens the search-takeover. Esc closes it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onSearchOpenChange(true);
      } else if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        onSearchOpenChange(false);
        onPillsChange([]);
      } else if (!inField && e.key === '/') {
        e.preventDefault();
        onSearchOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, onSearchOpenChange, onPillsChange]);

  return (
    <header className='shrink-0 h-10 px-3 flex items-center gap-2'>
      <Tooltip
        label={sidebarHidden ? 'Dock sidebar' : 'Hide sidebar'}
        shortcut={SHORTCUTS.toggleSidebar}
      >
        <button
          type='button'
          onClick={onToggleSidebar}
          className='h-7 w-7 rounded-full grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out shrink-0'
          aria-label={
            sidebarHidden
              ? 'Dock sidebar ([)'
              : 'Hide sidebar — peek on left edge ([)'
          }
        >
          <PanelLeft className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
      </Tooltip>
      <div className='relative flex-1 min-w-0 h-7'>
        {/* Breadcrumb (visible when search is closed) */}
        <div
          aria-hidden={searchOpen}
          className='absolute inset-0 flex items-center gap-2 text-[13px]'
          style={{
            opacity: searchOpen ? 0 : 1,
            transform: searchOpen ? 'translateY(-2px)' : 'translateY(0)',
            pointerEvents: searchOpen ? 'none' : 'auto',
            transition: `opacity 250ms ${EASE_CINEMATIC}, transform 250ms ${EASE_CINEMATIC}`,
          }}
        >
          {trail.map((crumb, i) => (
            <span key={crumb.label} className='flex items-center gap-2'>
              {i > 0 && (
                <span
                  aria-hidden='true'
                  className='text-quaternary-token/70 text-[12px] font-light select-none'
                >
                  /
                </span>
              )}
              <span
                className={cn(
                  'truncate text-[13px] font-semibold tracking-[-0.018em]',
                  crumb.emphasis
                    ? 'text-secondary-token'
                    : 'text-tertiary-token/80 hover:text-secondary-token cursor-default transition-colors duration-150 ease-out'
                )}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </div>

        {/* Search takeover — pill-based filter bar */}
        <div
          aria-hidden={!searchOpen}
          className='absolute inset-0 flex items-center'
          style={{
            opacity: searchOpen ? 1 : 0,
            transform: searchOpen ? 'translateY(0)' : 'translateY(2px)',
            pointerEvents: searchOpen ? 'auto' : 'none',
            transition: `opacity 250ms ${EASE_CINEMATIC}, transform 250ms ${EASE_CINEMATIC}`,
          }}
        >
          <PillSearch
            active={searchOpen}
            pills={searchPills}
            onPillsChange={onPillsChange}
            artistOptions={artistOptions}
            titleOptions={titleOptions}
            albumOptions={albumOptions}
            onClose={() => {
              onSearchOpenChange(false);
              onPillsChange([]);
            }}
          />
        </div>
      </div>

      <div className='flex items-center gap-2 shrink-0'>
        <PageAction view={view} />
        <Tooltip label={rightRailOpen ? 'Hide details' : 'Show details'}>
          <button
            type='button'
            onClick={onToggleRightRail}
            className={cn(
              'h-7 w-7 rounded-full grid place-items-center transition-colors duration-150 ease-out shrink-0',
              rightRailOpen
                ? 'text-primary-token bg-surface-1'
                : 'text-quaternary-token hover:text-primary-token hover:bg-surface-1'
            )}
            aria-label='Toggle right rail'
            aria-pressed={rightRailOpen}
          >
            <PanelRight className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

// Primary per-view action button. Drops to nothing for views that don't
// have a primary action (lyrics, demo, settings).
function PageAction({ view }: { view: CanvasView }) {
  const action = pageActionForView(view);
  if (!action) return null;
  return (
    <ActionPill
      label={action.label}
      icon={action.icon}
      onClick={action.onClick}
    />
  );
}

function pageActionForView(view: CanvasView): {
  label: string;
  icon?: typeof Plus;
  onClick?: () => void;
} | null {
  switch (view) {
    case 'library':
      return { label: 'Generate', icon: Sparkles };
    case 'releases':
      return { label: 'New release', icon: Plus };
    case 'tracks':
      return { label: 'Upload', icon: Plus };
    case 'tasks':
      return { label: 'New task', icon: Plus };
    default:
      return null;
  }
}

function UserMenu({ children }: { children: React.ReactNode }) {
  return (
    <ShellDropdown
      align='start'
      side='bottom'
      sideOffset={6}
      width={212}
      trigger={
        <button
          type='button'
          className='w-full text-left flex-1 min-w-0'
          aria-label='Account menu'
        >
          {children}
        </button>
      }
    >
      <ShellDropdown.Header
        title='Tim White'
        subtitle='t@timwhite.co'
        entity={ENTITY_CURRENT_USER}
      />
      <ShellDropdown.Item icon={Settings} label='Settings' shortcut='⌘,' />
      <ShellDropdown.Item icon={Shield} label='Admin' />
      <ShellDropdown.Separator />
      <ShellDropdown.Item icon={LogOut} label='Sign out' tone='danger' />
    </ShellDropdown>
  );
}

// Dashboard / Home — calm, anti-anxiety HUD with a single-action
// suggestion carousel at center and the chat composer docked at the
// bottom of the canvas. No widgets. No HUD overload. Just the most
// important thing Jovie thinks you should do today.
type JovieSuggestion = {
  id: string;
  kind: 'dsp' | 'geo' | 'booking' | 'release' | 'pitch';
  title: string;
  body: string;
  action: string;
  // Lower = more urgent. Sorted by confidence × impact (mocked here).
  rank: number;
};

const SUGGESTIONS: JovieSuggestion[] = [
  {
    id: 'sug-1',
    kind: 'booking',
    title: 'Detroit listeners up 340% — book a show',
    body: 'A promoter at the Magic Stick reached out yesterday. I have a draft pitch ready that ties to your Spotify growth there.',
    action: 'Review pitch',
    rank: 1,
  },
  {
    id: 'sug-2',
    kind: 'dsp',
    title: 'Spotify claim — possible match',
    body: '“Jovie Tim” on Spotify (1.2k monthly) shares your bio language and three of your collaborator credits. Confirm if this is yours.',
    action: 'Confirm match',
    rank: 2,
  },
  {
    id: 'sug-3',
    kind: 'release',
    title: 'Lost in the Light needs Spotify Canvas',
    body: 'Drops in 6 days. I have three Canvas options ready — pick one, or I’ll ship the lead pick on Wednesday.',
    action: 'Pick Canvas',
    rank: 3,
  },
  {
    id: 'sug-4',
    kind: 'pitch',
    title: 'Editorial pitch ready for Stronger Than That',
    body: 'I drafted the Spotify editorial pitch. It hits Indigo (folk-pop) and Fresh Finds. Send when you’re ready.',
    action: 'Send pitch',
    rank: 4,
  },
];

function DashboardHome() {
  const [index, setIndex] = useState(0);
  const [composerValue, setComposerValue] = useState('');
  const sorted = useMemo(
    () => [...SUGGESTIONS].sort((a, b) => a.rank - b.rank),
    []
  );
  const current = sorted[index] ?? sorted[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? 'Up late, Tim'
      : hour < 12
        ? 'Good morning, Tim'
        : hour < 18
          ? 'Afternoon, Tim'
          : 'Evening, Tim';
  const advance = () => setIndex(i => (i + 1) % sorted.length);

  return (
    <div className='h-full flex flex-col px-6 pb-4'>
      {/* Suggestion focus zone — single hero card. No view-all, no
          carousel chrome. The user can only advance by acting on the
          card (Dismiss or its primary action), which forces a real
          decision instead of letting them skim past. */}
      <div className='flex-1 grid place-items-center min-h-0'>
        <div className='w-full max-w-[480px] flex flex-col items-center'>
          <div className='shrink-0 text-center pb-5'>
            <h1
              className='text-[15px] font-medium text-tertiary-token'
              style={{ letterSpacing: '-0.012em' }}
            >
              {greeting}
            </h1>
          </div>

          <SuggestionCard
            title={current.title}
            body={current.body}
            actionLabel={current.action}
            onDismiss={advance}
            onAct={advance}
          />
        </div>
      </div>

      {/* Composer locked to the bottom of the canvas. Real production
          ChatInput from apps/web/components/jovie/components/ChatInput.tsx
          for the morphing pill surface, slash picker, and chip tray.
          Backend wiring (useJovieChat / streaming / images) stays stubbed
          for the design pass — those wires land at flip-time. */}
      <div className='shrink-0 mt-4 max-w-[560px] w-full mx-auto'>
        <ChatInput
          value={composerValue}
          onChange={setComposerValue}
          onSubmit={e => {
            e?.preventDefault();
            setComposerValue('');
          }}
          isLoading={false}
          isSubmitting={false}
          placeholder='Ask Jovie'
          shellChatV1
        />
      </div>
    </div>
  );
}

const _TIME_LABEL =
  'text-[10px] tabular-nums text-quaternary-token w-8 shrink-0';

// All variants share the same gradient SVG shell:
// - muted purple → pink → blue gradient stroke
// - horizontal edge-fade mask (transparent at L/R)
// - cue dot markers above the waveform
// - loop section band overlay (when loopMode === 'section')
// - playhead line at the seek position
// - played strands at higher opacity, unplayed kept ambient
//
// What changes between variants is the *waveform geometry* itself.

const _SCRUB_W = 1000;
const SCRUB_H = 32; // includes 4px reserved at the top for cue dots
const WAVE_TOP = 6; // waveform area starts here (cue dots above)
const WAVE_H = SCRUB_H - WAVE_TOP;
const _WAVE_CY = WAVE_TOP + WAVE_H / 2;
const _WAVE_AMP = WAVE_H / 2 - 1;

// Deterministic 1D hash so the "audio" looks the same on every render.
function hash1d(i: number) {
  return Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
}

// Generate audio-like amplitude samples: track envelope * per-sample noise
// + occasional transients (kick-snare bursts). Values in [0.03, 1].
function makeAudio(n: number, seed: number) {
  return Array.from({ length: n }).map((_, i) => {
    const t = i / n;
    // Long-form envelope (intro / verse / chorus / outro shape)
    const env =
      0.32 +
      0.42 * Math.abs(Math.sin(t * Math.PI * 1.1)) +
      0.18 * Math.sin(t * Math.PI * 2.7);
    // Per-sample noise (RMS-style)
    const noise = hash1d(i + seed * 1000);
    // Transient bursts every ~24 samples (beat-ish)
    const beat = Math.exp(-Math.pow(((i + seed * 5) % 24) - 6, 2) / 6) * 0.5;
    return Math.max(
      0.04,
      Math.min(1, Math.abs(env) * (0.45 + noise * 0.55) + beat * 0.4)
    );
  });
}

const AUDIO_PEAK = makeAudio(320, 1); // peak amplitude
const _AUDIO_RMS = AUDIO_PEAK.map((v, i) => v * (0.45 + hash1d(i + 99) * 0.25));
const _AUDIO_LEFT = makeAudio(320, 7);
const _AUDIO_RIGHT = makeAudio(320, 13);

const _CUES = [
  { at: 12, label: 'Intro' },
  { at: 31, label: 'Verse' },
  { at: 58, label: 'Drop' },
  { at: 84, label: 'Bridge' },
];

// --- Geometry generators: all are *real audio waveforms* (mirrored about
// the centerline, dense, dynamic). They differ in render technique.

// Dense rounded bars (SoundCloud / podcast look) — fewer, fatter,
// rounded caps, mirrored.
const DENSE_BAR_COUNT = 96;
const _DENSE_BARS = makeAudio(DENSE_BAR_COUNT, 21);

// ---------------------------------------------------------------------------
// Context menu — right-click on a Tracks / Releases / Tasks row opens this.
// State lives at the shell level so only one menu is open at a time. Items
// are passed in (label, icon, kbd shortcut, optional `tone` for destructive,
// section dividers, disabled). Anchors to mouse pos with viewport clamping.
// ---------------------------------------------------------------------------
type ContextMenuItem =
  | {
      kind?: 'item';
      label: string;
      icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      shortcut?: keyof typeof SHORTCUTS | string;
      onSelect: () => void;
      disabled?: boolean;
      tone?: 'default' | 'danger';
    }
  | { kind: 'separator' };

// ---------------------------------------------------------------------------
// Entity references — hover any release / track / artist mention to surface
// a popover seeded by the same data the entity's page header uses (artwork,
// title, type, primary stat). The popover is bridged to the trigger by an
// invisible padding zone so the cursor can move onto it without dismissing.
// ---------------------------------------------------------------------------

// Render a string with any matching release titles wrapped in EntityRef.
// Releases are matched by literal substring (case-insensitive). First match
// wins so we don't double-wrap overlapping titles. Used in Task list /
// detail to make "Confirm artwork for Lost in the Light" hoverable.
function renderWithEntities(
  text: string,
  releases: Release[],
  onOpenRelease: (id: string) => void
): React.ReactNode {
  const lower = text.toLowerCase();
  let bestStart = -1;
  let bestRelease: Release | null = null;
  let bestEnd = 0;
  for (const r of releases) {
    const idx = lower.indexOf(r.title.toLowerCase());
    if (idx >= 0 && (bestStart < 0 || idx < bestStart)) {
      bestStart = idx;
      bestEnd = idx + r.title.length;
      bestRelease = r;
    }
  }
  if (!bestRelease || bestStart < 0) return text;
  const before = text.slice(0, bestStart);
  const match = text.slice(bestStart, bestEnd);
  const after = text.slice(bestEnd);
  const entity = lookupReleaseEntityByAlbum(bestRelease.album, bestRelease.id);
  return (
    <>
      {before}
      <EntityHoverLink
        entity={entity}
        onActivate={() => bestRelease && onOpenRelease(bestRelease.id)}
      >
        {match}
      </EntityHoverLink>
      {renderWithEntities(after, releases, onOpenRelease)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tooltip — small, dark, glassy popover with the action label + an optional
// kbd chip on the right. Use the SHORTCUTS registry (top of file) for any
// key combo so we have a single source of truth — see KEYBOARD SHORTCUT RULE.
// CSS-only (no portal). Uses group/tip + delay-300 for a Linear-feeling
// late reveal, snapping in over 120ms once it commits.
// ---------------------------------------------------------------------------
function VariantPicker({
  variant,
  onVariant,
  sidebarFloating,
  onSidebar,
  barCollapsed,
  onBar,
  waveformOn,
  onWaveform,
  view,
  onView,
  palette,
  onPalette,
  installBannerOpen,
  onInstallBanner,
}: {
  variant: Variant;
  onVariant: (v: Variant) => void;
  sidebarFloating: boolean;
  onSidebar: () => void;
  barCollapsed: boolean;
  onBar: () => void;
  waveformOn: boolean;
  onWaveform: () => void;
  view: CanvasView;
  onView: (v: CanvasView) => void;
  palette: Palette;
  onPalette: (p: Palette) => void;
  installBannerOpen: boolean;
  onInstallBanner: () => void;
}) {
  // Picker is dev-only chrome — start collapsed so it doesn't cover the
  // top-right corner of the actual UI being designed.
  const [open, setOpen] = useState(false);
  // Filled is the locked waveform style; the picker no longer offers
  // alternates. Variant prop kept for type stability.
  void variant;
  void onVariant;

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='fixed top-3 right-3 z-50 h-7 px-2.5 rounded-md text-[10.5px] font-caption uppercase tracking-[0.08em] text-tertiary-token border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/85 backdrop-blur-xl hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
        title='Open dev picker'
      >
        dev
      </button>
    );
  }

  return (
    <div className='fixed top-3 right-3 z-50 rounded-xl border border-subtle bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] p-2 w-[240px]'>
      <div className='flex items-center justify-between px-2 pt-1 pb-1.5'>
        <p className='text-[10px] uppercase tracking-wider text-tertiary-token font-semibold'>
          Canvas
        </p>
        <button
          type='button'
          onClick={() => setOpen(false)}
          className='h-5 w-5 grid place-items-center rounded-md text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
          aria-label='Hide picker'
          title='Hide picker'
        >
          <ChevronRight className='h-3 w-3' strokeWidth={2.25} />
        </button>
      </div>
      <div className='grid grid-cols-5 gap-0.5 px-1 pb-2 border-b border-subtle'>
        {(
          [
            'demo',
            'releases',
            'tracks',
            'tasks',
            'library',
            'settings',
            'lyrics',
          ] as CanvasView[]
        ).map(v => (
          <button
            key={v}
            type='button'
            onClick={() => onView(v)}
            className={cn(
              'min-w-0 rounded-md px-1 py-1 text-[11px] font-caption capitalize transition-colors duration-150 ease-out truncate',
              view === v
                ? 'bg-primary text-on-primary'
                : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <div className='border-t border-subtle mt-2 pt-2 px-1 space-y-0.5'>
        <PickerToggle
          on={!sidebarFloating}
          onClick={onSidebar}
          onLabel='Sidebar docked'
          offLabel='Sidebar floating (peek)'
          shortcut='['
        />
        <PickerToggle
          on={!barCollapsed}
          onClick={onBar}
          onLabel='Bar visible'
          offLabel='Bar in siderail'
          shortcut='⌘\\'
        />
        <PickerToggle
          on={waveformOn}
          onClick={onWaveform}
          onLabel='Waveform on'
          offLabel='Waveform off'
          shortcut='W'
        />
        <PickerToggle
          on={installBannerOpen}
          onClick={onInstallBanner}
          onLabel='Install banner shown'
          offLabel='Install banner hidden'
        />
      </div>
      <PalettePanel palette={palette} onPalette={onPalette} />
      <div className='border-t border-subtle mt-2 pt-2 px-1 pb-1'>
        <p className='text-[10px] uppercase tracking-wider text-tertiary-token px-1 pb-1.5 font-semibold'>
          Dropdown
        </p>
        <div className='px-1'>
          <DropdownGalleryTrigger />
        </div>
      </div>
      <div className='border-t border-subtle mt-2 pt-2 px-2 pb-1'>
        <p className='text-[10px] uppercase tracking-wider text-tertiary-token pb-1.5 font-semibold'>
          In shell
        </p>
        <div className='space-y-px'>
          <PickerAction
            label='Onboarding'
            onClick={() => onView('onboarding')}
            active={view === 'onboarding'}
          />
        </div>
        <p className='mt-2 text-[10px] uppercase tracking-wider text-tertiary-token pb-1.5 font-semibold'>
          Standalone pages
        </p>
        <div className='space-y-px'>
          <PickerLink href='/exp/home-v1' label='Marketing home' />
          <PickerLink href='/exp/onboarding-v1' label='Onboarding' />
          <PickerLink href='/exp/library-v1' label='Library' />
          <PickerLink href='/exp/auth-v1' label='Sign in & sign up' />
        </div>
      </div>
    </div>
  );
}

// DropdownGalleryTrigger — a single ShellDropdown trigger that opens a
// gallery menu rendering one row per state in the matrix. Lives inside the
// DEV picker so designers can scan every variant without manually invoking
// each surface across the experiment. Strip when the migration PR lands.
function DropdownGalleryTrigger() {
  const [filterDescending, setFilterDescending] = useState(false);
  const [sortKey, setSortKey] = useState('date-added');
  const [quality, setQuality] = useState('auto');
  const onEntityActivate = useEntityActivate();
  return (
    <ShellDropdown
      align='start'
      side='bottom'
      width={240}
      searchable
      searchPlaceholder='Filter actions…'
      onEntityActivate={onEntityActivate}
      trigger={
        <button
          type='button'
          className='w-full flex items-center justify-between h-6 px-2 rounded-md border border-(--linear-app-shell-border) bg-surface-0/40 text-[11px] font-caption text-secondary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
        >
          <span>Show dropdown gallery</span>
          <ChevronDown
            className='h-3 w-3 text-quaternary-token'
            strokeWidth={2.25}
          />
        </button>
      }
    >
      <ShellDropdown.Header
        title='Tim White'
        subtitle='t@timwhite.co · Founder'
        entity={ENTITY_CURRENT_USER}
      />
      <ShellDropdown.Label>Items</ShellDropdown.Label>
      <ShellDropdown.Item label='Plain item' />
      <ShellDropdown.Item icon={Pencil} label='With leading icon' />
      <ShellDropdown.Item
        icon={Activity}
        label='With description'
        description='Two-line row with secondary copy'
      />
      <ShellDropdown.Item icon={Search} label='With shortcut' shortcut='⌘K' />
      <ShellDropdown.Item
        icon={Pin}
        label='Disabled item'
        disabled
        shortcut='P'
      />
      <ShellDropdown.Item
        icon={Trash2}
        label='Danger item'
        tone='danger'
        shortcut='⌫'
      />
      <ShellDropdown.Separator />
      <ShellDropdown.Label>Sort by</ShellDropdown.Label>
      <ShellDropdown.RadioGroup value={sortKey} onValueChange={setSortKey}>
        <ShellDropdown.RadioItem value='date-added' label='Date added' />
        <ShellDropdown.RadioItem value='date-captured' label='Date captured' />
        <ShellDropdown.RadioItem value='popularity' label='Popularity' />
        <ShellDropdown.RadioItem value='status' label='Status' disabled />
      </ShellDropdown.RadioGroup>
      <ShellDropdown.Separator />
      <ShellDropdown.CheckboxItem
        label='Descending'
        checked={filterDescending}
        onCheckedChange={setFilterDescending}
        shortcut='D'
      />
      <ShellDropdown.Separator />
      <ShellDropdown.Label>Submenus</ShellDropdown.Label>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={AudioLines} label='Quality' />
        <ShellDropdown.SubContent>
          <ShellDropdown.RadioGroup value={quality} onValueChange={setQuality}>
            <ShellDropdown.RadioItem value='auto' label='Auto' />
            <ShellDropdown.RadioItem value='lossless' label='Lossless' />
            <ShellDropdown.RadioItem value='high' label='High' />
            <ShellDropdown.RadioItem value='normal' label='Normal' />
          </ShellDropdown.RadioGroup>
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={UserPlus} label='Assign to teammate' />
        <ShellDropdown.SubContent searchable searchPlaceholder='Filter people…'>
          {ENTITY_TEAMMATES.map(t => (
            <ShellDropdown.EntityItem key={t.id} entity={t} />
          ))}
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={Disc3} label='Move to release' />
        <ShellDropdown.SubContent
          searchable
          searchPlaceholder='Filter releases…'
        >
          {ENTITY_RELEASES.map(r => (
            <ShellDropdown.EntityItem key={r.id} entity={r} />
          ))}
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={Users} label='Set artist' />
        <ShellDropdown.SubContent
          searchable
          searchPlaceholder='Filter artists…'
        >
          {ENTITY_ARTISTS.map(a => (
            <ShellDropdown.EntityItem key={a.id} entity={a} />
          ))}
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={Calendar} label='Link to event' />
        <ShellDropdown.SubContent>
          {ENTITY_EVENTS.map(ev => (
            <ShellDropdown.EntityItem key={ev.id} entity={ev} />
          ))}
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Sub>
        <ShellDropdown.SubTrigger icon={AudioWaveform} label='Link to track' />
        <ShellDropdown.SubContent>
          {ENTITY_TRACKS_DEMO.map(t => (
            <ShellDropdown.EntityItem key={t.id} entity={t} />
          ))}
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Separator />
      <ShellDropdown.Item
        icon={LogOut}
        label='Destructive action'
        tone='danger'
      />
    </ShellDropdown>
  );
}

function PalettePanel({
  palette,
  onPalette,
}: {
  palette: Palette;
  onPalette: (p: Palette) => void;
}) {
  const tokens: Array<{ key: keyof Palette; label: string }> = [
    { key: 'page', label: 'Page' },
    { key: 'contentSurface', label: 'Canvas' },
    { key: 'surface0', label: 'Surface 0' },
    { key: 'surface1', label: 'Surface 1' },
    { key: 'surface2', label: 'Surface 2' },
    { key: 'border', label: 'Border' },
  ];
  const currentPresetName =
    Object.entries(PALETTE_PRESETS).find(
      ([, p]) => JSON.stringify(p) === JSON.stringify(palette)
    )?.[0] ?? 'Custom';
  return (
    <div className='border-t border-subtle mt-2 pt-2 px-1'>
      <p className='text-[10px] uppercase tracking-wider text-tertiary-token px-1 pb-1.5 font-semibold'>
        Palette
      </p>
      <div className='px-1 pb-2'>
        <ShellDropdown
          align='start'
          side='bottom'
          width='trigger'
          trigger={
            <button
              type='button'
              className='w-full flex items-center justify-between h-6 px-2 rounded-md border border-(--linear-app-shell-border) bg-surface-0/40 text-[11px] font-caption text-secondary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
            >
              <span className='flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/85' />
                {currentPresetName}
              </span>
              <ChevronDown
                className='h-3 w-3 text-quaternary-token'
                strokeWidth={2.25}
              />
            </button>
          }
        >
          <ShellDropdown.Label>Preset</ShellDropdown.Label>
          <ShellDropdown.RadioGroup
            value={currentPresetName}
            onValueChange={name => {
              const preset = PALETTE_PRESETS[name];
              if (preset) onPalette(preset);
            }}
          >
            {Object.keys(PALETTE_PRESETS).map(name => (
              <ShellDropdown.RadioItem key={name} value={name} label={name} />
            ))}
          </ShellDropdown.RadioGroup>
        </ShellDropdown>
      </div>
      <div className='space-y-1 px-1 pb-1'>
        {tokens.map(t => (
          <div key={t.key} className='flex items-center gap-2'>
            <label className='flex items-center gap-2 cursor-pointer flex-1 min-w-0'>
              <input
                type='color'
                value={palette[t.key]}
                onChange={e =>
                  onPalette({ ...palette, [t.key]: e.target.value })
                }
                className='h-5 w-5 rounded-md border border-(--linear-app-shell-border) bg-transparent cursor-pointer shrink-0 [appearance:none] [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-none'
              />
              <span className='text-[11px] text-secondary-token flex-1 min-w-0 truncate'>
                {t.label}
              </span>
            </label>
            <input
              type='text'
              value={palette[t.key]}
              onChange={e => onPalette({ ...palette, [t.key]: e.target.value })}
              className='w-[72px] shrink-0 h-5 px-2 rounded-md text-[10px] tabular-nums text-tertiary-token bg-surface-1 border border-(--linear-app-shell-border) outline-none focus:text-primary-token'
              spellCheck={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PillSearch — Linear/Notion-style filter chip experience.
// - Type to see suggestions: matching field shortcuts AND matching values
//   (artist, title, album) ranked by simple substring + initials match.
// - Enter / click commits a pill into the bar.
// - Pills support `is` ↔ `is not` op toggle (click the operator label) and
//   merge when adding more values to the same field (artist is X or Y).
// - Backspace at start of input → removes last pill.
// - ↑/↓ navigates the suggestion list.
// ---------------------------------------------------------------------------

// Slash aliases — `/track` maps to title.

// ---------------------------------------------------------------------------
// Releases — Apple Music-style row list with Linear-style stacked chip
// expansion on the right rail. Keyboard-navigable: ↑/↓ moves focus, Enter
// opens the drawer, Space plays/pauses the focused row, Esc closes drawer.
// ---------------------------------------------------------------------------

// Library lives inside the shell as a real canvas view — same component
// as /exp/library-v1, just rendered inside the shell's canvas instead of
// owning the page. The library brings its own left rail (saved views +
// filters), grid/table center, and right asset drawer.
// Same filter logic the standalone library uses, just driven by lifted
// state from the shell. Saved view + facets compose with AND;
// generated-by inverts; search text matches title + tags + alt. Defined
// at module scope so the useMemo dep array stays clean.
const LIBRARY_SAVED_PREDICATES: Record<
  LibrarySavedViewId,
  (a: LibraryAsset) => boolean
> = {
  all: () => true,
  approved: a => a.status === 'approved',
  reels: a => a.aspect === '9:16',
  review: a => a.status === 'review',
  'this-noise': a => a.release === 'this-noise',
  'this-week': a => {
    const days = (Date.now() - new Date(a.addedAt).getTime()) / 86400000;
    return days <= 7 && a.generatedBy === 'jovie';
  },
};

// Library canvas embedded inside the shell. No internal LeftRail, no
// TopBar — those responsibilities lift up: filters live in the shell
// sidebar (context-shifted), sort + view toggle live in the
// CanvasSubheader, search lives in the shell header. We render just the
// content + drawer + status bar.
function LibraryShellEmbed({
  allAssets,
  savedView,
  filters,
  sort,
  viewMode,
  selectedId,
  drawerOpen,
  favorites,
  searchText,
  onSelect,
  onSetDrawerOpen,
  onToggleFavorite,
  onClearFilters,
}: {
  allAssets: LibraryAsset[];
  savedView: LibrarySavedViewId;
  filters: LibraryFiltersType;
  sort: LibrarySortKey;
  viewMode: LibraryViewMode;
  selectedId: string | null;
  drawerOpen: boolean;
  favorites: Set<string>;
  searchText: string;
  onSelect: (id: string | null) => void;
  onSetDrawerOpen: (open: boolean) => void;
  onToggleFavorite: (id: string) => void;
  onClearFilters: () => void;
}) {
  const filteredAssets = useMemo(() => {
    const savedPredicate = LIBRARY_SAVED_PREDICATES[savedView] ?? (() => true);
    const q = searchText.trim().toLowerCase();
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
  }, [allAssets, savedView, filters, sort, searchText]);

  const selected = filteredAssets.find(a => a.id === selectedId) ?? null;

  return (
    <div
      className='h-full w-full grid overflow-hidden'
      style={{
        gridTemplateColumns: drawerOpen ? '1fr 388px' : '1fr 0px',
        transition:
          'grid-template-columns 420ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className='flex flex-col min-w-0 overflow-hidden'>
        <div className='flex-1 overflow-y-auto'>
          {filteredAssets.length === 0 ? (
            <LibraryEmptyState onClear={onClearFilters} />
          ) : viewMode === 'grid' ? (
            <LibraryGrid
              assets={filteredAssets}
              selectedId={selectedId}
              favorites={favorites}
              onSelect={id => {
                onSelect(id);
                onSetDrawerOpen(true);
              }}
              onToggleFavorite={onToggleFavorite}
            />
          ) : (
            <LibraryTable
              assets={filteredAssets}
              selectedId={selectedId}
              favorites={favorites}
              onSelect={id => {
                onSelect(id);
                onSetDrawerOpen(true);
              }}
              onToggleFavorite={onToggleFavorite}
            />
          )}
        </div>
        <LibraryStatusBar
          count={filteredAssets.length}
          total={allAssets.length}
          sort={sort}
        />
      </div>
      <LibraryDrawer
        asset={selected}
        open={drawerOpen}
        onClose={() => onSetDrawerOpen(false)}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — Linear-style two-pane layout. Left rail of section nav,
// right pane is the active section's content. Lives inside the shell so
// the sidebar / audio bar / now-playing card all stay (and the focus
// stays on what's being changed).
//
// The 14-tab list in the existing /app/settings is collapsed into 6
// real groups: Account, Profile, Workspace, Billing, Channels, Danger.
// Anything that overlapped (analytics + audience + retargeting-ads were
// all engagement insights; touring + payments were both scheduling /
// money) folds into a single home.
// ---------------------------------------------------------------------------

type SettingsSectionId =
  | 'account'
  | 'profile'
  | 'workspace'
  | 'billing'
  | 'channels'
  | 'danger';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  description: string;
}> = [
  {
    id: 'account',
    label: 'Account',
    description: 'Email, password, two-factor, sessions',
  },
  {
    id: 'profile',
    label: 'Profile',
    description: 'Public artist profile, bio, links',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Members, invites, roles',
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Plan, payment method, invoices',
  },
  {
    id: 'channels',
    label: 'Channels',
    description: 'Spotify, Apple Music, social posting',
  },
  {
    id: 'danger',
    label: 'Danger zone',
    description: 'Delete account, reset workspace',
  },
];

// Thread view — stub of the chat thread that any Jovie job opens into.
// Real implementation would stream agent steps, tool calls, and the
// final asset. Today we render the title, status, and a mock conversation
// shape so the canvas wiring can be exercised.
// Mock markdown content per thread state — exercises the streamdown
// rendering with headings, lists, code, links, bold. When real backend
// wires in, this is replaced by the streaming response from useChat.
// Returns the first running thread linked to a given entity, or null.
// Used by entity rows (release / track / task) to surface a loading
// glyph that opens the thread on click.
function findRunningThreadFor(
  kind: 'release' | 'track' | 'task',
  id: string,
  threads: readonly Thread[]
): Thread | null {
  return (
    threads.find(
      t => t.status === 'running' && t.entityKind === kind && t.entityId === id
    ) ?? null
  );
}

// Tiny pulsing affordance shown on entity rows when a thread is
// running for that entity. Click → opens the thread in the canvas.
function mockThreadMarkdown(thread: Thread): string {
  if (thread.status === 'errored') {
    return [
      'I hit a snag. The upstream renderer rejected the spatial job — master rate exceeds the 96 kHz upper bound.',
      '',
      'I can retry with a **downscaled master**, or wait for the new pipeline. Up to you.',
    ].join('\n');
  }
  if (thread.status === 'running') {
    return [
      'Working on this now. Surfacing partial output as it lands:',
      '',
      '1. Pulled the latest master from the library',
      '2. Generated 3 candidate frames at 1080×1920',
      '3. Locking the chorus crop now',
      '',
      'I’ll drop the final clip in **Lost in the Light** when ready.',
    ].join('\n');
  }
  return [
    "Done. Here's what I shipped:",
    '',
    '- Lyric video (1080×1920, 0:34) — added to the library',
    '- Smart link updated with a Spotify Canvas variant',
    '- Pinned a quick approval task on **Lost in the Light**',
    '',
    'Open the release page to confirm the render before I push it live.',
  ].join('\n');
}

// 16:10 placeholder used by the "complete" branch of the design demo.
// Tiny dark-rect SVG keeps visual parity with the inline gradient
// previously rendered when ThreadImageCard had no previewUrl.
const THREAD_DEMO_PREVIEW =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 10'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23292c33'/><stop offset='1' stop-color='%2310131a'/></linearGradient></defs><rect width='16' height='10' fill='url(%23g)'/></svg>";

function ThreadView({ thread }: { thread: Thread }) {
  return (
    <ShellThreadView thread={thread}>
      <ThreadTurn speaker='jovie'>
        <ChatMarkdown content={mockThreadMarkdown(thread)} />
      </ThreadTurn>
      {thread.status === 'complete' && (
        <>
          <ThreadImageCard
            prompt='Lost in the Light · Spotify Canvas'
            status='ready'
            previewUrl={THREAD_DEMO_PREVIEW}
          />
          <ThreadAudioCard
            title='Lost in the Light'
            artist='Bahamas'
            duration='3:33'
          />
          <ThreadVideoCard
            title='Lost in the Light · lyric video'
            durationSec={34}
          />
        </>
      )}
      {thread.status === 'running' && (
        <>
          <ThreadImageCard
            prompt='Lost in the Light · Spotify Canvas'
            status='generating'
          />
          <ThreadTurn speaker='jovie' subtle>
            <span className='inline-flex items-center gap-1.5'>
              <Loader2
                className='h-3 w-3 animate-spin text-quaternary-token'
                strokeWidth={2.25}
              />
              Generating…
            </span>
          </ThreadTurn>
        </>
      )}
    </ShellThreadView>
  );
}

// Onboarding lives inside the shell. Initial state: just a centered
// chat input + a quiet greeting. The user types their handle, hits
// submit, and the composer cinematically docks to the bottom while
// Jovie's confirmation streams in above. Same chat chrome as the rest
// of the app — composer is the input mechanism, no special pill.
function OnboardingCanvas({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<'welcome' | 'ready'>('welcome');
  const [handle, setHandle] = useState('');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  function submit(e?: React.FormEvent | React.KeyboardEvent) {
    e?.preventDefault?.();
    if (stage !== 'welcome') return;
    const cleaned = draft
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9-_]/g, '');
    if (!cleaned) return;
    setHandle(cleaned);
    setDraft('');
    setStage('ready');
  }

  // Scroll messages into view when stage changes (welcome → ready).
  // No-op on welcome since the scroll area is empty.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [stage]);

  return (
    <article className='relative h-full overflow-hidden flex flex-col'>
      <div ref={scrollRef} className='flex-1 min-h-0 overflow-y-auto'>
        <div className='max-w-2xl mx-auto px-8 pt-12 pb-6 space-y-4 text-[13.5px] leading-relaxed'>
          {stage === 'ready' && (
            <>
              <ThreadTurn speaker='me'>{handle}</ThreadTurn>
              <ThreadTurn speaker='jovie'>
                <span className='text-primary-token'>jov.ie/{handle}</span> is
                yours. We&apos;ll wire everything up from here.
              </ThreadTurn>
              <div className='pt-2 flex justify-end'>
                <button
                  type='button'
                  onClick={onComplete}
                  className='inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12px] font-medium bg-white text-black hover:brightness-110 active:scale-[0.99] shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all duration-150 ease-out'
                >
                  Open Jovie
                  <ArrowRight className='h-3 w-3' strokeWidth={2.5} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Welcome greeting — sits above the composer when we're in the
          welcome state. Fades out when the user submits. */}
      <div
        className='shrink-0 px-8 text-center'
        style={{
          opacity: stage === 'welcome' ? 1 : 0,
          maxHeight: stage === 'welcome' ? 100 : 0,
          overflow: 'hidden',
          transition: `opacity 300ms ${EASE_CINEMATIC}, max-height 600ms ${EASE_CINEMATIC}`,
        }}
      >
        <BrandLogo
          size={28}
          rounded={false}
          className='mx-auto mb-2 text-primary-token opacity-30'
          aria-hidden
        />
        <h1
          className='text-[14px] font-medium text-tertiary-token'
          style={{ letterSpacing: '-0.01em' }}
        >
          Welcome to Jovie
        </h1>
      </div>

      {/* Composer — always mounted, never remounts on stage change so
          it doesn't lose focus mid-animation. Bottom padding animates
          from a tall spacer (centered) to chat-pinned. */}
      <footer className='shrink-0 px-8 pt-2'>
        <div className='max-w-2xl mx-auto'>
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            isLoading={false}
            isSubmitting={false}
            placeholder={
              stage === 'welcome' ? 'Pick a handle…' : 'Talk to Jovie…'
            }
            shellChatV1
          />
        </div>
      </footer>

      {/* Animated bottom spacer — tall when welcome (pushes composer
          up to roughly center), thin when ready (composer locks to
          the bottom of the canvas). */}
      <div
        className='shrink-0'
        style={{
          maxHeight: stage === 'welcome' ? 'calc(45vh - 80px)' : '16px',
          transition: `max-height 600ms ${EASE_CINEMATIC}`,
        }}
      />
    </article>
  );
}

// Settings — context-shifts the sidebar (same pattern as Library). The
// canvas no longer carries its own nav rail; the active section is the
// only thing on the canvas. All rows for a section group into ONE card
// — no more per-row carding.
function SettingsView({ section }: { section: SettingsSectionId }) {
  const meta = SETTINGS_SECTIONS.find(s => s.id === section);
  if (!meta) return null;
  const rows = settingsRowsFor(section);
  return (
    <article className='max-w-2xl mx-auto px-8 pt-8 pb-12'>
      <h1 className='text-[24px] font-display tracking-[-0.018em] leading-tight text-primary-token'>
        {meta.label}
      </h1>
      <p className='mt-1.5 text-[12.5px] text-tertiary-token'>
        {meta.description}
      </p>

      {/* Single card per section. Rows stack inside with hairline
          dividers — no per-row card chrome. Danger keeps the same
          neutral shell; only the action buttons carry the rose
          accent so the page doesn't shout. */}
      <div className='mt-6 rounded-xl border border-(--linear-app-shell-border)/70 bg-(--surface-0)/40 overflow-hidden'>
        {rows.map((row, i) => (
          <SettingsRow key={row.label} {...row} divider={i > 0} />
        ))}
      </div>
    </article>
  );
}

function settingsRowsFor(id: SettingsSectionId): Array<{
  label: string;
  description?: string;
  control: React.ReactNode;
  tone?: 'default' | 'danger';
}> {
  const valueText = (value: string) => (
    <span className='text-[12.5px] text-tertiary-token tabular-nums'>
      {value}
    </span>
  );
  const editBtn = (
    <button
      type='button'
      className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
    >
      Edit
    </button>
  );
  switch (id) {
    case 'account':
      return [
        {
          label: 'Email',
          description: 'For sign-in and account notifications',
          control: valueText('tim@timwhite.co'),
        },
        {
          label: 'Password',
          description: 'Change password or reset',
          control: editBtn,
        },
        {
          label: 'Two-factor authentication',
          description: 'Required for production workspaces',
          control: (
            <span className='inline-flex items-center gap-1.5 h-6 px-2 rounded text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token bg-(--surface-1)/60 border border-(--linear-app-shell-border)'>
              <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/80' />
              Enabled
            </span>
          ),
        },
        {
          label: 'Active sessions',
          description: '3 devices · 1 in this browser',
          control: editBtn,
        },
      ];
    case 'profile':
      return [
        {
          label: 'Handle',
          description: 'jov.ie/timwhite — public artist URL',
          control: valueText('@timwhite'),
        },
        {
          label: 'Display name',
          control: valueText('Tim White'),
        },
        {
          label: 'Bio',
          description: 'Up to 280 characters, plain text',
          control: editBtn,
        },
        {
          label: 'External links',
          description: '5 links · drag to reorder',
          control: editBtn,
        },
      ];
    case 'workspace':
      return [
        {
          label: 'Workspace name',
          control: valueText('Tim White Music'),
        },
        {
          label: 'Members',
          description: '1 owner · 0 collaborators · invite up to 4 more',
          control: editBtn,
        },
        {
          label: 'Default release timezone',
          control: valueText('Pacific Time'),
        },
      ];
    case 'billing':
      return [
        {
          label: 'Plan',
          description: 'Free during reverse trial · 14 days left',
          control: (
            <button
              type='button'
              className='inline-flex items-center h-7 px-3 rounded-md text-[12px] font-medium bg-white text-black hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out'
            >
              Upgrade to Pro
            </button>
          ),
        },
        {
          label: 'Payment method',
          control: valueText('—'),
        },
        {
          label: 'Invoices',
          description: 'Receipts for any past charges',
          control: editBtn,
        },
      ];
    case 'channels':
      return [
        {
          label: 'Spotify for Artists',
          description: 'Auto-pitch playlists, push Canvas, sync streams',
          control: (
            <span className='inline-flex items-center gap-1.5 h-6 px-2 rounded text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token bg-(--surface-1)/60 border border-(--linear-app-shell-border)'>
              <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/80' />
              Connected
            </span>
          ),
        },
        {
          label: 'Apple Music for Artists',
          description: 'Pull listener insights, schedule promo content',
          control: (
            <button
              type='button'
              className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
            >
              Connect
            </button>
          ),
        },
        {
          label: 'Instagram + TikTok',
          description: 'Cross-post reels and lyric clips from the library',
          control: (
            <button
              type='button'
              className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-primary-token border border-(--linear-app-shell-border) bg-(--surface-0) hover:bg-surface-1/60 transition-colors duration-150 ease-out'
            >
              Connect
            </button>
          ),
        },
      ];
    case 'danger':
      return [
        {
          label: 'Reset workspace',
          description: 'Wipe all releases, tracks, and tasks. Cannot undo.',
          control: (
            <button
              type='button'
              className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-rose-200 border border-(--linear-app-shell-border) bg-(--surface-0) hover:border-rose-400/40 hover:bg-rose-500/[0.06] transition-colors duration-150 ease-out'
            >
              Reset workspace
            </button>
          ),
          tone: 'danger',
        },
        {
          label: 'Delete account',
          description: 'Permanently delete your Jovie account. Cannot undo.',
          control: (
            <button
              type='button'
              className='inline-flex items-center h-7 px-3 rounded-md text-[12px] text-secondary-token hover:text-rose-200 border border-(--linear-app-shell-border) bg-(--surface-0) hover:border-rose-400/40 hover:bg-rose-500/[0.06] transition-colors duration-150 ease-out'
            >
              Delete account
            </button>
          ),
          tone: 'danger',
        },
      ];
    default:
      return [];
  }
}

function ReleasesView({
  releases,
  playingId,
  isPlaying,
  currentTimeSec,
  selectedId,
  drawerOpen,
  onSelect,
  onPlay,
  onSeek,
  onFilterByArtist,
  onContextMenu,
  onOpenThread,
}: {
  releases: Release[];
  playingId: string;
  isPlaying: boolean;
  currentTimeSec: number;
  selectedId: string | null;
  drawerOpen: boolean;
  onSelect: (id: string | null) => void;
  onPlay: (id: string, autoplay?: boolean) => void;
  onSeek: (id: string, sec: number) => void;
  onFilterByArtist: (name: string) => void;
  onContextMenu?: (e: React.MouseEvent, release: Release) => void;
  onOpenThread?: (id: string) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  // While the user is keyboard-navigating, suppress mouse-hover styles
  // so only the focused row reads as active. Mouse movement re-enables
  // hover; arrow-key activity restarts the suppression timer.
  const [keyboardNav, setKeyboardNav] = useState(false);
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function bumpKeyboardNav() {
    setKeyboardNav(true);
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(() => setKeyboardNav(false), 1500);
  }
  useEffect(() => {
    function onMouse() {
      if (kbTimer.current) clearTimeout(kbTimer.current);
      setKeyboardNav(false);
    }
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('mousemove', onMouse);
      if (kbTimer.current) clearTimeout(kbTimer.current);
    };
  }, []);

  // Scroll the focused row into view when it changes — keeps off-screen
  // rows visible as the user navigates with arrows / j-k.
  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'k') {
      e.preventDefault();
      bumpKeyboardNav();
      const next = Math.min(releases.length - 1, focusedIndex + 1);
      setFocusedIndex(next);
      if (drawerOpen) onSelect(releases[next]?.id ?? null);
    } else if (e.key === 'ArrowUp' || e.key === 'j') {
      e.preventDefault();
      bumpKeyboardNav();
      const prev = Math.max(0, focusedIndex - 1);
      setFocusedIndex(prev);
      if (drawerOpen) onSelect(releases[prev]?.id ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(releases[focusedIndex]?.id ?? null);
    } else if (e.code === 'Space') {
      e.preventDefault();
      const r = releases[focusedIndex];
      if (r) onPlay(r.id);
    } else if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault();
      onSelect(null);
    }
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: keyboard list root delegates Enter/Space/arrows to focused row
    <section
      ref={containerRef}
      className='flex flex-col h-full focus:outline-none'
      // biome-ignore lint/a11y/noNoninteractiveTabindex: container is the keyboard entry point for the row list
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label='Releases'
    >
      <div className='flex-1 min-h-0 overflow-y-auto px-3 pb-6 pt-3'>
        <ul className='space-y-px'>
          {releases.map((r, i) => (
            <ReleaseRow
              key={r.id}
              release={r}
              index={i + 1}
              isPlaying={r.id === playingId && isPlaying}
              isCurrentTrack={r.id === playingId}
              currentTimeSec={r.id === playingId ? currentTimeSec : 0}
              isSelected={r.id === selectedId}
              isFocused={i === focusedIndex}
              drawerOpen={drawerOpen}
              kbActive={keyboardNav}
              rowRef={el => {
                rowRefs.current[i] = el;
              }}
              onSelect={() => {
                setFocusedIndex(i);
                onSelect(r.id);
              }}
              onPlay={() => {
                setFocusedIndex(i);
                onPlay(r.id, true);
              }}
              onSeek={sec => {
                setFocusedIndex(i);
                onSeek(r.id, sec);
              }}
              onFilterByArtist={onFilterByArtist}
              onContextMenu={onContextMenu}
              onOpenThread={onOpenThread}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ReleaseRow({
  release,
  index,
  isPlaying,
  isCurrentTrack,
  currentTimeSec: _currentTimeSec,
  isSelected,
  isFocused,
  drawerOpen,
  kbActive,
  rowRef,
  onSelect,
  onPlay,
  onSeek: _onSeek,
  onFilterByArtist,
  onContextMenu,
  onOpenThread,
}: {
  release: Release;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  currentTimeSec: number;
  isSelected: boolean;
  isFocused: boolean;
  drawerOpen: boolean;
  kbActive?: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
  onSelect: () => void;
  onPlay: () => void;
  onSeek: (sec: number) => void;
  onFilterByArtist: (name: string) => void;
  onContextMenu?: (e: React.MouseEvent, release: Release) => void;
  onOpenThread?: (id: string) => void;
}) {
  // currentTimeSec/onSeek are wired through for the Tracks view's row
  // waveform — Release rows don't render a waveform.
  void _currentTimeSec;
  void _onSeek;
  const runningThread = findRunningThreadFor('release', release.id, THREADS);
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: list row activates via parent section's keyboard handler; mouse-click is a convenience
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above — parent section handles ↑/↓/Enter/Space/Esc
    <li
      ref={rowRef}
      onClick={onSelect}
      onContextMenu={e => onContextMenu?.(e, release)}
      data-selected={isSelected || undefined}
      data-focused={isFocused || undefined}
      className={cn(
        'group/row relative grid items-center gap-3 h-[52px] rounded-md pl-2 pr-3 cursor-pointer transition-colors duration-150 ease-out focus:outline-none',
        // [#] [art] [title/artist+badge fluid] [date] [right cluster: streams + DSP stack]
        drawerOpen
          ? 'grid-cols-[24px_40px_minmax(0,1fr)_auto]'
          : 'grid-cols-[24px_40px_minmax(0,1fr)_auto_auto]',
        // Hover bg suppressed during keyboard nav so the row your mouse
        // happens to be over doesn't compete with the focused row.
        !isSelected && !isFocused && !kbActive && 'hover:bg-surface-1/50',
        SELECTED_ROW_CLASSES
      )}
    >
      {/* Index / Play indicator column */}
      <div className='relative grid place-items-center w-6'>
        <span
          className={cn(
            'text-[12px] tabular-nums text-quaternary-token transition-opacity duration-150 ease-out',
            (isCurrentTrack || isPlaying) && 'opacity-0',
            !isCurrentTrack && 'group-hover/row:opacity-0'
          )}
        >
          {index}
        </span>
        {isPlaying && <PlayingBars />}
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onPlay();
          }}
          className={cn(
            'absolute inset-0 grid place-items-center text-primary-token transition-opacity duration-150 ease-out',
            isCurrentTrack
              ? 'opacity-0'
              : 'opacity-0 group-hover/row:opacity-100'
          )}
          aria-label={
            isPlaying ? `Pause ${release.title}` : `Play ${release.title}`
          }
        >
          {isPlaying ? (
            <Pause
              className='h-3.5 w-3.5'
              fill='currentColor'
              strokeWidth={2.5}
            />
          ) : (
            <Play
              className='h-3.5 w-3.5 translate-x-px'
              fill='currentColor'
              strokeWidth={2.5}
            />
          )}
        </button>
      </div>

      {/* Artwork */}
      <div className='relative shrink-0'>
        <ArtworkThumb src={release.artwork} title={release.title} size={40} />
        {release.agent !== 'idle' && <AgentPulse />}
      </div>

      {/* Title (with type badge) / artist */}
      <div className='min-w-0'>
        <div className='flex items-center gap-1.5 min-w-0'>
          <span className='truncate text-[13px] font-caption leading-tight tracking-[-0.01em] text-primary-token'>
            {release.title}
          </span>
          <TypeBadge label={release.type} />
        </div>
        <div className='truncate text-[11.5px] text-tertiary-token leading-tight mt-0.5'>
          <button
            type='button'
            onClick={e => {
              e.stopPropagation();
              onFilterByArtist(release.artist);
            }}
            className='hover:text-primary-token transition-colors duration-150 ease-out'
            title='Filter by artist'
          >
            {release.artist}
          </button>
          {release.agent !== 'idle' && (
            <>
              <span className='mx-1.5 text-quaternary-token'>·</span>
              <span className='text-secondary-token'>
                {agentLabel(release.agent)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Release date — hidden in narrow */}
      <span
        className={cn(
          'text-[11px] text-tertiary-token tabular-nums whitespace-nowrap min-w-[68px] text-right',
          drawerOpen && 'hidden'
        )}
      >
        {relativeDate(release.releaseDate)}
      </span>

      {/* Right cluster: thread glyph (if running) + streams + DSP avatar stack */}
      <div className='flex items-center gap-3 justify-end'>
        {runningThread && onOpenThread && (
          <EntityThreadGlyph
            threadTitle={runningThread.title}
            onOpen={() => onOpenThread(runningThread.id)}
          />
        )}
        <span
          className={cn(
            'text-[11px] text-secondary-token tabular-nums whitespace-nowrap min-w-[42px] text-right',
            drawerOpen && 'hidden'
          )}
          title={`${release.weeklyStreams.toLocaleString()} streams this week`}
        >
          {formatStreams(release.weeklyStreams)}
        </span>
        <DspAvatarStack dsps={releaseDspItems(release)} />
        <ReleaseRowMoreMenu release={release} />
      </div>
    </li>
  );
}

// Per-row release "More" menu — entity-bearing submenus for "Move to release…"
// (releases) and "Change artist…" (artists) demonstrate EntityItem hover
// across the release surface.
function ReleaseRowMoreMenu({ release }: { release: Release }) {
  const onEntityActivate = useEntityActivate();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper exists to stop click/keydown bubbling so the menu trigger doesn't also trigger row-select; not itself an interactive element.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — handlers are pass-through-blockers, not new interactions.
    <div
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <ShellDropdown
        align='end'
        side='bottom'
        sideOffset={6}
        width={208}
        onEntityActivate={onEntityActivate}
        trigger={
          <button
            type='button'
            aria-label='Release actions'
            className={cn(
              'h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-150 ease-out',
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-primary-token'
            )}
          >
            <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
          </button>
        }
      >
        <ShellDropdown.Item icon={Play} label='Play' shortcut='Space' />
        <ShellDropdown.Item icon={ExternalLink} label='Open release' />
        <ShellDropdown.Separator />
        <ShellDropdown.Sub>
          <ShellDropdown.SubTrigger icon={Disc3} label='Move to release…' />
          <ShellDropdown.SubContent
            searchable
            searchPlaceholder='Filter releases…'
          >
            {ENTITY_RELEASES.filter(r => r.id !== release.id).map(r => (
              <ShellDropdown.EntityItem key={r.id} entity={r} />
            ))}
          </ShellDropdown.SubContent>
        </ShellDropdown.Sub>
        <ShellDropdown.Sub>
          <ShellDropdown.SubTrigger icon={Users} label='Change artist…' />
          <ShellDropdown.SubContent
            searchable
            searchPlaceholder='Filter artists…'
          >
            {ENTITY_ARTISTS.map(a => (
              <ShellDropdown.EntityItem key={a.id} entity={a} />
            ))}
          </ShellDropdown.SubContent>
        </ShellDropdown.Sub>
        <ShellDropdown.Separator />
        <ShellDropdown.Item
          icon={LinkIcon}
          label='Copy smart link'
          shortcut='⌘L'
        />
        <ShellDropdown.Item icon={Copy} label='Duplicate' shortcut='⌘D' />
        <ShellDropdown.Item icon={Pin} label='Pin to top' />
        <ShellDropdown.Separator />
        <ShellDropdown.Item icon={Archive} label='Archive' tone='danger' />
      </ShellDropdown>
    </div>
  );
}

function agentLabel(s: ReleaseAgentState) {
  switch (s) {
    case 'rescanning-dsps':
      return 'Rescanning DSPs…';
    case 'generating-pitch':
      return 'Generating pitch…';
    case 'syncing-art':
      return 'Syncing artwork…';
    default:
      return '';
  }
}

// First-class release detail rail. Always mounted when reachable so the
// open/close transitions slide smoothly. Sticky surface uses grid resize +
// inner translate-x so content doesn't reflow during the morph.
// Right rail variant B (sectioned tabs) — locked direction. Top half is
// a clean, calm hero (artwork left, title prominent, type badge under
// title, status chip top-right with subtle tone, hover-play overlay on
// artwork, overflow menu top-right). Tabbed body reveals complexity:
// Overview → Distribution → Activity → Details. Cues is tracks-only;
// hidden when the entity is a release. Tab choice persists across
// entities per kind so power users don't re-click on every nav.
type DrawerTab =
  | 'overview'
  | 'distribution'
  | 'lyrics'
  | 'cues'
  | 'activity'
  | 'details';
type EntityKind = 'release' | 'track' | 'contact';

const DEFAULT_TAB_FOR_KIND: Record<EntityKind, DrawerTab> = {
  release: 'overview',
  track: 'overview',
  contact: 'overview',
};

const TABS_FOR_KIND: Record<EntityKind, DrawerTab[]> = {
  // Releases: no audio file → no Cues, no Lyrics. They live on tracks.
  release: ['overview', 'distribution', 'activity', 'details'],
  // Tracks: Lyrics + Cues both live on the audio file.
  track: ['overview', 'distribution', 'lyrics', 'cues', 'activity', 'details'],
  contact: ['overview', 'activity', 'details'],
};

const TAB_LABEL: Record<DrawerTab, string> = {
  overview: 'Overview',
  distribution: 'Distribution',
  lyrics: 'Lyrics',
  cues: 'Cues',
  activity: 'Activity',
  details: 'Details',
};

// Module-scoped tab persistence per entity kind. When a user picks
// "Distribution" on one release, the next release opens on
// "Distribution" too. Tracks remember independently (they have a Cues
// tab releases don't).
const REMEMBERED_TAB: Record<EntityKind, DrawerTab> = {
  release: 'overview',
  track: 'overview',
  contact: 'overview',
};

function useRememberedTab(
  kind: EntityKind
): [DrawerTab, (t: DrawerTab) => void] {
  const [tab, setTabLocal] = useState<DrawerTab>(REMEMBERED_TAB[kind]);
  // Snap to remembered when entity kind changes.
  useEffect(() => {
    // Snap to remembered when entity kind changes. Tab is intentionally
    // not in the dep array — this is a kind-change reaction, not a tab
    // sync. The only place we read tab is in setTabLocal which is stable.
    setTabLocal(REMEMBERED_TAB[kind] ?? DEFAULT_TAB_FOR_KIND[kind]);
  }, [kind]);
  const setTab = (t: DrawerTab) => {
    REMEMBERED_TAB[kind] = t;
    setTabLocal(t);
  };
  return [tab, setTab];
}

function ReleaseDrawer({
  release,
  onClose,
  onPlay,
  onSeek,
  onOpenTasks,
  onMenu,
  onEntityActivate,
}: {
  release: Release | null;
  onClose: () => void;
  onPlay?: (id: string) => void;
  onSeek?: (id: string, sec: number) => void;
  onOpenTasks?: () => void;
  onMenu?: (e: React.MouseEvent<HTMLButtonElement>, r: Release) => void;
  onEntityActivate?: (entity: EntityPopoverData) => void;
}) {
  // Remember the last release so the slide-out can keep rendering content
  // while it's animating away (release becomes null right at close).
  const [sticky, setSticky] = useState<Release | null>(release);
  useEffect(() => {
    if (release) setSticky(release);
  }, [release]);

  const open = release !== null;
  const r = release ?? sticky;
  const kind: EntityKind = 'release';
  const [tab, setTab] = useRememberedTab(kind);
  const tabs = TABS_FOR_KIND[kind];

  if (!r) return null;

  return (
    <aside
      aria-hidden={!open}
      // Each card floats on the page bg as its own elevated peer — no
      // dividing line between drawer and canvas, no shared border. The gap
      // around the cards is the visual separator. Page bg is darkest;
      // cards are contentSurface with a soft drop shadow.
      className='hidden md:flex flex-col h-full overflow-hidden bg-(--linear-bg-page)'
      style={{
        opacity: open ? 1 : 0,
        transform: open ? 'translateX(0)' : 'translateX(16px)',
        transition: `opacity 220ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* Hero card — elevated, no internal hairline separators. Holds
          artwork, title, status, drop-in-N callout, smart link. */}
      <div className='shrink-0 px-2 pt-2'>
        <div className='rounded-xl bg-(--linear-app-content-surface) shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.22)] overflow-hidden'>
          <DrawerHero
            release={r}
            onClose={onClose}
            onPlay={onPlay}
            onMenu={onMenu ? e => onMenu(e, r) : undefined}
            onEntityActivate={onEntityActivate}
          />
        </div>
      </div>

      {/* Detail card — elevated peer. Pill tabs + tab content. Same
          shadow stack as the hero so the two read as siblings of the
          page floor, not of each other. */}
      <div className='flex-1 min-h-0 px-2 pt-2 pb-2 flex flex-col'>
        <div className='flex-1 min-h-0 rounded-xl bg-(--linear-app-content-surface) shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.22)] flex flex-col overflow-hidden'>
          <DrawerTabStrip
            tabs={tabs.map(t => ({ value: t, label: TAB_LABEL[t] }))}
            active={tab}
            onChange={setTab}
          />
          <div className='flex-1 min-h-0 overflow-y-auto'>
            {tab === 'overview' && <DrawerOverviewTab release={r} />}
            {tab === 'distribution' && <DrawerDistribution release={r} />}
            {tab === 'lyrics' && (
              <LyricsList lines={MOCK_DRAWER_LYRICS} onEdit={() => undefined} />
            )}
            {tab === 'cues' && (
              <CuesPanel
                cues={r.cues}
                durationSec={r.durationSec}
                onSeek={onSeek ? sec => onSeek(r.id, sec) : undefined}
              />
            )}
            {tab === 'activity' && (
              <DrawerActivityTab release={r} onOpenTasks={onOpenTasks} />
            )}
            {tab === 'details' && <DrawerDetailsTab release={r} />}
          </div>
        </div>
      </div>
    </aside>
  );
}

function DrawerHero({
  release,
  onPlay,
  onMenu,
  onEntityActivate,
}: {
  release: Release;
  onClose: () => void;
  onPlay?: (id: string) => void;
  onMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onEntityActivate?: (entity: EntityPopoverData) => void;
}) {
  const status = statusFromRelease(release);
  const dropMeta = dropDateMeta(release.releaseDate);
  const smartLinkUrl = `jov.ie/${release.artist.toLowerCase().replace(/\s+/g, '-')}/${release.id}`;
  return (
    <ProductionDrawerHero
      title={release.title}
      subtitle={
        <>
          <EntityHoverLink
            entity={lookupArtistEntity(release.artist)}
            onActivate={onEntityActivate}
            className='decoration-dotted'
          >
            {release.artist}
          </EntityHoverLink>
          <span className='mx-1 text-quaternary-token'>·</span>
          <EntityHoverLink
            entity={lookupReleaseEntityByAlbum(release.album, release.id)}
            onActivate={onEntityActivate}
            className='decoration-dotted'
          >
            {release.album}
          </EntityHoverLink>
        </>
      }
      artwork={
        <ArtworkThumb src={release.artwork} title={release.title} size={88} />
      }
      statusBadge={<StatusBadge status={status} />}
      meta={
        <>
          <TypeBadge label={release.type} />
          <DropDateChip tone={dropMeta.tone} label={dropMeta.label} />
        </>
      }
      trailing={<SmartLinkRow url={smartLinkUrl} />}
      onPlay={onPlay ? () => onPlay(release.id) : undefined}
      playLabel={`Play ${release.title}`}
      onMenu={onMenu}
    />
  );
}

// Cross-fade between the rest icon and a confirmation glyph. Uses
// monochrome white at high opacity for the confirm state — the cyan
// accent was too attention-seeking for an action you fire constantly.
// Overview tab — clean stats triad + compact performance + drop date.
// No carded sections; sub-areas are separated by a hairline only.
function DrawerOverviewTab({ release }: { release: Release }) {
  const pointsByRange = useMemo(() => {
    const out: Partial<Record<PerformanceRangeKey, readonly number[]>> = {};
    for (const r of RANGES) {
      out[r.key] = generatePerfPoints(
        release.waveformSeed,
        release.weeklyStreams,
        r.days
      );
    }
    return out;
  }, [release.waveformSeed, release.weeklyStreams]);
  const trend: SparklineTrend =
    release.weeklyDelta > 0 ? 'up' : release.weeklyDelta < 0 ? 'down' : 'flat';
  return (
    <div className='px-3 py-3 space-y-4'>
      <div className='grid grid-cols-3 gap-3'>
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
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={pointsByRange}
        trend={trend}
        delta={release.weeklyDelta}
        initialRange='7d'
      />
    </div>
  );
}

// Lyrics tab — tracks-only. Mock content for the design pass; production
// pulls from the lyrics service. Shows the lyric text with cue-aligned
// timestamps; clicking a line will seek (wired the same as Cues).
const MOCK_DRAWER_LYRICS: readonly { at: number; text: string }[] = [
  { at: 6, text: 'Walking through the static of a city that forgets' },
  { at: 14, text: 'Every name it whispered, every promise that it kept' },
  { at: 26, text: 'I was lost in the light' },
  { at: 30, text: 'Found a quiet in the noise' },
  { at: 38, text: 'Something steady in the wreckage of the choice' },
  { at: 52, text: 'Lost in the light, lost in the light' },
  { at: 62, text: 'Holding on tight, holding on tight' },
  { at: 73, text: 'You said the world is what you build it' },
  { at: 81, text: 'I said the world is what you let go' },
  { at: 88, text: 'Both of us were right' },
];

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'YTD';
const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'YTD', label: 'YTD', days: 120 },
];

function generatePerfPoints(
  seed: number,
  target: number,
  days: number
): number[] {
  // Per-day click count series. Deterministic noise around a smoothed
  // ramp toward `target`, anchored at ~target on the last day.
  const points: number[] = [];
  const base = Math.max(target * 0.18, 1);
  let v = base * 0.6;
  for (let i = 0; i < days; i++) {
    const noise = ((seed * (i + 7) * 9301 + 49297) % 233280) / 233280;
    v = v + (noise - 0.5) * base * 0.4 + base * 0.01;
    points.push(Math.max(0, Math.round(v)));
  }
  points[points.length - 1] = Math.round(base * (1 + (seed % 5) * 0.05));
  return points;
}

// 27 providers Jovie pulls from via music-fetch — covers streaming,
// stores, social/embed sources, and a few regional majors. The drawer's
// Distribution tab surfaces all of them so it's clear we can handle a
// real-world (long, messy) catalog distribution.
type ProviderGroup = 'streaming' | 'social' | 'store' | 'discovery';
type Provider = {
  id: string;
  label: string;
  group: ProviderGroup;
  initial: string;
  hue: number; // hsl hue for the avatar bg
};
const PROVIDERS: Provider[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    group: 'streaming',
    initial: 'S',
    hue: 144,
  },
  {
    id: 'apple',
    label: 'Apple Music',
    group: 'streaming',
    initial: 'A',
    hue: 350,
  },
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    group: 'streaming',
    initial: 'Y',
    hue: 0,
  },
  { id: 'tidal', label: 'Tidal', group: 'streaming', initial: 'T', hue: 200 },
  {
    id: 'amazon',
    label: 'Amazon Music',
    group: 'streaming',
    initial: 'Z',
    hue: 195,
  },
  { id: 'deezer', label: 'Deezer', group: 'streaming', initial: 'D', hue: 270 },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    group: 'streaming',
    initial: 'S',
    hue: 22,
  },
  {
    id: 'pandora',
    label: 'Pandora',
    group: 'streaming',
    initial: 'P',
    hue: 220,
  },
  {
    id: 'audiomack',
    label: 'Audiomack',
    group: 'streaming',
    initial: 'A',
    hue: 40,
  },
  {
    id: 'anghami',
    label: 'Anghami',
    group: 'streaming',
    initial: 'A',
    hue: 290,
  },
  {
    id: 'jiosaavn',
    label: 'JioSaavn',
    group: 'streaming',
    initial: 'J',
    hue: 28,
  },
  { id: 'kkbox', label: 'KKBox', group: 'streaming', initial: 'K', hue: 195 },
  {
    id: 'netease',
    label: 'NetEase Cloud Music',
    group: 'streaming',
    initial: 'N',
    hue: 0,
  },
  {
    id: 'qq-music',
    label: 'QQ Music',
    group: 'streaming',
    initial: 'Q',
    hue: 130,
  },
  {
    id: 'boomplay',
    label: 'Boomplay',
    group: 'streaming',
    initial: 'B',
    hue: 16,
  },
  {
    id: 'yandex',
    label: 'Yandex Music',
    group: 'streaming',
    initial: 'Y',
    hue: 0,
  },
  {
    id: 'iheart',
    label: 'iHeartRadio',
    group: 'discovery',
    initial: 'I',
    hue: 330,
  },
  { id: 'tiktok', label: 'TikTok', group: 'social', initial: 'T', hue: 350 },
  {
    id: 'meta',
    label: 'Instagram / Facebook',
    group: 'social',
    initial: 'M',
    hue: 280,
  },
  { id: 'youtube', label: 'YouTube', group: 'social', initial: 'Y', hue: 0 },
  { id: 'bandcamp', label: 'Bandcamp', group: 'store', initial: 'B', hue: 200 },
  { id: 'beatport', label: 'Beatport', group: 'store', initial: 'B', hue: 90 },
  {
    id: 'traxsource',
    label: 'Traxsource',
    group: 'store',
    initial: 'T',
    hue: 30,
  },
  {
    id: 'beatsource',
    label: 'Beatsource',
    group: 'store',
    initial: 'B',
    hue: 50,
  },
  { id: 'medianet', label: 'MediaNet', group: 'store', initial: 'M', hue: 215 },
  { id: '7digital', label: '7Digital', group: 'store', initial: '7', hue: 240 },
  { id: 'napster', label: 'Napster', group: 'store', initial: 'N', hue: 195 },
];
const PROVIDER_GROUP_LABEL: Record<ProviderGroup, string> = {
  streaming: 'Streaming',
  social: 'Social',
  store: 'Stores',
  discovery: 'Discovery',
};
// Hash the release id + provider id into a deterministic status so each
// release has a different distribution shape across providers.
function providerStatus(releaseId: string, providerId: string): DspStatus {
  let hash = 0;
  const seed = `${releaseId}::${providerId}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const bucket = Math.abs(hash) % 100;
  if (bucket < 64) return 'live';
  if (bucket < 78) return 'pending';
  if (bucket < 86) return 'error';
  return 'missing';
}

function DrawerDistribution({ release }: { release: Release }) {
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = PROVIDERS.map(p => ({
      ...p,
      status: providerStatus(release.id, p.id),
    }));
    return q
      ? all.filter(
          p => p.label.toLowerCase().includes(q) || p.group.includes(q)
        )
      : all;
  }, [filter, release.id]);
  const liveCount = rows.filter(r => r.status === 'live').length;
  const grouped: Record<ProviderGroup, typeof rows> = {
    streaming: [],
    social: [],
    store: [],
    discovery: [],
  };
  for (const r of rows) grouped[r.group].push(r);

  return (
    <div className='px-4 py-4'>
      <div className='flex items-center justify-between pb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          Providers
        </p>
        <span className='text-[10.5px] tabular-nums text-tertiary-token'>
          {liveCount}/{rows.length} live
        </span>
      </div>

      {/* Search — matches the smart-link pill language. */}
      <div className='flex items-center gap-1.5 h-7 pl-3 pr-2 rounded-full border border-(--linear-app-shell-border) bg-(--surface-0)/60 text-[11.5px] mb-2 focus-within:border-cyan-300/40'>
        <Search className='h-3 w-3 text-quaternary-token shrink-0' />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder='Filter providers'
          className='flex-1 bg-transparent outline-none placeholder:text-quaternary-token text-secondary-token'
        />
        {filter && (
          <button
            type='button'
            onClick={() => setFilter('')}
            className='inline-flex items-center justify-center h-4 w-4 rounded text-quaternary-token hover:text-primary-token'
            aria-label='Clear filter'
          >
            <X className='h-3 w-3' strokeWidth={2.25} />
          </button>
        )}
      </div>

      {(Object.keys(grouped) as ProviderGroup[]).map(group =>
        grouped[group].length > 0 ? (
          <div key={group} className='mb-3 last:mb-0'>
            <p className='text-[9.5px] uppercase tracking-[0.10em] text-quaternary-token/85 font-medium px-2 pt-1.5 pb-0.5'>
              {PROVIDER_GROUP_LABEL[group]}
            </p>
            <ul className='flex flex-col -mx-2'>
              {grouped[group].map(p => (
                <li key={p.id}>
                  <button
                    type='button'
                    className='w-full flex items-center gap-2.5 h-7 px-2 rounded-md text-[12px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token transition-colors duration-150 ease-out'
                  >
                    <span
                      className='h-[16px] w-[16px] rounded grid place-items-center text-[8.5px] font-semibold text-white shrink-0'
                      style={{
                        background:
                          p.status === 'missing'
                            ? 'rgba(255,255,255,0.08)'
                            : `hsl(${p.hue}, 55%, 38%)`,
                        opacity: p.status === 'missing' ? 0.55 : 1,
                      }}
                    >
                      {p.initial}
                    </span>
                    <span className='flex-1 text-left truncate'>{p.label}</span>
                    <span className='inline-flex items-center gap-1.5'>
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          DSP_STATUS_DOT[p.status]
                        )}
                      />
                      <span className='text-[10px] uppercase tracking-[0.06em] text-quaternary-token w-[44px] text-right'>
                        {p.status}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}

      {rows.length === 0 && (
        <p className='text-[12px] text-quaternary-token text-center py-6'>
          No providers match &ldquo;{filter}&rdquo;.
        </p>
      )}
    </div>
  );
}

// Activity tab — flat hover rows, no per-item carding. Each row is a
// chevron-led link into the related thread / task / pitch surface.
function DrawerActivityTab({
  release,
  onOpenTasks,
}: {
  release: Release;
  onOpenTasks?: () => void;
}) {
  return (
    <div className='px-3 py-3'>
      <div className='flex flex-col -mx-1'>
        {release.tasksOpen > 0 && (
          <ActivityHoverRow
            icon={Activity}
            label={`${release.tasksOpen} open task${release.tasksOpen === 1 ? '' : 's'}`}
            meta='Tap to open in Tasks'
            onClick={onOpenTasks}
          />
        )}
        {release.agent !== 'idle' && (
          <ActivityHoverRow
            icon={Sparkles}
            iconAccent
            label={`Jovie · ${agentLabel(release.agent)}`}
            meta='Running'
            running
          />
        )}
        <ActivityHoverRow
          icon={Sparkles}
          iconAccent={release.pitchReady}
          label={
            release.pitchReady ? 'Editorial pitch ready' : 'Pitch not ready yet'
          }
          meta={release.pitchReady ? 'Send' : 'Build'}
        />
        <ActivityHoverRow icon={LinkIcon} label='Smart link' meta='Copy' />
        <ActivityHoverRow icon={Copy} label='Duplicate release' meta='⌘D' />
        <ActivityHoverRow
          icon={ExternalLink}
          label='Open public page'
          meta='Open'
        />
        <ActivityHoverRow
          icon={Archive}
          label='Archive release'
          meta=''
          danger
        />
      </div>
    </div>
  );
}

// Details tab — heavy metadata pane. Power users live here when they
// need to edit. Uses a calm dl/dt/dd layout with inline-edit hover hint.
// Hover row → cursor:pointer + pencil icon. Click or double-click → edit
// inline (mock for the design pass; production would persist).
function DrawerDetailsTab({ release }: { release: Release }) {
  const rows: Array<{ label: string; value: string; readOnly?: boolean }> = [
    { label: 'Title', value: release.title },
    { label: 'Artist', value: release.artist },
    { label: 'Album', value: release.album },
    { label: 'Type', value: release.type },
    {
      label: 'Release date',
      value: new Date(release.releaseDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    },
    { label: 'Version', value: release.version || '—' },
    { label: 'BPM', value: String(release.bpm) },
    { label: 'Key', value: release.key },
    {
      label: 'Length',
      value: `${Math.floor(release.durationSec / 60)}:${String(
        release.durationSec % 60
      ).padStart(2, '0')}`,
      readOnly: true,
    },
    { label: 'ID', value: release.id, readOnly: true },
  ];
  return (
    <div className='px-4 py-4'>
      <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold mb-2'>
        Metadata
      </p>
      <dl className='flex flex-col -mx-2'>
        {rows.map(row => (
          <InlineEditRow
            key={row.label}
            label={row.label}
            value={row.value}
            onCommit={row.readOnly ? undefined : () => undefined}
          />
        ))}
      </dl>
    </div>
  );
}

// Map the release's overall state to a TrackStatus for the badge. Real
// implementation would derive this from a release-level enum, but the
// drawer needs *something* visible today — this matches the data we have.
function statusFromRelease(release: Release): TrackStatus {
  const allLive = (Object.keys(release.dsps) as DspKey[]).every(
    d => release.dsps[d] === 'live'
  );
  if (allLive) return 'live';
  const anyPending = (Object.keys(release.dsps) as DspKey[]).some(
    d => release.dsps[d] === 'pending'
  );
  if (anyPending) return 'scheduled';
  return 'announced';
}

// ---------------------------------------------------------------------------
// Tracks — Lexicon-style table. Denser, alternating rows, table headers,
// inline mini-waveform, BPM/Key (with Camelot toggle), Rating, Energy,
// status icons, and click-to-filter on artist + title.
// ---------------------------------------------------------------------------

type SortField =
  | 'index'
  | 'title'
  | 'artist'
  | 'bpm'
  | 'key'
  | 'energy'
  | 'rating';

function TracksView({
  tracks,
  pills,
  playingId,
  isPlaying,
  currentTimeSec,
  keyMode,
  onKeyModeToggle,
  onPlay,
  onSeek,
  onFilter,
  onContextMenu,
  onOpenThread,
}: {
  tracks: Track[];
  pills: FilterPill[];
  playingId: string;
  isPlaying: boolean;
  currentTimeSec: number;
  keyMode: 'normal' | 'camelot';
  onKeyModeToggle: () => void;
  onPlay: (id: string) => void;
  onSeek: (id: string, sec: number) => void;
  onFilter: (field: 'artist' | 'title' | 'album', value: string) => void;
  onContextMenu?: (e: React.MouseEvent, track: Track) => void;
  onOpenThread?: (id: string) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('index');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(field: SortField) {
    if (field === sortBy) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  }

  // Filter rows live from pill state. Pills compose with implicit AND;
  // values inside a pill compose with implicit OR.
  const filtered = useMemo(() => {
    if (pills.length === 0) return tracks;
    return tracks.filter(t =>
      pills.every(p => {
        const matches = p.values.some(v => trackMatchesPill(t, p.field, v));
        return p.op === 'is' ? matches : !matches;
      })
    );
  }, [tracks, pills]);

  const sorted = useMemo(() => {
    if (sortBy === 'index') return filtered;
    const cmp = (a: Track, b: Track): number => {
      const va = sortValue(a, sortBy, keyMode);
      const vb = sortValue(b, sortBy, keyMode);
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb));
    };
    const arr = [...filtered].sort(cmp);
    return sortDir === 'asc' ? arr : arr.reverse();
  }, [filtered, sortBy, sortDir, keyMode]);

  // While the user is keyboard-navigating, suppress competing highlights
  // (the playing-row indicator) so focus is the only visual signal.
  // Mouse movement re-enables them; arrow-key activity restarts the timer.
  const [keyboardNav, setKeyboardNav] = useState(false);
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function bumpKeyboardNav() {
    setKeyboardNav(true);
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(() => setKeyboardNav(false), 1500);
  }
  useEffect(() => {
    function onMouse() {
      if (kbTimer.current) clearTimeout(kbTimer.current);
      setKeyboardNav(false);
    }
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('mousemove', onMouse);
      if (kbTimer.current) clearTimeout(kbTimer.current);
    };
  }, []);

  // Scroll the focused row into view as the user navigates.
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'k') {
      e.preventDefault();
      bumpKeyboardNav();
      setFocusedIndex(i => Math.min(sorted.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'j') {
      e.preventDefault();
      bumpKeyboardNav();
      setFocusedIndex(i => Math.max(0, i - 1));
    } else if (e.code === 'Space') {
      e.preventDefault();
      const t = sorted[focusedIndex];
      if (t) onPlay(t.id);
    }
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: keyboard list root
    <section
      className='flex flex-col h-full focus:outline-none'
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label='Tracks'
    >
      <div className='flex-1 min-h-0 overflow-y-auto px-1'>
        {/* Sticky column header strip — pinned for big libraries. Identity
            for the page lives in the breadcrumb; the row count + key-mode
            toggle ride along on the same line as the column labels. Pinned
            to top:0 with an opaque (not /95) background so rows can't peek
            through above it during scroll. */}
        <div className='sticky top-0 z-10 bg-(--linear-app-content-surface) px-2 pt-3 pb-1.5 flex items-center gap-3 select-none border-b border-(--linear-app-shell-border)/50'>
          <ColumnLabel
            field='index'
            label='#'
            width='w-5'
            align='right'
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
            defaultField='index'
          />
          <span className='w-7 shrink-0' />
          <ColumnLabel
            field='title'
            label='Title'
            flex
            align='left'
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
            defaultField='index'
          />
          <ColumnLabel
            field='bpm'
            label='BPM'
            width='w-[44px]'
            align='right'
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
            defaultField='index'
          />
          <button
            type='button'
            onClick={onKeyModeToggle}
            className='w-[58px] shrink-0 inline-flex items-center justify-end gap-1 text-[9.5px] uppercase tracking-[0.12em] font-medium text-quaternary-token/85 hover:text-secondary-token transition-colors duration-150 ease-out'
            title={`Switch to ${keyMode === 'normal' ? 'Camelot' : 'standard'} key notation`}
          >
            {keyMode === 'normal' ? 'Key' : 'Cam'}
          </button>
          <span className='w-[176px] shrink-0 text-left text-[9.5px] uppercase tracking-[0.12em] font-medium text-quaternary-token/85'>
            Waveform
          </span>
          <span className='w-[64px] shrink-0 text-right text-[9.5px] uppercase tracking-[0.12em] font-medium text-quaternary-token/85'>
            Status
          </span>
          <span className='w-10 shrink-0 text-right text-[10px] tabular-nums text-quaternary-token/70'>
            {sorted.length}
          </span>
        </div>

        <ul className='space-y-px pb-3 pt-1'>
          {sorted.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i + 1}
              isPlaying={t.id === playingId && isPlaying}
              isCurrentTrack={t.id === playingId}
              isFocused={i === focusedIndex}
              muteHighlight={keyboardNav && i !== focusedIndex}
              kbActive={keyboardNav}
              rowRef={el => {
                rowRefs.current[i] = el;
              }}
              currentTimeSec={t.id === playingId ? currentTimeSec : 0}
              keyMode={keyMode}
              onSelect={() => setFocusedIndex(i)}
              onPlay={() => {
                setFocusedIndex(i);
                onPlay(t.id);
              }}
              onSeek={sec => {
                setFocusedIndex(i);
                onSeek(t.id, sec);
              }}
              onFilter={onFilter}
              onContextMenu={onContextMenu}
              onOpenThread={onOpenThread}
            />
          ))}
          {sorted.length === 0 && (
            <li className='px-3 py-8 text-center text-[12px] text-tertiary-token'>
              No tracks match your filters.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function TrackRow({
  track,
  index,
  isPlaying,
  isCurrentTrack,
  isFocused,
  muteHighlight,
  kbActive,
  rowRef,
  currentTimeSec,
  keyMode,
  onSelect,
  onPlay,
  onSeek,
  onFilter,
  onContextMenu,
  onOpenThread,
}: {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  isFocused: boolean;
  muteHighlight: boolean;
  kbActive?: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
  currentTimeSec: number;
  keyMode: 'normal' | 'camelot';
  onSelect: () => void;
  onPlay: () => void;
  onSeek: (sec: number) => void;
  onFilter: (field: 'artist' | 'title' | 'album', value: string) => void;
  onContextMenu?: (e: React.MouseEvent, track: Track) => void;
  onOpenThread?: (id: string) => void;
}) {
  // While the user is keyboard-navigating other rows, mute the now-playing
  // signals here so focus is the only competing visual.
  const showPlayingBars = isPlaying && !muteHighlight;
  const runningThread = findRunningThreadFor('track', track.id, THREADS);
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: parent section delegates ↑/↓/Space; row click is a focus convenience
    // biome-ignore lint/a11y/useKeyWithClickEvents: same
    <li
      ref={rowRef}
      onClick={onSelect}
      onContextMenu={e => onContextMenu?.(e, track)}
      data-focused={isFocused || undefined}
      className={cn(
        'group/row relative flex items-center gap-3 h-[44px] pl-2 pr-3 rounded-md cursor-pointer transition-colors duration-150 ease-out focus:outline-none',
        !isFocused && !kbActive && 'hover:bg-surface-1/40',
        SELECTED_ROW_CLASSES
      )}
    >
      {/* # / Play */}
      <div className='relative w-5 shrink-0 grid place-items-center'>
        <span
          className={cn(
            'text-[11px] tabular-nums text-quaternary-token transition-opacity duration-150 ease-out',
            showPlayingBars && 'opacity-0',
            !isCurrentTrack && 'group-hover/row:opacity-0'
          )}
        >
          {index}
        </span>
        {showPlayingBars && <PlayingBars />}
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onPlay();
          }}
          className={cn(
            'absolute inset-0 grid place-items-center text-primary-token transition-opacity duration-150 ease-out',
            isCurrentTrack
              ? 'opacity-0'
              : 'opacity-0 group-hover/row:opacity-100'
          )}
          aria-label={
            isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
          }
        >
          {isPlaying ? (
            <Pause className='h-3 w-3' fill='currentColor' strokeWidth={2.5} />
          ) : (
            <Play
              className='h-3 w-3 translate-x-px'
              fill='currentColor'
              strokeWidth={2.5}
            />
          )}
        </button>
      </div>

      {/* Artwork — small cropped sliver with clean fallback. */}
      <ArtworkThumb src={track.artwork} title={track.title} size={28} />

      {/* Title (with feat. subtitle for collabs). We're inside an artist
          context (Bahamas / Dashboard breadcrumb), so the primary artist
          is implicit — only collaborators surface here. */}
      <div className='flex-1 min-w-0'>
        <div className='flex items-baseline gap-2 min-w-0'>
          <span className='truncate text-[13px] font-caption text-primary-token tracking-[-0.012em]'>
            {track.title}
          </span>
          {track.artist.includes(' & ') && (
            <span className='truncate text-[11px] text-tertiary-token'>
              feat. {track.artist.split(' & ').slice(1).join(' & ')}
            </span>
          )}
        </div>
      </div>

      {/* BPM — heavier weight, monochrome, right-aligned */}
      <span className='w-[44px] shrink-0 text-right text-[12.5px] tabular-nums font-semibold text-secondary-token tracking-[-0.01em]'>
        {track.bpm}
      </span>

      {/* Key as a badge — quiet pill */}
      <span className='w-[58px] shrink-0 flex justify-end'>
        <span className='inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-caption tabular-nums text-secondary-token border border-(--linear-app-shell-border) bg-surface-1/40'>
          {keyMode === 'normal' ? track.keyNormal : track.keyCamelot}
        </span>
      </span>

      {/* Mini waveform — fades to ~16% opacity for inactive rows so the
          playing/selected row's waveform pops by contrast. */}
      <div
        className={cn(
          'w-[176px] shrink-0 transition-opacity duration-150 ease-out',
          isCurrentTrack || isFocused
            ? 'opacity-100'
            : 'opacity-60 group-hover/row:opacity-90'
        )}
      >
        <RowWaveform
          track={{
            id: track.id,
            durationSec: track.durationSec,
            waveformSeed: track.waveformSeed,
            cues: track.cues,
            title: track.title,
          }}
          currentTimeSec={currentTimeSec}
          isCurrentTrack={isCurrentTrack}
          onSeek={onSeek}
        />
      </div>

      {/* Status as a labeled chip — Live / Queued / Draft. */}
      <div className='w-[64px] shrink-0 flex justify-end'>
        <StatusBadge status={track.status} />
      </div>

      {/* Spacer / thread glyph column — aligns with header's count cell */}
      <div className='w-10 shrink-0 flex justify-end'>
        {runningThread && onOpenThread && (
          <EntityThreadGlyph
            threadTitle={runningThread.title}
            onOpen={() => onOpenThread(runningThread.id)}
          />
        )}
      </div>
    </li>
  );
}

// Replaces the cryptic icon cluster with a single labeled chip. Has-video
// / has-canvas indicators move into the detail panel where the user has
// the room (and intent) to read them.
//
// All chips share the same surface + border so the visual differentiation
// comes from the leading dot — calm and theme-matching. "Live" is the
// default state and shouldn't shout; saturated tones are reserved for
// states that genuinely need attention (Scheduled, Announced).
function trackMatchesPill(
  t: Track,
  field: FilterField,
  value: string
): boolean {
  const v = value.toLowerCase();
  switch (field) {
    case 'artist':
      return t.artist.toLowerCase().includes(v);
    case 'title':
      return t.title.toLowerCase().includes(v);
    case 'album':
      return t.album.toLowerCase().includes(v);
    case 'status':
      return t.status === value;
    case 'has':
      return value === 'video'
        ? t.hasVideo
        : value === 'canvas'
          ? t.hasCanvas
          : false;
  }
}

function sortValue(
  t: Track,
  field: SortField,
  keyMode: 'normal' | 'camelot'
): string | number {
  switch (field) {
    case 'index':
      return 0;
    case 'title':
      return t.title.toLowerCase();
    case 'artist':
      return t.artist.toLowerCase();
    case 'bpm':
      return t.bpm;
    case 'key':
      return keyMode === 'normal' ? t.keyNormal : t.keyCamelot;
    case 'energy':
      return t.energy;
    case 'rating':
      return t.rating;
  }
}

// ---------------------------------------------------------------------------
// Tasks — Linear-inspired split-pane: list on the left, detail on the right.
// Single-pane on narrower viewports; we keep the design at lg+ as the
// primary experience.
// ---------------------------------------------------------------------------

function TasksView({
  tasks,
  onContextMenu,
  onOpenRelease,
  onOpenThread,
}: {
  tasks: Task[];
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  onOpenRelease?: (id: string) => void;
  onOpenThread?: (id: string) => void;
}) {
  // No default selection — the user lands on the calm list, gets a
  // wide read of the queue, and dives in by clicking. j/k still
  // navigates focus, but Enter is what commits a row to "selected"
  // and reveals the detail pane.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const selected = selectedId ? tasks.find(t => t.id === selectedId) : null;
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  // Suppress mouse-hover styles while keyboard nav is active (resumes
  // on next mousemove). Same pattern as Releases/Tracks lists.
  const [keyboardNav, setKeyboardNav] = useState(false);
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function bumpKeyboardNav() {
    setKeyboardNav(true);
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(() => setKeyboardNav(false), 1500);
  }
  useEffect(() => {
    function onMouse() {
      if (kbTimer.current) clearTimeout(kbTimer.current);
      setKeyboardNav(false);
    }
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('mousemove', onMouse);
      if (kbTimer.current) clearTimeout(kbTimer.current);
    };
  }, []);

  // Scroll focused row into view as the user navigates.
  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'k') {
      e.preventDefault();
      bumpKeyboardNav();
      const next = Math.min(tasks.length - 1, focusedIndex + 1);
      setFocusedIndex(next);
    } else if (e.key === 'ArrowUp' || e.key === 'j') {
      e.preventDefault();
      bumpKeyboardNav();
      const next = Math.max(0, focusedIndex - 1);
      setFocusedIndex(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = tasks[focusedIndex];
      if (t) setSelectedId(t.id);
    } else if (e.key === 'Escape' && selectedId) {
      e.preventDefault();
      setSelectedId(null);
    }
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: list root delegates ↑/↓
    <section
      className='flex h-full focus:outline-none'
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label='Tasks'
    >
      {/* List pane */}
      <div className='w-[380px] shrink-0 flex flex-col border-r border-(--linear-app-shell-border)/60 min-h-0'>
        <div className='shrink-0 px-3 pt-3 pb-2 flex items-center gap-2'>
          <span className='text-[12.5px] font-caption text-primary-token tracking-[-0.012em]'>
            All
          </span>
          <span className='text-[11px] tabular-nums text-quaternary-token'>
            {tasks.length}
          </span>
          <button
            type='button'
            className='ml-auto h-6 px-2 rounded-md text-[10.5px] uppercase tracking-[0.08em] text-tertiary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
          >
            Filter
          </button>
        </div>
        <ul className='flex-1 min-h-0 overflow-y-auto pb-3 px-1'>
          {tasks.map((t, i) => (
            <TaskListItem
              key={t.id}
              task={t}
              isSelected={t.id === selectedId}
              isFocused={i === focusedIndex}
              kbActive={keyboardNav}
              rowRef={el => {
                rowRefs.current[i] = el;
              }}
              onSelect={() => {
                setFocusedIndex(i);
                setSelectedId(t.id);
              }}
              onContextMenu={onContextMenu}
              onOpenRelease={onOpenRelease}
              onOpenThread={onOpenThread}
            />
          ))}
        </ul>
      </div>

      {/* Detail pane — empty until the user picks a task. Calm
          read-then-dive pattern so the queue isn't ambushing them
          with a default open pane the moment they land here. */}
      <div className='flex-1 min-w-0 overflow-y-auto'>
        {selected ? (
          <TaskDetail task={selected} onOpenRelease={onOpenRelease} />
        ) : (
          <div className='h-full grid place-items-center px-8'>
            <div className='text-center max-w-sm'>
              <p className='text-[13px] text-tertiary-token leading-relaxed'>
                Pick a task from the list to see what it needs.
              </p>
              <p className='text-[11.5px] text-quaternary-token mt-2'>
                <kbd className='inline-flex items-center h-4 px-1 rounded text-[10px] bg-(--surface-1)/60 border border-(--linear-app-shell-border) tabular-nums mr-1'>
                  ↵
                </kbd>
                to open ·
                <kbd className='inline-flex items-center h-4 px-1 rounded text-[10px] bg-(--surface-1)/60 border border-(--linear-app-shell-border) tabular-nums mx-1'>
                  j
                </kbd>
                <kbd className='inline-flex items-center h-4 px-1 rounded text-[10px] bg-(--surface-1)/60 border border-(--linear-app-shell-border) tabular-nums mr-1'>
                  k
                </kbd>
                to navigate ·
                <kbd className='inline-flex items-center h-4 px-1 rounded text-[10px] bg-(--surface-1)/60 border border-(--linear-app-shell-border) tabular-nums ml-1'>
                  esc
                </kbd>{' '}
                to close
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TaskListItem({
  task,
  isSelected,
  isFocused,
  kbActive,
  rowRef,
  onSelect,
  onContextMenu,
  onOpenRelease,
  onOpenThread,
}: {
  task: Task;
  isSelected: boolean;
  isFocused: boolean;
  kbActive?: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  onOpenRelease?: (id: string) => void;
  onOpenThread?: (id: string) => void;
}) {
  const runningThread = findRunningThreadFor('task', task.id, THREADS);
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: parent section delegates ↑/↓
    // biome-ignore lint/a11y/useKeyWithClickEvents: same
    <li
      ref={rowRef}
      onClick={onSelect}
      onContextMenu={e => onContextMenu?.(e, task)}
      data-focused={isFocused || isSelected || undefined}
      className={cn(
        'group/row relative flex items-start gap-3 py-2 pl-2 pr-3 rounded-md cursor-pointer transition-colors duration-150 ease-out',
        !isFocused && !isSelected && !kbActive && 'hover:bg-surface-1/40',
        SELECTED_ROW_CLASSES
      )}
    >
      <div className='shrink-0 pt-0.5'>
        <TaskStatusIcon
          status={task.status}
          agentRunning={
            task.assignee === 'jovie' && task.status === 'in_progress'
          }
        />
      </div>
      <div className='flex-1 min-w-0 flex flex-col gap-1'>
        {/* Title — full width, no right-side icons stealing space. */}
        <span
          className={cn(
            'truncate text-[12.5px] font-caption tracking-[-0.012em]',
            task.status === 'done' || task.status === 'cancelled'
              ? 'text-tertiary-token line-through decoration-quaternary-token/50'
              : 'text-primary-token'
          )}
        >
          {onOpenRelease
            ? renderWithEntities(task.title, RELEASES, onOpenRelease)
            : task.title}
        </span>
        {/* Meta row — due date + label pills on the left, priority +
            assignee on the right. Equal vertical position across
            every task so columns feel anchored. */}
        <div className='flex items-center gap-2 min-w-0'>
          {task.dueIso && (
            <DueChip dueIso={task.dueIso} muted={task.status === 'done'} />
          )}
          {task.labels.length > 0 && <LabelPills labels={task.labels} />}
          <span className='ml-auto inline-flex items-center gap-2 shrink-0'>
            {runningThread && onOpenThread && (
              <EntityThreadGlyph
                threadTitle={runningThread.title}
                onOpen={() => onOpenThread(runningThread.id)}
              />
            )}
            <PriorityGlyph priority={task.priority} />
            <AssigneeChip
              kind={task.assignee === 'jovie' ? 'jovie' : 'human'}
              name={task.assignee === 'you' ? 'You' : undefined}
            />
            <TaskRowMoreMenu task={task} />
          </span>
        </div>
      </div>
    </li>
  );
}

// Per-row "More" menu — click trigger opens a ShellDropdown with Assign /
// Link / Status. The "Assign to…" submenu is the canonical EntityItem demo:
// hover Tim White -> teammate entity popover anchors to the row.
function TaskRowMoreMenu({ task }: { task: Task }) {
  void task;
  const onEntityActivate = useEntityActivate();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper exists to stop click/keydown bubbling so the menu trigger doesn't also trigger row-select; not itself an interactive element.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — handlers are pass-through-blockers, not new interactions.
    <div
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <ShellDropdown
        align='end'
        side='bottom'
        sideOffset={6}
        width={208}
        onEntityActivate={onEntityActivate}
        trigger={
          <button
            type='button'
            aria-label='Task actions'
            className={cn(
              'h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-150 ease-out',
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-primary-token'
            )}
          >
            <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
          </button>
        }
      >
        <ShellDropdown.Sub>
          <ShellDropdown.SubTrigger icon={UserPlus} label='Assign to…' />
          <ShellDropdown.SubContent
            searchable
            searchPlaceholder='Filter people…'
          >
            {ENTITY_TEAMMATES.map(t => (
              <ShellDropdown.EntityItem key={t.id} entity={t} />
            ))}
          </ShellDropdown.SubContent>
        </ShellDropdown.Sub>
        <ShellDropdown.Sub>
          <ShellDropdown.SubTrigger icon={LinkIcon} label='Link to…' />
          <ShellDropdown.SubContent
            searchable
            searchPlaceholder='Filter entities…'
          >
            <ShellDropdown.Label>Releases</ShellDropdown.Label>
            {ENTITY_RELEASES.slice(0, 4).map(r => (
              <ShellDropdown.EntityItem key={r.id} entity={r} />
            ))}
            <ShellDropdown.Separator />
            <ShellDropdown.Label>Events</ShellDropdown.Label>
            {ENTITY_EVENTS.map(ev => (
              <ShellDropdown.EntityItem key={ev.id} entity={ev} />
            ))}
            <ShellDropdown.Separator />
            <ShellDropdown.Label>Tracks</ShellDropdown.Label>
            {ENTITY_TRACKS_DEMO.map(t => (
              <ShellDropdown.EntityItem key={t.id} entity={t} />
            ))}
          </ShellDropdown.SubContent>
        </ShellDropdown.Sub>
        <ShellDropdown.Separator />
        <ShellDropdown.Item icon={Pin} label='Pin task' />
        <ShellDropdown.Item icon={Copy} label='Copy task ID' shortcut='⌘⇧.' />
        <ShellDropdown.Item icon={LinkIcon} label='Copy link' shortcut='⌘L' />
        <ShellDropdown.Separator />
        <ShellDropdown.Item icon={Archive} label='Archive' />
        <ShellDropdown.Item icon={Trash2} label='Delete' tone='danger' />
      </ShellDropdown>
    </div>
  );
}

function TaskDetail({
  task,
  onOpenRelease,
}: {
  task: Task;
  onOpenRelease?: (id: string) => void;
}) {
  const releaseTitle = task.releaseId
    ? (RELEASES.find(r => r.id === task.releaseId)?.title ?? task.releaseId)
    : null;
  return (
    <article className='max-w-3xl mx-auto px-8 pt-8 pb-12'>
      <h1 className='text-[26px] font-display tracking-[-0.02em] text-primary-token leading-tight'>
        {onOpenRelease
          ? renderWithEntities(task.title, RELEASES, onOpenRelease)
          : task.title}
      </h1>

      {/* Horizontal metadata strip — one calm line of pills under the title. */}
      <div className='mt-4 flex items-center gap-2 flex-wrap'>
        <MetaPill>
          <TaskStatusIcon status={task.status} />
          <span>{statusLabel(task.status)}</span>
        </MetaPill>
        {task.priority !== 'none' && (
          <MetaPill>
            <PriorityGlyph priority={task.priority} />
            <span className='capitalize'>{task.priority}</span>
          </MetaPill>
        )}
        <MetaPill>
          <AssigneeChip
            kind={task.assignee === 'jovie' ? 'jovie' : 'human'}
            name={task.assignee === 'you' ? 'You' : undefined}
            expanded
          />
        </MetaPill>
        {task.dueIso && (
          <MetaPill
            tone={
              isDueSoon(task.dueIso) && task.status !== 'done'
                ? 'amber'
                : 'neutral'
            }
          >
            <span className='tabular-nums'>
              Due{' '}
              {new Date(task.dueIso).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </MetaPill>
        )}
        {releaseTitle && (
          <MetaPill tone='cyan'>
            <span>{releaseTitle}</span>
          </MetaPill>
        )}
        {task.labels.map(l => (
          <MetaPill key={l}>
            <span>{l}</span>
          </MetaPill>
        ))}
      </div>

      {task.description && (
        <p className='mt-6 text-[14px] leading-[1.55] text-secondary-token max-w-prose'>
          {onOpenRelease
            ? renderWithEntities(task.description, RELEASES, onOpenRelease)
            : task.description}
        </p>
      )}

      <div className='mt-8 border-t border-(--linear-app-shell-border)/50 pt-4 text-[11.5px] text-quaternary-token'>
        Updated {relativeDate(task.updatedIso)}
      </div>
    </article>
  );
}

function statusLabel(s: TaskStatus): string {
  switch (s) {
    case 'backlog':
      return 'Backlog';
    case 'todo':
      return 'Todo';
    case 'in_progress':
      return 'In progress';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
  }
}

function isDueSoon(iso: string, now = new Date('2026-04-25')) {
  const d = new Date(iso);
  const days = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days <= 3 && days >= -3;
}

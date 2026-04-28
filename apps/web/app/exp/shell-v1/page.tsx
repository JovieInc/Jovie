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
  ArrowDown,
  ArrowRight,
  ArrowUpDown,
  AudioLines,
  AudioWaveform,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  Circle as CircleIcon,
  CircleSlash,
  Copy,
  Disc3,
  ExternalLink,
  Flag,
  GripVertical,
  Hash,
  Heart,
  Inbox,
  LayoutDashboard,
  Library as LibraryIcon,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Maximize2,
  Mic,
  Mic2,
  Minimize2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Repeat,
  Search,
  Settings,
  Shield,
  Shuffle,
  SkipBack,
  SkipForward,
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
import { ActivityHoverRow } from '@/components/shell/ActivityHoverRow';
import { AgentPulse } from '@/components/shell/AgentPulse';
import { ArtworkPlayOverlay } from '@/components/shell/ArtworkPlayOverlay';
import { AssigneeChip } from '@/components/shell/AssigneeChip';
import { ColumnLabel } from '@/components/shell/ColumnLabel';
import { ContextMenuOverlay } from '@/components/shell/ContextMenuOverlay';
import { CuesPanel } from '@/components/shell/CuesPanel';
import { DictationWaveform } from '@/components/shell/DictationWaveform';
import { DrawerHero as ProductionDrawerHero } from '@/components/shell/DrawerHero';
import { DrawerTabStrip } from '@/components/shell/DrawerTabStrip';
import { DropDateChip } from '@/components/shell/DropDateChip';
import { DueChip } from '@/components/shell/DueChip';
import { EntityHoverLink } from '@/components/shell/EntityPopover';
import { EntityThreadGlyph } from '@/components/shell/EntityThreadGlyph';
import { IconBtn } from '@/components/shell/IconBtn';
import { InlineEditRow } from '@/components/shell/InlineEditRow';
import { LabelPills } from '@/components/shell/LabelPills';
import { LyricsList } from '@/components/shell/LyricsList';
import { MetaPill } from '@/components/shell/MetaPill';
import {
  PerformanceCard,
  type PerformanceRangeKey,
} from '@/components/shell/PerformanceCard';
import { PickerAction } from '@/components/shell/PickerAction';
import { PickerLink } from '@/components/shell/PickerLink';
import { PickerToggle } from '@/components/shell/PickerToggle';
import { PlayingBars } from '@/components/shell/PlayingBars';
import { PriorityGlyph } from '@/components/shell/PriorityGlyph';
import { RowWaveform } from '@/components/shell/RowWaveform';
import { SettingsRow } from '@/components/shell/SettingsRow';
import {
  type EntityPopoverData,
  ShellDropdown,
} from '@/components/shell/ShellDropdown';
import { ShellLoader } from '@/components/shell/ShellLoader';
import { SmartLinkRow } from '@/components/shell/SmartLinkRow';
import type { SparklineTrend } from '@/components/shell/Sparkline';
import { Stat } from '@/components/shell/Stat';
import { StatusBadge } from '@/components/shell/StatusBadge';
import { SuggestionCard } from '@/components/shell/SuggestionCard';
import { ThreadAudioCard } from '@/components/shell/ThreadAudioCard';
import { ThreadCardIconBtn } from '@/components/shell/ThreadCardIconBtn';
import { ThreadImageCard } from '@/components/shell/ThreadImageCard';
import { ThreadTurn } from '@/components/shell/ThreadTurn';
import { ThreadVideoCard } from '@/components/shell/ThreadVideoCard';
import { ThreadView as ShellThreadView } from '@/components/shell/ThreadView';
import { Tooltip } from '@/components/shell/Tooltip';
import { TypeBadge } from '@/components/shell/TypeBadge';
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

// Pill-based filter system (Linear/Notion style). Each pill targets a
// single field with an `is` / `is not` operator and one or more OR-combined
// values. Cross-pill semantics are implicit AND.
type FilterField =
  | 'artist'
  | 'title'
  | 'album'
  | 'status'
  | 'bpm'
  | 'key'
  | 'has';
type FilterPill = {
  id: string;
  field: FilterField;
  op: 'is' | 'is not';
  values: string[];
};

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

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
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
              barCollapsed={barCollapsed}
              onToggleBar={() => setBarCollapsed(v => !v)}
              track={currentTrack}
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
                  <DemoContent />
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
            variant={variant}
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(p => !p)}
            onCollapse={() => setBarCollapsed(true)}
            pct={pct}
            loopMode={loopMode}
            onCycleLoop={() =>
              setLoopMode(m =>
                m === 'off' ? 'track' : m === 'track' ? 'section' : 'off'
              )
            }
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
            track={currentTrack}
          />
          <TabletPlayerCard
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(p => !p)}
            pct={pct}
            track={currentTrack}
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
              <Workspace
                key={ws.id}
                workspace={ws}
                open={openWs[ws.id] ?? false}
                onToggle={() =>
                  setOpenWs(s => ({ ...s, [ws.id]: !(s[ws.id] ?? false) }))
                }
                collapsed={collapsed}
                tight={tight}
              />
            ))}
          </div>

          {/* Admin — separate, no section header */}
          <div>
            <Workspace
              workspace={ADMIN_WORKSPACE}
              open={openWs[ADMIN_WORKSPACE.id] ?? false}
              onToggle={() =>
                setOpenWs(s => ({
                  ...s,
                  [ADMIN_WORKSPACE.id]: !(s[ADMIN_WORKSPACE.id] ?? false),
                }))
              }
              collapsed={collapsed}
              tight={tight}
            />
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
            track={nowPlaying.track}
            isPlaying={nowPlaying.isPlaying}
            onPlay={nowPlaying.onPlay}
          />
        )}
      </div>
    </aside>
  );
}

// Simplified now-playing pinned to the sidebar bottom. Just album art +
// title/artist + play button. No BPM/Key/Version chips — those live in
// the right rail's Overview tab when you actually need them.
function SidebarBottomNowPlaying({
  track,
  isPlaying,
  onPlay,
}: {
  track: TrackInfo;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <div className='flex items-center gap-2 h-12 px-1.5 rounded-md hover:bg-surface-1/40 transition-colors duration-150 ease-out'>
      <div className='shrink-0 h-9 w-9 rounded overflow-hidden bg-surface-2'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={track.artwork}
          alt=''
          className='h-full w-full object-cover'
        />
      </div>
      <div className='min-w-0 flex-1'>
        <div
          className='truncate text-[12px] font-caption text-primary-token leading-tight'
          style={{ letterSpacing: '-0.005em' }}
        >
          {track.title}
        </div>
        <div className='truncate text-[10.5px] text-tertiary-token leading-tight mt-0.5'>
          {track.artist}
        </div>
      </div>
      <button
        type='button'
        onClick={onPlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className='shrink-0 h-7 w-7 rounded-full grid place-items-center text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
      >
        {isPlaying ? (
          <Pause className='h-3 w-3' strokeWidth={2.5} fill='currentColor' />
        ) : (
          <Play
            className='h-3 w-3 translate-x-px'
            strokeWidth={2.5}
            fill='currentColor'
          />
        )}
      </button>
    </div>
  );
}

function Workspace({
  workspace,
  open,
  onToggle,
  collapsed,
  tight,
}: {
  workspace: Workspace;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  tight?: boolean;
}) {
  // Collapsed sidebar: render just an avatar; click cycles through items
  // visually (here we just show the avatar with a tone tooltip).
  if (collapsed) {
    // No avatar in collapsed mode either — items of an open workspace
    // simply render as icons inline.
    if (!open) return null;
    return (
      <div className='space-y-px'>
        {workspace.items.map(item => (
          <SidebarNavItem key={item.label} item={item} collapsed={true} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type='button'
        onClick={onToggle}
        className={cn(
          'relative w-full flex items-center gap-2.5 pl-3 pr-2 rounded-md hover:bg-surface-1/70 transition-colors duration-150 ease-out',
          tight ? 'h-6' : 'h-7'
        )}
        aria-expanded={open}
      >
        {/* Chevron sits in the icon column — replaces the avatar */}
        <ChevronDown
          aria-hidden='true'
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-150 ease-out',
            !open && '-rotate-90'
          )}
          strokeWidth={2.25}
        />
        <span className='text-[13px] font-caption truncate text-primary-token tracking-[-0.015em]'>
          {workspace.name}
        </span>
      </button>
      <div
        className='overflow-hidden'
        style={{
          maxHeight: open ? workspace.items.length * (tight ? 26 : 30) + 12 : 0,
          opacity: open ? 1 : 0,
          transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity 200ms ease-out`,
        }}
      >
        {/* Items area — separation is implied by the spacing alone. */}
        <div className='relative space-y-px pt-1 pb-0.5 [&_a:hover]:bg-surface-1/50'>
          {workspace.items.map(item => (
            <SidebarNavItem
              key={item.label}
              item={item}
              collapsed={false}
              nested
              tight={tight}
            />
          ))}
          {workspace.items.length === 0 && (
            <div className='text-[11px] text-tertiary-token italic pl-3 py-1'>
              No items yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Threads section in the sidebar — most-recent 5 inline, status dot
// per thread, "View all" expands to ~10 with internal scroll. Auto-named
// titles already; truncation handles overflow. Status dot tones map to
// running (cyan pulse) / complete (neutral) / errored (rose).
function SidebarThreadsSection({
  threads,
  activeThreadId,
  onSelect,
  onThreadContextMenu,
  tight,
  collapsed,
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect?: (id: string) => void;
  onThreadContextMenu?: (e: React.MouseEvent, thread: Thread) => void;
  tight?: boolean;
  collapsed: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [threads]
  );
  if (collapsed) return null;
  // Empty Threads section reads as clutter — hide the whole block until
  // there's at least one thread to show.
  if (sorted.length === 0) return null;
  const visible = expanded ? sorted.slice(0, 10) : sorted.slice(0, 5);
  const hasMore = sorted.length > visible.length || !expanded;
  return (
    <div className='space-y-1'>
      <div className='px-3 pt-1 pb-1 flex items-center justify-between'>
        <span className='text-[9.5px] font-medium uppercase tracking-[0.12em] text-quaternary-token/85'>
          Threads
        </span>
        {sorted.filter(t => t.unread).length > 0 && (
          <span className='inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-quaternary-token'>
            <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/85' />
            {sorted.filter(t => t.unread).length}
          </span>
        )}
      </div>
      <div
        className={cn(
          'flex flex-col gap-px',
          expanded && 'max-h-[320px] overflow-y-auto'
        )}
      >
        {visible.map(t => {
          const active = activeThreadId === t.id;
          const unread = !!t.unread && !active;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: row hosts two real buttons; div is hover container with right-click menu
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same
            <div
              key={t.id}
              className={cn(
                'group/thread relative flex items-center rounded-md transition-colors duration-150 ease-out',
                tight ? 'h-6' : 'h-7',
                active
                  ? 'bg-surface-1 text-primary-token'
                  : unread
                    ? 'text-primary-token hover:bg-surface-1/50'
                    : 'text-tertiary-token hover:bg-surface-1/50 hover:text-primary-token'
              )}
              onContextMenu={e => onThreadContextMenu?.(e, t)}
            >
              <button
                type='button'
                onClick={() => onSelect?.(t.id)}
                className={cn(
                  'flex-1 flex items-center gap-2 min-w-0 text-left',
                  // Reserve right padding for the absolute-positioned
                  // hover/active ellipsis button so the truncated title
                  // never collides with the menu icon visually.
                  tight ? 'h-6 pl-2.5 pr-7' : 'h-7 pl-3 pr-7'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    t.status === 'running'
                      ? 'bg-cyan-300/85 anim-calm-breath'
                      : t.status === 'errored'
                        ? 'bg-rose-400/85'
                        : unread
                          ? 'bg-cyan-300/85'
                          : 'bg-white/25'
                  )}
                />
                <span
                  className={cn(
                    'flex-1 truncate',
                    tight ? 'text-[12px]' : 'text-[12.5px]',
                    unread && 'font-medium'
                  )}
                >
                  {t.title}
                </span>
              </button>
              {/* Hover ellipsis — opens the per-thread menu (Archive,
                  Copy as Markdown, Copy thread ID, Delete). Right-click
                  the row anywhere still goes through the legacy
                  ContextMenuOverlay until that primitive is replaced. */}
              <ShellDropdown
                align='start'
                side='right'
                sideOffset={8}
                width={196}
                trigger={
                  <button
                    type='button'
                    aria-label='Thread actions'
                    className={cn(
                      'absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-150 ease-out',
                      'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-primary-token'
                    )}
                  >
                    <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
                  </button>
                }
              >
                <ShellDropdown.Item
                  icon={ExternalLink}
                  label='View thread'
                  onSelect={() => onSelect?.(t.id)}
                />
                <ShellDropdown.Item
                  icon={Copy}
                  label='Copy as Markdown'
                  shortcut='⌘⇧C'
                />
                <ShellDropdown.Item icon={LinkIcon} label='Copy thread ID' />
                <ShellDropdown.Separator />
                <ShellDropdown.Item icon={Archive} label='Archive thread' />
                <ShellDropdown.Item
                  icon={Trash2}
                  label='Delete thread'
                  tone='danger'
                />
              </ShellDropdown>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          type='button'
          onClick={() => setExpanded(v => !v)}
          className='w-full text-left px-3 py-1 text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token hover:text-secondary-token transition-colors duration-150 ease-out'
        >
          {expanded ? 'Show less' : 'View all'}
        </button>
      )}
    </div>
  );
}

function SidebarNavItem({
  item,
  collapsed,
  nested,
  tight,
}: {
  item: NavItem;
  collapsed: boolean;
  nested?: boolean;
  tight?: boolean;
}) {
  const button = (
    <button
      type='button'
      onClick={item.onActivate}
      className={cn(
        'relative flex items-center rounded-md w-full transition-colors duration-150 ease-out tracking-[-0.005em]',
        tight ? 'gap-2 text-[12.5px]' : 'gap-2.5 text-[13px]',
        collapsed
          ? 'h-8 w-10 mx-auto justify-center'
          : tight
            ? 'h-6 pl-2.5 pr-2'
            : 'h-7 pl-3 pr-2',
        item.active
          ? 'text-primary-token bg-surface-1'
          : nested
            ? 'text-tertiary-token hover:bg-surface-1/40 hover:text-primary-token'
            : 'text-secondary-token hover:bg-surface-1/60 hover:text-primary-token'
      )}
    >
      <item.icon
        className={cn(
          'shrink-0',
          tight ? 'h-3 w-3' : 'h-3.5 w-3.5',
          item.active
            ? 'text-primary-token'
            : nested
              ? 'text-quaternary-token'
              : 'text-tertiary-token'
        )}
        strokeWidth={2.25}
      />
      {!collapsed && <span className='truncate'>{item.label}</span>}
    </button>
  );
  // Tooltip on the right side of the rail. Sidebar nav doesn't currently
  // have shortcut bindings (we'd need ⌘1/⌘2/etc.); for now the tooltip is
  // label-only — kbd chips show up automatically once we wire shortcuts.
  return (
    <Tooltip label={item.label} side='right' block>
      {button}
    </Tooltip>
  );
}

function SidebarNowPlaying({
  collapsed,
  isPlaying,
  onPlay,
  barCollapsed,
  track,
}: {
  collapsed: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  barCollapsed: boolean;
  onToggleBar: () => void;
  track: TrackInfo;
}) {
  // Play overlay shows on the album art only when the transport bar is hidden.
  // When the bar is at the bottom of the screen, the overlay fades out (the
  // bar handles transport). Hover always reveals it for affordance.
  const overlay = (
    <ArtworkPlayOverlay
      isPlaying={isPlaying}
      onPlay={onPlay}
      visible={barCollapsed}
    />
  );

  if (collapsed) {
    return (
      <div
        className='relative h-10 w-10 mx-auto rounded-md overflow-hidden'
        title={`${track.title} — ${track.artist} · ${track.bpm} BPM · ${track.key}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={track.artwork}
          alt=''
          className='h-full w-full object-cover'
        />
        {overlay}
        {isPlaying && (
          <span className='absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-(--linear-bg-page)' />
        )}
      </div>
    );
  }

  return (
    <div className='px-1 flex items-center gap-2.5'>
      <div className='relative h-9 w-9 rounded overflow-hidden shrink-0'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={track.artwork}
          alt=''
          className='h-full w-full object-cover'
        />
        {overlay}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[12px] font-caption text-primary-token leading-[1.2]'>
          {track.title}
        </div>
        <div className='truncate text-[11px] text-tertiary-token leading-[1.3] mt-0.5'>
          {track.artist}
        </div>
      </div>
    </div>
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

// Primary per-view action button. Cyan-300 fill matches the brand accent
// without the saturated emerald that read as system-y. Drops to nothing
// for views that don't have a primary action (lyrics, demo, settings).
function PageAction({ view }: { view: CanvasView }) {
  const action = pageActionForView(view);
  if (!action) return null;
  // White tone by default. Cyan was overpowering — primary actions
  // shouldn't compete with the brand mark or status badges. White on
  // dark stays the visual anchor without screaming.
  return (
    <button
      type='button'
      onClick={action.onClick}
      className='inline-flex items-center gap-1.5 h-7 px-3.5 rounded-full bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors duration-150 ease-out'
    >
      {action.icon ? (
        <action.icon className='h-3.5 w-3.5' strokeWidth={2.5} />
      ) : null}
      {action.label}
    </button>
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

function DemoContent() {
  return <DashboardHome />;
}

function DashboardHome() {
  const [index, setIndex] = useState(0);
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

      {/* Composer locked to the bottom of the canvas. Pill input with a
          circular white send button — Variant F adoption is queued (will
          replace this with the real ChatInput component). */}
      <div className='shrink-0 mt-4 max-w-[560px] w-full mx-auto'>
        <PillComposer placeholder='Ask Jovie' />
      </div>
    </div>
  );
}

// Apple-esque suggestion card. No eyebrow, no Jovie attribution, no
// confidence percentage, no divider — the card IS the message. Title
// leads, body is short, actions balance to the right edge.
// Variant F adoption — wraps the shipped ChatInput from
// apps/web/components/jovie/components/ChatInput.tsx so /exp/shell-v1
// gets the morphing pill surface, slash picker, chip tray, and motion
// transitions. Backend wiring (useJovieChat / streaming / images) is
// kept stubbed for the design pass — those wires land at flip-time.
function PillComposer({ placeholder }: { placeholder: string }) {
  const [value, setValue] = useState('');
  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={e => {
        e?.preventDefault();
        setValue('');
      }}
      isLoading={false}
      isSubmitting={false}
      placeholder={placeholder}
      shellChatV1
    />
  );
}

function AudioBar({
  variant,
  isPlaying,
  onPlay,
  onCollapse,
  pct,
  loopMode,
  onCycleLoop,
  waveformOn,
  onToggleWaveform,
  lyricsActive,
  onOpenLyrics,
  track,
}: {
  variant: Variant;
  isPlaying: boolean;
  onPlay: () => void;
  onCollapse: () => void;
  pct: number;
  loopMode: 'off' | 'track' | 'section';
  onCycleLoop: () => void;
  waveformOn: boolean;
  onToggleWaveform: () => void;
  lyricsActive: boolean;
  onOpenLyrics: () => void;
  // Track meta — chips (BPM / Key / Version) render on the right side
  // of the bar so the now-playing card on the left stays clean.
  track: TrackInfo;
}) {
  // All variants share the V1a 64px / two-row Spotify shell.
  // What differs is the *scrub* — playing with how loud or quiet the
  // player is, and what kind of artist control it surfaces.
  const transportButtons = (
    <div className='flex items-center gap-1.5 justify-self-center'>
      <IconBtn label='Shuffle' tooltipSide='top' tone='ghost'>
        <Shuffle className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
      <IconBtn label='Previous' tooltipSide='top' tone='ghost'>
        <SkipBack className='h-4 w-4' strokeWidth={2.5} fill='currentColor' />
      </IconBtn>
      <Tooltip
        label={isPlaying ? 'Pause' : 'Play'}
        shortcut={SHORTCUTS.playPause}
        side='top'
      >
        <button
          type='button'
          onClick={onPlay}
          className='h-8 w-8 rounded-full grid place-items-center bg-primary text-on-primary transition-transform duration-150 ease-out hover:scale-[1.04] active:scale-95'
          aria-label={isPlaying ? 'Pause (space)' : 'Play (space)'}
        >
          {isPlaying ? (
            <Pause
              className='h-3.5 w-3.5'
              strokeWidth={2.5}
              fill='currentColor'
            />
          ) : (
            <Play
              className='h-3.5 w-3.5 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          )}
        </button>
      </Tooltip>
      <IconBtn label='Next' tooltipSide='top' tone='ghost'>
        <SkipForward
          className='h-4 w-4'
          strokeWidth={2.5}
          fill='currentColor'
        />
      </IconBtn>
      <LoopBtn mode={loopMode} onClick={onCycleLoop} />
    </div>
  );

  const rightCluster = (
    <div className='flex items-center gap-1.5 justify-self-end'>
      {waveformOn && (
        <span className='hidden xl:inline-flex items-center mr-1 text-[10.5px] font-caption text-quaternary-token tracking-[-0.005em]'>
          {track.bpm} BPM · {track.key} · {track.version}
        </span>
      )}
      {track.hasLyrics && (
        <IconBtn
          label='Lyrics'
          shortcut={SHORTCUTS.toggleLyrics}
          onClick={onOpenLyrics}
          active={lyricsActive}
          tooltipSide='top'
          tone='ghost'
        >
          <Mic2 className='h-3.5 w-3.5' strokeWidth={2.25} />
        </IconBtn>
      )}
      <IconBtn
        label={waveformOn ? 'Hide waveform' : 'Show waveform'}
        shortcut={SHORTCUTS.toggleWaveform}
        onClick={onToggleWaveform}
        active={waveformOn}
        tooltipSide='top'
        tone='ghost'
      >
        {waveformOn ? (
          <AudioLines className='h-3.5 w-3.5' strokeWidth={2.25} />
        ) : (
          <AudioWaveform className='h-3.5 w-3.5' strokeWidth={2.25} />
        )}
      </IconBtn>
      <AudioBarOverflowMenu track={track} />
      <IconBtn
        label='Minimize player'
        shortcut={SHORTCUTS.toggleBar}
        onClick={onCollapse}
        tooltipSide='top'
        tone='ghost'
      >
        <Minimize2 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
    </div>
  );

  // V1c (filled) was approved as the canonical waveform. Variant tabs
  // are kept in the picker for comparison only; everything else uses 'filled'.
  const kindByVariant: Record<Variant, WaveformKind> = {
    a: 'hairlines',
    b: 'stereo',
    c: 'filled',
    d: 'peaksRms',
    e: 'denseBars',
  };
  const scrub = (
    <ScrubGradient
      pct={pct}
      loopMode={loopMode}
      kind={kindByVariant[variant]}
    />
  );

  return (
    <section
      aria-label='Audio player'
      className='group/bar shrink-0 hidden lg:grid grid-cols-[1fr_minmax(360px,_720px)_1fr] gap-4 items-center px-8 py-2'
    >
      <div />
      {/* Center column: waveform drawer above, transport below. */}
      <div className='flex flex-col items-center justify-center min-h-[52px]'>
        <div
          aria-hidden={!waveformOn}
          className='w-full overflow-hidden'
          style={{
            maxHeight: waveformOn ? 40 : 0,
            opacity: waveformOn ? 1 : 0,
            transform: waveformOn ? 'translateY(0)' : 'translateY(6px)',
            transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
          }}
        >
          <div className='pt-1.5 pb-1.5'>{scrub}</div>
        </div>
        {transportButtons}
      </div>
      {/* Right cluster vertically centers across the full bar height,
          including the waveform drawer when it's open. */}
      {rightCluster}
    </section>
  );
}

// Audio bar overflow menu — the canonical track-entity action menu. Same
// entries as the right-click context menu on a track row, plus playback
// options that only make sense for the actively-playing track (Quality,
// Playback rate, Add to queue). Ends with the release EntityItem so
// hovering it reveals the parent release popover.
function AudioBarOverflowMenu({ track }: { track: TrackInfo }) {
  const [quality, setQuality] = useState('auto');
  const [rate, setRate] = useState('1');
  const onEntityActivate = useEntityActivate();
  const parentRelease =
    ENTITY_RELEASES.find(
      r => r.kind === 'release' && r.label === track.album
    ) ??
    ENTITY_RELEASES.find(r => r.kind === 'release') ??
    null;
  const noop = (action: string) => () =>
    console.info(`[shell-v1] ${action} ${track.id}`);
  return (
    <ShellDropdown
      align='end'
      side='top'
      sideOffset={8}
      width={224}
      onEntityActivate={onEntityActivate}
      trigger={
        <button
          type='button'
          aria-label='More'
          className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out data-[state=open]:text-primary-token'
        >
          <MoreHorizontal className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
      }
    >
      <ShellDropdown.Item
        icon={UserPlus}
        label='Add to release'
        onSelect={noop('add-to-release')}
      />
      <ShellDropdown.Item
        icon={Pencil}
        label='Edit metadata'
        shortcut='⌘E'
        onSelect={noop('edit-metadata')}
      />
      <ShellDropdown.Separator />
      <ShellDropdown.Item
        icon={Hash}
        label='Copy ISRC'
        description={track.isrc}
        onSelect={noop(`copy-isrc ${track.isrc}`)}
      />
      <ShellDropdown.Item
        icon={LinkIcon}
        label='Copy share link'
        shortcut='⌘L'
        onSelect={noop('copy-share-link')}
      />
      <ShellDropdown.Item
        icon={Copy}
        label='Duplicate'
        shortcut='⌘D'
        onSelect={noop('duplicate')}
      />
      <ShellDropdown.Separator />
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
        <ShellDropdown.SubTrigger icon={Repeat} label='Playback rate' />
        <ShellDropdown.SubContent>
          <ShellDropdown.RadioGroup value={rate} onValueChange={setRate}>
            <ShellDropdown.RadioItem value='0.5' label='0.5×' />
            <ShellDropdown.RadioItem value='0.75' label='0.75×' />
            <ShellDropdown.RadioItem value='1' label='1× · Normal' />
            <ShellDropdown.RadioItem value='1.25' label='1.25×' />
            <ShellDropdown.RadioItem value='1.5' label='1.5×' />
            <ShellDropdown.RadioItem value='2' label='2×' />
          </ShellDropdown.RadioGroup>
        </ShellDropdown.SubContent>
      </ShellDropdown.Sub>
      <ShellDropdown.Item
        icon={Plus}
        label='Add to queue'
        shortcut='Q'
        onSelect={noop('add-to-queue')}
      />
      <ShellDropdown.Separator />
      {parentRelease ? (
        <ShellDropdown.EntityItem entity={parentRelease} />
      ) : (
        <ShellDropdown.Item
          icon={LibraryIcon}
          label='Show in library'
          disabled
        />
      )}
      <ShellDropdown.Separator />
      <ShellDropdown.Item
        icon={Trash2}
        label='Delete'
        tone='danger'
        onSelect={noop('delete')}
      />
    </ShellDropdown>
  );
}

function LoopBtn({
  mode,
  onClick,
}: {
  mode: 'off' | 'track' | 'section';
  onClick: () => void;
}) {
  const active = mode !== 'off';
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'relative h-7 w-7 rounded-md grid place-items-center transition-colors duration-150 ease-out',
        active
          ? 'text-primary-token'
          : 'text-quaternary-token hover:text-primary-token'
      )}
      aria-label={`Loop: ${mode}`}
      title={`Loop: ${mode}`}
    >
      <Repeat className='h-3.5 w-3.5' strokeWidth={2.25} />
      {mode === 'track' && (
        <span className='absolute -bottom-px right-0 text-[8px] font-bold leading-none text-primary-token'>
          1
        </span>
      )}
      {mode === 'section' && (
        <span className='absolute -bottom-px right-0 text-[8px] font-bold leading-none text-primary-token'>
          ⤴
        </span>
      )}
      {active && (
        <span className='absolute -top-px left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary-token' />
      )}
    </button>
  );
}

const TIME_LABEL =
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

type WaveformKind =
  | 'hairlines'
  | 'stereo'
  | 'filled'
  | 'peaksRms'
  | 'denseBars';

const SCRUB_W = 1000;
const SCRUB_H = 32; // includes 4px reserved at the top for cue dots
const WAVE_TOP = 6; // waveform area starts here (cue dots above)
const WAVE_H = SCRUB_H - WAVE_TOP;
const WAVE_CY = WAVE_TOP + WAVE_H / 2;
const WAVE_AMP = WAVE_H / 2 - 1;

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
const AUDIO_RMS = AUDIO_PEAK.map((v, i) => v * (0.45 + hash1d(i + 99) * 0.25));
const AUDIO_LEFT = makeAudio(320, 7);
const AUDIO_RIGHT = makeAudio(320, 13);

const CUES = [
  { at: 12, label: 'Intro' },
  { at: 31, label: 'Verse' },
  { at: 58, label: 'Drop' },
  { at: 84, label: 'Bridge' },
];
const LOOP_SECTION = { from: 31, to: 58 };

// --- Geometry generators: all are *real audio waveforms* (mirrored about
// the centerline, dense, dynamic). They differ in render technique.

// Audacity-style mirrored hairlines: dense vertical lines, top + bottom.
function hairlinesStrands() {
  const stride = SCRUB_W / AUDIO_PEAK.length;
  return (
    <>
      {AUDIO_PEAK.map((h, i) => {
        const x = i * stride + stride / 2;
        const half = h * WAVE_AMP;
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={i}
            x1={x}
            x2={x}
            y1={WAVE_CY - half}
            y2={WAVE_CY + half}
            stroke='url(#scrub-grad)'
            strokeWidth='0.8'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
    </>
  );
}

// Stereo split: top half = left channel, bottom half = right channel.
function stereoStrands() {
  const stride = SCRUB_W / AUDIO_LEFT.length;
  const halfH = WAVE_H / 2 - 0.5;
  const topMid = WAVE_TOP + halfH / 2 + 0.5;
  const botMid = WAVE_TOP + halfH + halfH / 2 + 0.5;
  return (
    <>
      {/* L channel — top */}
      {AUDIO_LEFT.map((h, i) => {
        const x = i * stride + stride / 2;
        const amp = h * (halfH / 2);
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={`l-${i}`}
            x1={x}
            x2={x}
            y1={topMid - amp}
            y2={topMid + amp}
            stroke='url(#scrub-grad)'
            strokeWidth='0.8'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
      {/* R channel — bottom */}
      {AUDIO_RIGHT.map((h, i) => {
        const x = i * stride + stride / 2;
        const amp = h * (halfH / 2);
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={`r-${i}`}
            x1={x}
            x2={x}
            y1={botMid - amp}
            y2={botMid + amp}
            stroke='url(#scrub-grad)'
            strokeWidth='0.8'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
      {/* Channel divider (very subtle) */}
      <line
        x1='0'
        x2={SCRUB_W}
        y1={WAVE_TOP + halfH + 0.5}
        y2={WAVE_TOP + halfH + 0.5}
        stroke='url(#scrub-grad)'
        strokeWidth='0.3'
        opacity='0.25'
        vectorEffect='non-scaling-stroke'
      />
    </>
  );
}

// Solid filled mirror waveform (Audacity / Logic look).
function filledStrands() {
  const stride = SCRUB_W / AUDIO_PEAK.length;
  const top: string[] = [];
  const bot: string[] = [];
  AUDIO_PEAK.forEach((h, i) => {
    const x = i * stride;
    const half = h * WAVE_AMP;
    top.push(
      `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${(WAVE_CY - half).toFixed(2)}`
    );
    bot.push(`L ${x.toFixed(2)} ${(WAVE_CY + half).toFixed(2)}`);
  });
  const filled = `${top.join(' ')} ${bot.reverse().join(' ')} Z`;
  return <path d={filled} fill='url(#scrub-grad)' />;
}

// Peaks (outer light shell) + RMS (inner dark). Two layers.
function peaksRmsStrands() {
  const stride = SCRUB_W / AUDIO_PEAK.length;
  return (
    <>
      {/* Peak shell — wider, lower opacity */}
      {AUDIO_PEAK.map((h, i) => {
        const x = i * stride + stride / 2;
        const half = h * WAVE_AMP;
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={`p-${i}`}
            x1={x}
            x2={x}
            y1={WAVE_CY - half}
            y2={WAVE_CY + half}
            stroke='url(#scrub-grad)'
            strokeWidth='1.2'
            opacity='0.5'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
      {/* RMS core — narrower, sharper */}
      {AUDIO_RMS.map((h, i) => {
        const x = i * stride + stride / 2;
        const half = h * WAVE_AMP;
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={`r-${i}`}
            x1={x}
            x2={x}
            y1={WAVE_CY - half}
            y2={WAVE_CY + half}
            stroke='url(#scrub-grad)'
            strokeWidth='0.9'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
    </>
  );
}

// Dense rounded bars (SoundCloud / podcast look) — fewer, fatter,
// rounded caps, mirrored.
const DENSE_BAR_COUNT = 96;
const DENSE_BARS = makeAudio(DENSE_BAR_COUNT, 21);
function denseBarsStrands() {
  const gap = 1.5;
  const barW = SCRUB_W / DENSE_BAR_COUNT - gap;
  return (
    <>
      {DENSE_BARS.map((h, i) => {
        const x = i * (barW + gap) + barW / 2;
        const half = h * WAVE_AMP;
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: waveform
            key={i}
            x1={x}
            x2={x}
            y1={WAVE_CY - half}
            y2={WAVE_CY + half}
            stroke='url(#scrub-grad)'
            strokeWidth='2.6'
            strokeLinecap='round'
            vectorEffect='non-scaling-stroke'
          />
        );
      })}
    </>
  );
}

function renderStrands(kind: WaveformKind) {
  switch (kind) {
    case 'hairlines':
      return hairlinesStrands();
    case 'stereo':
      return stereoStrands();
    case 'filled':
      return filledStrands();
    case 'peaksRms':
      return peaksRmsStrands();
    case 'denseBars':
      return denseBarsStrands();
  }
}

function ScrubGradient({
  pct,
  loopMode,
  kind,
}: {
  pct: number;
  loopMode: 'off' | 'track' | 'section';
  kind: WaveformKind;
}) {
  const playedX = (pct / 100) * SCRUB_W;
  const loopFromX = (LOOP_SECTION.from / 100) * SCRUB_W;
  const loopToX = (LOOP_SECTION.to / 100) * SCRUB_W;

  return (
    <div className='flex w-full items-center gap-2'>
      <span className={cn(TIME_LABEL, 'text-right')}>
        {formatTime(TRACK.currentTime)}
      </span>
      <div className='relative flex-1 min-w-[60px] h-8'>
        <svg
          viewBox={`0 0 ${SCRUB_W} ${SCRUB_H}`}
          className='w-full h-full overflow-visible'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          <defs>
            <linearGradient id='scrub-grad' x1='0' y1='0' x2='1' y2='0'>
              <stop offset='0%' stopColor='#a78bfa' />
              <stop offset='35%' stopColor='#c084fc' />
              <stop offset='60%' stopColor='#f472b6' />
              <stop offset='100%' stopColor='#60a5fa' />
            </linearGradient>
            <linearGradient id='scrub-edge-fade' x1='0' y1='0' x2='1' y2='0'>
              <stop offset='0%' stopColor='white' stopOpacity='0' />
              <stop offset='10%' stopColor='white' stopOpacity='1' />
              <stop offset='90%' stopColor='white' stopOpacity='1' />
              <stop offset='100%' stopColor='white' stopOpacity='0' />
            </linearGradient>
            <mask id='scrub-edge-mask'>
              <rect
                x='0'
                y='0'
                width={SCRUB_W}
                height={SCRUB_H}
                fill='url(#scrub-edge-fade)'
              />
            </mask>
            <clipPath id='scrub-played'>
              <rect x='0' y='0' width={playedX} height={SCRUB_H} />
            </clipPath>
            <clipPath id='scrub-unplayed'>
              <rect
                x={playedX}
                y='0'
                width={SCRUB_W - playedX}
                height={SCRUB_H}
              />
            </clipPath>
          </defs>

          {/* Cue markers — sit in the reserved 6px above the waveform */}
          {CUES.map(c => (
            <circle
              key={c.label}
              cx={(c.at / 100) * SCRUB_W}
              cy={2.5}
              r={1.6}
              fill='url(#scrub-grad)'
              opacity='0.55'
            />
          ))}

          {/* Loop section band */}
          {loopMode === 'section' && (
            <rect
              x={loopFromX}
              y={WAVE_TOP}
              width={loopToX - loopFromX}
              height={WAVE_H}
              fill='url(#scrub-grad)'
              opacity='0.12'
            />
          )}
          {loopMode === 'section' && (
            <>
              <line
                x1={loopFromX}
                x2={loopFromX}
                y1={WAVE_TOP}
                y2={WAVE_TOP + WAVE_H}
                stroke='url(#scrub-grad)'
                strokeWidth='1'
                opacity='0.55'
                vectorEffect='non-scaling-stroke'
              />
              <line
                x1={loopToX}
                x2={loopToX}
                y1={WAVE_TOP}
                y2={WAVE_TOP + WAVE_H}
                stroke='url(#scrub-grad)'
                strokeWidth='1'
                opacity='0.55'
                vectorEffect='non-scaling-stroke'
              />
            </>
          )}

          <g mask='url(#scrub-edge-mask)'>
            {/* Unplayed — ambient */}
            <g clipPath='url(#scrub-unplayed)' opacity='0.3'>
              {renderStrands(kind)}
            </g>
            {/* Played — saturated but soft */}
            <g clipPath='url(#scrub-played)' opacity='0.95'>
              {renderStrands(kind)}
            </g>
            {/* Playhead */}
            <line
              x1={playedX}
              x2={playedX}
              y1={WAVE_TOP - 2}
              y2={SCRUB_H}
              stroke='url(#scrub-grad)'
              strokeWidth='1'
              opacity='0.9'
              vectorEffect='non-scaling-stroke'
            />
          </g>
        </svg>
      </div>
      <span className={TIME_LABEL}>{formatTime(TRACK.duration)}</span>
    </div>
  );
}

// Mobile playback: a frosted "liquid glass" card pinned to the bottom of
// the viewport. Phone-only — `md` and up gets the tablet card or full bar.
function MobilePlayerCard({
  isPlaying,
  onPlay,
  pct,
  track,
}: {
  isPlaying: boolean;
  onPlay: () => void;
  pct: number;
  track: TrackInfo;
}) {
  return (
    <div className='md:hidden fixed inset-x-3 z-40 bottom-3'>
      <div className='rounded-2xl px-2.5 py-2 flex items-center gap-2.5 backdrop-blur-2xl bg-(--linear-app-content-surface)/70 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.18)] relative overflow-hidden'>
        {/* Hairline progress at the very top edge */}
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 right-0 h-px bg-tertiary-token/30'
        />
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 h-px bg-primary-token'
          style={{ width: `${pct}%` }}
        />

        {/* Album art */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={track.artwork}
          alt=''
          className='h-10 w-10 rounded-lg object-cover shrink-0'
        />

        {/* Track */}
        <div className='min-w-0 flex-1'>
          <div className='truncate text-[13px] font-caption text-primary-token leading-tight'>
            {track.title}
          </div>
          <div className='truncate text-[11px] text-tertiary-token leading-tight mt-0.5'>
            {track.artist}
          </div>
        </div>

        {/* Play */}
        <button
          type='button'
          onClick={onPlay}
          className='h-9 w-9 rounded-full grid place-items-center bg-primary text-on-primary shrink-0 transition-transform duration-150 ease-out active:scale-95'
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className='h-4 w-4' strokeWidth={2.5} fill='currentColor' />
          ) : (
            <Play
              className='h-4 w-4 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          )}
        </button>
      </div>
    </div>
  );
}

// Tablet playback: same liquid-glass language as mobile, with prev/next
// flanking the play button and a real scrub bar across the top edge so you
// can seek without expanding into the full player.
function TabletPlayerCard({
  isPlaying,
  onPlay,
  pct,
  track,
}: {
  isPlaying: boolean;
  onPlay: () => void;
  pct: number;
  track: TrackInfo;
}) {
  return (
    <div className='hidden md:block lg:hidden fixed inset-x-4 z-40 bottom-4'>
      <div className='rounded-2xl backdrop-blur-2xl bg-(--linear-app-content-surface)/70 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.18)] relative overflow-hidden'>
        {/* Hairline progress at the very top edge */}
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 right-0 h-px bg-tertiary-token/30'
        />
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 h-px bg-primary-token'
          style={{ width: `${pct}%` }}
        />

        {/* Single-row: track info | centered transport | scrub */}
        <div className='grid grid-cols-[minmax(160px,1fr)_auto_minmax(200px,2fr)] items-center gap-4 px-3 py-2.5'>
          {/* Track info */}
          <div className='flex items-center gap-3 min-w-0'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={track.artwork}
              alt=''
              className='h-10 w-10 rounded-lg object-cover shrink-0'
            />
            <div className='min-w-0'>
              <div className='truncate text-[13px] font-caption text-primary-token leading-tight'>
                {track.title}
              </div>
              <div className='truncate text-[11px] text-tertiary-token leading-tight mt-0.5'>
                {track.artist}
              </div>
            </div>
          </div>

          {/* Centered transport */}
          <div className='flex items-center gap-1.5 justify-self-center'>
            <button
              type='button'
              className='h-8 w-8 rounded grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
              aria-label='Previous'
            >
              <SkipBack
                className='h-4 w-4'
                strokeWidth={2.5}
                fill='currentColor'
              />
            </button>
            <button
              type='button'
              onClick={onPlay}
              className='h-9 w-9 rounded-full grid place-items-center bg-primary text-on-primary transition-transform duration-150 ease-out active:scale-95'
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause
                  className='h-4 w-4'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              ) : (
                <Play
                  className='h-4 w-4 translate-x-px'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              )}
            </button>
            <button
              type='button'
              className='h-8 w-8 rounded grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
              aria-label='Next'
            >
              <SkipForward
                className='h-4 w-4'
                strokeWidth={2.5}
                fill='currentColor'
              />
            </button>
          </div>

          {/* Inline scrub on the right */}
          <div className='flex items-center gap-2 min-w-0'>
            <span className='text-[10px] tabular-nums text-quaternary-token w-8 text-right shrink-0'>
              {formatTime(TRACK.currentTime)}
            </span>
            <div className='relative flex-1 h-[3px] rounded-full bg-tertiary-token/30 overflow-hidden'>
              <div
                className='absolute inset-y-0 left-0 bg-primary-token rounded-full'
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className='text-[10px] tabular-nums text-quaternary-token w-8 shrink-0'>
              {formatTime(TRACK.duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
type EntityRefData =
  | { kind: 'release'; release: Release }
  | { kind: 'track'; track: Track }
  | { kind: 'artist'; name: string; releases: number };

function EntityRef({
  children,
  data,
  onActivate,
}: {
  children: React.ReactNode;
  data: EntityRefData;
  onActivate?: () => void;
}) {
  return (
    <span className='relative inline-block group/entity align-baseline'>
      <button
        type='button'
        onClick={e => {
          e.stopPropagation();
          onActivate?.();
        }}
        className='inline align-baseline px-0.5 -mx-0.5 rounded-[3px] underline decoration-dotted decoration-quaternary-token/60 underline-offset-[3px] hover:decoration-cyan-300/70 hover:bg-cyan-400/[0.06] hover:text-primary-token transition-colors duration-150 ease-out'
      >
        {children}
      </button>
      {/* Popover wrapper — pt-1.5 acts as the bridge zone so the cursor can
          travel from the trigger to the card body without dismissing. */}
      <span
        role='tooltip'
        className={cn(
          'pointer-events-none absolute left-0 top-full z-40 w-[300px] pt-1.5',
          'opacity-0 translate-y-1 group-hover/entity:opacity-100 group-hover/entity:translate-y-0 group-focus-within/entity:opacity-100 group-focus-within/entity:translate-y-0',
          'group-hover/entity:pointer-events-auto group-focus-within/entity:pointer-events-auto',
          'transition-[opacity,transform] duration-150 ease-out delay-[280ms] group-hover/entity:delay-[280ms] group-focus-within/entity:delay-[80ms]'
        )}
      >
        <span className='block rounded-lg border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/97 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden'>
          <EntityCard data={data} onActivate={onActivate} />
        </span>
      </span>
    </span>
  );
}

function EntityCard({
  data,
  onActivate,
}: {
  data: EntityRefData;
  onActivate?: () => void;
}) {
  if (data.kind === 'release')
    return <ReleaseCard release={data.release} onActivate={onActivate} />;
  if (data.kind === 'track')
    return <TrackCard track={data.track} onActivate={onActivate} />;
  return <ArtistCard data={data} onActivate={onActivate} />;
}

function ReleaseCard({
  release,
  onActivate,
}: {
  release: Release;
  onActivate?: () => void;
}) {
  const liveCount = (Object.keys(release.dsps) as DspKey[]).filter(
    d => release.dsps[d] === 'live'
  ).length;
  return (
    <span className='block'>
      <span className='flex items-stretch gap-3 px-3 pt-3 pb-2.5'>
        <ArtworkThumb src={release.artwork} title={release.title} size={56} />
        <span className='flex-1 min-w-0 flex flex-col justify-center'>
          <span className='flex items-center gap-1.5'>
            <span
              className='text-[13px] font-semibold text-primary-token truncate'
              style={{ letterSpacing: '-0.012em' }}
            >
              {release.title}
            </span>
            <TypeBadge label={release.type} />
          </span>
          <span className='text-[11.5px] text-tertiary-token truncate mt-0.5'>
            {release.artist} · {release.album}
          </span>
        </span>
      </span>
      <span className='block px-3 pb-3'>
        <span className='grid grid-cols-3 gap-2 text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token'>
          <span className='flex flex-col gap-0.5'>
            <span>BPM</span>
            <span className='text-primary-token text-[12.5px] tabular-nums normal-case tracking-normal'>
              {release.bpm}
            </span>
          </span>
          <span className='flex flex-col gap-0.5'>
            <span>Key</span>
            <span className='text-primary-token text-[12.5px] font-mono tracking-wide normal-case'>
              {release.key}
            </span>
          </span>
          <span className='flex flex-col gap-0.5'>
            <span>Weekly</span>
            <span className='text-primary-token text-[12.5px] tabular-nums normal-case tracking-normal'>
              {formatStreams(release.weeklyStreams)}
            </span>
          </span>
        </span>
      </span>
      <span className='flex items-center justify-between gap-2 px-3 h-8 border-t border-(--linear-app-shell-border)/70 bg-(--surface-0)/50'>
        <span className='text-[10.5px] tabular-nums text-tertiary-token'>
          {liveCount}/{Object.keys(release.dsps).length} DSPs live · drops{' '}
          {new Date(release.releaseDate).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onActivate?.();
          }}
          className='inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        >
          Open
          <ChevronRight className='h-3 w-3' strokeWidth={2.25} />
        </button>
      </span>
    </span>
  );
}

function TrackCard({
  track,
  onActivate,
}: {
  track: Track;
  onActivate?: () => void;
}) {
  return (
    <span className='block'>
      <span className='flex items-stretch gap-3 px-3 pt-3 pb-2.5'>
        <ArtworkThumb src={track.artwork} title={track.title} size={56} />
        <span className='flex-1 min-w-0 flex flex-col justify-center'>
          <span
            className='text-[13px] font-semibold text-primary-token truncate'
            style={{ letterSpacing: '-0.012em' }}
          >
            {track.title}
          </span>
          <span className='text-[11.5px] text-tertiary-token truncate mt-0.5'>
            {track.artist} · {track.album}
          </span>
        </span>
      </span>
      <span className='flex items-center justify-between gap-2 px-3 h-8 border-t border-(--linear-app-shell-border)/70 bg-(--surface-0)/50'>
        <span className='text-[10.5px] tabular-nums text-tertiary-token'>
          {track.bpm} BPM · {track.keyNormal} ·{' '}
          {Math.floor(track.durationSec / 60)}:
          {String(track.durationSec % 60).padStart(2, '0')}
        </span>
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onActivate?.();
          }}
          className='inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        >
          Open
          <ChevronRight className='h-3 w-3' strokeWidth={2.25} />
        </button>
      </span>
    </span>
  );
}

function ArtistCard({
  data,
  onActivate,
}: {
  data: { kind: 'artist'; name: string; releases: number };
  onActivate?: () => void;
}) {
  return (
    <span className='block'>
      <span className='flex items-center gap-3 px-3 py-3'>
        <span className='h-10 w-10 rounded-full bg-surface-2 grid place-items-center text-[14px] font-semibold text-primary-token shrink-0'>
          {data.name.slice(0, 1)}
        </span>
        <span className='flex-1 min-w-0'>
          <span
            className='block text-[13px] font-semibold text-primary-token truncate'
            style={{ letterSpacing: '-0.012em' }}
          >
            {data.name}
          </span>
          <span className='block text-[11.5px] text-tertiary-token truncate mt-0.5'>
            {data.releases} release{data.releases === 1 ? '' : 's'}
          </span>
        </span>
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onActivate?.();
          }}
          className='inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10.5px] uppercase tracking-[0.06em] text-tertiary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        >
          Open
          <ChevronRight className='h-3 w-3' strokeWidth={2.25} />
        </button>
      </span>
    </span>
  );
}

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
  return (
    <>
      {before}
      <EntityRef
        data={{ kind: 'release', release: bestRelease }}
        onActivate={() => bestRelease && onOpenRelease(bestRelease.id)}
      >
        {match}
      </EntityRef>
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

// Push-to-talk Jovie. Hold ⌘J anywhere to dictate. Mock for design pass —
// wire to the chat input / command palette intent router in production.
// Install / upgrade banner — calm strip at the top of the canvas.
// Dark surface, subtle gradient accent, two affordances (primary
// install + dismiss). Positioned above the header so it never
// fights the breadcrumb for attention. Slides in/out with the
// same cinematic ease as other shell transitions.
// Compact sidebar card — sits above the now-playing slot. Vertical
// layout (icon + title, short body, single primary action) so it fits
// in the 224px sidebar without truncation. Animates max-height +
// opacity in/out on the same cinematic curve as the now-playing card.
function InstallBanner({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      aria-hidden={!open}
      className='shrink-0 overflow-hidden px-2'
      style={{
        maxHeight: open ? 140 : 0,
        opacity: open ? 1 : 0,
        transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
      }}
    >
      <div className='relative rounded-xl border border-(--linear-app-shell-border) bg-(--surface-1)/60 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_18px_rgba(0,0,0,0.28)] px-3 pt-3 pb-3 mb-2'>
        <button
          type='button'
          onClick={onDismiss}
          aria-label='Dismiss install prompt'
          className='absolute top-1.5 right-1.5 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
        >
          <X className='h-3 w-3' strokeWidth={2.25} />
        </button>
        <div className='flex items-center gap-1.5 mb-1 pr-5'>
          <Sparkles
            className='h-3 w-3 text-cyan-300/85 shrink-0'
            strokeWidth={2.25}
          />
          <span className='text-[12px] font-medium text-primary-token tracking-[-0.005em]'>
            Get Jovie for desktop
          </span>
        </div>
        <p className='text-[11px] text-tertiary-token leading-snug mb-2.5'>
          Push-to-talk in any app, native shortcuts.
        </p>
        <button
          type='button'
          className='w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-full text-[12px] font-medium bg-white text-black hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out'
        >
          Install
          <ArrowDown className='h-3 w-3' strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function JovieOverlay({ listening }: { listening: boolean }) {
  // 32-bar live waveform — each bar's height is driven by a layered
  // sine so the overall envelope reads as natural speech, not a
  // metronome. The bars use a CSS-only animation per bar with
  // staggered delays + duration, so we get organic motion at zero
  // JS cost. The whole strip cross-fades behind a dim backdrop on
  // entry / exit (cinematic — same vocabulary as ScreeningRoom).
  return (
    <>
      {/* Backdrop dim — fades the entire shell when dictating so
          the waveform owns the moment. Click to dismiss. */}
      <div
        aria-hidden='true'
        className='fixed inset-0 z-40 bg-black pointer-events-none'
        style={{
          opacity: listening ? 0.55 : 0,
          backdropFilter: listening ? 'blur(2px)' : 'blur(0)',
          transition: `opacity 350ms ${EASE_CINEMATIC}, backdrop-filter 350ms ${EASE_CINEMATIC}`,
        }}
      />

      <div
        aria-hidden={!listening}
        className='fixed inset-x-0 bottom-28 z-50 flex justify-center pointer-events-none px-6'
        style={{
          opacity: listening ? 1 : 0,
          transform: listening
            ? 'translateY(0) scale(1)'
            : 'translateY(16px) scale(0.96)',
          transition: `opacity 350ms ${EASE_CINEMATIC}, transform 350ms ${EASE_CINEMATIC}`,
        }}
      >
        <div className='pointer-events-auto rounded-3xl backdrop-blur-2xl bg-(--linear-app-content-surface)/90 border border-(--linear-app-shell-border) shadow-[0_24px_72px_rgba(0,0,0,0.45)] px-6 py-5 flex flex-col items-center gap-4 w-[480px] max-w-full'>
          <div className='flex items-center gap-3 self-start'>
            <span className='relative h-8 w-8 rounded-full bg-primary text-on-primary grid place-items-center'>
              <Mic className='h-3.5 w-3.5' strokeWidth={2.5} />
              <span
                aria-hidden='true'
                className='absolute inset-0 rounded-full ring-2 ring-primary/40 anim-calm-halo'
              />
            </span>
            <div className='flex-1 min-w-0'>
              <div className='text-[14px] font-semibold text-primary-token leading-tight'>
                Listening
              </div>
              <div className='text-[11.5px] text-tertiary-token leading-tight mt-0.5'>
                &ldquo;play Take Me Over&rdquo; · &ldquo;find the extended
                mix&rdquo;
              </div>
            </div>
            <kbd className='text-[10px] text-quaternary-token tabular-nums shrink-0'>
              hold ⌘J
            </kbd>
          </div>
          <DictationWaveform active={listening} />
        </div>
      </div>
    </>
  );
}

// 32-bar live waveform driven by staggered CSS keyframes so the
// envelope reads as organic speech. Bars only animate when active
// (paused otherwise) so the component costs nothing at rest.
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

const FIELD_LABEL: Record<FilterField, string> = {
  artist: 'Artist',
  title: 'Title',
  album: 'Album',
  status: 'Status',
  bpm: 'BPM',
  key: 'Key',
  has: 'Has',
};

const STATUS_VALUES = [
  'live',
  'scheduled',
  'announced',
  'draft',
  'hidden',
] as const;
const HAS_VALUES = ['video', 'canvas'] as const;

type Suggestion =
  | { kind: 'value'; field: FilterField; value: string; score: number }
  | { kind: 'field'; field: FilterField; score: number };

function fuzzy(needle: string, hay: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  // initials match: "fo" matches "Frank Ocean"
  const initials = h
    .split(/[^a-z0-9]+/)
    .map(w => w[0])
    .join('');
  if (initials.startsWith(n)) return 70;
  // char-in-order subsequence
  let i = 0;
  for (const c of h) {
    if (c === n[i]) i++;
    if (i === n.length) return 30;
  }
  return 0;
}

// Slash aliases — `/track` maps to title.
const SLASH_ALIAS: Record<string, FilterField> = {
  track: 'title',
};

type SlashParse =
  | null
  | { kind: 'choosing'; query: string }
  | { kind: 'scoped'; field: FilterField; query: string };

function parseSlash(text: string): SlashParse {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  const space = rest.indexOf(' ');
  if (space === -1) return { kind: 'choosing', query: rest };
  const cmd = rest.slice(0, space).toLowerCase();
  const query = rest.slice(space + 1);
  const aliased = SLASH_ALIAS[cmd];
  if (aliased) return { kind: 'scoped', field: aliased, query };
  const matched = (Object.keys(FIELD_LABEL) as FilterField[]).find(
    f => f === cmd || FIELD_LABEL[f].toLowerCase() === cmd
  );
  if (matched) return { kind: 'scoped', field: matched, query };
  return { kind: 'choosing', query: rest };
}

function fieldValueOptions(
  field: FilterField,
  artistOptions: string[],
  titleOptions: string[],
  albumOptions: string[]
): string[] {
  switch (field) {
    case 'artist':
      return artistOptions;
    case 'title':
      return titleOptions;
    case 'album':
      return albumOptions;
    case 'status':
      return [...STATUS_VALUES];
    case 'has':
      return [...HAS_VALUES];
    case 'bpm':
    case 'key':
      return [];
  }
}

function PillSearch({
  active,
  pills,
  onPillsChange,
  artistOptions,
  titleOptions,
  albumOptions,
  onClose,
}: {
  active: boolean;
  pills: FilterPill[];
  onPillsChange: (next: FilterPill[]) => void;
  artistOptions: string[];
  titleOptions: string[];
  albumOptions: string[];
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [active]);

  function changeText(value: string) {
    setText(value);
    setHighlight(0);
    // Open dropdown whenever there is content; close when empty.
    setDropdownOpen(value.length > 0);
  }

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!text) return [];
    const slash = parseSlash(text);

    // Slash-mode: choosing a field after `/`
    if (slash && slash.kind === 'choosing') {
      const q = slash.query.toLowerCase();
      const fields = Object.keys(FIELD_LABEL) as FilterField[];
      const acc: Suggestion[] = [];
      for (const f of fields) {
        const labelMatch = fuzzy(q, FIELD_LABEL[f]);
        const aliasMatch = Object.entries(SLASH_ALIAS).reduce(
          (m, [alias, target]) =>
            target === f ? Math.max(m, fuzzy(q, alias)) : m,
          0
        );
        const score = Math.max(labelMatch, aliasMatch);
        if (q === '') {
          acc.push({ kind: 'field', field: f, score: 100 });
        } else if (score > 0) {
          acc.push({ kind: 'field', field: f, score });
        }
      }
      return acc.sort((a, b) => b.score - a.score).slice(0, 8);
    }

    // Slash-mode: scoped value search e.g. "/artist Bah"
    if (slash && slash.kind === 'scoped') {
      const q = slash.query.toLowerCase().trim();
      const opts = fieldValueOptions(
        slash.field,
        artistOptions,
        titleOptions,
        albumOptions
      );
      return opts
        .map(v => ({
          kind: 'value' as const,
          field: slash.field,
          value: v,
          score: fuzzy(q, v),
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    // Free-text mode: fuzzy across all major axes.
    const q = text.trim();
    const out: Suggestion[] = [];
    artistOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'artist', value: v, score: s + 5 });
    });
    titleOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'title', value: v, score: s });
    });
    albumOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'album', value: v, score: s });
    });
    STATUS_VALUES.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'status', value: v, score: s });
    });
    HAS_VALUES.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0) out.push({ kind: 'value', field: 'has', value: v, score: s });
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 8);
  }, [text, artistOptions, titleOptions, albumOptions]);

  function commitSuggestion(sug: Suggestion) {
    if (sug.kind === 'value') {
      const merged = pills.map(p =>
        p.field === sug.field && p.op === 'is' && !p.values.includes(sug.value)
          ? { ...p, values: [...p.values, sug.value] }
          : p
      );
      const hadField = pills.some(p => p.field === sug.field && p.op === 'is');
      onPillsChange(
        hadField
          ? merged
          : [
              ...pills,
              {
                id: `${sug.field}-${sug.value}-${Date.now()}`,
                field: sug.field,
                op: 'is',
                values: [sug.value],
              },
            ]
      );
      // After committing a pill: close the menu and clear text so the user
      // can type freely (or hit `/` to summon the menu again).
      setText('');
      setDropdownOpen(false);
      setHighlight(0);
    } else {
      // Field selected from slash menu → scope subsequent typing to it.
      setText(`/${FIELD_LABEL[sug.field]} `);
      setDropdownOpen(true);
      setHighlight(0);
    }
  }

  function togglePillOp(id: string) {
    onPillsChange(
      pills.map(p =>
        p.id === id ? { ...p, op: p.op === 'is' ? 'is not' : 'is' } : p
      )
    );
  }
  function removePill(id: string) {
    onPillsChange(pills.filter(p => p.id !== id));
  }
  function removeValue(pillId: string, value: string) {
    onPillsChange(
      pills
        .map(p =>
          p.id === pillId
            ? { ...p, values: p.values.filter(v => v !== value) }
            : p
        )
        .filter(p => p.values.length > 0)
    );
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(suggestions.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sug = suggestions[highlight];
      if (sug) commitSuggestion(sug);
    } else if (e.key === 'Backspace' && text === '' && pills.length > 0) {
      e.preventDefault();
      onPillsChange(pills.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (text) {
        changeText('');
      } else {
        onClose();
      }
    }
  }

  return (
    <div className='relative w-full'>
      <div className='flex items-center gap-1.5 flex-wrap min-h-7 pr-1'>
        <Search
          className='h-3.5 w-3.5 text-quaternary-token shrink-0'
          strokeWidth={2.25}
        />
        {pills.map(p => (
          <PillChip
            key={p.id}
            pill={p}
            onToggleOp={() => togglePillOp(p.id)}
            onRemove={() => removePill(p.id)}
            onRemoveValue={v => removeValue(p.id, v)}
          />
        ))}
        <input
          ref={inputRef}
          type='text'
          value={text}
          onChange={e => changeText(e.target.value)}
          onKeyDown={onInputKey}
          aria-label='Filter tracks'
          placeholder={
            pills.length === 0
              ? 'Type to filter — / for fields'
              : 'and… (/ for fields)'
          }
          className='flex-1 min-w-[120px] bg-transparent text-[13px] text-primary-token placeholder:text-tertiary-token outline-none'
        />
        <button
          type='button'
          onClick={onClose}
          className='shrink-0 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
          aria-label='Close search'
        >
          Esc
        </button>
      </div>

      {/* Suggestion dropdown */}
      {active && dropdownOpen && suggestions.length > 0 && (
        <div className='absolute left-0 right-0 top-9 z-40 rounded-lg border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_18px_60px_rgba(0,0,0,0.32)] py-1 max-h-[320px] overflow-y-auto'>
          {suggestions.map((sug, i) => (
            <button
              key={`${sug.kind}-${sug.kind === 'value' ? sug.field + sug.value : sug.field}`}
              type='button'
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => {
                e.preventDefault();
                commitSuggestion(sug);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-100 ease-out',
                i === highlight
                  ? 'bg-cyan-500/10 text-primary-token'
                  : 'text-secondary-token hover:bg-surface-1/60'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em]',
                  i === highlight
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'bg-surface-1 text-tertiary-token'
                )}
              >
                {FIELD_LABEL[sug.field]}
              </span>
              <span className='flex-1 truncate'>
                {sug.kind === 'value' ? (
                  sug.value
                ) : (
                  <span className='text-tertiary-token italic'>
                    Filter by {FIELD_LABEL[sug.field].toLowerCase()}…
                  </span>
                )}
              </span>
              {i === highlight && (
                <kbd className='text-[10px] text-quaternary-token shrink-0'>
                  ↵
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PillChip({
  pill,
  onToggleOp,
  onRemove,
  onRemoveValue,
}: {
  pill: FilterPill;
  onToggleOp: () => void;
  onRemove: () => void;
  onRemoveValue: (value: string) => void;
}) {
  return (
    <span className='group/pill inline-flex items-center h-[22px] rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[11.5px] font-caption text-secondary-token tracking-[-0.005em] overflow-hidden'>
      <span className='px-1.5 text-cyan-300/90 uppercase text-[10px] tracking-[0.06em] border-r border-cyan-500/20'>
        {FIELD_LABEL[pill.field]}
      </span>
      <button
        type='button'
        onClick={onToggleOp}
        className='px-1.5 text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
        title='Toggle is / is not'
      >
        {pill.op}
      </button>
      <span className='inline-flex items-center gap-0.5 pr-0.5'>
        {pill.values.map((v, i) => (
          <span key={v} className='inline-flex items-center'>
            {i > 0 && (
              <span className='px-0.5 text-quaternary-token uppercase text-[10px]'>
                or
              </span>
            )}
            <span className='inline-flex items-center bg-cyan-500/15 px-1.5 h-[18px] rounded text-cyan-100/95'>
              {v}
              <button
                type='button'
                onClick={() => onRemoveValue(v)}
                className='ml-1 text-cyan-300/70 hover:text-cyan-100 transition-colors duration-150 ease-out'
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          </span>
        ))}
      </span>
      <button
        type='button'
        onClick={onRemove}
        className='px-1.5 text-cyan-300/70 hover:text-cyan-100 transition-colors duration-150 ease-out'
        aria-label='Remove filter'
      >
        ×
      </button>
    </span>
  );
}

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

// Image generation card — clean attachment block. Shimmer + visible
// prompt while generating; aspect-correct preview + tap-to-lightbox
// once ready. Toolbar: download / copy / regenerate.
function _ThreadImageCard({
  prompt,
  status,
}: {
  prompt: string;
  status: 'generating' | 'ready';
}) {
  return (
    <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 overflow-hidden'>
      <div className='aspect-[16/10] relative bg-(--surface-2)'>
        {status === 'generating' ? (
          <div className='absolute inset-0 grid place-items-center'>
            <div
              className='absolute inset-0'
              style={{
                background:
                  'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 35%, rgba(103,232,249,0.06) 50%, rgba(255,255,255,0.04) 65%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.4s ease-in-out infinite',
              }}
            />
            <p className='relative text-[12px] text-tertiary-token text-center px-6'>
              Generating &ldquo;{prompt}&rdquo;
            </p>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          </div>
        ) : (
          <div
            className='absolute inset-0'
            style={{
              background:
                'radial-gradient(ellipse at 30% 20%, rgba(103,232,249,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0) 70%), linear-gradient(135deg, hsl(220, 35%, 14%), hsl(220, 30%, 6%))',
            }}
          />
        )}
      </div>
      <div className='flex items-center gap-2 px-3 h-9 border-t border-(--linear-app-shell-border)/60'>
        <Sparkles className='h-3 w-3 text-cyan-300/80' strokeWidth={2.25} />
        <span className='flex-1 text-[11.5px] text-tertiary-token truncate'>
          {prompt}
        </span>
        {status === 'ready' && (
          <span className='inline-flex items-center gap-0.5'>
            <ThreadCardIconBtn label='Download'>
              <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
            <ThreadCardIconBtn label='Copy'>
              <Copy className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
            <ThreadCardIconBtn label='Regenerate'>
              <Sparkles className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
          </span>
        )}
      </div>
    </div>
  );
}

// Audio card — minimal. Click play takes over the global audio bar at
// the bottom of the canvas (not parallel state). Inline play/pause
// stays synced with the global bar via the same isPlaying flag.
function _ThreadAudioCard({
  title,
  artist,
  duration,
}: {
  title: string;
  artist: string;
  duration: string;
}) {
  return (
    <div className='flex items-center gap-3 rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 px-3 py-2.5'>
      <div className='shrink-0 h-10 w-10 rounded bg-(--surface-2) grid place-items-center'>
        <Disc3 className='h-4 w-4 text-tertiary-token' strokeWidth={2.25} />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-[12.5px] font-medium text-primary-token truncate'>
          {title}
        </p>
        <p className='text-[11px] text-tertiary-token truncate'>
          {artist} · {duration}
        </p>
      </div>
      <button
        type='button'
        className='h-8 w-8 rounded-full grid place-items-center bg-white text-black hover:bg-white/90 transition-colors duration-150 ease-out'
        aria-label='Play in global player'
      >
        <Play
          className='h-3 w-3 translate-x-px'
          strokeWidth={2.5}
          fill='currentColor'
        />
      </button>
    </div>
  );
}

// Video card — inline thumbnail with play overlay. Click expand →
// cinematic full-screen (reuses the ScreeningRoom mode by switching
// canvas view to 'lyrics'; for the design pass we wire that
// transition next batch).
function _ThreadVideoCard({
  title,
  durationSec,
}: {
  title: string;
  durationSec: number;
}) {
  return (
    <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 overflow-hidden'>
      <button
        type='button'
        className='group/vid relative w-full aspect-[16/9] block'
        aria-label='Play video'
      >
        <span
          className='absolute inset-0'
          style={{
            background:
              'radial-gradient(ellipse at 60% 40%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%), linear-gradient(135deg, hsl(220, 30%, 12%), hsl(220, 30%, 4%))',
          }}
        />
        <span className='absolute inset-0 grid place-items-center'>
          <span className='h-12 w-12 rounded-full bg-white/95 text-black grid place-items-center group-hover/vid:scale-105 transition-transform duration-200 ease-out'>
            <Play
              className='h-4 w-4 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          </span>
        </span>
        <span className='absolute bottom-2 right-2 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption tabular-nums text-primary-token bg-black/60 backdrop-blur'>
          {Math.floor(durationSec / 60)}:
          {String(durationSec % 60).padStart(2, '0')}
        </span>
      </button>
      <div className='flex items-center gap-2 px-3 h-9 border-t border-(--linear-app-shell-border)/60'>
        <Mic2 className='h-3 w-3 text-cyan-300/80' strokeWidth={2.25} />
        <span className='flex-1 text-[11.5px] text-tertiary-token truncate'>
          {title}
        </span>
        <ThreadCardIconBtn label='Full-screen'>
          <Maximize2 className='h-3 w-3' strokeWidth={2.25} />
        </ThreadCardIconBtn>
      </div>
    </div>
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
        <DspAvatarStack release={release} />
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

// DSP presence indicator — one primary glyph + "+N" pill, full list in a
// hover popover (max-height with internal scroll for overflow). Replaces
// the row-of-glyphs pattern that competed with the row's other affordances.
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
function DspAvatarStack({ release }: { release: Release }) {
  // Sort: live first (in DSP_ORDER), then pending/error, then missing.
  const ordered = [...DSP_ORDER].sort((a, b) => {
    const rank = { live: 0, pending: 1, error: 1, missing: 2 } as const;
    return rank[release.dsps[a]] - rank[release.dsps[b]];
  });
  const primary = ordered[0];
  const primaryStatus = release.dsps[primary];
  const liveCount = ordered.filter(d => release.dsps[d] === 'live').length;
  const others = Math.max(0, ordered.length - 1);

  return (
    <div className='relative inline-flex items-center gap-1.5 group/dsps'>
      <span
        className={cn(
          'relative h-[20px] w-[20px] rounded-full grid place-items-center text-[9px] font-semibold text-white shrink-0',
          'ring-2 ring-(--linear-bg-page)',
          primaryStatus === 'missing'
            ? 'bg-quaternary-token/40 opacity-50'
            : DSP_COLOR[primary]
        )}
      >
        {DSP_GLYPH[primary]}
        {primaryStatus === 'pending' && (
          <span
            aria-hidden='true'
            className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-(--linear-bg-page)'
          />
        )}
        {primaryStatus === 'error' && (
          <span
            aria-hidden='true'
            className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-1 ring-(--linear-bg-page)'
          />
        )}
      </span>
      {others > 0 && (
        <span className='inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-caption tabular-nums text-tertiary-token bg-(--surface-1)/70 border border-(--linear-app-shell-border)'>
          +{others}
        </span>
      )}

      {/* Popover — opens on row/group hover, anchored bottom-right. */}
      <div
        role='tooltip'
        className={cn(
          'pointer-events-none absolute right-0 top-full mt-1.5 z-40 w-[220px]',
          'opacity-0 translate-y-1 group-hover/dsps:opacity-100 group-hover/dsps:translate-y-0 group-hover/dsps:pointer-events-auto',
          'transition-[opacity,transform] duration-150 ease-out delay-[400ms] group-hover/dsps:delay-[400ms]'
        )}
      >
        <div className='rounded-md border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.32)] overflow-hidden'>
          <div className='flex items-center justify-between px-2.5 h-7 border-b border-(--linear-app-shell-border)/60'>
            <span className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
              Distribution
            </span>
            <span className='text-[10.5px] tabular-nums text-tertiary-token'>
              {liveCount}/{ordered.length} live
            </span>
          </div>
          <div className='max-h-[180px] overflow-y-auto'>
            {ordered.map(dsp => {
              const status = release.dsps[dsp];
              return (
                <div
                  key={dsp}
                  className='flex items-center gap-2 h-7 px-2.5 hover:bg-surface-1/40'
                >
                  <span
                    className={cn(
                      'h-[14px] w-[14px] rounded-full grid place-items-center text-[8px] font-semibold text-white shrink-0',
                      status === 'missing'
                        ? 'bg-quaternary-token/40 opacity-60'
                        : DSP_COLOR[dsp]
                    )}
                  >
                    {DSP_GLYPH[dsp]}
                  </span>
                  <span className='flex-1 text-[12px] text-secondary-token truncate'>
                    {DSP_LABEL[dsp]}
                  </span>
                  <span className='inline-flex items-center gap-1.5'>
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        DSP_STATUS_DOT[status]
                      )}
                    />
                    <span className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token'>
                      {status}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Linear-style stacked chips: dots collapsed by default, expand to labelled
// pills on row hover. Replaced by DspAvatarStack on the row, kept around
// for the upcoming Tracks view's status column.
function _ChipStack({ release }: { release: Release }) {
  const dspChips = DSP_ORDER.map(dsp => ({
    key: `dsp-${dsp}`,
    label: DSP_LABEL[dsp],
    tone: dspTone(release.dsps[dsp]),
  }));
  const tasksChip =
    release.tasksOpen > 0
      ? {
          key: 'tasks',
          label: `${release.tasksOpen} tasks`,
          tone: 'amber' as const,
        }
      : null;
  const pitchChip = release.pitchReady
    ? { key: 'pitch', label: 'Pitch ready', tone: 'green' as const }
    : null;

  const chips = [
    ...dspChips,
    ...(tasksChip ? [tasksChip] : []),
    ...(pitchChip ? [pitchChip] : []),
  ];

  return (
    <div className='flex items-center gap-0.5 group-hover/row:gap-1 transition-[gap] duration-200 ease-out'>
      {chips.map(chip => (
        <span
          key={chip.key}
          className={cn(
            'inline-flex items-center h-5 rounded-full transition-[width,padding,background-color] duration-200 ease-out',
            'overflow-hidden whitespace-nowrap',
            chipBg(chip.tone),
            // collapsed = dot. expanded on row hover = pill with label.
            'w-1.5 px-0 group-hover/row:w-auto group-hover/row:px-1.5'
          )}
          title={chip.label}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              chipDot(chip.tone)
            )}
          />
          <span
            className={cn(
              'ml-1.5 text-[10.5px] font-caption tabular-nums tracking-[-0.01em]',
              chipLabel(chip.tone),
              'opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 ease-out'
            )}
          >
            {chip.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function dspTone(s: DspStatus) {
  if (s === 'live') return 'green' as const;
  if (s === 'pending') return 'amber' as const;
  if (s === 'error') return 'red' as const;
  return 'neutral' as const;
}
function chipBg(tone: 'green' | 'amber' | 'red' | 'neutral') {
  switch (tone) {
    case 'green':
      return 'bg-emerald-500/10 group-hover/row:bg-emerald-500/15';
    case 'amber':
      return 'bg-amber-500/10 group-hover/row:bg-amber-500/15';
    case 'red':
      return 'bg-rose-500/10 group-hover/row:bg-rose-500/15';
    default:
      return 'bg-surface-1';
  }
}
function chipDot(tone: 'green' | 'amber' | 'red' | 'neutral') {
  switch (tone) {
    case 'green':
      return 'bg-emerald-500';
    case 'amber':
      return 'bg-amber-500';
    case 'red':
      return 'bg-rose-500';
    default:
      return 'bg-quaternary-token/70';
  }
}
function chipLabel(tone: 'green' | 'amber' | 'red' | 'neutral') {
  switch (tone) {
    case 'green':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'amber':
      return 'text-amber-700 dark:text-amber-300';
    case 'red':
      return 'text-rose-700 dark:text-rose-300';
    default:
      return 'text-secondary-token';
  }
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
            {tab === 'lyrics' && <DrawerLyricsTab release={r} />}
            {tab === 'cues' && <DrawerCues release={r} onSeek={onSeek} />}
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
  const dropMeta = relativeDropMeta(release.releaseDate);
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

function relativeDropMeta(iso: string): {
  label: string;
  tone: 'past' | 'soon' | 'future';
} {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (days < -1) return { label: `${Math.abs(days)}d ago`, tone: 'past' };
  if (days === -1) return { label: 'Yesterday', tone: 'past' };
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days <= 7) return { label: `Drops in ${days}d`, tone: 'soon' };
  if (days <= 30) return { label: `Drops in ${days}d`, tone: 'future' };
  return {
    label: `Drops ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    tone: 'future',
  };
}

// Cross-fade between the rest icon and a confirmation glyph. Uses
// monochrome white at high opacity for the confirm state — the cyan
// accent was too attention-seeking for an action you fire constantly.
// Overview tab — clean stats triad + compact performance + drop date.
// No carded sections; sub-areas are separated by a hairline only.
function DrawerOverviewTab({ release }: { release: Release }) {
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
      <DrawerPerformance release={release} />
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

function DrawerLyricsTab({ release: _release }: { release: Release }) {
  return <LyricsList lines={MOCK_DRAWER_LYRICS} onEdit={() => undefined} />;
}

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'YTD';
const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'YTD', label: 'YTD', days: 120 },
];

function DrawerPerformance({ release }: { release: Release }) {
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
    <PerformanceCard
      title='Smart link'
      metricLabel='clicks'
      pointsByRange={pointsByRange}
      trend={trend}
      delta={release.weeklyDelta}
      initialRange='7d'
    />
  );
}

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

// Backwards-compat alias — old callers used `generateSparkline`.
function _generateSparkline(seed: number, target: number): number[] {
  return generatePerfPoints(seed, target, 14);
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

function DrawerCues({
  release,
  onSeek,
}: {
  release: Release;
  onSeek?: (id: string, sec: number) => void;
}) {
  return (
    <CuesPanel
      cues={release.cues}
      durationSec={release.durationSec}
      onSeek={onSeek ? sec => onSeek(release.id, sec) : undefined}
    />
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
        <StatusChip track={track} />
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

function _EnergyBars({ value }: { value: number }) {
  return (
    <span
      className='inline-flex items-end gap-[2px] h-3'
      title={`Energy ${value}/10`}
    >
      {[1, 2, 3, 4, 5].map(i => {
        const lit = value >= i * 2 - 1;
        return (
          <span
            key={i}
            className={cn(
              'w-[3px] rounded-sm',
              lit ? 'bg-secondary-token' : 'bg-quaternary-token/30'
            )}
            style={{ height: `${30 + i * 14}%` }}
          />
        );
      })}
    </span>
  );
}

function _RatingDots({ value }: { value: number }) {
  return (
    <span
      className='inline-flex items-center gap-[3px]'
      title={`Rating ${value}/5`}
    >
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i <= value ? 'bg-amber-400' : 'bg-quaternary-token/30'
          )}
        />
      ))}
    </span>
  );
}

// Artwork with a clean placeholder fallback when the image fails to load.
// Solid surface + first letter of the title — quiet, never looks broken.
function ArtworkThumb({
  src,
  title,
  size,
}: {
  src: string;
  title: string;
  size: number;
}) {
  // Preload via the Image() constructor so we can detect failures without
  // attaching onError to a <img> (sidesteps eslint @next/next/no-img-element
  // and biome's noninteractive-element rules — we never render an <img>).
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    if (typeof window === 'undefined') return;
    const img = new window.Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setErrored(true);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return (
    <div
      className='relative rounded-sm overflow-hidden shrink-0 bg-surface-1 grid place-items-center'
      style={{ height: size, width: size }}
    >
      {loaded && !errored ? (
        <span
          aria-hidden='true'
          className='absolute inset-0 bg-cover bg-center'
          style={{ backgroundImage: `url(${src})` }}
        />
      ) : (
        <span className='text-[10px] font-caption text-tertiary-token tracking-tight'>
          {title.trim().charAt(0).toUpperCase() || '·'}
        </span>
      )}
    </div>
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
function StatusChip({ track }: { track: Track }) {
  return <StatusBadge status={track.status} />;
}

const _STATUS_CHIP: Record<
  TrackStatus,
  {
    label: string;
    dot: string;
    dotBorder?: string;
    text: string;
    tooltip: string;
  }
> = {
  live: {
    label: 'Live',
    dot: 'bg-white/35',
    text: 'text-secondary-token',
    tooltip: 'Live on DSPs — calm default state',
  },
  scheduled: {
    label: 'Scheduled',
    dot: 'bg-amber-300/70',
    text: 'text-secondary-token',
    tooltip: 'Scheduled for release',
  },
  announced: {
    label: 'Announced',
    dot: 'bg-cyan-300/75',
    text: 'text-secondary-token',
    tooltip: 'Publicly announced — not yet live',
  },
  draft: {
    label: 'Draft',
    dot: 'bg-white/15',
    text: 'text-tertiary-token',
    tooltip: 'Draft — not yet released',
  },
  hidden: {
    label: 'Hidden',
    dot: 'bg-transparent',
    dotBorder: 'border-quaternary-token/45 border-dashed',
    text: 'text-quaternary-token',
    tooltip: 'Pulled / hidden from listeners',
  },
};

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
    case 'bpm':
      return String(t.bpm) === value;
    case 'key':
      return (
        t.keyNormal.toLowerCase() === v || t.keyCamelot.toLowerCase() === v
      );
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
        <StatusIcon
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
          <StatusIcon status={task.status} />
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

function _DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className='text-[10.5px] uppercase tracking-[0.12em] text-quaternary-token/85 font-medium pt-1'>
        {label}
      </dt>
      <dd className='min-w-0'>{children}</dd>
    </>
  );
}

// "Due in 3d" / "Due tomorrow" / "Due today" / "Due 5d ago" — full
// phrasing instead of a bare "in 3d" so the row reads like English.
// Soon-due tasks (≤ 2 days) get an amber tone to signal urgency.
// Label badges. First label is always visible. ≥ 2 labels collapse the
// rest into a "+N" chip that swaps to the full set on hover.
function StatusIcon({
  status,
  agentRunning,
}: {
  status: TaskStatus;
  agentRunning?: boolean;
}) {
  switch (status) {
    case 'backlog':
      return (
        <CircleDashed
          className='h-3.5 w-3.5 text-quaternary-token'
          strokeWidth={2.25}
        />
      );
    case 'todo':
      return (
        <CircleIcon
          className='h-3.5 w-3.5 text-tertiary-token'
          strokeWidth={2.25}
        />
      );
    case 'in_progress':
      // Half-filled circle: left half solid cyan, right half dotted
      // outline. When an agent is actively running the task we add a
      // subtle pulse so the row reads as "live".
      return (
        <svg
          viewBox='0 0 14 14'
          className={cn(
            'h-3.5 w-3.5 text-cyan-400',
            agentRunning && 'anim-calm-breath'
          )}
          aria-label={
            agentRunning ? 'In progress, agent running' : 'In progress'
          }
          role='img'
        >
          <title>In progress</title>
          <path d='M7 1 A6 6 0 0 0 7 13 Z' fill='currentColor' />
          <path
            d='M7 1 A6 6 0 0 1 7 13'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.5}
            strokeDasharray='1.5 1.7'
            strokeLinecap='round'
          />
        </svg>
      );
    case 'done':
      return (
        <span className='inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-emerald-500/85 text-(--linear-bg-page)'>
          <Check className='h-2.5 w-2.5' strokeWidth={3} />
        </span>
      );
    case 'cancelled':
      return (
        <CircleSlash
          className='h-3.5 w-3.5 text-quaternary-token/70'
          strokeWidth={2.25}
        />
      );
  }
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

// ---------------------------------------------------------------------------
// LyricsView — karaoke-style timed lyrics editor for the playing track.
// Same visual language as TasksView / TracksView: column header strip up top,
// big focused content in the middle, subtle sticky footer (timeline) at the
// bottom. The active line tracks `currentTimeSec`; clicking a cue marker or
// a line's time stamp seeks the playhead. Edit mode swaps the static lines
// for inline editable text with a grip + time-stamp affordance.
// ---------------------------------------------------------------------------
function LyricsView({
  track,
  durationSec,
  currentTimeSec,
  onSeek,
}: {
  track: TrackInfo;
  durationSec: number;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
}) {
  const [lines, setLines] = useState<LyricLine[]>(MOCK_LYRICS);
  const [editing, setEditing] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Active line = last line whose startSec <= currentTimeSec. -1 before the
  // first cue (intro instrumentation) so every line stays dim until it lands.
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startSec <= currentTimeSec) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTimeSec]);

  // Keep focusedIndex in lockstep with the playhead unless the user is
  // actively keyboard-navigating (J/K). For the design pass we just follow
  // the playhead — focusedIndex tracks activeIndex when not -1.
  useEffect(() => {
    if (activeIndex >= 0) setFocusedIndex(activeIndex);
  }, [activeIndex]);

  function handleKey(e: React.KeyboardEvent) {
    // J / ArrowDown → next line, K / ArrowUp → previous line.
    if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(lines.length - 1, i + 1));
    } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      // Enter on a focused line stamps it to the current playhead.
      e.preventDefault();
      stampLine(focusedIndex);
    }
  }

  function stampLine(index: number) {
    setLines(prev =>
      prev.map((l, i) => (i === index ? { ...l, startSec: currentTimeSec } : l))
    );
  }

  function updateLineText(index: number, text: string) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, text } : l)));
  }

  // Empty state for the design pass — toggled by clearing all lines from
  // the picker or starting fresh on a track with no lyrics yet.
  if (empty) {
    return (
      <section
        aria-label='Lyrics'
        className='flex h-full flex-col focus:outline-none'
      >
        <LyricsHeader
          track={track}
          editing={editing}
          onToggleEdit={() => setEditing(e => !e)}
          showEditToggle={false}
        />
        <div className='flex-1 min-h-0 grid place-items-center px-6'>
          <div className='max-w-md w-full px-6 py-8 text-center'>
            <div className='mx-auto h-10 w-10 grid place-items-center mb-4'>
              <Mic2
                className='h-4 w-4 text-quaternary-token'
                strokeWidth={2.25}
              />
            </div>
            <h2 className='text-[18px] font-display tracking-[-0.012em] text-primary-token'>
              No lyrics yet
            </h2>
            <p className='mt-2 text-[13px] leading-[1.55] text-tertiary-token'>
              Jovie will time them automatically and you can fine-tune timings
              line by line.
            </p>
            <div className='mt-5 flex items-center justify-center gap-2'>
              <button
                type='button'
                className='inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white text-black text-[12.5px] font-caption tracking-[-0.005em] hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out'
              >
                <Sparkles className='h-3.5 w-3.5' strokeWidth={2.25} />
                Transcribe with Jovie
              </button>
              <button
                type='button'
                onClick={() => {
                  setEmpty(false);
                  setEditing(true);
                }}
                className='inline-flex items-center h-8 px-4 rounded-full border border-(--linear-app-shell-border) bg-surface-1/60 text-[12.5px] font-caption text-secondary-token tracking-[-0.005em] transition-colors duration-150 ease-out hover:text-primary-token hover:bg-surface-1'
              >
                Paste lyrics
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: keyboard list root for J/K + Enter, mirrors TracksView
    <section
      className='flex h-full flex-col focus:outline-none'
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label='Lyrics'
    >
      <LyricsHeader
        track={track}
        editing={editing}
        onToggleEdit={() => setEditing(e => !e)}
        onClear={() => setEmpty(true)}
        showEditToggle
      />

      {/* Body — one big stack of lines. Active line full-bright, others dim.
          Centered horizontally; vertical scroll keeps long lyrics navigable
          without auto-scroll jank for the design pass. */}
      <div className='flex-1 min-h-0 overflow-y-auto'>
        <ul className='mx-auto max-w-2xl px-6 py-10 space-y-5'>
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const isFocused = i === focusedIndex;
            return (
              <LyricRow
                // biome-ignore lint/suspicious/noArrayIndexKey: lyric lines are positional in the timeline; multiple lines may share a startSec (e.g. mid-edit) so index is the only stable identity for this design-pass mock
                key={i}
                line={line}
                index={i}
                isActive={isActive}
                isFocused={isFocused}
                editing={editing}
                onFocus={() => setFocusedIndex(i)}
                onSeek={() => onSeek(line.startSec)}
                onStamp={() => stampLine(i)}
                onChangeText={text => updateLineText(i, text)}
              />
            );
          })}
        </ul>
      </div>

      <LyricsTimeline
        durationSec={durationSec}
        currentTimeSec={currentTimeSec}
        lines={lines}
        activeIndex={activeIndex}
        onSeek={onSeek}
      />
    </section>
  );
}

function LyricsHeader({
  track,
}: {
  track: TrackInfo;
  // Accept the legacy props but ignore them — Clear + Edit buttons
  // were dropped (Clear was a dev preview, Edit lived in the per-row
  // hover affordance once we added inline editing).
  editing?: boolean;
  onToggleEdit?: () => void;
  onClear?: () => void;
  showEditToggle?: boolean;
}) {
  const onEntityActivate = useEntityActivate();
  return (
    <div className='shrink-0 sticky top-0 z-10 bg-(--linear-app-content-surface) px-4 pt-3 pb-2 flex items-center gap-1.5 select-none text-[12.5px] font-caption tracking-[-0.012em]'>
      <EntityHoverLink
        entity={lookupArtistEntity(track.artist)}
        onActivate={onEntityActivate}
        className='decoration-dotted text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out truncate'
      >
        {track.artist}
      </EntityHoverLink>
      <ChevronRight
        aria-hidden='true'
        className='h-3 w-3 text-quaternary-token/60 shrink-0'
        strokeWidth={2.25}
      />
      <span className='text-primary-token truncate'>{track.title}</span>
    </div>
  );
}

function LyricRow({
  line,
  index,
  isActive,
  isFocused,
  editing,
  onFocus,
  onSeek,
  onStamp,
  onChangeText,
}: {
  line: LyricLine;
  index: number;
  isActive: boolean;
  isFocused: boolean;
  editing: boolean;
  onFocus: () => void;
  onSeek: () => void;
  onStamp: () => void;
  onChangeText: (text: string) => void;
}) {
  // Display mode — one big centered line that softly fades the dim-state
  // siblings. Click anywhere on the line to seek to its cue.
  if (!editing) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: list row delegates seek; keyboard handled by parent section
      // biome-ignore lint/a11y/useKeyWithClickEvents: parent section owns J/K/Enter; row click is a redundant pointer affordance
      <li
        onClick={onSeek}
        data-focused={isFocused && !isActive ? '' : undefined}
        className={cn(
          'group/lyric text-center cursor-pointer select-none',
          'transition-[color,opacity,transform] duration-[250ms] ease-out',
          isActive
            ? 'text-primary-token text-[28px] leading-[1.25] font-display tracking-[-0.018em] opacity-100'
            : 'text-tertiary-token text-[20px] leading-[1.35] font-display tracking-[-0.012em] opacity-60 hover:opacity-90 hover:text-secondary-token'
        )}
      >
        {line.text}
      </li>
    );
  }

  // Edit mode — grip on the left, time stamp + inline-editable text. Layout
  // is left-aligned (vs centered) so editors can scan / drag without the
  // text flying around as it grows.
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: row click focuses the row; nested controls handle the real interactions
    // biome-ignore lint/a11y/useKeyWithClickEvents: parent section owns J/K/Enter
    <li
      onClick={onFocus}
      data-focused={isFocused && !isActive ? '' : undefined}
      data-selected={isActive ? '' : undefined}
      className={cn(
        'group/lyricedit relative flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 ease-out',
        !isFocused && !isActive && 'hover:bg-surface-1/40',
        SELECTED_ROW_CLASSES
      )}
    >
      <span
        aria-hidden='true'
        className='shrink-0 text-quaternary-token/70 hover:text-secondary-token cursor-grab active:cursor-grabbing transition-colors duration-150 ease-out'
        title={`Drag to reorder line ${index + 1}`}
      >
        <GripVertical className='h-3.5 w-3.5' strokeWidth={2.25} />
      </span>
      <button
        type='button'
        onClick={e => {
          e.stopPropagation();
          onStamp();
        }}
        className={cn(
          'shrink-0 h-6 px-1.5 rounded text-[10.5px] tabular-nums font-caption transition-colors duration-150 ease-out',
          isActive
            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
            : 'text-tertiary-token bg-surface-1 border border-(--linear-app-shell-border) hover:text-primary-token hover:border-cyan-500/40'
        )}
        title='Stamp this line to the current playhead (Enter)'
      >
        {formatTime(line.startSec)}
      </button>
      <input
        type='text'
        value={line.text}
        onChange={e => onChangeText(e.target.value)}
        onFocus={onFocus}
        className={cn(
          'flex-1 min-w-0 bg-transparent outline-none text-[15px] font-display tracking-[-0.012em] placeholder:text-quaternary-token/60',
          isActive ? 'text-primary-token' : 'text-secondary-token'
        )}
        placeholder='Lyric line'
        aria-label={`Lyric line ${index + 1}`}
      />
    </li>
  );
}

function LyricsTimeline({
  durationSec,
  currentTimeSec,
  lines,
  activeIndex,
  onSeek,
}: {
  durationSec: number;
  currentTimeSec: number;
  lines: LyricLine[];
  activeIndex: number;
  onSeek: (sec: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, (currentTimeSec / durationSec) * 100));
  function handleScrub(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(durationSec, ratio * durationSec)));
  }
  return (
    <div className='shrink-0 border-t border-(--linear-app-shell-border)/50 bg-(--linear-app-content-surface)/95 backdrop-blur-md px-4 py-3'>
      <div className='flex items-center gap-3'>
        <span className='text-[10px] tabular-nums text-quaternary-token w-9 text-right shrink-0'>
          {formatTime(currentTimeSec)}
        </span>
        <button
          type='button'
          onClick={handleScrub}
          className='relative flex-1 h-6 rounded-full grid focus:outline-none'
          aria-label='Lyric timeline'
        >
          <span className='pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-(--linear-app-shell-border)' />
          <span
            className='pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-px bg-cyan-400/80 transition-[width] duration-150 ease-out'
            style={{ width: `${pct}%` }}
          />
          {/* Cue markers — one per lyric line, color-keyed by active state. */}
          {lines.map((line, i) => {
            const left = Math.max(
              0,
              Math.min(100, (line.startSec / durationSec) * 100)
            );
            const isActive = i === activeIndex;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: stable per-render index
                key={i}
                aria-hidden='true'
                className={cn(
                  'pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-colors duration-150 ease-out',
                  isActive
                    ? 'h-2 w-2 bg-cyan-300 shadow-[0_0_0_2px_rgb(34_211_238/0.18)]'
                    : 'h-1 w-1 bg-quaternary-token/80'
                )}
                style={{ left: `${left}%` }}
              />
            );
          })}
          <span
            aria-hidden='true'
            className='pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_0_3px_rgb(34_211_238/0.18)] transition-[left] duration-150 ease-out'
            style={{ left: `${pct}%` }}
          />
        </button>
        <span className='text-[10px] tabular-nums text-quaternary-token w-9 text-left shrink-0'>
          {formatTime(durationSec)}
        </span>
      </div>
    </div>
  );
}

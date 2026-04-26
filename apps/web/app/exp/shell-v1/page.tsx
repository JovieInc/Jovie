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
//   2. A central registry — see SHORTCUTS below — so we can ship a
//      "keyboard shortcuts" sheet later without hunting for them.
// Format: `⌘K`, `⌥/`, `Hold ⌘J`, `[`, `Esc`. Use `⌘` not `Cmd`, and `⌥`
// not `Alt`, for visual density.
const SHORTCUTS: Record<string, { keys: string; description: string }> = {
  search: { keys: '⌘K', description: 'Open search / filter bar' },
  searchSlash: { keys: '/', description: 'Open search (no modifier)' },
  toggleSidebar: { keys: '[', description: 'Toggle sidebar dock / float' },
  toggleSidebarTab: { keys: 'Tab', description: 'Toggle sidebar dock / float' },
  toggleBar: { keys: '`', description: 'Toggle audio bar in / out' },
  toggleBarAlt: { keys: '⌘\\', description: 'Toggle audio bar (alt)' },
  toggleWaveform: { keys: 'W', description: 'Toggle waveform drawer' },
  toggleLyrics: { keys: 'L', description: 'Open / close the lyrics view' },
  playPause: { keys: 'Space', description: 'Play / pause current track' },
  jovieDictate: { keys: 'Hold ⌘J', description: 'Push-to-talk to Jovie' },
  closeOverlay: { keys: 'Esc', description: 'Close overlay / clear input' },
};

import {
  Activity,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
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
  CircleDashed,
  Circle as CircleIcon,
  CircleSlash,
  Copy,
  Disc3,
  ExternalLink,
  Flag,
  GripVertical,
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
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
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
  | 'thread';

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
  title: string;
  artist: string;
  album: string;
  artwork: string;
  bpm: number;
  key: string;
  version: string;
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
  Obsidian: {
    // Inkier than Carbon, a touch more blue at the elevated surfaces.
    page: '#04060a',
    surface0: '#080a0f',
    surface1: '#0d1118',
    surface2: '#131822',
    contentSurface: '#070a10',
    border: '#141823',
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
  Slate: {
    // Mid-cool — same family as Cool Black with a hair more saturation.
    page: '#070a0e',
    surface0: '#0a0d12',
    surface1: '#11151c',
    surface2: '#171c25',
    contentSurface: '#0b0e14',
    border: '#181d26',
  },
};

// Inline Jovie brand mark — small SVG so the experiment file stays
// self-contained (the production Logo component imports next/image).
function JovieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 353.68 347.97'
      className={className}
      fill='currentColor'
      aria-hidden='true'
    >
      <title>Jovie</title>
      <path d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z' />
    </svg>
  );
}

// Most transitions snap (150ms ease-out). Layout transformations get
// a cinematic curve — the kind of thing you only get on macOS / Apple
// surfaces, where the system invests motion budget in revealing structure.
const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

// Selected/focused row treatment — electric cyan accent. Calibrated to
// stay invisible at low brightness (the "DJ on a red-eye flight" test):
// no outline ring, no glow halo, just an inset 2px left bar plus a
// barely-there 8% cyan bg tint. Hover bumps to 12%. Both data-focused
// (keyboard) and data-selected (drawer open) trigger it.
const SELECTED_ROW_CLASSES = [
  'data-[focused]:bg-[rgb(34_211_238/0.08)]',
  'data-[focused]:hover:bg-[rgb(34_211_238/0.12)]',
  'data-[focused]:shadow-[inset_2px_0_0_0_rgb(34_211_238)]',
  'data-[selected]:bg-[rgb(34_211_238/0.10)]',
  'data-[selected]:hover:bg-[rgb(34_211_238/0.14)]',
  'data-[selected]:shadow-[inset_2px_0_0_0_rgb(34_211_238)]',
].join(' ');

const TRACK = {
  title: 'Lost in the Light',
  artist: 'Bahamas',
  album: 'Bahamas Is Afie',
  version: 'Album Version',
  bpm: 96,
  key: 'A min',
  artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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

// Core items that span all artists / contexts (search, inbox, tasks).
const CORE_ITEMS: NavItem[] = [
  { icon: Inbox, label: 'Inbox' },
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273ed7d40b86b3a39b3c1d8cea5',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b27348fc7ad174126b1a51ea5b06',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273ed7d40b86b3a39b3c1d8cea5',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b27348fc7ad174126b1a51ea5b06',
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
  'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
  'https://i.scdn.co/image/ab67616d0000b273ed7d40b86b3a39b3c1d8cea5',
  'https://i.scdn.co/image/ab67616d0000b27348fc7ad174126b1a51ea5b06',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273ed7d40b86b3a39b3c1d8cea5',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b27348fc7ad174126b1a51ea5b06',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273ed7d40b86b3a39b3c1d8cea5',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b27348fc7ad174126b1a51ea5b06',
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
    artwork: 'https://i.scdn.co/image/ab67616d0000b273e3a35b5fc62c33ec0c2eed62',
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
    title: r.title,
    artist: r.artist,
    album: r.album,
    artwork: r.artwork,
    bpm: r.bpm,
    key: r.key,
    version: r.version,
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
  const [sidebarTight, setSidebarTight] = useState(false);
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

  // ScreeningRoom mode — chrome (sidebar, header, subheader, audio bar)
  // fades to 0 over 600ms while staying mounted. The canvas takes over.
  // Triggers when we're in a "full-screen canvas" view (lyrics today,
  // video viewer next). Exit via Esc (handled per view) or the floating
  // restore button bottom-right.
  const cinematic = view === 'lyrics';
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
        .shell-v1 :focus-visible {
          outline: 1.5px solid rgba(103, 232, 249, 0.45);
          outline-offset: 1px;
          border-radius: 4px;
        }
        .shell-v1 button:focus-visible,
        .shell-v1 [role='button']:focus-visible,
        .shell-v1 input:focus-visible,
        .shell-v1 textarea:focus-visible,
        .shell-v1 [tabindex='0']:focus-visible {
          outline: 1.5px solid rgba(103, 232, 249, 0.45);
          outline-offset: 1px;
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
          width: sidebarMode === 'docked' ? 224 : 0,
          opacity: cinematic ? 0 : sidebarMode === 'docked' ? 1 : 0,
          transform:
            sidebarMode === 'docked' ? 'translateX(0)' : 'translateX(-12px)',
          pointerEvents: cinematic ? 'none' : undefined,
          transition: `width ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity 600ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
        aria-hidden={sidebarMode !== 'docked' || cinematic}
      >
        <Sidebar
          variant='docked'
          onPin={() => setSidebarMode('floating')}
          onSelectView={setView}
          activeView={view}
          tight={sidebarTight}
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
        active={sidebarMode === 'floating'}
        peekOpen={peekOpen}
        onSetPeekOpen={setPeekOpen}
        onPin={() => {
          setPeekOpen(false);
          setSidebarMode('docked');
        }}
        onSelectView={setView}
        activeView={view}
        tight={sidebarTight}
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
      />

      {/* Detailed now-playing — visible when the audio bar is OPEN.
          Sits flush with the main content area's left edge (not under
          the sidebar). Carries full info (album art + title + chips).
          When the bar collapses, the COMPACT version takes over — it
          renders inside the sidebar bottom slot. The two never appear
          together. */}
      <div
        aria-hidden={barCollapsed}
        className='hidden lg:block fixed bottom-2 z-30 w-[224px]'
        style={{
          left: sidebarMode === 'docked' ? (sidebarTight ? 220 : 232) : 8,
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

      <div className='flex min-h-0 min-w-0 flex-1 flex-col lg:gap-2'>
        <main className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-0 lg:rounded-[var(--linear-app-shell-radius)] lg:border lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)]'>
          <div style={cinematicStyle}>
            <Header
              sidebarMode={sidebarMode}
              onToggleSidebar={() =>
                setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'))
              }
              searchOpen={searchOpen}
              searchPills={searchPills}
              onSearchOpenChange={setSearchOpen}
              onPillsChange={setSearchPills}
              artistOptions={artistOptions}
              titleOptions={titleOptions}
              albumOptions={albumOptions}
              view={view}
            />
          </div>
          <div style={cinematicStyle}>
            <CanvasSubheader
              subviews={subviewsForView(view, RELEASES, TRACKS, TASKS)}
              subview={subview}
              onSubview={setSubview}
              rightRailOpen={selectedReleaseId !== null}
              onToggleRightRail={() =>
                setSelectedReleaseId(id =>
                  id === null ? (RELEASES[0]?.id ?? null) : null
                )
              }
              onOpenSearch={() => setSearchOpen(true)}
              onAddView={
                view === 'releases'
                  ? () => console.info('[shell-v1] save current filter as view')
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
                ) : undefined
              }
            />
          </div>
          <div className='relative flex-1 min-h-0 overflow-hidden flex'>
            <div className='flex-1 min-h-0 min-w-0 overflow-y-auto'>
              {view === 'demo' ? (
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
              aria-hidden={!(view === 'releases' && selectedReleaseId !== null)}
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
                      ? (RELEASES.find(r => r.id === selectedReleaseId) ?? null)
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
                />
              </div>
            </div>
          </div>
        </main>

        {/* Peek-bottom restore affordance — when the audio bar is collapsed,
            a 4px hairline strip at the bottom of the canvas pulses subtly
            and expands the bar on hover/click. Combined with the ` shortcut
            and the now-playing card, that's three discoverable paths back. */}
        {barCollapsed && (
          <button
            type='button'
            onClick={() => setBarCollapsed(false)}
            aria-label='Show audio bar (`)'
            className='group/peek shrink-0 h-2 -mt-1 px-2 hidden lg:flex items-end justify-center'
          >
            <span
              aria-hidden='true'
              className='h-[3px] w-[80px] rounded-full bg-cyan-300/30 group-hover/peek:bg-cyan-300/70 group-hover/peek:w-[120px] transition-[width,background-color] duration-200 ease-out'
            />
          </button>
        )}

        <div
          aria-hidden={barCollapsed || cinematic}
          className='overflow-hidden transition-[max-height,opacity] duration-150 ease-out'
          style={{
            maxHeight: barCollapsed || cinematic ? 0 : 80,
            opacity: barCollapsed || cinematic ? 0 : 1,
            pointerEvents: cinematic ? 'none' : undefined,
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
          />
        </div>
      </div>

      {/* Mobile/tablet floating playback cards (lg+ uses the full bar) */}
      {!barCollapsed && (
        <>
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
        </>
      )}

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
        sidebarTight={sidebarTight}
        onSidebarTight={() => setSidebarTight(v => !v)}
      />

      <JovieOverlay listening={jovieListening} />
      <ShellLoader phase={loaderPhase} />
      {/* ScreeningRoom restore button — appears bottom-right when in
          cinematic mode. Click or Esc returns to chrome view. */}
      <button
        type='button'
        onClick={() => setView('demo')}
        aria-label='Exit screening room (Esc)'
        className='fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-caption uppercase tracking-[0.06em] text-tertiary-token bg-(--linear-app-content-surface)/85 backdrop-blur-xl border border-(--linear-app-shell-border) hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
        style={{
          opacity: cinematic ? 1 : 0,
          pointerEvents: cinematic ? 'auto' : 'none',
          transition: `opacity 600ms ${EASE_CINEMATIC}`,
        }}
      >
        <X className='h-3 w-3' strokeWidth={2.25} />
        Exit cinema
      </button>
      <ContextMenuOverlay
        state={contextMenu}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}

// Cold-start loader. Black canvas with the Jovie mark blooming centered,
// then gliding toward where it lives in the sidebar (~24px x 24px from
// top-left of the page) while the app fades in underneath. The mark in
// the sidebar takes over visually at the end. Pointer-events disabled
// throughout so first interactions don't accidentally land on the overlay.
function ShellLoader({ phase }: { phase: 'bloom' | 'reveal' | 'done' }) {
  if (phase === 'done') return null;
  const isReveal = phase === 'reveal';
  // Calm bloom: logo holds centered, then fades + scales up subtly (no
  // flight path). Background fades from solid to transparent so the app
  // reveals underneath without the logo "going somewhere."
  return (
    <div
      aria-hidden='true'
      className='fixed inset-0 z-[60] pointer-events-none grid place-items-center'
      style={{
        background: isReveal ? 'rgba(6,7,10,0)' : 'rgba(6,7,10,1)',
        transition: `background-color 480ms ${EASE_CINEMATIC}`,
      }}
    >
      <div
        style={{
          transform: isReveal ? 'scale(1.08)' : 'scale(1)',
          opacity: isReveal ? 0 : 1,
          transition: `transform 520ms ${EASE_CINEMATIC}, opacity 380ms ${EASE_CINEMATIC}`,
        }}
      >
        <JovieMark className='h-12 w-12 text-primary-token' />
      </div>
    </div>
  );
}

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
}) {
  const inLibraryMode = !!libraryProps;
  const inSettingsMode = !!settingsProps;
  const inContextMode = inLibraryMode || inSettingsMode;
  const contextLabel = inLibraryMode ? 'Library' : 'Settings';
  const collapsed = false;
  // Pin button stays visible briefly after the sidebar appears or when the
  // user hovers it. Otherwise it gets out of the way.
  const [pinVisible, setPinVisible] = useState(true);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function bumpPinVisibility() {
    setPinVisible(true);
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => setPinVisible(false), 3000);
  }

  useEffect(() => {
    bumpPinVisibility();
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, [variant]);
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
          chip, mirroring the Linear settings nav pattern. */}
      <div className={cn('px-2', tight ? 'pt-2 pb-2' : 'pt-3 pb-4')}>
        <div className='relative flex items-center h-7 gap-2.5'>
          {inContextMode ? (
            <button
              type='button'
              onClick={() => onSelectView?.('demo')}
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
                {contextLabel}
              </span>
            </button>
          ) : (
            <UserMenu>
              <span className='flex-1 inline-flex items-center gap-2.5 h-7 pl-3 pr-2 rounded-md hover:bg-surface-1/60 transition-colors duration-150 ease-out cursor-pointer min-w-0'>
                <JovieMark className='h-4 w-4 shrink-0 text-primary-token' />
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
            onClick={onPin}
            className='absolute right-2 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-[opacity,color,background-color] duration-300 ease-out'
            style={{
              opacity: pinVisible ? 1 : 0,
              pointerEvents: pinVisible ? 'auto' : 'none',
            }}
            aria-label={
              variant === 'floating'
                ? 'Dock sidebar'
                : 'Float sidebar (auto-hide)'
            }
            title={
              variant === 'floating'
                ? 'Dock sidebar'
                : 'Float sidebar (auto-hide)'
            }
            tabIndex={pinVisible ? 0 : -1}
          >
            {variant === 'floating' ? (
              <Pin className='h-2.5 w-2.5' strokeWidth={2.25} />
            ) : (
              <PinOff className='h-2.5 w-2.5' strokeWidth={2.25} />
            )}
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

      {/* Sidebar-bottom now-playing — simplified compact player.
          Visible only when the audio bar is COLLAPSED. The detailed
          floating card (with chips) takes over when the bar opens, and
          slides under the main content area's left edge. Two states,
          two surfaces, never co-resident. */}
      <div
        aria-hidden={nowPlaying?.barCollapsed === false}
        className='shrink-0 px-2 pb-2 pt-1 overflow-hidden'
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
                  tight ? 'h-6 pl-2.5 pr-2' : 'h-7 pl-3 pr-2'
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
                  the row anywhere also opens the same menu. */}
              <button
                type='button'
                onClick={e => onThreadContextMenu?.(e, t)}
                aria-label='Thread actions'
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-opacity duration-150 ease-out',
                  'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100'
                )}
              >
                <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
              </button>
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
    <div className='px-1 space-y-2'>
      <div className='flex items-center gap-2.5'>
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
      <div className='flex items-center gap-1 flex-wrap'>
        <Chip>{track.bpm} BPM</Chip>
        <Chip>{track.key}</Chip>
        <Chip>{track.version}</Chip>
      </div>
    </div>
  );
}

function ArtworkPlayOverlay({
  isPlaying,
  onPlay,
  visible,
}: {
  isPlaying: boolean;
  onPlay: () => void;
  visible: boolean;
}) {
  return (
    <button
      type='button'
      onClick={onPlay}
      className={cn(
        'absolute inset-0 grid place-items-center bg-black/50 text-white transition-opacity duration-150 ease-out hover:opacity-100',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      tabIndex={visible ? 0 : -1}
    >
      {isPlaying ? (
        <Pause className='h-3.5 w-3.5' />
      ) : (
        <Play className='h-3.5 w-3.5' />
      )}
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className='inline-flex items-center h-[18px] px-[7px] rounded text-[10px] font-caption text-secondary-token border border-(--linear-app-shell-border) bg-surface-1/40 tracking-[-0.01em]'>
      {children}
    </span>
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
  rightRailOpen,
  onToggleRightRail,
  onOpenSearch,
  extraToolbar,
  onAddView,
}: {
  subviews: { id: string; label: string; count?: number }[];
  subview: string;
  onSubview: (id: string) => void;
  rightRailOpen: boolean;
  onToggleRightRail: () => void;
  onOpenSearch: () => void;
  // Optional view-specific toolbar slot, rendered inline before the
  // shared search + panel-right buttons. Used by Library to host its
  // sort dropdown + grid/table toggle without owning its own header.
  extraToolbar?: React.ReactNode;
  // When provided, renders a trailing "+" chip after the subview pills
  // — entry point for saving the current filter combination as a new
  // view. Releases and Library opt-in.
  onAddView?: () => void;
}) {
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
      <div className='ml-auto flex items-center gap-1.5'>
        {extraToolbar}
        <Tooltip label='Search' shortcut='search'>
          <button
            type='button'
            onClick={onOpenSearch}
            className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
            aria-label='Search (⌘K)'
          >
            <Search className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
        <Tooltip label={rightRailOpen ? 'Hide details' : 'Show details'}>
          <button
            type='button'
            onClick={onToggleRightRail}
            className={cn(
              'h-7 w-7 rounded-md grid place-items-center transition-colors duration-150 ease-out',
              rightRailOpen
                ? 'text-primary-token bg-surface-1/60'
                : 'text-quaternary-token hover:text-primary-token hover:bg-surface-1/60'
            )}
            aria-label='Toggle right rail'
          >
            <PanelRight className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
      </div>
    </div>
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
    <header className='shrink-0 h-12 px-3 flex items-center gap-2'>
      <Tooltip
        label={sidebarHidden ? 'Dock sidebar' : 'Hide sidebar'}
        shortcut='toggleSidebar'
      >
        <button
          type='button'
          onClick={onToggleSidebar}
          className='h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out shrink-0'
          aria-label={
            sidebarHidden
              ? 'Dock sidebar ([)'
              : 'Hide sidebar — peek on left edge ([)'
          }
        >
          {sidebarHidden ? (
            <ChevronRight className='h-3.5 w-3.5' strokeWidth={2.25} />
          ) : (
            <ChevronLeft className='h-3.5 w-3.5' strokeWidth={2.25} />
          )}
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
      className='inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors duration-150 ease-out'
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className='relative flex-1 min-w-0'>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='w-full text-left'
        aria-label='Account menu'
        aria-expanded={open}
      >
        {children}
      </button>
      {open && (
        <div className='absolute left-0 top-9 w-[212px] rounded-lg border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_12px_40px_rgba(0,0,0,0.32)] p-1 z-50'>
          <div className='px-2 py-2 border-b border-(--linear-app-shell-border)/60 mb-1'>
            <div className='text-[12.5px] font-caption text-primary-token leading-tight'>
              Tim White
            </div>
            <div className='text-[11px] text-tertiary-token leading-tight mt-0.5'>
              t@timwhite.co
            </div>
          </div>
          <MenuItem icon={Settings} label='Settings' />
          <MenuItem icon={Shield} label='Admin' />
          <div className='border-t border-(--linear-app-shell-border)/60 my-1' />
          <MenuItem icon={LogOut} label='Sign out' />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
}: {
  icon: typeof Settings;
  label: string;
}) {
  return (
    <button
      type='button'
      className='w-full flex items-center gap-2.5 px-2 h-7 rounded-md text-[12.5px] text-secondary-token hover:bg-surface-1 hover:text-primary-token'
    >
      <Icon className='h-3.5 w-3.5' />
      {label}
    </button>
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

  return (
    <div className='h-full flex flex-col px-6 pb-4'>
      {/* Suggestion focus zone — greeting + intro + card all sit together
          as one connected unit, vertically centered. The card is the hero;
          the greeting is its setup, not a separate strip way up top. */}
      <div className='flex-1 grid place-items-center min-h-0'>
        <div className='w-full max-w-[480px] flex flex-col items-center'>
          <div className='shrink-0 text-center pb-5'>
            <h1
              className='text-[20px] font-semibold text-primary-token'
              style={{ letterSpacing: '-0.018em' }}
            >
              {greeting}
            </h1>
          </div>

          <SuggestionCard suggestion={current} />

          {/* Tight control row — View all on the left, dot pagination
              centered, prev/next on the right. One row, all aligned. */}
          <div className='mt-4 flex items-center justify-between gap-3 w-full'>
            <button
              type='button'
              className='text-[11.5px] text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
            >
              View all
            </button>
            <div className='flex items-center gap-1.5'>
              {sorted.map((s, i) => (
                <button
                  key={s.id}
                  type='button'
                  onClick={() => setIndex(i)}
                  aria-label={`Suggestion ${i + 1} of ${sorted.length}`}
                  className={cn(
                    'h-1 rounded-full transition-[width,background-color] duration-200 ease-out',
                    i === index
                      ? 'w-5 bg-primary-token'
                      : 'w-1 bg-quaternary-token/45 hover:bg-tertiary-token'
                  )}
                />
              ))}
            </div>
            <div className='flex items-center gap-0.5'>
              <Tooltip label='Previous'>
                <button
                  type='button'
                  onClick={() =>
                    setIndex(i => (i === 0 ? sorted.length - 1 : i - 1))
                  }
                  className='h-6 w-6 rounded-full grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
                  aria-label='Previous suggestion'
                >
                  <ChevronLeft className='h-3 w-3' strokeWidth={2.25} />
                </button>
              </Tooltip>
              <Tooltip label='Next'>
                <button
                  type='button'
                  onClick={() =>
                    setIndex(i => (i === sorted.length - 1 ? 0 : i + 1))
                  }
                  className='h-6 w-6 rounded-full grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
                  aria-label='Next suggestion'
                >
                  <ChevronRight className='h-3 w-3' strokeWidth={2.25} />
                </button>
              </Tooltip>
            </div>
          </div>
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

// Apple-esque suggestion card. No caption, no top-right Jovie label —
// the card IS Jovie. Title leads. Body is short. Primary action and
// dismiss balance to the right edge so the eye lands on the action.
function SuggestionCard({ suggestion }: { suggestion: JovieSuggestion }) {
  return (
    <article
      key={suggestion.id}
      className='w-full rounded-2xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) px-6 py-5'
      style={{
        opacity: 1,
        transition: `opacity 220ms ${EASE_CINEMATIC}`,
      }}
    >
      <h2
        className='text-[19px] font-semibold leading-snug text-primary-token'
        style={{ letterSpacing: '-0.018em' }}
      >
        {suggestion.title}
      </h2>
      <p className='mt-2 text-[13px] leading-relaxed text-secondary-token'>
        {suggestion.body}
      </p>
      <div className='mt-5 flex items-center justify-end gap-1.5'>
        <button
          type='button'
          className='inline-flex items-center h-8 px-3 rounded-full text-[12.5px] text-tertiary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        >
          Dismiss
        </button>
        <button
          type='button'
          className='inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12.5px] font-medium bg-white text-black hover:bg-white/90 transition-colors duration-150 ease-out'
        >
          {suggestion.action}
          <ArrowRight className='h-3 w-3' strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}

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
        shortcut='playPause'
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
    <div className='flex items-center gap-1 justify-self-end'>
      <IconBtn
        label='Lyrics'
        shortcut='toggleLyrics'
        onClick={onOpenLyrics}
        active={lyricsActive}
        tooltipSide='top'
        tone='ghost'
      >
        <Mic2 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
      <IconBtn
        label={waveformOn ? 'Hide waveform' : 'Show waveform'}
        shortcut='toggleWaveform'
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
      <IconBtn label='Volume' tooltipSide='top' tone='ghost'>
        <Volume2 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
      <IconBtn
        label='Minimize player'
        shortcut='toggleBar'
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
      className='group/bar shrink-0 hidden lg:grid grid-cols-[1fr_minmax(360px,_720px)_1fr] gap-4 items-center px-4 py-2'
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

function ContextMenuOverlay({
  state,
  onClose,
}: {
  state: { x: number; y: number; items: ContextMenuItem[] } | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onClose]);

  // Clamp to viewport — flip up / left if the menu would overflow.
  useEffect(() => {
    if (!state || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = state.x;
    let top = state.y;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPos({ left, top });
  }, [state]);

  if (!state) return null;

  return (
    <div className='fixed inset-0 z-[60]'>
      <button
        type='button'
        aria-label='Close menu'
        tabIndex={-1}
        className='absolute inset-0 cursor-default'
        onClick={onClose}
        onContextMenu={e => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role='menu'
        className='absolute min-w-[200px] max-w-[280px] rounded-md border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)] py-1'
        style={{ left: pos.left, top: pos.top }}
      >
        {state.items.map(item => {
          if (item.kind === 'separator') {
            return (
              <div
                key={`sep-${state.items.indexOf(item)}`}
                className='h-px my-1 bg-(--linear-app-shell-border)/70'
              />
            );
          }
          const Icon = item.icon;
          const sc = item.shortcut
            ? typeof item.shortcut === 'string' && !(item.shortcut in SHORTCUTS)
              ? { keys: item.shortcut }
              : SHORTCUTS[item.shortcut as keyof typeof SHORTCUTS]
            : null;
          return (
            <button
              key={item.label}
              type='button'
              role='menuitem'
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onClose();
              }}
              className={cn(
                'group/mi w-full flex items-center gap-2 h-7 px-2 mx-1 rounded text-[12.5px] text-left transition-colors duration-150 ease-out',
                item.disabled
                  ? 'text-quaternary-token cursor-not-allowed'
                  : item.tone === 'danger'
                    ? 'text-rose-300 hover:text-rose-200 hover:bg-rose-500/10'
                    : 'text-secondary-token hover:text-primary-token hover:bg-surface-1/70'
              )}
              style={{ width: 'calc(100% - 8px)' }}
            >
              {Icon && (
                <Icon className='h-3.5 w-3.5 shrink-0' strokeWidth={2.25} />
              )}
              <span className='flex-1 truncate'>{item.label}</span>
              {sc && (
                <kbd className='inline-flex items-center h-4 min-w-4 px-1 rounded-[3px] text-[9.5px] font-caption uppercase tracking-[0.04em] text-quaternary-token bg-(--surface-2)/70 border border-(--linear-app-shell-border) leading-none'>
                  {sc.keys}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
            <TypeBadge type={release.type} />
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
function Tooltip({
  children,
  label,
  shortcut,
  side = 'bottom',
  className,
  block,
}: {
  children: React.ReactNode;
  label: string;
  shortcut?: keyof typeof SHORTCUTS;
  side?: 'top' | 'bottom' | 'right' | 'left';
  className?: string;
  // Use `block` for full-width triggers (sidebar nav rows). Default is
  // inline-flex which sizes to children — right for icon buttons.
  block?: boolean;
}) {
  const sc = shortcut ? SHORTCUTS[shortcut] : null;
  // Per-side: position + enter/exit transform pair (Tailwind JIT needs the
  // full class string at compile time so we list each variant out).
  const sideClasses =
    side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-1.5 translate-y-0.5 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
      : side === 'top'
        ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5 -translate-y-0.5 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
        : side === 'right'
          ? 'left-full top-1/2 -translate-y-1/2 ml-1.5 -translate-x-0.5 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0'
          : 'right-full top-1/2 -translate-y-1/2 mr-1.5 translate-x-0.5 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0';
  return (
    <span
      className={cn(
        'relative group/tip isolate',
        block ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {children}
      <span
        role='tooltip'
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap',
          'opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          'transition-[opacity,transform] duration-150 ease-out delay-[400ms] group-hover/tip:delay-[400ms] group-focus-within/tip:delay-[80ms]',
          sideClasses
        )}
      >
        <span className='inline-flex items-center gap-2 h-6 px-2 rounded-md text-[11px] font-caption text-primary-token bg-(--linear-app-content-surface)/95 border border-(--linear-app-shell-border) backdrop-blur-xl shadow-[0_6px_20px_rgba(0,0,0,0.28)]'>
          <span className='leading-none'>{label}</span>
          {sc && (
            <kbd className='inline-flex items-center h-4 min-w-4 px-1 rounded-[3px] text-[9.5px] font-caption uppercase tracking-[0.04em] text-tertiary-token bg-surface-0/80 border border-(--linear-app-shell-border) leading-none'>
              {sc.keys}
            </kbd>
          )}
        </span>
      </span>
    </span>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  shortcut,
  tooltipSide = 'bottom',
  tone = 'default',
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  shortcut?: keyof typeof SHORTCUTS;
  tooltipSide?: 'top' | 'bottom' | 'right' | 'left';
  // 'default' adds a subtle bg on hover/active (sidebar, header, drawer).
  // 'ghost' drops the bg entirely — icon brightens to white on hover or
  // when active. Used in the audio bar so the row feels like a dock,
  // not a stack of cards.
  tone?: 'default' | 'ghost';
}) {
  const isGhost = tone === 'ghost';
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type='button'
        onClick={onClick}
        className={cn(
          'h-7 w-7 rounded-md grid place-items-center transition-colors duration-150 ease-out',
          isGhost
            ? active
              ? 'text-primary-token'
              : 'text-quaternary-token hover:text-primary-token'
            : active
              ? 'text-primary-token bg-surface-1/60'
              : 'text-quaternary-token hover:text-primary-token hover:bg-surface-1/60'
        )}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

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
  sidebarTight,
  onSidebarTight,
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
  sidebarTight: boolean;
  onSidebarTight: () => void;
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
          on={sidebarTight}
          onClick={onSidebarTight}
          onLabel='Sidebar tight (library)'
          offLabel='Sidebar roomy (default)'
        />
      </div>
      <PalettePanel palette={palette} onPalette={onPalette} />
      <div className='border-t border-subtle mt-2 pt-2 px-2 pb-1'>
        <p className='text-[10px] uppercase tracking-wider text-tertiary-token pb-1.5 font-semibold'>
          Routes
        </p>
        <div className='space-y-px'>
          <PickerLink href='/exp/onboarding-v1' label='Test onboarding' />
          <PickerLink href='/exp/library-v1' label='Library standalone' />
          <PickerLink href='/exp/auth-v1' label='Auth (signin / signup)' />
        </div>
      </div>
    </div>
  );
}

function PickerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className='flex items-center justify-between h-6 px-1.5 rounded text-[11px] text-secondary-token hover:bg-surface-1 hover:text-primary-token transition-colors duration-150 ease-out'
    >
      <span>{label}</span>
      <ChevronRight
        className='h-3 w-3 text-quaternary-token'
        strokeWidth={2.25}
      />
    </a>
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
  return (
    <div className='border-t border-subtle mt-2 pt-2 px-1'>
      <p className='text-[10px] uppercase tracking-wider text-tertiary-token px-1 pb-1.5 font-semibold'>
        Palette
      </p>
      <div className='flex flex-wrap gap-1 px-1 pb-2'>
        {Object.keys(PALETTE_PRESETS).map(name => {
          const isCurrent =
            JSON.stringify(PALETTE_PRESETS[name]) === JSON.stringify(palette);
          return (
            <button
              key={name}
              type='button'
              onClick={() => onPalette(PALETTE_PRESETS[name])}
              className={cn(
                'h-5 px-1.5 rounded text-[10px] font-caption transition-colors duration-150 ease-out',
                isCurrent
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-tertiary-token border border-(--linear-app-shell-border) hover:text-primary-token hover:bg-surface-1'
              )}
            >
              {name}
            </button>
          );
        })}
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
                className='h-5 w-5 rounded border border-(--linear-app-shell-border) bg-transparent cursor-pointer shrink-0 [appearance:none] [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none'
              />
              <span className='text-[11px] text-secondary-token flex-1 min-w-0 truncate'>
                {t.label}
              </span>
            </label>
            <input
              type='text'
              value={palette[t.key]}
              onChange={e => onPalette({ ...palette, [t.key]: e.target.value })}
              className='w-[70px] shrink-0 h-5 px-1.5 rounded text-[10px] tabular-nums text-tertiary-token bg-surface-1 border border-(--linear-app-shell-border) outline-none focus:text-primary-token focus:border-cyan-500/40'
              spellCheck={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PickerToggle({
  on,
  onClick,
  onLabel,
  offLabel,
  shortcut,
}: {
  on: boolean;
  onClick: () => void;
  onLabel: string;
  offLabel: string;
  shortcut?: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='w-full flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px] text-secondary-token hover:bg-surface-1 hover:text-primary-token'
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          on ? 'bg-emerald-400' : 'bg-tertiary-token/60'
        )}
      />
      <span className='flex-1 text-left'>{on ? onLabel : offLabel}</span>
      {shortcut && (
        <kbd className='text-[10px] text-quaternary-token'>{shortcut}</kbd>
      )}
    </button>
  );
}

// Push-to-talk Jovie. Hold ⌘J anywhere to dictate. Mock for design pass —
// wire to the chat input / command palette intent router in production.
function JovieOverlay({ listening }: { listening: boolean }) {
  return (
    <div
      aria-hidden={!listening}
      className='fixed inset-x-0 bottom-32 z-50 flex justify-center pointer-events-none'
      style={{
        opacity: listening ? 1 : 0,
        transform: listening ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 200ms ${EASE_CINEMATIC}, transform 200ms ${EASE_CINEMATIC}`,
      }}
    >
      <div className='pointer-events-auto rounded-full backdrop-blur-2xl bg-(--linear-app-content-surface)/85 border border-(--linear-app-shell-border) shadow-[0_18px_60px_rgba(0,0,0,0.22)] px-4 py-2.5 flex items-center gap-3 min-w-[280px]'>
        <span className='relative h-7 w-7 rounded-full bg-primary text-on-primary grid place-items-center'>
          <Mic className='h-3.5 w-3.5' strokeWidth={2.5} />
          <span
            aria-hidden='true'
            className='absolute inset-0 rounded-full ring-2 ring-primary/40 anim-calm-halo'
          />
        </span>
        <div className='flex-1 min-w-0'>
          <div className='text-[12.5px] font-caption text-primary-token leading-tight'>
            Listening…
          </div>
          <div className='text-[10.5px] text-tertiary-token leading-tight mt-0.5'>
            Try: &ldquo;play Take Me Over&rdquo; · &ldquo;find the extended
            mix&rdquo;
          </div>
        </div>
        <span className='flex items-end gap-[2px] h-4'>
          {[0, 1, 2, 3, 4].map(i => (
            <span
              key={i}
              className='w-[2px] bg-primary-token rounded-sm anim-calm-breath'
              style={{
                height: `${30 + Math.abs(Math.sin(i * 1.7)) * 60}%`,
                animationDelay: `${i * 90}ms`,
                animationDuration: '700ms',
              }}
            />
          ))}
        </span>
        <kbd className='text-[10px] text-quaternary-token tabular-nums'>
          hold ⌘J
        </kbd>
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
      <div className='flex items-center gap-1.5 flex-wrap min-h-7 pr-2'>
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
          className='shrink-0 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-quaternary-token border border-(--linear-app-shell-border)/70 hover:text-primary-token hover:border-(--linear-app-shell-border) transition-colors duration-150 ease-out'
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
function EntityThreadGlyph({
  thread,
  onOpen,
}: {
  thread: Thread;
  onOpen: () => void;
}) {
  return (
    <Tooltip label='Jovie working — open thread'>
      <button
        type='button'
        onClick={e => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label='Open running thread'
        className='shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-cyan-300/85 hover:text-cyan-200 hover:bg-surface-1/60 transition-colors duration-150 ease-out'
      >
        <span className='relative inline-grid place-items-center h-3 w-3'>
          <span className='absolute inset-0 rounded-full bg-cyan-300/30 anim-calm-halo' />
          <Sparkles className='relative h-3 w-3' strokeWidth={2.25} />
        </span>
        <span className='sr-only'>{thread.title}</span>
      </button>
    </Tooltip>
  );
}

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

function ThreadView({ thread }: { thread: Thread }) {
  return (
    <article className='max-w-3xl mx-auto px-8 pt-8 pb-12 flex flex-col h-full'>
      <header className='shrink-0'>
        {/* No status eyebrow — status reads from the sidebar dot icon and
            from the per-turn "Generating…" / error states inline below. */}
        <h1
          className='text-[24px] font-semibold leading-tight text-primary-token'
          style={{ letterSpacing: '-0.018em' }}
        >
          {thread.title}
        </h1>
        {thread.entityKind && thread.entityId && (
          <p className='mt-1.5 text-[12.5px] text-tertiary-token'>
            Linked to {thread.entityKind} ·{' '}
            <span className='text-secondary-token'>{thread.entityId}</span>
          </p>
        )}
      </header>

      <div className='flex-1 mt-8 space-y-4 text-[13.5px] leading-relaxed'>
        <ThreadTurn speaker='jovie'>
          <ChatMarkdown content={mockThreadMarkdown(thread)} />
        </ThreadTurn>

        {thread.status === 'complete' && (
          <>
            <ThreadImageCard
              prompt='Lost in the Light · Spotify Canvas'
              status='ready'
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
      </div>

      <footer className='shrink-0 mt-6 pt-4'>
        <ChatComposer placeholder='Reply to this thread…' />
      </footer>
    </article>
  );
}

function ThreadTurn({
  speaker,
  subtle,
  children,
}: {
  speaker: 'jovie' | 'me';
  subtle?: boolean;
  children: React.ReactNode;
}) {
  // Notion-style: flat text, no card, no border. Speaker is implied by
  // the small label above the body. The "me" turn gets a subtle left
  // indent so it reads as a reply without needing chrome.
  return (
    <div
      className={cn(
        'group/turn',
        speaker === 'me' &&
          'pl-4 border-l border-(--linear-app-shell-border)/40'
      )}
    >
      <p className='text-[10.5px] uppercase tracking-[0.08em] font-semibold text-quaternary-token mb-1.5 select-none'>
        {speaker === 'jovie' ? 'Jovie' : 'You'}
      </p>
      <div
        className={cn(
          'text-[13.5px] leading-relaxed',
          subtle ? 'text-tertiary-token' : 'text-secondary-token'
        )}
      >
        {children}
      </div>
    </div>
  );
}

// Image generation card — clean attachment block. Shimmer + visible
// prompt while generating; aspect-correct preview + tap-to-lightbox
// once ready. Toolbar: download / copy / regenerate.
function ThreadImageCard({
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
function ThreadAudioCard({
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
function ThreadVideoCard({
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

function ThreadCardIconBtn({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip label={label}>
      <button
        type='button'
        className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ChatComposer({ placeholder }: { placeholder: string }) {
  // Same Variant F surface as the dashboard PillComposer. Reused here
  // so the thread reply matches the home composer exactly.
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
    />
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

function SettingsRow({
  label,
  description,
  control,
  tone,
  divider,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  tone?: 'default' | 'danger';
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3.5',
        divider && 'border-t border-(--linear-app-shell-border)/50'
      )}
    >
      <div className='flex-1 min-w-0'>
        <p className='text-[13px] font-medium text-primary-token'>{label}</p>
        {description && (
          <p className='text-[11.5px] text-tertiary-token mt-0.5'>
            {description}
          </p>
        )}
      </div>
      <div className='shrink-0'>{control}</div>
    </div>
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

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'k') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(releases.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'j') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(0, i - 1));
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
        !isSelected && !isFocused && 'hover:bg-surface-1/50',
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
          <TypeBadge type={release.type} />
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
            thread={runningThread}
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
      </div>
    </li>
  );
}

function TypeBadge({ type }: { type: ReleaseType }) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center h-[16px] px-1.5 rounded text-[9.5px] font-medium uppercase tracking-[0.06em]',
        'border border-(--linear-app-shell-border) text-tertiary-token bg-surface-1/40'
      )}
    >
      {type}
    </span>
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

// Inline per-row waveform (Lexicon DJ-inspired): low-contrast at rest,
// brighter when this row's track is playing. Click anywhere to seek. Cue
// markers are vertical line overlays *on* the waveform — span its full
// height with a subtle dot at the top edge.
const ROW_WF_W = 600;
const ROW_WF_H = 24;
const ROW_WF_CY = ROW_WF_H / 2;
const ROW_WF_AMP = ROW_WF_H / 2 - 1;

// Cue marker colors. Subtle by default — color is the *only* signal of
// section, so each is unmistakable but never loud.
const CUE_TONE_LINE: Record<CueKind, string> = {
  intro: 'bg-sky-400/45',
  verse: 'bg-tertiary-token/40',
  chorus: 'bg-emerald-400/55',
  drop: 'bg-amber-400/65',
  bridge: 'bg-violet-400/55',
  outro: 'bg-quaternary-token/55',
};
const CUE_TONE_DOT: Record<CueKind, string> = {
  intro: 'bg-sky-400',
  verse: 'bg-tertiary-token',
  chorus: 'bg-emerald-400',
  drop: 'bg-amber-400',
  bridge: 'bg-violet-400',
  outro: 'bg-quaternary-token',
};

function rowWaveformPeaks(seed: number) {
  return Array.from({ length: 120 }).map((_, i) => {
    const a =
      0.4 +
      0.32 * Math.abs(Math.sin((i + seed * 11) * 0.18)) +
      0.22 * Math.abs(Math.cos((i + seed * 7) * 0.31));
    const noise = hash1d(i + seed * 1000);
    return Math.max(0.08, Math.min(1, a * (0.55 + noise * 0.45)));
  });
}

type RowWaveformDatum = {
  id: string;
  durationSec: number;
  waveformSeed: number;
  cues: Cue[];
  title: string;
};
function RowWaveform({
  release,
  currentTimeSec,
  isCurrentTrack,
  onSeek,
}: {
  release: RowWaveformDatum;
  currentTimeSec: number;
  isCurrentTrack: boolean;
  onSeek: (sec: number) => void;
}) {
  const peaks = useMemo(
    () => rowWaveformPeaks(release.waveformSeed),
    [release.waveformSeed]
  );
  const playedPct = isCurrentTrack
    ? (currentTimeSec / release.durationSec) * 100
    : 0;
  const stride = ROW_WF_W / peaks.length;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    onSeek(ratio * release.durationSec);
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrub via mouse; keyboard seek lands in a follow-up
    <div
      role='slider'
      aria-label={`Scrub ${release.title}`}
      aria-valuemin={0}
      aria-valuemax={release.durationSec}
      aria-valuenow={Math.round(currentTimeSec)}
      tabIndex={-1}
      onClick={handleClick}
      className='group/wf relative h-7 cursor-pointer'
    >
      <svg
        viewBox={`0 0 ${ROW_WF_W} ${ROW_WF_H}`}
        className='w-full h-full overflow-visible block'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        <defs>
          <clipPath id={`wf-played-${release.id}`}>
            <rect
              x='0'
              y='0'
              width={(playedPct / 100) * ROW_WF_W}
              height={ROW_WF_H}
            />
          </clipPath>
        </defs>

        {/* Base bars (unplayed / muted) */}
        <g
          className={cn(
            'transition-opacity duration-150 ease-out',
            isCurrentTrack
              ? 'opacity-50'
              : 'opacity-35 group-hover/wf:opacity-55'
          )}
        >
          {peaks.map((h, i) => {
            const x = i * stride + stride / 2;
            const half = h * ROW_WF_AMP;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: stable peaks
                key={i}
                x1={x}
                x2={x}
                y1={ROW_WF_CY - half}
                y2={ROW_WF_CY + half}
                stroke='currentColor'
                strokeWidth='1.2'
                strokeLinecap='round'
                vectorEffect='non-scaling-stroke'
                className='text-tertiary-token'
              />
            );
          })}
        </g>

        {/* Played bars (saturated) — only meaningful if this is the current track */}
        {isCurrentTrack && (
          <g clipPath={`url(#wf-played-${release.id})`}>
            {peaks.map((h, i) => {
              const x = i * stride + stride / 2;
              const half = h * ROW_WF_AMP;
              return (
                <line
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable peaks
                  key={i}
                  x1={x}
                  x2={x}
                  y1={ROW_WF_CY - half}
                  y2={ROW_WF_CY + half}
                  stroke='currentColor'
                  strokeWidth='1.4'
                  strokeLinecap='round'
                  vectorEffect='non-scaling-stroke'
                  className='text-primary-token'
                />
              );
            })}
          </g>
        )}

        {/* Playhead */}
        {isCurrentTrack && (
          <line
            x1={(playedPct / 100) * ROW_WF_W}
            x2={(playedPct / 100) * ROW_WF_W}
            y1={0}
            y2={ROW_WF_H}
            stroke='currentColor'
            strokeWidth='1'
            className='text-primary-token'
            vectorEffect='non-scaling-stroke'
          />
        )}
      </svg>

      {/* Cue overlays — vertical line spans full waveform height + a small
          dot at the top edge for color recognition. Subtle until hover. */}
      <div className='pointer-events-none absolute inset-0'>
        {release.cues.map(c => {
          const left = (c.at / release.durationSec) * 100;
          return (
            <span
              key={`${release.id}-${c.label}-${c.at}`}
              className='absolute inset-y-0'
              style={{ left: `${left}%`, transform: 'translateX(-0.5px)' }}
              title={`${c.label} · ${formatTime(c.at)}`}
            >
              <span
                className={cn(
                  'absolute inset-y-0 w-px transition-opacity duration-150 ease-out',
                  CUE_TONE_LINE[c.kind],
                  'opacity-50 group-hover/wf:opacity-90'
                )}
              />
              <span
                className={cn(
                  'absolute -top-px h-[3px] w-[3px] rounded-full -translate-x-[1px] transition-opacity duration-150 ease-out',
                  CUE_TONE_DOT[c.kind],
                  'opacity-80 group-hover/wf:opacity-100'
                )}
              />
            </span>
          );
        })}
      </div>

      {/* Hover seek cursor */}
      <div className='pointer-events-none absolute inset-0 opacity-0 group-hover/wf:opacity-100 transition-opacity duration-150 ease-out'>
        <span className='absolute inset-y-1 left-1/2 w-px bg-primary-token/0' />
      </div>
    </div>
  );
}

function PlayingBars() {
  return (
    <span
      role='img'
      aria-label='Now playing'
      className='absolute inset-0 grid place-items-center'
    >
      {/* Calmer EQ — fewer keyframes, tighter range (40-85% instead of
          28-96%), slower durations. Reads as a now-playing indicator
          without strobing in the user's peripheral vision. */}
      <style>{`
        @keyframes pb-eq-a {
          0%, 100% { height: 50%; }
          50%      { height: 80%; }
        }
        @keyframes pb-eq-b {
          0%, 100% { height: 70%; }
          50%      { height: 42%; }
        }
        @keyframes pb-eq-c {
          0%, 100% { height: 55%; }
          50%      { height: 78%; }
        }
      `}</style>
      <span className='flex items-end gap-[2px] h-3'>
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-a 1400ms ease-in-out infinite',
            willChange: 'height',
          }}
        />
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-b 1100ms ease-in-out infinite',
            animationDelay: '-220ms',
            willChange: 'height',
          }}
        />
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-c 1700ms ease-in-out infinite',
            animationDelay: '-480ms',
            willChange: 'height',
          }}
        />
      </span>
    </span>
  );
}

function AgentPulse() {
  return (
    <span
      aria-hidden='true'
      title='Agent working'
      className='absolute inset-0 ring-1 ring-inset ring-primary-token/40 rounded anim-calm-breath pointer-events-none'
      style={{ animationDuration: '1600ms' }}
    />
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
}: {
  release: Release | null;
  onClose: () => void;
  onPlay?: (id: string) => void;
  onSeek?: (id: string, sec: number) => void;
  onOpenTasks?: () => void;
  onMenu?: (e: React.MouseEvent<HTMLButtonElement>, r: Release) => void;
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
      // Linear-style: page background between the two elevated cards.
      // Page bg is page (darkest), each card is contentSurface elevated
      // with a thin border and a soft shadow. The gap between cards is
      // intentional and reads as a structural separation.
      className='hidden md:flex flex-col h-full overflow-hidden border-l border-(--linear-app-shell-border) bg-(--linear-bg-page)'
      style={{
        opacity: open ? 1 : 0,
        transform: open ? 'translateX(0)' : 'translateX(16px)',
        transition: `opacity 220ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* Hero card — elevated. Holds artwork, title, status, drop-in-N
          callout, and the smart-link share row. Always visible. */}
      <div className='shrink-0 px-3 pt-3'>
        <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_8px_24px_rgba(0,0,0,0.18)] overflow-hidden'>
          <DrawerHero
            release={r}
            onClose={onClose}
            onPlay={onPlay}
            onMenu={onMenu ? e => onMenu(e, r) : undefined}
          />
        </div>
      </div>

      {/* Detail card — elevated. Pill tabs at the top, tab content
          below. Each tab owns its own scroll. */}
      <div className='flex-1 min-h-0 px-3 pt-3 pb-3 flex flex-col'>
        <div className='flex-1 min-h-0 rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_8px_24px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden'>
          <DrawerTabStrip tabs={tabs} active={tab} onChange={setTab} />
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

function DrawerTabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: DrawerTab[];
  active: DrawerTab;
  onChange: (t: DrawerTab) => void;
}) {
  // Pill tabs share the strip equally (flex-1) so the row reads as a
  // proper segmented control. Active tab carries a brighter surface +
  // a subtle ring for unmistakable selected state. Drops the bottom
  // separator — the tab strip's own track is the divider.
  return (
    <div className='shrink-0 px-2 pt-2 pb-2'>
      <div
        role='tablist'
        className='flex items-center gap-0.5 p-0.5 rounded-full bg-(--surface-0)/70 border border-(--linear-app-shell-border)/70'
      >
        {tabs.map(t => {
          const on = active === t;
          return (
            <button
              key={t}
              type='button'
              role='tab'
              aria-selected={on}
              onClick={() => onChange(t)}
              className={cn(
                'flex-1 h-7 px-3 rounded-full text-[11.5px] font-medium tracking-[-0.005em] transition-colors duration-150 ease-out',
                on
                  ? 'bg-(--surface-2) text-primary-token ring-1 ring-inset ring-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'text-tertiary-token hover:text-primary-token'
              )}
            >
              {TAB_LABEL[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DrawerHero({
  release,
  onPlay,
  onMenu,
}: {
  release: Release;
  onClose: () => void;
  onPlay?: (id: string) => void;
  onMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const status = statusFromRelease(release);
  const dropMeta = relativeDropMeta(release.releaseDate);
  return (
    <section className='group/drawer relative px-4 pt-4 pb-3'>
      {/* Status pill + single overflow menu in the top-right corner.
          The menu owns Close (Esc still works); merging the X into the
          menu cuts chrome and matches Linear's drawer pattern. */}
      <div className='absolute right-3 top-3 flex items-center gap-1.5'>
        <StatusBadge status={status} />
        <Tooltip label='Drawer actions'>
          <button
            type='button'
            onClick={onMenu}
            className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out opacity-0 group-hover/drawer:opacity-100 focus-visible:opacity-100'
            aria-label='Drawer actions'
            aria-haspopup='menu'
          >
            <MoreHorizontal className='h-3.5 w-3.5' strokeWidth={2.25} />
          </button>
        </Tooltip>
      </div>

      <div className='flex items-start gap-3'>
        <button
          type='button'
          onClick={() => onPlay?.(release.id)}
          aria-label={`Play ${release.title}`}
          className='shrink-0 relative group/art rounded-lg overflow-hidden focus-visible:outline-none'
        >
          <ArtworkThumb src={release.artwork} title={release.title} size={88} />
          <span
            aria-hidden='true'
            className='absolute inset-0 grid place-items-center bg-black/45 opacity-0 group-hover/art:opacity-100 transition-opacity duration-150 ease-out'
          >
            <span className='h-8 w-8 rounded-full bg-white text-black grid place-items-center'>
              <Play
                className='h-3.5 w-3.5 translate-x-px'
                strokeWidth={2.5}
                fill='currentColor'
              />
            </span>
          </span>
        </button>

        <div className='flex-1 min-w-0 pt-1 pr-[88px]'>
          <h2
            className='text-[17px] font-semibold text-primary-token leading-tight'
            style={{ letterSpacing: '-0.018em' }}
          >
            {release.title}
          </h2>
          <p className='mt-1 text-[12px] text-tertiary-token truncate'>
            {release.artist} · {release.album}
          </p>
          <div className='mt-2 flex items-center gap-1.5 flex-wrap'>
            <TypeBadge type={release.type} />
            <DropDateChip
              date={release.releaseDate}
              tone={dropMeta.tone}
              label={dropMeta.label}
            />
          </div>
        </div>
      </div>

      {/* Smart link — copy + open. Pill-shaped to match the input language
          and reinforce the share-this affordance. */}
      <div className='mt-4'>
        <DrawerSmartLinkRow release={release} />
      </div>
    </section>
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

function DropDateChip({
  date: _date,
  tone,
  label,
}: {
  date: string;
  tone: 'past' | 'soon' | 'future';
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[18px] pl-1.5 pr-2 rounded border text-[10px] font-caption uppercase tracking-[0.06em] whitespace-nowrap',
        tone === 'soon'
          ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-200/90'
          : tone === 'past'
            ? 'border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token'
            : 'border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token'
      )}
    >
      <Calendar
        className={cn(
          'h-2.5 w-2.5 shrink-0',
          tone === 'soon' ? 'text-cyan-300/80' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <span>{label}</span>
    </span>
  );
}

function DrawerSmartLinkRow({ release }: { release: Release }) {
  const [copied, setCopied] = useState(false);
  const url = `jov.ie/${release.artist.toLowerCase().replace(/\s+/g, '-')}/${release.id}`;
  return (
    <div className='flex items-center gap-1.5 h-7 pl-3 pr-1 rounded-full border border-(--linear-app-shell-border) bg-(--surface-0)/60 text-[11.5px] text-tertiary-token'>
      <LinkIcon
        className='h-3 w-3 text-quaternary-token shrink-0'
        strokeWidth={2.25}
      />
      <span className='flex-1 truncate font-mono tabular-nums'>{url}</span>
      <Tooltip label={copied ? 'Copied!' : 'Copy smart link'}>
        <button
          type='button'
          onClick={() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
          aria-label='Copy smart link'
        >
          {copied ? (
            <CheckCircle2
              className='h-3 w-3 text-cyan-300'
              strokeWidth={2.25}
            />
          ) : (
            <Copy className='h-3 w-3' strokeWidth={2.25} />
          )}
        </button>
      </Tooltip>
      <Tooltip label='Open smart link'>
        <button
          type='button'
          className='inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
          aria-label='Open smart link'
        >
          <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
        </button>
      </Tooltip>
    </div>
  );
}

// Overview tab — clean stats triad + compact performance + drop date.
// No carded sections; sub-areas are separated by a hairline only.
function DrawerOverviewTab({ release }: { release: Release }) {
  return (
    <div className='px-4 py-4 space-y-5'>
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
function DrawerLyricsTab({ release: _release }: { release: Release }) {
  // Mock lyrics — release-agnostic for the design pass.
  const lines = [
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
  return (
    <div className='px-4 py-4'>
      <div className='flex items-center justify-between pb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          Lyrics
        </p>
        <button
          type='button'
          className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
        >
          Edit
        </button>
      </div>
      <ol className='flex flex-col -mx-2'>
        {lines.map(line => (
          <li key={line.at}>
            <button
              type='button'
              className='group/lyric w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token transition-colors duration-150 ease-out text-left'
            >
              <span className='shrink-0 w-9 pt-0.5 text-[10.5px] tabular-nums text-quaternary-token group-hover/lyric:text-tertiary-token transition-colors duration-150 ease-out'>
                {Math.floor(line.at / 60)}:
                {String(line.at % 60).padStart(2, '0')}
              </span>
              <span className='flex-1 leading-snug'>{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
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

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'YTD';
const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'YTD', label: 'YTD', days: 120 },
];

function DrawerPerformance({ release }: { release: Release }) {
  const [range, setRange] = useState<RangeKey>('7d');
  const days = RANGES.find(r => r.key === range)?.days ?? 7;
  const points = useMemo(
    () => generatePerfPoints(release.waveformSeed, release.weeklyStreams, days),
    [release.waveformSeed, release.weeklyStreams, days]
  );
  const total = points.reduce((a, b) => a + b, 0);
  const trendUp = release.weeklyDelta > 0;
  const trendFlat = release.weeklyDelta === 0;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx ?? points.length - 1;
  const activeValue = points[activeIdx];
  const clicks =
    hoverIdx !== null ? activeValue : Math.round((total / days) * 7);
  const valueLabel = hoverIdx !== null ? 'on day' : 'clicks';
  const dayLabel =
    hoverIdx !== null
      ? formatDayOffset(activeIdx - (points.length - 1))
      : `last ${range}`;

  return (
    <div>
      <div className='flex items-center justify-between mb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          Smart link
        </p>
        {/* Pill-shaped time-range selector — flush right. */}
        <div className='flex items-center gap-0.5 p-0.5 rounded-full bg-(--surface-0)/70 border border-(--linear-app-shell-border)/70'>
          {RANGES.map(r => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                type='button'
                onClick={() => {
                  setRange(r.key);
                  setHoverIdx(null);
                }}
                aria-pressed={on}
                className={cn(
                  'h-5 px-2 rounded-full text-[10px] font-medium tracking-[-0.005em] transition-colors duration-150 ease-out',
                  on
                    ? 'bg-(--surface-2) text-primary-token ring-1 ring-inset ring-white/10'
                    : 'text-tertiary-token hover:text-primary-token'
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className='flex items-baseline gap-2'>
        <span className='text-[20px] font-semibold text-primary-token tabular-nums'>
          {clicks.toLocaleString()}
        </span>
        <span className='text-[11px] text-tertiary-token'>{valueLabel}</span>
        <span className='text-[11px] text-quaternary-token tabular-nums'>
          · {dayLabel}
        </span>
        {hoverIdx === null && (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-0.5 text-[11px] tabular-nums',
              trendFlat
                ? 'text-tertiary-token'
                : trendUp
                  ? 'text-cyan-200/85'
                  : 'text-rose-300/85'
            )}
          >
            {trendUp ? (
              <ArrowUp className='h-3 w-3' strokeWidth={2.25} />
            ) : trendFlat ? null : (
              <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
            )}
            {Math.abs(release.weeklyDelta)}%
          </span>
        )}
      </div>
      <Sparkline
        points={points}
        trendUp={trendUp}
        trendFlat={trendFlat}
        hoverIdx={hoverIdx}
        onHover={setHoverIdx}
      />
    </div>
  );
}

function formatDayOffset(offset: number): string {
  if (offset === 0) return 'today';
  if (offset === -1) return 'yesterday';
  return `${Math.abs(offset)}d ago`;
}

function Sparkline({
  points,
  trendUp,
  trendFlat,
  hoverIdx,
  onHover,
}: {
  points: number[];
  trendUp: boolean;
  trendFlat: boolean;
  hoverIdx?: number | null;
  onHover?: (idx: number | null) => void;
}) {
  const w = 340;
  const h = 40;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const xFor = (i: number) => (i / (points.length - 1)) * w;
  const yFor = (v: number) => h - ((v - min) / range) * h;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p).toFixed(1)}`
    )
    .join(' ');
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;
  const stroke = trendFlat
    ? 'rgba(255,255,255,0.4)'
    : trendUp
      ? 'rgba(165,243,252,0.85)'
      : 'rgba(253,164,175,0.85)';
  const fill = trendFlat
    ? 'rgba(255,255,255,0.06)'
    : trendUp
      ? 'rgba(103,232,249,0.10)'
      : 'rgba(253,164,175,0.10)';
  const svgRef = useRef<SVGSVGElement>(null);
  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!onHover) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.max(
      0,
      Math.min(points.length - 1, Math.round((px / w) * (points.length - 1)))
    );
    onHover(idx);
  }
  const playheadX = hoverIdx != null ? xFor(hoverIdx) : null;
  const playheadY = hoverIdx != null ? yFor(points[hoverIdx]) : null;
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: chart canvas; hover is a mouse-only affordance and exact values are also surfaced in the static summary above
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className='mt-2 w-full h-10 block cursor-crosshair'
      preserveAspectRatio='none'
      role='img'
      aria-label='Smart link clicks over time'
      onMouseMove={handleMove}
      onMouseLeave={() => onHover?.(null)}
    >
      <title>Smart link clicks</title>
      <path d={fillPath} fill={fill} />
      <path d={path} fill='none' stroke={stroke} strokeWidth={1.5} />
      {playheadX != null && playheadY != null && (
        <>
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={h}
            stroke='rgba(255,255,255,0.30)'
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
          <circle
            cx={playheadX}
            cy={playheadY}
            r={3}
            fill={stroke}
            stroke='rgba(0,0,0,0.45)'
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
    </svg>
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
  const total = release.durationSec;
  return (
    <div className='px-4 py-4'>
      <div className='flex items-center justify-between pb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          Cues
        </p>
        <span className='text-[10.5px] tabular-nums text-tertiary-token'>
          {release.cues.length}
        </span>
      </div>
      {/* Mini timeline ribbon — cues plot against duration. */}
      <div className='relative h-1 rounded-full bg-(--surface-2)'>
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
      <ul className='mt-3 flex flex-col -mx-2'>
        {release.cues.map(c => (
          <li key={c.at}>
            <button
              type='button'
              onClick={() => onSeek?.(release.id, c.at)}
              className='group/cue w-full flex items-center gap-2 h-8 px-2 rounded-md text-[12.5px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token transition-colors duration-150 ease-out'
            >
              {/* Hover-play affordance — replaces the timestamp on hover
                  so the row reads like a track in a playlist. */}
              <span className='relative w-9 shrink-0'>
                <span className='absolute inset-0 grid place-items-start tabular-nums text-[10.5px] text-quaternary-token opacity-100 group-hover/cue:opacity-0 transition-opacity duration-150 ease-out'>
                  {Math.floor(c.at / 60)}:{String(c.at % 60).padStart(2, '0')}
                </span>
                <span className='absolute inset-0 grid place-items-center text-primary-token opacity-0 group-hover/cue:opacity-100 transition-opacity duration-150 ease-out'>
                  <Play
                    className='h-3 w-3 translate-x-px'
                    strokeWidth={2.5}
                    fill='currentColor'
                  />
                </span>
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
    <div className='px-4 py-4'>
      <div className='flex flex-col -mx-2'>
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

function ActivityHoverRow({
  icon: Icon,
  label,
  meta,
  onClick,
  running,
  iconAccent,
  danger,
}: {
  icon: typeof Activity;
  label: string;
  meta: string;
  onClick?: () => void;
  running?: boolean;
  iconAccent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'group/act flex items-center gap-2.5 h-8 px-2 rounded-md text-[12.5px] transition-colors duration-150 ease-out',
        danger
          ? 'text-rose-300/85 hover:bg-rose-500/10 hover:text-rose-200'
          : 'text-secondary-token hover:bg-surface-1/50 hover:text-primary-token'
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          iconAccent ? 'text-cyan-300/85' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <span className='flex-1 text-left truncate'>{label}</span>
      {running && (
        <span className='h-1.5 w-1.5 rounded-full bg-cyan-300/80 anim-calm-breath' />
      )}
      <span className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token group-hover/act:text-tertiary-token transition-colors duration-150 ease-out'>
        {meta}
      </span>
    </button>
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
          <DrawerDetailRow
            key={row.label}
            label={row.label}
            value={row.value}
            readOnly={row.readOnly}
          />
        ))}
      </dl>
    </div>
  );
}

function DrawerDetailRow({
  label,
  value,
  readOnly,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  const enterEdit = () => {
    if (readOnly) return;
    setDraft(value);
    setEditing(true);
  };
  const valueClass = cn(
    'flex-1 min-w-0 text-[12.5px] text-secondary-token truncate',
    label === 'Key' && 'font-mono tracking-wide',
    (label === 'BPM' || label === 'Length' || label === 'ID') && 'tabular-nums'
  );
  if (editing) {
    return (
      <div className='flex items-center gap-3 h-8 px-2 rounded-md bg-surface-1/40'>
        <dt className='w-[88px] shrink-0 text-[11px] text-quaternary-token'>
          {label}
        </dt>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className={cn(
            valueClass,
            'bg-transparent outline-none border-b border-cyan-300/60 focus-visible:outline-none'
          )}
        />
      </div>
    );
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row is a click + double-click affordance into an inline edit input rendered conditionally above
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — keyboard path is the edit pencil button
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation is on the inner pencil button (which is a real <button>)
    <div
      className={cn(
        'group/row flex items-center gap-3 h-8 px-2 rounded-md transition-colors duration-150 ease-out',
        readOnly
          ? 'hover:bg-transparent'
          : 'cursor-pointer hover:bg-surface-1/40'
      )}
      onClick={readOnly ? undefined : enterEdit}
      onDoubleClick={readOnly ? undefined : enterEdit}
      title={readOnly ? undefined : 'Click to edit'}
    >
      <dt className='w-[88px] shrink-0 text-[11px] text-quaternary-token'>
        {label}
      </dt>
      <dd className={valueClass}>{value}</dd>
      {!readOnly && (
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            enterEdit();
          }}
          aria-label={`Edit ${label}`}
          className='shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 ease-out'
        >
          <Pencil className='h-3 w-3' strokeWidth={2.25} />
        </button>
      )}
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
          />
          <ColumnLabel
            field='bpm'
            label='BPM'
            width='w-[44px]'
            align='right'
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={toggleSort}
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
      onClick={onSelect}
      onContextMenu={e => onContextMenu?.(e, track)}
      data-focused={isFocused || undefined}
      className={cn(
        'group/row relative flex items-center gap-3 h-[44px] pl-2 pr-3 rounded-md cursor-pointer transition-colors duration-150 ease-out focus:outline-none',
        !isFocused && 'hover:bg-surface-1/40',
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
          release={{
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
            thread={runningThread}
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

function StatusBadge({ status }: { status: TrackStatus }) {
  const cfg = STATUS_CHIP[status];
  return (
    <span
      className='inline-flex items-center gap-1.5 h-[18px] pl-1.5 pr-2 rounded border border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token text-[10px] font-caption uppercase tracking-[0.06em] whitespace-nowrap'
      title={cfg.tooltip}
    >
      <span
        aria-hidden='true'
        className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          cfg.dot,
          cfg.dotBorder && `border ${cfg.dotBorder}`
        )}
      />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  );
}

const STATUS_CHIP: Record<
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

function ColumnLabel({
  field,
  label,
  width,
  flex,
  align,
  sortBy,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  width?: string;
  flex?: boolean;
  align: 'left' | 'right';
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}) {
  // 'index' is the natural default ordering — don't paint it as a user-
  // chosen sort. Cyan only appears when the user has explicitly picked a
  // column to sort by.
  const active = sortBy === field && field !== 'index';
  return (
    <button
      type='button'
      onClick={() => onSort(field)}
      className={cn(
        'group/col h-6 px-1 -mx-1 rounded-md text-[9.5px] uppercase tracking-[0.12em] font-medium transition-colors duration-150 ease-out',
        flex ? 'flex-1 min-w-0' : (width ?? ''),
        'shrink-0 inline-flex items-center gap-1',
        align === 'right' && 'flex-row-reverse',
        active
          ? 'text-cyan-300/90'
          : 'text-quaternary-token/85 hover:text-secondary-token'
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'inline-flex items-center transition-opacity duration-150 ease-out',
          active ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-60'
        )}
      >
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className='h-2.5 w-2.5' strokeWidth={2.5} />
          ) : (
            <ArrowDown className='h-2.5 w-2.5' strokeWidth={2.5} />
          )
        ) : (
          <ArrowUpDown className='h-2.5 w-2.5' strokeWidth={2.25} />
        )}
      </span>
    </button>
  );
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
  const [selectedId, setSelectedId] = useState<string>(tasks[0]?.id ?? '');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const selected = tasks.find(t => t.id === selectedId) ?? tasks[0];

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'k') {
      e.preventDefault();
      const next = Math.min(tasks.length - 1, focusedIndex + 1);
      setFocusedIndex(next);
      setSelectedId(tasks[next].id);
    } else if (e.key === 'ArrowUp' || e.key === 'j') {
      e.preventDefault();
      const next = Math.max(0, focusedIndex - 1);
      setFocusedIndex(next);
      setSelectedId(tasks[next].id);
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

      {/* Detail pane */}
      <div className='flex-1 min-w-0 overflow-y-auto'>
        {selected ? (
          <TaskDetail task={selected} onOpenRelease={onOpenRelease} />
        ) : null}
      </div>
    </section>
  );
}

function TaskListItem({
  task,
  isSelected,
  isFocused,
  onSelect,
  onContextMenu,
  onOpenRelease,
  onOpenThread,
}: {
  task: Task;
  isSelected: boolean;
  isFocused: boolean;
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
      onClick={onSelect}
      onContextMenu={e => onContextMenu?.(e, task)}
      data-focused={isFocused || isSelected || undefined}
      className={cn(
        'group/row relative flex items-start gap-3 py-2 pl-2 pr-3 rounded-md cursor-pointer transition-colors duration-150 ease-out',
        !isFocused && !isSelected && 'hover:bg-surface-1/40',
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
                thread={runningThread}
                onOpen={() => onOpenThread(runningThread.id)}
              />
            )}
            <PriorityGlyph priority={task.priority} />
            <AssigneeChip assignee={task.assignee} />
          </span>
        </div>
      </div>
    </li>
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
          <AssigneeChip assignee={task.assignee} expanded />
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

function MetaPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'amber' | 'cyan';
}) {
  // Flat at rest, border + subtle bg appears on hover. Tone modifiers
  // affect text color only at rest; the surface stays clean.
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[24px] px-2 rounded-md text-[11.5px] tracking-[-0.005em] border whitespace-nowrap',
        'border-transparent bg-transparent transition-[background-color,border-color] duration-150 ease-out cursor-default',
        tone === 'amber'
          ? 'text-amber-300/85 hover:border-amber-500/30 hover:bg-amber-500/10'
          : tone === 'cyan'
            ? 'text-cyan-300/85 hover:border-cyan-500/30 hover:bg-cyan-500/10'
            : 'text-secondary-token hover:border-(--linear-app-shell-border) hover:bg-surface-1/40'
      )}
    >
      {children}
    </span>
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
function DueChip({ dueIso, muted }: { dueIso: string; muted?: boolean }) {
  const ms = new Date(dueIso).getTime() - new Date('2026-04-25').getTime();
  const days = Math.round(ms / 86400000);
  let label: string;
  if (days === 0) label = 'Due today';
  else if (days === 1) label = 'Due tomorrow';
  else if (days === -1) label = 'Due yesterday';
  else if (days > 0)
    label = `Due in ${days < 7 ? `${days}d` : `${Math.round(days / 7)}w`}`;
  else
    label = `Due ${Math.abs(days) < 7 ? `${Math.abs(days)}d` : `${Math.round(Math.abs(days) / 7)}w`} ago`;
  const soon = !muted && days >= 0 && days <= 2;
  return (
    <span
      className={cn(
        'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.04em] whitespace-nowrap shrink-0 tabular-nums',
        muted
          ? 'text-quaternary-token/70'
          : soon
            ? 'text-amber-300/90'
            : 'text-tertiary-token'
      )}
    >
      {label}
    </span>
  );
}

// Label badges. First label is always visible. ≥ 2 labels collapse the
// rest into a "+N" chip that swaps to the full set on hover.
function LabelPills({ labels }: { labels: string[] }) {
  const first = labels[0];
  const rest = labels.slice(1);
  return (
    <div className='group/labels flex items-center gap-1 min-w-0'>
      <LabelPill>{first}</LabelPill>
      {rest.length > 0 && (
        <>
          <span
            className='inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption text-quaternary-token bg-(--surface-1)/60 border border-(--linear-app-shell-border)/50 group-hover/labels:hidden'
            aria-hidden='true'
          >
            +{rest.length}
          </span>
          {rest.map(l => (
            <span key={l} className='hidden group-hover/labels:inline-flex'>
              <LabelPill>{l}</LabelPill>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

function LabelPill({ children }: { children: React.ReactNode }) {
  return (
    <span className='inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption text-tertiary-token bg-(--surface-1)/40 border border-(--linear-app-shell-border)/50 whitespace-nowrap'>
      {children}
    </span>
  );
}

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

function PriorityGlyph({ priority }: { priority: TaskPriority }) {
  if (priority === 'none')
    return <span className='inline-block h-2.5 w-3' aria-hidden='true' />;
  if (priority === 'urgent')
    return (
      <span
        title='Urgent'
        className='inline-flex items-center justify-center h-3 px-1 rounded text-[8px] font-bold leading-none bg-rose-500/15 text-rose-300'
      >
        !
      </span>
    );
  const bars = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
  return (
    <span
      className='inline-flex items-end gap-[2px] h-2.5'
      title={`Priority: ${priority}`}
    >
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={cn(
            'w-[2px] rounded-sm',
            i <= bars ? 'bg-secondary-token' : 'bg-quaternary-token/30'
          )}
          style={{ height: `${30 + i * 25}%` }}
        />
      ))}
    </span>
  );
}

function AssigneeChip({
  assignee,
  expanded,
}: {
  assignee: TaskAssignee;
  expanded?: boolean;
}) {
  if (assignee === 'jovie') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 shrink-0',
          expanded
            ? 'text-[12.5px] text-secondary-token'
            : 'text-[10.5px] text-tertiary-token'
        )}
        title='Assigned to Jovie'
      >
        <JovieMark
          className={cn(expanded ? 'h-3.5 w-3.5' : 'h-3 w-3', 'text-cyan-400')}
        />
        {expanded && 'Jovie'}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 shrink-0',
        expanded
          ? 'text-[12.5px] text-secondary-token'
          : 'text-[10.5px] text-tertiary-token'
      )}
      title='Assigned to you'
    >
      <span
        className={cn(
          'rounded-full bg-surface-2 border border-(--linear-app-shell-border) text-[8px] font-caption text-secondary-token grid place-items-center',
          expanded ? 'h-5 w-5 text-[10px]' : 'h-3.5 w-3.5'
        )}
      >
        TW
      </span>
      {expanded && 'Tim White'}
    </span>
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
          <div className='max-w-md w-full rounded-xl border border-(--linear-app-shell-border) bg-surface-0/60 px-6 py-8 text-center'>
            <div className='mx-auto h-10 w-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 grid place-items-center mb-4'>
              <Mic2 className='h-4 w-4 text-cyan-300' strokeWidth={2.25} />
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
                className='inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-cyan-500 text-on-primary text-[12.5px] font-caption tracking-[-0.005em] transition-colors duration-150 ease-out hover:bg-cyan-400'
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
                className='inline-flex items-center h-8 px-3 rounded-md border border-(--linear-app-shell-border) bg-surface-1/60 text-[12.5px] font-caption text-secondary-token tracking-[-0.005em] transition-colors duration-150 ease-out hover:text-primary-token hover:bg-surface-1'
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
  editing,
  onToggleEdit,
  onClear,
  showEditToggle,
}: {
  track: TrackInfo;
  editing: boolean;
  onToggleEdit: () => void;
  onClear?: () => void;
  showEditToggle: boolean;
}) {
  return (
    <div className='shrink-0 sticky top-0 z-10 bg-(--linear-app-content-surface) px-4 pt-3 pb-2 flex items-center gap-3 select-none border-b border-(--linear-app-shell-border)/50'>
      <span className='text-[10px] uppercase tracking-[0.12em] font-medium text-quaternary-token/85'>
        Lyrics
      </span>
      <span className='text-[12.5px] font-caption text-primary-token tracking-[-0.012em] truncate'>
        {track.title}
      </span>
      <span className='text-[11px] text-tertiary-token truncate'>
        {track.artist}
      </span>
      <div className='ml-auto flex items-center gap-1'>
        {onClear && (
          <button
            type='button'
            onClick={onClear}
            className='hidden md:inline-flex h-7 px-2 rounded-md text-[10.5px] uppercase tracking-[0.08em] text-quaternary-token/85 hover:text-secondary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
            title='Clear lyrics (preview empty state)'
          >
            Clear
          </button>
        )}
        {showEditToggle && (
          <button
            type='button'
            onClick={onToggleEdit}
            aria-pressed={editing}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-caption tracking-[-0.005em] transition-colors duration-150 ease-out',
              editing
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                : 'text-secondary-token border border-(--linear-app-shell-border) hover:text-primary-token hover:bg-surface-1'
            )}
            title={editing ? 'Done editing' : 'Edit lyric timings'}
          >
            <Pencil className='h-3 w-3' strokeWidth={2.25} />
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
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

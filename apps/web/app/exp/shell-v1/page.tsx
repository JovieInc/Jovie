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

import {
  Activity,
  AudioLines,
  AudioWaveform,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mic,
  Minimize2,
  Pause,
  Pin,
  PinOff,
  Play,
  Repeat,
  Search,
  Settings,
  Shield,
  Shuffle,
  SkipBack,
  SkipForward,
  Users,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'a' | 'b' | 'c' | 'd' | 'e';
type CanvasView = 'demo' | 'releases' | 'tracks';

type TrackInfo = {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  bpm: number;
  key: string;
  version: string;
};

// Most transitions snap (150ms ease-out). Layout transformations get
// a cinematic curve — the kind of thing you only get on macOS / Apple
// surfaces, where the system invests motion budget in revealing structure.
const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

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
type TrackStatus = 'released' | 'scheduled' | 'draft';
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
    status: 'released',
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
    status: 'released',
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
    status: 'released',
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
    status: 'released',
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
    status: 'released',
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
    status: 'released',
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
  const [peekOpen, setPeekOpen] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [loopMode, setLoopMode] = useState<'off' | 'track' | 'section'>('off');
  const [waveformOn, setWaveformOn] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<CanvasView>('demo');
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
  // Search state lives at the page level so click-artist / click-title in
  // any view can populate it and open the breadcrumb-takeover.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyMode, setKeyMode] = useState<'normal' | 'camelot'>('normal');
  const playingRelease = RELEASES.find(r => r.id === playingReleaseId);
  const currentTrack: TrackInfo = playingRelease
    ? trackFromRelease(playingRelease)
    : trackFromRelease(RELEASES[0]);

  // One-shot cinematic shell entry: render hidden on first paint, then
  // fade + lift on the next frame so the curve plays out.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
      } else if (e.key === '[') {
        e.preventDefault();
        setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'));
      } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setBarCollapsed(v => !v);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setWaveformOn(v => !v);
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
  }, []);

  return (
    <div
      className='flex h-dvh w-full overflow-hidden bg-(--linear-bg-page) lg:gap-2 lg:p-2'
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(0.985)',
        transition: `opacity 600ms ${EASE_CINEMATIC}, transform 600ms ${EASE_CINEMATIC}`,
      }}
    >
      {/* Docked sidebar — always mounted; width + opacity animate so the
          canvas slides over smoothly when the user pins/unpins. */}
      <div
        className='hidden lg:flex h-full overflow-hidden shrink-0'
        style={{
          width: sidebarMode === 'docked' ? 224 : 0,
          opacity: sidebarMode === 'docked' ? 1 : 0,
          transform:
            sidebarMode === 'docked' ? 'translateX(0)' : 'translateX(-12px)',
          transition: `width ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
        aria-hidden={sidebarMode !== 'docked'}
      >
        <Sidebar variant='docked' onPin={() => setSidebarMode('floating')} />
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
      />

      {/* Persistent now-playing card — pinned to bottom-left, survives sidebar
          undocking. Mirrors where it would sit inside the sidebar's bottom. */}
      <div className='hidden lg:block fixed left-2 bottom-2 z-30 w-[224px] px-2 pt-3 pb-2 pointer-events-none'>
        <div className='pointer-events-auto'>
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
          <Header
            sidebarMode={sidebarMode}
            onToggleSidebar={() =>
              setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'))
            }
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            onSearchOpenChange={setSearchOpen}
            onSearchQueryChange={setSearchQuery}
          />
          <div className='flex-1 min-h-0 overflow-hidden flex'>
            <div className='flex-1 min-h-0 min-w-0 overflow-y-auto'>
              {view === 'demo' ? (
                <DemoContent />
              ) : view === 'releases' ? (
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
                  onFilterByArtist={name => {
                    setSearchQuery(`artist:${name}`);
                    setSearchOpen(true);
                  }}
                />
              ) : (
                <TracksView
                  tracks={TRACKS}
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
                  onFilter={(field, value) => {
                    setSearchQuery(`${field}:${value}`);
                    setSearchOpen(true);
                  }}
                />
              )}
            </div>
            {view === 'releases' && selectedReleaseId && (
              <ReleaseDrawer
                release={
                  RELEASES.find(r => r.id === selectedReleaseId) ?? RELEASES[0]
                }
                onClose={() => setSelectedReleaseId(null)}
              />
            )}
          </div>
        </main>

        <div
          aria-hidden={barCollapsed}
          className='overflow-hidden transition-[max-height,opacity] duration-150 ease-out'
          style={{
            maxHeight: barCollapsed ? 0 : 80,
            opacity: barCollapsed ? 0 : 1,
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
      />

      <JovieOverlay listening={jovieListening} />
    </div>
  );
}

function FloatingSidebarLayer({
  active,
  peekOpen,
  onSetPeekOpen,
  onPin,
}: {
  active: boolean;
  peekOpen: boolean;
  onSetPeekOpen: (open: boolean) => void;
  onPin: () => void;
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
        <Sidebar variant='floating' onPin={onPin} />
      </div>
    </>
  );
}

function Sidebar({
  variant,
  onPin,
}: {
  variant: 'docked' | 'floating';
  onPin: () => void;
}) {
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
      className='relative flex flex-col w-[224px] h-full shrink-0'
      onMouseEnter={bumpPinVisibility}
      onMouseMove={bumpPinVisibility}
    >
      {/* Brand row — Jovie wordmark + pin toggle (floating mode only) */}
      <div className='px-2 pt-3 pb-4'>
        <div className='flex items-center h-7 gap-2.5 pl-3 pr-2'>
          <span className='h-3.5 w-3.5 rounded-sm bg-primary shrink-0' />
          <span className='text-[13.5px] font-semibold tracking-[-0.02em] text-primary-token flex-1'>
            Jovie
          </span>
          <button
            type='button'
            onClick={onPin}
            className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-[opacity,color,background-color] duration-300 ease-out'
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
              <Pin className='h-3.5 w-3.5' strokeWidth={2.25} />
            ) : (
              <PinOff className='h-3.5 w-3.5' strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>

      <nav className='flex-1 overflow-y-auto px-2 pb-2 space-y-5'>
        {/* Cross-context items (no label, just the items) */}
        <div className='space-y-px'>
          {CORE_ITEMS.map(item => (
            <SidebarNavItem
              key={item.label}
              item={item}
              collapsed={collapsed}
            />
          ))}
        </div>

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
          />
        </div>
      </nav>

      {/* Reserve room at the bottom for the fixed now-playing card so the
          nav doesn't scroll behind it when the workspace lists get long. */}
      <div className='h-[88px] shrink-0' aria-hidden='true' />
    </aside>
  );
}

function Workspace({
  workspace,
  open,
  onToggle,
  collapsed,
}: {
  workspace: Workspace;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
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
        className='relative w-full flex items-center gap-2.5 h-7 pl-3 pr-2 rounded-md hover:bg-surface-1/70 transition-colors duration-150 ease-out'
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
          maxHeight: open ? workspace.items.length * 30 + 12 : 0,
          opacity: open ? 1 : 0,
          transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity 200ms ease-out`,
        }}
      >
        {/* Subtle inset wrapper — felt depth, not 3D. The items area sits
            visually "lower" than the workspace header above it. */}
        <div className='relative space-y-px pt-1.5 pb-0.5 [&_a:hover]:bg-surface-1/50'>
          <span
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-0 top-0 h-px bg-(--linear-app-shell-border)/40'
            style={{ left: 'calc(0.75rem + 14px)', right: '0.5rem' }}
          />
          {workspace.items.map(item => (
            <SidebarNavItem
              key={item.label}
              item={item}
              collapsed={false}
              nested
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

function SidebarNavItem({
  item,
  collapsed,
  nested,
}: {
  item: NavItem;
  collapsed: boolean;
  nested?: boolean;
}) {
  return (
    <button
      type='button'
      className={cn(
        'relative flex items-center gap-2.5 rounded-md text-[13px] w-full transition-colors duration-150 ease-out tracking-[-0.005em]',
        collapsed ? 'h-8 w-10 mx-auto justify-center' : 'h-7 pl-3 pr-2',
        item.active
          ? 'text-primary-token bg-surface-1'
          : nested
            ? 'text-tertiary-token hover:bg-surface-1/40 hover:text-primary-token'
            : 'text-secondary-token hover:bg-surface-1/60 hover:text-primary-token'
      )}
    >
      <item.icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
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

// Mock breadcrumb derivation: hardcoded for now since the active item is
// Dashboard under the Bahamas artist workspace. In production this would
// come from useAuthRouteConfig.
const BREADCRUMB_TRAIL: Array<{ label: string; emphasis?: boolean }> = [
  { label: 'Bahamas' },
  { label: 'Dashboard', emphasis: true },
];

function Header({
  sidebarMode,
  onToggleSidebar,
  searchOpen,
  searchQuery,
  onSearchOpenChange,
  onSearchQueryChange,
}: {
  sidebarMode: 'docked' | 'floating';
  onToggleSidebar: () => void;
  searchOpen: boolean;
  searchQuery: string;
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: (q: string) => void;
}) {
  const sidebarHidden = sidebarMode === 'floating';
  const searchRef = useRef<HTMLInputElement>(null);

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
        onSearchQueryChange('');
      } else if (!inField && e.key === '/') {
        e.preventDefault();
        onSearchOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, onSearchOpenChange, onSearchQueryChange]);

  // Focus the input when search opens.
  useEffect(() => {
    if (searchOpen) {
      const id = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [searchOpen]);

  return (
    <header className='shrink-0 h-12 px-3 flex items-center gap-2'>
      <button
        type='button'
        onClick={onToggleSidebar}
        className='h-7 w-7 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out shrink-0'
        aria-label={
          sidebarHidden
            ? 'Dock sidebar ([)'
            : 'Hide sidebar — peek on left edge ([)'
        }
        title={sidebarHidden ? 'Dock sidebar' : 'Hide sidebar (peek on hover)'}
      >
        {sidebarHidden ? (
          <ChevronRight className='h-3.5 w-3.5' strokeWidth={2.25} />
        ) : (
          <ChevronLeft className='h-3.5 w-3.5' strokeWidth={2.25} />
        )}
      </button>
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
          {BREADCRUMB_TRAIL.map((crumb, i) => (
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

        {/* Search takeover */}
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
          <Search
            className='h-3.5 w-3.5 text-tertiary-token mr-2 shrink-0'
            strokeWidth={2.25}
          />
          <input
            ref={searchRef}
            type='text'
            placeholder='Search anything…'
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            className='flex-1 bg-transparent text-[13px] text-primary-token placeholder:text-tertiary-token outline-none'
            onBlur={() => {
              if (!searchQuery) onSearchOpenChange(false);
            }}
          />
          <kbd className='ml-2 text-[10px] text-quaternary-token'>esc</kbd>
        </div>
      </div>

      <div className='flex items-center gap-1 shrink-0'>
        <button
          type='button'
          onClick={() => onSearchOpenChange(true)}
          className='h-7 w-7 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
          aria-label='Search (⌘K)'
          title='Search (⌘K)'
        >
          <Search className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
        <button
          type='button'
          className='h-7 px-3 rounded-md bg-primary text-on-primary text-[12px] font-caption hover:opacity-90 ml-1'
        >
          Share profile
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
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
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='h-7 w-7 rounded-full bg-surface-2 border border-(--linear-app-shell-border) text-secondary-token text-[11px] font-caption grid place-items-center hover:bg-surface-1 hover:text-primary-token transition-colors duration-150 ease-out'
        aria-label='Account menu'
        aria-expanded={open}
      >
        TW
      </button>
      {open && (
        <div className='absolute right-0 top-9 w-56 rounded-lg border border-subtle bg-(--linear-app-content-surface) shadow-[0_12px_40px_rgba(0,0,0,0.16)] p-1 z-50'>
          <div className='px-2 py-2 border-b border-subtle mb-1'>
            <div className='text-[12.5px] font-caption text-primary-token leading-tight'>
              Tim White
            </div>
            <div className='text-[11px] text-tertiary-token leading-tight mt-0.5'>
              t@timwhite.co
            </div>
          </div>
          <MenuItem icon={Settings} label='Settings' />
          <MenuItem icon={Shield} label='Admin' />
          <div className='border-t border-subtle my-1' />
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
      className='w-full flex items-center gap-2.5 px-2 h-7 rounded text-[12.5px] text-secondary-token hover:bg-surface-1 hover:text-primary-token'
    >
      <Icon className='h-3.5 w-3.5' />
      {label}
    </button>
  );
}

function DemoContent() {
  return (
    <div className='p-6 space-y-4'>
      <h1 className='text-2xl font-display tracking-tight text-primary-token'>
        Welcome back, Bahamas
      </h1>
      <p className='text-[14px] text-secondary-token max-w-prose'>
        This is a scratch route for the shell V1 design pass. Use the picker
        top-right to compare the four audio bar treatments and the
        collapse-into-siderail behavior. Real components are not wired — layout
        chrome only.
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: demo content
            key={i}
            className='aspect-[16/10] rounded-lg border border-subtle bg-surface-0/60 p-4 flex flex-col justify-end'
          >
            <div className='h-2 w-12 rounded-full bg-surface-1 mb-2' />
            <div className='h-3 w-32 rounded-full bg-surface-1' />
          </div>
        ))}
      </div>
    </div>
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
}) {
  // All variants share the V1a 64px / two-row Spotify shell.
  // What differs is the *scrub* — playing with how loud or quiet the
  // player is, and what kind of artist control it surfaces.
  const transportButtons = (
    <div className='flex items-center gap-1.5 justify-self-center'>
      <IconBtn label='Shuffle'>
        <Shuffle className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
      <IconBtn label='Previous'>
        <SkipBack className='h-4 w-4' strokeWidth={2.5} fill='currentColor' />
      </IconBtn>
      <button
        type='button'
        onClick={onPlay}
        className='h-8 w-8 rounded-full grid place-items-center bg-primary text-on-primary transition-transform duration-150 ease-out hover:scale-[1.04] active:scale-95'
        aria-label={isPlaying ? 'Pause (space)' : 'Play (space)'}
        title={isPlaying ? 'Pause (space)' : 'Play (space)'}
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
      <IconBtn label='Next'>
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
        label={waveformOn ? 'Hide waveform (W)' : 'Show waveform (W)'}
        onClick={onToggleWaveform}
        active={waveformOn}
      >
        {waveformOn ? (
          <AudioLines className='h-3.5 w-3.5' strokeWidth={2.25} />
        ) : (
          <AudioWaveform className='h-3.5 w-3.5' strokeWidth={2.25} />
        )}
      </IconBtn>
      <IconBtn label='Volume'>
        <Volume2 className='h-3.5 w-3.5' strokeWidth={2.25} />
      </IconBtn>
      <IconBtn label='Minimize player' onClick={onCollapse}>
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
      className='group/bar shrink-0 hidden lg:flex flex-col px-4'
    >
      {/* Waveform drawer — opens upward above the fixed control row. */}
      <div
        aria-hidden={!waveformOn}
        className='overflow-hidden'
        style={{
          maxHeight: waveformOn ? 40 : 0,
          opacity: waveformOn ? 1 : 0,
          transform: waveformOn ? 'translateY(0)' : 'translateY(6px)',
          transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, transform ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}`,
        }}
      >
        <div className='grid grid-cols-[1fr_minmax(360px,_720px)_1fr] gap-4 items-center pt-2'>
          <div />
          {scrub}
          <div />
        </div>
      </div>

      {/* Fixed control row — never moves when the waveform opens. */}
      <div
        className='grid grid-cols-[1fr_minmax(360px,_720px)_1fr] gap-4 items-center'
        style={{ height: 56 }}
      >
        <div />
        {transportButtons}
        {rightCluster}
      </div>
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
        'relative h-7 w-7 rounded grid place-items-center transition-colors duration-150 ease-out',
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

function IconBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'h-7 w-7 rounded grid place-items-center transition-colors duration-150 ease-out',
        active
          ? 'text-primary-token'
          : 'text-quaternary-token hover:text-primary-token'
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
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
}) {
  const variants: Array<{ id: Variant; name: string }> = useMemo(
    () => [
      { id: 'c', name: 'Filled (locked)' },
      { id: 'a', name: 'Hairlines' },
      { id: 'b', name: 'Stereo split' },
      { id: 'd', name: 'Peaks + RMS' },
      { id: 'e', name: 'Dense bars' },
    ],
    []
  );

  return (
    <div className='fixed top-3 right-3 z-50 rounded-xl border border-subtle bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] p-2 w-[240px]'>
      <p className='text-[10px] uppercase tracking-wider text-tertiary-token px-2 pt-1 pb-1.5 font-semibold'>
        Canvas
      </p>
      <div className='flex items-center gap-1 px-1 pb-2 border-b border-subtle'>
        {(['demo', 'releases', 'tracks'] as CanvasView[]).map(v => (
          <button
            key={v}
            type='button'
            onClick={() => onView(v)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-[12px] font-caption capitalize transition-colors duration-150 ease-out',
              view === v
                ? 'bg-primary text-on-primary'
                : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <p className='text-[10px] uppercase tracking-wider text-tertiary-token px-2 pt-2 pb-1.5 font-semibold'>
        Waveform style
      </p>
      <div className='space-y-0.5'>
        {variants.map(v => (
          <button
            key={v.id}
            type='button'
            onClick={() => onVariant(v.id)}
            className={cn(
              'w-full text-left rounded-md px-2 py-1 text-[12px] font-caption leading-tight transition-colors duration-150 ease-out',
              variant === v.id
                ? 'bg-primary text-on-primary'
                : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            {v.name}
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
            className='absolute inset-0 rounded-full ring-2 ring-primary/40 animate-ping'
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
              className='w-[2px] bg-primary-token rounded-sm animate-pulse'
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
// Releases — Apple Music-style row list with Linear-style stacked chip
// expansion on the right rail. Keyboard-navigable: ↑/↓ moves focus, Enter
// opens the drawer, Space plays/pauses the focused row, Esc closes drawer.
// ---------------------------------------------------------------------------

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
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(releases.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
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
      <header className='shrink-0 px-6 pt-6 pb-4 flex items-end justify-between'>
        <div>
          <h1 className='text-[22px] font-display tracking-[-0.02em] text-primary-token leading-tight'>
            Releases
          </h1>
          <p className='text-[12.5px] text-tertiary-token mt-0.5'>
            {releases.length} releases · ↑/↓ navigate · Enter opens · Space
            plays · hold ⌘J to ask Jovie
          </p>
        </div>
      </header>
      <div className='flex-1 min-h-0 overflow-y-auto px-3 pb-6'>
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
}) {
  // currentTimeSec/onSeek are wired through for the Tracks view's row
  // waveform — Release rows don't render a waveform.
  void _currentTimeSec;
  void _onSeek;
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: list row activates via parent section's keyboard handler; mouse-click is a convenience
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above — parent section handles ↑/↓/Enter/Space/Esc
    <li
      onClick={onSelect}
      data-selected={isSelected || undefined}
      data-focused={isFocused || undefined}
      className={cn(
        'group/row relative grid items-center gap-3 h-[52px] rounded-md pl-2 pr-3 cursor-pointer transition-colors duration-150 ease-out',
        // [#] [art] [title/artist+badge fluid] [date] [right cluster: streams + DSP stack]
        drawerOpen
          ? 'grid-cols-[24px_40px_minmax(0,1fr)_auto]'
          : 'grid-cols-[24px_40px_minmax(0,1fr)_auto_auto]',
        isSelected && 'bg-surface-1',
        !isSelected && 'hover:bg-surface-1/50',
        isFocused &&
          'ring-1 ring-inset ring-(--linear-app-shell-border) ring-offset-0'
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
      <div className='relative h-10 w-10 rounded overflow-hidden shrink-0'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={release.artwork}
          alt=''
          className='h-full w-full object-cover'
        />
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

      {/* Right cluster: streams + DSP avatar stack */}
      <div className='flex items-center gap-4 justify-end'>
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

// Stacked DSP avatar pile (Soundcloud / streaming-app style): tight overlap
// at rest, fans out on row hover with each avatar's status ring visible.
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
function DspAvatarStack({ release }: { release: Release }) {
  return (
    <div className='flex items-center -space-x-1.5 group-hover/row:space-x-1 transition-[margin] duration-200 ease-out'>
      {DSP_ORDER.map(dsp => {
        const status = release.dsps[dsp];
        const dim = status === 'missing';
        return (
          <span
            key={dsp}
            title={`${DSP_LABEL[dsp]} · ${status}`}
            className={cn(
              'relative h-[18px] w-[18px] rounded-full grid place-items-center text-[8.5px] font-semibold text-white shrink-0',
              'ring-2 ring-(--linear-bg-page) transition-[transform,opacity] duration-200 ease-out',
              dim ? 'bg-quaternary-token/40 opacity-50' : DSP_COLOR[dsp]
            )}
          >
            {DSP_GLYPH[dsp]}
            {status === 'pending' && (
              <span
                aria-hidden='true'
                className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-(--linear-bg-page)'
              />
            )}
            {status === 'error' && (
              <span
                aria-hidden='true'
                className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-1 ring-(--linear-bg-page)'
              />
            )}
          </span>
        );
      })}
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
// brighter when this row's track is playing. Click anywhere to seek.
// Cue markers sit just above the waveform as small color-coded ticks.
const ROW_WF_W = 600;
const ROW_WF_H = 26;
const ROW_WF_TOP = 6; // reserved for cue ticks
const ROW_WF_WAVE_H = ROW_WF_H - ROW_WF_TOP;
const ROW_WF_CY = ROW_WF_TOP + ROW_WF_WAVE_H / 2;
const ROW_WF_AMP = ROW_WF_WAVE_H / 2 - 1;

const CUE_TONE: Record<CueKind, string> = {
  intro: 'bg-sky-400',
  verse: 'bg-tertiary-token/70',
  chorus: 'bg-emerald-400',
  drop: 'bg-amber-400',
  bridge: 'bg-violet-400',
  outro: 'bg-quaternary-token/80',
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
            y1={ROW_WF_TOP - 2}
            y2={ROW_WF_H}
            stroke='currentColor'
            strokeWidth='1'
            className='text-primary-token'
            vectorEffect='non-scaling-stroke'
          />
        )}
      </svg>

      {/* Cue ticks layered above the SVG so we can use Tailwind tokens */}
      <div className='pointer-events-none absolute inset-x-0 top-0 h-[5px]'>
        {release.cues.map(c => {
          const left = (c.at / release.durationSec) * 100;
          return (
            <span
              key={`${release.id}-${c.label}-${c.at}`}
              className={cn(
                'absolute top-0 h-[5px] w-px rounded-sm transition-opacity duration-150 ease-out',
                CUE_TONE[c.kind],
                'opacity-60 group-hover/wf:opacity-100'
              )}
              style={{ left: `${left}%` }}
              title={`${c.label} · ${formatTime(c.at)}`}
            />
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
      <span className='flex items-end gap-[2px] h-3'>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className='w-[2px] bg-primary-token rounded-sm animate-pulse'
            style={{
              height: `${30 + i * 25}%`,
              animationDelay: `${i * 120}ms`,
              animationDuration: '900ms',
            }}
          />
        ))}
      </span>
    </span>
  );
}

function AgentPulse() {
  return (
    <span
      aria-hidden='true'
      title='Agent working'
      className='absolute inset-0 ring-1 ring-inset ring-primary-token/40 rounded animate-pulse pointer-events-none'
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

function ReleaseDrawer({
  release,
  onClose,
}: {
  release: Release;
  onClose: () => void;
}) {
  return (
    <aside className='hidden md:flex flex-col w-[388px] shrink-0 border-l border-(--linear-app-shell-border) bg-(--linear-app-content-surface)'>
      <header className='shrink-0 flex items-center gap-2 px-4 h-12 border-b border-subtle/60'>
        <div className='flex-1 min-w-0'>
          <div className='truncate text-[12px] font-caption text-primary-token tracking-[-0.012em]'>
            {release.title}
          </div>
          <div className='truncate text-[10.5px] text-tertiary-token mt-0.5'>
            {release.artist} · {release.type}
          </div>
        </div>
        <button
          type='button'
          onClick={onClose}
          className='h-7 w-7 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1 transition-colors duration-150 ease-out'
          aria-label='Close drawer (Esc)'
          title='Close (Esc)'
        >
          <ChevronRight className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
      </header>

      <div className='flex-1 min-h-0 overflow-y-auto p-4 space-y-5'>
        <div className='flex items-start gap-3'>
          <div className='relative h-20 w-20 rounded-md overflow-hidden shrink-0'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={release.artwork}
              alt=''
              className='h-full w-full object-cover'
            />
          </div>
          <div className='min-w-0 flex-1'>
            <div className='text-[10px] uppercase tracking-[0.12em] text-quaternary-token/85 font-medium'>
              {release.type}
            </div>
            <div className='text-[15px] font-caption text-primary-token tracking-[-0.015em] leading-tight mt-1'>
              {release.title}
            </div>
            <div className='text-[12px] text-tertiary-token mt-0.5'>
              {release.artist} · {release.album}
            </div>
            <div className='text-[11px] text-quaternary-token mt-1.5'>
              {relativeDate(release.releaseDate)} ·{' '}
              {new Date(release.releaseDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        <div className='space-y-2'>
          <SectionLabel>Distribution</SectionLabel>
          <ul className='space-y-1'>
            {DSP_ORDER.map(dsp => (
              <li
                key={dsp}
                className='flex items-center gap-2 text-[12.5px] text-secondary-token'
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    chipDot(dspTone(release.dsps[dsp]))
                  )}
                />
                <span className='flex-1'>{DSP_LABEL[dsp]}</span>
                <span className='text-[11px] text-quaternary-token capitalize'>
                  {release.dsps[dsp]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className='space-y-2'>
          <SectionLabel>This week</SectionLabel>
          <div className='flex items-baseline gap-2'>
            <span className='text-[18px] font-caption text-primary-token tabular-nums tracking-[-0.015em]'>
              {release.weeklyStreams.toLocaleString()}
            </span>
            <span className='text-[11px] text-tertiary-token'>streams</span>
            <span
              className={cn(
                'text-[11px] tabular-nums ml-auto',
                release.weeklyDelta > 0
                  ? 'text-emerald-500'
                  : release.weeklyDelta < 0
                    ? 'text-rose-500'
                    : 'text-tertiary-token'
              )}
            >
              {release.weeklyDelta > 0 ? '+' : ''}
              {release.weeklyDelta}%
            </span>
          </div>
        </div>

        {release.tasksOpen > 0 && (
          <div className='space-y-2'>
            <SectionLabel>Tasks</SectionLabel>
            <div className='text-[12.5px] text-secondary-token'>
              {release.tasksOpen} open
            </div>
          </div>
        )}

        {release.agent !== 'idle' && (
          <div className='rounded-md border border-(--linear-app-shell-border) bg-surface-1/40 px-3 py-2'>
            <div className='flex items-center gap-2'>
              <span className='h-1.5 w-1.5 rounded-full bg-primary-token animate-pulse' />
              <span className='text-[12px] text-secondary-token'>
                {agentLabel(release.agent)}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className='text-[9.5px] uppercase tracking-[0.12em] text-quaternary-token/85 font-medium'>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracks — Lexicon-style table. Denser, alternating rows, table headers,
// inline mini-waveform, BPM/Key (with Camelot toggle), Rating, Energy,
// status icons, and click-to-filter on artist + title.
// ---------------------------------------------------------------------------

function TracksView({
  tracks,
  playingId,
  isPlaying,
  currentTimeSec,
  keyMode,
  onKeyModeToggle,
  onPlay,
  onSeek,
  onFilter,
}: {
  tracks: Track[];
  playingId: string;
  isPlaying: boolean;
  currentTimeSec: number;
  keyMode: 'normal' | 'camelot';
  onKeyModeToggle: () => void;
  onPlay: (id: string) => void;
  onSeek: (id: string, sec: number) => void;
  onFilter: (field: 'artist' | 'title' | 'album', value: string) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(tracks.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(0, i - 1));
    } else if (e.code === 'Space') {
      e.preventDefault();
      const t = tracks[focusedIndex];
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
      <header className='shrink-0 px-6 pt-6 pb-3 flex items-end justify-between gap-3'>
        <div>
          <h1 className='text-[22px] font-display tracking-[-0.02em] text-primary-token leading-tight'>
            Tracks
          </h1>
          <p className='text-[12.5px] text-tertiary-token mt-0.5'>
            {tracks.length} tracks · click artist or title to filter · ↑/↓
            navigate · Space plays · hold ⌘J to ask Jovie
          </p>
        </div>
        <button
          type='button'
          onClick={onKeyModeToggle}
          className='h-7 px-2.5 rounded-md text-[11px] font-caption text-secondary-token border border-(--linear-app-shell-border) hover:bg-surface-1 hover:text-primary-token transition-colors duration-150 ease-out'
          title={`Switch to ${keyMode === 'normal' ? 'Camelot' : 'standard'} key notation`}
        >
          Key: {keyMode === 'normal' ? 'Standard' : 'Camelot'}
        </button>
      </header>

      <div className='flex-1 min-h-0 overflow-y-auto'>
        <table className='w-full text-[12px] tracking-[-0.005em]'>
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 32 }} />
            <col />
            <col />
            <col style={{ width: 64 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token/85 font-medium'>
              <th className='text-left pl-3 py-2'>#</th>
              <th />
              <th className='text-left py-2'>Title</th>
              <th className='text-left py-2'>Artist</th>
              <th className='text-right py-2 tabular-nums'>BPM</th>
              <th className='text-right py-2 tabular-nums'>
                {keyMode === 'normal' ? 'Key' : 'Cam'}
              </th>
              <th className='text-left py-2'>Energy</th>
              <th className='text-left py-2'>Rating</th>
              <th className='text-left py-2'>Waveform</th>
              <th className='text-right pr-4 py-2'>State</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i + 1}
                zebra={i % 2 === 1}
                isPlaying={t.id === playingId && isPlaying}
                isCurrentTrack={t.id === playingId}
                isFocused={i === focusedIndex}
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrackRow({
  track,
  index,
  zebra,
  isPlaying,
  isCurrentTrack,
  isFocused,
  currentTimeSec,
  keyMode,
  onSelect,
  onPlay,
  onSeek,
  onFilter,
}: {
  track: Track;
  index: number;
  zebra: boolean;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  isFocused: boolean;
  currentTimeSec: number;
  keyMode: 'normal' | 'camelot';
  onSelect: () => void;
  onPlay: () => void;
  onSeek: (sec: number) => void;
  onFilter: (field: 'artist' | 'title' | 'album', value: string) => void;
}) {
  return (
    <tr
      onClick={onSelect}
      data-focused={isFocused || undefined}
      className={cn(
        'group/row h-[40px] cursor-pointer transition-colors duration-150 ease-out',
        zebra ? 'bg-surface-1/30' : 'bg-transparent',
        'hover:bg-surface-1/60',
        isFocused &&
          'outline outline-1 -outline-offset-1 outline-(--linear-app-shell-border)'
      )}
    >
      {/* # / Play */}
      <td className='pl-3 align-middle'>
        <div className='relative h-5 w-5 grid place-items-center'>
          <span
            className={cn(
              'text-[11px] tabular-nums text-quaternary-token transition-opacity duration-150 ease-out',
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
              isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
            }
          >
            {isPlaying ? (
              <Pause
                className='h-3 w-3'
                fill='currentColor'
                strokeWidth={2.5}
              />
            ) : (
              <Play
                className='h-3 w-3 translate-x-px'
                fill='currentColor'
                strokeWidth={2.5}
              />
            )}
          </button>
        </div>
      </td>

      {/* Cropped artwork sliver — Lexicon-style */}
      <td className='align-middle'>
        <div className='relative h-7 w-7 rounded-sm overflow-hidden'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={track.artwork}
            alt=''
            className='h-full w-full object-cover'
          />
        </div>
      </td>

      {/* Title */}
      <td className='align-middle'>
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onFilter('title', track.title);
          }}
          className='block max-w-full truncate text-[12.5px] font-caption text-primary-token tracking-[-0.012em] hover:underline decoration-quaternary-token underline-offset-2'
          title='Filter by title'
        >
          {track.title}
        </button>
      </td>

      {/* Artist */}
      <td className='align-middle'>
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            onFilter('artist', track.artist);
          }}
          className='block max-w-full truncate text-[12px] text-secondary-token hover:underline decoration-quaternary-token underline-offset-2'
          title='Filter by artist'
        >
          {track.artist}
        </button>
      </td>

      {/* BPM */}
      <td className='align-middle text-right pr-2'>
        <span
          className={cn(
            'text-[12px] tabular-nums',
            track.bpmTone === 'high'
              ? 'text-rose-400/90'
              : track.bpmTone === 'low'
                ? 'text-sky-400/90'
                : 'text-secondary-token'
          )}
        >
          {track.bpm}
        </span>
      </td>

      {/* Key */}
      <td className='align-middle text-right pr-2'>
        <span className='text-[12px] tabular-nums text-secondary-token'>
          {keyMode === 'normal' ? track.keyNormal : track.keyCamelot}
        </span>
      </td>

      {/* Energy bars */}
      <td className='align-middle'>
        <EnergyBars value={track.energy} />
      </td>

      {/* Rating */}
      <td className='align-middle'>
        <RatingDots value={track.rating} />
      </td>

      {/* Mini waveform — click to seek */}
      <td className='align-middle'>
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
      </td>

      {/* Status icons cluster */}
      <td className='align-middle text-right pr-4'>
        <StatusIcons track={track} />
      </td>
    </tr>
  );
}

function EnergyBars({ value }: { value: number }) {
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

function RatingDots({ value }: { value: number }) {
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

function StatusIcons({ track }: { track: Track }) {
  return (
    <span className='inline-flex items-center gap-1 text-quaternary-token'>
      {track.status === 'scheduled' && (
        <span title='Scheduled' className='text-amber-400'>
          ◴
        </span>
      )}
      {track.status === 'draft' && (
        <span title='Draft' className='text-tertiary-token italic'>
          d
        </span>
      )}
      {track.hasVideo && (
        <span title='Has music video' className='text-tertiary-token'>
          ▶
        </span>
      )}
      {track.hasCanvas && (
        <span title='Has Spotify Canvas' className='text-tertiary-token'>
          ◫
        </span>
      )}
    </span>
  );
}

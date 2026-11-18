/**
 * Homepage v3 product UI data: the featured artist's catalog and the visible strings
 * inside the live product mockups (window, inspector, release page, ⌘K
 * palette). Kept apart from the editorial copy so only the homepage bundles
 * it; the editorial copy is shared with the marketing registries.
 */

import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';

export interface HomepageCatalogRelease {
  readonly title: string;
  readonly byline: string;
  readonly year: string;
  readonly src: string;
  readonly selected?: boolean;
}

/** The featured artist (`data/featuredArtists.ts`; Tim, 2026-11-12: Tim
 * for now, any opted-in artist later). Their catalog, newest first; the
 * inspected release is the selected row. */
const ARTIST = HOMEPAGE_FEATURED_ARTIST;
const INSPECTED = ARTIST.inspected;

export const HOMEPAGE_CATALOG: readonly HomepageCatalogRelease[] =
  ARTIST.releases.map(release =>
    release.title === INSPECTED.title ? { ...release, selected: true } : release
  );

/** The release the profile phone leads with. */
export const HOMEPAGE_LATEST_RELEASE = HOMEPAGE_CATALOG[0];

/** Visible strings inside the live product UI on the homepage. */
export const HOMEPAGE_PRODUCT_UI = {
  searchChats: 'Search chats',
  inbox: 'Inbox',
  releases: 'Releases',
  releaseCount: '18',
  searchCommand: 'Search or run a command',
  columns: { title: 'Title', platforms: 'Platforms', released: 'Released' },
  inspector: {
    src: INSPECTED.src,
    title: INSPECTED.title,
    artist: ARTIST.name,
    tabs: ['Details', 'Assets', 'Links', 'Rights'],
    /** Field names as the product inspector shows them (sentence case). */
    fields: {
      date: 'Release date',
      type: 'Type',
      tracks: 'Tracks',
      duration: 'Duration',
      genres: 'Genres',
      label: 'Label',
      upc: 'UPC',
    },
    date: INSPECTED.date,
    type: INSPECTED.type,
    tracks: INSPECTED.tracks,
    duration: INSPECTED.duration,
    genres: INSPECTED.genres,
    label: INSPECTED.label,
    upc: INSPECTED.upc,
  },
  releasePage: {
    src: INSPECTED.src,
    title: INSPECTED.title,
    artist: ARTIST.name,
    play: 'Play',
    more: (count: number) => `+${count} more services`,
    madeWith: 'Made with Jovie',
  },
  palette: {
    placeholder: 'Search Jovie or run a command…',
    goToLabel: 'Go To',
    skillsLabel: 'Skills',
    query: 'releases',
    queryTarget: 'Releases',
    goTo: [
      {
        icon: 'profile',
        label: 'Profile',
        description: 'Open your profile in the chat workspace.',
        shortcut: '⌘1',
        selected: true,
      },
      {
        icon: 'presence',
        label: 'Presence',
        description: 'Monitor artist profiles and public pages.',
        shortcut: '⌘2',
      },
      {
        icon: 'connections',
        label: 'Connections',
        description: 'Manage authorized services.',
        shortcut: '⌘3',
      },
      {
        icon: 'chats',
        label: 'Chats',
        description: 'Open the chats workspace.',
      },
      {
        icon: 'releases',
        label: 'Releases',
        description: 'Manage your release catalog.',
      },
    ],
    skills: [
      {
        icon: 'art',
        label: 'Generate album art',
        description: 'Three options for a release.',
      },
      {
        icon: 'pitch',
        label: 'Generate pitch',
        description: 'Draft a release pitch in chat.',
      },
    ],
  },
  keys: { command: 'command' },
  escapeKey: 'Esc',
} as const;

/** 03 specs copy. Its numbers are not copy: they derive from their sources. */
export const HOMEPAGE_SPECS_COPY = {
  headline: 'The details.',
  body: 'The numbers behind every page.',
  meter: (listen: number, recognised: number) =>
    `${listen} of ${recognised} recognized services are streaming`,
  paletteCaption: {
    lead: 'Everything is one keystroke away.',
    body: 'Jump to a release, open your profile, or run a skill like drafting a pitch.',
  },
  inspectorCaption: {
    lead: 'Every field, inspected.',
    body: 'Date, type, tracks, duration, genres, label and UPC in one panel.',
  },
  upcCallout: 'upc',
  services: {
    label: 'Services',
    listen: { title: 'Streaming services', detail: 'supported' },
    recognised: {
      title: 'Services recognized',
      detail: 'streaming, video and metadata',
    },
  },
  /** Sheet rows after Services: label, then up to three cells. */
  rows: [
    {
      label: 'Identifiers',
      cells: [
        {
          value: 'Per track',
          title: 'ISRC',
          detail: 'on recordings and tracks',
        },
        {
          value: 'Per release',
          title: 'UPC',
          /** Resolved from the inspector's release (the same UPC on screen). */
          detail: 'upc',
          derived: true,
        },
      ],
    },
    {
      label: 'Keyboard',
      cells: [
        {
          value: '⌘K',
          title: 'Command palette',
          detail: 'releases, profile, skills',
        },
        {
          value: '⌘1-3',
          title: 'Go to',
          detail: 'Profile, Presence, Connections',
        },
        { value: 'Esc', title: 'Close', detail: 'the command palette' },
      ],
    },
    {
      label: 'Developers',
      cells: [
        {
          /** Resolved from the public API contract's active version. */
          value: 'apiVersion',
          title: 'Public API',
          detail: 'apiSpec',
          mono: true,
          derived: true,
        },
        {
          value: 'Per artist',
          title: 'MCP server',
          detail: '/api/mcp/{handle}',
          mono: true,
        },
        {
          value: '@jovie/cli',
          title: 'Command line',
          detail: 'published on npm',
          mono: true,
        },
      ],
    },
  ],
} as const;

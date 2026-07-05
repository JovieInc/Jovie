import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import type {
  MemoryEnrichmentProviderResponse,
  MemoryIngestSource,
  MemoryScope,
} from './types';

export const memoryFixtureScope: MemoryScope = {
  userId: '00000000-0000-4000-8000-000000000001',
  creatorProfileId: '00000000-0000-4000-8000-000000000002',
};

const steveAoki = {
  type: 'artist' as const,
  name: 'Steve Aoki',
  aliases: ['Aoki'],
  identities: [
    {
      provider: 'musicbrainz',
      providerId: '0f1d4e89-7f2e-4d95-8f6d-steve-aoki',
      confidence: '0.93',
    },
  ],
  confidence: '0.90',
  metadata: { role: 'collaborator' },
};

const dimMakStudio = {
  type: 'location' as const,
  name: 'Dim Mak Studio',
  confidence: '0.88',
  metadata: { locationName: 'Dim Mak Studio', city: 'Los Angeles' },
};

export const memoryDevFixtures = {
  chat: {
    kind: 'chat',
    source: {
      sourceType: 'chat_message',
      externalId: 'chat:thread-1:message-1',
      metadata: {
        channel: 'chat',
        snippet: 'Ran into Steve Aoki at Dim Mak Studio.',
      },
    },
    entities: [steveAoki, dimMakStudio],
  },
  photo: {
    kind: 'photo',
    source: {
      sourceType: 'profile_photo',
      externalId: 'photo:steve-aoki-backstage',
      metadata: {
        capturedAt: '2026-06-01T22:30:00.000Z',
        locationName: 'Dim Mak Studio',
        filename: 'steve-aoki-backstage.jpg',
      },
    },
    asset: {
      kind: 'photo',
      storageKey: 'photos/steve-aoki-backstage.jpg',
      metadata: {
        capturedAt: '2026-06-01T22:30:00.000Z',
        locationName: 'Dim Mak Studio',
      },
      mentions: [steveAoki],
    },
  },
  calendarEvent: {
    kind: 'calendar_event',
    source: {
      sourceType: 'calendar_event',
      externalId: 'calendar:dim-mak-session',
      metadata: {
        provider: CONNECTOR_PROVIDERS.google_calendar,
        locationName: 'Dim Mak Studio',
        startsAt: '2026-06-01T22:00:00.000Z',
      },
    },
    event: {
      title: 'Studio session at Dim Mak Studio',
      occurredAt: '2026-06-01T22:00:00.000Z',
      location: dimMakStudio,
      participants: [steveAoki],
      metadata: {
        locationName: 'Dim Mak Studio',
        startsAt: '2026-06-01T22:00:00.000Z',
      },
    },
  },
  catalogSong: {
    kind: 'catalog_song',
    source: {
      sourceType: 'dev_fixture',
      externalId: 'catalog-song:neon-future',
      metadata: {
        title: 'Neon Future',
        provider: 'catalog_fixture',
      },
    },
    catalogSong: {
      title: 'Neon Future',
      artist: steveAoki,
      releaseTitle: 'Neon Future IV',
      externalIds: [
        {
          provider: 'isrc',
          providerId: 'US-AOK-26-00001',
          confidence: '0.97',
        },
      ],
      metadata: {
        catalogId: 'song_neon_future',
      },
    },
  },
  release: {
    kind: 'release',
    source: {
      sourceType: 'dev_fixture',
      externalId: 'release:neon-future-iv',
      metadata: {
        title: 'Neon Future IV',
        releaseDate: '2026-06-02',
      },
    },
    release: {
      title: 'Neon Future IV',
      artist: steveAoki,
      releaseDate: '2026-06-02',
      songs: ['Neon Future'],
      externalIds: [
        {
          provider: 'musicbrainz-release',
          providerId: 'release-neon-future-iv',
          confidence: '0.96',
        },
      ],
    },
  },
  voiceMemo: {
    kind: 'voice_memo',
    source: {
      sourceType: 'file',
      externalId: 'file:voice-memo-neon-future-hook',
      metadata: {
        filename: 'neon-future-hook.m4a',
        songTitle: 'Neon Future',
      },
    },
    voiceMemo: {
      title: 'Neon Future hook idea',
      songTitle: 'Neon Future',
      recordedAt: '2026-05-30T18:00:00.000Z',
      storageKey: 'voice-memos/neon-future-hook.m4a',
    },
  },
} satisfies Record<string, MemoryIngestSource>;

export const memoryEnrichmentProviderFixtures = {
  wikipedia: {
    provider: 'wikipedia',
    providerId: 'Steve_Aoki',
    sourceUrl: 'https://en.wikipedia.org/wiki/Steve_Aoki',
    name: 'Steve Aoki',
    aliases: ['Steven Hiroyuki Aoki'],
    description: 'American DJ and music producer.',
    birthDate: '1977-11-30',
    facts: [
      {
        fact: 'Steve Aoki is a DJ and music producer',
        confidence: '0.92',
        metadata: { category: 'profession' },
      },
    ],
  },
  wikidata: {
    provider: 'wikidata',
    providerId: 'Q738732',
    sourceUrl: 'https://www.wikidata.org/wiki/Q738732',
    name: 'Steve Aoki',
    aliases: ['Steven Hiroyuki Aoki'],
    birthDate: '1977-11-30',
    identities: [
      {
        provider: 'wikidata',
        providerId: 'Q738732',
        confidence: '0.96',
      },
    ],
  },
  musicbrainz: {
    provider: 'musicbrainz',
    providerId: '0f1d4e89-7f2e-4d95-8f6d-steve-aoki',
    name: 'Steve Aoki',
    aliases: ['Aoki'],
    identities: [
      {
        provider: 'musicbrainz',
        providerId: '0f1d4e89-7f2e-4d95-8f6d-steve-aoki',
        confidence: '0.97',
      },
    ],
    facts: [
      {
        fact: 'Steve Aoki has a MusicBrainz artist identity',
        confidence: '0.97',
        metadata: { category: 'external_identity' },
      },
    ],
  },
} satisfies Record<string, MemoryEnrichmentProviderResponse>;

export const memoryAllDevIngestFixtures = Object.values(memoryDevFixtures);

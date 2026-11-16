import { describe, expect, it } from 'vitest';
import coverage from '@/lib/dsp-coverage/distributor-stores.json';
import {
  DSP_CONFIGS,
  DSP_REGISTRY,
  getRegistryEntry,
  PROVIDER_DOMAINS,
} from '@/lib/dsp-registry';
import { SOCIAL_ICON_DATA } from '@/lib/social-icons/icon-data';
import { detectPlatform } from '@/lib/utils/platform-detection';

type Store = {
  name: string;
  class: 'listen' | 'ugc' | 'b2b' | 'unsupported';
  registryKey?: string;
  reason?: string;
  distributors: string[];
  sources: string[];
};
const stores = coverage.stores as Store[];

describe('AWAL / Orchard distributor store coverage', () => {
  it('records access date and sources for every row', () => {
    expect(coverage.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const s of stores) {
      expect(s.sources.length, s.name).toBeGreaterThan(0);
      for (const id of s.sources) {
        expect(Object.keys(coverage.sources), s.name).toContain(id);
      }
    }
  });

  it('every listen store has a registry entry that renders a listen link', () => {
    for (const s of stores.filter(x => x.class === 'listen')) {
      expect(s.registryKey, s.name).toBeTruthy();
      const entry = getRegistryEntry(s.registryKey as string);
      expect(entry, s.name).toBeDefined();
      expect(entry?.showOnListenPage, s.name).toBe(true);
      expect(DSP_CONFIGS[s.registryKey as string], s.name).toBeDefined();
    }
  });

  it('every listen store has recognised URL domains', () => {
    for (const s of stores.filter(x => x.class === 'listen')) {
      expect(PROVIDER_DOMAINS[s.registryKey as string], s.name).toBeDefined();
    }
  });

  it('every unsupported store states a reason; no fake support', () => {
    for (const s of stores.filter(x => x.class === 'unsupported')) {
      expect(s.reason, s.name).toBeTruthy();
      expect(s.registryKey, s.name).toBeUndefined();
    }
  });

  it('every registry key named in the data exists', () => {
    for (const s of stores.filter(x => x.registryKey)) {
      expect(getRegistryEntry(s.registryKey as string), s.name).toBeDefined();
    }
  });

  it('services with a published brand glyph have it in the social icon data', () => {
    // The registry keeps monogram logos (inlining paths costs every client
    // bundle ~4 KB gz); ProviderIcon draws these glyphs from SOCIAL_ICON_DATA.
    for (const key of ['deezer', 'tidal', 'amazonmusic', 'vk', 'traxsource']) {
      expect(SOCIAL_ICON_DATA[key]?.path, key).toBeTruthy();
    }
  });
});

describe('URL matching for newly added providers', () => {
  const cases: Array<[string, string]> = [
    ['vk_music', 'https://vk.com/music/album/-2000000000_1'],
    ['traxsource', 'https://www.traxsource.com/title/1234/release'],
    ['bugs', 'https://music.bugs.co.kr/artist/123'],
    ['fizy', 'https://fizy.com/s/abc'],
    ['juno_download', 'https://www.junodownload.com/products/x/1/'],
    ['emusic', 'https://www.emusic.com/album/x'],
    ['qobuz', 'https://www.qobuz.com/us-en/album/x/1'],
    ['anghami', 'https://play.anghami.com/album/1'],
    ['boomplay', 'https://www.boomplay.com/albums/1'],
    ['audiomack', 'https://audiomack.com/artist/x'],
    ['kkbox', 'https://www.kkbox.com/tw/album/1'],
  ];
  for (const [key, url] of cases) {
    it(`${key}: registry domain and detector recognise ${url}`, () => {
      const host = new URL(url).hostname;
      expect(getRegistryEntry(key)?.domains).toContain(host);
      expect(detectPlatform(url).platform.id).toBe(key);
    });
  }

  it('registry has no URL-only entry with a MusicFetch service name', () => {
    for (const k of [
      'vk_music',
      'traxsource',
      'bugs',
      'fizy',
      'juno_download',
      'emusic',
    ]) {
      expect(getRegistryEntry(k)?.musicfetchService).toBeNull();
    }
    expect(DSP_REGISTRY.length).toBeGreaterThan(41);
  });
});

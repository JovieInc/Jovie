import { describe, expect, it } from 'vitest';
import {
  normalizeTitle,
  pickProvenChannel,
  scoreChannelAgainstCatalog,
} from '@/lib/youtube/catalog-match';

const catalog = [
  'Midnight Drive',
  'Paper Hearts',
  'Love',
  'Slow Burn (feat. Kai)',
];
const ch = (channelId: string, title: string, videoTitles: string[]) => ({
  channelId,
  title,
  videoTitles,
});

describe('scoreChannelAgainstCatalog', () => {
  it('proves a channel named for the artist that carries 2+ catalog titles', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: catalog,
      channel: ch('UC1', 'Lena Hart', [
        'Lena Hart - Midnight Drive (Official Video)',
        'Paper Hearts [Official Audio]',
        'Studio vlog 12',
      ]),
    });
    expect(m.proven).toBe(true);
    expect(m.matchedTitles).toEqual(['midnight drive', 'paper hearts']);
  });

  it('proves an auto-generated Topic channel from one distinctive title', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: catalog,
      channel: ch('UC2', 'Lena Hart - Topic', ['Midnight Drive']),
    });
    expect(m.proven).toBe(true);
    expect(m.isTopic).toBe(true);
  });

  it('NEGATIVE: same-name different artist with no catalog overlap', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: catalog,
      channel: ch('UC3', 'Lena Hart', ['Cooking pasta', 'Vlog', 'Q&A']),
    });
    expect(m.proven).toBe(false);
  });

  it('NEGATIVE: cover/lyric channel reusing titles under another name', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: catalog,
      channel: ch('UC4', 'Lyrics Vault', [
        'Midnight Drive lyrics',
        'Paper Hearts lyrics',
      ]),
    });
    expect(m.proven).toBe(false);
  });

  it('NEGATIVE: a single non-Topic title is not enough', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: catalog,
      channel: ch('UC5', 'Lena Hart', ['Midnight Drive']),
    });
    expect(m.proven).toBe(false);
  });

  it('NEGATIVE: generic one-word titles never count', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: ['Love', 'Home', 'Intro'],
      channel: ch('UC6', 'Lena Hart - Topic', ['Love', 'Home', 'Intro']),
    });
    expect(m.proven).toBe(false);
  });

  it('NEGATIVE: partial-word title overlap does not match', () => {
    const m = scoreChannelAgainstCatalog({
      artistName: 'Lena Hart',
      catalogTitles: ['Slow Burn', 'Paper Hearts'],
      channel: ch('UC7', 'Lena Hart', [
        'Slow Burning Embers',
        'Paper Heartsick',
      ]),
    });
    expect(m.proven).toBe(false);
  });
});

describe('pickProvenChannel', () => {
  const proven = (id: string, isTopic = false) => ({
    channelId: id,
    proven: true,
    isTopic,
    matchedTitles: [],
    signals: [],
  });
  it('returns null with no proven channel', () => {
    expect(pickProvenChannel([{ ...proven('a'), proven: false }])).toBeNull();
  });
  it('prefers the own channel over the Topic channel', () => {
    expect(pickProvenChannel([proven('t', true), proven('o')])?.channelId).toBe(
      'o'
    );
  });
  it('is ambiguous (null) with two proven own channels', () => {
    expect(pickProvenChannel([proven('a'), proven('b')])).toBeNull();
  });
  it('prefers the typed candidate when proven', () => {
    expect(pickProvenChannel([proven('a'), proven('b')], 'b')?.channelId).toBe(
      'b'
    );
  });
});

describe('normalizeTitle', () => {
  it('strips noise tags and diacritics', () => {
    expect(normalizeTitle('Café Noir (Official Video)')).toBe('cafe noir');
  });
});

/**
 * Streaming services named in AWAL / The Orchard delivery lists that we
 * recognise by URL only (no MusicFetch service name yet). Deliberately tiny
 * and dependency-free so client code (discography config, platform detection)
 * can read it without importing the whole DSP registry. DSP_REGISTRY builds
 * its entries from this list, so it stays the one source.
 * Coverage source: lib/dsp-coverage/distributor-stores.json.
 *
 * The VK and Traxsource hex values must equal their DSP_GLYPH_DATA brand hex
 * (not imported here: it would drag the glyph paths into client bundles;
 * tests/lib/dsp/glyph-subset.test.ts guards the match). `hex` has no leading '#'. Services without a published brand hex use a
 * neutral grey rather than an invented color.
 */
export interface UrlOnlyDsp {
  readonly key: string;
  readonly name: string;
  readonly hex: string;
  readonly domains: readonly string[];
  readonly aliases?: readonly string[];
  readonly searchUrlTemplate?: string;
  /** DSP_GLYPH_DATA key for a real brand glyph (omit = monogram). */
  readonly iconKey?: 'vk' | 'traxsource';
}

const NEUTRAL = '666666';

export const URL_ONLY_DSPS: readonly UrlOnlyDsp[] = [
  {
    key: 'vk_music',
    name: 'VK Music',
    hex: '0077FF',
    domains: ['vk.com', 'www.vk.com', 'vk.ru', 'music.vk.com'],
    aliases: ['vkmusic', 'vk', 'vkontakte'],
    iconKey: 'vk',
  },
  {
    key: 'traxsource',
    name: 'Traxsource',
    hex: '40A0FF',
    domains: ['traxsource.com', 'www.traxsource.com'],
    searchUrlTemplate: 'https://www.traxsource.com/search?term={query}',
    iconKey: 'traxsource',
  },
  {
    key: 'bugs',
    name: 'Bugs',
    hex: NEUTRAL,
    domains: ['bugs.co.kr', 'music.bugs.co.kr'],
    aliases: ['bugsmusic'],
  },
  {
    key: 'fizy',
    name: 'fizy',
    hex: NEUTRAL,
    domains: ['fizy.com', 'www.fizy.com'],
  },
  {
    key: 'juno_download',
    name: 'Juno Download',
    hex: NEUTRAL,
    domains: ['junodownload.com', 'www.junodownload.com'],
    aliases: ['juno', 'junorecords'],
    searchUrlTemplate:
      'https://www.junodownload.com/search/?q%5Ball%5D%5B%5D={query}',
  },
  {
    key: 'emusic',
    name: 'eMusic',
    hex: NEUTRAL,
    domains: ['emusic.com', 'www.emusic.com'],
  },
];

/**
 * Registry streaming DSPs that URL detection must also recognise, mirrored
 * here so the detector does not import the whole DSP registry (logo markup
 * included) into client bundles. tests/lib/dsp/url-only-hex.test.ts fails if
 * any row drifts from its DSP_REGISTRY entry.
 */
export const DETECTION_ONLY_DSPS: readonly UrlOnlyDsp[] = [
  {
    key: 'pandora',
    name: 'Pandora',
    hex: '224099',
    domains: ['pandora.com', 'www.pandora.com'],
  },
  {
    key: 'napster',
    name: 'Napster',
    hex: '2259FF',
    domains: ['web.napster.com', 'napster.com', 'us.napster.com'],
  },
  {
    key: 'audiomack',
    name: 'Audiomack',
    hex: 'FFA200',
    domains: ['audiomack.com', 'www.audiomack.com'],
  },
  {
    key: 'qobuz',
    name: 'Qobuz',
    hex: '0070EF',
    domains: ['qobuz.com', 'www.qobuz.com', 'open.qobuz.com', 'play.qobuz.com'],
  },
  {
    key: 'anghami',
    name: 'Anghami',
    hex: 'F300F9',
    domains: ['anghami.com', 'play.anghami.com'],
  },
  {
    key: 'boomplay',
    name: 'Boomplay',
    hex: '0052FF',
    domains: ['boomplay.com', 'www.boomplay.com'],
  },
  {
    key: 'iheartradio',
    name: 'iHeartRadio',
    hex: 'C6002B',
    domains: ['iheart.com', 'www.iheart.com'],
  },
  {
    key: 'awa',
    name: 'AWA',
    hex: 'FC5B11',
    domains: ['awa.fm', 'www.awa.fm'],
  },
  {
    key: 'audius',
    name: 'Audius',
    hex: 'CC0FE0',
    domains: ['audius.co', 'www.audius.co'],
  },
  {
    key: 'flo',
    name: 'FLO',
    hex: '00C3C1',
    domains: ['music-flo.com', 'www.music-flo.com'],
  },
  {
    key: 'gaana',
    name: 'Gaana',
    hex: 'E72C30',
    domains: ['gaana.com', 'www.gaana.com'],
  },
  {
    key: 'jio_saavn',
    name: 'JioSaavn',
    hex: '2BC5B4',
    domains: ['jiosaavn.com', 'www.jiosaavn.com', 'saavn.com'],
  },
  {
    key: 'joox',
    name: 'JOOX',
    hex: '00D96F',
    domains: ['joox.com', 'www.joox.com'],
  },
  {
    key: 'kkbox',
    name: 'KKBOX',
    hex: '09CEF6',
    domains: ['kkbox.com', 'www.kkbox.com'],
  },
  {
    key: 'trebel',
    name: 'Trebel',
    hex: '8B5CF6',
    domains: ['trebel.io', 'www.trebel.io'],
  },
  {
    key: 'yandex',
    name: 'Yandex Music',
    hex: 'FFCC00',
    domains: ['music.yandex.ru', 'music.yandex.com'],
  },
];

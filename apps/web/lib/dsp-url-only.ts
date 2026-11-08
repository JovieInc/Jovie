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
  /** Brand glyph key. ProviderIcon draws it; the registry keeps a monogram
   * because inlining the path would add ~4 KB gz to every registry client. */
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
 * Registry streaming DSPs named in the AWAL / Orchard lists that URL detection must also recognise, mirrored
 * here so the detector does not import the whole DSP registry (logo markup
 * included) into client bundles. tests/lib/dsp/url-only-hex.test.ts fails if
 * any row drifts from its DSP_REGISTRY entry.
 */
export const DETECTION_ONLY_DSPS: readonly UrlOnlyDsp[] = [
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
    key: 'kkbox',
    name: 'KKBOX',
    hex: '09CEF6',
    domains: ['kkbox.com', 'www.kkbox.com'],
  },
];

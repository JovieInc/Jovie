/**
 * Signal registry for the buyer pre-screen (./buyer-signals). Each entry is a
 * public footprint on an artist's link page and the weight it earns. Weights
 * are deliberately explicit so tests pin them and a change shows in review.
 */

export type BuyerSignalCategory = 'replaced_tool' | 'budget' | 'activity';

/** Every weight the scorer uses, in one table so tests pin them. */
export const BUYER_SIGNAL_WEIGHTS = {
  // Paid-plan tools Jovie replaces (usage observed; paid plan likely).
  featurefm: 25,
  linkfire: 25,
  laylo: 25,
  community: 25,
  toneden: 20,
  show_co: 20,
  found_ee: 20,
  smarturl: 15,
  mailchimp: 15,
  kit: 15,
  hypeddit: 10,
  beehiiv: 10,
  link_in_bio_branding_removed: 10,
  // Budget: money already moving through the artist's business.
  touring: 15,
  paid_ads_pixel: 15,
  label_backing: 15,
  shopify_store: 15,
  merch_store: 10,
  bandcamp_direct: 10,
  patreon: 10,
  team_contact: 10,
  brand_deals: 5,
  distrokid_hyperfollow: 5,
  // Activity: a live career, not spend on its own.
  release_cadence: 10,
  multi_dsp: 5,
  free_smart_link: 3,
} as const;

export type WeightId = keyof typeof BUYER_SIGNAL_WEIGHTS;

export interface HostRule {
  readonly id: WeightId;
  readonly category: BuyerSignalCategory;
  readonly label: string;
  readonly hosts: readonly string[];
  readonly path?: RegExp;
  /** Counts toward the release-cadence signal (one link per release). */
  readonly releaseLink?: boolean;
}

export const HOST_RULES: readonly HostRule[] = [
  {
    id: 'featurefm',
    category: 'replaced_tool',
    label: 'Feature.fm smart links',
    hosts: ['ffm.to', 'ffm.bio', 'feature.fm'],
    releaseLink: true,
  },
  {
    id: 'linkfire',
    category: 'replaced_tool',
    label: 'Linkfire smart links',
    hosts: ['lnk.to', 'linkfire.com'],
    releaseLink: true,
  },
  {
    id: 'laylo',
    category: 'replaced_tool',
    label: 'Laylo fan drops/CRM',
    hosts: ['laylo.com'],
  },
  {
    id: 'community',
    category: 'replaced_tool',
    label: 'Community SMS list',
    hosts: ['community.com', 'join.community'],
  },
  {
    id: 'toneden',
    category: 'replaced_tool',
    label: 'ToneDen smart links',
    hosts: ['toneden.io'],
    releaseLink: true,
  },
  {
    id: 'show_co',
    category: 'replaced_tool',
    label: 'Show.co pre-save campaigns',
    hosts: ['show.co'],
    releaseLink: true,
  },
  {
    id: 'found_ee',
    category: 'replaced_tool',
    label: 'Found.ee smart links',
    hosts: ['found.ee'],
    releaseLink: true,
  },
  {
    id: 'smarturl',
    category: 'replaced_tool',
    label: 'SmartURL links',
    hosts: ['smarturl.it'],
    releaseLink: true,
  },
  {
    id: 'mailchimp',
    category: 'replaced_tool',
    label: 'Mailchimp email list',
    hosts: ['eepurl.com', 'list-manage.com', 'mailchi.mp'],
  },
  {
    id: 'kit',
    category: 'replaced_tool',
    label: 'Kit (ConvertKit) email list',
    hosts: ['kit.com', 'convertkit.com', 'ck.page'],
  },
  {
    id: 'hypeddit',
    category: 'replaced_tool',
    label: 'Hypeddit download/pre-save gates',
    hosts: ['hypeddit.com'],
    releaseLink: true,
  },
  {
    id: 'beehiiv',
    category: 'replaced_tool',
    label: 'beehiiv newsletter',
    hosts: ['beehiiv.com'],
  },
  {
    id: 'touring',
    category: 'budget',
    label: 'sells tickets (touring)',
    hosts: [
      'bandsintown.com',
      'songkick.com',
      'seated.com',
      'dice.fm',
      'ticketmaster.com',
      'axs.com',
      'eventbrite.com',
      'seetickets.us',
      'seetickets.com',
      'ra.co',
      'tixr.com',
      'shotgun.live',
      'livenation.com',
      'livenation.co.uk',
      'ticketweb.com',
      'eventim.us',
      'eventim.de',
      'prekindle.com',
      'gigantic.com',
      'alttickets.com',
      'soundrink.com',
      'residentadvisor.net',
    ],
  },
  {
    id: 'shopify_store',
    category: 'budget',
    label: 'runs a Shopify store',
    hosts: ['myshopify.com'],
  },
  {
    id: 'merch_store',
    category: 'budget',
    label: 'runs a merch store',
    hosts: [
      'bigcartel.com',
      'fourthwall.com',
      'merchtable.com',
      'levelmerch.com',
      'kingsroadmerch.com',
    ],
  },
  {
    id: 'bandcamp_direct',
    category: 'budget',
    label: 'sells direct on Bandcamp',
    hosts: ['bandcamp.com'],
  },
  {
    id: 'patreon',
    category: 'budget',
    label: 'paid fan membership (Patreon)',
    hosts: ['patreon.com'],
  },
  {
    id: 'distrokid_hyperfollow',
    category: 'budget',
    label: 'pays for DistroKid distribution',
    hosts: ['distrokid.com'],
    path: /hyperfollow/i,
    releaseLink: true,
  },
  {
    id: 'free_smart_link',
    category: 'activity',
    label: 'free smart link (low switch cost)',
    hosts: ['songwhip.com', 'odesli.co', 'song.link', 'album.link'],
    releaseLink: true,
  },
];

/**
 * Streaming services by canonical provider id. Subdomains match their root
 * (open./artists.spotify.com, on.soundcloud.com, m./music.youtube.com), so a
 * page counts each service once. Short links resolve to their provider.
 */
export const DSP_PROVIDERS: Readonly<Record<string, readonly string[]>> = {
  spotify: ['spotify.com', 'spoti.fi', 'spotify.link'],
  apple_music: ['music.apple.com', 'itunes.apple.com'],
  soundcloud: ['soundcloud.com', 'snd.sc'],
  youtube: ['youtube.com', 'youtu.be'],
  bandcamp: ['bandcamp.com'],
  tidal: ['tidal.com'],
  deezer: ['deezer.com', 'deezer.page.link'],
  amazon_music: ['music.amazon.com'],
  beatport: ['beatport.com'],
  audiomack: ['audiomack.com'],
};
export const JOVIE_HOSTS = ['jov.ie', 'jovie.com'];

/** Streaming services named in visible text (link titles, snippets). */
export const DSP_TEXT_PATTERN =
  /\b(spotify|apple music|soundcloud|bandcamp|beatport|tidal|deezer|youtube|audiomack|amazon music)\b/i;

/** Budget evidence read from visible words, for pages seen only as text. */
export const TEXT_RULES: readonly {
  id: WeightId;
  label: string;
  pattern: RegExp;
}[] = [
  {
    id: 'touring',
    label: 'sells tickets (touring)',
    pattern: /\b(tour dates|tickets|on tour|tour)\b/i,
  },
  { id: 'merch_store', label: 'sells merch', pattern: /\bmerch(andise)?\b/i },
  {
    id: 'team_contact',
    label: 'has a team (booking/management contact)',
    pattern:
      /\b(booking|bookings|management|mgmt|represented by|agent)\s*[:@-]|\b(booking|mgmt|management)@/i,
  },
  {
    id: 'label_backing',
    label: 'label-backed release',
    pattern:
      /\b(signed to|out now on|released on|via)\s+[\w&.' -]{2,40}\b(records|recordings|music group)\b/i,
  },
  {
    id: 'brand_deals',
    label: 'open to brand deals',
    pattern:
      /\b(brand (deals|partnerships|inquiries|enquiries)|sponsorships?)\b/i,
  },
];

/**
 * Music-service businesses (PR firms, promo services, artist networks) that
 * link many artists' releases and so look like heavy tool users.
 */
export const SERVICE_BUSINESS_PATTERN =
  /\b(music pr|pr campaigns|pr (&|and) marketing|marketing agency|promotion services|for (indie )?artists|artist (network|collective))\b/i;

/** Words that mark a page as a performing artist's own. */
export const PERFORMER_PATTERN =
  /\b(dj|producer|singer|songwriter|rapper|band|duo)\b/i;

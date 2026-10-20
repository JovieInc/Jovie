import { z } from 'zod';
import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  artistProfileContractSchema,
  unknownArtistProfileContract,
} from './artist-profile-contract';

/** Research destinations are not connector accounts or advertised integrations. */
export const DSP_PROFILE_DESTINATION_IDS = [
  'amazon_music',
  'apple_music',
  'deezer',
  'soundcloud',
  'spotify',
  'tidal',
  'youtube',
] as const;
export type DspProfileDestinationId =
  (typeof DSP_PROFILE_DESTINATION_IDS)[number];

const text = z.string().trim().min(1);
const url = z.url({ protocol: /^https$/ });
const apiField = z.strictObject({
  read: z.enum(['documented', 'partner_only', 'unsupported', 'unknown']),
  write: z.enum(['documented', 'partner_only', 'unsupported', 'unknown']),
  detail: text,
});
const authorization = z.strictObject({
  mechanism: z.enum([
    'oauth_authorization_code',
    'oauth_client_credentials',
    'signed_jwt',
    'none',
    'unknown',
    'unsupported',
  ]),
  /** Empty means no OAuth scope is claimed; details explain non-OAuth/unknown auth. */
  scopes: z.array(text.regex(/^\S+$/).refine(value => !value.includes('*'))),
  detail: text,
  evidenceUrl: url,
});

export const dspProfileEvidenceSchema = z.strictObject({
  id: z.enum(DSP_PROFILE_DESTINATION_IDS),
  label: text,
  legacyBioProviderId: text,
  connectorProviderId: z.enum(['spotify', 'youtube']).nullable(),
  artistPortalUrl: url,
  /** No destination has a verified profile write adapter today. */
  availability: z.literal('planned'),
  blockedReason: text,
  transport: z.strictObject({
    /** Existing submission code path; this declares no permission or availability. */
    legacyBio: z.enum(['api', 'email']),
    read: z.enum(['official_api', 'partner_api', 'unknown']),
    write: z.enum(['official_api', 'partner_api', 'unknown']),
  }),
  authorization: z.strictObject({ read: authorization, write: authorization }),
  termsApi: z.strictObject({
    status: z.enum(['documented', 'partner_only', 'unknown']),
    apiUrl: url,
    termsUrl: url,
    detail: text,
  }),
  quota: z.strictObject({
    status: z.enum(['documented', 'unknown']),
    detail: text,
    evidenceUrl: url,
  }),
  evidence: z.strictObject({
    reviewedOn: z.iso.date(),
    urls: z.array(url).min(1),
  }),
  /** Provider documentation only; documented does not mean operationally supported. */
  apiFields: z.strictObject({
    bio: apiField,
    bio_link: apiField,
    image: apiField,
    website: apiField,
  }),
});

type DestinationEvidence = z.infer<typeof dspProfileEvidenceSchema>;
export type DspProfileDestination = DestinationEvidence & {
  readonly artistProfile: ArtistProfileContract;
};

/** Derive fail-closed readiness; documentation never grants runtime permission. */
export function definePlannedDspProfileDestination(
  input: DestinationEvidence
): DspProfileDestination {
  const destination = dspProfileEvidenceSchema.parse(input);
  const profile = unknownArtistProfileContract(destination.blockedReason);
  for (const name of ARTIST_PROFILE_FIELDS) {
    const documented = destination.apiFields[name];
    const field = profile.fields[name];
    for (const mode of ['read', 'write'] as const) {
      if (documented[mode] === 'unsupported') {
        field[mode] = 'unsupported';
        field.authorization[mode] = {
          status: 'unsupported',
          reason: documented.detail,
        };
      }
    }
    field.evidence = {
      status: 'documented',
      requirements: ['documentation'],
      refs: destination.evidence.urls,
    };
  }
  return {
    ...destination,
    artistProfile: artistProfileContractSchema.parse(profile),
  };
}

const reviewedOn = '2026-10-16';
const noAdapter =
  'No verified Jovie profile adapter, terms approval, exact-value approval, audit, or rollback evidence. Legacy email delivery is unverified and disabled.';
const noField = {
  read: 'unsupported',
  write: 'unsupported',
  detail: 'No corresponding artist-profile field in the reviewed API.',
} as const;
const unknownField = {
  read: 'unknown',
  write: 'unknown',
  detail:
    'Artist-profile field access is not verified in current documentation.',
} as const;
const noWrite = (evidenceUrl: string) => ({
  mechanism: 'unsupported' as const,
  scopes: [],
  detail:
    'No documented public artist-profile write authorization. Portal access or an email address is not API permission.',
  evidenceUrl,
});
const amazonApi =
  'https://developer.amazon.com/docs/music/API_web_overview.html';
const amazonArtists =
  'https://d332qao9bxuj3h.cloudfront.net/docs/music/API_web_artist_v2.html';
const appleApi =
  'https://itunespartner.apple.com/music/assets/music-artist-api.pdf';
const deezerApi = 'https://developers.deezer.com/api/artist';
const soundcloudApi =
  'https://developers.soundcloud.com/docs/api/explorer/api.json';
const soundcloudAuth = 'https://developers.soundcloud.com/docs/api/guide';
const spotifyApi =
  'https://developer.spotify.com/documentation/web-api/reference/get-an-artist';
const tidalApi = 'https://tidal-music.github.io/tidal-api-reference/';
const youtubeApi = 'https://developers.google.com/youtube/v3/docs/channels';
const youtubeUpdate =
  'https://developers.google.com/youtube/v3/docs/channels/update';

/** Sorted, client-safe research catalog. Never union these ids into connector_provider. */
export const DSP_PROFILE_CATALOG = {
  amazon_music: definePlannedDspProfileDestination({
    id: 'amazon_music',
    label: 'Amazon Music',
    legacyBioProviderId: 'amazon_music',
    connectorProviderId: null,
    artistPortalUrl: 'https://artists.amazonmusic.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: { legacyBio: 'email', read: 'partner_api', write: 'unknown' },
    authorization: {
      read: {
        mechanism: 'oauth_authorization_code',
        scopes: ['music::catalog'],
        detail:
          'Closed beta: LWA bearer token plus x-api-key containing an Amazon-enabled LWA Security Profile ID; artist catalog scope music::catalog.',
        evidenceUrl: amazonArtists,
      },
      write: noWrite(amazonApi),
    },
    termsApi: {
      status: 'partner_only',
      apiUrl: amazonApi,
      termsUrl: 'https://developer.amazon.com/support/legal/da',
      detail:
        'Music Web API is closed beta for approved developers; no Jovie partner grant or profile write terms approval is verified.',
    },
    quota: {
      status: 'unknown',
      detail:
        'TPS ceiling is not published here. API returns 429; use exponential backoff and consult the Amazon contact for limits.',
      evidenceUrl: amazonApi,
    },
    evidence: { reviewedOn, urls: [amazonApi, amazonArtists] },
    apiFields: {
      bio: noField,
      bio_link: noField,
      image: {
        read: 'partner_only',
        write: 'unsupported',
        detail:
          'GET /v2/artists exposes images; reviewed artist endpoints contain no profile update operation.',
      },
      website: noField,
    },
  }),
  apple_music: definePlannedDspProfileDestination({
    id: 'apple_music',
    label: 'Apple Music',
    legacyBioProviderId: 'apple_music',
    connectorProviderId: null,
    artistPortalUrl: 'https://artists.apple.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: {
      legacyBio: 'email',
      read: 'partner_api',
      write: 'partner_api',
    },
    authorization: {
      read: {
        mechanism: 'signed_jwt',
        scopes: [],
        detail:
          'Music Artist API: ES256 bearer JWT signed with an iTunes Connect API key, key ID, issuer ID and aud=musicconnect-v1; Admin or Technical access. Not MusicKit subscriber OAuth.',
        evidenceUrl: appleApi,
      },
      write: {
        mechanism: 'signed_jwt',
        scopes: [],
        detail:
          'Same iTunes Connect Music Artist API key/JWT authorization; provider access and Jovie credentials are unverified.',
        evidenceUrl: appleApi,
      },
    },
    termsApi: {
      status: 'partner_only',
      apiUrl: appleApi,
      termsUrl: 'https://developer.apple.com/support/terms/',
      detail:
        'Music Artist API manages contributor metadata/assets for providers. Applicable provider agreement and Jovie approval remain unverified.',
    },
    quota: {
      status: 'documented',
      detail:
        'Music Artist API generally allows 3600 requests per rolling hour per authentication method/provider; actual X-Rate-Limit values vary. Asset storage has separate limits; honor Retry-After on 429.',
      evidenceUrl: appleApi,
    },
    evidence: { reviewedOn, urls: [appleApi] },
    apiFields: {
      bio: noField,
      bio_link: noField,
      image: {
        read: 'partner_only',
        write: 'partner_only',
        detail:
          'MusicContributor heroImageURL and artist image assets; partner asset workflow is not implemented in Jovie.',
      },
      website: noField,
    },
  }),
  deezer: definePlannedDspProfileDestination({
    id: 'deezer',
    label: 'Deezer',
    legacyBioProviderId: 'deezer',
    connectorProviderId: null,
    artistPortalUrl: 'https://artists.deezer.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: { legacyBio: 'email', read: 'official_api', write: 'unknown' },
    authorization: {
      read: {
        mechanism: 'none',
        scopes: [],
        detail:
          'Existing enrichment uses unauthenticated GET /artist/{id}; developer reference was unavailable at review, so current authorization/terms eligibility is unverified.',
        evidenceUrl: deezerApi,
      },
      write: {
        mechanism: 'unknown',
        scopes: [],
        detail:
          'No verified artist-profile write authorization or support-email submission permission.',
        evidenceUrl: deezerApi,
      },
    },
    termsApi: {
      status: 'unknown',
      apiUrl: deezerApi,
      termsUrl: 'https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf',
      detail:
        'Published developer terms found; current API reference/access and commercial profile-write approval could not be verified.',
    },
    quota: {
      status: 'unknown',
      detail:
        'No current official artist-profile request ceiling verified. Do not treat enrichment retry settings as a provider quota.',
      evidenceUrl: deezerApi,
    },
    evidence: {
      reviewedOn,
      urls: [deezerApi, 'https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf'],
    },
    apiFields: {
      bio: unknownField,
      bio_link: unknownField,
      image: {
        read: 'unknown',
        write: 'unknown',
        detail:
          'Existing enrichment consumes artist pictures; current API documentation unavailable, so profile capability remains unverified.',
      },
      website: unknownField,
    },
  }),
  soundcloud: definePlannedDspProfileDestination({
    id: 'soundcloud',
    label: 'SoundCloud',
    legacyBioProviderId: 'soundcloud',
    connectorProviderId: null,
    artistPortalUrl: 'https://soundcloud.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: {
      legacyBio: 'api',
      read: 'official_api',
      write: 'official_api',
    },
    authorization: {
      read: {
        mechanism: 'oauth_authorization_code',
        scopes: [],
        detail:
          'GET /me: OAuth 2.1 authorization code with S256 PKCE, registered confidential client and user consent; Authorization: OAuth ACCESS_TOKEN. Guide specifies no named profile scopes.',
        evidenceUrl: soundcloudAuth,
      },
      write: noWrite(soundcloudApi),
    },
    termsApi: {
      status: 'documented',
      apiUrl: soundcloudApi,
      termsUrl: 'https://developers.soundcloud.com/docs/api/terms-of-use',
      detail:
        'Current OpenAPI documents profile reads, not PUT /me. Published API terms are not Jovie profile-write approval.',
    },
    quota: {
      status: 'unknown',
      detail:
        'Profile request ceiling unknown. Client-credentials token issuance: 50/12h per app and 30/h per IP; playback limits are not profile quotas.',
      evidenceUrl: 'https://developers.soundcloud.com/docs/api/rate-limits',
    },
    evidence: { reviewedOn, urls: [soundcloudApi, soundcloudAuth] },
    apiFields: {
      bio: {
        read: 'documented',
        write: 'unsupported',
        detail:
          'User.description is readable. Current OpenAPI exposes GET /me but no PUT /me.',
      },
      bio_link: noField,
      image: {
        read: 'documented',
        write: 'unsupported',
        detail:
          'User.avatar_url is readable; no documented profile image mutation.',
      },
      website: {
        read: 'documented',
        write: 'unsupported',
        detail:
          'User.website is readable; no documented profile website mutation.',
      },
    },
  }),
  spotify: definePlannedDspProfileDestination({
    id: 'spotify',
    label: 'Spotify',
    legacyBioProviderId: 'spotify',
    connectorProviderId: 'spotify',
    artistPortalUrl: 'https://artists.spotify.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: { legacyBio: 'email', read: 'official_api', write: 'unknown' },
    authorization: {
      read: {
        mechanism: 'oauth_client_credentials',
        scopes: [],
        detail:
          'GET /v1/artists/{id}: application bearer token via client_credentials; no user scope. Playlist OAuth does not authorize artist profile writes.',
        evidenceUrl:
          'https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow',
      },
      write: noWrite(spotifyApi),
    },
    termsApi: {
      status: 'documented',
      apiUrl: spotifyApi,
      termsUrl: 'https://developer.spotify.com/terms',
      detail:
        'Official artist read API; no public artist-profile mutation. Spotify for Artists portal editing is separate from Web API access.',
    },
    quota: {
      status: 'unknown',
      detail:
        'App-wide rolling 30-second window; numerical ceiling depends on quota mode and is not published. Respect 429 Retry-After.',
      evidenceUrl:
        'https://developer.spotify.com/documentation/web-api/concepts/rate-limits',
    },
    evidence: {
      reviewedOn,
      urls: [
        spotifyApi,
        'https://support.spotify.com/artists/article/adding-a-bio-to-your-spotify-artist-profile/',
      ],
    },
    apiFields: {
      bio: noField,
      bio_link: noField,
      image: {
        read: 'documented',
        write: 'unsupported',
        detail:
          'Artist.images is readable; Web API has no artist image write endpoint.',
      },
      website: noField,
    },
  }),
  tidal: definePlannedDspProfileDestination({
    id: 'tidal',
    label: 'TIDAL',
    legacyBioProviderId: 'tidal',
    connectorProviderId: null,
    artistPortalUrl: 'https://artists.tidal.com',
    availability: 'planned',
    blockedReason: noAdapter,
    transport: { legacyBio: 'email', read: 'official_api', write: 'unknown' },
    authorization: {
      read: {
        mechanism: 'oauth_client_credentials',
        scopes: [],
        detail:
          'Public catalog: app client_credentials bearer token from https://auth.tidal.com/v1/oauth2/token; no user scopes claimed. User authorization is a separate PKCE flow.',
        evidenceUrl: tidalApi,
      },
      write: {
        mechanism: 'unknown',
        scopes: [],
        detail:
          'Artist-profile write authorization is unverified; current reference did not render during review. Artist Home access does not establish API permission.',
        evidenceUrl: tidalApi,
      },
    },
    termsApi: {
      status: 'documented',
      apiUrl: tidalApi,
      termsUrl:
        'https://developer.tidal.com/documentation/guidelines/guidelines-developer-terms',
      detail:
        'Developer terms and catalog API reference found; current reference did not render. Field access and Jovie profile-write approval remain unverified.',
    },
    quota: {
      status: 'unknown',
      detail:
        'No numerical artist-profile API quota verified in the reviewed reference.',
      evidenceUrl: tidalApi,
    },
    evidence: {
      reviewedOn,
      urls: [tidalApi, 'https://tidal.com/artist-terms'],
    },
    apiFields: {
      bio: unknownField,
      bio_link: unknownField,
      image: unknownField,
      website: unknownField,
    },
  }),
  youtube: definePlannedDspProfileDestination({
    id: 'youtube',
    label: 'YouTube',
    legacyBioProviderId: 'youtube_music',
    connectorProviderId: 'youtube',
    artistPortalUrl: 'https://artists.youtube.com',
    availability: 'planned',
    blockedReason: `${noAdapter} Core YouTube HTML ingestion is prohibited by social-html-policy.ts in both isolated-provider flag states; only official APIs or an isolated provider may establish future reads.`,
    transport: {
      legacyBio: 'api',
      read: 'official_api',
      write: 'official_api',
    },
    authorization: {
      read: {
        mechanism: 'oauth_authorization_code',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        detail:
          'Connected channel via channels.list(mine=true), selected by the existing YouTube account; user OAuth consent.',
        evidenceUrl:
          'https://developers.google.com/youtube/v3/docs/channels/list',
      },
      write: {
        mechanism: 'oauth_authorization_code',
        scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
        detail:
          'channels.update accepts this exact scope for the authorized channel. No channel.update scope exists; thumbnail permission does not prove profile-write readiness.',
        evidenceUrl: youtubeUpdate,
      },
    },
    termsApi: {
      status: 'documented',
      apiUrl: youtubeUpdate,
      termsUrl:
        'https://developers.google.com/youtube/terms/api-services-terms-of-service',
      detail:
        'Data API channel metadata, not a separate YouTube Music artist-write API. Jovie profile adapter/terms approval are unverified.',
    },
    quota: {
      status: 'documented',
      detail:
        'channels.list costs 1 unit; channels.update costs 50 units. Default project pool is 10000 units/day for these endpoints; actual project allocation is unverified.',
      evidenceUrl: 'https://developers.google.com/youtube/v3/getting-started',
    },
    evidence: {
      reviewedOn,
      urls: [
        youtubeApi,
        youtubeUpdate,
        'https://developers.google.com/youtube/v3/docs/channels/list',
        'https://github.com/JovieInc/Jovie/blob/main/apps/web/lib/ingestion/social-html-policy.ts',
        'https://github.com/JovieInc/Jovie/blob/main/docs/network-support-matrix.md',
      ],
    },
    apiFields: {
      bio: {
        read: 'documented',
        write: 'documented',
        detail:
          'Read snippet.description; update brandingSettings.channel.description with channels.update. No Jovie implementation or readback/rollback proof.',
      },
      bio_link: noField,
      image: {
        read: 'documented',
        write: 'unsupported',
        detail:
          'snippet.thumbnails is readable; video thumbnail APIs do not update the channel avatar.',
      },
      website: noField,
    },
  }),
} satisfies Record<DspProfileDestinationId, DspProfileDestination>;

/** Public Chartmetric endpoint index. Names and admission only; no schemas or scores. */
const CHARTMETRIC_INDEX = `POST /api/token access-blocked;/api/search;/api/search/social;/api/genres;/api/genres/{id};/api/genre;/api/cities;/api/city/{id}/{domain}/top-artists;/api/city/{id}/{domain}/top-tracks;/api/album/{id}/{type}/charts;/api/album/{type}/{id}/get-ids;/api/album/{id};/api/album/{id}/tracks;/api/album/{id}/{platform}/{stats};/api/album/{id}/{platform}/{status}/playlists;/api/artist/anr/by/playlists;/api/artist/{id}/riaa;/api/artist/anr/by/social-index;/api/artist/{id}/cpp;/api/artist/{id}/{type}/charts;/api/artist/{type}/{id}/get-ids;/api/artist/{type}/list;/api/artist/list/filter;/api/artist/{id};/api/artist/{id}/relatedartists;/api/artist/{id}/where-people-listen;/api/artist/{id}/{platform}/{status}/playlists;/api/artist/{id}/albums;/api/artist/{id}/tracks;/api/artist/{id}/urls;/api/artist/{id}/stat/{source};/api/artist/{id}/instagram-audience-stats;/api/artist/{id}/instagram-audience-stats/dates;/api/artist/{id}/social-audience-stats;/api/artist/{id}/youtube-audience-stats;/api/artist/{id}/tiktok-top-videos;/api/artist/{id}/tiktok-top-influencers;/api/artist/{id}/tiktok-influencer-stats;/api/artist/{id}/tiktok-audience-stats;/api/artist/{id}/top-tracks/{source};/api/artist/{id}/artist-rank;/api/artist/{id}/past-artist-rank;/api/artist/{id}/neighboring-artists;/api/artist/{id}/market-coverage-views/youtube;/api/artist/{id}/tvmaze;/api/artist/{id}/career;/api/artist/{id}/milestones;/api/artist/{id}/noteworthy-insights;/api/artist/{id}/{status}/events;/api/artist/{id}/news;/api/artist/{id}/venues;/api/artist/{id}/similar-artists/by-configurations;/api/artist/{id}/cmStats;/api/brand/list;/api/brand/list/by/interest;/api/brand/v2/list;/api/brand/v2/list/by/category;/api/brand/v2/list/by/subcategory;/api/brand/v2/{brandId}/audience;/api/brand/v2/{brandId};/api/brand/{brandId};GET /api/charts/{byType}/{id}/{chartType}/cm-score vendor-only-opaque-metric;/api/charts/spotify;/api/charts/spotify/artists;/api/charts/spotify/freshfind;/api/charts/deezer;/api/charts/qq;/api/charts/amazon/tracks;/api/charts/amazon/albums;/api/charts/applemusic/tracks;/api/charts/applemusic/albums;/api/charts/applemusic/videos;/api/charts/itunes/tracks;/api/charts/itunes/albums;/api/charts/itunes/videos;/api/charts/shazam;/api/charts/shazam/{country_code}/cities;/api/charts/soundcloud;/api/charts/beatport;/api/charts/tiktok/tracks;/api/charts/tiktok/videos;/api/charts/tiktok/users;/api/charts/tiktok/sounds;/api/charts/tiktok/tracks/{chart_type};/api/charts/youtube/shorts/{chartType};/api/charts/youtube/tracks;/api/charts/youtube/videos;/api/charts/youtube/trends;/api/charts/youtube/artists;/api/charts/airplay/tracks;/api/charts/airplay/artists;/api/charts/twitch/users;/api/charts/melon/track/{chartType};/api/charts/hanteo/{entityType}/{chartType};/api/charts/circle/{entityType}/{chartType};/api/charts/line_music/{entityType}/{chartType};/api/charts/pandora/track/{chartType};/api/charts/anghami/track/{chartType};/api/charts/soundcloud/track/{chartType};/api/charts/{platform}/countries;/api/charts/{streamingType}/dates;/api/charts/genres/{platform};/api/country/{code2}/artist-rankings/{area}/{type}/{subArea};/api/curator/deezer/lists;/api/curator/itunes/lists;/api/curator/applemusic/lists;/api/curator/spotify/lists;/api/curator/youtube/lists;/api/curator/amazon/lists;/api/curator/{platform}/lists;/api/curator/{platform}/{id};/api/curator/{platform}/{id}/playlists;/api/curator/{platform}/{id}/urls;/api/curator/{platform}/{id}/stat/{source};/api/playlist/amazon/lists;/api/playlist/itunes/lists;/api/playlist/deezer/lists;/api/playlist/spotify/lists;/api/playlist/youtube/lists;/api/playlist/soundcloud/lists;/api/playlist/{platform}/lists;/api/playlist/{platform}/{id};/api/playlist/{platform}/{id}/stats;/api/playlist/{platform}/{id}/snapshot;/api/playlist/{platform}/{id}/similarplaylists;/api/playlist/{platform}/{id}/{span}/tracks;/api/playlist/by/{type}/{id}/evolution;/api/playlist/{platform}/{id}/journey-progression/{type};/api/playlist/{platform}/{id}/updated;/api/radio/{type}/{id}/airplay-totals;/api/radio/{type}/{id}/airplay-totals/{entity};/api/radio/{type}/{id}/airplays;/api/radio/{type}/{id}/broadcast-markets;/api/radio/station-list;POST /api/track/playlist-stream-estimates access-blocked;/api/track/{id}/playlist-stream-estimates;/api/track/{id}/video-trends;/api/track/{id}/{type}/charts;/api/track/{type}/{id}/get-ids;/api/track/{id};/api/track/{id}/{platform}/playlists/snapshot;/api/track/{id}/{platform}/stats/{mode};/api/track/youtube/{id}/topShorts;/api/track/{id}/tiktok-top-influencers;/api/track/{id}/tiktok-influencer-stats;/api/track/{id}/tiktok-top-sounds;/api/track/{id}/topVideos;/api/track/{id}/relatedTracks;/api/track/{id}/{platform}/{status}/playlists;/api/track/{id}/milestones;/api/track/list/filter;/api/festival/list;/api/event/venue/{id};/api/SNS/deepSocial/cm_artist/{id}/instagram;/api/venue`;

export const CHARTMETRIC_ENDPOINT_COUNT = 155;

export type ChartmetricAdmission =
  | 'access-blocked'
  | 'vendor-only-opaque-metric';

function chartmetricRow(
  token: string
): readonly [string, string, ChartmetricAdmission] {
  const parts = token.split(' ');
  if (parts.length === 1) return ['GET', parts[0], 'access-blocked'];
  const [method, path, admission] = parts;
  if (
    admission !== 'access-blocked' &&
    admission !== 'vendor-only-opaque-metric'
  ) {
    throw new Error(`unknown Chartmetric admission: ${admission}`);
  }
  return [method, path, admission];
}

export const CHARTMETRIC_ENDPOINTS: readonly (readonly [
  method: string,
  path: string,
  admission: ChartmetricAdmission,
])[] = CHARTMETRIC_INDEX.split(';').map(chartmetricRow);

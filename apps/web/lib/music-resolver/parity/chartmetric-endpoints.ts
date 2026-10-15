import type { DocumentedContract } from './types';

/** Documentation only: no data access, redistribution right or runtime parity. */
export const CHARTMETRIC_REFERENCE = {
  url: 'https://apidocs.chartmetric.com/reference/openapi.json',
  version: '1.0.1575',
  retrievedOn: '2026-10-15',
  sha256: 'fe6e73a64c6c8d6075ae5993c818499cde28a32ffe7fc10d9c0f724cd716c379',
} as const;

const FAMILIES = {
  'audience-geography': ['JOV-7828', 'JOV-8474'],
  brands: ['JOV-7828', 'JOV-8478'],
  'catalog-performance': ['JOV-7827', 'JOV-7827'],
  'curator-discovery': ['JOV-7828', 'JOV-8477'],
  events: ['JOV-7828', 'JOV-8479'],
  'search-discovery': ['JOV-7828', 'JOV-8473'],
  'social-audience': ['JOV-7828', 'JOV-8475'],
  'social-relationships': ['JOV-7828', 'JOV-8476'],
} as const;

// Sorted method/path | implementation family | documented query parameter names.
// Names are inventory, not implemented filters. Full schema reconciliation: JOV-8468.
const CHARTMETRIC_INDEX = `GET /api/SNS/deepSocial/cm_artist/{id}/instagram|social-relationships|
GET /api/album/{id}|catalog-performance|
GET /api/album/{id}/tracks|catalog-performance|
GET /api/album/{id}/{platform}/{stats}|catalog-performance|latest,since,until
GET /api/album/{id}/{platform}/{status}/playlists|catalog-performance|audiobook,brand,chart,deezerPartner,editorial,editorialBrand,fullyPersonalized,hundredPercent,indie,limit,majorCurator,minFollowers,musicBrand,newMusicFriday,nonMusicBrand,offset,personalityArtist,personalized,popularIndie,radio,showPositionStats,since,thisIs,until
GET /api/album/{id}/{type}/charts|catalog-performance|since,until
GET /api/album/{type}/{id}/get-ids|catalog-performance|
GET /api/artist/anr/by/playlists|search-discovery|limit,sortBy
GET /api/artist/anr/by/social-index|search-discovery|code2,latestReleaseWithin,limit,maxSpotifyFollowers,maxThirtyDayGrowth,minSpotifyFollowers,minThirtyDayGrowth,offset,recentReleaseWithin,sortBy,sortOrderDesc,subTagIds,tagIds,unsigned
GET /api/artist/list/filter|search-discovery|band,bit_f[],bp_c[],bp_f[],bp_p[],bp_s[],career_stage,career_stage_score[],career_trend,career_trend_score[],code2,cpp[],dz_fans[],eventIds[],fb_f[],fb_l[],fb_t[],firstReleaseDaysAgo,ig_f[],limit,offset,p_ls[],p_lsr[],p_ml[],p_s[],pronoun,sc_f[],score[],shortlistIds[],sortColumn,sortOrderDesc,sp_f[],sp_fl_ratio[],sp_ml[],sp_p[],sp_ratio[],subTagId,t_f[],t_mvh[],t_v[],t_wvh[],tagId,tt_f[],tt_l[],tw_f[],tw_r[],wp_v[],ytc_s[],ytc_v[],ytd_vv[],ytm_vv[]
GET /api/artist/{id}|catalog-performance|
GET /api/artist/{id}/albums|catalog-performance|isPrimary,limit,offset,sortColumn,sortOrderDesc
GET /api/artist/{id}/artist-rank|catalog-performance|code2,genre,metric
GET /api/artist/{id}/career|catalog-performance|limit,offset,since,until
GET /api/artist/{id}/cmStats|catalog-performance|
GET /api/artist/{id}/cpp|catalog-performance|latest,since,stat,until
GET /api/artist/{id}/instagram-audience-stats|social-audience|date,geoOnly
GET /api/artist/{id}/instagram-audience-stats/dates|social-audience|date,geoOnly
GET /api/artist/{id}/market-coverage-views/youtube|audience-geography|date
GET /api/artist/{id}/milestones|catalog-performance|fromDaysAgo,grouped,limit,offset,platforms[],sortColumn,sortOrderDesc,stars[]
GET /api/artist/{id}/neighboring-artists|search-discovery|limit,metric,type
GET /api/artist/{id}/news|events|limit,weight
GET /api/artist/{id}/noteworthy-insights|catalog-performance|fromDaysAgo,insightType,limit
GET /api/artist/{id}/past-artist-rank|catalog-performance|date,metric
GET /api/artist/{id}/relatedartists|search-discovery|fromDaysAgo,limit,toDaysAgo
GET /api/artist/{id}/riaa|catalog-performance|
GET /api/artist/{id}/similar-artists/by-configurations|search-discovery|audience,genre,limit,mood,musicality,offset
GET /api/artist/{id}/social-audience-stats|social-audience|audienceType,domain,limit,offset,since,statsType,until
GET /api/artist/{id}/stat/{source}|catalog-performance|city_id,code2,field,interpolated,isDomainId,latest,since,until
GET /api/artist/{id}/tiktok-audience-stats|social-audience|date,geoOnly
GET /api/artist/{id}/tiktok-influencer-stats|social-relationships|dimension,periodDays
GET /api/artist/{id}/tiktok-top-influencers|social-relationships|ageGroup[],categories[],country[],ethnicity[],gender[],isVerified,language[],lastDatePostedFrom,limit,maxAvgComments,maxAvgEngagementRate,maxAvgLikes,maxAvgSaves,maxAvgShares,maxAvgViews,maxFollowers,maxVideoCount,minAvgComments,minAvgEngagementRate,minAvgLikes,minAvgSaves,minAvgShares,minAvgViews,minFollowers,minVideoCount,offset,sortBy,sortDirection,type[]
GET /api/artist/{id}/tiktok-top-videos|social-relationships|fromDaysAgo,limit,maxComments,maxLikes,maxSaves,maxShares,maxViews,minComments,minLikes,minSaves,minShares,minViews,offset,postedWithinDaysAgo,sortOrderDesc,type,withTotal
GET /api/artist/{id}/top-tracks/{source}|catalog-performance|limit
GET /api/artist/{id}/tracks|catalog-performance|artist_type,limit,offset,version_and[],version_not[],version_only[],version_or[]
GET /api/artist/{id}/tvmaze|events|
GET /api/artist/{id}/urls|catalog-performance|
GET /api/artist/{id}/venues|events|limit,offset
GET /api/artist/{id}/where-people-listen|audience-geography|date,includeEstimates,latest,limit,offset,since,until
GET /api/artist/{id}/youtube-audience-stats|social-audience|date,geoOnly
GET /api/artist/{id}/{platform}/{status}/playlists|catalog-performance|audiobook,brand,chart,deezerPartner,editorial,editorialBrand,fullyPersonalized,hundredPercent,indie,limit,majorCurator,minFollowers,musicBrand,newMusicFriday,nonMusicBrand,offset,personalityArtist,personalized,popularIndie,radio,showPositionStats,since,sortColumn,sortOrderDesc,thisIs,until
GET /api/artist/{id}/{status}/events|events|cityId,fromDaysAgo,limit,offset,toDaysAgo,type
GET /api/artist/{id}/{type}/charts|catalog-performance|duration,since,until
GET /api/artist/{type}/list|search-discovery|city,code2,genreId,limit,max,min,offset,subGenreId,unsigned
GET /api/artist/{type}/{id}/get-ids|catalog-performance|aggregate,limit,offset
GET /api/brand/list|brands|
GET /api/brand/list/by/interest|brands|brandCount,sortColumn
GET /api/brand/v2/list|brands|
GET /api/brand/v2/list/by/category|brands|category,countries[],limit,offset,search,sortColumn,sortOrderDesc
GET /api/brand/v2/list/by/subcategory|brands|countries[],limit,offset,search,sortColumn,sortOrderDesc,subcategory
GET /api/brand/v2/{brandId}|brands|limit,offset,platform,sortColumn,sortOrderDesc
GET /api/brand/v2/{brandId}/audience|brands|platform
GET /api/brand/{brandId}|brands|limit,offset,sortColumn,sortOrderDesc
GET /api/charts/airplay/artists|catalog-performance|country_code,date,duration,latest,limit,since
GET /api/charts/airplay/tracks|catalog-performance|country_code,date,duration,latest,limit,since
GET /api/charts/amazon/albums|catalog-performance|code2,date,genre,latest,limit,offset,type
GET /api/charts/amazon/tracks|catalog-performance|code2,date,genre,latest,limit,offset,type
GET /api/charts/anghami/track/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/applemusic/albums|catalog-performance|country_code,date,genre,latest,limit,offset
GET /api/charts/applemusic/tracks|catalog-performance|city_id,country_code,date,genre,latest,offset,type
GET /api/charts/applemusic/videos|catalog-performance|country_code,date,genre,latest,offset
GET /api/charts/beatport|catalog-performance|date,genre,latest,offset
GET /api/charts/circle/{entityType}/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/deezer|catalog-performance|country_code,date,latest
GET /api/charts/genres/{platform}|catalog-performance|code2
GET /api/charts/hanteo/{entityType}/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/itunes/albums|catalog-performance|country_code,date,genre,latest,offset
GET /api/charts/itunes/tracks|catalog-performance|country_code,date,genre,latest,offset
GET /api/charts/itunes/videos|catalog-performance|country_code,date,latest,offset
GET /api/charts/line_music/{entityType}/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/melon/track/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/pandora/track/{chartType}|catalog-performance|cityId,code2,date,duration,genre,latest,limit,offset
GET /api/charts/qq|catalog-performance|date,latest
GET /api/charts/shazam|catalog-performance|city,country_code,date,genre,latest,offset
GET /api/charts/shazam/{country_code}/cities|catalog-performance|
GET /api/charts/soundcloud|catalog-performance|chart_type,country_code,date,genre,kind,latest,offset,raw
GET /api/charts/soundcloud/track/{chartType}|catalog-performance|code2,date,genre,latest,limit,offset
GET /api/charts/spotify|catalog-performance|country_code,date,interval,latest,offset,type
GET /api/charts/spotify/artists|catalog-performance|date,interval,latest,offset,type
GET /api/charts/spotify/freshfind|catalog-performance|date,latest,limit,offset
GET /api/charts/tiktok/sounds|catalog-performance|country,date,latest,limit,offset
GET /api/charts/tiktok/tracks|catalog-performance|code2,countryChart,date,interval,latest,limit,offset
GET /api/charts/tiktok/tracks/{chart_type}|catalog-performance|code2,date,interval,latest,limit,offset
GET /api/charts/tiktok/users|catalog-performance|date,interval,latest,limit,offset,type
GET /api/charts/tiktok/videos|catalog-performance|date,latest,limit,offset
GET /api/charts/twitch/users|catalog-performance|date,duration,latest,limit,since,type
GET /api/charts/youtube/artists|catalog-performance|country_code,date,latest,offset
GET /api/charts/youtube/shorts/{chartType}|catalog-performance|code2,date,latest,limit,offset
GET /api/charts/youtube/tracks|catalog-performance|country_code,date,latest,offset
GET /api/charts/youtube/trends|catalog-performance|country_code,date,latest,offset
GET /api/charts/youtube/videos|catalog-performance|country_code,date,latest,offset
GET /api/charts/{byType}/{id}/{chartType}/cm-score|catalog-performance|since,until
GET /api/charts/{platform}/countries|catalog-performance|chart_type,duration,type
GET /api/charts/{streamingType}/dates|catalog-performance|chartEntity,chartType,country,duration,fromDaysAgo,genre
GET /api/cities|audience-geography|city_id,country_code
GET /api/city/{id}/{domain}/top-artists|audience-geography|
GET /api/city/{id}/{domain}/top-tracks|audience-geography|
GET /api/country/{code2}/artist-rankings/{area}/{type}/{subArea}|audience-geography|limit,offset
GET /api/curator/amazon/lists|curator-discovery|editorial,limit,nameSearch,offset,playlistKeywordSearch,sortColumn,sortOrderDesc,userListIds[]
GET /api/curator/applemusic/lists|curator-discovery|code2,editorial,indie,limit,nameSearch,offset,playlistKeywordSearch,sortColumn,sortOrderDesc,userListIds[]
GET /api/curator/deezer/lists|curator-discovery|brand,code2,editorial,indie,limit,majorLabel,nameSearch,offset,playlistKeywordSearch,popularIndie,sortColumn,sortOrderDesc,userListIds[]
GET /api/curator/itunes/lists|curator-discovery|code2,editorial,indie,limit,nameSearch,offset,playlistKeywordSearch,sortColumn,sortOrderDesc,userListIds[]
GET /api/curator/spotify/lists|curator-discovery|audiobook,brand,editorial,indie,limit,majorLabel,nameSearch,offset,playlistKeywordSearch,popularIndie,sortColumn,sortOrderDesc,userListIds[],withSocialUrls
GET /api/curator/youtube/lists|curator-discovery|audiobook,brand,code2,editorial,indie,limit,majorLabel,nameSearch,offset,playlistKeywordSearch,popularIndie,sortColumn,sortOrderDesc,userListIds[]
GET /api/curator/{platform}/lists|curator-discovery|
GET /api/curator/{platform}/{id}|curator-discovery|
GET /api/curator/{platform}/{id}/playlists|curator-discovery|limit,offset,sortColumn,sortOrderDesc,storefront
GET /api/curator/{platform}/{id}/stat/{source}|curator-discovery|field,interpolated,latest,since,until
GET /api/curator/{platform}/{id}/urls|curator-discovery|
GET /api/event/venue/{id}|events|limit,offset
GET /api/festival/list|events|code2s[],eventSizes[],genreIds[],limit,nameSearch,offset,sortColumn,sortOrderDesc
GET /api/genre|audience-geography|isLegacy
GET /api/genres|audience-geography|isLegacy,name
GET /api/genres/{id}|audience-geography|
GET /api/playlist/amazon/lists|catalog-performance|code2,descriptionSearch,editorial,limit,offset,sortColumn,sortOrderDesc,tagIds[],topPlaylist,userListIds[]
GET /api/playlist/by/{type}/{id}/evolution|catalog-performance|since,until
GET /api/playlist/deezer/lists|catalog-performance|code2,curatorIds[],descriptionSearch,editorial,excludedCuratorListIds[],indie,limit,majorCurator,offset,sortColumn,sortOrderDesc,tagIds[],topPlaylist,userListIds[]
GET /api/playlist/itunes/lists|catalog-performance|code2,curatorIds[],descriptionSearch,editorial,excludedCuratorListIds[],indie,limit,offset,sortColumn,sortOrderDesc,tagIds[],topPlaylist,userListIds[]
GET /api/playlist/soundcloud/lists|catalog-performance|descriptionSearch,editorial,indie,limit,offset,sortColumn,sortOrderDesc,topPlaylist,userListIds[]
GET /api/playlist/spotify/lists|catalog-performance|code2,curatorIds[],descriptionSearch,editorial,excludedCuratorListIds[],indie,limit,majorCurator,newMusicFriday,offset,sortColumn,sortOrderDesc,tagIds[],topPlaylist,userListIds[]
GET /api/playlist/youtube/lists|catalog-performance|descriptionSearch,editorial,indie,limit,offset,sortColumn,sortOrderDesc,tagIds[],topPlaylist,userListIds[]
GET /api/playlist/{platform}/lists|catalog-performance|
GET /api/playlist/{platform}/{id}|catalog-performance|storefront
GET /api/playlist/{platform}/{id}/journey-progression/{type}|catalog-performance|limit,offset,sortColumn,sortOrderDesc
GET /api/playlist/{platform}/{id}/similarplaylists|search-discovery|indie,limit,offset
GET /api/playlist/{platform}/{id}/snapshot|catalog-performance|date,storefront
GET /api/playlist/{platform}/{id}/stats|catalog-performance|since,until
GET /api/playlist/{platform}/{id}/updated|catalog-performance|storefront
GET /api/playlist/{platform}/{id}/{span}/tracks|catalog-performance|limit,offset,since,storefront,until,version_and[],version_not[],version_only[],version_or[],withDetails
GET /api/radio/station-list|catalog-performance|code2
GET /api/radio/{type}/{id}/airplay-totals|catalog-performance|limit,since,station
GET /api/radio/{type}/{id}/airplay-totals/{entity}|catalog-performance|dateFormat,limit,since,station
GET /api/radio/{type}/{id}/airplays|catalog-performance|since
GET /api/radio/{type}/{id}/broadcast-markets|catalog-performance|since
GET /api/search|search-discovery|beta,limit,offset,platforms,q,triggerCitiesOnly,type
GET /api/search/social|search-discovery|type,url
GET /api/track/list/filter|search-discovery|artists[],genres[],limit,max_airplay_streams,max_album.release_date,max_amazon_playlist_count,max_deezer_playlist_count,max_itunes_playlist_count,max_rank,max_rank.rank_overall,max_release_date,max_score,max_shazam_count,max_siriusxm_streams,max_soundcloud_plays,max_spotify_ed_playlist_count,max_spotify_ed_playlist_total_reach,max_spotify_playlist_count,max_spotify_playlist_total_reach,max_spotify_plays,max_spotify_popularity,max_tiktok_posts,max_tiktok_top_videos_likes,max_tiktok_top_videos_views,max_youtube_likes,max_youtube_playlist_count,max_youtube_views,min_airplay_streams,min_album.release_date,min_amazon_playlist_count,min_deezer_playlist_count,min_itunes_playlist_count,min_rank,min_rank.rank_overall,min_release_date,min_score,min_shazam_count,min_siriusxm_streams,min_soundcloud_plays,min_spotify_ed_playlist_count,min_spotify_ed_playlist_total_reach,min_spotify_playlist_count,min_spotify_playlist_total_reach,min_spotify_plays,min_spotify_popularity,min_tiktok_posts,min_tiktok_top_videos_likes,min_tiktok_top_videos_views,min_youtube_likes,min_youtube_playlist_count,min_youtube_views,offset,originalsOnly,range_period,shortListIds[],sortColumn,sortOrderDesc,version_and[],version_not[],version_only[],version_or[]
GET /api/track/youtube/{id}/topShorts|social-relationships|bySoundId,limit,type
GET /api/track/{id}|catalog-performance|
GET /api/track/{id}/milestones|catalog-performance|fromDaysAgo,grouped,limit,offset,platforms[],sortColumn,sortOrderDesc,stars[]
GET /api/track/{id}/playlist-stream-estimates|catalog-performance|date,since,until
GET /api/track/{id}/relatedTracks|search-discovery|
GET /api/track/{id}/tiktok-influencer-stats|social-relationships|dimension,periodDays
GET /api/track/{id}/tiktok-top-influencers|social-relationships|ageGroup[],categories[],country[],ethnicity[],gender[],isVerified,language[],lastDatePostedFrom,limit,maxAvgComments,maxAvgEngagementRate,maxAvgLikes,maxAvgSaves,maxAvgShares,maxAvgViews,maxFollowers,maxVideoCount,minAvgComments,minAvgEngagementRate,minAvgLikes,minAvgSaves,minAvgShares,minAvgViews,minFollowers,minVideoCount,offset,sortBy,sortDirection,type[]
GET /api/track/{id}/tiktok-top-sounds|social-relationships|official
GET /api/track/{id}/topVideos|social-relationships|byTiktokId,fromDaysAgo,limit,maxComments,maxLikes,maxSaves,maxShares,maxViews,minComments,minLikes,minSaves,minShares,minViews,offset,postedWithinDaysAgo,sortOrderDesc,type,withTotal
GET /api/track/{id}/video-trends|social-relationships|fromDaysAgo
GET /api/track/{id}/{platform}/playlists/snapshot|catalog-performance|date,limit,offset
GET /api/track/{id}/{platform}/stats/{mode}|catalog-performance|extrapolated,interpolated,isDomainId,latest,since,type,until
GET /api/track/{id}/{platform}/{status}/playlists|catalog-performance|audiobook,brand,chart,deezerPartner,editorial,editorialBrand,fullyPersonalized,hundredPercent,indie,limit,majorCurator,minFollowers,musicBrand,newMusicFriday,nonMusicBrand,offset,personalityArtist,personalized,popularIndie,radio,showPositionStats,since,sortColumn,sortOrderDesc,thisIs,until
GET /api/track/{id}/{type}/charts|catalog-performance|since,until
GET /api/track/{type}/{id}/get-ids|catalog-performance|
GET /api/venue|events|cityId,code2,includeFutureShows,limit,maxCapacity,minCapacity,offset,search,sortColumn,sortOrderDesc,venueType
POST /api/artist/{id}/tiktok/refresh|catalog-performance|since,until
POST /api/playlist/{platform}/{id}/refresh|catalog-performance|since,until
POST /api/token|catalog-performance|
POST /api/track/playlist-stream-estimates|catalog-performance|date,since,until`;

export const CHARTMETRIC_ENDPOINT_COUNT = 157;
export type ChartmetricAdmission =
  | 'access-blocked'
  | 'vendor-only-opaque-metric';

const CAVEATS: Readonly<Record<string, string>> = {
  '/api/artist/{id}/career':
    'Proprietary stage/momentum; description mentions legacy history but declares no legacy parameter.',
  '/api/artist/{id}/instagram-audience-stats':
    'Liker, brand, interest and notable-follower panel values stopped updating on 2026-10-01; empty or retained history is not fresh evidence.',
  '/api/artist/{id}/market-coverage-views/youtube':
    'Top-100 city market coverage starts 2024-05-24; includes 28-day competitor trends.',
  '/api/artist/{id}/similar-artists/by-configurations':
    'Proprietary weighted embeddings; segmentSize is described but absent from declared parameters. No identical-score claim.',
  '/api/artist/{id}/where-people-listen':
    'Spotify top-50 city observations before 2024-08-12; estimates and model-filled days afterwards. includeEstimates does not make estimates observed.',
  '/api/brand/v2/{brandId}':
    'V1/V2 brand IDs are different universes. V2 audience_similarity is not V1 affinity/overlap or an endorsement.',
  '/api/brand/v2/{brandId}/audience':
    'Brand-account audience, not matched artists. No report gives null source_platform and empty lists; ethnicity is Instagram-only.',
  '/api/curator/{platform}/lists':
    'Unsupported platform returns 400; supported platforms have dedicated list routes.',
  '/api/playlist/{platform}/lists':
    'Unknown-platform fallback returns 400; it is not an extra supported platform.',
};

export const CHARTMETRIC_CONTRACTS = CHARTMETRIC_INDEX.split('\n').map(line => {
  const [operation, familyName, query] = line.split('|');
  if (!Object.hasOwn(FAMILIES, familyName)) {
    throw new Error(`unknown Chartmetric family: ${familyName}`);
  }
  const family = familyName as keyof typeof FAMILIES;
  const [ownerIssue, implementationIssue] = FAMILIES[family];
  const [method, path] = operation.split(' ');
  const admission: ChartmetricAdmission = path.endsWith('/cm-score')
    ? 'vendor-only-opaque-metric'
    : 'access-blocked';
  const contract: DocumentedContract = {
    family,
    ownerIssue,
    implementationIssue,
    queryParameters: query ? query.split(',') : [],
    source: CHARTMETRIC_REFERENCE,
    caveat: CAVEATS[path],
  };
  return { method, path, admission, contract };
});

/** Existing tuple projection derives from the same index; stable IDs are unchanged. */
export const CHARTMETRIC_ENDPOINTS: readonly (readonly [
  method: string,
  path: string,
  admission: ChartmetricAdmission,
])[] = CHARTMETRIC_CONTRACTS.map(({ method, path, admission }) => [
  method,
  path,
  admission,
]);

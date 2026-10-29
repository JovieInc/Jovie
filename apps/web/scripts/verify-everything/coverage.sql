-- Verify-everything coverage (jovie.verify-everything/v1). Read-only.
-- One JSON row per artist profile, shaped as ProfileFactObservation
-- (apps/web/lib/verify-everything/fact-contract.ts). Every SQL-backed fact id
-- in FACT_SPECS must appear here; fact-contract.test.ts enforces it.
--
--   psql "$DATABASE_URL" -X -At -v scope=claimed -f coverage.sql \
--     | pnpm --filter web exec tsx scripts/verify-everything/coverage.ts
--
-- scope: claimed (default; the golden path) or all.
set default_transaction_read_only = on;
\if :{?scope}
\else
  \set scope claimed
\endif

with profiles as (
  select p.*
  from creator_profiles p
  where p.creator_type = 'artist'
    and (:'scope' = 'all' or p.is_claimed)
),
rel as (
  select r.id, r.creator_profile_id, r.upc, r.label, r.artwork_url, r.release_date
  from discog_releases r
  join profiles p on p.id = r.creator_profile_id
  where r.deleted_at is null
),
rel_tracks as (
  select rt.release_id,
         count(*) as tracks,
         count(*) filter (where rec.isrc is not null) as with_isrc,
         count(*) filter (where rec.lyrics is not null and length(rec.lyrics) > 0) as with_lyrics,
         bool_or(exists (
           select 1 from recording_artists ra
           where ra.recording_id = rec.id and ra.role in ('producer', 'co_producer'))) as has_producer,
         bool_or(exists (
           select 1 from recording_artists ra
           where ra.recording_id = rec.id and ra.role in ('composer', 'lyricist'))) as has_writer
  from discog_release_tracks rt
  join rel on rel.id = rt.release_id
  left join discog_recordings rec on rec.id = rt.recording_id
  group by rt.release_id
),
rel_links as (
  select pl.release_id, count(distinct pl.provider_id) as providers
  from provider_links pl
  join rel on rel.id = pl.release_id
  group by pl.release_id
),
rel_main as (
  select distinct ra.release_id
  from release_artists ra
  join rel on rel.id = ra.release_id
  where ra.role = 'main_artist'
),
work as (
  select rel.creator_profile_id as profile_id,
         count(*)::numeric as n,
         count(*) filter (where rel.artwork_url is not null and rel.release_date is not null) as art_date,
         count(*) filter (where rel.upc ~ '^[0-9]{12,14}$') as upc,
         count(*) filter (where rt.tracks > 0 and rt.with_isrc = rt.tracks) as isrc_all,
         count(*) filter (where rt.with_isrc > 0) as isrc_any,
         count(*) filter (where coalesce(l.providers, 0) >= 3) as links3,
         count(*) filter (where coalesce(l.providers, 0) >= 1) as links1,
         count(*) filter (where rel.label is not null) as label,
         count(*) filter (where m.release_id is not null) as main_credit,
         count(*) filter (where rt.has_producer) as producer,
         count(*) filter (where rt.has_writer) as writer,
         count(*) filter (where rt.with_lyrics > 0) as lyrics
  from rel
  left join rel_tracks rt on rt.release_id = rel.id
  left join rel_links l on l.release_id = rel.id
  left join rel_main m on m.release_id = rel.id
  group by rel.creator_profile_id
),
dsp as (
  select m.creator_profile_id as profile_id, m.provider_id,
         bool_or(m.status in ('confirmed', 'auto_confirmed')
                 and (m.matching_isrc_count + m.matching_upc_count) > 0) as verified,
         bool_or(m.status <> 'rejected') as found
  from dsp_artist_matches m
  join profiles p on p.id = m.creator_profile_id
  group by 1, 2
),
social as (
  select s.creator_profile_id as profile_id,
         case when s.platform = 'twitter' then 'x' else s.platform end as platform,
         bool_or(s.state = 'active' and s.verification_status = 'verified') as verified,
         bool_or(s.state in ('active', 'suggested')) as found
  from social_links s
  join profiles p on p.id = s.creator_profile_id
  where s.platform in ('instagram', 'tiktok', 'youtube', 'x', 'twitter')
  group by 1, 2
),
tours as (
  select t.profile_id,
         bool_or(t.confirmation_status = 'confirmed' and t.provider <> 'manual') as verified,
         bool_or(true) as found
  from tour_dates t
  join profiles p on p.id = t.profile_id
  group by 1
),
merch as (
  select s.creator_profile_id as profile_id, bool_or(true) as found
  from social_links s
  join profiles p on p.id = s.creator_profile_id
  where s.state = 'active' and s.platform in ('shopify', 'bigcartel', 'merch', 'bandcamp_merch', 'fourthwall')
  group by 1
)
select json_build_object(
  'profileId', p.id,
  'artist', json_build_object(
    'artist.spotify_identity',
      case when p.spotify_id is null then 'missing'
           when p.is_claimed or p.is_verified then 'verified' else 'found' end,
    'artist.display_name',
      case when p.display_name is null then 'missing'
           when p.spotify_id is not null or p.display_name_locked then 'verified' else 'found' end,
    'artist.avatar',
      case when p.avatar_url is null then 'missing'
           when p.avatar_locked_by_user
             or (p.spotify_id is not null and p.avatar_url like 'https://i.scdn.co/%') then 'verified'
           else 'found' end,
    'artist.catalog',
      case when coalesce(w.n, 0) = 0 then 'missing'
           when p.spotify_id is not null and w.upc > 0 then 'verified' else 'found' end,
    'artist.dsp.apple_music',
      case when d_am.verified then 'verified' when d_am.found or p.apple_music_id is not null then 'found' else 'missing' end,
    'artist.dsp.youtube_music',
      case when d_ym.verified then 'verified' when d_ym.found or p.youtube_music_id is not null then 'found' else 'missing' end,
    'artist.dsp.deezer',
      case when d_dz.verified then 'verified' when d_dz.found or p.deezer_id is not null then 'found' else 'missing' end,
    'artist.dsp.tidal',
      case when d_td.verified then 'verified' when d_td.found or p.tidal_id is not null then 'found' else 'missing' end,
    'artist.dsp.soundcloud',
      case when d_sc.verified then 'verified' when d_sc.found or p.soundcloud_id is not null then 'found' else 'missing' end,
    'artist.dsp.amazon_music',
      case when d_az.verified then 'verified' when d_az.found then 'found' else 'missing' end,
    'artist.social.instagram',
      case when s_ig.verified then 'verified' when s_ig.found then 'found' else 'not_applicable' end,
    'artist.social.tiktok',
      case when s_tt.verified then 'verified' when s_tt.found then 'found' else 'not_applicable' end,
    'artist.social.youtube',
      case when s_yt.verified then 'verified'
           when s_yt.found or p.youtube_url is not null then 'found' else 'not_applicable' end,
    'artist.social.x',
      case when s_x.verified then 'verified' when s_x.found then 'found' else 'not_applicable' end,
    'artist.genres',
      case when coalesce(cardinality(p.genres), 0) = 0 then 'missing'
           when p.spotify_id is not null then 'verified' else 'found' end,
    'artist.bio',
      case when p.bio is null or length(p.bio) = 0 then 'missing'
           when p.is_claimed then 'verified' else 'found' end,
    'artist.location',
      case when p.location is null then 'missing'
           when p.is_claimed then 'verified' else 'found' end,
    'artist.labels',
      case when coalesce(w.label, 0) = 0 then 'missing'
           when p.spotify_id is not null then 'verified' else 'found' end,
    'artist.tour_dates',
      case when t.verified then 'verified'
           when t.found or p.bandsintown_artist_name is not null then 'found' else 'not_applicable' end,
    'artist.merch',
      case when mc.found then 'found' else 'not_applicable' end,
    'artist.musicbrainz',
      case when p.musicbrainz_id is null then 'missing' else 'found' end,
    'artist.followers',
      case when p.spotify_followers is null then 'missing'
           when p.spotify_id is not null then 'verified' else 'found' end
  ),
  'work', case when coalesce(w.n, 0) = 0 then '{}'::json else json_build_object(
    'work.artwork_and_date', json_build_object('verified', w.art_date / w.n, 'found', w.art_date / w.n, 'applicable', w.n),
    'work.upc', json_build_object('verified', w.upc / w.n, 'found', w.upc / w.n, 'applicable', w.n),
    'work.isrc', json_build_object('verified', w.isrc_all / w.n, 'found', w.isrc_any / w.n, 'applicable', w.n),
    'work.dsp_links', json_build_object('verified', w.links3 / w.n, 'found', w.links1 / w.n, 'applicable', w.n),
    'work.label', json_build_object('verified', w.label / w.n, 'found', w.label / w.n, 'applicable', w.n),
    'work.main_credit', json_build_object('verified', w.main_credit / w.n, 'found', w.main_credit / w.n, 'applicable', w.n),
    'work.producer_credits', json_build_object('verified', w.producer / w.n, 'found', w.producer / w.n, 'applicable', w.n),
    'work.writer_credits', json_build_object('verified', w.writer / w.n, 'found', w.writer / w.n, 'applicable', w.n),
    'work.lyrics', json_build_object('verified', w.lyrics / w.n, 'found', w.lyrics / w.n,
                                     'applicable', case when w.lyrics > 0 then w.n else 0 end)
  ) end
)
from profiles p
left join work w on w.profile_id = p.id
left join dsp d_am on d_am.profile_id = p.id and d_am.provider_id = 'apple_music'
left join dsp d_ym on d_ym.profile_id = p.id and d_ym.provider_id = 'youtube_music'
left join dsp d_dz on d_dz.profile_id = p.id and d_dz.provider_id = 'deezer'
left join dsp d_td on d_td.profile_id = p.id and d_td.provider_id = 'tidal'
left join dsp d_sc on d_sc.profile_id = p.id and d_sc.provider_id = 'soundcloud'
left join dsp d_az on d_az.profile_id = p.id and d_az.provider_id in ('amazon_music')
left join social s_ig on s_ig.profile_id = p.id and s_ig.platform = 'instagram'
left join social s_tt on s_tt.profile_id = p.id and s_tt.platform = 'tiktok'
left join social s_yt on s_yt.profile_id = p.id and s_yt.platform = 'youtube'
left join social s_x on s_x.profile_id = p.id and s_x.platform = 'x'
left join tours t on t.profile_id = p.id
left join merch mc on mc.profile_id = p.id;

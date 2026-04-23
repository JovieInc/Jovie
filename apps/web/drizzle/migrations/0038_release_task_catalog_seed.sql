-- Seed: release skill clusters (20) + canonical release-task catalog (~30 rows)
-- Idempotent via ON CONFLICT DO NOTHING. Safe to re-run.

INSERT INTO "release_skill_clusters" ("slug", "display_name", "display_order", "status") VALUES
  ('rights-royalty-registration', 'Rights & Royalties', 10, 'planned'),
  ('identifiers-distribution',    'Identifiers & Distribution', 20, 'planned'),
  ('post-delivery-qa',            'Post-Delivery QA', 30, 'planned'),
  ('dsp-profile-bio-sync',        'DSP Profile & Bio Sync', 40, 'planned'),
  ('editorial-pitching',          'Editorial Pitching', 50, 'planned'),
  ('release-visuals',             'Release Visuals', 60, 'planned'),
  ('lyrics',                      'Lyrics', 70, 'planned'),
  ('playlists-third-party',       'Third-Party Playlists', 80, 'planned'),
  ('radio-xm',                    'Radio & XM', 90, 'planned'),
  ('dj-promotion',                'DJ Promotion', 100, 'planned'),
  ('retail-fitness-audio',        'Retail & Fitness Audio', 110, 'planned'),
  ('press-epk',                   'Press & EPK', 120, 'planned'),
  ('content-generation',          'Content Generation', 130, 'planned'),
  ('creator-influencer-outreach', 'Creator & Influencer Outreach', 140, 'planned'),
  ('youtube-networks-remix',      'YouTube Networks & Remix', 150, 'planned'),
  ('karaoke-alt-versions',        'Karaoke & Alt Versions', 160, 'planned'),
  ('child-releases',              'Child Releases', 170, 'planned'),
  ('fan-engagement-platform',     'Fan Engagement', 180, 'planned'),
  ('release-day-second-wave',     'Release Day & Second Wave', 190, 'planned'),
  ('post-release-analytics',      'Post-Release Analytics', 200, 'planned')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- ~30 seed catalog rows. applicability_rules is the typed predicate schema
-- (see apps/web/lib/release-tasks/applicability.ts). Rules here use simple shapes;
-- and/or/not composition supported but not needed for the initial set.

INSERT INTO "release_task_catalog" (
  "slug", "name", "category", "cluster_id", "short_description",
  "priority", "flow_stage_days_offset", "applicability_rules", "source_links"
) VALUES
  -- Rights & Royalties
  ('pro-affiliation', 'PRO affiliation', 'rights', (SELECT id FROM release_skill_clusters WHERE slug = 'rights-royalty-registration'),
   'Affiliate with a PRO (BMI/ASCAP/SOCAN/PRS) before first release.',
   'high', -56, '{"type":"always"}', '{"bmi":"https://www.bmi.com/join","ascap":"https://www.ascap.com/ome"}'),

  ('pro-work-registration', 'PRO work registration', 'rights', (SELECT id FROM release_skill_clusters WHERE slug = 'rights-royalty-registration'),
   'Register each composition with PRO with writer/publisher splits.',
   'high', -28, '{"type":"always"}', '{"bmi":"https://www.bmi.com/creators"}'),

  ('mlc-registration', 'MLC work registration', 'rights', (SELECT id FROM release_skill_clusters WHERE slug = 'rights-royalty-registration'),
   'Register US digital mechanicals with The MLC.',
   'high', -28, '{"type":"territory","op":"includes","values":["US","GLOBAL"]}', '{"mlc":"https://www.themlc.com/work-registration"}'),

  ('soundexchange-registration', 'SoundExchange registration', 'rights', (SELECT id FROM release_skill_clusters WHERE slug = 'rights-royalty-registration'),
   'US digital performance royalties for recordings (skip if label handles).',
   'high', -28, '{"type":"and","rules":[{"type":"territory","op":"includes","values":["US","GLOBAL"]},{"type":"hasPublisher","value":false}]}', '{"sx":"https://www.soundexchange.com/register/"}'),

  ('split-sheets', 'Split sheets signed', 'rights', (SELECT id FROM release_skill_clusters WHERE slug = 'rights-royalty-registration'),
   'Get every songwriter/producer to sign a split sheet before release.',
   'urgent', -42, '{"type":"always"}', '{}'),

  -- Identifiers & Distribution
  ('isrc-upc-assignment', 'ISRC + UPC assignment', 'identifiers', (SELECT id FROM release_skill_clusters WHERE slug = 'identifiers-distribution'),
   'Assign ISRC to each recording and UPC to the release product.',
   'high', -42, '{"type":"always"}', '{"isrc":"https://isrc.ifpi.org/get-isrc/get-an-isrc-prefix"}'),

  ('distributor-delivery', 'Deliver release to DSPs', 'distribution', (SELECT id FROM release_skill_clusters WHERE slug = 'identifiers-distribution'),
   'Upload masters, artwork, metadata to your distributor.',
   'urgent', -28, '{"type":"always"}', '{}'),

  ('distributor-marketing-form', 'Distributor marketing/pitching form', 'distribution', (SELECT id FROM release_skill_clusters WHERE slug = 'identifiers-distribution'),
   'Complete the distributor marketing form — this is how your DSP editorial pitch reaches Apple/Amazon/Deezer.',
   'high', -28, '{"type":"always"}', '{"tunecore":"https://support.tunecore.com/hc/en-gb/articles/17878146830228-Artist-Pitch-Forms"}'),

  ('pre-save-setup', 'Set up pre-save campaign', 'distribution', (SELECT id FROM release_skill_clusters WHERE slug = 'identifiers-distribution'),
   'Create a pre-save link so fans can queue the release before drop.',
   'medium', -21, '{"type":"always"}', '{}'),

  -- Post-Delivery QA
  ('verify-dsp-live', 'Verify release live on all DSPs', 'qa', (SELECT id FROM release_skill_clusters WHERE slug = 'post-delivery-qa'),
   'Check each DSP: audio plays, artwork renders, metadata matches.',
   'high', 0, '{"type":"always"}', '{}'),

  -- DSP Profile & Bio Sync
  ('refresh-artist-bios', 'Refresh artist bios across DSPs', 'profile', (SELECT id FROM release_skill_clusters WHERE slug = 'dsp-profile-bio-sync'),
   'Update Spotify, Apple, Amazon, Deezer artist profiles.',
   'medium', -14, '{"type":"always"}', '{"apple":"https://artists.apple.com/support/3391-artist-content-profile"}'),

  ('knowledge-graph-update', 'Update MusicBrainz / Discogs / Google panel', 'profile', (SELECT id FROM release_skill_clusters WHERE slug = 'dsp-profile-bio-sync'),
   'Keep open music databases + Google knowledge panel accurate.',
   'medium', -7, '{"type":"always"}', '{"mb":"https://musicbrainz.org/doc/How_to_Add_a_Release","discogs":"https://support.discogs.com/hc/en-us/articles/17114733929229-Release-Page-Guide"}'),

  -- Editorial Pitching
  ('spotify-editorial-pitch', 'Pitch Spotify editorial', 'editorial', (SELECT id FROM release_skill_clusters WHERE slug = 'editorial-pitching'),
   'Submit via Spotify for Artists at least 7 days before release.',
   'urgent', -14, '{"type":"always"}', '{"spotify":"https://support.spotify.com/us/artists/article/pitching-music-to-playlist-editors/"}'),

  ('amazon-editorial-pitch', 'Pitch Amazon Music editorial', 'editorial', (SELECT id FROM release_skill_clusters WHERE slug = 'editorial-pitching'),
   'Submit via Amazon Music for Artists.',
   'high', -14, '{"type":"always"}', '{"amazon":"https://artists.amazonmusic.com/pitch"}'),

  -- Release Visuals
  ('cover-artwork-3000', 'Finalize cover artwork (3000×3000)', 'visuals', (SELECT id FROM release_skill_clusters WHERE slug = 'release-visuals'),
   'Square JPG/PNG, 3000×3000, no platform logos, legible at 64px.',
   'high', -21, '{"type":"always"}', '{}'),

  ('spotify-canvas', 'Upload Spotify Canvas', 'visuals', (SELECT id FROM release_skill_clusters WHERE slug = 'release-visuals'),
   '3-8 second vertical loop behind the track on Spotify mobile.',
   'medium', -7, '{"type":"always"}', '{}'),

  -- Lyrics
  ('lyrics-to-distributor', 'Upload lyrics to distributor', 'lyrics', (SELECT id FROM release_skill_clusters WHERE slug = 'lyrics'),
   'Lyrics sync to Apple Music and other DSPs.',
   'medium', -28, '{"type":"always"}', '{}'),

  ('lyrics-genius-musixmatch', 'Submit to Genius + Musixmatch', 'lyrics', (SELECT id FROM release_skill_clusters WHERE slug = 'lyrics'),
   'Genius for annotations; Musixmatch for synced display on IG/Spotify.',
   'medium', 0, '{"type":"always"}', '{}'),

  -- Third-Party Playlists
  ('curator-outreach', 'Third-party curator outreach', 'playlists', (SELECT id FROM release_skill_clusters WHERE slug = 'playlists-third-party'),
   'SubmitHub/Groover + direct curator DMs. Avoid guaranteed-stream services.',
   'medium', -14, '{"type":"always"}', '{"submithub":"https://www.submithub.com/","groover":"https://groover.co/en/"}'),

  -- Radio & XM
  ('siriusxm-dance-pitch', 'SiriusXM dance channels pitch', 'radio', (SELECT id FROM release_skill_clusters WHERE slug = 'radio-xm'),
   'Pitch BPM / Diplo Revolution / Chill with focus track + story.',
   'medium', -14, '{"type":"and","rules":[{"type":"genre","op":"in","values":["electronic"]},{"type":"territory","op":"includes","values":["US","GLOBAL"]}]}', '{"bpm":"https://www.siriusxm.com/channels/bpm"}'),

  ('nacc-college-radio', 'NACC college radio campaign', 'radio', (SELECT id FROM release_skill_clusters WHERE slug = 'radio-xm'),
   'Submit to NACC adds system; track weekly adds.',
   'medium', -21, '{"type":"and","rules":[{"type":"territory","op":"includes","values":["US"]},{"type":"genre","op":"not_in","values":["electronic","classical"]}]}', '{"nacc":"https://naccchart.com/web/index.php?r=adds-submission%2Findex"}'),

  -- DJ Promotion
  ('dj-promo-pool-submission', 'DJ promo pool submission', 'dj', (SELECT id FROM release_skill_clusters WHERE slug = 'dj-promotion'),
   'Submit to BPM Supreme / DJcity / Promo Only / DMS.',
   'medium', -7, '{"type":"genre","op":"in","values":["electronic","hiphop","rnb","pop"]}', '{}'),

  -- Retail & Fitness Audio
  ('in-store-business-audio-pitch', 'In-store / business audio pitch', 'retail', (SELECT id FROM release_skill_clusters WHERE slug = 'retail-fitness-audio'),
   'Pitch PlayNetwork / Rockbot / SXM Business with clean edit.',
   'low', -14, '{"type":"always"}', '{"playnetwork":"https://www.playnetwork.com/","rockbot":"https://rockbot.com/music-for-business"}'),

  ('gym-fitness-pitch', 'Gym / fitness music pitch', 'retail', (SELECT id FROM release_skill_clusters WHERE slug = 'retail-fitness-audio'),
   'FITRADIO / Peloton / Les Mills — BPM + mood tagged.',
   'low', -14, '{"type":"genre","op":"in","values":["electronic","pop","hiphop"]}', '{"fitradio":"https://gyms.fitradio.com/"}'),

  -- Press & EPK
  ('press-release-draft', 'Draft press release', 'press', (SELECT id FROM release_skill_clusters WHERE slug = 'press-epk'),
   'One-page press release: story, date, credits, links.',
   'medium', -21, '{"type":"always"}', '{}'),

  ('epk-refresh', 'Refresh EPK + press photos', 'press', (SELECT id FROM release_skill_clusters WHERE slug = 'press-epk'),
   'Bio (long/med/short), one-sheet, updated retouched photos.',
   'medium', -21, '{"type":"always"}', '{}'),

  ('allmusic-submission', 'AllMusic metadata + photo submission', 'press', (SELECT id FROM release_skill_clusters WHERE slug = 'press-epk'),
   'Submit release + photo through AllMusic / Xperi metadata channel.',
   'medium', -14, '{"type":"distribution","op":"neq","value":"diy"}', '{}'),

  -- YouTube Networks & Remix
  ('youtube-network-outreach', 'YouTube music network outreach', 'youtube', (SELECT id FROM release_skill_clusters WHERE slug = 'youtube-networks-remix'),
   'Proximity / CloudKid / Trap Nation / PRX — route by subgenre.',
   'medium', -14, '{"type":"genre","op":"in","values":["electronic","hiphop"]}', '{"proximity":"https://www.prxmusic.com/"}'),

  ('remix-stem-pack', 'Prepare remix stem pack', 'remix', (SELECT id FROM release_skill_clusters WHERE slug = 'youtube-networks-remix'),
   'Cleared stems + BPM/key + artwork + usage rules.',
   'medium', -7, '{"type":"genre","op":"in","values":["electronic","pop","hiphop"]}', '{}'),

  -- Fan Engagement
  ('smart-link-create', 'Create Jovie smart link', 'platform', (SELECT id FROM release_skill_clusters WHERE slug = 'fan-engagement-platform'),
   'Your aggregated streaming link for the release.',
   'high', -1, '{"type":"always"}', '{}'),

  ('fan-notification-send', 'Send release-day fan notification', 'platform', (SELECT id FROM release_skill_clusters WHERE slug = 'fan-engagement-platform'),
   'Notify subscribed fans on release day with art + link.',
   'urgent', 0, '{"type":"always"}', '{}'),

  -- Release Day & Second Wave
  ('release-day-switchboard', 'Release day switchboard', 'release-day', (SELECT id FROM release_skill_clusters WHERE slug = 'release-day-second-wave'),
   'Swap links, pin priority surfaces, log issues, trigger campaign tools.',
   'urgent', 0, '{"type":"always"}', '{}'),

  -- Post-Release Analytics
  ('week-one-analytics', 'Review first-week analytics', 'analytics', (SELECT id FROM release_skill_clusters WHERE slug = 'post-release-analytics'),
   'Streams, saves, playlist adds, top cities across DSPs.',
   'medium', 7, '{"type":"always"}', '{}')
ON CONFLICT (slug) DO NOTHING;

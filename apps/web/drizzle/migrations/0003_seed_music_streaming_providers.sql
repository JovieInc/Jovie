-- Seed required music streaming providers for provider_links foreign key constraint
-- This ensures the providers table has entries before any provider_links can be created

INSERT INTO providers (id, display_name, kind, base_url, is_active, metadata, created_at, updated_at)
VALUES
  ('spotify', 'Spotify', 'music_streaming', 'https://open.spotify.com', true, '{"iconColor": "#1DB954", "priority": 1}', now(), now()),
  ('apple_music', 'Apple Music', 'music_streaming', 'https://music.apple.com', true, '{"iconColor": "#FA243C", "priority": 2}', now(), now()),
  ('youtube_music', 'YouTube Music', 'music_streaming', 'https://music.youtube.com', true, '{"iconColor": "#FF0000", "priority": 3}', now(), now()),
  ('amazon_music', 'Amazon Music', 'music_streaming', 'https://music.amazon.com', true, '{"iconColor": "#FF9900", "priority": 4}', now(), now()),
  ('deezer', 'Deezer', 'music_streaming', 'https://www.deezer.com', true, '{"iconColor": "#FEAA2D", "priority": 5}', now(), now()),
  ('tidal', 'Tidal', 'music_streaming', 'https://listen.tidal.com', true, '{"iconColor": "#000000", "priority": 6}', now(), now()),
  ('soundcloud', 'SoundCloud', 'music_streaming', 'https://soundcloud.com', true, '{"iconColor": "#FF5500", "priority": 7}', now(), now()),
  ('pandora', 'Pandora', 'music_streaming', 'https://www.pandora.com', true, '{"iconColor": "#224099", "priority": 8}', now(), now()),
  ('audiomack', 'Audiomack', 'music_streaming', 'https://audiomack.com', true, '{"iconColor": "#FFA200", "priority": 9}', now(), now()),
  ('bandcamp', 'Bandcamp', 'retail', 'https://bandcamp.com', true, '{"iconColor": "#629AA9", "priority": 10}', now(), now())
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  kind = EXCLUDED.kind,
  base_url = EXCLUDED.base_url,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

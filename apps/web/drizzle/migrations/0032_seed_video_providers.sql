-- Seed video providers for short-form "Use this sound" links
-- These providers support TikTok sounds, Instagram Reels audio, and YouTube Shorts

INSERT INTO providers (id, display_name, kind, base_url, is_active, metadata, created_at, updated_at)
VALUES
  ('tiktok_sound', 'TikTok', 'video', 'https://www.tiktok.com', true,
   '{"iconColor": "#000000", "priority": 1, "ctaLabel": "Use sound on TikTok"}', now(), now()),
  ('instagram_reels', 'Instagram Reels', 'video', 'https://www.instagram.com', true,
   '{"iconColor": "#E4405F", "priority": 2, "ctaLabel": "Use audio on Instagram"}', now(), now()),
  ('youtube_shorts', 'YouTube Shorts', 'video', 'https://www.youtube.com', true,
   '{"iconColor": "#FF0000", "priority": 3, "ctaLabel": "Use sound on YouTube"}', now(), now())
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  kind = EXCLUDED.kind,
  base_url = EXCLUDED.base_url,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

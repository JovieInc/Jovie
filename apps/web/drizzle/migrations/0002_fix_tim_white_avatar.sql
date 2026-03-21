-- Fix Tim White's avatar to the known-good static image and lock it
-- so DSP enrichment cannot overwrite it with the wrong Spotify artist's photo.
-- Context: The enrichment pipeline pulled the wrong Tim White's image from Spotify.
UPDATE creator_profiles
SET avatar_url = '/images/avatars/tim-white.jpg',
    avatar_locked_by_user = true,
    updated_at = NOW()
WHERE spotify_id = '4Uwpa6zW3zzCSQvooQNksm';

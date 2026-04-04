-- Clear fake confidence scores from MusicFetch-seeded matches.
-- MusicFetch discovers cross-platform URLs but never runs ISRC/UPC matching,
-- so the hardcoded 1.0 confidence score was misleading.
UPDATE dsp_artist_matches
SET confidence_score = NULL,
    confidence_breakdown = NULL
WHERE match_source = 'musicfetch'
  AND matching_isrc_count = 0
  AND confidence_score = '1.0000';

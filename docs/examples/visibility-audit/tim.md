# Digital Footprint & Visibility Audit

Artist: Tim White
Profile: https://jov.ie/tim (/tim)
Generated: 2026-10-02T00:00:00.000Z
Price: $199
This $199 audit is credited toward the first month of Artist Visibility Pro ($199/mo).

Evidence is the in-repo verified profile for /tim. Live DSP, link-in-bio, pixel, search, and citation checks were not run. MusicFetch and SerpAPI were not called.

## Identity

Chain: MusicBrainz MBID → Wikidata QID → ISNI, using stored links and `buildEntitySameAs`.

- MusicBrainz MBID: missing (none)
- Wikidata QID: missing (none)
- ISNI: missing (none)

sameAs:

- https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm

## DSP presence (41 registry platforms)

1 present, 40 missing. Presence is a stored URL on a dsp-registry platform. MusicFetch is not called.

### streaming

- Spotify: present (https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm)
- Missing: Apple Music, YouTube Music, SoundCloud, Deezer, Tidal, Amazon Music, Bandcamp, Pandora, Napster, Audiomack, Qobuz, Anghami, Boomplay, iHeartRadio, Beatport, Amazon, AWA, Audius, FLO, Gaana, JioSaavn, JOOX, KKBOX, LINE MUSIC, NetEase Music, QQ Music, Trebel, Yandex Music, YouTube

### video

- Missing: TikTok, Instagram, YouTube Shorts

### metadata

- Missing: Genius, Discogs, AllMusic, MusicBrainz, Shazam, 7digital, Telmor Musik, YouSee Musik

## Link-in-bio graph

Classified with the ingestion strategy URL detectors (Linktree, Beacons, Laylo, Instagram, TikTok, X, YouTube). No pages were fetched for this report.

No ingested link-in-bio or social URLs were supplied.

Conflicts: none.

## Google page-1 ownership

Google page-1 ownership is a manual check while PROFILE_SEARCH_MONITORING is off. Record query, rank, URL, and whether the result is owned by the artist. This generator does not call SerpAPI.

Monitoring flag `PROFILE_SEARCH_MONITORING` default: off. SerpAPI requests: 0.

Manual rows: none yet.

## Answer-engine citations

Observed visibility is sampled AI-answer evidence. It does not measure referrals, purchases, revenue, or causal lift.

Answer-engine citation spot checks use the canonical question set. Paste manual results per engine. This generator does not query answer engines.

Checks: 0. Cited: 0. Share of citation: 0.

- Who is Tim White? (identity): not checked
- Where is Tim White from? (identity): not checked
- What is Tim White's latest release? (release): not checked
- Is Tim White touring? (touring): not checked
- Where can I buy Tim White merch? (merch): not checked
- What genre is Tim White? (identity): not checked

## Catalog mismatches

Catalog mismatches are ISRC presence only (missing from a DSP, or on a DSP and not in the catalog). This section does not report popularity, follower counts, stream counts, listener counts, or audio features derived from Spotify content (Spotify Developer Policy III.13).

No `dsp_catalog_mismatches` rows were supplied.

## Ad pixels

- facebook: missing (none)
- tiktok: missing (none)
- google: missing (none)
- twitter: missing (none)
- snapchat: missing (none)
- pinterest: missing (none)

## Prioritized fixes

Agentic fixes map to Pro submissions (MusicBrainz, AllMusic) and DSP bio sync. MusicBrainz authenticated edits stay mapped and not preparable.

1. Create or confirm the MusicBrainz artist — submission `musicbrainz_authenticated_edit` (provider mapped, not in the current preparable set). The MBID → Wikidata QID → ISNI chain starts at MusicBrainz. No MBID is stored, so QID and ISNI cannot be resolved from MusicBrainz url-rels.
4. Submit the artist to AllMusic — submission `xperi_allmusic_email` (provider ready). AllMusic is missing from DSP presence. Pro maps this to the Xperi / AllMusic submission provider.
7. Sync artist bios to DSPs that are missing a profile link — DSP bio sync (apple_music, amazon_music, tidal, deezer). Enabled DSP bio sync has no stored link for: Apple Music, Amazon Music, TIDAL, Deezer.
8. Add missing ad pixels — manual `configure_ad_pixels`. No pixel init was stored for: facebook, tiktok, google, twitter, snapchat, pinterest.
9. Record Google page-1 ownership by hand — manual `manual_search_ownership`. Google page-1 ownership is a manual check while PROFILE_SEARCH_MONITORING is off. Record query, rank, URL, and whether the result is owned by the artist. This generator does not call SerpAPI.
10. Spot-check answer-engine citations — manual `manual_citation_spot_check`. Answer-engine citation spot checks use the canonical question set. Paste manual results per engine. This generator does not query answer engines.

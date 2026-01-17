# AI Music Platforms as DSPs - Research & Recommendations

> Research Date: January 2025
> Purpose: Evaluate AI music platforms with consumer listening interfaces for potential DSP integration

## Executive Summary

This research evaluates AI music generation platforms that function as de facto DSPs (Digital Service Providers) by offering consumer-facing interfaces where listeners can discover and play music created by artists on the platform. These platforms represent an emerging category distinct from traditional streaming services.

---

## Tier 1: Recommended for Integration

### 1. Suno ⭐ (Highest Priority)

**Platform Overview:**
- Leading AI music generation platform, now distributed through Warner Music Group
- Over 10 million users generating music
- Produces full songs with vocals and instrumentation up to 8 minutes

**Consumer Listening Interface:**
| Feature | Description |
|---------|-------------|
| Explore Page | Trending songs, curated playlists, genre discovery |
| Public Profiles | Creator pages with their public songs |
| Search | Find songs by title, genre, or creator username |
| Song Radio | Personalized discovery based on liked songs |
| Playlists | Public and private playlist creation |
| Liked Songs | Personal library of saved tracks |
| History | Recently played songs |

**Why Add Support:**
- Largest and most active AI music community
- Clear creator identity with profile URLs (suno.com/@username)
- Warner Music Group partnership provides legitimacy
- Strong consumer listening habits ("come to create, stay to listen")
- Public song pages with shareable links

**Technical Considerations:**
- No traditional ISRC codes (AI-generated content)
- Would need username/profile-based matching
- API access status unknown - may need to explore

**Sources:**
- [Suno Platform](https://suno.com/home)
- [Suno Explore Page Documentation](https://help.suno.com/en/articles/3134721)
- [Inside Suno Interview](https://creatoreconomy.so/p/inside-suno-the-ai-music-app-you-wont-stop-listening-to-product)

---

### 2. Udio (High Priority)

**Platform Overview:**
- Founded by former Google DeepMind researchers
- Known for industry-leading vocal quality
- Settled with Universal Music Group in October 2025

**Consumer Listening Interface:**
| Feature | Description |
|---------|-------------|
| Community Platform | Browse and discover creator songs |
| Style Library | Curated songs across genres |
| Artist Following | Follow favorite creators |
| Tag-based Discovery | Browse by genre tags |
| Style Blending | Discover fusion tracks |

**Why Add Support:**
- Second-largest AI music platform
- High audio quality (preferred for pop, electronic, rap)
- Strong community features
- Major label settlement provides legitimacy

**Important Caveat:**
Post-UMG settlement (Oct 2025), Udio became a "walled garden":
- Users can no longer download their AI-generated music
- Streaming only within the Udio platform
- This actually reinforces its DSP-like nature

**Technical Considerations:**
- Profile URLs: udio.com/@username or udio.com/songs/[id]
- No ISRC codes
- API status unknown

**Sources:**
- [Udio Platform](https://www.udio.com)
- [Udio Style Library Announcement](https://x.com/udiomusic/status/1945904918885495232)
- [Billboard: AI Music Stories 2025](https://www.billboard.com/lists/biggest-ai-music-stories-2025-suno-udio-charts-more/)

---

### 3. Boomy (Medium Priority)

**Platform Overview:**
- Established 2019 (earliest AI music platform)
- Over 20 million original songs created
- Unique selling point: built-in distribution to 40+ streaming platforms

**Consumer Listening Interface:**
| Feature | Description |
|---------|-------------|
| Genre Playlists | Boomy EDM, Boomy Ambient, Boomy LoFi, etc. |
| Trending Categories | #chill, #rap, #Electronic |
| Artist Profiles | Creator pages with discography |
| Sample Songs | Listen to community creations |
| Featured Artists | Highlighted creators (Higgs Bison, Wobinn, etc.) |

**Why Add Support:**
- Long-established platform with large catalog
- Community-focused with social features
- Discord community for engagement
- Unique hybrid model (platform + distributor)

**Important Caveat:**
- Boomy retains partial rights to generated tracks
- Lower audio quality compared to Suno/Udio
- More beginner-focused

**Technical Considerations:**
- Songs distributed to Spotify/Apple Music get ISRCs (through Boomy)
- Internal Boomy catalog may not have ISRCs
- Dual matching strategy possible

**Sources:**
- [Boomy Platform](https://boomy.com/)
- [Boomy on SoundCloud](https://soundcloud.com/i_am_boomy)
- [TechRadar: What is Boomy](https://www.techradar.com/pro/what-is-boomy-everything-we-know-about-the-ai-music-maker)

---

## Tier 2: Consider for Future Integration

### 4. Mubert

**Platform Overview:**
- AI music streaming app (iOS, Android, Web)
- Focus on functional/ambient music (focus, workout, sleep)
- Artists contribute samples and earn royalties

**Consumer Listening Interface:**
| Feature | Description |
|---------|-------------|
| Mubert Play | Infinite AI soundtrack streams |
| Mood Selection | Dozens of moods (Calm Meditation, Sports Extreme) |
| Genre Streams | Techno, chill, house, hip hop, ambient |
| Favorites | Save preferred streams |
| Personalization | Train algorithm with likes/dislikes |

**Why Consider:**
- Strong consumer app presence
- Unique infinite streaming model
- Artist royalty model (ethical approach)

**Why Lower Priority:**
- Less focus on individual creator profiles
- More ambient/functional than song-based
- Different use case than traditional DSP

**Sources:**
- [Mubert Platform](https://mubert.com/)
- [Mubert iOS App](https://apps.apple.com/us/app/mubert-ai-music-streaming/id1154429580)

---

### 5. AIVA

**Platform Overview:**
- AI composer for emotional soundtrack music
- Focus on classical, cinematic, and orchestral genres
- Available on browser, Windows, and Mac

**Consumer Listening Interface:**
| Feature | Description |
|---------|-------------|
| Radio Stations | Playlists of AIVA-composed music |
| Genre Library | 250+ styles from classical to electronic |
| Thematic Playlists | "Lo-Fi Beats to Relax to", "Epic Orchestral" |
| SoundCloud Presence | Stream tracks and albums |

**Why Consider:**
- Spotify-like interface design
- Strong library organization
- Good for background/functional music

**Why Lower Priority:**
- More tool-focused than community platform
- Less emphasis on individual creator profiles
- Primarily instrumental (no vocals)

**Sources:**
- [AIVA Platform](https://creators.aiva.ai/)
- [AIVA on SoundCloud](https://soundcloud.com/user-95265362)

---

## Tier 3: Not Recommended

### Loudly
- **Reason:** Creation-focused tool; distribution only to external platforms (Spotify, etc.)
- No internal community listening interface
- Users cannot browse/discover other creators' music on Loudly itself

### Soundraw
- **Reason:** No internal community features
- Focus on external distribution and licensing
- No public song discovery interface

### Beatoven.ai
- **Reason:** Explicitly prohibits streaming distribution
- Creation tool only
- License prevents Spotify/Apple Music distribution

### Stable Audio (Stability AI)
- **Reason:** Pure generation tool
- No community features or public song sharing
- Focus on audio-to-audio transformation

---

## Integration Considerations for Jovie

### Matching Strategy Differences

Unlike traditional DSPs, AI music platforms present unique matching challenges:

| Aspect | Traditional DSPs | AI Music Platforms |
|--------|-----------------|-------------------|
| ISRC Codes | ✅ Standard | ❌ Not typically used |
| Artist IDs | Platform-specific IDs | Username-based profiles |
| Catalog Size | Finite releases | Infinite generation |
| Verification | Label verification | Platform account verification |

### Recommended Matching Approach

1. **Username/Profile Matching**
   - Match Jovie creator profiles to AI platform usernames
   - Support profile URL verification (suno.com/@username)

2. **Manual Linking (Phase 1)**
   - Allow creators to connect their AI platform profiles
   - Verify ownership through platform-specific methods

3. **Cross-Platform Song Discovery (Phase 2)**
   - If a creator distributes Boomy songs to Spotify, the ISRCs appear on Spotify
   - Link back to original Boomy profile

### Proposed Database Schema Additions

```typescript
// In profiles.ts
sunoId: text           // Suno username/profile ID
udioId: text           // Udio username/profile ID
boomyId: text          // Boomy artist ID
mubertId: text         // Mubert creator ID (if applicable)
```

### API Research Needed

| Platform | API Status | Notes |
|----------|-----------|-------|
| Suno | Unknown | May need web scraping initially |
| Udio | Unknown | Post-settlement changes unclear |
| Boomy | Unknown | Has distribution API for labels |
| Mubert | Public API | Documented for integration |

---

## Recommendations Summary

### Immediate Priority
1. **Suno** - Add support first; largest platform with best community features
2. **Udio** - Add support second; high quality, major label legitimacy

### Secondary Priority
3. **Boomy** - Add support third; good community + unique distribution angle

### Future Consideration
4. **Mubert** - Evaluate based on creator demand
5. **AIVA** - Evaluate for instrumental/soundtrack creators

### Do Not Add
- Loudly, Soundraw, Beatoven.ai, Stable Audio (no consumer listening interfaces)

---

## Market Context

The AI music market is projected to grow from $3.9B (2023) to $38.7B by 2033 (25.8% CAGR). Major label settlements with Suno (Warner) and Udio (UMG) in 2025 signal industry acceptance of these platforms as legitimate distribution channels.

As these platforms mature, they increasingly function as DSPs where:
- Creators publish music
- Consumers discover and listen
- Platform handles distribution (internally or externally)

Adding support for these emerging DSPs positions Jovie ahead of traditional music industry tooling.

---

## References

- [Suno Platform](https://suno.com/home)
- [Udio Platform](https://www.udio.com)
- [Boomy Platform](https://boomy.com/)
- [Mubert Platform](https://mubert.com/)
- [AIVA Platform](https://creators.aiva.ai/)
- [Billboard AI Music Stories 2025](https://www.billboard.com/lists/biggest-ai-music-stories-2025-suno-udio-charts-more/)
- [Best AI Music Generators 2025](https://www.digitalocean.com/resources/articles/ai-music-generators)

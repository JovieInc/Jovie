# Asset Management: Profile Images & Album Art

**Priority:** Low (Backlog)
**Labels:** `feature`, `infrastructure`, `images`

---

## Summary

Enable multi-resolution storage and downloads for artist profile images and album artwork, with SEO-friendly filenames. This lays the foundation for Jovie to become the central hub for artist music assets.

## Problem

- Album artwork stored as external URLs (Spotify CDN) — no control over availability
- Profile photos only have one size (512px AVIF)
- No download capability from shareable links
- No metadata stored (dimensions, format, dominant color)

## Solution

Store profile images and album artwork in multiple resolutions with downloadable links.

### Core Features
- **Multi-resolution storage**: 64px, 300px, 640px, 1400px, original (up to 4K)
- **SEO-friendly downloads**: `artist-name-album-title-album-artwork-2024-1400px.webp`
- **Right-click download menus** on shareable links and profile pages
- **AI upscaling** for low-res source images (via Replicate Real-ESRGAN)
- **Color extraction** for UI theming (dominant color + palette)

### Database Changes
- New `release_artwork` table (1:1 with releases)
- New `artist_profile_images` table (1:1 with artists)

### Storage
- Vercel Blob: `artwork/releases/{id}/` and `artwork/artists/{id}/profile/`
- Estimated cost: ~$1.73/month for 10K releases + 5K artists

## Implementation Stages

1. **Foundation** — Tables, Sharp processing, Blob storage, upload APIs
2. **Processing & Migration** — Color extraction, Inngest queue, migrate existing URLs
3. **Downloads** — SEO filenames, download APIs, right-click context menus
4. **AI Enhancement** — Replicate integration for upscaling
5. **Sync** — Cover Art Archive fetch (future)

## Future Enhancements (Out of Scope)

- Logos with transparency support
- Press photo galleries
- Social banners
- Full EPK features

## References

- [Full technical plan](../plans/artist-asset-management.md)

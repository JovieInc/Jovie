# Artist Asset Management Plan

> **Vision**: Enable artists to manage their profile images and album artwork with multi-resolution support, SEO-optimized downloads, and seamless distribution — laying the foundation for Jovie to become the central hub for artist music assets.

## Executive Summary

This plan outlines how to evolve from simple external URL storage to a self-hosted asset management system for **two core asset types**:

1. **Album Artwork** - Cover art for releases
2. **Artist Profile Images** - Primary artist photo

Key capabilities:
- Store images in multiple resolutions (64px → original/4K)
- Enable right-click downloads from shareable links with **SEO-friendly filenames**
- Sync assets with DSPs and metadata services
- Auto-enhance low-resolution images using AI upscaling

---

## Current State Analysis

### What We Have

| Asset Type | Current Implementation |
|------------|----------------------|
| **Album Artwork** | Single `artwork_url` field pointing to external CDN (Spotify). No processing, no downloads. |
| **Artist Profile** | `image_url` on artists table (external). `profile_photos` table for avatars processed to single 512px AVIF. |

### Key Limitations
1. No control over image availability (relies on external CDNs)
2. No multi-resolution variants for different use cases
3. Cannot offer downloads without exposing third-party URLs
4. No metadata (dimensions, format, file size) stored for album art
5. Profile photos only have one size (512px)

---

## Proposed Architecture

### Phase 1: Database Schema

#### 1.1 Release Artwork Table

```typescript
// New table: release_artwork
export const releaseArtwork = pgTable('release_artwork', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  releaseId: text('release_id')
    .notNull()
    .references(() => discogReleases.id, { onDelete: 'cascade' }),

  // Source tracking
  sourceType: text('source_type').notNull(), // 'upload' | 'spotify' | 'apple_music' | 'ai_upscaled'
  sourceUrl: text('source_url'), // Original external URL if imported

  // Stored variants (Vercel Blob URLs)
  originalUrl: text('original_url'), // Full resolution as uploaded/imported
  largeUrl: text('large_url'),       // 1400x1400 (standard album art size)
  mediumUrl: text('medium_url'),     // 640x640 (social sharing)
  smallUrl: text('small_url'),       // 300x300 (thumbnails)
  tinyUrl: text('tiny_url'),         // 64x64 (list views, blur placeholders)

  // Metadata
  originalWidth: integer('original_width'),
  originalHeight: integer('original_height'),
  originalFormat: text('original_format'), // 'jpeg' | 'png' | 'webp' | 'avif'
  originalFileSize: integer('original_file_size'), // bytes
  dominantColor: text('dominant_color'), // hex color for placeholders
  colorPalette: jsonb('color_palette').$type<string[]>(),

  // AI enhancement tracking
  isAiEnhanced: boolean('is_ai_enhanced').default(false),
  aiEnhancementModel: text('ai_enhancement_model'),
  aiEnhancedAt: timestamp('ai_enhanced_at', { withTimezone: true }),

  // Status
  status: text('status').notNull().default('pending'),
    // 'pending' | 'processing' | 'ready' | 'failed'
  processingError: text('processing_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  releaseIdIdx: index('release_artwork_release_id_idx').on(table.releaseId),
  statusIdx: index('release_artwork_status_idx').on(table.status),
}));
```

#### 1.2 Artist Profile Image Table

```typescript
// New table: artist_profile_images
export const artistProfileImages = pgTable('artist_profile_images', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  artistId: text('artist_id')
    .notNull()
    .unique() // One profile image per artist
    .references(() => artists.id, { onDelete: 'cascade' }),

  // Source tracking
  sourceType: text('source_type').notNull(), // 'upload' | 'spotify' | 'apple_music' | 'ai_upscaled'
  sourceUrl: text('source_url'),

  // Stored variants (Vercel Blob URLs)
  originalUrl: text('original_url'),
  largeUrl: text('large_url'),       // 1400x1400
  mediumUrl: text('medium_url'),     // 640x640
  smallUrl: text('small_url'),       // 300x300
  tinyUrl: text('tiny_url'),         // 64x64

  // Metadata
  originalWidth: integer('original_width'),
  originalHeight: integer('original_height'),
  originalFormat: text('original_format'),
  originalFileSize: integer('original_file_size'),
  dominantColor: text('dominant_color'),
  colorPalette: jsonb('color_palette').$type<string[]>(),

  // AI enhancement tracking
  isAiEnhanced: boolean('is_ai_enhanced').default(false),
  aiEnhancementModel: text('ai_enhancement_model'),
  aiEnhancedAt: timestamp('ai_enhanced_at', { withTimezone: true }),

  // Status
  status: text('status').notNull().default('pending'),
  processingError: text('processing_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  artistIdIdx: index('artist_profile_images_artist_id_idx').on(table.artistId),
}));
```

#### 1.3 Image Size Configuration

```typescript
// lib/images/artwork-config.ts
export const ARTWORK_SIZES = {
  tiny: { width: 64, height: 64, quality: 80 },      // List views, blur placeholders
  small: { width: 300, height: 300, quality: 85 },   // Thumbnails, grid views
  medium: { width: 640, height: 640, quality: 85 },  // Social sharing, OG images
  large: { width: 1400, height: 1400, quality: 90 }, // Standard album art / press
  original: null, // Preserved as-is (up to 4000x4000)
} as const;

export const ARTWORK_MAX_DIMENSION = 4000;
export const ARTWORK_MIN_DIMENSION = 300;  // Below this, consider AI upscaling
export const ARTWORK_TARGET_FORMAT = 'webp';
```

#### 1.4 Storage Structure

```
Vercel Blob Structure:
└── artwork/
    ├── releases/
    │   └── {releaseId}/
    │       ├── original.{ext}
    │       ├── large.webp
    │       ├── medium.webp
    │       ├── small.webp
    │       └── tiny.webp
    │
    └── artists/
        └── {artistId}/
            └── profile/
                ├── original.{ext}
                ├── large.webp
                ├── medium.webp
                ├── small.webp
                └── tiny.webp
```

---

### Phase 2: Image Processing Pipeline

#### 2.1 Processing Service

```typescript
// lib/artwork/processor.ts
interface ImageProcessingResult {
  variants: {
    original: { url: string; width: number; height: number; size: number };
    large: { url: string; width: number; height: number; size: number };
    medium: { url: string; width: number; height: number; size: number };
    small: { url: string; width: number; height: number; size: number };
    tiny: { url: string; width: number; height: number; size: number };
  };
  metadata: {
    dominantColor: string;
    colorPalette: string[];
    originalFormat: string;
  };
}

async function processImage(
  source: Buffer | string,
  storagePrefix: string, // e.g., 'releases/{id}' or 'artists/{id}/profile'
  options?: { skipAiEnhancement?: boolean }
): Promise<ImageProcessingResult> {
  // 1. Fetch/read source image
  // 2. Extract metadata (dimensions, format)
  // 3. Extract color palette (using sharp)
  // 4. Check if AI enhancement needed (< 300px)
  // 5. Generate all size variants
  // 6. Upload to Vercel Blob
  // 7. Return URLs and metadata
}
```

#### 2.2 Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Image Processing Pipeline                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     ┌──────────────┐     ┌───────────────────┐   │
│  │  Source  │────▶│   Validate   │────▶│  Extract Metadata │   │
│  │ (Upload/ │     │  (format,    │     │  (dimensions,     │   │
│  │  Import) │     │   size)      │     │   colors)         │   │
│  └──────────┘     └──────────────┘     └─────────┬─────────┘   │
│                                                   │              │
│                          ┌────────────────────────┴───┐         │
│                          ▼                            ▼         │
│               ┌─────────────────┐          ┌─────────────────┐  │
│               │  High-Res Path  │          │  Low-Res Path   │  │
│               │   (≥300px)      │          │   (<300px)      │  │
│               └────────┬────────┘          └────────┬────────┘  │
│                        │                            │           │
│                        │                   ┌────────▼────────┐  │
│                        │                   │  AI Upscaling   │  │
│                        │                   │  (Real-ESRGAN)  │  │
│                        │                   └────────┬────────┘  │
│                        │                            │           │
│                        └────────────┬───────────────┘           │
│                                     ▼                           │
│                          ┌─────────────────┐                    │
│                          │ Generate Sizes  │                    │
│                          │ (sharp resize)  │                    │
│                          └────────┬────────┘                    │
│                                   ▼                             │
│                          ┌─────────────────┐                    │
│                          │  Upload to Blob │                    │
│                          └────────┬────────┘                    │
│                                   ▼                             │
│                          ┌─────────────────┐                    │
│                          │ Update Database │                    │
│                          └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.3 Background Processing

```typescript
// Using Inngest for async processing
export const processImageJob = inngest.createFunction(
  { id: 'process-image', retries: 3 },
  { event: 'image/process' },
  async ({ event, step }) => {
    const { entityType, entityId, sourceUrl, sourceType } = event.data;
    // entityType: 'release' | 'artist_profile'

    const result = await step.run('process', async () => {
      const prefix = entityType === 'release'
        ? `releases/${entityId}`
        : `artists/${entityId}/profile`;
      return processImage(sourceUrl, prefix);
    });

    await step.run('update-db', async () => {
      // Update appropriate table based on entityType
    });
  }
);
```

---

### Phase 3: AI Upscaling

#### 3.1 When to Upscale

| Scenario | Action |
|----------|--------|
| Original ≥ 1400px | No upscaling needed |
| 300px ≤ Original < 1400px | Optional upscaling, offer to user |
| Original < 300px | Auto-upscale to ensure minimum quality |

#### 3.2 Implementation

```typescript
// lib/artwork/ai-upscale.ts
import Replicate from 'replicate';

const replicate = new Replicate();

async function upscaleWithRealESRGAN(imageUrl: string): Promise<string> {
  const output = await replicate.run(
    "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
    {
      input: {
        image: imageUrl,
        scale: 4,
        face_enhance: false,
      }
    }
  );
  return output as string;
}
```

---

### Phase 4: Download Functionality

#### 4.1 SEO-Friendly Filename Generation

```typescript
// lib/images/seo-filename.ts

interface SeoFilenameOptions {
  artistName: string;
  title?: string;           // Release title (for album art)
  imageType: 'album-art' | 'artist-photo';
  size: string;             // 'small' | 'medium' | 'large' | 'original'
  dimensions?: { width: number; height: number };
  year?: number;            // Release year for albums
}

function generateSeoFilename(options: SeoFilenameOptions): string {
  const { artistName, title, imageType, size, dimensions, year } = options;

  const slugify = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const parts: string[] = [slugify(artistName)];

  if (title) {
    parts.push(slugify(title));
  }

  parts.push(imageType === 'album-art' ? 'album-artwork' : 'artist-photo');

  if (year) {
    parts.push(year.toString());
  }

  if (size === 'original' && dimensions) {
    parts.push(`${dimensions.width}x${dimensions.height}`);
  } else {
    const sizeMap = { tiny: '64px', small: '300px', medium: '640px', large: '1400px', original: 'full-res' };
    parts.push(sizeMap[size] || size);
  }

  return parts.join('-');
}

// Examples:
// "the-weeknd-after-hours-album-artwork-2020-1400px.webp"
// "kendrick-lamar-artist-photo-640px.webp"
```

#### 4.2 Download API Endpoints

**Album Artwork:**
```typescript
// app/api/artwork/release/[releaseId]/download/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { releaseId: string } }
) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'large';

  const artwork = await getArtworkByReleaseId(params.releaseId);
  const release = artwork.release;
  const artist = release.artist;

  const url = artwork[`${size}Url`];
  const response = await fetch(url);
  const blob = await response.blob();

  const filename = generateSeoFilename({
    artistName: artist.name,
    title: release.title,
    imageType: 'album-art',
    size,
    year: release.releaseDate?.getFullYear(),
  });

  return new Response(blob, {
    headers: {
      'Content-Type': blob.type,
      'Content-Disposition': `attachment; filename="${filename}.webp"`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
```

**Artist Profile Image:**
```typescript
// app/api/artwork/artist/[artistId]/download/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { artistId: string } }
) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'large';

  const image = await getArtistProfileImage(params.artistId);
  const artist = image.artist;

  const url = image[`${size}Url`];
  const response = await fetch(url);
  const blob = await response.blob();

  const filename = generateSeoFilename({
    artistName: artist.name,
    imageType: 'artist-photo',
    size,
  });

  return new Response(blob, {
    headers: {
      'Content-Type': blob.type,
      'Content-Disposition': `attachment; filename="${filename}.webp"`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
```

#### 4.3 Right-Click Download Component

```typescript
// components/molecules/ImageWithDownload.tsx

interface ImageWithDownloadProps {
  src: string;
  alt: string;
  downloadEndpoint: string; // e.g., '/api/artwork/release/123/download'
  artistName: string;
  availableSizes?: ('small' | 'medium' | 'large' | 'original')[];
  children?: React.ReactNode;
}

const SIZE_OPTIONS = [
  { key: 'small', label: 'Small', desc: '300×300px' },
  { key: 'medium', label: 'Medium', desc: '640×640px' },
  { key: 'large', label: 'Large', desc: '1400×1400px' },
  { key: 'original', label: 'Original', desc: 'Full resolution' },
];

function ImageWithDownload({ src, alt, downloadEndpoint, artistName, availableSizes, children }: ImageWithDownloadProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleDownload = (size: string) => {
    window.location.href = `${downloadEndpoint}?size=${size}`;
    setMenuOpen(false);
  };

  const sizes = availableSizes || ['small', 'medium', 'large', 'original'];

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        {children || <img src={src} alt={alt} />}
      </div>
      {menuOpen && (
        <ContextMenu position={menuPosition} onClose={() => setMenuOpen(false)}>
          <ContextMenuItem disabled>Download Image</ContextMenuItem>
          <ContextMenuDivider />
          {SIZE_OPTIONS.filter(s => sizes.includes(s.key)).map(({ key, label, desc }) => (
            <ContextMenuItem key={key} onClick={() => handleDownload(key)}>
              {label} ({desc})
            </ContextMenuItem>
          ))}
        </ContextMenu>
      )}
    </>
  );
}
```

#### 4.4 Shareable Link Integration

**Album Shareable Link:**
```
┌────────────────────────────────────────────────┐
│              Album Shareable Link              │
├────────────────────────────────────────────────┤
│                                                │
│         ┌────────────────────────┐             │
│         │                        │             │
│         │      Album Artwork     │ ◀── Right-click:
│         │                        │     • Small (300px)
│         │                        │     • Medium (640px)
│         │                        │     • Large (1400px)
│         │                        │     • Original
│         └────────────────────────┘             │
│                                                │
│            Album Title - Artist                │
│                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ Spotify │ │  Apple  │ │ YouTube │  ...    │
│  └─────────┘ └─────────┘ └─────────┘         │
│                                                │
└────────────────────────────────────────────────┘

Downloaded: "artist-name-album-title-album-artwork-2024-1400px.webp"
```

**Artist Profile Page:**
```
┌────────────────────────────────────────────────┐
│              Artist Profile Page               │
├────────────────────────────────────────────────┤
│                                                │
│      ┌──────────────┐                          │
│      │              │                          │
│      │   Profile    │ ◀── Right-click:         │
│      │    Photo     │     • Small (300px)      │
│      │              │     • Medium (640px)     │
│      │              │     • Large (1400px)     │
│      └──────────────┘     • Original           │
│                                                │
│      Artist Name                               │
│      Bio text here...                          │
│                                                │
│      Latest Releases                           │
│      ┌─────┐  ┌─────┐  ┌─────┐               │
│      │     │  │     │  │     │               │
│      └─────┘  └─────┘  └─────┘               │
│                                                │
└────────────────────────────────────────────────┘

Downloaded: "artist-name-artist-photo-1400px.webp"
```

---

### Phase 5: External Sync

#### 5.1 Import Sources

| Source | Album Artwork | Artist Profile |
|--------|--------------|----------------|
| Spotify | ✓ (via import) | ✓ (via enrichment) |
| Apple Music | ✓ (future) | ✓ (future) |
| User Upload | ✓ | ✓ |
| MusicBrainz/CAA | ✓ (fetch) | - |

#### 5.2 Cover Art Archive Integration

```typescript
async function fetchCoverArtArchive(mbid: string) {
  const response = await fetch(`https://coverartarchive.org/release/${mbid}`);
  if (!response.ok) return null;
  return response.json();
}
```

---

## Implementation Roadmap

### Stage 1: Foundation
- [ ] Create `release_artwork` table and migration
- [ ] Create `artist_profile_images` table and migration
- [ ] Implement image processing with Sharp (all size variants)
- [ ] Set up Vercel Blob storage structure
- [ ] Create upload API endpoints

### Stage 2: Processing & Migration
- [ ] Add color extraction (dominant color, palette)
- [ ] Create background processing queue (Inngest)
- [ ] Migrate existing `artwork_url` to new system
- [ ] Migrate existing `image_url` to new system

### Stage 3: Downloads
- [ ] Implement SEO filename generation
- [ ] Create download API endpoints
- [ ] Build right-click context menu component
- [ ] Add to shareable album links
- [ ] Add to artist profile pages

### Stage 4: AI Enhancement
- [ ] Integrate Replicate Real-ESRGAN API
- [ ] Build enhancement queue and status tracking
- [ ] Add user preferences for AI enhancement

### Stage 5: Sync (Future)
- [ ] Cover Art Archive fetch integration
- [ ] Sync status tracking

---

## Technical Considerations

### Storage Costs

| Asset | Avg Size (all variants) | Per 1000 |
|-------|------------------------|----------|
| Album Artwork | ~767 KB | ~767 MB |
| Artist Profile | ~767 KB | ~767 MB |

At Vercel Blob pricing (~$0.15/GB/month):
- 10,000 releases + 5,000 artists ≈ **$1.73/month**

### Performance
- **Lazy Processing**: Process on upload/import, not on-demand
- **CDN Caching**: Leverage Vercel Blob's edge caching
- **Blur Placeholders**: Use tiny variant (64px) for instant loading

### Security
- Rate limiting on download endpoints
- Validate image formats server-side
- Sanitize filenames in Content-Disposition headers

### Backwards Compatibility
- Keep existing `artwork_url` and `image_url` fields during transition
- Fall back to external URL if local image not available

---

## Success Metrics

- **Adoption**: % of releases/artists with self-hosted images
- **Downloads**: Number of image downloads from shareable links
- **Quality**: Average resolution (target: >90% at 1400px+)
- **AI Enhancement**: % of low-res images successfully enhanced

---

## Future Enhancements

Once this foundation is solid, we can expand to:
- **Logos** - Artist branding with transparency support
- **Press Photos** - Multiple high-res photos with captions
- **Social Banners** - Pre-formatted images for platforms
- **Full EPK** - One-sheets, media kits, press releases

This plan focuses on the core value proposition first: reliable, downloadable, SEO-friendly images for album artwork and artist profiles.

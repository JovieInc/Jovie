# Artist Asset Management Plan

> **Vision**: Transform Jovie into the central hub for artist music assets — a comprehensive Electronic Press Kit (EPK) platform where artists manage all visual assets (album art, artist photos, logos) with multi-resolution support, SEO-optimized downloads, and seamless distribution across platforms.

## Executive Summary

This plan outlines how to evolve from simple external URL storage to a robust, self-hosted asset management system that:
- Stores **album artwork AND artist images** in multiple resolutions (thumbnail → original/4K)
- Enables direct downloads from shareable links with **SEO-friendly filenames**
- Supports **multiple image types**: profile photos, press photos, logos, album art
- Syncs assets with DSPs and metadata services
- Auto-enhances low-resolution images using AI upscaling
- Evolves into a **full EPK solution** with alternate images and branding assets

---

## Current State Analysis

### What We Have

#### Album Artwork
| Aspect | Current Implementation |
|--------|----------------------|
| Storage | Single `artwork_url` field pointing to external CDN (Spotify) |
| Resolutions | Only captures largest available from Spotify |
| Processing | None for album art |
| Shareable Links | Display artwork but no download capability |
| Sync | One-way import from Spotify only |

#### Artist Images
| Aspect | Current Implementation |
|--------|----------------------|
| Storage | `image_url` on artists table (external), `profile_photos` table for avatars |
| Resolutions | Avatars processed to single 512px size; DSP enrichment stores multiple sizes in JSONB |
| Processing | Sharp processing for avatars only (512px AVIF) |
| Downloads | No download capability |
| Types | Only profile photos/avatars — no press photos, logos, or alternate images |

### Key Limitations
1. No control over image availability (relies on external CDNs)
2. No multi-resolution variants for different use cases
3. Cannot offer downloads without exposing third-party URLs
4. No metadata (dimensions, format, file size) stored for album art
5. No mechanism to push artwork to external services
6. **Artist images limited to single avatar** — no press photos or alternate shots
7. **No logo support** for artist branding
8. **No EPK-style asset organization** — images scattered across tables

---

## Proposed Architecture

### Phase 1: Multi-Resolution Storage Foundation

#### 1.1 Database Schema Enhancement

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
  colorPalette: jsonb('color_palette').$type<string[]>(), // array of hex colors

  // AI enhancement tracking
  isAiEnhanced: boolean('is_ai_enhanced').default(false),
  aiEnhancementModel: text('ai_enhancement_model'), // e.g., 'real-esrgan-4x'
  aiEnhancedAt: timestamp('ai_enhanced_at', { withTimezone: true }),

  // Status
  status: text('status').notNull().default('pending'),
    // 'pending' | 'processing' | 'ready' | 'failed'
  processingError: text('processing_error'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  releaseIdIdx: index('release_artwork_release_id_idx').on(table.releaseId),
  statusIdx: index('release_artwork_status_idx').on(table.status),
}));

// Relation to releases (1:1 for now, could be 1:many for alternate covers)
export const releaseArtworkRelations = relations(releaseArtwork, ({ one }) => ({
  release: one(discogReleases, {
    fields: [releaseArtwork.releaseId],
    references: [discogReleases.id],
  }),
}));

// New table: artist_images (supports multiple images per artist)
export const artistImages = pgTable('artist_images', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  artistId: text('artist_id')
    .notNull()
    .references(() => artists.id, { onDelete: 'cascade' }),

  // Image classification
  imageType: text('image_type').notNull(),
    // 'profile' | 'press' | 'logo' | 'logo_light' | 'logo_dark' | 'banner' | 'background'
  isPrimary: boolean('is_primary').default(false), // Primary image for this type
  displayOrder: integer('display_order').default(0), // For sorting multiple images

  // Source tracking
  sourceType: text('source_type').notNull(), // 'upload' | 'spotify' | 'apple_music' | 'ai_upscaled'
  sourceUrl: text('source_url'), // Original external URL if imported

  // Stored variants (Vercel Blob URLs)
  originalUrl: text('original_url'),
  largeUrl: text('large_url'),       // 1400px (landscape) or 1400x1400 (square)
  mediumUrl: text('medium_url'),     // 640px
  smallUrl: text('small_url'),       // 300px
  tinyUrl: text('tiny_url'),         // 64px

  // Metadata
  originalWidth: integer('original_width'),
  originalHeight: integer('original_height'),
  aspectRatio: real('aspect_ratio'), // width/height for layout calculations
  originalFormat: text('original_format'),
  originalFileSize: integer('original_file_size'),
  dominantColor: text('dominant_color'),
  colorPalette: jsonb('color_palette').$type<string[]>(),

  // For logos: support transparent backgrounds
  hasTransparency: boolean('has_transparency').default(false),

  // AI enhancement tracking
  isAiEnhanced: boolean('is_ai_enhanced').default(false),
  aiEnhancementModel: text('ai_enhancement_model'),
  aiEnhancedAt: timestamp('ai_enhanced_at', { withTimezone: true }),

  // Optional metadata for press/EPK
  caption: text('caption'),           // "Live at Madison Square Garden 2024"
  photographer: text('photographer'), // Credit line
  photographerUrl: text('photographer_url'),

  // Status
  status: text('status').notNull().default('pending'),
  processingError: text('processing_error'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  artistIdIdx: index('artist_images_artist_id_idx').on(table.artistId),
  typeIdx: index('artist_images_type_idx').on(table.imageType),
  primaryIdx: index('artist_images_primary_idx').on(table.artistId, table.imageType, table.isPrimary),
}));

export const artistImagesRelations = relations(artistImages, ({ one }) => ({
  artist: one(artists, {
    fields: [artistImages.artistId],
    references: [artists.id],
  }),
}));
```

#### Artist Image Types

| Type | Description | Typical Aspect | Use Cases |
|------|-------------|----------------|-----------|
| `profile` | Primary artist headshot | 1:1 (square) | Avatars, profile pages, playlists |
| `press` | High-quality press photos | Various | Press kits, blog features, interviews |
| `logo` | Artist wordmark/logo | Various | Merch, marketing, official branding |
| `logo_light` | Logo for dark backgrounds | Various | Dark mode, overlays |
| `logo_dark` | Logo for light backgrounds | Various | Light mode, print |
| `banner` | Wide promotional image | 16:9 or 3:1 | Headers, social banners |
| `background` | Full-bleed background | Various | Landing pages, visualizers |

#### 1.2 Image Size Configuration

```typescript
// lib/images/artwork-config.ts
export const ARTWORK_SIZES = {
  tiny: { width: 64, height: 64, quality: 80 },      // List views, blur placeholders
  small: { width: 300, height: 300, quality: 85 },   // Thumbnails, grid views
  medium: { width: 640, height: 640, quality: 85 },  // Social sharing, OG images
  large: { width: 1400, height: 1400, quality: 90 }, // Standard album art
  original: null, // Preserved as-is (up to 4000x4000)
} as const;

export const ARTWORK_MAX_DIMENSION = 4000; // Max we'll store
export const ARTWORK_MIN_DIMENSION = 300;  // Below this, consider AI upscaling
export const ARTWORK_TARGET_FORMAT = 'webp'; // Balance of quality/size
export const ARTWORK_ORIGINAL_FORMATS = ['jpeg', 'png', 'webp']; // Keep original format for original size
```

#### 1.3 Storage Strategy

```
Vercel Blob Structure:
└── artwork/
    ├── releases/
    │   └── {releaseId}/
    │       ├── original.{ext}    # Original format preserved
    │       ├── large.webp        # 1400x1400
    │       ├── medium.webp       # 640x640
    │       ├── small.webp        # 300x300
    │       └── tiny.webp         # 64x64
    │
    └── artists/
        └── {artistId}/
            ├── profile/
            │   └── {imageId}/
            │       ├── original.{ext}
            │       ├── large.webp
            │       ├── medium.webp
            │       ├── small.webp
            │       └── tiny.webp
            ├── press/
            │   └── {imageId}/
            │       └── ... (same structure)
            ├── logo/
            │   └── {imageId}/
            │       ├── original.png   # Preserve transparency
            │       ├── large.png
            │       └── medium.png
            └── banner/
                └── {imageId}/
                    └── ... (same structure)
```

---

### Phase 2: Image Processing Pipeline

#### 2.1 Processing Service

```typescript
// lib/artwork/processor.ts
interface ArtworkProcessingResult {
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

async function processArtwork(
  source: Buffer | string, // Buffer for uploads, URL for imports
  releaseId: string,
  options?: { skipAiEnhancement?: boolean }
): Promise<ArtworkProcessingResult> {
  // 1. Fetch/read source image
  // 2. Extract metadata (dimensions, format)
  // 3. Extract color palette (using sharp or color-thief)
  // 4. Check if AI enhancement needed (< 300px)
  // 5. Generate all size variants
  // 6. Upload to Vercel Blob
  // 7. Return URLs and metadata
}
```

#### 2.2 Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Artwork Processing Pipeline                   │
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
│                          │  (all variants) │                    │
│                          └────────┬────────┘                    │
│                                   ▼                             │
│                          ┌─────────────────┐                    │
│                          │ Update Database │                    │
│                          │  (URLs, meta)   │                    │
│                          └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.3 Background Processing Queue

For imports and AI upscaling, use a job queue to avoid blocking:

```typescript
// Using Inngest or similar
export const processArtworkJob = inngest.createFunction(
  { id: 'process-artwork', retries: 3 },
  { event: 'artwork/process' },
  async ({ event, step }) => {
    const { releaseId, sourceUrl, sourceType } = event.data;

    await step.run('process', async () => {
      return processArtwork(sourceUrl, releaseId);
    });

    await step.run('update-db', async () => {
      // Update release_artwork record
    });
  }
);
```

---

### Phase 3: AI Upscaling Integration

#### 3.1 When to Upscale

| Scenario | Action |
|----------|--------|
| Original ≥ 1400px | No upscaling needed |
| 300px ≤ Original < 1400px | Optional upscaling, offer to user |
| Original < 300px | Auto-upscale to ensure minimum quality |

#### 3.2 AI Upscaling Options

**Option A: Self-Hosted (Recommended for Control)**
- Run Real-ESRGAN model via Replicate API
- Cost: ~$0.001-0.01 per image
- Pros: Full control, consistent quality
- Cons: API costs, latency

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
        scale: 4, // 4x upscale
        face_enhance: false,
      }
    }
  );
  return output as string;
}
```

**Option B: Third-Party Service**
- Services like imgix, Cloudinary have built-in AI upscaling
- Pros: Simpler integration, no separate API
- Cons: Vendor lock-in, potentially higher costs at scale

#### 3.3 User Control

```typescript
// Allow artists to control AI enhancement
interface ArtworkPreferences {
  autoEnhanceLowRes: boolean;       // Auto-upscale images < 300px
  preferAiEnhancement: boolean;     // Prefer AI-enhanced versions when available
  allowAiEnhancement: boolean;      // Allow AI enhancement at all
}
```

---

### Phase 4: Download Functionality for Shareable Links

#### 4.1 SEO-Friendly Filename Generation

All downloads use descriptive, SEO-optimized filenames that are useful for:
- Blog posts and articles (proper attribution in filename)
- Search engine indexing of shared images
- File organization for journalists and bloggers
- Professional appearance in press materials

```typescript
// lib/images/seo-filename.ts

interface SeoFilenameOptions {
  artistName: string;
  title?: string;           // Release title or image caption
  imageType: string;        // 'album-art' | 'press-photo' | 'logo' | 'profile'
  size: string;             // 'small' | 'medium' | 'large' | 'original'
  dimensions?: { width: number; height: number };
  year?: number;            // Release year for albums
}

function generateSeoFilename(options: SeoFilenameOptions): string {
  const {
    artistName,
    title,
    imageType,
    size,
    dimensions,
    year,
  } = options;

  // Slugify helper: "The Weeknd" → "the-weeknd"
  const slugify = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const parts: string[] = [];

  // Artist name always first
  parts.push(slugify(artistName));

  // Title (album name or caption)
  if (title) {
    parts.push(slugify(title));
  }

  // Image type descriptor
  const typeMap: Record<string, string> = {
    'album-art': 'album-artwork',
    'press': 'press-photo',
    'profile': 'artist-photo',
    'logo': 'logo',
    'logo_light': 'logo-light',
    'logo_dark': 'logo-dark',
    'banner': 'banner',
  };
  parts.push(typeMap[imageType] || imageType);

  // Year for albums
  if (year) {
    parts.push(year.toString());
  }

  // Resolution descriptor
  if (size === 'original' && dimensions) {
    parts.push(`${dimensions.width}x${dimensions.height}`);
  } else {
    const sizeMap: Record<string, string> = {
      tiny: '64px',
      small: '300px',
      medium: '640px',
      large: '1400px',
      original: 'full-res',
    };
    parts.push(sizeMap[size] || size);
  }

  return parts.join('-');
}

// Examples:
// Album art:   "the-weeknd-after-hours-album-artwork-2020-1400px.webp"
// Press photo: "taylor-swift-eras-tour-press-photo-1400px.webp"
// Logo:        "drake-ovo-logo-full-res.png"
// Profile:     "kendrick-lamar-artist-photo-640px.webp"
```

#### 4.2 Download API Endpoints

**Album Artwork Download:**
```typescript
// app/api/artwork/release/[releaseId]/download/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { releaseId: string } }
) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'large';
  const format = searchParams.get('format'); // webp|png|jpeg

  const artwork = await getArtworkByReleaseId(params.releaseId);
  const release = artwork.release;
  const artist = release.artist;

  const url = artwork[`${size}Url`];
  const response = await fetch(url);
  const blob = await response.blob();

  // Generate SEO filename
  const filename = generateSeoFilename({
    artistName: artist.name,
    title: release.title,
    imageType: 'album-art',
    size,
    dimensions: size === 'original'
      ? { width: artwork.originalWidth, height: artwork.originalHeight }
      : undefined,
    year: release.releaseDate?.getFullYear(),
  });

  const ext = format || getExtFromMimeType(blob.type);

  return new Response(blob, {
    headers: {
      'Content-Type': format ? `image/${format}` : blob.type,
      'Content-Disposition': `attachment; filename="${filename}.${ext}"`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
```

**Artist Image Download:**
```typescript
// app/api/artwork/artist/[imageId]/download/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { imageId: string } }
) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'large';
  const format = searchParams.get('format');

  const image = await getArtistImageById(params.imageId);
  const artist = image.artist;

  const url = image[`${size}Url`];
  const response = await fetch(url);
  const blob = await response.blob();

  // Generate SEO filename
  const filename = generateSeoFilename({
    artistName: artist.name,
    title: image.caption, // e.g., "Live at Coachella 2024"
    imageType: image.imageType,
    size,
    dimensions: size === 'original'
      ? { width: image.originalWidth, height: image.originalHeight }
      : undefined,
  });

  // For logos, preserve PNG if it has transparency
  const ext = (image.hasTransparency && !format) ? 'png' : (format || 'webp');

  return new Response(blob, {
    headers: {
      'Content-Type': `image/${ext}`,
      'Content-Disposition': `attachment; filename="${filename}.${ext}"`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
```

#### 4.3 Download UI Component

```typescript
// components/molecules/ImageDownloadMenu.tsx
// Unified component for both album artwork and artist images

interface ImageDownloadMenuProps {
  // For album artwork
  releaseId?: string;
  releaseTitle?: string;

  // For artist images
  artistImageId?: string;
  artistName: string;

  // Common
  imageType: 'album-art' | 'press' | 'profile' | 'logo' | 'banner';
  availableSizes: {
    tiny?: boolean;
    small?: boolean;
    medium: boolean;
    large: boolean;
    original: boolean;
  };
  originalDimensions?: { width: number; height: number };
  hasTransparency?: boolean; // For logos, offer PNG option
}

const SIZE_LABELS = {
  tiny: { label: 'Tiny', desc: '64×64px', useCase: 'Favicons, tiny thumbnails' },
  small: { label: 'Small', desc: '300×300px', useCase: 'Thumbnails, previews' },
  medium: { label: 'Medium', desc: '640×640px', useCase: 'Social media, blogs' },
  large: { label: 'Large', desc: '1400×1400px', useCase: 'Press kits, high-quality sharing' },
  original: { label: 'Original', desc: 'Full resolution', useCase: 'Print, maximum quality' },
};

// Download filename preview shown in menu:
// "taylor-swift-midnights-album-artwork-2022-1400px.webp"
```

#### 4.4 Right-Click Context Menu

```typescript
// components/molecules/ImageWithDownload.tsx
// Wrapper component that adds right-click download menu to any image

interface ImageWithDownloadProps {
  src: string;
  alt: string;
  downloadConfig: ImageDownloadMenuProps;
  children?: React.ReactNode;
}

function ImageWithDownload({ src, alt, downloadConfig, children }: ImageWithDownloadProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        {children || <img src={src} alt={alt} />}
      </div>
      {menuOpen && (
        <ContextMenu position={menuPosition} onClose={() => setMenuOpen(false)}>
          <ContextMenuItem disabled>
            Download {downloadConfig.artistName} Image
          </ContextMenuItem>
          <ContextMenuDivider />
          {Object.entries(SIZE_LABELS).map(([size, { label, desc }]) => (
            downloadConfig.availableSizes[size] && (
              <ContextMenuItem
                key={size}
                onClick={() => downloadImage(downloadConfig, size)}
              >
                {label} ({desc})
              </ContextMenuItem>
            )
          ))}
          {downloadConfig.hasTransparency && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem onClick={() => downloadImage(downloadConfig, 'original', 'png')}>
                Original (PNG with transparency)
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
    </>
  );
}
```

#### 4.5 Shareable Link Integration

**Album Shareable Link:**
```
┌────────────────────────────────────────────────┐
│              Album Shareable Link              │
├────────────────────────────────────────────────┤
│                                                │
│         ┌────────────────────────┐             │
│         │                        │             │
│         │      Album Artwork     │ ◀── Right-click menu:
│         │                        │     • Download Small (300px)
│         │                        │     • Download Medium (640px)
│         │                        │     • Download Large (1400px)
│         │                        │     • Download Original
│         └────────────────────────┘             │
│                                                │
│            Album Title - Artist                │
│                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ Spotify │ │  Apple  │ │ YouTube │  ...    │
│  └─────────┘ └─────────┘ └─────────┘         │
│                                                │
│         ┌────────────────────────┐             │
│         │  📥 Download Artwork   │ ◀── Button opens size picker
│         └────────────────────────┘             │
│                                                │
└────────────────────────────────────────────────┘

Downloaded filename: "artist-name-album-title-album-artwork-2024-1400px.webp"
```

**Artist Profile / EPK Page:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Artist Profile Page                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │              │                                           │
│  │   Profile    │ ◀── Right-click: Download artist photo    │
│  │    Photo     │     "artist-name-artist-photo-1400px.webp"│
│  │              │                                           │
│  └──────────────┘                                           │
│                                                              │
│  Artist Name                                                 │
│  Bio text here...                                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Press Photos                        │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐               │    │
│  │  │     │  │     │  │     │  │     │  ◀── Each has │    │
│  │  │     │  │     │  │     │  │     │     right-click│    │
│  │  └─────┘  └─────┘  └─────┘  └─────┘     download   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                     Logos                            │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  ┌───────────┐    ┌───────────┐                    │    │
│  │  │   LOGO    │    │   LOGO    │  ◀── Download as   │    │
│  │  │  (Light)  │    │  (Dark)   │     PNG w/ alpha   │    │
│  │  └───────────┘    └───────────┘                    │    │
│  │                                                      │    │
│  │  ┌────────────────────────────┐                    │    │
│  │  │  📥 Download All Logos     │                    │    │
│  │  └────────────────────────────┘                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Latest Releases                                             │
│  ┌─────┐  ┌─────┐  ┌─────┐                                  │
│  │     │  │     │  │     │                                  │
│  └─────┘  └─────┘  └─────┘                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 5: External Sync & Distribution

#### 5.1 Sync Architecture

```
                    ┌─────────────────┐
                    │     Jovie       │
                    │  (Central Hub)  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     Import      │ │     Export      │ │   Enrichment    │
│   (Pull Data)   │ │   (Push Data)   │ │  (Fetch Extra)  │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ • Spotify       │ │ • MusicBrainz   │ │ • Discogs       │
│ • Apple Music   │ │ • Discogs       │ │ • Fanart.tv     │
│ • User Upload   │ │ • Wikipedia     │ │ • Last.fm       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 5.2 MusicBrainz Cover Art Archive Integration

MusicBrainz uses the Cover Art Archive for artwork. We can:

1. **Fetch existing artwork** (if we have MBID):
```typescript
async function fetchCoverArtArchive(mbid: string) {
  const response = await fetch(
    `https://coverartarchive.org/release/${mbid}`
  );
  return response.json();
}
```

2. **Submit new artwork** (requires authentication):
```typescript
// This requires MusicBrainz editor account & CAA permissions
// Artists would need to authorize this
async function submitToCoverArtArchive(
  mbid: string,
  imageBuffer: Buffer,
  imageType: 'front' | 'back' | 'booklet'
) {
  // Implementation requires MusicBrainz OAuth flow
}
```

#### 5.3 Fanart.tv Integration

For additional high-quality artwork (backgrounds, logos, etc.):

```typescript
async function fetchFanartTv(mbid: string) {
  const response = await fetch(
    `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${FANART_API_KEY}`
  );
  return response.json();
}
```

#### 5.4 Sync Status Tracking

```typescript
// New table for tracking sync status
export const artworkSyncStatus = pgTable('artwork_sync_status', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  releaseArtworkId: text('release_artwork_id')
    .notNull()
    .references(() => releaseArtwork.id, { onDelete: 'cascade' }),

  service: text('service').notNull(), // 'musicbrainz' | 'discogs' | 'fanart_tv'
  direction: text('direction').notNull(), // 'import' | 'export'
  status: text('status').notNull(), // 'pending' | 'synced' | 'failed' | 'rejected'

  externalId: text('external_id'), // ID on external service
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

---

### Phase 6: Implementation Roadmap

#### Stage 1: Foundation (Core Infrastructure)
- [ ] Create `release_artwork` table and migration
- [ ] Create `artist_images` table and migration
- [ ] Implement basic artwork processing with Sharp
- [ ] Set up Vercel Blob storage structure for both releases and artists
- [ ] Create artwork upload API endpoints (release + artist)
- [ ] Migrate existing `artwork_url` and `image_url` references to new system

#### Stage 2: Multi-Resolution Support
- [ ] Implement size variant generation for both asset types
- [ ] Add color extraction (dominant color, palette)
- [ ] Create background processing queue (Inngest)
- [ ] Build artwork management UI in dashboard
- [ ] Build artist image management UI (upload multiple photos)

#### Stage 3: Download Functionality
- [ ] Implement SEO filename generation utility
- [ ] Create download API endpoint for releases with SEO filenames
- [ ] Create download API endpoint for artist images with SEO filenames
- [ ] Build right-click context menu component (`ImageWithDownload`)
- [ ] Add download menu to shareable album links
- [ ] Add download menu to artist profile pages
- [ ] Add download analytics tracking

#### Stage 4: AI Enhancement
- [ ] Integrate Replicate Real-ESRGAN API
- [ ] Build AI enhancement queue and status tracking
- [ ] Add user preferences for AI enhancement
- [ ] Create before/after comparison UI
- [ ] Apply to both album artwork and artist images

#### Stage 5: Extended Asset Types (EPK Foundation)
- [ ] Add logo upload support (with transparency detection)
- [ ] Add press photo gallery with captions/credits
- [ ] Build logo variant management (light/dark)
- [ ] Create EPK preview page (`/artist/epk`)
- [ ] Implement "Download All" ZIP functionality

#### Stage 6: External Sync
- [ ] Implement Cover Art Archive fetch
- [ ] Add Fanart.tv integration for enrichment (artist images + logos)
- [ ] Build sync status dashboard
- [ ] (Future) Implement MusicBrainz submission flow

---

## Technical Considerations

### Performance
- **Lazy Processing**: Generate variants on-demand, not all at once
- **CDN Caching**: Leverage Vercel Blob's edge caching
- **Blur Placeholders**: Use tiny variant for instant loading
- **Progressive Loading**: Load tiny → small → full resolution

### Storage Costs

**Per Release (Album Artwork):**
| Size | Avg File Size | Per 1000 Releases |
|------|--------------|-------------------|
| Tiny (64px) | ~2 KB | 2 MB |
| Small (300px) | ~15 KB | 15 MB |
| Medium (640px) | ~50 KB | 50 MB |
| Large (1400px) | ~200 KB | 200 MB |
| Original | ~500 KB | 500 MB |
| **Total** | ~767 KB | **~767 MB** |

**Per Artist (Images - assuming 5 images avg):**
| Asset Type | Avg File Size | Per 1000 Artists |
|------------|--------------|------------------|
| Profile (all sizes) | ~767 KB | 767 MB |
| Press Photos (×3) | ~2.3 MB | 2.3 GB |
| Logos (×2, PNG) | ~200 KB | 200 MB |
| **Total** | ~3.3 MB | **~3.3 GB** |

**Combined Estimate:**
| Scale | Releases | Artists | Monthly Storage Cost |
|-------|----------|---------|---------------------|
| Small | 1,000 | 500 | ~$0.40 |
| Medium | 10,000 | 2,000 | ~$2.15 |
| Large | 100,000 | 20,000 | ~$21.50 |

At Vercel Blob pricing (~$0.15/GB/month)

### Security
- Signed URLs for downloads (optional, prevents hotlinking)
- Rate limiting on download endpoints
- Validate image formats server-side (prevent SVG injection)
- Sanitize filenames in Content-Disposition headers

### Backwards Compatibility
- Keep `artwork_url` field during transition
- Fall back to external URL if local artwork not available
- Gradual migration via background jobs

---

## Future Enhancements: Full EPK Vision

### Phase 1: Extended Asset Types (Near-term)
1. **Alternate Album Covers**: Support multiple artwork versions per release (deluxe editions, regional variants)
2. **Press Photo Gallery**: Multiple high-res press photos with captions and credits
3. **Logo Variants**: Light/dark mode logos, icon versions, full wordmarks
4. **Social Banners**: Pre-formatted images for Twitter, Instagram, YouTube, etc.

### Phase 2: EPK Features (Medium-term)
5. **One-Sheet Generator**: Auto-generate professional one-sheets combining:
   - Artist photo + logo
   - Bio (short/long versions)
   - Key stats (streams, followers)
   - Notable press quotes
   - Contact info
6. **Press Release Templates**: Auto-populated release announcements
7. **Bio Management**: Multiple bio lengths (50 word, 150 word, full)
8. **Fact Sheet**: Auto-generated artist facts from metadata
9. **Media Kit ZIP Download**: Bundle all assets in one download

### Phase 3: Advanced Features (Long-term)
10. **Animated Artwork**: Support for animated album covers (GIF, MP4, Lottie)
11. **AR/3D Assets**: Store 3D models for immersive experiences
12. **Watermarking**: Optional watermarks for preview/unauthorized versions
13. **Rights Management**: Track artwork rights, credits, usage licenses
14. **Bulk Operations**: Batch process entire discography
15. **AI-Powered Features**:
    - Auto-generate social crops from press photos
    - Remove backgrounds from photos for overlays
    - Generate color palettes for marketing materials
    - Suggest optimal image crops for different platforms

### EPK Page Structure (Future)
```
/artist-name/epk (or /artist-name/press)
├── Overview (bio, stats, contact)
├── Photos (profile, press gallery)
├── Logos & Branding
├── Music (releases with artwork)
├── Videos (embedded + downloadable)
├── Press Coverage (linked articles)
├── Downloads (ZIP bundles)
└── Contact / Booking
```

---

## Dependencies & Services

| Service | Purpose | Cost Estimate |
|---------|---------|--------------|
| Vercel Blob | Image storage | ~$0.15/GB/month |
| Replicate | AI upscaling | ~$0.005/image |
| Sharp | Image processing | Free (npm package) |
| color-thief | Color extraction | Free (npm package) |
| Inngest | Background jobs | Free tier available |

---

## Success Metrics

### Album Artwork
- **Adoption**: % of releases with self-hosted artwork
- **Downloads**: Number of artwork downloads from shareable links
- **Quality**: Average artwork resolution (target: >90% at 1400px+)
- **Sync Coverage**: % of releases synced with external services
- **AI Enhancement**: % of low-res artwork successfully enhanced

### Artist Images
- **Profile Completion**: % of artists with uploaded profile photo
- **Press Photo Adoption**: % of artists with 2+ press photos
- **Logo Adoption**: % of artists with uploaded logo
- **Download Volume**: Artist image downloads per month
- **EPK Engagement**: Views/downloads on EPK pages

### Overall
- **Asset Completeness Score**: Combined metric of profile + artwork + logo
- **Download Conversion**: % of shareable link visitors who download assets
- **Time Saved**: Estimated time saved vs. manual asset management

---

## Conclusion

This plan transforms Jovie from a simple link-in-bio tool to a comprehensive **Artist Asset Management Platform** and the foundation for a full **Electronic Press Kit (EPK)** solution.

By owning the asset pipeline for both album artwork and artist images, we can:

1. **Provide reliable downloads** - No dependency on external CDNs; SEO-friendly filenames for professional use
2. **Ensure quality** - AI upscaling for low-res sources across all asset types
3. **Enable distribution** - Sync with metadata services; push high-quality assets everywhere
4. **Support artist workflows** - One-stop shop for all visual assets (photos, logos, artwork)
5. **Empower press/media** - Right-click downloads with professional filenames make it easy for bloggers, journalists, and playlist curators to use artist assets
6. **Build toward full EPK** - Foundation for press releases, one-sheets, and media kit generation

### Key Differentiator

Most link-in-bio tools just store URLs. Jovie becomes the **source of truth** for artist visual identity:
- Artists upload once, distribute everywhere
- Professional-grade asset management without expensive tools
- SEO-optimized downloads that promote the artist's name
- AI-enhanced imagery even for artists without high-res originals

The modular approach allows incremental implementation while delivering value at each stage, with a clear path from basic asset storage to a complete EPK platform.

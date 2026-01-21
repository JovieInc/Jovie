# Album Art Asset Management Plan

> **Vision**: Transform Jovie into the central hub for artist music assets, starting with comprehensive album artwork management that enables artists to share, distribute, and sync their visual assets across platforms.

## Executive Summary

This plan outlines how to evolve from simple external URL storage to a robust, self-hosted album art management system that:
- Stores artwork in multiple resolutions (thumbnail → original/4K)
- Enables direct downloads from shareable links
- Syncs artwork with DSPs and metadata services
- Auto-enhances low-resolution artwork using AI upscaling

---

## Current State Analysis

### What We Have
| Aspect | Current Implementation |
|--------|----------------------|
| Storage | Single `artwork_url` field pointing to external CDN (Spotify) |
| Resolutions | Only captures largest available from Spotify |
| Processing | None for album art (only avatars use Sharp) |
| Shareable Links | Display artwork but no download capability |
| Sync | One-way import from Spotify only |

### Key Limitations
1. No control over image availability (relies on external CDNs)
2. No multi-resolution variants for different use cases
3. Cannot offer downloads without exposing third-party URLs
4. No metadata (dimensions, format, file size) stored
5. No mechanism to push artwork to external services

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
```

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
    └── releases/
        └── {releaseId}/
            ├── original.{ext}    # Original format preserved
            ├── large.webp        # 1400x1400
            ├── medium.webp       # 640x640
            ├── small.webp        # 300x300
            └── tiny.webp         # 64x64
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

#### 4.1 Download API Endpoint

```typescript
// app/api/artwork/[releaseId]/download/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { releaseId: string } }
) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'large'; // tiny|small|medium|large|original
  const format = searchParams.get('format'); // webp|png|jpeg (optional, for conversion)

  // 1. Fetch artwork record
  const artwork = await getArtworkByReleaseId(params.releaseId);

  // 2. Get appropriate URL based on size
  const url = artwork[`${size}Url`];

  // 3. Stream file with appropriate headers
  const response = await fetch(url);
  const blob = await response.blob();

  // 4. Optional: Convert format if requested

  return new Response(blob, {
    headers: {
      'Content-Type': format ? `image/${format}` : response.headers.get('Content-Type'),
      'Content-Disposition': `attachment; filename="${artwork.release.title}-${size}.${ext}"`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
```

#### 4.2 Download UI Component

```typescript
// components/molecules/ArtworkDownloadMenu.tsx
interface ArtworkDownloadMenuProps {
  releaseId: string;
  releaseTitle: string;
  availableSizes: {
    tiny?: boolean;
    small?: boolean;
    medium: boolean;
    large: boolean;
    original: boolean;
  };
  originalDimensions?: { width: number; height: number };
}

const SIZE_LABELS = {
  tiny: { label: 'Tiny', desc: '64×64px', useCase: 'Favicons, tiny thumbnails' },
  small: { label: 'Small', desc: '300×300px', useCase: 'Thumbnails, previews' },
  medium: { label: 'Medium', desc: '640×640px', useCase: 'Social media, blogs' },
  large: { label: 'Large', desc: '1400×1400px', useCase: 'Press kits, high-quality sharing' },
  original: { label: 'Original', desc: 'Full resolution', useCase: 'Print, maximum quality' },
};
```

#### 4.3 Shareable Link Integration

Add download capability to the existing shareable link pages:

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
- [ ] Implement basic artwork processing with Sharp
- [ ] Set up Vercel Blob storage structure
- [ ] Create artwork upload API endpoint
- [ ] Migrate existing `artwork_url` references to new system

#### Stage 2: Multi-Resolution Support
- [ ] Implement size variant generation
- [ ] Add color extraction (dominant color, palette)
- [ ] Create background processing queue (Inngest)
- [ ] Build artwork management UI in dashboard

#### Stage 3: Download Functionality
- [ ] Create download API endpoint with size selection
- [ ] Add download button/menu to shareable links
- [ ] Implement right-click context menu on artwork
- [ ] Add download analytics tracking

#### Stage 4: AI Enhancement
- [ ] Integrate Replicate Real-ESRGAN API
- [ ] Build AI enhancement queue and status tracking
- [ ] Add user preferences for AI enhancement
- [ ] Create before/after comparison UI

#### Stage 5: External Sync
- [ ] Implement Cover Art Archive fetch
- [ ] Add Fanart.tv integration for enrichment
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
| Size | Avg File Size | Per 1000 Releases |
|------|--------------|-------------------|
| Tiny (64px) | ~2 KB | 2 MB |
| Small (300px) | ~15 KB | 15 MB |
| Medium (640px) | ~50 KB | 50 MB |
| Large (1400px) | ~200 KB | 200 MB |
| Original | ~500 KB | 500 MB |
| **Total** | ~767 KB | **~767 MB** |

At Vercel Blob pricing (~$0.15/GB/month), 10,000 releases = ~$1.15/month

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

## Future Enhancements

1. **Media Kit Generation**: Auto-generate press kits with artwork, bio, links
2. **Alternate Covers**: Support multiple artwork versions per release
3. **Animated Artwork**: Support for animated album covers (GIF, video)
4. **AR/3D Assets**: Store 3D models for immersive experiences
5. **Social Auto-Formatting**: Generate platform-specific sizes (IG story, Twitter header)
6. **Watermarking**: Optional watermarks for preview versions
7. **Rights Management**: Track artwork rights/credits
8. **Bulk Operations**: Batch process entire discography

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

- **Adoption**: % of releases with self-hosted artwork
- **Downloads**: Number of artwork downloads from shareable links
- **Quality**: Average artwork resolution (target: >90% at 1400px+)
- **Sync Coverage**: % of releases synced with external services
- **AI Enhancement**: % of low-res artwork successfully enhanced

---

## Conclusion

This plan transforms Jovie's artwork handling from simple URL storage to a comprehensive asset management system. By owning the artwork pipeline, we can:

1. **Provide reliable downloads** - No dependency on external CDNs
2. **Ensure quality** - AI upscaling for low-res sources
3. **Enable distribution** - Sync with metadata services
4. **Support artist workflows** - One-stop shop for artwork needs

The modular approach allows incremental implementation while delivering value at each stage.

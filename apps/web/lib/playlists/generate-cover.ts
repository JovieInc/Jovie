/**
 * Playlist Cover Art Generation
 *
 * Creates cover art using Sharp (already installed) + Unsplash stock photos.
 * Bold white text overlay on genre-appropriate background.
 *
 * Output:
 * - Full-res buffer for Jovie playlist page
 * - Compressed base64 JPEG (<256KB) for Spotify API upload
 *
 * Fallback: branded gradient when Unsplash is unavailable.
 */

import 'server-only';
import sharp from 'sharp';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Constants
// ============================================================================

const COVER_SIZE = 1400;
const SPOTIFY_MAX_BASE64_BYTES = 256 * 1024; // 256KB
const UNSPLASH_API = 'https://api.unsplash.com';

// ============================================================================
// Types
// ============================================================================

export interface CoverArtResult {
  /** Full-resolution JPEG buffer for Jovie page */
  fullResBuffer: Buffer;
  /** Base64-encoded JPEG string for Spotify upload (<256KB) */
  spotifyBase64: string;
}

// ============================================================================
// Unsplash
// ============================================================================

async function fetchUnsplashPhoto(query: string): Promise<Buffer | null> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) {
    captureError('[Cover Art] UNSPLASH_ACCESS_KEY not configured', null);
    return null;
  }

  try {
    const params = new URLSearchParams({
      query,
      orientation: 'squarish',
      per_page: '1',
    });

    const response = await fetch(
      `${UNSPLASH_API}/search/photos?${params.toString()}`,
      {
        headers: { Authorization: `Client-ID ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      captureError('[Cover Art] Unsplash search failed', null, {
        status: response.status,
        query,
      });
      return null;
    }

    const data: {
      results: Array<{ urls: { regular: string } }>;
    } = await response.json();

    const imageUrl = data.results[0]?.urls?.regular;
    if (!imageUrl) return null;

    // Download the image
    const imgResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!imgResponse.ok) return null;

    return Buffer.from(await imgResponse.arrayBuffer());
  } catch (error) {
    captureError('[Cover Art] Unsplash fetch failed', error, { query });
    return null;
  }
}

// ============================================================================
// Gradient Fallback
// ============================================================================

/**
 * Create a branded gradient background when Unsplash is unavailable.
 * Dark gradient matching Jovie's design system.
 */
async function createGradientBackground(): Promise<Buffer> {
  // eslint-disable-next-line @jovie/icon-usage -- SVG string for Sharp image processing, not a React component
  const svg = `<svg width="${COVER_SIZE}" height="${COVER_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="50%" style="stop-color:#16213e"/>
        <stop offset="100%" style="stop-color:#0f3460"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
  </svg>`;

  return sharp(Buffer.from(svg))
    .resize(COVER_SIZE, COVER_SIZE)
    .jpeg()
    .toBuffer();
}

// ============================================================================
// Text Overlay
// ============================================================================

/**
 * Create an SVG text overlay for compositing onto the background.
 * Bold white Inter text, positioned in the lower portion of the image
 * over a darkened area for legibility.
 */
function createTextOverlay(text: string): Buffer {
  // Escape XML entities
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Calculate font size based on text length
  const fontSize = text.length <= 10 ? 180 : text.length <= 20 ? 140 : 100;

  // eslint-disable-next-line @jovie/icon-usage -- SVG string for Sharp image processing, not a React component
  const svg = `<svg width="${COVER_SIZE}" height="${COVER_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <!-- Darken bottom half for text legibility -->
    <defs>
      <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:black;stop-opacity:0"/>
        <stop offset="50%" style="stop-color:black;stop-opacity:0"/>
        <stop offset="80%" style="stop-color:black;stop-opacity:0.6"/>
        <stop offset="100%" style="stop-color:black;stop-opacity:0.8"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#overlay)"/>
    <!-- Text -->
    <text
      x="50%"
      y="82%"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Inter, Helvetica, Arial, sans-serif"
      font-weight="900"
      font-size="${fontSize}px"
      fill="white"
      letter-spacing="-2px"
    >${escaped}</text>
    <!-- Jovie attribution -->
    <text
      x="50%"
      y="94%"
      text-anchor="middle"
      font-family="Inter, Helvetica, Arial, sans-serif"
      font-weight="500"
      font-size="36px"
      fill="rgba(255,255,255,0.6)"
    >Curated by Jovie</text>
  </svg>`;

  return Buffer.from(svg);
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate playlist cover art.
 *
 * Pipeline:
 * 1. Fetch genre-appropriate stock photo from Unsplash (or gradient fallback)
 * 2. Resize to 1400x1400
 * 3. Apply slight blur for text legibility
 * 4. Composite bold white text overlay
 * 5. Export full-res + compressed for Spotify (<256KB base64)
 */
export async function generateCoverArt(options: {
  unsplashQuery: string;
  coverText: string;
}): Promise<CoverArtResult> {
  const { unsplashQuery, coverText } = options;

  // Step 1: Get background image
  let backgroundBuffer = await fetchUnsplashPhoto(unsplashQuery);

  if (!backgroundBuffer) {
    backgroundBuffer = await createGradientBackground();
  }

  // Step 2: Process background (resize, slight blur)
  const processed = await sharp(backgroundBuffer)
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
    .blur(2) // Slight blur makes text pop
    .jpeg({ quality: 90 })
    .toBuffer();

  // Step 3: Create text overlay
  const textOverlay = createTextOverlay(coverText);

  // Step 4: Composite text onto background
  const fullRes = await sharp(processed)
    .composite([{ input: textOverlay, blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer();

  // Step 5: Compress for Spotify (must be <256KB as base64)
  let spotifyBuffer = fullRes;
  let quality = 80;

  while (quality > 20) {
    const compressed = await sharp(processed)
      .resize(640, 640) // Smaller for Spotify
      .composite([
        {
          input: createTextOverlay(coverText),
          blend: 'over',
        },
      ])
      .jpeg({ quality })
      .toBuffer();

    const base64Size = Math.ceil((compressed.length * 4) / 3);

    if (base64Size <= SPOTIFY_MAX_BASE64_BYTES) {
      spotifyBuffer = compressed;
      break;
    }

    quality -= 10;
  }

  const spotifyBase64 = spotifyBuffer.toString('base64');

  return {
    fullResBuffer: fullRes,
    spotifyBase64,
  };
}

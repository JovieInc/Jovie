/**
 * SEO utilities for images - alt text generation, structured data, and accessibility
 */

import { publicEnv } from '@/lib/env-public';
import { Artist } from '@/types/db';

/**
 * Maps image types to their descriptive text templates.
 * Centralizes image type descriptions to eliminate duplication.
 */
const IMAGE_TYPE_DESCRIPTIONS: Record<
  string,
  { withArtist: string; generic: string }
> = {
  avatar: {
    withArtist: 'Profile photo',
    generic: 'Profile photo',
  },
  profile: {
    withArtist: 'Profile photo',
    generic: 'Profile photo',
  },
  cover: {
    withArtist: 'Cover image',
    generic: 'Cover image',
  },
  artwork: {
    withArtist: 'Album artwork',
    generic: 'Album artwork',
  },
  icon: {
    withArtist: 'Icon',
    generic: 'Icon',
  },
};

/**
 * Get descriptive text for an image type.
 */
function getImageTypeDescription(
  type?: string,
  artistName?: string
): string | null {
  if (!type || !IMAGE_TYPE_DESCRIPTIONS[type]) {
    return null;
  }

  const desc = IMAGE_TYPE_DESCRIPTIONS[type];
  if (artistName) {
    return `${artistName} - ${desc.withArtist}`;
  }
  return desc.generic;
}

/**
 * Generate SEO-friendly alt text from various sources
 */
export function generateSEOAltText(
  src: string,
  context: {
    artistName?: string;
    type?: 'avatar' | 'profile' | 'cover' | 'artwork' | 'icon';
    description?: string;
    fallback?: string;
  } = {}
): string {
  const { artistName, type, description, fallback } = context;

  // If we have a description, use it
  if (description?.trim()) {
    return description.trim();
  }

  // Generate contextual alt text based on type and artist name
  if (artistName) {
    const typeDesc = getImageTypeDescription(type, artistName);
    return typeDesc || `${artistName} - Image`;
  }

  // Try to extract meaningful info from filename
  const filename = extractFilename(src);
  if (filename) {
    const cleanName = cleanFilename(filename);
    if (cleanName && cleanName !== 'image') {
      return cleanName;
    }
  }

  // Use fallback or generic description
  return fallback || getGenericAltText(type);
}

/**
 * Extract filename from URL or path
 */
function extractFilename(src: string): string | null {
  try {
    // Handle URLs
    if (src.startsWith('http')) {
      const url = new URL(src);
      const pathname = url.pathname;
      const filename = pathname.split('/').pop();
      return filename ? decodeURIComponent(filename) : null;
    }

    // Handle relative paths
    const filename = src.split('/').pop();
    return filename || null;
  } catch {
    return null;
  }
}

/**
 * Clean and humanize filename for alt text
 */
function cleanFilename(filename: string): string {
  if (!filename) return '';
  return (
    filename
      // Remove file extension
      .replaceAll(/\.(jpg|jpeg|png|webp|avif|svg|gif)$/gi, '')
      // Replace common separators with spaces
      .replaceAll(/[-_]/g, ' ')
      // Remove common image prefixes/suffixes
      .replaceAll(/^(img|image|photo|pic|picture)[\s-_]/gi, '')
      .replaceAll(/[\s-_](img|image|photo|pic|picture)$/gi, '')
      // Capitalize words
      .replaceAll(/\b\w/g, l => l.toUpperCase())
      // Clean up multiple spaces
      .replaceAll(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Get generic alt text based on image type
 */
function getGenericAltText(type?: string): string {
  const typeDesc = getImageTypeDescription(type);
  return typeDesc || 'Image';
}

/**
 * Generate structured data for artist images
 */
export function generateImageStructuredData(
  artist: Artist,
  imageUrl: string,
  type: 'avatar' | 'cover' = 'avatar'
) {
  const baseData = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    url: imageUrl,
    description: generateSEOAltText(imageUrl, {
      artistName: artist.name,
      type,
    }),
  };

  if (type === 'avatar') {
    return {
      ...baseData,
      '@type': 'ImageObject',
      name: `${artist.name} Profile Photo`,
      author: {
        '@type': 'MusicGroup',
        name: artist.name,
        url: `${publicEnv.NEXT_PUBLIC_APP_URL}/${artist.handle}`,
      },
    };
  }

  return baseData;
}

/**
 * Generate Open Graph meta tags for images
 */
export function generateOGImageMeta(
  imageUrl: string,
  context: {
    title?: string;
    description?: string;
    width?: number;
    height?: number;
    type?: string;
  } = {}
) {
  const {
    title = 'Image',
    description,
    width = 1200,
    height = 630,
    type = 'image/jpeg',
  } = context;

  return [
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:alt', content: description || title },
    { property: 'og:image:width', content: width.toString() },
    { property: 'og:image:height', content: height.toString() },
    { property: 'og:image:type', content: type },
    // Twitter Card
    { name: 'twitter:image', content: imageUrl },
    { name: 'twitter:image:alt', content: description || title },
  ];
}

/**
 * Validate alt text for accessibility compliance
 */
export function validateAltText(
  altText: string,
  context: { isDecorative?: boolean; maxLength?: number } = {}
): {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const { isDecorative = false, maxLength = 125 } = context;
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Decorative images should have empty alt text
  if (isDecorative) {
    if (altText.trim() !== '') {
      warnings.push('Decorative images should have empty alt text');
      suggestions.push('Use empty alt="" for purely decorative images');
    }
    return { isValid: warnings.length === 0, warnings, suggestions };
  }

  // Non-decorative images should have meaningful alt text
  if (!altText || altText.trim() === '') {
    warnings.push('Alt text is required for content images');
    suggestions.push('Add descriptive alt text that conveys the image content');
    return { isValid: false, warnings, suggestions };
  }

  const cleanAlt = altText.trim();

  // Length check
  if (cleanAlt.length > maxLength) {
    warnings.push(
      `Alt text is too long (${cleanAlt.length} chars, max ${maxLength})`
    );
    suggestions.push('Keep alt text concise and under 125 characters');
  }

  // Redundant phrases check
  const redundantPhrases = [
    'image of',
    'picture of',
    'photo of',
    'graphic of',
    'screenshot of',
    'icon of',
  ];

  const lowerAlt = cleanAlt.toLowerCase();
  for (const phrase of redundantPhrases) {
    if (lowerAlt.includes(phrase)) {
      warnings.push(`Avoid redundant phrases like "${phrase}"`);
      suggestions.push(
        "Remove redundant phrases - screen readers already announce it's an image"
      );
      break;
    }
  }

  // Generic alt text check
  const genericTexts = ['image', 'photo', 'picture', 'graphic', 'img'];
  if (genericTexts.includes(lowerAlt)) {
    warnings.push('Alt text is too generic');
    suggestions.push('Provide specific, descriptive alt text');
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    suggestions,
  };
}

/**
 * Generate filename for SEO (for downloaded/saved images)
 */
export function generateSEOFilename(
  originalUrl: string,
  context: {
    artistName?: string;
    type?: string;
    index?: number;
  } = {}
): string {
  const { artistName, type, index } = context;

  // Get original extension
  const originalExt = getImageExtension(originalUrl) || 'jpg';

  // Build filename parts
  const parts: string[] = [];

  if (artistName) {
    parts.push(slugify(artistName));
  }

  if (type) {
    parts.push(slugify(type));
  }

  if (typeof index === 'number') {
    parts.push(index.toString().padStart(2, '0'));
  }

  // If no parts, use generic name
  if (parts.length === 0) {
    parts.push('image');
  }

  return `${parts.join('-')}.${originalExt}`;
}

/**
 * Extract file extension from URL
 */
function getImageExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.([a-zA-Z0-9]+)$/.exec(pathname);
    return match ? match[1].toLowerCase() : null;
  } catch {
    const match = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(url);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Create URL-safe slug from text
 */
function slugify(text: string): string {
  const safeText = text.slice(0, 200);
  return (
    safeText
      .toLowerCase()
      .trim()
      // Replace spaces and special chars with hyphens
      .replaceAll(/[^a-z0-9]+/g, '-')
      // Remove leading/trailing hyphens
      .replaceAll(/(^-+)|(-+$)/g, '')
      // Limit length
      .substring(0, 50)
  );
}

/**
 * Generate caption for images with accessibility in mind
 */
export function generateAccessibleCaption(context: {
  artistName?: string;
  description?: string;
  location?: string;
  date?: string;
  credits?: string;
}): string {
  const { artistName, description, location, date, credits } = context;

  const parts: string[] = [];

  if (description) {
    parts.push(description);
  }

  if (artistName && !description?.includes(artistName)) {
    parts.push(`featuring ${artistName}`);
  }

  if (location) {
    parts.push(`taken in ${location}`);
  }

  if (date) {
    parts.push(`from ${date}`);
  }

  if (credits) {
    parts.push(`Photo credit: ${credits}`);
  }

  return parts.join(', ');
}

/**
 * Detect image encoding format from a URL extension.
 * Falls back to 'image/jpeg' if unrecognizable.
 */
function detectEncodingFormat(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.avif')) return 'image/avif';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  // Default for blob storage URLs without extension
  return 'image/jpeg';
}

/**
 * Generate a schema.org ImageObject for album/track artwork.
 * Used in JSON-LD structured data for music content pages.
 */
export function generateArtworkImageObject(
  artworkUrl: string,
  context: {
    title: string;
    artistName: string;
    contentType: 'release' | 'track';
    artworkSizes?: Record<string, string> | null;
  }
): Record<string, unknown> {
  const typeLabel =
    context.contentType === 'release' ? 'album cover' : 'track';

  return {
    '@type': 'ImageObject',
    url: artworkUrl,
    width: 640,
    height: 640,
    caption: `${context.title} ${typeLabel} art by ${context.artistName}`,
    name: `${context.title} artwork`,
    representativeOfPage: true,
    encodingFormat: detectEncodingFormat(artworkUrl),
    ...(context.artworkSizes?.['250'] && {
      thumbnailUrl: context.artworkSizes['250'],
    }),
  };
}

/**
 * Image versioning utilities for cache busting and optimization
 */

// Cache for generated hashes to avoid recomputation
const hashCache = new Map<string, string>();

/**
 * Generate a stable hash for cache busting from image URL
 * Uses a simple hash algorithm compatible with edge runtime
 */
export function generateImageHash(url: string, timestamp?: number): string {
  const cacheKey = `${url}_${timestamp || ''}`;

  if (hashCache.has(cacheKey)) {
    return hashCache.get(cacheKey)!;
  }

  // Simple hash function that works in edge runtime
  const input = url + (timestamp || Date.now().toString());
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const hashString = Math.abs(hash).toString(16).substring(0, 8);
  hashCache.set(cacheKey, hashString);
  return hashString;
}

/**
 * Add versioning to image URLs for cache busting
 * Skips versioning for external CDNs that don't support query parameters
 */
export function versionImageUrl(url: string, version?: string): string {
  if (!url) return url;

  // Skip versioning for external CDNs that don't support query parameters
  const skipVersioningDomains = [
    'i.scdn.co', // Spotify
    'images.unsplash.com', // Unsplash
    'api.qrserver.com', // QR Code API
  ];

  try {
    const urlObj = new URL(url);

    // Check if domain should skip versioning
    if (
      skipVersioningDomains.some(domain => urlObj.hostname.includes(domain))
    ) {
      return url;
    }

    const versionParam = version || generateImageHash(url);
    urlObj.searchParams.set('v', versionParam);
    return urlObj.toString();
  } catch {
    // If URL parsing fails, append as query param manually
    // But only if it's not a skip domain
    if (skipVersioningDomains.some(domain => url.includes(domain))) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    const versionParam = version || generateImageHash(url);
    return `${url}${separator}v=${versionParam}`;
  }
}

/**
 * Generate srcset with versioning for responsive images
 */
export function generateVersionedSrcSet(
  baseUrl: string,
  sizes: number[],
  version?: string
): string {
  if (!baseUrl) return '';

  return sizes
    .map(size => {
      const url = transformImageUrl(baseUrl, { width: size });
      const versionedUrl = versionImageUrl(url, version);
      return `${versionedUrl} ${size}w`;
    })
    .join(', ');
}

/**
 * Transform image URLs with optimization parameters
 */
export function transformImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'auto';
    crop?: 'fill' | 'fit' | 'thumb';
    gravity?: 'auto' | 'face' | 'center';
  } = {}
): string {
  if (!url) return url;

  // Handle Cloudinary URLs
  try {
    const urlObj = new URL(url, 'http://dummy-base/');
    if (urlObj.hostname === 'res.cloudinary.com') {
      return transformCloudinaryUrl(url, options);
    }
  } catch {
    // Fallback for relative URLs: check if it starts with /res.cloudinary.com/
    if (url.startsWith('/res.cloudinary.com/')) {
      return transformCloudinaryUrl(url, options);
    }
  }

  // Handle other CDN URLs or return as-is
  return url;
}

/**
 * Configuration for Cloudinary transformation parameters.
 * Maps option keys to their Cloudinary parameter prefixes.
 */
const CLOUDINARY_PARAM_MAP: Array<{
  key: keyof {
    format?: string;
    quality?: number;
    width?: number;
    height?: number;
    crop?: string;
    gravity?: string;
  };
  prefix: string;
}> = [
  { key: 'format', prefix: 'f' },
  { key: 'quality', prefix: 'q' },
  { key: 'width', prefix: 'w' },
  { key: 'height', prefix: 'h' },
  { key: 'crop', prefix: 'c' },
  { key: 'gravity', prefix: 'g' },
];

/**
 * Transform Cloudinary URLs with optimization parameters
 */
function transformCloudinaryUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'auto';
    crop?: 'fill' | 'fit' | 'thumb';
    gravity?: 'auto' | 'face' | 'center';
  }
): string {
  try {
    const urlParts = url.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');

    if (uploadIndex === -1) return url;

    const transformations: string[] = [];

    // Build transformations from option map
    for (const { key, prefix } of CLOUDINARY_PARAM_MAP) {
      const value = options[key];
      if (value !== undefined) {
        transformations.push(`${prefix}_${value}`);
      }
    }

    // Add DPR for retina displays
    transformations.push('dpr_auto');

    if (transformations.length === 0) return url;

    // Insert transformations after /upload/
    const transformationString = transformations.join(',');
    urlParts.splice(uploadIndex + 1, 0, transformationString);

    return urlParts.join('/');
  } catch {
    return url;
  }
}

/**
 * Generate optimized image sizes for responsive images
 */
export function generateImageSizes(
  maxWidth: number,
  breakpoints: number[] = [640, 768, 1024, 1280, 1536]
): number[] {
  const sizes = [maxWidth];

  // Add smaller sizes for different breakpoints
  for (const breakpoint of breakpoints) {
    if (breakpoint < maxWidth) {
      // Calculate proportional size for breakpoint
      const proportionalSize = Math.round((breakpoint / 1920) * maxWidth);
      sizes.push(Math.max(proportionalSize, 64)); // Minimum 64px
    }
  }

  // Add retina versions (2x)
  const retinaSize = maxWidth * 2;
  if (retinaSize <= 3840) {
    // Max 4K resolution
    sizes.push(retinaSize);
  }

  return Array.from(new Set(sizes)).sort((a, b) => a - b);
}

/**
 * Get optimal image format based on browser support
 */
export function getOptimalImageFormat(): 'avif' | 'webp' | 'auto' {
  if (typeof window === 'undefined') {
    // Server-side: return auto and let Next.js handle it
    return 'auto';
  }

  // Client-side format detection
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  // Check AVIF support
  if (canvas.toDataURL('image/avif').indexOf('avif') > -1) {
    return 'avif';
  }

  // Check WebP support
  if (canvas.toDataURL('image/webp').indexOf('webp') > -1) {
    return 'webp';
  }

  return 'auto';
}

/**
 * Preload critical images with optimizations
 */
export function preloadImage(
  url: string,
  options: {
    as?: 'image';
    type?: string;
    sizes?: string;
    media?: string;
  } = {}
): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = options.as || 'image';

  if (options.type) {
    link.type = options.type;
  }

  if (options.sizes) {
    link.setAttribute('sizes', options.sizes);
  }

  if (options.media) {
    link.media = options.media;
  }

  document.head.appendChild(link);
}

/**
 * Lazy load images with intersection observer
 */
export function lazyLoadImage(
  element: HTMLImageElement,
  src: string,
  options: {
    threshold?: number;
    rootMargin?: string;
  } = {}
): () => void {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          img.src = src;
          observer.unobserve(img);
        }
      });
    },
    {
      threshold: options.threshold || 0.1,
      rootMargin: options.rootMargin || '50px',
    }
  );

  observer.observe(element);

  return () => observer.unobserve(element);
}

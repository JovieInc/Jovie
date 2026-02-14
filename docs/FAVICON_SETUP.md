# Favicon Setup

This project uses the official Jovie logos and favicons from the repository, with a modern setup that includes SVG as the primary format and PNG fallbacks for broader browser support.

## Current Setup

### Files

- `public/brand/jovie-logo.svg` - Official Jovie logo (SVG)
- `public/favicon.svg` - SVG favicon (music note icon)
- `public/favicon.ico` - Official ICO favicon
- `public/favicon-16x16.png` - 16x16 PNG favicon
- `public/favicon-32x32.png` - 32x32 PNG favicon
- `public/apple-touch-icon.png` - 180x180 PNG for Apple devices
- `public/android-chrome-192x192.png` - 192x192 PNG for Android Chrome
- `public/android-chrome-512x512.png` - 512x512 PNG for Android Chrome
- `public/site.webmanifest` - PWA manifest with icon configurations

### Configuration

- `app/layout.tsx` - Metadata configuration for favicons
- `public/site.webmanifest` - PWA manifest with icon definitions

## Logo Usage

The official Jovie logo is available as a reusable component:

```tsx
import { Logo } from '@/components/atoms/Logo';

// Different sizes available
<Logo size="sm" />   // 24px height
<Logo size="md" />   // 32px height (default)
<Logo size="lg" />   // 48px height
<Logo size="xl" />   // 64px height
```

## Browser Support

- **Modern browsers**: Use SVG favicon
- **Older browsers**: Fall back to ICO/PNG formats
- **Mobile devices**: Use appropriate PNG sizes
- **PWA**: Configured in web manifest with Android Chrome icons

## Colors

The favicon uses the primary brand color `#6366f1` (indigo-500) to match the application theme.

## Source

All logos and favicons are sourced from the official Jovie repository at https://github.com/meetjovie/Jovie.

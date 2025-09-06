# ArtistName Component

A flexible heading component that displays an artist's name with an optional verification badge.

## Usage

```tsx
import { ArtistName } from '@/components/atoms/ArtistName';

// Page-level heading
<ArtistName name="Lorde" handle="lorde" />

// Inline usage
<ArtistName name="Lorde" handle="lorde" as="span" showLink={false} />
```

## Recommended Usage

- **Page contexts:** The component defaults to an `h1`, ideal for hero sections or profile pages.
- **Inline contexts:** Pass the `as` prop (e.g., `as="span"` or `as="p"`) when embedding the name inside other headings, paragraphs, or UI elements.

# FooterLink Component

A lightweight link optimized for footer navigation with automatic external-link handling.

## Usage

### Internal link
```tsx
import { FooterLink } from '@/components/atoms/FooterLink';

<FooterLink href="/about">About</FooterLink>
```

### External link
```tsx
<FooterLink href="https://example.com">Example</FooterLink>
```
External links open in a new tab with `rel="noopener noreferrer"` applied.

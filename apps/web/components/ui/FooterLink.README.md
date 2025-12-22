# FooterLink (components/ui/FooterLink)

A lightweight footer anchor built from the shared `buttonVariants` styles so focus rings, hover cues, and external link safeguards mirror shadcn defaults.

```tsx
import { FooterLink } from '@/components/ui/FooterLink';

<FooterLink href='/about'>About</FooterLink>
<FooterLink href='https://status.jovie.so' external tone='light'>Status</FooterLink>
```

- `tone?: 'light' | 'dark'` sets the palette for light or dark backgrounds.
- `external?: boolean` enforces `rel="noopener noreferrer"` and `target="_blank"` when true (auto-detected for absolute URLs).
- `prefetch?: boolean` flows through to `next/link` for internal navigation.

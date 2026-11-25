# Icon and Symbol Standards

This document explains the icon contract. Enforcement lives in
`apps/web/eslint-rules/icon-usage.js`; social and service artwork lives in the
shared `SocialIcon` registry; public Jovie symbols live in the Brand System
asset registry and generated manifest. Do not create a second icon map in page
code or documentation.

## Decision order

1. **Interface action, navigation, or state:** import the closest semantic icon
   from `lucide-react`.
2. **Social network, music service, or third-party brand:** render the shared
   `SocialIcon` component. Never import Simple Icons directly.
3. **Jovie mark, wordmark, or lockup:** use the server-renderable brand
   primitives in application code or a checksummed file from the public Brand
   System manifest in vendor work.
4. **No match:** request and document an exception before adding a custom SVG.

## Interface icons

Import only the icons a surface uses so the bundler can keep the client payload
small.

```tsx
import { Check, ChevronRight, Settings } from 'lucide-react';
import { iconStrokeForSize } from '@/lib/design/icon-stroke';

<ChevronRight
  aria-hidden='true'
  size={16}
  strokeWidth={iconStrokeForSize(16)}
/>
<button type='button' aria-label='Settings'>
  <Settings size={16} strokeWidth={iconStrokeForSize(16)} aria-hidden='true' />
</button>
<span>
  <Check size={16} strokeWidth={iconStrokeForSize(16)} aria-hidden='true' />{' '}
  Saved
</span>
```

Prefer the shared `Icon` atom when the glyph is in its registry — it applies the
optical stroke ladder automatically. Direct `lucide-react` imports must pass
`iconStrokeForSize(size)` (or an intentional override) so chrome stays
Cursor-clean and larger marks keep Linear-like weight (JOV-14004).

### Optical stroke ladder (JOV-14004)

| Painted size | Stroke | Intent |
| --- | --- | --- |
| ≤16px | 1.5 | Sidebar / controls — Cursor-clean |
| 17–20px | 1.65 | Mid controls |
| ≥21px | 1.75 | Feature / large marks — Linear weight |

Do not reintroduce Lucide default `2` or dense `2.25–2.5` overrides unless a
shared primitive documents screenshot evidence for that size. Size and color
still come from the containing canonical component; do not bake presentation
into a new wrapper.

- Use the same semantic icon for the same action across surfaces.
- An icon-only control needs an accessible name. An icon that repeats adjacent
  text is hidden from assistive technology.

## Social and service icons

`apps/web/components/atoms/SocialIcon.tsx` is the only application registry for
social, DSP, payment, and third-party service artwork.

```tsx
import { SocialIcon } from '@/components/atoms/SocialIcon';

<SocialIcon platform='spotify' aria-hidden='true' />
```

The canonical platform identifiers come from the registry and provider
metadata. Do not copy its names or SVG paths into another switch statement,
page manifest, or vendor package.

## Jovie symbols

Application code uses `Mark`, `Wordmark`, and `Lockup` from `@/lib/brand` so
every render shares the same geometry and kerning data. External work uses only
the files listed by `PUBLIC_BRAND_ASSETS` and the checksums emitted in
`/brand/Jovie-Brand-System.json`.

The public registry currently governs:

- the mark in ink and cream;
- the drawn wordmark in ink and cream;
- the horizontal lockup in ink and cream;
- the generated app-icon sizes listed by the manifest.

Never type the wordmark, redraw the mark, or publish an unregistered export.

## Custom SVG exceptions

The lint allowlist contains approved historical and current brand files. That
allowlist is not a public-download registry. A new custom SVG needs:

1. a documented gap in Lucide, `SocialIcon`, and the brand primitives;
2. design approval and an owner;
3. accessible-name behavior;
4. an enforcement update and focused test;
5. public asset registration and checksum verification when it is intended for
   vendors.

## Enforcement

- ESLint rejects unapproved SVG imports and direct Simple Icons usage.
- The public Brand System drift gate hashes this rule, the social registry, the
  brand geometry, the public asset registry, and every downloadable file.
- The public projection contains no operational selection metadata or copied
  social-icon registry.
- Source changes require a Design System version and changelog update before
  the public manifest can be regenerated.

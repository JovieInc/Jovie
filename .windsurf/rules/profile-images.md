---
trigger: always_on
---
## Profile Images
- Seeded under `/public/avatars`; default fallback.
- User uploads: Vercel Blob; store URL/version; bump version for cache bust.
- Validate type/size; optional preprocess; private blobs via signed proxy.
- Use `next/image`; configure `images.remotePatterns` for blob host.

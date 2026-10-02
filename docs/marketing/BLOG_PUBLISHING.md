# Blog Markdown publication contract

Status: canonical source and deploy contract

Owner: JOV-7396

Tracking key: BLOG-MD-2026-10-01/publication-contract

Jovie's own blog remains plain Markdown in `apps/web/content/blog`. Git is the
source of truth, the existing sanitized Markdown renderer remains the rendering
boundary, and the existing Next.js/Vercel release path remains the publication
path. This contract does not apply to customer-owned content or the Help Center.

## Metadata and authority

Every `*.md` file must use the flat scalar frontmatter parsed by
`apps/web/lib/docs/parseMarkdownFrontmatter.ts` and validated by
`apps/web/lib/blog/metadata.ts`:

```yaml
id: stable-article-id
slug: canonical-url-slug
title: Article title
description: A concise, source-truthful description between 20 and 200 characters.
date: 2026-10-01
updatedDate: 2026-10-02
author: Truthful author name
authorUsername: optional-jovie-handle
authorTitle: Optional truthful title
authorProfile: /optional-profile
category: Category name
tags: comma, separated, tags
image: /images/blog/optional-public-asset.svg
imageAlt: Required accessible description when image is present.
```

`date` is required and accepts a real `YYYY-MM-DD` date or a timezone-qualified
ISO timestamp. `updatedDate` is optional and cannot precede `date`. The filename
must equal `slug`; changing it requires an explicit redirect in the existing
route configuration. Asset paths are restricted to `/images/blog/*`, must exist,
and require `imageAlt`.

Article frontmatter cannot set publication, indexing, or certification. Those
keys fail strict validation. `apps/web/lib/blog/publication.ts` is the separate
reviewed publication authority, with these states:

- `draft`, `embargoed`, `shadow`, and `withdrawn`: not public.
- `noindex`: public and routable, but excluded from the sitemap and emitted with
  robots `noindex,follow`.
- `indexed`: public, routable, and sitemap eligible.

A `noindex` article is public, not confidential. Certification is owned outside
this slice and cannot be minted by Markdown metadata.

## Shared consumers

`loadBlogCatalog` validates all candidates and applies the publication policy
once. Its eligible set feeds direct article reads, the index, category and
author listings, related posts, generated article paths, route QA, the admin
share studio, article metadata, Open Graph cards, the story-share endpoint, and
the sitemap. No blog feed or standalone blog-search output exists on this head.
The sitemap applies the separate indexing predicate after publication
eligibility.

An ineligible direct read produces the established unavailable/not-found result
without rendering article content. Invalid metadata, duplicate IDs/slugs,
dangling publication or asset references, and malformed frontmatter fail the
build with source-file errors; they are never converted into an empty feed.
The last successfully deployed blog remains available when a candidate build
fails.

## Clock and deployment behavior

The eligibility boundary compares `date` to a UTC clock: before the instant is
private, at and after it is eligible when the registry state is `noindex` or
`indexed`. A candidate build fails if a future-dated article is already marked
`noindex` or `indexed`; keep it `embargoed` or `shadow` until the promotion
change. This is not a scheduler. Blog routes use `revalidate = false` and the
Markdown is bundled at build time.

For a visibility change, land the content and publication-registry change, let
the exact `main` CI authorize the production controller, and let the existing
Vercel release promote the new build. A build created before a future date does
not become public merely because wall-clock time passes; publish with a build
and promotion at or after the intended instant. The release controller's
`Production Verified` evidence, followed by a representative `/blog` and
`/blog/<slug>` route probe, is deployed proof.

## Confidentiality

Public Git history, `apps/web/content/blog`, `apps/web/public`, build artifacts,
and predictable asset URLs are not confidential storage. Keep confidential
drafts, embargoed research, private evidence, and pre-publication assets in the
existing access-controlled private storage. A `draft`, `shadow`, or `noindex`
label is not access control. Ineligible articles are rejected if they reference
a public asset.

**Ship now:** strict metadata, one publication registry and policy, stable
existing URLs, and deterministic build/deploy visibility.

**Re-evaluate when:** measured Git-backed publishing latency blocks the
marketing cadence or JOV-7397 adds an approved certification projection.

**Then:** change the bounded delivery or certification adapter without replacing
Git authority, the renderer, or the current public URL contract.

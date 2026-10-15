# Canonical public content shell

JOV-5763 web-content slice. `PublicPageShell` owns the one main landmark,
canonical `MarketingHeader`, expanded `MarketingFooter`, skip link, and header
offset. The marketing route-group layout supplies it for blog and changelog;
the shared legal segment layout supplies it for all four legal documents and
their loading/error boundaries.

`MarketingContentShell` owns the inner frame, responsive gutters, vertical
spacing, and semantic light/dark text and background tokens. Its default is the
canonical 680px prose width from `MarketingContainer`. Blog article headings,
contents, body, and related information share that frame. Legal documents share
the same prose reader, with contents, print/download controls, and support in
normal document flow. Release bodies use that same prose frame.

Ship now: consolidate the web reading surfaces in one bounded change.
Re-evaluate when: the separate docs app can consume app-independent chrome.
Then: complete the cross-app migration under JOV-8375.

## Route-specific exceptions

| Routes | Contract and reason |
| --- | --- |
| `/blog`, `/blog/category/[slug]`, `/blog/authors/[username]` | Use the shared shell's `page` variant (canonical 1298px public grid) for card directories, rather than squeezing multiple previews into a prose column. |
| `/changelog` | Uses the `page` variant for the customer archive, date rail, and subscription column. Individual `/changelog/[version]` bodies use prose. |
| Blog/changelog index and release heroes; legal privacy/terms heroes | Existing editorial heroes retain the canonical public width and docked-header behavior. Reading content below them uses the shared shell. |
| `docs.jov.ie` index and articles | Separate Nextra deployment under `apps/docs`, currently using `HelpShell` with search, sidebar/drawer navigation, article metadata/SEO, and feedback. JOV-8375 tracks extracting web chrome into a shared package and migrating this app without crossing app-specific alias/provider boundaries. This slice does **not** claim docs chrome acceptance. |
| `/investor-portal/*` | Authenticated investor documents use the portal shell and access boundary; they are not public publication routes. |
| `/about`, `/support`, `/developers`, `/engineering/*`, product/pricing, comparisons, and other marketing landings | Keep their existing task-specific compositions and canonical public chrome. They are company, support-routing, API, or conversion surfaces rather than this document template. |

The homepage shell, navigation/CTA policy, footer, and mobile hydration code are
unchanged. Existing homepage/chrome regression tests remain authoritative; no
historical homepage CTA text overrides the current source contract.

## Evidence and states

Route contracts cover blog index/article/category/author, changelog index/release,
and cookies/DMCA/privacy/terms. Component tests cover directory/prose geometry,
empty/populated blog content, release/archive behavior, document loading, and
contents availability. Blog/changelog and legal failures use the canonical ErrorBoundary inside the
reading frame, inheriting their public chrome. Not-found behavior is retained. Blog and changelog index loaders use the directory frame;
blog article loading uses the prose frame, and legal loading follows the
single-column document flow. The shared legal segment loader owns a frame;
nested legal page loaders inherit their route frame without nesting another.

`public-content-shell.spec.ts` exercises representative index, article, release,
and legal pages at mobile/desktop in light/dark themes. It checks chrome,
reading bounds, overflow, theme selection, console errors, hydrated controls,
and captures screenshots. The existing PR Visual Review producer runs it against
the exact checked-out PR head and uploads evidence. A declared producer is not a
passing hosted receipt; inspect its result before claiming rendered acceptance.

Design reference: existing canonical prose shell Pen node `ND9fM` and public
shell node `C9drCF`, mapped in `apps/web/data/marketing/penContracts.ts`.
No new visual identity or fabricated product claim is introduced.

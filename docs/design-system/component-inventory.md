# Component Inventory

This inventory records the current canonical component owners, known duplicates, and the migration slice responsible for convergence.

## Shell, header, footer

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Public shell | `apps/web/components/site/PublicPageShell.tsx` | route-local public layout wrappers | `(marketing)`, `(dynamic)/legal`, `[username]/not-found` | legacy wrappers in untouched public routes | Slice 2 |
| Public header | `apps/web/components/site/MarketingHeader.tsx` via `HeaderNav` | `btn-linear-*` route-local CTA/header usages | public marketing/legal | homepage/detail routes still using raw classes | Slice 2 |
| Public footer | `apps/web/components/site/MarketingFooter.tsx` | route-local footer/action clusters | public marketing/legal | profile/footer-module is a different family | Slice 2 |
| Internal app shell | `apps/web/components/organisms/AppShellFrame.tsx` | route-level shell composition | app shell routes | page-local spacing/layout forks | Slice 6 |
| Internal content panel | `apps/web/components/organisms/AppShellContentPanel.tsx` | route-local content wrappers | dashboard/settings/admin routes using panel | route-local wrappers not using panel | Slice 6 |

## CTA, button, link

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| General CTA | `apps/web/components/molecules/CTAButton.tsx` | `PrimaryCTA.tsx`, `marketing-cta`, raw `btn-linear-*`, route-local pricing/support links | profile CTA, CTA sections, stories | launch pages, pricing page, support page, homepage hero variants | Slice 2 |
| Public auth action links | `apps/web/components/molecules/AuthActions.tsx` | direct `btn-linear-login`, `btn-linear-signup` usage in route components | shared header/auth action areas | homepage hero/detail pages, error page | Slice 2 |
| Pricing upgrade CTA | `apps/web/components/features/pricing/PricingCTA.tsx` | route-local motion button styling | pricing-specific product surfaces | any route-local upgrade card CTA | Slice 2 |

## Content/document

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Public TOC | `apps/web/components/molecules/PublicTableOfContents.tsx` | previous legal/blog TOC implementations | legal, blog article | investor-portal TOC variant | Slice 3 |
| Public document frame | `apps/web/components/organisms/DocPage.tsx` | route-local long-form layouts | legal documents | blog/investor long-form variants still composed separately | Slice 2 |
| Public document toolbar | `apps/web/components/molecules/DocToolbar.tsx` | route-local action clusters | legal docs | any future long-form action rows | Slice 2 |

## Auth

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Auth shell | `apps/web/components/features/auth/AuthLayout.tsx` | `AuthFormContainer.tsx`, `AuthBranding.tsx` shell duplication | sign-in/sign-up/unavailable/loading | stories and helper wrappers | Slice 4 |
| Auth form container | `apps/web/components/features/auth/AuthFormContainer.tsx` | route-local mobile header logic | story/helper form frame only | duplicated shell spacing/title handling retired | Slice 4 |
| Auth branding | `apps/web/components/features/auth/AuthBranding.tsx` | route-local branding treatments | story/helper branding block only | any future auth-specific hero treatments | Slice 4 |

## Pricing and support

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Pricing comparison | `apps/web/components/features/pricing/PricingComparisonChart.tsx` | route-local table patterns | pricing | other comparison-like surfaces | Slice 2 |
| Support actions | `apps/web/app/(marketing)/support/SupportContent.tsx` using shared public CTA styles | route-local text-link CTA styling | support + support loading | none once normalized | Slice 2 |

## Public profile modules

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Profile shell | `apps/web/components/organisms/profile-shell/ProfileShell.tsx` | `ArtistPageShell.tsx` wrapper drift, static/profile variants | public profile routes | marketing examples and older static/profile wrappers | Slice 5 |
| Profile composition | `apps/web/components/features/profile/registry.ts` + `view-models.ts` | route-local module composition | profile routes using registry/view-models | marketing demos/examples that hardcode module ordering | Slice 5 |
| Primary profile CTA | `apps/web/components/features/profile/ProfilePrimaryCTA.tsx` | ad hoc CTA rendering in profile modes | public profile CTA paths | any marketing profile sample CTA divergence | Slice 5 |

## Internal product primitives

| Family | Canonical file | Duplicate files to retire or constrain | Current canonical routes | Current duplicate routes | Target slice |
| --- | --- | --- | --- | --- | --- |
| Page content frame | `apps/web/components/organisms/AppShellContentPanel.tsx` | route-local content wrappers | dashboard/settings/admin using panel | pages with local padding/max-width wrappers | Slice 6 |
| Header/nav frame | `apps/web/components/organisms/HeaderNav.tsx` | route-local header composition | public header and app header variants | page-local header wrappers | Slice 6 |
| Shared status/empty/loading surfaces | existing app shell + dashboard tokens | route-local stat card/loading/empty states | portions of dashboard/admin, settings, profile chat | local page-specific states | Slice 6 |

## Notes

- `apps/web/components/site/Container.tsx` is legacy for public surfaces and should remain only for storybook or internal-only cases until fully retired.
- `apps/web/components/organisms/footer-module/Footer.tsx` is a public-profile/footer family, not the canonical public marketing/legal footer.

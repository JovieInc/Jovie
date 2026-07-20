# State Matrix

Canonical interaction and content states for shared primitives and templates.

Each row lists:

- **Token** — CSS custom property (or class) that owns the visual
- **Selector** — how to target the state in CSS/tests
- **Story** — Storybook path for visual reference
- **Primitive** — canonical component that implements the state

Token sources: `apps/web/styles/design-system.css`, `apps/web/styles/linear-tokens.css`, `apps/web/app/globals.css`.

---

## Cross-cutting states (JOV-3575)

These states apply across families and were previously undocumented.

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Visited | `--color-link-visited` | `a:visited`, `[data-state="visited"]` | `shadcn/Link/Visited` | `packages/ui/atoms/link.tsx` |
| Link styling | `--color-link-default`, `--color-link-hover` | `[data-variant="link"]` | `shadcn/Link/Default` | `packages/ui/atoms/link.tsx` |
| Link active/pressed | `--color-accent` | `:active`, `[data-state="active"]` | `shadcn/Link/Active` | `packages/ui/atoms/link.tsx` |
| Link disabled | `--state-disabled-opacity`, `--color-text-disabled-token` | `[data-state="disabled"]`, `[aria-disabled="true"]` | `shadcn/Link/Disabled` | `packages/ui/atoms/link.tsx` |
| Disabled visual | `--state-disabled-opacity`, `--color-text-disabled-token` | `[data-state="disabled"]`, `:disabled`, `[aria-disabled="true"]` | `shadcn/Button/DisabledVisual` | `packages/ui/atoms/button.tsx` |
| Loading shimmer | `--color-skeleton-base`, `--color-skeleton-shimmer` | `.skeleton`, `[data-state="shimmer"]` | `shadcn/Skeleton/LoadingShimmer` | `packages/ui/atoms/skeleton.tsx` |
| Partial data | `--state-partial-opacity` | `[data-content-state="partial"]` | `UI/Atoms/Card/PartialData` | `packages/ui/atoms/card.tsx` |
| Permission restricted | `--state-permission-bg`, `--state-permission-fg`, `--state-permission-border` | `[data-state="permission-restricted"]` | `shadcn/Badge/PermissionRestricted` | `packages/ui/atoms/badge.tsx` |
| Long content | `--color-text-primary-token` + clamp utilities | `[data-content-length="long"]`, `.line-clamp-*`, `.truncate` | `UI/Atoms/Card/LongContent` | `packages/ui/atoms/card.tsx` (`CardTitle`) |
| Inline offline | `--state-offline-bg`, `--state-offline-border`, `--state-offline-fg` | `[data-state="offline"]` | `shadcn/InlineOffline/Default` | `packages/ui/atoms/inline-offline.tsx` |

---

## Buttons and links

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Default | `--linear-btn-primary-bg`, `--linear-btn-primary-fg` | `[data-state="idle"]`, `button` base | `shadcn/Button/Primary` | `packages/ui/atoms/button.tsx` |
| Hover | `--linear-btn-primary-hover`, `--color-interactive-hover` | `:hover`, `hover:bg-*` | `shadcn/Button/Primary` | `packages/ui/atoms/button.tsx` |
| Focus-visible | `--color-focus-ring`, `--linear-border-focus` | `:focus-visible`, `focus-visible:ring-*` | `shadcn/Button/Primary` | `packages/ui/atoms/button.tsx` |
| Active/pressed | `--color-interactive-active` | `:active`, `active:scale-[0.96]` | `shadcn/Button/Primary` | `packages/ui/atoms/button.tsx` |
| Disabled | `--state-disabled-opacity`, `--color-text-disabled-token` | `[data-state="disabled"]`, `:disabled` | `shadcn/Button/Disabled` | `packages/ui/atoms/button.tsx` |
| Loading | `--linear-text-primary` (spinner) | `[data-state="loading"]`, `[aria-busy="true"]` | `shadcn/Button/Loading` | `packages/ui/atoms/button.tsx` |
| Success | `--color-success`, `--color-success-subtle` | `[data-state="success"]` | `Molecules/FormStatus/Success` | `apps/web/components/molecules/FormStatus.tsx` |
| Visited | `--color-link-visited` | `a:visited`, `[data-state="visited"]` | `shadcn/Link/Visited` | `packages/ui/atoms/link.tsx` |
| Link styling | `--color-link-default`, `--color-link-hover` | `[data-variant="link"]` | `shadcn/Link/Default` | `packages/ui/atoms/link.tsx` |
| Link active/pressed | `--color-accent` | `:active`, `[data-state="active"]` | `shadcn/Link/Active` | `packages/ui/atoms/link.tsx` |
| Link disabled | `--state-disabled-opacity`, `--color-text-disabled-token` | `[data-state="disabled"]`, `[aria-disabled="true"]` | `shadcn/Link/Disabled` | `packages/ui/atoms/link.tsx` |

---

## TOC and navigation

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Default | `--linear-text-secondary` | `nav a` base, `.marketing-glass-header__text-link` | `UI/NavLink/Default` | `apps/web/components/atoms/NavLink.tsx` |
| Hover | `--linear-text-primary`, `--color-interactive-hover` | `:hover`, `hover:text-*` | `UI/NavLink/Default` | `apps/web/components/atoms/NavLink.tsx` |
| Focus-visible | `--color-focus-ring` | `.focus-ring-themed`, `:focus-visible` | `Organisms/HeaderNav/Default` | `apps/web/components/organisms/HeaderNav.tsx` |
| Current/active section | `--linear-text-primary`, `--color-accent` | `[aria-current="page"]`, `[data-state="active"]` | `Molecules/ProfileNavButton/JovieIcon` | `apps/web/components/molecules/ProfileNavButton.tsx` |
| Hidden/collapsed (compact) | `--linear-bg-surface-0` | `[data-collapsed="true"]`, `lg:hidden` / `hidden lg:block` | `Molecules/PublicTableOfContents` (route) | `apps/web/components/molecules/PublicTableOfContents.tsx` |

---

## Inputs and auth forms

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Empty | `--linear-bg-surface-1`, `--linear-text-primary` | `input:value("")`, no `value` attr | `Atoms/Input/Default` | `packages/ui/atoms/input.tsx` |
| Placeholder | `--linear-text-tertiary` | `::placeholder`, `placeholder:text-*` | `Atoms/Input/Default` | `packages/ui/atoms/input.tsx` |
| Filled | `--linear-text-primary` | `input:not(:placeholder-shown)` | `Atoms/Input/Default` | `packages/ui/atoms/input.tsx` |
| Focus | `--linear-border-focus`, `--color-focus-ring` | `:focus-visible`, `focus-visible:border-*` | `Atoms/Input/Default` | `packages/ui/atoms/input.tsx` |
| Valid | `--color-success`, `--color-success-subtle` | `[data-validation="valid"]`, `variant="success"` | `Atoms/Input/Validation` | `packages/ui/atoms/input.tsx` |
| Invalid | `--linear-error`, `--color-error-subtle` | `[aria-invalid="true"]`, `variant="error"` | `Atoms/Input/Validation` | `packages/ui/atoms/input.tsx` |
| Disabled | `--state-disabled-opacity` | `:disabled`, `[aria-disabled="true"]` | `Atoms/Input/Default` | `packages/ui/atoms/input.tsx` |
| Read-only | `--linear-text-secondary` | `[readonly]`, `readOnly` prop | `UI/Textarea/Default` | `packages/ui/atoms/textarea.tsx` |
| Loading/submitting | `--linear-text-secondary` | `[aria-busy="true"]`, `loading` prop | `Atoms/Input/Loading` | `packages/ui/atoms/input.tsx` |
| Success | `--color-success` | `[data-validation="valid"]` + status icon | `Molecules/FormStatus/Success` | `apps/web/components/molecules/FormStatus.tsx` |

---

## Async content blocks

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Initial | `--color-bg-surface-1` | `[data-content-state="initial"]` | `UI/Atoms/Card/Default` | `packages/ui/atoms/card.tsx` |
| Loading | `--color-skeleton-base` | `[aria-busy="true"]` | `Atoms/Input/Loading` | `packages/ui/atoms/input.tsx` |
| Skeleton | `--color-skeleton-base`, `--color-skeleton-shimmer` | `.skeleton`, `[data-state="shimmer"]` | `shadcn/Skeleton/LoadingShimmer` | `packages/ui/atoms/skeleton.tsx` |
| Success | `--color-success-subtle` | `[data-content-state="success"]` | `Molecules/FormStatus/Success` | `apps/web/components/molecules/FormStatus.tsx` |
| Empty | `--color-text-secondary-token` | `[data-content-state="empty"]` | `UI/EmptyState/Default` | `apps/web/components/organisms/EmptyState.tsx` |
| Error | `--color-error-subtle`, `--color-error` | `[data-content-state="error"]`, `variant="error"` | `UI/EmptyState/ErrorState` | `apps/web/components/organisms/EmptyState.tsx` |
| Offline/retry | `--state-offline-bg`, `--state-offline-fg` | `[data-state="offline"]` | `shadcn/InlineOffline/Default` | `packages/ui/atoms/inline-offline.tsx` |
| Partial data | `--state-partial-opacity` | `[data-content-state="partial"]` | `UI/Atoms/Card/PartialData` | `packages/ui/atoms/card.tsx` |

---

## Pricing states

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Free | `--linear-text-primary` | `[data-plan-id="free"]`, `.marketing-pricing-plan-card` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |
| Paid | `--linear-btn-primary-bg` | `[data-plan-id="pro"]` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |
| Max/early access | `--linear-accent-purple` | `[data-plan-id="max"]`, `.marketing-pricing-plan-card__badge` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |
| Included | `--linear-success`, `--system-b-accent-cyan` | `.marketing-pricing-plan-card__features svg` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |
| Not included | `--linear-text-tertiary` | `.marketing-pricing-plan-card__features li[data-included="false"]` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/PricingComparisonChart.tsx` |
| Coming soon | `--color-warning-subtle` | `.marketing-pricing-plan-card__badge` (Soon copy) | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |
| Upgrade available | `--linear-btn-accent-bg` | `.marketing-pricing-plan-card__cta` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/PricingCTA.tsx` |
| Current plan | `--linear-border-focus` | `[data-plan-active="true"]` | `Pricing/PricingCTA/Default` | `apps/web/components/features/pricing/MarketingPricingPlans.tsx` |

---

## Public profile module states

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Hero shown | `--profile-pearl-primary-bg` | `[data-module="hero"][data-visible="true"]` | `Organisms/ProfileShell/Default` | `apps/web/components/organisms/profile-shell/ProfileShell.tsx` |
| Latest release available | `--color-success` | `[data-module="releases"][data-state="available"]` | `Organisms/ProfileShell/WithReleases` | `apps/web/components/organisms/ProfileShell.stories.tsx` |
| No release | `--color-text-tertiary-token` | `[data-module="releases"][data-state="empty"]` | `Organisms/ProfileShell/Default` | `apps/web/components/organisms/ProfileShell.tsx` |
| Tour available | `--linear-accent-teal` | `[data-module="tour"][data-state="available"]` | `Organisms/ListenSection/Default` | `apps/web/components/organisms/ListenSection.stories.tsx` |
| No tour dates | `--color-text-tertiary-token` | `[data-has-tour-dates="false"]` | `Organisms/ProfileShell/Default` | `apps/web/components/organisms/profile-shell/ProfileCompactSurface.tsx` |
| Tips enabled | `--linear-success` | `[data-module="tips"][data-enabled="true"]` | `Organisms/PaySection/Default` | `apps/web/components/organisms/PaySection.stories.tsx` |
| Tips disabled | `--color-text-disabled-token` | `[data-module="tips"][data-enabled="false"]` | `Organisms/PaySection/Default` | `apps/web/components/organisms/PaySection.tsx` |
| Notifications enabled | `--linear-accent-blue` | `[data-module="subscribe"][data-enabled="true"]` | `Organisms/ProfileShell/Default` | `apps/web/components/features/profile/ProfilePrimaryCTA.tsx` |
| Notifications unavailable | `--color-warning` | `[data-module="subscribe"][data-state="unavailable"]` | `Organisms/ProfileShell/Default` | `apps/web/components/features/profile/ProfilePrimaryCTA.tsx` |
| Footer shown | `--linear-bg-footer` | `[data-module="footer"][data-visible="true"]` | `Organisms/Footer/Default` | `apps/web/components/organisms/footer-module/Footer.tsx` |
| Profile not found | `--linear-text-primary` | `[data-profile-state="not-found"]` | route `not-found.tsx` | `apps/web/app/[username]/not-found.tsx` |

---

## Internal product rows/cards

| State | Token | Selector | Story | Primitive |
| --- | --- | --- | --- | --- |
| Default | `--color-bg-surface-1`, `--color-border-subtle` | `[data-state="idle"]`, row base | `UI/Atoms/Card/Default` | `packages/ui/atoms/card.tsx` |
| Hover | `--color-interactive-hover` | `:hover`, `hover:bg-surface-*` | `UI/Atoms/Card/Hoverable` | `packages/ui/atoms/card.tsx` |
| Selected/current | `--color-accent-subtle` | `[data-state="checked"]`, `[aria-selected="true"]` | `shadcn/CommonDropdown/Default` | `packages/ui/atoms/common-dropdown.tsx` |
| Loading | `--color-skeleton-base` | `[data-state="loading"]`, `[aria-busy="true"]` | `shadcn/Skeleton/LoadingShimmer` | `packages/ui/atoms/skeleton.tsx` |
| Empty | `--color-text-secondary-token` | `[data-content-state="empty"]` | `UI/EmptyState/Default` | `apps/web/components/organisms/EmptyState.tsx` |
| Error | `--color-error-subtle` | `[data-content-state="error"]` | `UI/EmptyState/ErrorState` | `apps/web/components/organisms/EmptyState.tsx` |
| Stale/refreshing | `--state-partial-opacity` | `[data-content-state="partial"]`, `[data-refreshing="true"]` | `UI/Atoms/Card/PartialData` | `packages/ui/atoms/card.tsx` |
| Permission restricted | `--state-permission-fg` | `[data-state="permission-restricted"]` | `shadcn/Badge/PermissionRestricted` | `packages/ui/atoms/badge.tsx` |
| Long content | `--color-text-primary-token` | `[data-content-length="long"]` | `UI/Atoms/Card/LongContent` | `packages/ui/atoms/card.tsx` |
| Inline offline | `--state-offline-fg` | `[data-state="offline"]` | `UI/Atoms/Card/InlineOffline` | `packages/ui/atoms/inline-offline.tsx` |

---

## Implementation notes

1. Prefer `data-state` / `data-content-state` attributes for test and Storybook parity; use pseudo-classes (`:hover`, `:focus-visible`, `:visited`) for native interaction.
2. Disabled controls must set **both** `disabled` / `aria-disabled` and the disabled-visual tokens — never rely on opacity alone.
3. Loading skeletons are `aria-hidden` placeholders; parent wrappers (`LoadingSkeleton`, async blocks) own `aria-busy`.
4. Inline offline is for **in-context** recovery; full-page offline/error uses `EmptyState` or `PageErrorState`.
5. When adding a new state, update this matrix **and** add a Storybook story before shipping.
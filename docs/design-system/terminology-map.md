# Terminology Map

This file locks the canonical names for drifting UI/product labels found in the current codebase.

## Canonical labels

| Canonical label | Legacy/variant labels found | Surface | Routes/components to update |
| --- | --- | --- | --- |
| Artist Profiles | Artist Profiles | User-facing | Already canonical on marketing routes |
| Releases & Smart Links | Release Destinations | User-facing / internal marketing copy | `apps/web/components/features/home/HomePageNarrative.tsx` |
| Audience | Audience & Growth | Internal product taxonomy | `apps/web/lib/entitlements/registry.ts` and any UI surfaces derived from entitlement category labels |
| AI Assistant | Chat & AI, AI Assistant | Internal product taxonomy / nav | `apps/web/components/organisms/footer-module/Footer.tsx` and any nav/marketing references |
| Command Center | YC Command Center, Command Center | Internal-only | admin/growth surfaces and homepage copy if still used |

## Decisions

- Public-facing marketing route copy should continue using `Artist Profiles`.
- Public-facing copy describing release links should standardize on `Releases & Smart Links`.
- Internal product/billing/category copy should standardize on `Audience`.
- Internal product/navigation copy should standardize on `AI Assistant`.
- `Command Center` is acceptable as an internal/admin product label, but `YC Command Center` should remain internal/admin specific and not leak into general product navigation.

## Implementation notes

- For user-facing labels sourced from data or config, normalize at the source constant/registry rather than patching pages one by one.
- When a label is internal-only and tied to analytics or entitlement metadata, align registry values first, then update any dependent UI snapshots/tests.

# `components/shell/`

Production-ready primitives extracted from `apps/web/app/exp/shell-v1/page.tsx`.
The shell-v1 experiment is the source of truth for the production app shell
look-and-feel; pieces graduate here once they've settled.

| Component | Purpose | Source line | Wired in production |
|-----------|---------|-------------|---------------------|
| `JovieMark` | Inline brand SVG, sized via className. Server-safe. | shell-v1 `:229` | No (use `BrandLogo` from atoms for general logo needs) |
| `ShellLoader` | Full-screen cold-start bloom + reveal overlay. | shell-v1 `:2291` | No (available for future use) |
| `JovieOverlay` | Push-to-talk listening overlay with 32-bar waveform. | shell-v1 `:5527` | No (intentionally — no production push-to-talk surface yet) |
| `CopyToggleIcon` | Copy ↔ Check icon swap for clipboard buttons. | shell-v1 inline pattern (Drawer smart link row) | No (available for future use; swap into copy buttons individually) |

## Conventions

- Every component accepts `className?: string` for caller-driven styling.
- Server-safe by default (no `'use client'` directive); add only when hooks/state are present.
- Each component has a JSDoc block with one minimal usage example.
- Tests live at `__tests__/<Name>.test.tsx`. Smoke render is the minimum bar; stateful components also test meaningful state transitions.

## Notes

- `JovieMark` is API-shaped to match shell-v1 inline usage (`<JovieMark className="..." />`). Production already has `BrandLogo` (`components/atoms/BrandLogo.tsx`) and `LogoIcon` for general logo needs — prefer those when you want size + tone presets. `JovieMark` is for shell surfaces that need the raw SVG with className-driven sizing (e.g. `ShellLoader` itself).
- `JovieOverlay` and `ShellLoader` are exported but not yet mounted into a production route. They're available for the next wave of shell wiring.
- `CopyToggleIcon` candidates for migration to this primitive (Wave 1 follow-up):
  - `components/molecules/drawer/SidebarLinkRow.tsx`
  - `components/organisms/release-sidebar/ReleasePitchSection.tsx`
  - `components/jovie/components/ChatPitchCard.tsx`
  - `components/features/profile/artist-notifications-cta/shared.tsx`
  - `components/features/dashboard/organisms/socials-form/VerificationModal.tsx`
  - `components/features/dashboard/molecules/SocialBioNudge.tsx`
  - `components/features/dashboard/molecules/ProfilePaySurface.tsx`
  - `components/features/admin/outreach/DmQueueCard.tsx`
  - `components/marketing/artist-profile/ArtistProfileHowItWorks.tsx`

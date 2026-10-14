# Entity identity owner map

Source audit: 2026-10-13. Direct founder instruction; no Linear issue — ad-hoc.

EVENT: people are circular, releases have complete square art, and events use
calendar identity. This supersedes tentative square-person wording. The
high-level invariant is `semantic-entity-identity` in `canon/invariants.jsonl`;
DESIGN.md owns operational guidance. Density and surrounding content may vary.

## Existing owners

| Concern | Canonical owner | Contract |
| --- | --- | --- |
| Rail layout | `components/molecules/drawer/EntityHeader.tsx` | One primary identity/media slot, title, quiet metadata, actions; inline/grid/chrome layouts |
| Semantic media | `EntityHeaderThumbnail` in that module | Person/artwork/event/connection variants; numeric size; no page conditionals |
| Compact avatars | `components/molecules/Avatar/Avatar.tsx` | Shared `@jovie/ui` sizing and shapes, labelled initials, loading and URL replacement, shared verification |
| Image failure | `components/molecules/drawer/DrawerMediaThumb.tsx` | Failure tied to source URL; stable frame and labelled fallback |
| Release art | `components/atoms/ReleaseArtworkThumb.tsx`, `ArtworkFrame.tsx` | Contain fit, square frame, scale-aware radius and AudioLines fallback |
| Verification | `components/atoms/VerifiedBadge.tsx` | Jovie profile verification only; caller provides real profile flag |

## Main-screen inventory and repair

Paths below are relative to `apps/web`. This inventory is source evidence, not
an authenticated production walkthrough.

| Surface / consumer | Observed gap | Result / owner |
| --- | --- | --- |
| Home/chat profile right rail, `ProfileContactSidebarSections` | One 40px circular raw thumb and one 44px square raw thumb, local single-letter fallback, no image failure handling or source verification | Both use EntityHeader + person thumbnail; profile `isVerified` supplied by both existing hydration paths |
| Audience, `AudienceMemberSidebar` | `DrawerEntityAvatar` framed people as rounded squares | Existing compatibility adapter delegates to the person thumbnail |
| Contacts, `ContactDetailSidebar` | Same square adapter and fallback | Same canonical adapter; keeps grid header and actions |
| Chat profile context card, `ChatEntityRightPanelHost` | Local Image/initials implementation | Person thumbnail at existing 36px density |
| Chat release right rail, same module | Raw 40px cover-cropped Image, no failure fallback | Artwork thumbnail delegates to ReleaseArtworkThumb |
| Chat contacts and event right rails, same module | Boxed user/calendar glyph markup | Person or calendar variant at existing 40px density |
| Tour dates, `TourDateSidebar` | Local calendar fallback thumb | Calendar variant at existing 44px density |
| Calendar selected-day rail, `CalendarPageClient` | Cover-cropped release images; empty tile when missing | ReleaseArtworkThumb at existing 36px density |
| Chat entity picker, `EntityPreviewPane` | Every image cover-cropped; local initials and separate event date markup | Semantic thumbnail at existing 72px density |
| Entity hover cards and rows, `shell/EntityPopover` | Two separate image/initials/date implementations; cover-cropped releases | Semantic thumbnail at 28px row / 48px card density |
| Public profile / dashboard preview, `ProfileIdentityHeader` | Local portrait fallback and Check badge | Person thumbnail at existing 80px density with source `isVerified` |
| Identity workspace, `profiles/PresenceIdentityPhoto` | Already uses Avatar; generic source metadata can be artwork rather than a person photo | Retains the source-aware outer accessible name with a decorative inner Avatar; source/provider provenance remains distinct from Jovie verification |
| Release inspector, `ReleaseSidebarSections`, `ReleaseArtwork`, `TrackSidebar` | Existing artwork/upload owners | Retains editable AvatarUploadable / ArtworkFrame composition; no new upload implementation |
| Table and shell identities, `AvatarCell`, `ArtistAvatarStack`, `ProfileSwitcher`, `UserButton` | Already use shared Avatar family | Retains compact owner; benefits from source replacement/fallback repair. Artist stacks provide real names for initials and own one group label |

Content previews (file thumbnails, videos, merch and event posters in editorial
cards) retain their content-specific media owners. They are not person avatars.
No entity types, badge meanings, provider permissions or user records are added.

## State and verification contract

Exercise loaded, loading, missing, broken, replacement URL and unverified/verified
states. Media dimensions stay fixed through system-driven transitions. Calendar
date-only values use UTC; missing or invalid dates show the calendar glyph.
Verification stays independently accessible when the portrait is decorative.

Meaningful regression coverage lives in EntityHeader, Avatar and consumer tests.
The existing component-family ratchet guards entity-header proliferation; its
identity consumer guard prevents known route-local media implementations from
returning. Storybook/Playwright captures cover desktop, tablet and phone, light
and dark, with fixed geometry through an actual failed image request. These are
local rendered receipts and do not imply deployed or authenticated acceptance.

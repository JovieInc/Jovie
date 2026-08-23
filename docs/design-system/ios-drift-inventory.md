# iOS Design-System Drift Inventory (JOV-5202)

Ranked against System B (`DESIGN.md`), `.claude/rules/ios.md`, and the
existing iOS token owner `apps/ios/Jovie/DesignSystem/JovieTheme.swift`.
This is an inventory, not a second design system.

**Slice rule:** one component family per PR. Chat and Calendar stay
founder-locked unless a later issue explicitly unlocks them.

**Snapshot:** `fallback/JOV-5202-fix` against `origin/main`. Source-verified
only. No device, simulator, or Pen runtime proof in this slice.

## Ranked families

| Rank | Family | Severity | Status | Why it ranks here |
| --- | --- | --- | --- | --- |
| 1 | Settings | High | **Lowered in this PR** | Founder-named system surface. Was a custom `ScrollView` of solid `surface0` wells, all-caps section titles, a private press style, force-unwrapped URLs, and an unused Liquid Glass atom. |
| 2 | Token hex vs Noir Ion | High | Open | `JovieColor` still hard-codes pre-Noir-Ion dark values (`0x06070A` canvas, `#FFFFFF` text) while web System B dark is `#030407` / `#F5F7FB`. Semantic names match; values do not. |
| 3 | Motion comment vs code | Medium | Open | `DrawerRowRevealModifier` and `StatTileRevealModifier` comments say opacity-only and still apply offset. Reduce Motion already zeros the offset. |
| 4 | Press scale token | Medium | Open | iOS `JovieMotion.pressScale` is `0.96`. Web `--scale-press` is `0.98`. `docs/design-system/state-matrix.md` still documents `active:scale-[0.96]`. One owner needed. |
| 5 | System-surface glass adoption | Medium | Open after Settings | `jovieSurface` / `glassEffect` now has a Settings consumer. Dashboard, audience, library, and onboarding grouped cards still use solid fills. Do not spray glass onto Chat/Calendar. |
| 6 | Feature-local button styles | Medium | Open | `ComposerSlashRowButtonStyle` (Chat, locked) and `MobileChatMerchActionButtonStyle` still sit beside `JoviePressFeedbackButtonStyle`. Library no longer has a private card style. |
| 7 | Raw `Color.white` / `Color.black` | Low | Open | Tab-bar Talk fill, merch overlays, teleprompter camera chrome, and a few chat bubbles still bypass `JovieColor`. Some are on-art/camera exceptions. |
| 8 | Cross-platform IA gaps | Low | Record only | Native Audience vs web Contacts, preview-only Library, placeholder Entity Context stats, no native Tasks/Presence. Mapping, not a reskin. |

## Family 1 — Settings (this PR)

Owner: `apps/ios/Jovie/Features/Settings/SettingsView.swift`.

| Drift | Before | After |
| --- | --- | --- |
| Solid wells instead of native materials | `JovieColor.surface0` rounded rects | `jovieSurface` (iOS 26+ `glassEffect`, earlier `.ultraThinMaterial`) |
| Custom URL buttons | `Button` + `openURL` + force unwraps | Native `Link` + `SettingsExternalURL` |
| Custom value rows | Hand-rolled `HStack` | Native `LabeledContent` |
| All-caps section titles | `.textCase(.uppercase)` | Title Case (`DESIGN.md`) |
| Private press style | `SettingsRowButtonStyle` (opacity `.7`) | Canonical `JoviePressFeedbackButtonStyle` |
| Logout layout shift | Spinner mounted only while busy | Both labels stay mounted; spinner is opacity-gated; `SettingsLayout.reservedActionMinHeight` |

Eval:

- `node --test apps/ios/scripts/settings-style-guard.test.mjs`
- `SettingsStyleGuardTests` in `apps/ios/JovieTests/SettingsEscapeTrapGuardTests.swift`
- `pnpm run ios:lint`

## Next slices (not this PR)

1. **Token hex family** — align `JovieColor` to Noir Ion anchors and extend the existing `themeTokensMatchSystemBCanon` guard. Touches every native screen; keep it to the token file plus the style-guard test.
2. **Motion comment family** — drop offset under the existing Reduce Motion branch *and* make the comments match, or drop offset entirely if decorative movement is rejected.
3. **Press-scale family** — pick one canonical `--scale-press` value and update iOS, web CSS, and `state-matrix.md` together.
4. **Glass adoption family** — one non-locked grouped-card surface at a time (Dashboard QR plate stays white on purpose).
5. **Local button-style family** — merch actions only. Chat slash rows stay locked.

## Explicitly out of scope here

- Chat and Calendar visual changes.
- A new iOS component kit, token module, or parallel palette.
- Pen writes. Pen presence is unknown.
- iPad size-class layouts.
- Regenerating `docs/design-system/native-ui-convergence-registry.md` as a mega-inventory.

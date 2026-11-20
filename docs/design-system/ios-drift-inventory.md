# iOS Design-System Drift Inventory (JOV-5202)

Ranked against System B (`DESIGN.md`), `.claude/rules/ios.md`, and the
existing iOS token owner `apps/ios/Jovie/DesignSystem/JovieTheme.swift`.
This is an inventory, not a second design system.

**Slice rule:** one component family per PR. Chat and Calendar stay
founder-locked unless a later issue explicitly unlocks them.

**Current source slice:** JOV-5331, `codex/jov-5331-native-ds-enforcement`, based on
main `7ca2a55f`. Source checks are recorded below. Simulator/rendered evidence
requires the ordinary native resource route; source checks are not visual proof.

## Ranked families

| Rank | Family | Severity | Status | Why it ranks here |
| --- | --- | --- | --- | --- |
| 1 | Settings | High | **Lowered in this PR** | Founder-named system surface. Was a custom `ScrollView` of solid `surface0` wells, all-caps section titles, a private press style, force-unwrapped URLs, and an unused Liquid Glass atom. |
| 2 | Native palette and semantic roles | High | Source repaired in JOV-5331; native proof pending | Existing JovieTheme projects all five ZiaWI elevations/six accents and product CSS text/CTA/border roles. No independent expected-hex list. |
| 3 | Motion comment vs code | Medium | Open | `DrawerRowRevealModifier` and `StatTileRevealModifier` comments say opacity-only and still apply offset. Reduce Motion already zeros the offset. |
| 4 | Press scale token | Medium | Open | iOS `JovieMotion.pressScale` is `0.96`. Web `--scale-press` is `0.98`. `docs/design-system/state-matrix.md` still documents `active:scale-[0.96]`. One owner needed. |
| 5 | System-surface glass adoption | Medium | Open after Settings | `jovieSurface` / `glassEffect` now has a Settings consumer. Dashboard, audience, library, and onboarding grouped cards still use solid fills. Do not spray glass onto Chat/Calendar. |
| 6 | Feature-local button styles | Medium | Open | `ComposerSlashRowButtonStyle` (Chat, locked) and `MobileChatMerchActionButtonStyle` still sit beside `JoviePressFeedbackButtonStyle`. Library no longer has a private card style. |
| 7 | Feature-local raw paint | Low | Remaining debt, growth blocked | 27 exact statement identities / 33 matches remain outside this slice. The new source gate forbids new identities/counts and baseline growth against Git base. These are debt, not image exceptions or full certification. |
| 8 | Cross-platform IA gaps | Low | Record only | Native Audience vs web Contacts, preview-only Library, placeholder Entity Context stats, no native Tasks/Presence. Mapping, not a reskin. |

## Family 1 — Settings (this PR)

Owner: `apps/ios/Jovie/Features/Settings/SettingsView.swift`.

| Drift | Before | After |
| --- | --- | --- |
| Solid wells instead of native materials | `JovieColor.surface0` rounded rects | `jovieSurface` (iOS 26+ `glassEffect`, earlier `.ultraThinMaterial`) |
| Custom URL buttons | `Button` + `openURL` + force unwraps | Native `Link` + `SettingsExternalURL` |
| Custom value rows | Hand-rolled `HStack` | Native `LabeledContent` |
| All-caps section titles | `.textCase(.uppercase)` | Title Case (`DESIGN.md`) |
| Private press style | `SettingsRowButtonStyle` (opacity `.7`) | Native `List` row feedback; any custom `ButtonStyle` on a list-row `Link`/`Button` swallows taps on iOS 26 (UITest-verified), and the guards now forbid it |
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

## JOV-5331 — shell / production What’s New enforcement

`JovieTheme.swift` remains the color owner. `apps/ios/scripts/native-design-system.manifest.json` projects all five ZiaWI JSON elevations/six accents and product `:root.dark` CSS semantics; JSON has no text-role map. Entity aliases share that owner; error copy uses primary ink and decorative glyphs use neutral ink. Regenerate with `node apps/ios/scripts/native-design-system.mjs --write`; omit `--write` to check and run `node --test apps/ios/scripts/native-design-system.test.mjs` for controls.

The only raw-paint exemption is the exact path/owner/statement/count-bound `JovieColor.qrSurface` white substrate for encoded black modules. Image foreground projects canonical strong ink. Legacy Chat/camera/art paint remains debt: new identities/counts and floor growth against immutable Git base fail, including multiline constructors, aliases and shorthand.

Direct nested rounded modifier anatomy must use named tokens with outer = inner + inset; pills, circles, unrelated siblings and square QR content are excluded. This is a bounded source scanner, not arbitrary Swift AST inference. JOV-5865 spacing scanning is reused: conservative iOS debt drops 12→11, strict inventory stays 20, Mac stays 4. The pill has a 28-point visual minimum and 44-point hit container; Dynamic Type grows content and press opacity preserves the hit area. Locked Chat controls remain 32 points.

Primary/secondary/tertiary text must clear 4.5:1 on all five dark elevations; minimum is tertiary/floating **6.06:1**. Canonical red/floating is **3.95:1** and ultra/floating **3.55:1**, unsuitable for normal text; entity labels use semantic ink while indicators retain accents. Neutral CTA inverse ink also clears 4.5:1. These calculations do not certify composited native appearance.

The deterministic launch mounts production `JovieChangelogWhatsNewView` through the unchanged resolver. Fixtures cover single/multiple unseen, long content, empty/nonempty dogfood, destinations, same-ID suppression and dismissal. Header/content scroll together; medium/large detents and return to chat remain. JOV-5789’s Done/PR18909 receipt does not demonstrate daily-post Swift semantics, so the actual release-ID behavior is preserved.

Existing `SOURCE_GUARDS` and iOS Fast Contract admit Swift, guard, palette and semantic-emitter changes. Selected-CLI negative fixtures go red and regenerate green. Swift unit tests and real shell/sheet screenshots across appearance, contrast, text-size and reduced-motion states still require admitted native capacity and exact build/simulator/xcresult identity. JOV-8515 retains build/upload; LYB gym has priority. No new controller or unrelated motion/glass/Chat/Calendar changes.

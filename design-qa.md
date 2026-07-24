# Unified Profiles Design QA

final result: passed

## Source and implementation

- Source design: `/Users/timwhite/.codex/generated_images/019f6d49-d510-7b41-91d2-8de19dabc140/exec-aa7ed8bf-99d1-4bb8-ae6d-4de537b76af1.png`
- Desktop implementation: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-desktop-1440-v2.png`
- Side-by-side comparison: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-design-comparison.png`
- Tablet selected-entity state: `/Users/timwhite/.gstack/projects/JovieInc-Jovie/jov-2659-design-qa/profiles-tablet-768.png`

## Viewports and states

| Viewport | State | Result |
| --- | --- | --- |
| 1440 × 960 | All profiles, Jovie row selected, right entity rail open | Passed |
| 768 × 1024 | Selected profile shown in the shell's responsive entity drawer | Passed |
| 375 × 812 | No initial selection; table remains horizontally scrollable and the entity drawer is click-triggered | Passed by the responsive shell contract and component coverage |

## Focused comparison history

1. The first desktop capture exposed a width collision between the table minimum width and the standard entity rail. The rail actions and Monitoring column clipped beyond the viewport.
2. Reduced the table minimum width from 860px to 700px and tightened the flexible profile/issue columns. The second desktop capture keeps the entire table and both rail actions visible.
3. Removed the eager row selection. Small screens now load the table first and register the entity drawer only after a row click, while desktop users still get the standard rail interaction.

## Interaction and layout checks

- Filters switch between All, DSP, Social, Sources, and Connectors.
- Row click and keyboard selection use the shared `UnifiedTable` behavior.
- Locked monitoring rows never render their stored rank value.
- Connector rows render explicit placeholders for search-only cells.
- The right side uses the shared `EntitySidebarShell`, not an embedded public profile.
- The selected-row treatment does not change row height or table geometry.
- Empty profile and empty filter states reserve the page surface without layout shift.

# Ovie Design Guardrails

Ovie is Jovie's internal/personal/ops shell in the shared web codebase, not a
separate UI implementation. Treat Ovie UI work as product/admin UI, not
marketing or landing-page work: dense but calm, fast, and stripped of AI-slop
decoration. Reuse shared components and metrics; vary only shell, route,
entitlement, and presentation configuration. `/app/admin/ops` remains the
canonical Ops surface, with HUD/Ovie/TV as presentation modes.

## Required Routing

Any Ovie UI or UX task must run through the existing make-interfaces-better guardrail:

- Load gstack `/design-review` before marking visual work complete.
- Load `design-taste-frontend` where available and run its audit checklist.
- Read `DESIGN.md` and this file before changing Ovie UI.
- Preserve unrelated local work first. The archived `JovieInc/ovie` Swift
  repository is not the current Ovie surface.

## Design Read

Before editing Ovie UI, write this one-line statement in the agent notes and PR:

`Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <design system or aesthetic>`

For most Ovie work, the default read should be:

`Reading this as: macOS ops cockpit for Jovie operators, with a calm dense native language, leaning toward Linear-style product UI adapted to macOS.`

Set the design dials from that read:

- `DESIGN_VARIANCE`: low to medium. Use known Jovie and macOS patterns before inventing new chrome.
- `MOTION_INTENSITY`: low. Motion should clarify state, never decorate.
- `VISUAL_DENSITY`: medium to high. Ovie should scan quickly without feeling crowded.

## Completion Evidence

Ovie UI PRs cannot be marked complete without visible proof:

- Before/after screenshots for rendered UI changes, or component evidence when a full app capture is not practical.
- A pass/fail checklist covering hierarchy, spacing, typography scale, visual density, interaction states, contrast, macOS-native affordances, and no layout jank.
- Notes for any failed checklist item, with the linked follow-up Linear issue if it is intentionally not fixed in the PR.

## Ovie-Specific Taste Rules

- Prefer native macOS affordances: menu bar expectations, compact controls, clear keyboard paths, stable panels, and familiar status language.
- Preserve the ops-cockpit purpose. The interface should make queue state, agent health, blocked work, and next actions easier to scan.
- Avoid random web patterns: oversized heroes, decorative gradients, promotional sections, feature cards, and landing-page explanation stacks.
- Avoid generic AI-admin styling: too many rounded bordered panels, icon-on-color squares, all-caps labels, excessive badges, and helper text that repeats visible state.
- Layout state changes must not jump. Loading, empty, error, degraded, populated, focused, hover, selected, and disabled states need reserved space or stable containers.

# Design Taste

Visual and UX taste rules distilled from human feedback, `DESIGN.md`, and `.claude/rules/ui.md`.
Parent doctrine remains those sources; this file is the AgentOS runtime policy seed for the
**Design/Taste department agent** (JOV-2012).

## Enforcement scope

Deterministic scanners review **added lines** in UI-touching diffs (and scheduled audits that
supply a diff). Findings map to:

| Rule id | Severity | Signal |
| --- | --- | --- |
| `elevation` | error / warning | Semi-transparent surfaces, stripped card elevation, shell canvas on children |
| `motion` | error | Decorative hover translate/scale, `transition-all` |
| `emoji` | error | Emoji in product UI markup or strings |
| `casing` | warning | All-caps `uppercase` chrome on labels |
| `hardcoded-token` | error | Arbitrary hex colors (`text-[#…]`, `bg-[#…]`, …) |

## Rules (ship checklist)

### Surface elevation

- Shared cards/panels use solid `bg-surface-1` (with border + shadow when elevated).
- Recessed wells use solid `bg-surface-0`.
- Never `bg-surface-0/XX` or `bg-surface-1/XX`.
- Never `Card` / panel with both `border-0` and `shadow-none` when elevation is required.
- Do not paint child cards with `bg-(--linear-app-content-surface)` (shell canvas).

### Motion

- No decorative hover lift/scale (`hover:translate-*`, `hover:scale-*`, `group-hover:` motion).
- No `transition-all` in product UI.
- Prefer color, border, opacity, or shadow hover feedback.
- Intentional open/close motion for menus/drawers is out of scope for this scanner.

### Emoji

- Never use emoji characters in component markup, mock data, or UI strings.
- Use Lucide icons or `SocialIcon` for brand marks.

### Casing

- Title Case for labels, headings, buttons, badges, column headers, nav items.
- Sentence case for body, descriptions, tooltips, toasts.
- Do not use Tailwind `uppercase` as product-label chrome.

### Tokens

- Prefer semantic Tailwind tokens (`text-primary-token`, `bg-surface-1`, `border-subtle`, accents).
- No arbitrary hex utilities (`text-[#ff00aa]`, `bg-[#fff]`, …).
- Converge arbitrary values; never add new ones for color.

## KPIs (department run)

- **Design system coverage** — fraction of reviewed added UI hunks without hardcoded-token hits.
- **Taste rule violations caught** — total findings (by rule) for the run/sprint window.
- **Surface elevation consistency score** — `1 - (elevation findings / files reviewed)` clamped to `[0,1]`.

## Dispatch

- **UI PR**: any PR whose changed paths match UI touch filters (same family as design-taste-jury).
- **Scheduled audit**: explicit `--trigger=scheduled-audit` (or `forceScheduledAudit`).

## Outputs

- PR comment proposal (`pr-comment.md`) with findings + embedded AgentRunArtifact.
- Auto-fix branch proposal when error-severity findings exist (proposal only; no unattended merge).
- `AgentRunArtifact` (`kind: design_review`) under `agentos/runs/design-taste/<run-id>/`.

## Do not expand without human approval

Long-form taste essays, marketing-only layout doctrine, and non-diff full-tree rewrites stay in
`DESIGN.md` / design skills — not duplicated here.

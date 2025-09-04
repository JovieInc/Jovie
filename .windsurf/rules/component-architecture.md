---
trigger: always_on
---
## Component Architecture (Atomic)
- One component per file; no default exports; named export matches file name.
- Atoms: UI-only, no business logic.
- Props: `<ComponentName>Props`; children: `React.ReactNode`.
- A11y/test IDs: add `aria-*`; organisms expose stable `data-testid`.
- Use `forwardRef` for DOM atoms/molecules; set `displayName`.
- Deprecate via `/** @deprecated Reason */`; reference replacements.

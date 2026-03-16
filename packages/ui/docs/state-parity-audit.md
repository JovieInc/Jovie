# UI Atoms — Interaction State Parity Audit

Audited: 2026-03-15
Scope: `packages/ui/atoms/`

## State Matrix

Legend: Y = present, **M** = missing (should add), - = N/A for this component

| Component | hover | active | selected | focus-visible | disabled | loading |
|-----------|-------|--------|----------|---------------|----------|---------|
| **Button** | Y | Y | - | Y | Y | Y |
| **Input** | Y | - | - | Y | Y | Y |
| **Textarea** | **M** | - | - | Y | Y | - |
| **Select (trigger)** | Y | - | - | Y | Y | - |
| **Checkbox** | **M** | - | Y | Y | Y | - |
| **RadioGroup** | **M** | - | Y | Y | Y | - |
| **Switch** | Y | - | Y | Y | Y | - |
| **SegmentControl** | Y | Y | Y | Y | Y | - |
| **Badge** | - | - | - | Y | - | - |
| **Card** | Y (variant) | - | - | - | - | - |
| **CloseButton** | Y | - | - | Y | Y | - |
| **Dialog** | Y (close) | - | - | Y (close) | - | - |
| **Sheet** | Y (close) | - | - | Y (close) | - | - |
| **AlertDialog** | Y | Y | - | Y | Y | Y |
| **Popover** | - | - | - | - | - | - |
| **Tooltip** | - | - | - | - | - | - |
| **Kbd** | - | - | - | - | - | - |
| **Skeleton** | - | - | - | - | - | - |
| **Separator** | - | - | - | - | - | - |
| **Label** | - | - | - | - | - | - |
| **Field** | - | - | - | - | - | - |
| **Avatar** | - | - | - | - | - | - |

## Priority Gaps

### P1 — Form control hover feedback (high user impact)
- **Textarea**: Add `hover:border-(--linear-border-default)` (same pattern as Input)
- **Checkbox**: Add hover highlight on the checkbox indicator
- **RadioGroup**: Add hover highlight on the radio indicator

### P2 — Interactive affordance
- **Card** (hoverable variant): Add `focus-visible` ring for keyboard users
- **Checkbox/RadioGroup**: Consider subtle `active` press feedback

### No action needed
- Popover, Tooltip, Skeleton, Separator, Label, Field, Avatar, Kbd: These are display/layout-only or non-interactive containers. State handling is N/A.

## Changes Made in This PR

| Component | State Added | Class |
|-----------|------------|-------|
| Input | hover | `hover:border-(--linear-border-default)` |
| Switch | hover (unchecked) | `data-[state=unchecked]:hover:bg-white/[0.12]` |
| Switch | hover (checked) | `data-[state=checked]:hover:bg-indigo-600` |
| Badge | focus-visible | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/30 focus-visible:ring-offset-1` |
| Select trigger | hover | `hover:border-(--linear-border-default)` |

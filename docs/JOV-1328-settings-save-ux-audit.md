# JOV-1328 Settings Save UX Audit

## Standardized pattern adopted

- **Hybrid save model**:
  - Auto-save for boolean toggles.
  - Explicit **Save** button for multi-field forms.
- Every save surface now exposes:
  - In-flight state (`Saving…`)
  - Success state (`Saved`)
  - Error state (inline visible message)

## Inconsistencies found

1. `SettingsStatusPill` only supported `saving/saved`, so failed saves were not visible inline.
2. Toggle-based sections had toast-based feedback, but no local inline save status.
3. Ad pixel settings always enabled the save button and did not gate on unsaved changes.
4. Ad pixel section had a submit-time try/catch that did not reliably surface mutation errors in the section itself.

## Implemented standardization

- Extended `SettingsStatusPill` to support an explicit error state and direct `SaveStatus` input.
- Introduced shared `useSaveStatus` hook for consistent save-status state shape.
- Upgraded `useOptimisticToggle` to expose save status for all toggle sections.
- Applied the same inline feedback pattern to:
  - Audience verification toggle
  - Analytics self-filter toggle
  - Branding visibility toggle
  - Artist profile auto-save status
  - Ad pixels explicit save form
- Added unsaved-change detection for ad pixels and disabled save when no changes exist.

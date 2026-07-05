/**
 * Reusable confirmation dialog. Drop-in replacement for native `confirm()`.
 *
 * Use this for irreversible actions and bulk destructive actions ≥ 10 items.
 * For async errors / success feedback, use `toast.error` / `toast.success` instead.
 * For reversible single-item actions, prefer optimistic update + undo-toast (TBD pattern).
 *
 * Render exactly one ConfirmDialog per surface — at the manager / page-level
 * component. Drive open-state with a `pendingX: T | null` pattern. Multiple
 * per-row dialogs cause focus-trap conflicts and multi-dialog races.
 *
 * The component handles its own state cleanup on throw (try/finally below).
 * Wrap your `onConfirm` in try/catch only to route success/failure to toasts —
 * not to prevent dialog hangs.
 *
 * See:
 *   - DESIGN.md → "Confirmations & Destructive Actions" for copy rules and decision table
 *   - AGENTS.md → "4f. No Native Browser Dialogs" for the lint policy
 */
export type { ConfirmDialogProps } from '@jovie/ui';
export { ConfirmDialog } from '@jovie/ui';

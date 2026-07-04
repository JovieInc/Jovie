'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@jovie/ui';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly body?: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'destructive';
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly isLoading?: boolean;
  readonly confirmDisabled?: boolean;
}

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
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  body,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const handlingRef = useRef(false);

  const handleConfirm = async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsPending(false);
      handlingRef.current = false;
    }
  };

  const loading = isLoading || isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {body ?? children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

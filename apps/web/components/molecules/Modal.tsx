'use client';

import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalFocusBoundary } from '@/lib/a11y/modal-focus-boundary';
import { cn } from '@/lib/utils';

interface ModalProps
  extends Omit<
    ComponentPropsWithoutRef<'dialog'>,
    'open' | 'onCancel' | 'onMouseDown'
  > {
  readonly onDismiss: () => void;
}

/**
 * Native top-layer modal, portaled outside page transforms and clipping.
 * Full-screen on compact viewports; content-fit and centered on larger ones.
 * The shared boundary owns scroll locking, focus isolation and restoration.
 */
export function Modal(props: ModalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.body), []);
  return target ? createPortal(<ModalSurface {...props} />, target) : null;
}

function ModalSurface({
  children,
  className,
  onDismiss,
  ...props
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  // Callback changes must not rebind the boundary and replace its saved opener.
  const dismiss = useCallback(() => onDismissRef.current(), []);
  useModalFocusBoundary(dialogRef, true, {
    lockScroll: true,
    onDismiss: dismiss,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      dismiss();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [dismiss]);

  return (
    <dialog
      {...props}
      ref={dialogRef}
      aria-modal='true'
      onMouseDown={event => {
        if (event.target === dialogRef.current) dismiss();
      }}
      className={cn(
        'fixed inset-0 m-0 h-dvh max-h-dvh w-[100dvw] max-w-none overflow-y-auto overscroll-contain rounded-none border-0 bg-base p-0 text-primary-token shadow-none backdrop:bg-black/70 backdrop:backdrop-blur-sm',
        'sm:m-auto sm:h-fit sm:max-h-[min(600px,calc(100svh-32px))] sm:w-[min(calc(100vw-32px),420px)] sm:rounded-(--system-b-radius-panel) sm:border sm:border-subtle sm:bg-base sm:p-4 sm:shadow-popover',
        className
      )}
    >
      {children}
    </dialog>
  );
}

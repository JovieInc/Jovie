'use client';

import { type RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
  'dialog[aria-modal="true"]',
].join(',');

const modalStack: HTMLElement[] = [];
let scrollLockCount = 0;
let previousBodyOverflow = '';
let previousRootOverflow = '';
let previousBodyOverscroll = '';
let previousRootOverscroll = '';

export type ModalFocusBoundaryOptions = {
  readonly restoreFocus?: boolean;
  readonly onDismiss?: () => void;
  readonly lockScroll?: boolean;
  /** Rebind when the modal node is swapped (breakpoint/presentation change). */
  readonly instanceKey?: string;
};

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(element => !element.hasAttribute('inert'));
}

function getModalBackgroundElements(modal: HTMLElement): HTMLElement[] {
  const background: HTMLElement[] = [];
  let current: HTMLElement | null = modal;

  while (current?.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (
        sibling !== current &&
        sibling instanceof HTMLElement &&
        !sibling.hasAttribute('data-modal-backdrop')
      ) {
        background.push(sibling);
      }
    }
    current = current.parentElement;
  }

  return background;
}

function resolveOptions(
  restoreFocusOrOptions: boolean | ModalFocusBoundaryOptions
): {
  readonly restoreFocus: boolean;
  readonly onDismiss?: () => void;
  readonly lockScroll: boolean;
  readonly instanceKey?: string;
} {
  if (typeof restoreFocusOrOptions === 'boolean') {
    return { restoreFocus: restoreFocusOrOptions, lockScroll: false };
  }

  return {
    restoreFocus: restoreFocusOrOptions.restoreFocus ?? true,
    onDismiss: restoreFocusOrOptions.onDismiss,
    lockScroll: restoreFocusOrOptions.lockScroll ?? false,
    instanceKey: restoreFocusOrOptions.instanceKey,
  };
}

function isVisibleModal(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hasAttribute('inert')) return false;
  const style = globalThis.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isTopmostModal(modal: HTMLElement): boolean {
  return modalStack.at(-1) === modal;
}

function getContainingModal(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(MODAL_SELECTOR);
}

function hasVisibleModalDialog(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)
  ).some(isVisibleModal);
}

function isLiveOpener(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (element === document.body || element === document.documentElement) {
    return false;
  }
  if (element.hasAttribute('inert')) return false;
  return typeof element.focus === 'function';
}

function acquireScrollLock(): () => void {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    previousBodyOverscroll = document.body.style.overscrollBehavior;
    previousRootOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    document.documentElement.style.overscrollBehavior = 'contain';
  }
  scrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior =
        previousRootOverscroll;
    }
  };
}

export function useModalFocusBoundary(
  modalRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  restoreFocusOrOptions: boolean | ModalFocusBoundaryOptions = true
): void {
  const options = resolveOptions(restoreFocusOrOptions);
  const { restoreFocus, lockScroll, instanceKey, onDismiss } = options;

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal || !isOpen) return;

    modalStack.push(modal);
    const releaseScrollLock = lockScroll ? acquireScrollLock() : null;

    const returnFocusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const priorInertStates = getModalBackgroundElements(modal).map(element => ({
      element,
      wasInert: element.inert,
      hadInertAttribute: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

    for (const { element } of priorInertStates) {
      element.inert = true;
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }

    const focusInto = () => {
      const focusable = getFocusableElements(modal);
      (focusable[0] ?? modal).focus({ preventScroll: true });
    };
    focusInto();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostModal(modal)) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        const containing = getContainingModal(
          event.target instanceof Element
            ? event.target
            : document.activeElement
        );
        if (containing && containing !== modal) return;
        if (!onDismiss) return;
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(modal);
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!last) return;
      if (!modal.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopmostModal(modal)) return;
      const target = event.target;
      if (!(target instanceof Node) || modal.contains(target)) return;
      if (
        target instanceof HTMLElement &&
        target.hasAttribute('data-modal-backdrop')
      ) {
        return;
      }
      const containing = getContainingModal(target);
      if (containing && containing !== modal) return;
      focusInto();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const index = modalStack.lastIndexOf(modal);
      if (index >= 0) modalStack.splice(index, 1);
      releaseScrollLock?.();
      for (const {
        element,
        wasInert,
        hadInertAttribute,
        ariaHidden,
      } of priorInertStates) {
        element.inert = wasInert;
        if (hadInertAttribute) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      if (
        restoreFocus &&
        isLiveOpener(returnFocusTarget) &&
        !hasVisibleModalDialog()
      ) {
        returnFocusTarget.focus({ preventScroll: true });
      }
    };
  }, [instanceKey, isOpen, lockScroll, modalRef, onDismiss, restoreFocus]);
}

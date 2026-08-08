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
      if (sibling !== current && sibling instanceof HTMLElement) {
        background.push(sibling);
      }
    }
    current = current.parentElement;
  }

  return background;
}

/**
 * Applies the shared mobile-modal boundary used by drawer and menu surfaces:
 * sibling content is inert and keyboard focus cannot leave the active modal.
 */
export function useModalFocusBoundary(
  modalRef: RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal || !isOpen) return;

    const priorInertStates = getModalBackgroundElements(modal).map(element => ({
      element,
      wasInert: element.inert,
    }));

    for (const { element } of priorInertStates) {
      element.inert = true;
    }

    return () => {
      for (const { element, wasInert } of priorInertStates) {
        element.inert = wasInert;
      }
    };
  }, [isOpen, modalRef]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal || !isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
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

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalRef]);
}

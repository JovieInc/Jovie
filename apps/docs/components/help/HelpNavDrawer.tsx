'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  HELP_FOCUSABLE_SELECTOR,
  nextFocusIndex,
} from '../../lib/help-nav.mjs';
import { HelpNav } from './HelpNav';
import type { HelpNavItem } from './types';

/**
 * Responsive navigation drawer for tablet and mobile. Implements a focus
 * trap, Escape-to-close, backdrop dismissal, and focus restoration on the
 * trigger button.
 */
export function HelpNavDrawer({ nav }: { nav: HelpNavItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const labelId = useId();
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  // Close the drawer when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;

    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(HELP_FOCUSABLE_SELECTOR)
      ).filter(el => el.offsetParent !== null || el === document.activeElement);

    const focusAt = (index: number) => {
      const items = focusables();
      items[index]?.focus();
    };

    focusAt(0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const current = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      focusAt(nextFocusIndex(current, items.length, event.shiftKey));
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type='button'
        ref={triggerRef}
        className='help-icon-button help-drawer-trigger'
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        aria-haspopup='dialog'
        onClick={() => setOpen(value => !value)}
      >
        {open ? (
          <X size={18} aria-hidden='true' />
        ) : (
          <Menu size={18} aria-hidden='true' />
        )}
      </button>
      {open && (
        <div className='help-drawer-layer'>
          <button
            type='button'
            className='help-drawer-scrim'
            aria-label='Close navigation'
            tabIndex={-1}
            onClick={close}
          />
          <div
            ref={panelRef}
            id={labelId}
            role='dialog'
            aria-modal='true'
            aria-label='Help Center navigation'
            className='help-drawer'
          >
            <div className='help-drawer-head'>
              <span className='help-drawer-title'>Help Center</span>
              <button
                type='button'
                className='help-icon-button'
                aria-label='Close navigation'
                onClick={close}
              >
                <X size={18} aria-hidden='true' />
              </button>
            </div>
            <nav aria-label='Help Center' className='help-drawer-nav'>
              <HelpNav nav={nav} onNavigate={close} />
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

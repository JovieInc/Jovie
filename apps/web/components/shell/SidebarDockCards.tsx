'use client';

import {
  IconButton,
  InsetPanel,
  InsetPanelHeader,
  InsetPanelRow,
  PlainButton,
} from '@jovie/ui';
import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import './SidebarDockCards.css';

/**
 * Sidebar dock cards for the app update and the What's new banner.
 *
 * Both sit on the shared InsetPanel surface so they line up with the account
 * menu: even inset, one icon column, one label edge, right-aligned trailing
 * control, subtle token gradient.
 */

export interface DockUpdateCardProps {
  /** The desktop app's one update control (DesktopUpdateControl). */
  readonly children: ReactNode;
  readonly penRail?: boolean;
  readonly onDismiss?: () => void;
}

export function DockUpdateCard({
  children,
  penRail = false,
  onDismiss,
}: DockUpdateCardProps) {
  if (penRail) {
    return (
      <section
        data-dock-card='update'
        aria-label='App Update'
        className='sidebar-editorial-card sidebar-editorial-update'
      >
        {children}
        {onDismiss ? (
          <EditorialDismiss label='Dismiss Update' onDismiss={onDismiss} />
        ) : null}
      </section>
    );
  }
  return (
    <InsetPanel asChild tone='gradient'>
      <section data-dock-card='update' aria-label='App Update'>
        {/*
          Update region. Fixed 32px footprint so an updater state change, or
          the control's chunk arriving, never moves the account row below.
          The control owns its status line and single action; the row only
          sizes it to the panel's 32px rhythm.
        */}
        <div
          data-dock-update-slot
          className='flex h-8 min-w-0 items-center [&>[data-desktop-update-control]]:h-8'
        >
          {children}
        </div>
      </section>
    </InsetPanel>
  );
}

export interface DockWhatsNewCardProps {
  readonly title: string;
  readonly penRail?: boolean;
  readonly deck?: string;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}

export function DockWhatsNewCard({
  title,
  penRail = false,
  deck,
  onOpen,
  onDismiss,
}: DockWhatsNewCardProps) {
  if (penRail) {
    return (
      <section
        data-dock-card='whats-new'
        aria-label="What's New"
        className='sidebar-editorial-card sidebar-editorial-release'
      >
        <div className='sidebar-editorial-eyebrow'>
          What’s new <Sparkles size={14} aria-hidden='true' />
        </div>
        <p className='sidebar-editorial-title'>{title}</p>
        {deck ? <p className='sidebar-editorial-deck'>{deck}</p> : null}
        <Link
          href={APP_ROUTES.CHANGELOG}
          prefetch={false}
          onClick={onOpen}
          className='sidebar-editorial-action'
          aria-label={`Read update: ${title}`}
        >
          <span className='sidebar-editorial-pill'>Read update</span>
        </Link>
        <EditorialDismiss label="Dismiss What's New" onDismiss={onDismiss} />
      </section>
    );
  }

  return (
    <InsetPanel asChild tone='gradient'>
      <section data-dock-card='whats-new' aria-label="What's New">
        <InsetPanelHeader
          // The link below carries the same accessible name as before
          // ("What's new" + release title); the visible heading is not
          // announced twice.
          title={<span aria-hidden='true'>What&apos;s new</span>}
          trailing={
            <IconButton
              size='sm'
              ariaLabel="Dismiss what's new"
              onClick={onDismiss}
            >
              <X className='size-3' />
            </IconButton>
          }
        />
        <InsetPanelRow
          asChild
          icon={<Sparkles />}
          trailing={<ArrowUpRight aria-hidden='true' />}
        >
          <Link href={APP_ROUTES.CHANGELOG} prefetch={false} onClick={onOpen}>
            <span className='sr-only'>What&apos;s new </span>
            {title}
          </Link>
        </InsetPanelRow>
      </section>
    </InsetPanel>
  );
}

function EditorialDismiss({
  label,
  onDismiss,
}: Readonly<{ label: string; onDismiss: () => void }>) {
  return (
    <PlainButton
      type='button'
      className='sidebar-editorial-dismiss'
      aria-label={label}
      onClick={onDismiss}
    >
      <X aria-hidden='true' size={16} />
    </PlainButton>
  );
}

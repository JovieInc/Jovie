'use client';

import {
  IconButton,
  InsetPanel,
  InsetPanelHeader,
  InsetPanelRow,
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
  return (
    <DockCardFrame kind='update' label='App Update' penRail={penRail}>
      {penRail ? (
        <>
          {children}
          {onDismiss ? (
            <DockCardDismiss
              ariaLabel='Dismiss Update'
              onDismiss={onDismiss}
              penRail
            />
          ) : null}
        </>
      ) : (
        // Keep the account row steady while the updater changes state.
        <div
          data-dock-update-slot
          className='flex h-8 min-w-0 items-center [&>[data-desktop-update-control]]:h-8'
        >
          {children}
        </div>
      )}
    </DockCardFrame>
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
  return (
    <DockCardFrame kind='whats-new' label="What's New" penRail={penRail}>
      {penRail ? (
        <>
          <div className='sidebar-editorial-eyebrow'>
            What’s new <Sparkles size={14} aria-hidden='true' />
          </div>
          <h2 className='sidebar-editorial-title line-clamp-2'>{title}</h2>
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
          <DockCardDismiss
            ariaLabel="Dismiss What's New"
            onDismiss={onDismiss}
            penRail
          />
        </>
      ) : (
        <>
          <InsetPanelHeader
            title={<span aria-hidden='true'>What&apos;s new</span>}
            trailing={
              <DockCardDismiss
                ariaLabel="Dismiss what's new"
                onDismiss={onDismiss}
              />
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
        </>
      )}
    </DockCardFrame>
  );
}

function DockCardFrame({
  kind,
  label,
  penRail,
  children,
}: Readonly<{
  kind: 'update' | 'whats-new';
  label: string;
  penRail: boolean;
  children: ReactNode;
}>) {
  const editorialSurface =
    kind === 'update'
      ? 'sidebar-editorial-update'
      : 'sidebar-editorial-release';
  const region = (
    <section
      data-dock-card={kind}
      aria-label={label}
      className={
        penRail ? `sidebar-editorial-card ${editorialSurface}` : undefined
      }
    >
      {children}
    </section>
  );
  return penRail ? (
    region
  ) : (
    <InsetPanel asChild tone='gradient'>
      {region}
    </InsetPanel>
  );
}

function DockCardDismiss({
  ariaLabel,
  onDismiss,
  penRail = false,
}: Readonly<{ ariaLabel: string; onDismiss: () => void; penRail?: boolean }>) {
  const dismiss = (
    <IconButton
      type='button'
      size={penRail ? 'xl' : 'sm'}
      static={penRail}
      ariaLabel={ariaLabel}
      onClick={onDismiss}
    >
      <X
        aria-hidden='true'
        size={16}
        className={penRail ? undefined : 'size-3'}
      />
    </IconButton>
  );
  return penRail ? (
    <div className='sidebar-editorial-dismiss'>{dismiss}</div>
  ) : (
    dismiss
  );
}

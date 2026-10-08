'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import { ChevronRight, Ellipsis, Pin, PinOff, Search } from 'lucide-react';
import Link from 'next/link';
import { useContext, useRef, useState } from 'react';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { SidebarContext } from './SidebarContext';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from './SidebarNavItem';
import { useSidebarFlyout } from './useSidebarFlyout';
import { useSidebarPins } from './useSidebarPins';

export interface SidebarMoreMenuProps {
  readonly items: readonly NavItem[];
  readonly isActive: (item: NavItem) => boolean;
  readonly onFindPage?: () => void;
  readonly pinScope?: string;
}

type Flyout = ReturnType<typeof useSidebarFlyout>;

// Keep the compact menu within its 384px budget. Larger collections use the
// existing scoped page search; persistence still sees every permitted page.
const INLINE_PAGE_LIMIT = 12;

function MoreDestination({
  item,
  active,
  flyout,
  preview,
  mobile,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly flyout: Flyout;
  readonly preview: boolean;
  readonly mobile: boolean;
}) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const links = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={() => flyout.onOpenChange(false)}
    >
      <item.icon aria-hidden='true' className='size-4 shrink-0' />
      <span className='min-w-0 truncate'>{item.name}</span>
    </Link>
  );
  if (preview)
    return (
      <div>
        <div className='[&>a]:flex [&>a]:items-center [&>a]:gap-2 [&>a]:rounded-md [&>a]:px-2 [&>a]:py-1.5 [&>a]:text-sm hover:bg-interactive-hover'>
          {links}
        </div>
        {item.children?.map(child => (
          <Link
            key={child.id}
            href={child.href}
            onClick={() => flyout.onOpenChange(false)}
            className='block rounded-md py-1.5 pl-8 pr-2 text-sm text-secondary-token hover:bg-interactive-hover'
          >
            {child.name}
          </Link>
        ))}
      </div>
    );
  if (item.children?.length && !mobile)
    return (
      <DropdownMenuSub open={submenuOpen} onOpenChange={setSubmenuOpen}>
        <DropdownMenuSubTrigger ref={trigger}>
          <item.icon aria-hidden='true' className='size-4 shrink-0' />
          <span className='min-w-0 truncate'>{item.name}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          collisionPadding={flyout.collisionPadding}
          data-rail-owned-overlay='left'
          data-sidebar-flyout-owner='more'
          data-sidebar-touch-menu='true'
          {...flyout.hover}
          onEscapeKeyDown={event => {
            event.preventDefault();
            setSubmenuOpen(false);
            trigger.current?.focus({ preventScroll: true });
          }}
          className='w-64 overflow-y-auto'
          style={{
            maxHeight:
              'min(24rem, var(--radix-dropdown-menu-content-available-height))',
          }}
        >
          <DropdownMenuItem asChild>
            <Link href={item.href}>All {item.name.toLowerCase()}</Link>
          </DropdownMenuItem>
          {item.children.map(child => (
            <DropdownMenuItem key={child.id} asChild inset>
              <Link href={child.href}>{child.name}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  return (
    <>
      <DropdownMenuItem asChild>{links}</DropdownMenuItem>
      {mobile
        ? item.children?.map(child => (
            <DropdownMenuItem key={child.id} asChild inset>
              <Link href={child.href}>{child.name}</Link>
            </DropdownMenuItem>
          ))
        : null}
    </>
  );
}

/** Receives already-authorized destinations; it never grants access. */
export function SidebarMoreMenu({
  items,
  isActive,
  onFindPage,
  pinScope,
}: SidebarMoreMenuProps) {
  const flyout = useSidebarFlyout('more');
  const pins = useSidebarPins(pinScope, items);
  const sidebar = useContext(SidebarContext);
  const mobile = sidebar?.isMobile ?? false;
  const active = items.some(isActive) && !pins.pinned.some(isActive);
  const activeItem = items.find(isActive);
  const inlineItems =
    onFindPage && items.length > INLINE_PAGE_LIMIT
      ? activeItem && !items.slice(0, INLINE_PAGE_LIMIT).includes(activeItem)
        ? [...items.slice(0, INLINE_PAGE_LIMIT - 1), activeItem]
        : items.slice(0, INLINE_PAGE_LIMIT)
      : items;
  const preview = flyout.open && !flyout.explicitOpen;
  const portalProps = mobile
    ? {
        container: document.querySelector<HTMLElement>(
          '[data-sidebar="sidebar"][data-mobile="true"]'
        ),
      }
    : undefined;
  const placement = {
    side: mobile ? ('bottom' as const) : ('right' as const),
    align: 'start' as const,
    sideOffset: 8,
    collisionPadding: flyout.collisionPadding,
  };
  const rows = (hover: boolean) =>
    inlineItems.map(item => {
      const pinned = pins.pinned.some(value => value.id === item.id);
      const Icon = pinned ? PinOff : Pin;
      const label = `${pinned ? 'Unpin' : 'Pin'} ${item.name}`;
      return (
        <div key={item.id} className='group/pin flex items-start'>
          <div className='min-w-0 flex-1'>
            <MoreDestination
              item={item}
              active={isActive(item)}
              flyout={flyout}
              preview={hover}
              mobile={mobile}
            />
          </div>
          {pins.toggle ? (
            <div className='grid w-11 shrink-0 place-items-center opacity-0 group-hover/pin:opacity-100 group-focus-within/pin:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'>
              <Tooltip>
                <TooltipTrigger asChild>
                  {hover ? (
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      type='button'
                      aria-label={label}
                      onClick={() => pins.toggle?.(item.id)}
                    >
                      <Icon aria-hidden='true' className='size-3' />
                    </Button>
                  ) : (
                    <DropdownMenuItem
                      asChild
                      aria-label={label}
                      onSelect={event => {
                        event.preventDefault();
                        pins.toggle?.(item.id);
                      }}
                    >
                      <Button size='icon-sm' variant='ghost'>
                        <Icon aria-hidden='true' className='size-3' />
                      </Button>
                    </DropdownMenuItem>
                  )}
                </TooltipTrigger>
                <TooltipContent side='right'>{label}</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>
      );
    });
  if (!items.length) return null;
  return (
    <>
      <Popover open={preview} onOpenChange={flyout.onOpenChange}>
        <DropdownMenu
          modal={false}
          open={flyout.open && flyout.explicitOpen}
          onOpenChange={flyout.onOpenChange}
        >
          <PopoverAnchor asChild>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                data-sidebar-flyout='more-trigger'
                data-sidebar-flyout-owner='more'
                {...flyout.hover}
                onPointerDown={() => flyout.activate(undefined, false)}
                onKeyDown={event => {
                  if (['Enter', ' ', 'ArrowDown'].includes(event.key))
                    flyout.activate(undefined, false);
                }}
                aria-label='More Pages'
                aria-expanded={flyout.open}
                data-navigation-overflow-active={active || undefined}
                className={getSidebarNavRowClassName({ calm: true, active })}
              >
                <Ellipsis
                  aria-hidden='true'
                  className={getSidebarNavIconClassName({ calm: true, active })}
                />
                <span className='min-w-0 truncate text-left'>More</span>
                <ChevronRight
                  aria-hidden='true'
                  className='absolute right-2.5 size-3.5 text-tertiary-token'
                />
              </button>
            </DropdownMenuTrigger>
          </PopoverAnchor>
          {preview ? (
            <PopoverContent
              {...placement}
              portalProps={portalProps}
              data-rail-owned-overlay='left'
              data-sidebar-flyout='more'
              data-sidebar-flyout-owner='more'
              {...flyout.hover}
              onOpenAutoFocus={event => event.preventDefault()}
              onCloseAutoFocus={event => event.preventDefault()}
              className='w-64 overflow-y-auto'
              data-sidebar-touch-menu='true'
              style={{
                maxHeight:
                  'min(24rem, var(--radix-popover-content-available-height))',
              }}
            >
              <div className='px-2 py-1.5 text-xs font-medium'>More Pages</div>
              {onFindPage ? (
                <button
                  type='button'
                  onClick={() => {
                    onFindPage();
                    flyout.onOpenChange(false);
                  }}
                  className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-interactive-hover'
                >
                  <Search aria-hidden='true' className='size-4' />
                  Find a page…
                </button>
              ) : null}
              {rows(true)}
            </PopoverContent>
          ) : null}
          <DropdownMenuContent
            {...placement}
            portalProps={portalProps}
            data-rail-owned-overlay='left'
            data-sidebar-flyout='more'
            data-sidebar-flyout-owner='more'
            {...flyout.hover}
            onCloseAutoFocus={flyout.onCloseAutoFocus}
            className={
              mobile
                ? 'w-[calc(var(--sidebar-width)-1rem)] overflow-y-auto'
                : 'w-64 overflow-y-auto'
            }
            data-sidebar-touch-menu='true'
            style={{
              maxHeight:
                'min(24rem, var(--radix-dropdown-menu-content-available-height))',
            }}
          >
            <DropdownMenuLabel>More Pages</DropdownMenuLabel>
            {mobile ? (
              <DropdownMenuItem onSelect={() => flyout.onOpenChange(false)}>
                Back
              </DropdownMenuItem>
            ) : null}
            {onFindPage ? (
              <>
                <DropdownMenuItem onSelect={onFindPage}>
                  <Search aria-hidden='true' className='size-4' />
                  Find a page…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {rows(false)}
          </DropdownMenuContent>
        </DropdownMenu>
      </Popover>
      {pins.pinned.length ? (
        <section
          data-sidebar-pins='true'
          aria-label='Pinned Pages'
          className='min-h-0 max-h-35 overflow-y-auto'
        >
          <div className='px-2.5 pb-1 text-2xs text-tertiary-token'>Pinned</div>
          {pins.pinned.map(item => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive(item) ? 'page' : undefined}
              className={getSidebarNavRowClassName({
                calm: true,
                active: isActive(item),
              })}
            >
              <item.icon
                aria-hidden='true'
                className={getSidebarNavIconClassName({
                  calm: true,
                  active: isActive(item),
                })}
              />
              <span className='min-w-0 truncate'>{item.name}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}

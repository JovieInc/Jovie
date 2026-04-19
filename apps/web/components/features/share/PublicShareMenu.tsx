'use client';

import { CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import { Copy, Mail } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import {
  launchPublicShareDestination,
  PUBLIC_SHARE_DESTINATIONS,
} from '@/lib/share/destinations';
import type { PublicShareDestination, ShareContext } from '@/lib/share/types';

export const PUBLIC_SHARE_MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
export const PUBLIC_SHARE_MENU_ICON_CLASS = 'h-[16px] w-[16px] text-white/40';

function renderDestinationIcon(icon: string) {
  switch (icon) {
    case 'copy':
      return <Copy className={PUBLIC_SHARE_MENU_ICON_CLASS} />;
    case 'mail':
      return <Mail className={PUBLIC_SHARE_MENU_ICON_CLASS} />;
    case 'instagram':
      return (
        <SocialIcon
          platform='instagram'
          className={PUBLIC_SHARE_MENU_ICON_CLASS}
        />
      );
    case 'x':
      return (
        <SocialIcon platform='x' className={PUBLIC_SHARE_MENU_ICON_CLASS} />
      );
    case 'threads':
      return (
        <SocialIcon
          platform='threads'
          className={PUBLIC_SHARE_MENU_ICON_CLASS}
        />
      );
    default:
      return <Copy className={PUBLIC_SHARE_MENU_ICON_CLASS} />;
  }
}

interface PublicShareActionListProps {
  readonly context: ShareContext;
  readonly onActionComplete?: () => void;
}

export function PublicShareActionList({
  context,
  onActionComplete,
}: PublicShareActionListProps) {
  const [helperText, setHelperText] = useState<string | null>(null);

  const handleAction = useCallback(
    async (destination: PublicShareDestination) => {
      const result = await launchPublicShareDestination(
        destination.id,
        context
      );

      if (result.status === 'success') {
        setHelperText(null);
        if (destination.id === 'copy_link') {
          toast.success('Link copied');
        }
        onActionComplete?.();
        return;
      }

      if (result.status === 'fallback') {
        setHelperText(result.helperText ?? null);
        toast.message(destination.label, {
          description: result.helperText,
        });
        return;
      }

      setHelperText(result.helperText ?? 'Share failed. Please try again.');
      toast.error('Share failed', {
        description: result.helperText,
      });
    },
    [context, onActionComplete]
  );

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-0.5'>
        {PUBLIC_SHARE_DESTINATIONS.map(destination => (
          <button
            key={destination.id}
            type='button'
            className={PUBLIC_SHARE_MENU_ITEM_CLASS}
            onClick={() => {
              handleAction(destination);
            }}
          >
            {renderDestinationIcon(destination.icon)}
            {destination.label}
          </button>
        ))}
      </div>

      {helperText ? (
        <p className='px-4 text-[12px] leading-[1.45] text-white/45'>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

interface PublicShareMenuProps {
  readonly context: ShareContext;
  readonly trigger?: ReactNode;
  readonly title?: string;
  readonly align?: 'start' | 'center' | 'end';
}

export function PublicShareMenu({
  context,
  trigger,
  title = 'Share',
  align = 'end',
}: PublicShareMenuProps) {
  const isMobile = useBreakpointDown('md');
  const [open, setOpen] = useState(false);
  const [helperText, setHelperText] = useState<string | null>(null);

  const handleDesktopAction = useCallback(
    async (destination: PublicShareDestination) => {
      const result = await launchPublicShareDestination(
        destination.id,
        context
      );

      if (result.status === 'success') {
        setHelperText(null);
        if (destination.id === 'copy_link') {
          toast.success('Link copied');
        }
        setOpen(false);
        return;
      }

      setHelperText(result.helperText ?? null);
      if (result.status === 'fallback') {
        toast.message(destination.label, {
          description: result.helperText,
        });
        return;
      }

      toast.error('Share failed', {
        description: result.helperText,
      });
    },
    [context]
  );

  const desktopItems = useMemo<CommonDropdownItem[]>(
    () => [
      ...PUBLIC_SHARE_DESTINATIONS.map(
        (destination): CommonDropdownItem => ({
          type: 'action',
          id: `public-share-${destination.id}`,
          label: destination.label,
          icon: renderDestinationIcon(destination.icon),
          onClick: () => {
            handleDesktopAction(destination);
          },
        })
      ),
      ...(helperText
        ? [
            {
              type: 'separator' as const,
              id: 'public-share-separator',
            },
            {
              type: 'label' as const,
              id: 'public-share-helper',
              label: helperText,
            },
          ]
        : []),
    ],
    [handleDesktopAction, helperText]
  );

  const defaultTrigger = (
    <button
      type='button'
      className='inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-[13px] font-[510] text-secondary-token transition-colors duration-150 hover:text-primary-token'
    >
      {title}
    </button>
  );
  const resolvedTrigger = trigger ?? defaultTrigger;

  const mobileTrigger = useMemo(() => {
    if (!isValidElement(resolvedTrigger)) {
      return (
        <button type='button' onClick={() => setOpen(true)} aria-label={title}>
          {resolvedTrigger}
        </button>
      );
    }

    const element = resolvedTrigger as ReactElement<{
      readonly onClick?: MouseEventHandler<HTMLElement>;
      readonly 'aria-label'?: string;
    }>;

    return cloneElement(element, {
      onClick: (event: MouseEvent<HTMLElement>) => {
        element.props.onClick?.(event);
        if (!event.defaultPrevented) {
          setOpen(true);
        }
      },
      'aria-label': element.props['aria-label'] ?? title,
    });
  }, [resolvedTrigger, title]);

  if (isMobile) {
    return (
      <>
        {mobileTrigger}
        <ProfileDrawerShell
          open={open}
          onOpenChange={setOpen}
          title={title}
          subtitle='Share this page'
        >
          <PublicShareActionList
            context={context}
            onActionComplete={() => setOpen(false)}
          />
        </ProfileDrawerShell>
      </>
    );
  }

  return (
    <CommonDropdown
      variant='dropdown'
      size='compact'
      items={desktopItems}
      trigger={resolvedTrigger}
      align={align}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

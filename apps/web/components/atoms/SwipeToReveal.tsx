'use client';

import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type UseSwipeToRevealOptions,
  useSwipeToReveal,
} from '@/hooks/useSwipeToReveal';
import { useTouchDevice } from '@/hooks/useTouchDevice';
import { cn } from '@/lib/utils';

/**
 * Context for coordinating swipe-to-reveal items so only one is open at a time.
 * Wrap a list of SwipeToReveal items in a SwipeToRevealGroup to enable this.
 */
interface SwipeGroupContextValue {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const SwipeGroupContext = createContext<SwipeGroupContextValue | null>(null);

/**
 * Groups SwipeToReveal items so that opening one closes all others.
 * Wrap around a list/container of SwipeToReveal items.
 *
 * @example
 * ```tsx
 * <SwipeToRevealGroup>
 *   {items.map(item => (
 *     <SwipeToReveal key={item.id} itemId={item.id} actions={<Actions />}>
 *       <ItemContent />
 *     </SwipeToReveal>
 *   ))}
 * </SwipeToRevealGroup>
 * ```
 */
export function SwipeToRevealGroup({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const contextValue = useMemo(() => ({ openId, setOpenId }), [openId]);

  return (
    <SwipeGroupContext.Provider value={contextValue}>
      {children}
    </SwipeGroupContext.Provider>
  );
}

export interface SwipeToRevealProps
  extends Pick<UseSwipeToRevealOptions, 'actionsWidth' | 'onOpen' | 'onClose'> {
  /** Unique ID for this item (required when using SwipeToRevealGroup) */
  readonly itemId?: string;
  /** Action buttons to reveal on swipe. Rendered in a container behind the content. */
  readonly actions: React.ReactNode;
  /** The main content of the list item */
  readonly children: React.ReactNode;
  /** Additional class name for the outer wrapper */
  readonly className?: string;
  /** Additional class name for the sliding content wrapper */
  readonly contentClassName?: string;
  /** Additional class name for the actions container */
  readonly actionsClassName?: string;
  /** Whether to force-enable even on non-touch devices (for testing). Default: only on touch. */
  readonly forceEnabled?: boolean;
}

/**
 * iOS-style swipe-to-reveal actions wrapper for list items.
 *
 * On touch devices, allows swiping left to reveal action buttons.
 * On desktop, renders normally (actions should be shown via hover).
 *
 * @example
 * ```tsx
 * <SwipeToReveal
 *   itemId="link-1"
 *   actionsWidth={120}
 *   actions={
 *     <>
 *       <button onClick={handleCopy}>Copy</button>
 *       <button onClick={handleDelete}>Delete</button>
 *     </>
 *   }
 * >
 *   <LinkRow />
 * </SwipeToReveal>
 * ```
 */
export const SwipeToReveal = memo(function SwipeToReveal({
  itemId,
  actions,
  children,
  className,
  contentClassName,
  actionsClassName,
  actionsWidth = 80,
  onOpen: onOpenProp,
  onClose: onCloseProp,
  forceEnabled,
}: SwipeToRevealProps) {
  const isTouchDevice = useTouchDevice();
  const enabled = forceEnabled ?? isTouchDevice;
  const group = useContext(SwipeGroupContext);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Group coordination
  const isControlled = Boolean(group && itemId);
  const isGroupOpen = isControlled && group?.openId === itemId;

  const handleOpen = useCallback(() => {
    if (isControlled && itemId) {
      group?.setOpenId(itemId);
    }
    onOpenProp?.();
  }, [isControlled, itemId, group, onOpenProp]);

  const handleClose = useCallback(() => {
    if (isControlled && itemId && group?.openId === itemId) {
      group.setOpenId(null);
    }
    onCloseProp?.();
  }, [isControlled, itemId, group, onCloseProp]);

  const { isOpen, close, handlers, style } = useSwipeToReveal({
    actionsWidth,
    enabled,
    onOpen: handleOpen,
    onClose: handleClose,
  });

  // Close when another item in the group opens
  useEffect(() => {
    if (isControlled && !isGroupOpen && isOpen) {
      close();
    }
  }, [isControlled, isGroupOpen, isOpen, close]);

  // Close on outside tap
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideTouch = (e: TouchEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener('touchstart', handleOutsideTouch, {
      passive: true,
    });
    return () => {
      document.removeEventListener('touchstart', handleOutsideTouch);
    };
  }, [isOpen, close]);

  // On non-touch devices, just render children without swipe behavior
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div ref={wrapperRef} className={cn('relative overflow-hidden', className)}>
      {/* Actions container - positioned behind the content */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex items-stretch',
          actionsClassName
        )}
        style={{ width: actionsWidth }}
        aria-hidden={!isOpen}
      >
        {actions}
      </div>

      {/* Sliding content */}
      <div
        className={cn('relative z-10', contentClassName)}
        style={style}
        {...handlers}
      >
        {children}
      </div>
    </div>
  );
});

SwipeToReveal.displayName = 'SwipeToReveal';

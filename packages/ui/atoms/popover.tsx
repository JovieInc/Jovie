'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import {
  OVERLAY_COLLISION_PADDING,
  OVERLAY_SIDE_OFFSET,
  popoverContentClasses,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

interface PopoverAnchorRegistry {
  readonly register: () => () => void;
}

const PopoverAnchorRegistryContext =
  React.createContext<PopoverAnchorRegistry | null>(null);

/**
 * Popover root. Closes itself when every trigger/anchor it is positioned
 * against unmounts, so content never floats detached at a stale position
 * after its row, card, or button disappears.
 */
function Popover({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const openRef = React.useRef(open);
  openRef.current = open;
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isControlled]
  );

  const anchorCount = React.useRef(0);
  const registry = React.useMemo<PopoverAnchorRegistry>(
    () => ({
      register: () => {
        anchorCount.current += 1;
        return () => {
          anchorCount.current -= 1;
          // Defer so a remount in the same commit (StrictMode, keyed
          // re-render) re-registers before the popover decides to close.
          queueMicrotask(() => {
            if (anchorCount.current === 0 && openRef.current) {
              handleOpenChange(false);
            }
          });
        };
      },
    }),
    [handleOpenChange]
  );

  return (
    <PopoverAnchorRegistryContext.Provider value={registry}>
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </PopoverAnchorRegistryContext.Provider>
  );
}

function useRegisterPopoverAnchor() {
  const registry = React.useContext(PopoverAnchorRegistryContext);
  React.useEffect(() => registry?.register(), [registry]);
}

const PopoverTrigger = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>((props, ref) => {
  useRegisterPopoverAnchor();
  return <PopoverPrimitive.Trigger ref={ref} {...props} />;
});
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

const PopoverAnchor = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Anchor>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>((props, ref) => {
  useRegisterPopoverAnchor();
  return <PopoverPrimitive.Anchor ref={ref} {...props} />;
});
PopoverAnchor.displayName = PopoverPrimitive.Anchor.displayName;

const PopoverClose = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>
>((props, ref) => <PopoverPrimitive.Close ref={ref} {...props} />);
PopoverClose.displayName = PopoverPrimitive.Close.displayName;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * `bare` removes the default inner padding for self-contained composite
   * surfaces such as calendars.
   * @default "default"
   */
  readonly size?: 'default' | 'bare';
  readonly showArrow?: boolean;
  readonly portalProps?: React.ComponentPropsWithoutRef<
    typeof PopoverPrimitive.Portal
  >;
  readonly disablePortal?: boolean;
  /**
   * Test ID for the popover content.
   * @default "popover-content"
   */
  readonly testId?: string;
}

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      size = 'default',
      align = 'center',
      sideOffset = OVERLAY_SIDE_OFFSET,
      collisionPadding = OVERLAY_COLLISION_PADDING,
      showArrow = false,
      children,
      portalProps,
      disablePortal = false,
      testId = 'popover-content',
      ...props
    },
    ref
  ) => {
    const content = (
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          popoverContentClasses,
          // Keep rich content inside the collision-safe viewport on narrow
          // screens, including long unbroken values supplied by consumers.
          'max-w-(--radix-popover-content-available-width) max-h-(--radix-popover-content-available-height) overflow-y-auto break-words',
          size === 'bare' && 'p-0',
          className
        )}
        data-testid={testId}
        {...props}
      >
        {children}
        {showArrow && (
          <PopoverPrimitive.Arrow
            className='fill-surface-elevated drop-shadow-sm'
            data-testid='popover-arrow'
          />
        )}
      </PopoverPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <PopoverPrimitive.Portal {...portalProps}>
        {content}
      </PopoverPrimitive.Portal>
    );
  }
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger };

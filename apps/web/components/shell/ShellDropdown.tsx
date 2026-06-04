'use client';

// ShellDropdown — single dropdown primitive for the /exp/shell-v1 experiment.
// Built on @radix-ui/react-dropdown-menu so a11y, focus management, escape,
// click-outside, portal, collision, and submenu navigation are correct.
//
// Compound API: ShellDropdown (root + trigger + portal + content),
// .Header, .Label, .Item, .EntityItem, .CheckboxItem, .RadioGroup,
// .RadioItem, .Sub, .SubTrigger, .SubContent, .Separator.
//
// Filter: pass `searchable` to mount a sticky filter input at the top of the
// content. Items registered via the FilterContext hide when their label
// doesn't match. Submenu triggers stay visible (their contents may match).
//
// Selection vocabulary: cyan `before:` pill chip on selected RadioItem +
// CheckboxItem (matches sidebar selection at shell-v1 page.tsx:241).
//
// Entity hover: rows rendered via .EntityItem reveal an EntityPopover next
// to the row after a 200ms hover delay (or instantly on keyboard focus).
// One popover at a time; pointer-bridge between row and popover.

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Link2, Search, X } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  createContext,
  type ElementRef,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';
import {
  EntityPopover,
  type EntityPopoverData,
  EntityRowArt,
  formatEntitySubtitle,
} from './EntityPopover';

// ---------------------------------------------------------------------------
// Filter context — items register their label so they can hide on no-match.
// ---------------------------------------------------------------------------

interface FilterContextValue {
  readonly query: string;
  readonly enabled: boolean;
  readonly registerMatch: (id: string, matches: boolean) => void;
  readonly visibleCount: number;
}

const FilterContext = createContext<FilterContextValue>({
  query: '',
  enabled: false,
  registerMatch: () => {},
  visibleCount: 0,
});

function useFilterMatch(label: string, secondaryText?: string): boolean {
  const { query, enabled, registerMatch } = useContext(FilterContext);
  const id = useId();
  const matches = useMemo(() => {
    if (!enabled || !query) return true;
    const haystack = `${label} ${secondaryText ?? ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }, [enabled, query, label, secondaryText]);
  useEffect(() => {
    registerMatch(id, matches);
    return () => registerMatch(id, true);
  }, [id, matches, registerMatch]);
  return matches;
}

// ---------------------------------------------------------------------------
// Entity hover context — coordinates popover open/close + pointer bridge.
// ---------------------------------------------------------------------------

interface EntityHoverContextValue {
  readonly active: { entity: EntityPopoverData; anchor: HTMLElement } | null;
  readonly requestOpen: (
    entity: EntityPopoverData,
    anchor: HTMLElement
  ) => void;
  readonly requestClose: () => void;
  readonly cancelClose: () => void;
  readonly onEntityActivate?: (entity: EntityPopoverData) => void;
}

const EntityHoverContext = createContext<EntityHoverContextValue>({
  active: null,
  requestOpen: () => {},
  requestClose: () => {},
  cancelClose: () => {},
});

const ENTITY_OPEN_DELAY_MS = 200;
const ENTITY_CLOSE_DELAY_MS = 120;

// ---------------------------------------------------------------------------
// Style tokens (kept in one place so the gallery + sweep render identically).
// ---------------------------------------------------------------------------

const CONTENT_CLASSES = cn(
  'system-b-shell-dropdown-content',
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
  'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
  'data-[side=right]:slide-in-from-left-1 data-[side=left]:slide-in-from-right-1',
  'duration-fast ease-subtle',
  'will-change-transform'
);

const SUB_CONTENT_CLASSES = cn(
  CONTENT_CLASSES,
  'system-b-shell-dropdown-sub-content'
);

const ROW_BASE = cn('system-b-shell-dropdown-row');

const ROW_DANGER = cn('system-b-shell-dropdown-row-danger');

// System B row-selection accent shared with shell list rows.
const ROW_SELECTED = cn('system-b-shell-dropdown-row-selected');

const ICON_CLASSES = 'system-b-shell-dropdown-icon';

// ---------------------------------------------------------------------------
// Trigger wrapper — the user passes any element + we attach Radix Trigger.
// ---------------------------------------------------------------------------

interface ShellDropdownProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'center' | 'end';
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly sideOffset?: number;
  readonly alignOffset?: number;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly width?: number | 'trigger';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly defaultOpen?: boolean;
  readonly modal?: boolean;
  readonly onEntityActivate?: (entity: EntityPopoverData) => void;
  readonly contentClassName?: string;
}

function ShellDropdownRoot({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  alignOffset = 0,
  searchable = false,
  searchPlaceholder = 'Filter…',
  emptyMessage = 'No matches',
  width = 224,
  open,
  onOpenChange,
  defaultOpen,
  modal,
  onEntityActivate,
  contentClassName,
}: ShellDropdownProps) {
  const [query, setQuery] = useState('');
  const matchesRef = useRef<Map<string, boolean>>(new Map());
  const [visibleCount, setVisibleCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recompute visible count by reading the live map. Ref-based registration
  // means we don't trigger a re-render per item; we batch with rAF.
  const scheduleCountUpdate = useCallback(() => {
    requestAnimationFrame(() => {
      let n = 0;
      matchesRef.current.forEach(v => {
        if (v) n += 1;
      });
      setVisibleCount(n);
    });
  }, []);

  const registerMatch = useCallback(
    (id: string, matches: boolean) => {
      matchesRef.current.set(id, matches);
      scheduleCountUpdate();
    },
    [scheduleCountUpdate]
  );

  // Reset filter on close.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setQuery('');
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const filterCtx = useMemo<FilterContextValue>(
    () => ({
      query,
      enabled: searchable,
      registerMatch,
      visibleCount,
    }),
    [query, searchable, registerMatch, visibleCount]
  );

  // Entity hover state.
  const [active, setActive] = useState<EntityHoverContextValue['active']>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const requestOpen = useCallback(
    (entity: EntityPopoverData, anchor: HTMLElement) => {
      cancelClose();
      if (
        active?.entity.id === entity.id &&
        active?.entity.kind === entity.kind
      ) {
        return;
      }
      if (openTimer.current !== undefined)
        window.clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(() => {
        setActive({ entity, anchor });
        openTimer.current = undefined;
      }, ENTITY_OPEN_DELAY_MS);
    },
    [active, cancelClose]
  );

  const requestClose = useCallback(() => {
    if (openTimer.current !== undefined) {
      window.clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
    if (closeTimer.current !== undefined)
      window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setActive(null);
      closeTimer.current = undefined;
    }, ENTITY_CLOSE_DELAY_MS);
  }, []);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (openTimer.current !== undefined)
        window.clearTimeout(openTimer.current);
      if (closeTimer.current !== undefined)
        window.clearTimeout(closeTimer.current);
    },
    []
  );

  const entityCtx = useMemo<EntityHoverContextValue>(
    () => ({
      active,
      requestOpen,
      requestClose,
      cancelClose,
      onEntityActivate,
    }),
    [active, requestOpen, requestClose, cancelClose, onEntityActivate]
  );

  const isEmpty = searchable && query.trim().length > 0 && visibleCount === 0;

  const widthStyle =
    width === 'trigger'
      ? { ['--w' as string]: 'var(--radix-dropdown-menu-trigger-width)' }
      : { ['--w' as string]: `${width}px` };

  return (
    <DropdownMenuPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      modal={modal}
    >
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={8}
          loop
          style={widthStyle as CSSProperties}
          className={cn(CONTENT_CLASSES, contentClassName)}
          onCloseAutoFocus={() => {
            // When the menu closes, also close the entity popover.
            setActive(null);
          }}
        >
          <FilterContext.Provider value={filterCtx}>
            <EntityHoverContext.Provider value={entityCtx}>
              {searchable ? (
                <FilterInput
                  inputRef={inputRef}
                  value={query}
                  onChange={setQuery}
                  placeholder={searchPlaceholder}
                />
              ) : null}
              <div
                className={cn(
                  'system-b-shell-dropdown-scroll',
                  searchable && 'pt-0'
                )}
              >
                {children}
                {isEmpty ? (
                  <div className='system-b-shell-dropdown-empty'>
                    {emptyMessage}
                  </div>
                ) : null}
              </div>
            </EntityHoverContext.Provider>
          </FilterContext.Provider>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
      <EntityHoverPortal value={entityCtx} />
    </DropdownMenuPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Filter input — sticky at top, ESC clears, hairline below.
// ---------------------------------------------------------------------------

interface FilterInputProps {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
}

function FilterInput({
  inputRef,
  value,
  onChange,
  placeholder,
}: FilterInputProps) {
  return (
    <div className='system-b-shell-dropdown-filter'>
      <label className='system-b-shell-dropdown-filter-shell'>
        <Search className='h-3 w-3 text-tertiary-token' strokeWidth={2.25} />
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            // Don't let space/letters bubble up to Radix's typeahead — Radix
            // would jump focus to a matching item and steal the keystroke.
            e.stopPropagation();
            if (e.key === 'Escape') {
              if (value) {
                onChange('');
                e.preventDefault();
              }
            }
          }}
          placeholder={placeholder}
          aria-label='Filter dropdown items'
          className='system-b-shell-dropdown-filter-input'
        />
        {value ? (
          <button
            type='button'
            onClick={() => onChange('')}
            aria-label='Clear filter'
            className='system-b-shell-dropdown-filter-clear'
          >
            <X className='h-3 w-3' strokeWidth={2.25} />
          </button>
        ) : null}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header block — avatar / name / email pattern (UserMenu).
// ---------------------------------------------------------------------------

interface HeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly avatar?: ReactNode;
  readonly onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void;
  readonly onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void;
  readonly entity?: EntityPopoverData;
}

function ShellDropdownHeader({ title, subtitle, avatar, entity }: HeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useContext(EntityHoverContext);

  const onEnter = () => {
    if (entity && ref.current) ctx.requestOpen(entity, ref.current);
  };
  const onLeave = () => {
    if (entity) ctx.requestClose();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover is a supplementary preview affordance; the element remains a non-interactive header block (no click target).
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — pointer events feed the entity popover for sighted users; keyboard users get the same reveal via focus on actual menu items.
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className='system-b-shell-dropdown-header'
    >
      {avatar ? <span className='shrink-0'>{avatar}</span> : null}
      <div className='min-w-0 flex-1'>
        <div className='system-b-shell-dropdown-header-title truncate'>
          {title}
        </div>
        {subtitle ? (
          <div className='system-b-shell-dropdown-header-subtitle truncate'>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section label.
// ---------------------------------------------------------------------------

const ShellDropdownLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('system-b-shell-dropdown-label', className)}
    {...props}
  />
));
ShellDropdownLabel.displayName = 'ShellDropdown.Label';

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const ShellDropdownSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('system-b-shell-dropdown-separator', className)}
    {...props}
  />
));
ShellDropdownSeparator.displayName = 'ShellDropdown.Separator';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type LucideLikeIcon = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

interface ItemBaseProps {
  readonly label: string;
  readonly icon?: LucideLikeIcon;
  readonly description?: string;
  readonly shortcut?: string;
  readonly tone?: 'default' | 'danger';
  readonly disabled?: boolean;
  readonly onSelect?: (e: Event) => void;
  readonly trailing?: ReactNode;
}

const ShellDropdownItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ItemBaseProps
>(
  (
    {
      label,
      icon: Icon,
      description,
      shortcut,
      tone = 'default',
      disabled,
      onSelect,
      trailing,
    },
    ref
  ) => {
    const visible = useFilterMatch(label, description);
    if (!visible) return null;
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        disabled={disabled}
        onSelect={onSelect}
        className={cn('group', ROW_BASE, tone === 'danger' && ROW_DANGER)}
      >
        {Icon ? (
          <Icon
            className={cn(
              ICON_CLASSES,
              tone === 'danger' && 'system-b-shell-dropdown-danger-icon'
            )}
            strokeWidth={2.25}
          />
        ) : null}
        <ItemBody label={label} description={description} />
        {trailing}
        {shortcut ? <ShortcutChip>{shortcut}</ShortcutChip> : null}
      </DropdownMenuPrimitive.Item>
    );
  }
);
ShellDropdownItem.displayName = 'ShellDropdown.Item';

function ItemBody({
  label,
  description,
}: {
  readonly label: string;
  readonly description?: string;
}) {
  if (!description) {
    return <span className='flex-1 min-w-0 truncate'>{label}</span>;
  }
  return (
    <span className='flex-1 min-w-0'>
      <span className='block truncate'>{label}</span>
      <span className='system-b-shell-dropdown-item-description'>
        {description}
      </span>
    </span>
  );
}

function ShortcutChip({ children }: { readonly children: ReactNode }) {
  return <kbd className='system-b-shell-dropdown-shortcut'>{children}</kbd>;
}

// ---------------------------------------------------------------------------
// CheckboxItem
// ---------------------------------------------------------------------------

interface CheckboxItemProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (next: boolean) => void;
  readonly description?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

const ShellDropdownCheckboxItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  CheckboxItemProps
>(
  (
    { label, checked, onCheckedChange, description, shortcut, disabled },
    ref
  ) => {
    const visible = useFilterMatch(label, description);
    if (!visible) return null;
    return (
      <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn('group', ROW_BASE, ROW_SELECTED)}
      >
        <span className='system-b-shell-dropdown-checkbox-indicator'>
          <DropdownMenuPrimitive.ItemIndicator>
            <Check
              className='h-3 w-3 text-(--system-b-app-content-surface)'
              strokeWidth={3}
            />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
        <ItemBody label={label} description={description} />
        {shortcut ? <ShortcutChip>{shortcut}</ShortcutChip> : null}
      </DropdownMenuPrimitive.CheckboxItem>
    );
  }
);
ShellDropdownCheckboxItem.displayName = 'ShellDropdown.CheckboxItem';

// ---------------------------------------------------------------------------
// RadioGroup / RadioItem
// ---------------------------------------------------------------------------

const ShellDropdownRadioGroup = DropdownMenuPrimitive.RadioGroup;

interface RadioItemProps {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: LucideLikeIcon;
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

const ShellDropdownRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  RadioItemProps
>(({ value, label, description, icon: Icon, shortcut, disabled }, ref) => {
  const visible = useFilterMatch(label, description);
  if (!visible) return null;
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      value={value}
      disabled={disabled}
      className={cn('group', ROW_BASE, ROW_SELECTED)}
    >
      {Icon ? (
        <Icon className={ICON_CLASSES} strokeWidth={2.25} />
      ) : (
        <span className='h-3.5 w-3.5 shrink-0 grid place-items-center'>
          <DropdownMenuPrimitive.ItemIndicator>
            <Check
              className='h-3 w-3 text-(--system-b-accent-cyan)'
              strokeWidth={3}
            />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
      )}
      <ItemBody label={label} description={description} />
      {shortcut ? <ShortcutChip>{shortcut}</ShortcutChip> : null}
    </DropdownMenuPrimitive.RadioItem>
  );
});
ShellDropdownRadioItem.displayName = 'ShellDropdown.RadioItem';

// ---------------------------------------------------------------------------
// Sub / SubTrigger / SubContent
// ---------------------------------------------------------------------------

const ShellDropdownSub = DropdownMenuPrimitive.Sub;

interface SubTriggerProps {
  readonly label: string;
  readonly icon?: LucideLikeIcon;
  readonly description?: string;
}

const ShellDropdownSubTrigger = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  SubTriggerProps
>(({ label, icon: Icon, description }, ref) => {
  // Submenu triggers stay visible during filtering. The trigger label may
  // not match the query, but its descendants might — hiding the trigger
  // would cut off the only path to those matches. The submenu's own
  // FilterContext gates its inner items independently.
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn('group', ROW_BASE, 'system-b-shell-dropdown-sub-trigger')}
    >
      {Icon ? <Icon className={ICON_CLASSES} strokeWidth={2.25} /> : null}
      <ItemBody label={label} description={description} />
      <ChevronRight
        className='ml-auto h-3 w-3 shrink-0 text-quaternary-token group-data-[highlighted]:text-tertiary-token'
        strokeWidth={2.25}
      />
    </DropdownMenuPrimitive.SubTrigger>
  );
});
ShellDropdownSubTrigger.displayName = 'ShellDropdown.SubTrigger';

interface SubContentProps {
  readonly children: ReactNode;
  readonly width?: number;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
}

function ShellDropdownSubContent({
  children,
  width = 224,
  searchable = false,
  searchPlaceholder = 'Filter…',
  emptyMessage = 'No matches',
}: SubContentProps) {
  // Sub gets its own filter context so the parent's filter doesn't leak.
  const [query, setQuery] = useState('');
  const matchesRef = useRef<Map<string, boolean>>(new Map());
  const [visibleCount, setVisibleCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const scheduleCountUpdate = useCallback(() => {
    requestAnimationFrame(() => {
      let n = 0;
      matchesRef.current.forEach(v => {
        if (v) n += 1;
      });
      setVisibleCount(n);
    });
  }, []);

  const registerMatch = useCallback(
    (id: string, matches: boolean) => {
      matchesRef.current.set(id, matches);
      scheduleCountUpdate();
    },
    [scheduleCountUpdate]
  );

  const filterCtx = useMemo<FilterContextValue>(
    () => ({ query, enabled: searchable, registerMatch, visibleCount }),
    [query, searchable, registerMatch, visibleCount]
  );

  const isEmpty = searchable && query.trim().length > 0 && visibleCount === 0;
  const widthStyle = { ['--w' as string]: `${width}px` } as CSSProperties;

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        sideOffset={6}
        collisionPadding={8}
        style={widthStyle}
        className={SUB_CONTENT_CLASSES}
      >
        <FilterContext.Provider value={filterCtx}>
          {searchable ? (
            <FilterInput
              inputRef={inputRef}
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
            />
          ) : null}
          <div className='system-b-shell-dropdown-scroll'>
            {children}
            {isEmpty ? (
              <div className='system-b-shell-dropdown-empty'>
                {emptyMessage}
              </div>
            ) : null}
          </div>
        </FilterContext.Provider>
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// EntityItem — row that represents an entity. Hovers a popover next to the row.
// ---------------------------------------------------------------------------

interface EntityItemProps {
  readonly entity: EntityPopoverData;
  readonly label?: string;
  readonly secondaryText?: string;
  readonly onSelect?: (e: Event) => void;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly selected?: boolean;
}

const ShellDropdownEntityItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  EntityItemProps
>(
  (
    { entity, label, secondaryText, onSelect, disabled, shortcut, selected },
    _ref
  ) => {
    const localRef = useRef<HTMLDivElement>(null);
    const ctx = useContext(EntityHoverContext);
    const resolvedLabel = label ?? entity.label;
    const resolvedSubtitle = secondaryText ?? formatEntitySubtitle(entity);
    const visible = useFilterMatch(
      resolvedLabel,
      resolvedSubtitle ?? undefined
    );
    if (!visible) return null;

    const onEnter = () => {
      if (localRef.current) ctx.requestOpen(entity, localRef.current);
    };
    const onLeave = () => ctx.requestClose();

    return (
      <DropdownMenuPrimitive.Item
        ref={localRef}
        disabled={disabled}
        onSelect={onSelect}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        data-selected={selected ? '' : undefined}
        className={cn('group', ROW_BASE, selected && 'is-selected')}
      >
        <EntityRowArt entity={entity} />
        <span className='min-w-0 flex-1'>
          <span className='system-b-shell-dropdown-entity-title'>
            {resolvedLabel}
          </span>
          {resolvedSubtitle ? (
            <span className='system-b-shell-dropdown-item-description'>
              {resolvedSubtitle}
            </span>
          ) : null}
        </span>
        {shortcut ? (
          <ShortcutChip>{shortcut}</ShortcutChip>
        ) : (
          <Link2
            className='system-b-shell-dropdown-link-icon'
            strokeWidth={2.25}
            aria-hidden='true'
          />
        )}
      </DropdownMenuPrimitive.Item>
    );
  }
);
ShellDropdownEntityItem.displayName = 'ShellDropdown.EntityItem';

// ---------------------------------------------------------------------------
// Entity hover portal — owns the popover render + pointer-bridge handlers.
// ---------------------------------------------------------------------------

function EntityHoverPortal({
  value,
}: {
  readonly value: EntityHoverContextValue;
}) {
  if (!value.active) return null;
  return (
    <EntityPopover
      entity={value.active.entity}
      anchor={value.active.anchor}
      onPointerEnter={value.cancelClose}
      onPointerLeave={value.requestClose}
      onActivate={value.onEntityActivate}
    />
  );
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const ShellDropdown = Object.assign(ShellDropdownRoot, {
  Header: ShellDropdownHeader,
  Label: ShellDropdownLabel,
  Item: ShellDropdownItem,
  EntityItem: ShellDropdownEntityItem,
  CheckboxItem: ShellDropdownCheckboxItem,
  RadioGroup: ShellDropdownRadioGroup,
  RadioItem: ShellDropdownRadioItem,
  Sub: ShellDropdownSub,
  SubTrigger: ShellDropdownSubTrigger,
  SubContent: ShellDropdownSubContent,
  Separator: ShellDropdownSeparator,
});

export type { EntityPopoverData } from './EntityPopover';

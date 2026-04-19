'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, Circle, Loader2 } from 'lucide-react';
import * as React from 'react';

import {
  CHECKBOX_RADIO_ITEM_BASE,
  MENU_BADGE_BASE,
  MENU_ITEM_DESCRIPTION_BASE,
  MENU_ITEM_DESTRUCTIVE,
  MENU_ITEM_SELECTED,
  MENU_LABEL_BASE,
  MENU_LEADING_SLOT_BASE,
  MENU_SEPARATOR_BASE,
  MENU_SHORTCUT_BASE,
  MENU_TRAILING_SLOT_BASE,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';
import type {
  MenuPrimitiveKind,
  MenuRenderContext,
} from './common-dropdown-renderer';
import type {
  CommonDropdownActionItem,
  CommonDropdownCheckboxItem,
  CommonDropdownItem,
  CommonDropdownRadioGroup,
  CommonDropdownRadioItem,
} from './common-dropdown-types';
import { isLabel } from './common-dropdown-types';

function isObjectLike(value: unknown): value is object {
  return Object(value) === value;
}

function isIconComponent(
  value: unknown
): value is React.ComponentType<{ className?: string }> {
  return (
    typeof value === 'function' || (isObjectLike(value) && '$$typeof' in value)
  );
}

export function renderIcon(
  IconComponent:
    | React.ComponentType<{ className?: string }>
    | React.ReactNode
    | undefined,
  className: string
): React.ReactNode {
  if (!IconComponent) return null;

  if (React.isValidElement<{ className?: string }>(IconComponent)) {
    return React.cloneElement(IconComponent, {
      className: cn(IconComponent.props.className, className),
    });
  }

  if (isIconComponent(IconComponent)) {
    const Comp = IconComponent;
    return <Comp className={className} />;
  }

  return IconComponent;
}

function StructuredMenuLabel({
  label,
  description,
}: {
  readonly label: string;
  readonly description?: string;
}) {
  if (!description) {
    return <span className='min-w-0 flex-1 truncate'>{label}</span>;
  }

  return (
    <span className='flex min-w-0 flex-1 flex-col gap-0.5 text-left'>
      <span className='truncate'>{label}</span>
      <span className={MENU_ITEM_DESCRIPTION_BASE}>{description}</span>
    </span>
  );
}

function renderBadge(
  badge: CommonDropdownActionItem['badge'] | undefined
): React.ReactNode {
  if (!badge) return null;

  return (
    <span
      className={MENU_BADGE_BASE}
      style={
        badge.color
          ? { backgroundColor: badge.color, color: 'white' }
          : undefined
      }
    >
      {badge.text}
    </span>
  );
}

function renderCount(count: number | undefined): React.ReactNode {
  if (count === undefined) return null;
  return <span className={MENU_BADGE_BASE}>{count}</span>;
}

export function renderSeparator(
  item: CommonDropdownItem,
  kind: MenuPrimitiveKind
): React.ReactNode {
  const Separator =
    kind === 'context'
      ? ContextMenuPrimitive.Separator
      : DropdownMenuPrimitive.Separator;

  return (
    <Separator
      key={item.id}
      className={cn(MENU_SEPARATOR_BASE, item.className)}
    />
  );
}

export function renderLabel(
  item: CommonDropdownItem,
  kind: MenuPrimitiveKind
): React.ReactNode {
  if (!isLabel(item)) return null;

  const Label =
    kind === 'context'
      ? ContextMenuPrimitive.Label
      : DropdownMenuPrimitive.Label;

  return (
    <Label
      key={item.id}
      className={cn(MENU_LABEL_BASE, item.inset && 'pl-10', item.className)}
    >
      {item.label}
    </Label>
  );
}

export function renderActionItem(
  item: CommonDropdownActionItem,
  context: MenuRenderContext
): React.ReactNode {
  const MenuItem =
    context.kind === 'context'
      ? ContextMenuPrimitive.Item
      : DropdownMenuPrimitive.Item;
  const isDestructive =
    item.variant === 'destructive' || item.state === 'danger';
  const isSelected = item.selected || item.state === 'active';
  const isDisabled = item.disabled || item.loading;

  return (
    <MenuItem
      key={item.id}
      data-menu-row=''
      data-menu-variant={isDestructive ? 'danger' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      disabled={isDisabled}
      onSelect={event => {
        event.stopPropagation();
        if (item.closeOnSelect === false || item.loading) {
          event.preventDefault();
        }
        if (!isDisabled) {
          item.onClick();
        }
      }}
      className={cn(
        context.itemBase,
        isSelected && MENU_ITEM_SELECTED,
        isDestructive && MENU_ITEM_DESTRUCTIVE,
        item.className
      )}
    >
      <span className={MENU_LEADING_SLOT_BASE}>
        {item.loading ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        ) : (
          renderIcon(item.icon, 'h-4 w-4')
        )}
      </span>
      <StructuredMenuLabel label={item.label} description={item.description} />
      <span className={MENU_TRAILING_SLOT_BASE}>
        {item.trailing}
        {renderBadge(item.badge)}
        {item.subText ? (
          <span className='text-[11px] text-(--linear-text-tertiary)'>
            {item.subText}
          </span>
        ) : null}
        {item.shortcut ? (
          <span className={MENU_SHORTCUT_BASE}>{item.shortcut}</span>
        ) : null}
        {renderIcon(item.iconAfter, 'h-4 w-4')}
        {isSelected &&
        !item.trailing &&
        !item.badge &&
        !item.subText &&
        !item.shortcut &&
        !item.iconAfter ? (
          <Check className='h-4 w-4' />
        ) : null}
      </span>
    </MenuItem>
  );
}

export function renderCheckboxItem(
  item: CommonDropdownCheckboxItem,
  context: MenuRenderContext
): React.ReactNode {
  const CheckboxItem =
    context.kind === 'context'
      ? ContextMenuPrimitive.CheckboxItem
      : DropdownMenuPrimitive.CheckboxItem;
  const ItemIndicator =
    context.kind === 'context'
      ? ContextMenuPrimitive.ItemIndicator
      : DropdownMenuPrimitive.ItemIndicator;
  const isDisabled = item.disabled || item.loading;

  return (
    <CheckboxItem
      key={item.id}
      data-menu-row=''
      checked={item.checked}
      onCheckedChange={checked => item.onCheckedChange(Boolean(checked))}
      onSelect={event => event.preventDefault()}
      disabled={isDisabled}
      className={cn(CHECKBOX_RADIO_ITEM_BASE, 'gap-1.5', item.className)}
    >
      <span className='absolute left-2 flex h-4 w-4 items-center justify-center'>
        <ItemIndicator>
          <Check className='h-4 w-4' />
        </ItemIndicator>
      </span>
      <span className={MENU_LEADING_SLOT_BASE}>
        {item.loading ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        ) : (
          renderIcon(item.icon, 'h-4 w-4')
        )}
      </span>
      <StructuredMenuLabel label={item.label} description={item.description} />
      <span className={MENU_TRAILING_SLOT_BASE}>{renderCount(item.count)}</span>
    </CheckboxItem>
  );
}

export function renderRadioGroup(
  item: CommonDropdownRadioGroup,
  context: MenuRenderContext
): React.ReactNode {
  const RadioGroup =
    context.kind === 'context'
      ? ContextMenuPrimitive.RadioGroup
      : DropdownMenuPrimitive.RadioGroup;

  return (
    <RadioGroup
      key={item.id}
      value={item.value}
      onValueChange={item.onValueChange}
    >
      {item.items.map(radioItem => renderRadioItem(radioItem, context))}
    </RadioGroup>
  );
}

function renderRadioItem(
  item: Omit<CommonDropdownRadioItem, 'type'>,
  context: MenuRenderContext
): React.ReactNode {
  const RadioItem =
    context.kind === 'context'
      ? ContextMenuPrimitive.RadioItem
      : DropdownMenuPrimitive.RadioItem;
  const ItemIndicator =
    context.kind === 'context'
      ? ContextMenuPrimitive.ItemIndicator
      : DropdownMenuPrimitive.ItemIndicator;
  const isDisabled = item.disabled || item.loading;

  return (
    <RadioItem
      key={item.id}
      data-menu-row=''
      value={item.value}
      disabled={isDisabled}
      className={cn(CHECKBOX_RADIO_ITEM_BASE, 'gap-1.5', item.className)}
    >
      <span className='absolute left-2 flex h-4 w-4 items-center justify-center'>
        <ItemIndicator>
          <Circle className='h-2 w-2 fill-current' />
        </ItemIndicator>
      </span>
      <span className={MENU_LEADING_SLOT_BASE}>
        {item.loading ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        ) : (
          renderIcon(item.icon, 'h-4 w-4')
        )}
      </span>
      <StructuredMenuLabel label={item.label} description={item.description} />
      <span className={MENU_TRAILING_SLOT_BASE}>{renderCount(item.count)}</span>
    </RadioItem>
  );
}

'use client';

import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import {
  INSET_PANEL_GRADIENT,
  INSET_PANEL_HEADER,
  INSET_PANEL_ICON_COLUMN,
  INSET_PANEL_LABEL,
  INSET_PANEL_META,
  INSET_PANEL_PROGRESS,
  INSET_PANEL_ROW_INTERACTIVE,
  INSET_PANEL_ROW_LAYOUT,
  INSET_PANEL_SECTION_LABEL,
  INSET_PANEL_SEPARATOR,
  INSET_PANEL_SURFACE,
  INSET_PANEL_TITLE,
  INSET_PANEL_TRAILING,
} from '../lib/inset-panel-styles';
import { cn } from '../lib/utils';
import { ProgressBar } from './progress';

export type InsetPanelTone = 'plain' | 'gradient';

export interface InsetPanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Render as a child element (for example a `section`). */
  readonly asChild?: boolean;
  /** `gradient` adds the subtle token-built ion wash. */
  readonly tone?: InsetPanelTone;
}

/**
 * Inset panel: the menu surface as a static, in-flow panel.
 *
 * Even inset on every side, one icon column, one label edge, right-aligned
 * muted trailing content. Shares its geometry with CommonDropdown so a menu
 * and a panel next to each other line up exactly.
 */
export const InsetPanel = React.forwardRef<HTMLElement, InsetPanelProps>(
  ({ asChild = false, tone = 'plain', className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';
    return (
      <Comp
        {...props}
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot='inset-panel'
        data-tone={tone}
        className={cn(
          INSET_PANEL_SURFACE,
          tone === 'gradient' && INSET_PANEL_GRADIENT,
          className
        )}
      />
    );
  }
);
InsetPanel.displayName = 'InsetPanel';

/** Optional slots keep numeric zero counts while preserving empty values. */
function hasInsetPanelContent(value: React.ReactNode): boolean {
  return value === 0 || Boolean(value);
}

export interface InsetPanelHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: React.ReactNode;
  /** Muted, right-aligned text such as a count ("0 of 6"). */
  readonly meta?: React.ReactNode;
  /** Right-aligned control such as a dismiss button. */
  readonly trailing?: React.ReactNode;
}

export function InsetPanelHeader({
  title,
  meta,
  trailing,
  className,
  ...props
}: InsetPanelHeaderProps) {
  return (
    <div
      {...props}
      data-slot='inset-panel-header'
      className={cn(
        INSET_PANEL_HEADER,
        hasInsetPanelContent(trailing) && 'pe-0.5',
        className
      )}
    >
      <span data-slot='inset-panel-title' className={INSET_PANEL_TITLE}>
        {title}
      </span>
      {hasInsetPanelContent(meta) ? (
        <span data-slot='inset-panel-meta' className={INSET_PANEL_META}>
          {meta}
        </span>
      ) : null}
      {hasInsetPanelContent(trailing) ? (
        <span
          data-slot='inset-panel-header-trailing'
          className='flex shrink-0 items-center'
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export interface InsetPanelRowProps {
  /** Decorative mark for the fixed icon column. Omit to keep the column empty. */
  readonly icon?: React.ReactNode;
  /** Label content. With `asChild`, the single child element becomes the row. */
  readonly children: React.ReactNode;
  /** Right-aligned muted content: shortcut, count or icon. */
  readonly trailing?: React.ReactNode;
  /**
   * Merge the row onto its single child (a link or button) so the row itself
   * is the control. The child's own children become the label.
   */
  readonly asChild?: boolean;
  /**
   * Make the row a native button. The row itself is the control: no nested
   * pill inside the panel.
   */
  readonly onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Disable a button row. */
  readonly disabled?: boolean;
  /** Apply hover and focus states. Defaults to true for controls. */
  readonly interactive?: boolean;
  readonly className?: string;
}

/**
 * One 32px row: icon column, label, trailing slot.
 *
 * Static by default. Pass `onClick` for a button row, or `asChild` with a
 * link, to make the whole row the control without nesting interactive
 * elements.
 */
export function InsetPanelRow({
  icon,
  children,
  trailing,
  asChild = false,
  onClick,
  disabled,
  interactive = asChild || Boolean(onClick),
  className,
}: InsetPanelRowProps) {
  const rowClassName = cn(
    INSET_PANEL_ROW_LAYOUT,
    interactive && INSET_PANEL_ROW_INTERACTIVE,
    className
  );
  const slots = (label: React.ReactNode) => (
    <>
      <span
        aria-hidden='true'
        data-slot='inset-panel-icon'
        className={INSET_PANEL_ICON_COLUMN}
      >
        {icon}
      </span>
      <span data-slot='inset-panel-label' className={INSET_PANEL_LABEL}>
        {label}
      </span>
      {hasInsetPanelContent(trailing) ? (
        <span data-slot='inset-panel-trailing' className={INSET_PANEL_TRAILING}>
          {trailing}
        </span>
      ) : null}
    </>
  );

  if (asChild && React.isValidElement<React.PropsWithChildren>(children)) {
    return (
      <Slot data-slot='inset-panel-row' className={rowClassName}>
        {React.cloneElement(
          children,
          undefined,
          slots(children.props.children)
        )}
      </Slot>
    );
  }

  if (onClick) {
    return (
      <button
        type='button'
        data-slot='inset-panel-row'
        className={rowClassName}
        onClick={onClick}
        disabled={disabled}
      >
        {slots(children)}
      </button>
    );
  }

  return (
    <div data-slot='inset-panel-row' className={rowClassName}>
      {slots(children)}
    </div>
  );
}

export function InsetPanelSectionLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot='inset-panel-section-label'
      className={cn(INSET_PANEL_SECTION_LABEL, className)}
    />
  );
}

export function InsetPanelSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      {...props}
      data-slot='inset-panel-separator'
      className={cn(INSET_PANEL_SEPARATOR, className)}
    />
  );
}

export interface InsetPanelProgressProps {
  /** 0–100. */
  readonly value: number;
  /** Accessible name for the progress bar. */
  readonly label: string;
  readonly className?: string;
}

/** Full-inner-width progress track on the panel gutter. */
export function InsetPanelProgress({
  value,
  label,
  className,
}: InsetPanelProgressProps) {
  return (
    <div
      data-slot='inset-panel-progress'
      className={cn(INSET_PANEL_PROGRESS, className)}
    >
      <ProgressBar value={value} aria-label={label} />
    </div>
  );
}

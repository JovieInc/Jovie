'use client';

import * as React from 'react';
import {
  OVERLAY_COLLISION_PADDING,
  OVERLAY_SIDE_OFFSET,
  submenuViewportFitStyle,
} from '../lib/dropdown-styles';
import { getContentStyle } from './common-dropdown-utils';

interface SubmenuLayout {
  readonly setContentRef: (node: HTMLDivElement | null) => void;
  readonly measureTriggerWidth: () => void;
  readonly placement: {
    sideOffset: number;
    alignOffset: number;
    collisionPadding: number;
  };
  readonly style: React.CSSProperties;
}

/** Radix anchors to the inset row; its offsets must reach the outer surface. */
export function measureSubmenuPlacement(
  trigger: HTMLElement,
  content: HTMLElement
) {
  const parent = trigger.closest<HTMLElement>(
    '[data-slot="common-dropdown-content"], [data-slot="common-dropdown-subcontent"]'
  );
  const triggerBox = trigger.getBoundingClientRect();
  const parentBox = parent?.getBoundingClientRect();
  const opensLeft = content.dataset.side === 'left';
  const parentInset = parentBox
    ? opensLeft
      ? triggerBox.left - parentBox.left
      : parentBox.right - triggerBox.right
    : 0;
  const viewportWidth =
    content.ownerDocument.documentElement.clientWidth ||
    content.ownerDocument.defaultView?.innerWidth ||
    0;
  const usableWidth = Math.max(
    0,
    viewportWidth - 2 * OVERLAY_COLLISION_PADDING
  );
  // Two adjacent surfaces cannot fit on a phone. Keep the submenu readable
  // over its parent instead of reducing action labels to an icon-only sliver.
  const mustOverlap =
    parentBox &&
    usableWidth > 0 &&
    Math.max(
      parentBox.left - OVERLAY_COLLISION_PADDING - OVERLAY_SIDE_OFFSET,
      viewportWidth -
        parentBox.right -
        OVERLAY_COLLISION_PADDING -
        OVERLAY_SIDE_OFFSET
    ) < Math.min(triggerBox.width, usableWidth);
  const sideOffset = mustOverlap
    ? opensLeft
      ? triggerBox.left - parentBox.right
      : parentBox.left - triggerBox.right
    : OVERLAY_SIDE_OFFSET + Math.max(0, parentInset);
  const computed = content.ownerDocument.defaultView?.getComputedStyle(content);
  const topInset =
    (Number.parseFloat(computed?.paddingTop ?? '') || 0) +
    (Number.parseFloat(computed?.borderTopWidth ?? '') || 0);

  return {
    sideOffset,
    alignOffset: -topInset,
  };
}

export function useSubmenuLayout({
  open,
  triggerRef,
  contentRef,
  minWidth,
  maxHeight,
  kind,
}: {
  readonly open: boolean;
  readonly triggerRef: React.RefObject<HTMLDivElement | null>;
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
  readonly minWidth?: number | string;
  readonly maxHeight?: number | string;
  readonly kind: 'dropdown' | 'context';
}): SubmenuLayout {
  const [measuredMinWidth, setMeasuredMinWidth] = React.useState<
    string | undefined
  >();
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const [offsets, setOffsets] = React.useState({
    sideOffset: OVERLAY_SIDE_OFFSET,
    alignOffset: 0,
  });
  // A callback observes the portal's later mount as well as inline submenus.
  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      setContent(node);
    },
    [contentRef]
  );
  const measureTriggerWidth = React.useCallback(() => {
    if (minWidth !== undefined || !triggerRef.current) return;
    const width = Math.round(triggerRef.current.getBoundingClientRect().width);
    setMeasuredMinWidth(width > 0 ? `${width}px` : undefined);
  }, [minWidth, triggerRef]);

  React.useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !content || !trigger) return;

    const update = () => {
      const next = measureSubmenuPlacement(trigger, content);
      setOffsets(previous =>
        previous.sideOffset === next.sideOffset &&
        previous.alignOffset === next.alignOffset
          ? previous
          : next
      );
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(trigger);
    resize.observe(content);
    const parent = trigger.closest<HTMLElement>(
      '[data-slot="common-dropdown-content"], [data-slot="common-dropdown-subcontent"]'
    );
    if (parent) resize.observe(parent);
    const placement = new MutationObserver(update);
    placement.observe(content, {
      attributes: true,
      attributeFilter: ['data-side'],
    });
    const viewport = content.ownerDocument.defaultView;
    viewport?.addEventListener('resize', update);
    return () => {
      resize.disconnect();
      placement.disconnect();
      viewport?.removeEventListener('resize', update);
    };
  }, [content, open, triggerRef]);

  return {
    setContentRef,
    measureTriggerWidth,
    placement: { ...offsets, collisionPadding: OVERLAY_COLLISION_PADDING },
    style: {
      ...getContentStyle(minWidth ?? measuredMinWidth, maxHeight, kind),
      ...submenuViewportFitStyle(
        kind === 'context' ? 'context-menu' : 'dropdown-menu',
        minWidth ?? measuredMinWidth
      ),
    },
  };
}

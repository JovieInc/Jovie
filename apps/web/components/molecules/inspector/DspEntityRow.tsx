'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EntityPopover,
  type EntityPopoverData,
} from '@/components/shell/EntityPopover';
import { DspQuietRow, type DspQuietRowProps } from './DspQuietRow';

export interface DspEntityRowProps extends DspQuietRowProps {
  /** Jovie's own item summary, never purported per-network listing data. */
  readonly entity?: EntityPopoverData;
}

const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 120;

/** App-owned preview composition. Shared marketing rows never import app chrome. */
export function DspEntityRow({
  entity,
  children,
  ...props
}: DspEntityRowProps) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    openTimer.current = undefined;
    closeTimer.current = undefined;
  }, []);
  useEffect(() => cancelTimers, [cancelTimers]);

  const showPreview = useCallback(() => {
    if (!entity || !props.href?.trim()) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    if (openTimer.current !== undefined || previewOpen) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = undefined;
      setPreviewOpen(true);
    }, HOVER_OPEN_MS);
  }, [entity, props.href, previewOpen]);
  const hidePreview = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
    if (closeTimer.current !== undefined || !previewOpen) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      setPreviewOpen(false);
    }, HOVER_CLOSE_MS);
  }, [previewOpen]);

  return (
    <DspQuietRow
      {...props}
      ref={setAnchor}
      data-destination-preview={previewOpen || undefined}
      onPointerEnter={showPreview}
      onPointerLeave={hidePreview}
      onFocusCapture={showPreview}
      onBlurCapture={hidePreview}
    >
      {children}
      {entity && previewOpen ? (
        <EntityPopover
          entity={entity}
          anchor={anchor}
          onPointerEnter={showPreview}
          onPointerLeave={hidePreview}
        />
      ) : null}
    </DspQuietRow>
  );
}

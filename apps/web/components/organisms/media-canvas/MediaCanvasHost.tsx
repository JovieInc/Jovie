'use client';

// @coverage-via apps/web/components/organisms/media-canvas/MediaCanvasViewer.test.tsx

import { useEffect } from 'react';
import { MediaCanvasViewer } from './MediaCanvasViewer';
import {
  closeMediaCanvas,
  setMediaCanvasIndex,
  useMediaCanvasSnapshot,
} from './media-canvas-state';

/** Shell-level host for media lists opened from any client surface. */
export function MediaCanvasHost() {
  const canvas = useMediaCanvasSnapshot();

  useEffect(() => closeMediaCanvas, []);

  return (
    <MediaCanvasViewer
      items={canvas.items}
      index={canvas.index}
      onIndexChange={setMediaCanvasIndex}
      onClose={closeMediaCanvas}
    />
  );
}

import type {
  VisualQaViewport,
  VisualQaViewportSize,
} from '@/lib/visual-qa/types';

export const VISUAL_QA_VIEWPORTS: Record<
  VisualQaViewport,
  VisualQaViewportSize
> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

import type { ComponentProps, ReactNode } from 'react';
import { vi } from 'vitest';
import * as sections from './JovieChatSections';

// Observe the real render body before mounting. The baseline exports a function;
// the optimized version keeps React's real memo object/comparison and spies its type.
export function observeComposerRender() {
  const component: unknown = sections.ChatDraftComposerSurface;
  if (typeof component === 'function') {
    return vi.spyOn(sections, 'ChatDraftComposerSurface');
  }
  if (
    component !== null &&
    typeof component === 'object' &&
    'type' in component &&
    typeof component.type === 'function'
  ) {
    return vi.spyOn(
      component as {
        type: (
          props: ComponentProps<typeof sections.ChatDraftComposerSurface>
        ) => ReactNode;
      },
      'type'
    );
  }
  throw new Error('Expected the actual composer render function or memo type');
}

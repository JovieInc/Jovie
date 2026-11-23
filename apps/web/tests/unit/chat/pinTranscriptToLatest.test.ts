import { describe, expect, it, vi } from 'vitest';

import { pinTranscriptToLatest } from '@/components/jovie/hooks/useStickToBottom';

describe('pinTranscriptToLatest', () => {
  it('prefers the onboarding AuthShell anchor so Reserve/Claim clears top-fade (ONB-27)', () => {
    const container = document.createElement('div');
    const anchor = document.createElement('div');
    anchor.setAttribute('data-onboarding-auth-anchor', '');
    const scrollIntoView = vi.fn();
    anchor.scrollIntoView = scrollIntoView;
    container.appendChild(anchor);
    let scrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      get: () => 2000,
    });

    pinTranscriptToLatest(container);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'auto',
    });
    expect(scrollTop).toBe(0);

    container.replaceChildren();
    pinTranscriptToLatest(container);
    expect(scrollTop).toBe(2000);
  });
});

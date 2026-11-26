import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/hooks/useJovieAuth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useJovieAuth')>()),
  useJovieAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

// Motion props never reach the DOM; the surface keeps its inline geometry.
vi.mock('motion/react', () => {
  function element(tag: string) {
    return function MotionElement({
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: Record<string, unknown>) {
      return createElement(tag, props);
    };
  }
  return {
    motion: new Proxy({}, { get: (_target, tag: string) => element(tag) }),
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

const originalMatchMedia = window.matchMedia;

function narrowViewport() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderHero(value: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  fastRender(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ChatInput
          value={value}
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          isLoading={false}
          isSubmitting={false}
          onFileAttach={vi.fn()}
          variant='hero'
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return screen.getByTestId('chat-composer-surface');
}

describe('ChatInput hero pill in a narrow window (Ovie in the Mac app)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('keeps the empty hero composer a full pill below 900px', () => {
    narrowViewport();
    expect(renderHero('').style.borderRadius).toBe('9999px');
  });

  it('still rounds a multiline draft to the docked radius below 900px', () => {
    narrowViewport();
    expect(renderHero('Line one\nLine two').style.borderRadius).toBe('24px');
  });
});

import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatHomeSurface } from './ChatHomeSurface';
import { resolveChatHomeState, useChatHomeState } from './useChatHomeState';

const draft = (value: string) => ({ getSnapshot: () => value });
const esc = () =>
  act(() => {
    globalThis.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    );
  });

describe('resolveChatHomeState', () => {
  it('thread wins, then composing, else home', () => {
    expect(resolveChatHomeState(true, true)).toBe('thread');
    expect(resolveChatHomeState(true, false)).toBe('thread');
    expect(resolveChatHomeState(false, true)).toBe('composing');
    expect(resolveChatHomeState(false, false)).toBe('home');
  });
});

describe('ChatHomeSurface', () => {
  it('home is visible and reachable', () => {
    render(<ChatHomeSurface state='home'>content</ChatHomeSurface>);
    const surface = screen.getByTestId('chat-home-surface');
    expect(surface).toHaveClass('opacity-100');
    expect(surface).not.toHaveAttribute('aria-hidden');
    expect(surface.hasAttribute('inert')).toBe(false);
  });
  it('composing fades out, stays in the layout, and is inert and hidden from assistive tech', () => {
    render(<ChatHomeSurface state='composing'>content</ChatHomeSurface>);
    const surface = screen.getByTestId('chat-home-surface');
    expect(surface).toHaveClass('opacity-0', 'pointer-events-none');
    expect(surface).toHaveAttribute('aria-hidden', 'true');
    expect(surface.hasAttribute('inert')).toBe(true);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
  it('uses the motion-reduce escape hatch on the fade', () => {
    render(<ChatHomeSurface state='home'>x</ChatHomeSurface>);
    expect(screen.getByTestId('chat-home-surface')).toHaveClass(
      'transition-opacity',
      'motion-reduce:transition-none'
    );
  });
});

describe('useChatHomeState', () => {
  const setup = (over: Partial<Parameters<typeof useChatHomeState>[0]> = {}) =>
    renderHook(
      (props: Parameters<typeof useChatHomeState>[0]) =>
        useChatHomeState(props),
      {
        initialProps: {
          hasThread: false,
          returnable: true,
          chatActive: false,
          draft: draft(''),
          ...over,
        },
      }
    );

  it('a non-returnable home (Jovie) shows the thread whenever there is one, and never takes Esc', () => {
    const { result } = setup({ returnable: false, hasThread: true });
    expect(result.current.showThreadView).toBe(true);
    esc();
    expect(result.current.showThreadView).toBe(true);
  });
  it('a returnable home opens on home even with an existing thread', () => {
    expect(setup({ hasThread: true }).result.current.showThreadView).toBe(
      false
    );
  });
  it('activity opens the thread; goHome and an empty-composer Esc return', () => {
    const { result, rerender } = setup({ hasThread: true });
    rerender({
      hasThread: true,
      returnable: true,
      chatActive: true,
      draft: draft(''),
    });
    expect(result.current.showThreadView).toBe(true);
    rerender({
      hasThread: true,
      returnable: true,
      chatActive: false,
      draft: draft(''),
    });
    esc();
    expect(result.current.showThreadView).toBe(false);
    act(() => result.current.openThread());
    expect(result.current.showThreadView).toBe(true);
    act(() => result.current.goHome());
    expect(result.current.showThreadView).toBe(false);
  });
  it('Esc keeps the thread with a draft, or while a reply streams', () => {
    const { result, rerender } = setup({ hasThread: true });
    act(() => result.current.openThread());
    rerender({
      hasThread: true,
      returnable: true,
      chatActive: false,
      draft: draft('half a thought'),
    });
    esc();
    expect(result.current.showThreadView).toBe(true);
    rerender({
      hasThread: true,
      returnable: true,
      chatActive: true,
      draft: draft(''),
    });
    esc();
    expect(result.current.showThreadView).toBe(true);
  });
  it('claims Esc before Full Screen can: the capture listener stops propagation', () => {
    const { result } = setup({ hasThread: true });
    act(() => result.current.openThread());
    let reached = false;
    const fullscreen = () => {
      reached = true;
    };
    globalThis.addEventListener('keydown', fullscreen);
    esc();
    globalThis.removeEventListener('keydown', fullscreen);
    expect(result.current.showThreadView).toBe(false);
    expect(reached).toBe(false);
  });
});

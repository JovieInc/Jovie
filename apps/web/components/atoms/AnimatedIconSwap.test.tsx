import { render } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AnimatedIconSwap } from './AnimatedIconSwap';

describe('AnimatedIconSwap', () => {
  it('renders the active child on first render', () => {
    const { getByTestId } = render(
      <AnimatedIconSwap activeKey='copy'>
        <svg data-testid='copy-icon' />
      </AnimatedIconSwap>
    );
    expect(getByTestId('copy-icon')).not.toBeNull();
  });

  it('mounts the incoming child when activeKey changes', () => {
    const { rerender, getByTestId } = render(
      <AnimatedIconSwap activeKey='copy'>
        <svg data-testid='copy-icon' />
      </AnimatedIconSwap>
    );

    rerender(
      <AnimatedIconSwap activeKey='check'>
        <svg data-testid='check-icon' />
      </AnimatedIconSwap>
    );

    expect(getByTestId('check-icon')).not.toBeNull();
  });

  it('does not remount the child when activeKey is unchanged', () => {
    const { rerender, getByTestId, queryAllByTestId } = render(
      <AnimatedIconSwap activeKey='copy'>
        <svg data-testid='copy-icon' />
      </AnimatedIconSwap>
    );

    rerender(
      <AnimatedIconSwap activeKey='copy'>
        <svg data-testid='copy-icon' />
      </AnimatedIconSwap>
    );

    expect(getByTestId('copy-icon')).not.toBeNull();
    expect(queryAllByTestId('copy-icon')).toHaveLength(1);
  });

  it('forwards className to the wrapper', () => {
    const { container } = render(
      <AnimatedIconSwap activeKey='copy' className='size-5'>
        <svg data-testid='copy-icon' />
      </AnimatedIconSwap>
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.getAttribute('class')).toContain('size-5');
  });

  it('hydrates cleanly when reduced motion differs from the server default', async () => {
    let reducedMotion = false;
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const element = (
      <AnimatedIconSwap activeKey='menu'>
        <svg data-testid='menu-icon' />
      </AnimatedIconSwap>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    reducedMotion = true;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const root = hydrateRoot(container, element);
    await act(async () => {});

    expect(
      consoleError.mock.calls.some(args =>
        args.some(value => String(value).toLowerCase().includes('hydrat'))
      )
    ).toBe(false);

    root.unmount();
    consoleError.mockRestore();
    window.matchMedia = originalMatchMedia;
  });
});

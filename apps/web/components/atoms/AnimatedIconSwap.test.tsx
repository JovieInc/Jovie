import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('keeps the server and first client render visible before hydrated swaps animate', () => {
    const source = readFileSync(
      resolve(__dirname, './AnimatedIconSwap.tsx'),
      'utf8'
    );

    expect(source).toContain('setHasHydrated(true)');
    expect(source).toContain("initial={hasHydrated ? 'hidden' : false}");
    expect(source).not.toContain("initial='hidden'");
  });
});

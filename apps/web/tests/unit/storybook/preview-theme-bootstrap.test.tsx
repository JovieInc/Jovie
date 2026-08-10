import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import preview from '../../../.storybook/preview';

describe('Storybook preview theme bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the shared preview root script-free and console-clean', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const [decorate] = preview.decorators ?? [];

    expect(decorate).toBeTypeOf('function');
    if (!decorate) throw new Error('Storybook preview decorator is required');

    const { container } = render(
      decorate(
        () => <div data-testid='story-body'>Story body</div>,
        {} as never
      )
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[data-testid="story-body"]')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

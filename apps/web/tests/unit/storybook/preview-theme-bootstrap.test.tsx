import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import preview from '../../../.storybook/preview';

describe('Storybook preview theme bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.style.colorScheme = '';
    globalThis.localStorage.clear();
  });

  it('keeps the shared preview root script-free and console-clean', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const [decorate] = preview.decorators ?? [];

    expect(decorate).toBeTypeOf('function');
    if (!decorate) throw new Error('Storybook preview decorator is required');

    function DecoratedStory() {
      return decorate(
        () => <div data-testid='story-body'>Story body</div>,
        {} as never
      );
    }

    const { container } = render(<DecoratedStory />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[data-testid="story-body"]')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('honors the light story override despite stored dark preference', async () => {
    globalThis.localStorage.setItem('jovie-theme-storybook', 'dark');
    const [decorate] = preview.decorators ?? [];
    if (!decorate) throw new Error('Storybook preview decorator is required');
    function LightStory() {
      return decorate(() => <div>Light story</div>, {
        parameters: { themes: { themeOverride: 'light' } },
      } as never);
    }
    render(<LightStory />);
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
    expect(globalThis.localStorage.getItem('jovie-theme-storybook')).toBe(
      'dark'
    );
  });

  it('keeps ordinary stories dark after leaving a light override', async () => {
    const [decorate] = preview.decorators ?? [];
    if (!decorate) throw new Error('Storybook preview decorator is required');
    function Story({ light }: { light: boolean }) {
      return decorate(() => <div>Story</div>, {
        parameters: light ? { themes: { themeOverride: 'light' } } : {},
      } as never);
    }
    const { rerender } = render(<Story light />);
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    rerender(<Story light={false} />);
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
      expect(document.documentElement).not.toHaveClass('light');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
  });
});

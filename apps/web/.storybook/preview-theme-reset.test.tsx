import type { StoryContext } from '@storybook/nextjs-vite';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { default as preview, resolveStoryTheme } from './preview';

const STORAGE_KEY = 'jovie-theme-storybook';

type StoryInput = {
  parameters?: { themes?: { themeOverride?: string } };
  globals?: Record<string, unknown>;
};

type Decorate = (
  story: () => React.ReactElement,
  context: StoryInput
) => React.ReactElement;

function decorate(): Decorate {
  const exported = preview.decorators;
  const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
  const first = list[0];
  if (!first) throw new Error('preview decorator missing');
  return first as unknown as Decorate;
}

// The decorator runs React hooks (the QueryClient useState), so it can only
// execute during a component render — exactly how Storybook invokes it.
function renderDecorated(context: StoryInput) {
  beforeEachHook()?.(context);
  function Decorated() {
    return decorate()(() => <div>story</div>, context);
  }
  return render(<Decorated />);
}

type ThemeContext = Pick<StoryContext, 'globals' | 'parameters'>;

// resolveStoryTheme takes a Pick over the real StoryContext, so a fixture
// must carry both keys — build it here instead of hand-writing partials.
function themeContext(input: StoryInput = {}): ThemeContext {
  return {
    parameters: input.parameters ?? {},
    globals: input.globals ?? {},
  } as ThemeContext;
}

function beforeEachHook(): ((context: StoryInput) => void) | undefined {
  return preview.beforeEach as unknown as
    | ((context: StoryInput) => void)
    | undefined;
}

describe('preview theme reset', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('light', 'dark');
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    document.documentElement.classList.remove('light', 'dark');
    window.localStorage.removeItem(STORAGE_KEY);
  });

  describe('resolveStoryTheme', () => {
    it('honors parameters.themes.themeOverride over globals', () => {
      expect(
        resolveStoryTheme(
          themeContext({
            parameters: { themes: { themeOverride: 'light' } },
            globals: { themes: { value: 'dark' } },
          })
        )
      ).toBe('light');
    });

    it('reads the themes global value', () => {
      expect(
        resolveStoryTheme(
          themeContext({ globals: { themes: { value: 'light' } } })
        )
      ).toBe('light');
      expect(
        resolveStoryTheme(
          themeContext({ globals: { themes: { value: 'dark' } } })
        )
      ).toBe('dark');
    });

    it('reads a bare theme global', () => {
      expect(
        resolveStoryTheme(themeContext({ globals: { theme: 'light' } }))
      ).toBe('light');
    });

    it('returns undefined when the story requests nothing', () => {
      expect(resolveStoryTheme(themeContext({}))).toBeUndefined();
      expect(resolveStoryTheme(undefined)).toBeUndefined();
      expect(
        resolveStoryTheme(
          themeContext({ globals: { themes: { value: 'system' } } })
        )
      ).toBeUndefined();
    });
  });

  describe('story theme isolation', () => {
    it('does not persist an explicit story theme into the next default story', () => {
      const lightStory = renderDecorated({
        parameters: { themes: { themeOverride: 'light' } },
        globals: {},
      });
      expect(document.documentElement.className).toMatch(/\blight\b/);
      lightStory.unmount();
      renderDecorated({ parameters: {}, globals: {} });
      expect(document.documentElement.className).toMatch(/\bdark\b/);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('renders and retains a harness-seeded theme without a story request', () => {
      seedStorage('light');
      renderDecorated({ parameters: {}, globals: {} });
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('applies an explicit override without replacing the harness seed', () => {
      seedStorage('dark');
      const lightStory = renderDecorated({
        parameters: { themes: { themeOverride: 'light' } },
        globals: {},
      });
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
      lightStory.unmount();
      renderDecorated({ parameters: {}, globals: {} });
      expect(document.documentElement.className).toMatch(/\bdark\b/);
    });
  });

  describe('decorator forcedTheme', () => {
    it('renders a parameters light override as the light class', () => {
      renderDecorated({
        parameters: { themes: { themeOverride: 'light' } },
        globals: {},
      });
      expect(screen.getByText('story')).toBeInTheDocument();
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(document.documentElement.className).not.toMatch(/\bdark\b/);
    });

    it('renders a themes global light request as the light class', () => {
      renderDecorated({
        parameters: {},
        globals: { themes: { value: 'light' } },
      });
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(document.documentElement.className).not.toMatch(/\bdark\b/);
    });

    it('renders an unrequested story with the default theme', () => {
      renderDecorated({ parameters: {}, globals: {} });
      expect(document.documentElement.className).toMatch(/\bdark\b/);
    });
  });
});

function seedStorage(theme: string): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
}

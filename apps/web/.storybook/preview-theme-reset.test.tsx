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
  return preview.decorators![0] as unknown as Decorate;
}

function beforeEachHook(): (context: StoryInput) => void {
  return preview.beforeEach as unknown as (context: StoryInput) => void;
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
        resolveStoryTheme({
          parameters: { themes: { themeOverride: 'light' } },
          globals: { themes: { value: 'dark' } },
        })
      ).toBe('light');
    });

    it('reads the themes global value', () => {
      expect(
        resolveStoryTheme({ globals: { themes: { value: 'light' } } })
      ).toBe('light');
      expect(
        resolveStoryTheme({ globals: { themes: { value: 'dark' } } })
      ).toBe('dark');
    });

    it('reads a bare theme global', () => {
      expect(resolveStoryTheme({ globals: { theme: 'light' } })).toBe('light');
    });

    it('returns undefined when the story requests nothing', () => {
      expect(resolveStoryTheme({})).toBeUndefined();
      expect(resolveStoryTheme(undefined)).toBeUndefined();
      expect(
        resolveStoryTheme({ globals: { themes: { value: 'system' } } })
      ).toBeUndefined();
    });
  });

  describe('preview.beforeEach', () => {
    it('restores a requested theme into storage', () => {
      beforeEachHook()({
        parameters: { themes: { themeOverride: 'light' } },
        globals: {},
      });
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('keeps a harness-seeded theme when the story requests nothing', () => {
      seedStorage('light');
      beforeEachHook()({ parameters: {}, globals: {} });
      // Removing the seed here is what turned every Surface Matrix light
      // variant dark: the ThemeProvider fell back to defaultTheme.
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('overwrites a stale story-toggle choice for a themed story', () => {
      seedStorage('dark');
      beforeEachHook()({
        parameters: { themes: { themeOverride: 'light' } },
        globals: {},
      });
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
    });
  });

  describe('decorator forcedTheme', () => {
    it('renders a parameters light override as the light class', () => {
      render(
        decorate()(() => <div>story</div>, {
          parameters: { themes: { themeOverride: 'light' } },
          globals: {},
        })
      );
      expect(screen.getByText('story')).toBeInTheDocument();
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(document.documentElement.className).not.toMatch(/\bdark\b/);
    });

    it('renders a themes global light request as the light class', () => {
      render(
        decorate()(() => <div>story</div>, {
          parameters: {},
          globals: { themes: { value: 'light' } },
        })
      );
      expect(document.documentElement.className).toMatch(/\blight\b/);
      expect(document.documentElement.className).not.toMatch(/\bdark\b/);
    });

    it('renders an unrequested story with the default theme', () => {
      render(
        decorate()(() => <div>story</div>, { parameters: {}, globals: {} })
      );
      expect(document.documentElement.className).toMatch(/\bdark\b/);
    });
  });
});

function seedStorage(theme: string): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
}

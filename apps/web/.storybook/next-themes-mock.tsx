'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ThemeAttribute = 'class' | `data-${string}`;
type SystemTheme = 'dark' | 'light';

interface ThemeProviderProps {
  readonly children?: ReactNode;
  readonly attribute?: ThemeAttribute | readonly ThemeAttribute[];
  readonly defaultTheme?: string;
  readonly enableColorScheme?: boolean;
  readonly enableSystem?: boolean;
  readonly forcedTheme?: string;
  readonly storageKey?: string;
  readonly themes?: readonly string[];
  readonly value?: Readonly<Record<string, string>>;
}

interface ThemeContextValue {
  readonly forcedTheme?: string;
  readonly resolvedTheme?: string;
  readonly setTheme: Dispatch<SetStateAction<string>>;
  readonly systemTheme?: SystemTheme;
  readonly theme?: string;
  readonly themes: readonly string[];
}

const defaultThemeContext: ThemeContextValue = {
  setTheme: () => undefined,
  themes: [],
};

const DEFAULT_THEMES = ['light', 'dark'] as const;

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): SystemTheme {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function StorybookThemeProvider({
  children,
  attribute = 'data-theme',
  defaultTheme,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  storageKey = 'theme',
  themes = DEFAULT_THEMES,
  value,
}: ThemeProviderProps) {
  const fallbackTheme = defaultTheme ?? (enableSystem ? 'system' : 'light');
  const [theme, setThemeState] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(storageKey) ?? fallbackTheme;
    } catch {
      return fallbackTheme;
    }
  });
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(getSystemTheme);
  const activeTheme = forcedTheme ?? theme;
  const resolvedTheme =
    activeTheme === 'system' ? systemTheme : activeTheme || undefined;

  const setTheme: Dispatch<SetStateAction<string>> = useCallback(
    nextTheme => {
      setThemeState(currentTheme => {
        const resolvedNextTheme =
          typeof nextTheme === 'function' ? nextTheme(currentTheme) : nextTheme;
        try {
          globalThis.localStorage?.setItem(storageKey, resolvedNextTheme);
        } catch {
          // Storage is optional in isolated browser tests.
        }
        return resolvedNextTheme;
      });
    },
    [storageKey]
  );

  useEffect(() => {
    const updateStoredTheme = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemeState(event.newValue ?? fallbackTheme);
      }
    };
    globalThis.addEventListener?.('storage', updateStoredTheme);
    return () => globalThis.removeEventListener?.('storage', updateStoredTheme);
  }, [fallbackTheme, storageKey]);

  useEffect(() => {
    if (!enableSystem || !globalThis.matchMedia) return;

    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => {
      setSystemTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, [enableSystem]);

  useEffect(() => {
    if (!resolvedTheme) return;

    const root = document.documentElement;
    const attributes = Array.isArray(attribute) ? attribute : [attribute];
    const themeValues = themes.map(item => value?.[item] ?? item);
    const resolvedValue = value?.[resolvedTheme] ?? resolvedTheme;

    for (const item of attributes) {
      if (item === 'class') {
        root.classList.remove(...themeValues);
        root.classList.add(resolvedValue);
      } else {
        root.setAttribute(item, resolvedValue);
      }
    }
    if (enableColorScheme && ['dark', 'light'].includes(resolvedTheme)) {
      root.style.colorScheme = resolvedTheme;
    }
  }, [attribute, enableColorScheme, resolvedTheme, themes, value]);

  const context = useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme: enableSystem ? systemTheme : undefined,
      theme,
      themes: enableSystem ? [...themes, 'system'] : themes,
    }),
    [
      enableSystem,
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme,
      theme,
      themes,
    ]
  );

  return (
    <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>
  );
}

export function ThemeProvider(props: ThemeProviderProps) {
  const parent = useContext(ThemeContext);
  return parent ? props.children : <StorybookThemeProvider {...props} />;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? defaultThemeContext;
}

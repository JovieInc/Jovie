export type ThemeValue = 'light' | 'dark' | 'system';

export interface DashboardThemeToggleProps {
  readonly onThemeChange?: (theme: ThemeValue) => void;
  readonly onThemeSave?: (theme: ThemeValue) => Promise<void>;
  readonly showSystemOption?: boolean;
  readonly variant?: 'default' | 'compact';
}

export interface UseDashboardThemeReturn {
  mounted: boolean;
  isUpdating: boolean;
  theme: string | undefined;
  resolvedTheme: string | undefined;
  isDark: boolean;
  handleThemeChange: (newTheme: ThemeValue) => Promise<void>;
}

export interface ThemeOption {
  value: ThemeValue;
  label: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

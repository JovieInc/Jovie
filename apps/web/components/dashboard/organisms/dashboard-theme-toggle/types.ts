export type ThemeValue = 'light' | 'dark' | 'system';

export interface DashboardThemeToggleProps {
  onThemeChange?: (theme: ThemeValue) => void;
  onThemeSave?: (theme: ThemeValue) => Promise<void>;
  showSystemOption?: boolean;
  variant?: 'default' | 'compact';
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
  icon: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

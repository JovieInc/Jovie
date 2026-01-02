export interface ThemeToggleProps {
  appearance?: 'icon' | 'segmented';
  className?: string;
  shortcutKey?: string;
}

export type ThemeValue = 'light' | 'dark' | 'system';

export interface ThemeOption {
  value: ThemeValue;
  label: string;
}

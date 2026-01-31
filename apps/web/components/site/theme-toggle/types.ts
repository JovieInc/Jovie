export interface ThemeToggleProps {
  readonly appearance?: 'icon' | 'segmented';
  readonly className?: string;
  readonly shortcutKey?: string;
}

export type ThemeValue = 'light' | 'dark' | 'system';

export interface ThemeOption {
  value: ThemeValue;
  label: string;
}

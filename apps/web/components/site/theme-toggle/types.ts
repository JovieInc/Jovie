export interface ThemeToggleProps {
  readonly appearance?: 'icon' | 'segmented';
  readonly className?: string;
  readonly shortcutKey?: string;
  readonly variant?: 'default' | 'linear';
}

export type ThemeValue = 'light' | 'dark' | 'system';

export interface ThemeOption {
  value: ThemeValue;
  label: string;
}

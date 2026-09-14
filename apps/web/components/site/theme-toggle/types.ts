export interface ThemeToggleProps {
  readonly appearance?: 'icon' | 'segmented';
  readonly className?: string;
  readonly shortcutKey?: string;
  /** Footer keeps the canonical 44px root and 28px visible control geometry. */
  readonly size?: 'default' | 'footer';
  readonly variant?: 'default' | 'linear';
}

export type ThemeValue = 'light' | 'dark' | 'system';

export interface ThemeOption {
  value: ThemeValue;
  label: string;
}

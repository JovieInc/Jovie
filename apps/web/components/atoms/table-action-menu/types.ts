import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TableActionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon | ReactNode;
  readonly onClick?: () => void;
  readonly variant?: 'default' | 'destructive';
  readonly disabled?: boolean;
  readonly subText?: string;
  /** Nested items rendered as a flyout submenu */
  readonly children?: TableActionMenuItem[];
}

export interface TableActionMenuProps {
  readonly items: TableActionMenuItem[];
  readonly trigger?: 'button' | 'context' | 'custom';
  readonly triggerIcon?: LucideIcon;
  readonly align?: 'start' | 'center' | 'end';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: React.ReactNode;
}

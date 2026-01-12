import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TableActionMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon | ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  subText?: string;
}

export interface TableActionMenuProps {
  items: TableActionMenuItem[];
  trigger?: 'button' | 'context' | 'custom';
  triggerIcon?: LucideIcon;
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

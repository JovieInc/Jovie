import type { LucideIcon } from 'lucide-react';

export interface TableActionMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
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

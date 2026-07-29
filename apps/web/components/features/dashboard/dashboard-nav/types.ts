import type { ComponentType, ReactNode, SVGProps } from 'react';

export interface NavItem {
  name: string;
  href: string;
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Gives the one primary sidebar action the shared elevated row treatment. */
  tone?: 'default' | 'primary';
  description?: string;
  badge?: ReactNode;
  children?: NavItem[];
}

export interface DashboardNavProps {
  readonly collapsed?: boolean;
}

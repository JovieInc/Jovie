import type { ComponentType, SVGProps } from 'react';

export interface NavItem {
  name: string;
  href: string;
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  description?: string;
  children?: NavItem[];
}

export interface DashboardNavProps {
  readonly collapsed?: boolean;
}

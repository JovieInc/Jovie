import { icons, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IconName = keyof typeof icons;

// Normalize various icon naming conventions (kebab-case, underscores, "Icon" suffix)
function resolveIconName(name: string): IconName | undefined {
  const cleaned = name.endsWith('Icon') ? name.slice(0, -4) : name;
  if (cleaned in icons) return cleaned as IconName;

  const pascal = cleaned
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as IconName;

  return pascal in icons ? pascal : undefined;
}

export interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName | string;
}

export function Icon({ name, className, ...props }: IconProps) {
  const iconName = resolveIconName(String(name));
  if (!iconName) return null;
  const LucideIcon = icons[iconName];
  return <LucideIcon className={cn(className)} {...props} />;
}

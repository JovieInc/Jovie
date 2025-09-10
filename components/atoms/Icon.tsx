/* eslint-disable import/namespace */
import { icons, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IconName = keyof typeof icons;

export interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName;
}

export function Icon({ name, className, ...props }: IconProps) {
  const LucideIcon = icons[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={cn(className)} {...props} />;
}

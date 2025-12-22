export const variantClasses = {
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  green: 'bg-green-500/10 border-green-500/20 text-green-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  red: 'bg-red-500/10 border-red-500/20 text-red-400',
  gray: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
} as const;

export const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

export type StatusBadgeVariant = keyof typeof variantClasses;
export type StatusBadgeSize = keyof typeof sizeClasses;

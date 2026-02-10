import {
  Clock,
  DollarSign,
  MapPin,
  Music,
  Share2,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { InsightCategory } from '@/types/insights';

const CATEGORY_CONFIG: Record<
  InsightCategory,
  {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    iconClassName: string;
    chipClassName: string;
  }
> = {
  geographic: {
    icon: MapPin,
    iconClassName: 'text-blue-600 dark:text-blue-400',
    chipClassName: 'bg-blue-500/10 dark:bg-blue-500/15',
  },
  growth: {
    icon: TrendingUp,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    chipClassName: 'bg-emerald-500/10 dark:bg-emerald-500/15',
  },
  content: {
    icon: Music,
    iconClassName: 'text-purple-600 dark:text-purple-400',
    chipClassName: 'bg-purple-500/10 dark:bg-purple-500/15',
  },
  revenue: {
    icon: DollarSign,
    iconClassName: 'text-yellow-600 dark:text-yellow-400',
    chipClassName: 'bg-yellow-500/10 dark:bg-yellow-500/15',
  },
  tour: {
    icon: Ticket,
    iconClassName: 'text-orange-600 dark:text-orange-400',
    chipClassName: 'bg-orange-500/10 dark:bg-orange-500/15',
  },
  platform: {
    icon: Share2,
    iconClassName: 'text-indigo-600 dark:text-indigo-400',
    chipClassName: 'bg-indigo-500/10 dark:bg-indigo-500/15',
  },
  engagement: {
    icon: Users,
    iconClassName: 'text-pink-600 dark:text-pink-400',
    chipClassName: 'bg-pink-500/10 dark:bg-pink-500/15',
  },
  timing: {
    icon: Clock,
    iconClassName: 'text-gray-600 dark:text-gray-400',
    chipClassName: 'bg-gray-500/10 dark:bg-gray-500/15',
  },
};

interface InsightCategoryIconProps {
  readonly category: InsightCategory;
  readonly size?: 'sm' | 'md';
}

export function InsightCategoryIcon({
  category,
  size = 'md',
}: InsightCategoryIconProps) {
  const config = CATEGORY_CONFIG[category];
  const IconComponent = config.icon;
  const chipSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div
      className={`shrink-0 flex ${chipSize} items-center justify-center rounded-lg ${config.chipClassName}`}
    >
      <IconComponent className={`${iconSize} ${config.iconClassName}`} />
    </div>
  );
}

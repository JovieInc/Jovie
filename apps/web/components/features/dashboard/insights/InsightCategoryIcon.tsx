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
import {
  type AccentPaletteName,
  getAccentCssVars,
} from '@/lib/ui/accent-palette';
import type { InsightCategory } from '@/types/insights';

/**
 * Carbon accent assignment per insight category. Categories are categorical
 * (8 distinct variables), so the full palette reads as categories rather than
 * status. `timing` stays neutral (token greyscale) by design.
 */
const CATEGORY_CONFIG: Record<
  InsightCategory,
  {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    accent: AccentPaletteName | null;
  }
> = {
  geographic: { icon: MapPin, accent: 'blue' },
  growth: { icon: TrendingUp, accent: 'green' },
  content: { icon: Music, accent: 'purple' },
  revenue: { icon: DollarSign, accent: 'teal' },
  tour: { icon: Ticket, accent: 'orange' },
  platform: { icon: Share2, accent: 'gray' },
  engagement: { icon: Users, accent: 'pink' },
  timing: { icon: Clock, accent: null },
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

  if (!config.accent) {
    return (
      <div
        className={`shrink-0 flex ${chipSize} items-center justify-center rounded-lg bg-surface-0`}
      >
        <IconComponent className={`${iconSize} text-tertiary-token`} />
      </div>
    );
  }

  const accent = getAccentCssVars(config.accent);

  return (
    <div
      className={`shrink-0 flex ${chipSize} items-center justify-center rounded-lg`}
      style={{ backgroundColor: accent.subtle }}
    >
      <IconComponent className={iconSize} style={{ color: accent.solid }} />
    </div>
  );
}

import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bell,
  Bolt,
  ChartBar,
  Check,
  CheckCircle,
  ChevronRight,
  Copy,
  CreditCard,
  Disc3,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  HandCoins,
  Link,
  Loader2,
  LogOut,
  type LucideIcon,
  type LucideProps,
  MapPin,
  MessageSquare,
  Monitor,
  MousePointerClick,
  Music,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  Trash,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconRegistry = {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bell,
  Bolt,
  ChartBar,
  Check,
  CheckCircle,
  ChevronRight,
  Copy,
  CreditCard,
  Disc3,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  HandCoins,
  Link,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Monitor,
  MousePointerClick,
  Music,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  Trash,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  X,
  XCircle,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

// Normalize various icon naming conventions (kebab-case, underscores, "Icon" suffix)
function resolveIconName(name: string): IconName | undefined {
  const aliasMap: Record<string, string> = {
    MoreHorizontal: 'Ellipsis',
    MoreVertical: 'EllipsisVertical',
  };

  const cleaned = name.endsWith('Icon') ? name.slice(0, -4) : name;

  const aliased = aliasMap[cleaned];
  if (aliased && aliased in iconRegistry) return aliased as IconName;

  if (cleaned in iconRegistry) return cleaned as IconName;

  const pascal = cleaned
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as IconName;

  return pascal in iconRegistry ? pascal : undefined;
}

export interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName | string;
  ariaLabel?: string;
  ariaHidden?: boolean;
}

export function Icon({
  name,
  className,
  ariaLabel,
  ariaHidden,
  ...props
}: IconProps) {
  const iconName = resolveIconName(String(name));
  if (!iconName) return null;

  // Accessibility logic:
  // - If no ariaLabel: always hide from screen readers (ignore ariaHidden prop)
  // - If ariaLabel provided: default to visible, but allow explicit ariaHidden override
  const shouldHide = ariaLabel ? (ariaHidden ?? false) : true;

  // Development warning: ariaHidden=false without ariaLabel is an a11y violation
  if (
    process.env.NODE_ENV === 'development' &&
    ariaHidden === false &&
    !ariaLabel
  ) {
    console.warn(
      'Icon: Setting ariaHidden={false} without providing ariaLabel creates an accessibility violation. ' +
        'Either provide an ariaLabel or remove ariaHidden to allow the default behavior.'
    );
  }

  const LucideIcon = iconRegistry[iconName];
  return (
    <LucideIcon
      className={cn(className)}
      aria-hidden={shouldHide}
      aria-label={ariaLabel}
      {...props}
    />
  );
}

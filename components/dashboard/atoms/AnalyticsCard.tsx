import {
  ChartBarIcon,
  ClockIcon,
  MusicalNoteIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

interface AnalyticsCardProps {
  title: string;
  value: number | string;
  metadata?: string;
  order?: string;
}

const getIcon = (title: string) => {
  const iconProps = { className: 'h-8 w-8 text-accent-token' };

  switch (title) {
    case 'Total Clicks':
      return <ChartBarIcon {...iconProps} />;
    case 'Spotify Clicks':
      return <MusicalNoteIcon {...iconProps} />;
    case 'Social Clicks':
      return <ShareIcon {...iconProps} />;
    case 'Recent Activity':
      return <ClockIcon {...iconProps} />;
    default:
      return <ChartBarIcon {...iconProps} />;
  }
};

export function AnalyticsCard({
  title,
  value,
  metadata,
  order,
}: AnalyticsCardProps) {
  return (
    <div className={order}>
      <div
        className={cn(
          cardTokens.base,
          cardTokens.padding.default,
          cardTokens.shadow.default,
          cardTokens.border.default,
          cardTokens.interactive.hover,
          'group'
        )}
      >
        <div className='flex items-center justify-between mb-3'>
          <div className='flex-1'>
            <p className='text-sm font-medium text-secondary mb-2'>{title}</p>
            <p className='text-2xl font-bold text-primary tracking-tight'>
              {value}
            </p>
            {metadata && (
              <p className='text-xs text-tertiary mt-1'>{metadata}</p>
            )}
          </div>
          <div className='flex-shrink-0 ml-4'>{getIcon(title)}</div>
        </div>
      </div>
    </div>
  );
}

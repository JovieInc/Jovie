import { Badge } from '@jovie/ui';

export interface HudStatusPillProps {
  readonly label: string;
  readonly tone: 'good' | 'warning' | 'bad' | 'neutral';
}

export function HudStatusPill({ label, tone }: Readonly<HudStatusPillProps>) {
  return (
    <Badge variant='outline' size='sm' data-status-tone={tone}>
      {label}
    </Badge>
  );
}

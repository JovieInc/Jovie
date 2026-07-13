import { MarketingFooter } from '@/components/site/MarketingFooter';

interface HomeLegalFooterProps {
  readonly className?: string;
}

export function HomeLegalFooter({ className }: HomeLegalFooterProps) {
  return <MarketingFooter variant='expanded' className={className} />;
}

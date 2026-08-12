import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import type { HomepageLabelPartner } from './home-surface-seed';

interface HomepageLabelLogoMarkProps {
  readonly partner: HomepageLabelPartner;
  readonly className?: string;
}

export function HomepageLabelLogoMark({
  partner,
  className,
}: Readonly<HomepageLabelLogoMarkProps>) {
  return <NormalizedTrustLogo id={partner} className={className} />;
}

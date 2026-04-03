import { cn } from '@/lib/utils';
import type { HomepageLabelPartner } from './home-surface-seed';
import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

interface HomepageLabelLogoMarkProps {
  readonly partner: HomepageLabelPartner;
  readonly className?: string;
}

export function HomepageLabelLogoMark({
  partner,
  className,
}: Readonly<HomepageLabelLogoMarkProps>) {
  switch (partner) {
    case 'awal':
      return <AwalLogo className={cn('h-[15px] w-auto', className)} />;
    case 'orchard':
      return <TheOrchardLogo className={cn('h-[18px] w-auto', className)} />;
    case 'umg':
      return (
        <UniversalMusicGroupLogo className={cn('h-[12px] w-auto', className)} />
      );
    case 'armada':
      return <ArmadaMusicLogo className={cn('h-[14px] w-auto', className)} />;
  }
}

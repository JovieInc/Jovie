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
      return (
        <AwalLogo className={cn('h-[28px] w-auto sm:h-[32px]', className)} />
      );
    case 'orchard':
      return (
        <TheOrchardLogo
          className={cn('h-[32px] w-auto sm:h-[38px]', className)}
        />
      );
    case 'umg':
      return (
        <UniversalMusicGroupLogo
          className={cn('h-[24px] w-auto sm:h-[28px]', className)}
        />
      );
    case 'armada':
      return (
        <ArmadaMusicLogo
          className={cn('h-[26px] w-auto sm:h-[30px]', className)}
        />
      );
  }
}

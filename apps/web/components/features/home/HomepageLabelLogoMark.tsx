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
        <AwalLogo className={cn('h-7 w-auto sm:h-8', className)} />
      );
    case 'orchard':
      return (
        <TheOrchardLogo
          className={cn('h-8 w-auto sm:h-10', className)}
        />
      );
    case 'umg':
      return (
        <UniversalMusicGroupLogo
          className={cn('h-6 w-auto sm:h-7', className)}
        />
      );
    case 'armada':
      return (
        <ArmadaMusicLogo
          className={cn('h-7 w-auto sm:h-8', className)}
        />
      );
  }
}

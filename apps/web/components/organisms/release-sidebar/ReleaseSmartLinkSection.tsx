'use client';

import { Label } from '@jovie/ui';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseSmartLinkSectionProps {
  readonly smartLinkPath: string;
}

export function ReleaseSmartLinkSection({
  smartLinkPath,
}: ReleaseSmartLinkSectionProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;

  return (
    <div className='grid grid-cols-[88px,minmax(0,1fr)] items-center gap-3'>
      <Label className='text-xs font-medium text-secondary-token'>
        Smart link
      </Label>
      <CopyLinkInput url={smartLinkUrl} size='sm' />
    </div>
  );
}

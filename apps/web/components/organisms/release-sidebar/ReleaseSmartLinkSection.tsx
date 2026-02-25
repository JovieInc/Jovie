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
    <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
      <Label className='text-xs text-tertiary-token'>Smart link</Label>
      <CopyLinkInput url={smartLinkUrl} size='sm' />
    </div>
  );
}

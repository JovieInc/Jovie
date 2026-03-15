'use client';

import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseSmartLinkSectionProps {
  readonly smartLinkPath: string;
}

export function ReleaseSmartLinkSection({
  smartLinkPath,
}: ReleaseSmartLinkSectionProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;

  return (
    <CopyableUrlRow
      url={smartLinkUrl}
      displayValue={smartLinkPath}
      size='lg'
      className='border-(--linear-app-frame-seam) bg-(--linear-bg-surface-0)'
      valueClassName='text-(--linear-text-tertiary)'
      copyButtonTitle='Copy link'
      openButtonTitle='Open smart link'
      surface='flat'
    />
  );
}

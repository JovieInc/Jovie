'use client';

import { ShareableLinkRow } from '@/components/molecules/drawer';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseSmartLinkSectionProps {
  readonly smartLinkPath: string;
}

export function ReleaseSmartLinkSection({
  smartLinkPath,
}: ReleaseSmartLinkSectionProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;
  const smartLinkLabel = smartLinkUrl.replace(/^https?:\/\//u, '');

  return (
    <ShareableLinkRow
      url={smartLinkUrl}
      displayValue={smartLinkLabel}
      density='rail'
      onCopy={() => navigator.clipboard.writeText(smartLinkUrl)}
      onOpen={() => {
        globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}

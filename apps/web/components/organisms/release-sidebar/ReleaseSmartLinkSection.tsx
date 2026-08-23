'use client';

// @coverage-via apps/web/tests/unit/constants/smart-link-consumer-contract.test.ts

import { ShareableLinkRow } from '@/components/molecules/drawer';
import { getSmartLinkUrl } from '@/constants/domains';

interface ReleaseSmartLinkSectionProps {
  readonly smartLinkPath: string;
}

export function ReleaseSmartLinkSection({
  smartLinkPath,
}: ReleaseSmartLinkSectionProps) {
  const smartLinkUrl = getSmartLinkUrl(smartLinkPath);
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

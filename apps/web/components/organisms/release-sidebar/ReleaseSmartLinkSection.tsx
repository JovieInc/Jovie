'use client';

import { SmartLinkRow } from '@/components/shell/SmartLinkRow';
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
    <SmartLinkRow
      url={smartLinkLabel}
      onCopy={() => {
        navigator.clipboard?.writeText(smartLinkUrl).catch(() => undefined);
      }}
      onOpen={() => {
        globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}

'use client';

import { ShareableLinkRow } from '@/components/molecules/drawer';

interface CopyableUrlRowProps {
  readonly url: string;
  readonly displayValue?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly valueClassName?: string;
  readonly onCopySuccess?: () => void;
  readonly onCopyError?: () => void;
  readonly copyButtonTitle?: string;
  readonly openButtonTitle?: string;
  readonly testId?: string;
  readonly surface?: 'boxed' | 'flat';
  readonly actionsVisibility?: 'always' | 'hover';
}

export function CopyableUrlRow({
  url,
  displayValue,
  size = 'md',
  className,
  valueClassName,
  onCopySuccess,
  onCopyError,
  copyButtonTitle = 'Copy link',
  openButtonTitle = 'Open link',
  testId,
  surface = 'boxed',
  actionsVisibility = 'always',
}: CopyableUrlRowProps) {
  return (
    <ShareableLinkRow
      url={url}
      displayValue={displayValue}
      density={size === 'sm' ? 'compact' : size === 'md' ? 'rail' : 'table'}
      surface={surface}
      actionsVisibility={actionsVisibility}
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
      copyButtonTitle={copyButtonTitle}
      openButtonTitle={openButtonTitle}
      className={className}
      valueClassName={valueClassName}
      testId={testId}
    />
  );
}

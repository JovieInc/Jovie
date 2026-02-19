'use client';

import { useCallback, useState } from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';

interface CopyableMonospaceValueProps {
  readonly value: string | null | undefined;
  readonly label: string;
  readonly maxWidth?: number;
  readonly className?: string;
}

export function CopyableMonospaceValue({
  value,
  label,
  maxWidth,
  className,
}: CopyableMonospaceValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <CopyableMonospaceCell
      value={value}
      label={label}
      maxWidth={maxWidth}
      className={className}
      copied={copied}
      onCopy={handleCopy}
    />
  );
}

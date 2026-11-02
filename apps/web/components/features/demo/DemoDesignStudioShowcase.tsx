'use client';
// @coverage-via apps/web/components/features/demo/DemoShowcaseSurface.lazy.test.tsx

import { getDesignStudioItem } from '@/lib/design-studio/registry';

export function DemoDesignStudioShowcase({
  itemId,
  testId,
}: Readonly<{
  itemId: string;
  testId: string;
}>) {
  const item = getDesignStudioItem(itemId);

  if (!item) {
    throw new Error(`Missing Design Studio item: ${itemId}`);
  }

  return (
    <div className='min-h-screen bg-surface-1 p-4 sm:p-6' data-testid={testId}>
      {item.preview()}
    </div>
  );
}

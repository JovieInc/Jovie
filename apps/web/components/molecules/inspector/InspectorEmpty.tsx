'use client';

import { DrawerInlineNote } from '@/components/molecules/drawer/DrawerInlineNote';

export interface InspectorEmptyProps {
  readonly message: string;
  readonly testId?: string;
}

export function InspectorEmpty({ message, testId }: InspectorEmptyProps) {
  return (
    <DrawerInlineNote
      message={message}
      testId={testId ?? 'inspector-empty'}
      className='min-h-16 px-1 py-2'
    />
  );
}

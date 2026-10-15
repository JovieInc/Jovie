'use client';

import { Button } from '@jovie/ui';
import { Download, Printer } from 'lucide-react';
import { APP_NAME } from '@/constants/app';

export interface DocToolbarProps {
  readonly pdfTitle: string;
}

export function DocToolbar({ pdfTitle }: DocToolbarProps) {
  const handlePrint = () => {
    globalThis.print?.();
  };

  const handleDownloadPdf = () => {
    const previousTitle = document.title;
    document.title = `${pdfTitle} | ${APP_NAME}`;

    globalThis.addEventListener(
      'afterprint',
      () => {
        document.title = previousTitle;
      },
      { once: true }
    );

    globalThis.print?.();
  };

  return (
    <div
      data-doc-toolbar
      className='inline-flex items-center overflow-hidden rounded-lg border border-subtle bg-surface-0'
    >
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handlePrint}
        className='rounded-none border-0 px-3 text-primary-token hover:bg-surface-1 hover:text-primary-token'
      >
        <span className='inline-flex items-center gap-2'>
          <Printer className='h-4 w-4' />
          Print
        </span>
      </Button>
      <div className='h-8 w-px bg-border-subtle' />
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handleDownloadPdf}
        className='rounded-none border-0 px-3 text-primary-token hover:bg-surface-1 hover:text-primary-token'
      >
        <span className='inline-flex items-center gap-2'>
          <Download className='h-4 w-4' />
          Download PDF
        </span>
      </Button>
    </div>
  );
}

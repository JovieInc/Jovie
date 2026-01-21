'use client';

import { Button } from '@jovie/ui';
import { Download, Printer } from 'lucide-react';
import { APP_NAME } from '@/constants/app';

export interface DocToolbarProps {
  pdfTitle: string;
}

export function DocToolbar({ pdfTitle }: DocToolbarProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const previousTitle = document.title;
    const nextTitle = `${pdfTitle} | ${APP_NAME}`;
    document.title = nextTitle;

    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);

    window.print();

    setTimeout(() => {
      restoreTitle();
    }, 2000);
  };

  return (
    <div
      data-doc-toolbar
      className='inline-flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-black/30 dark:shadow-none'
    >
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handlePrint}
        className='rounded-none border-0 px-3 text-neutral-900 hover:bg-gray-50 hover:text-neutral-900 dark:text-neutral-100 dark:hover:bg-white/10 dark:hover:text-white'
      >
        <span className='inline-flex items-center gap-2'>
          <Printer className='h-4 w-4' />
          Print
        </span>
      </Button>
      <div className='h-8 w-px bg-neutral-200 dark:bg-white/10' />
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handleDownloadPdf}
        className='rounded-none border-0 px-3 text-neutral-900 hover:bg-gray-50 hover:text-neutral-900 dark:text-neutral-100 dark:hover:bg-white/10 dark:hover:text-white'
      >
        <span className='inline-flex items-center gap-2'>
          <Download className='h-4 w-4' />
          Download PDF
        </span>
      </Button>
    </div>
  );
}

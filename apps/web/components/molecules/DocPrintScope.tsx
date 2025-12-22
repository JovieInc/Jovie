'use client';

import { useEffect } from 'react';

export function DocPrintScope() {
  useEffect(() => {
    document.documentElement.dataset.docPage = 'true';
    return () => {
      delete document.documentElement.dataset.docPage;
    };
  }, []);

  return null;
}

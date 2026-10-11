'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function ContactSupportLink() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearchQuery(params.get('q') ?? '');
  }, []);

  const params = new URLSearchParams();
  params.set('from', pathname ?? '/');
  if (searchQuery) params.set('q', searchQuery);

  return <a href={`/contact?${params.toString()}`}>Contact support</a>;
}

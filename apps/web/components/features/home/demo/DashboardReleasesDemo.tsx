'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DEMO_PROVIDER_CONFIG,
  DEMO_RELEASE_VIEW_MODELS,
} from '@/components/features/demo/mock-release-data';
import { ReleaseTable } from '@/features/dashboard/organisms/release-provider-matrix/ReleaseTable';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

async function copyDemoLink(path: string, label: string): Promise<string> {
  const origin = globalThis.location?.origin ?? 'https://jov.ie';
  const absoluteUrl = new URL(path, `${origin}/`).toString();
  try {
    await navigator.clipboard.writeText(absoluteUrl);
    toast.success(`${label} copied (demo)`);
  } catch {
    toast.error('Unable to copy link in demo mode');
  }
  return absoluteUrl;
}

function noop() {}

/**
 * Marketing hero: renders the real ReleaseTable with demo data so every UX
 * change to the live dashboard flows through here automatically.
 */
export function DashboardReleasesDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className='overflow-hidden rounded-lg border border-subtle bg-surface-0 transition-[opacity,transform] duration-500'
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <ReleaseTable
        releases={DEMO_RELEASE_VIEW_MODELS}
        providerConfig={DEMO_PROVIDER_CONFIG}
        artistName={INTERNAL_DJ_DEMO_PERSONA.profile.displayName}
        onCopy={copyDemoLink}
        onEdit={noop}
      />
    </div>
  );
}

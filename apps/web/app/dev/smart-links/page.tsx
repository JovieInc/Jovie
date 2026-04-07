import { notFound } from 'next/navigation';
import { DevSmartLinkPreview } from './DevSmartLinkPreview';

export default function DevSmartLinksPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <DevSmartLinkPreview />;
}

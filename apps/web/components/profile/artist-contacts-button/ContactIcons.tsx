import {
  EnvelopeIcon,
  IdentificationIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline';
import type { PublicContactChannel } from '@/types/contacts';

export function ContactGlyph() {
  return <IdentificationIcon aria-hidden='true' className='h-4 w-4' />;
}

export function ChannelIcon({ type }: { type: PublicContactChannel['type'] }) {
  if (type === 'phone') {
    return <PhoneIcon aria-hidden='true' className='h-4 w-4' />;
  }

  return <EnvelopeIcon aria-hidden='true' className='h-4 w-4' />;
}

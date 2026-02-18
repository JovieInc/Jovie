import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';

export const WRAP = 'mx-auto max-w-[1100px] px-6';

export const LOGOS = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'Tidal',
  'Amazon Music',
  'Deezer',
  'SoundCloud',
  'Audiomack',
];

export { AuthRedirectHandler };

export function MockBar({ url }: Readonly<{ url: string }>) {
  return (
    <div
      className='flex items-center gap-2 px-4 py-3'
      style={{
        borderBottom: '1px solid var(--linear-border-subtle)',
        fontSize: '0.75rem',
        color: 'var(--linear-text-tertiary)',
      }}
    >
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <span className='ml-2'>{url}</span>
    </div>
  );
}

export function Divider() {
  return (
    <div
      className='my-0'
      style={{
        height: '1px',
        background: 'var(--linear-border-subtle)',
      }}
    />
  );
}

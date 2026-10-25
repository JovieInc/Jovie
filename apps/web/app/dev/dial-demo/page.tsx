import { DialDemo } from '@/features/release/DialDemo';

/**
 * Development-only harness for the landing-page dial demo: the dial sits well
 * below the fold so the scroll reveal, lazy mount and layout stability can be
 * exercised and recorded.
 */
export default function DevDialDemoPage() {
  return (
    <main className='mx-auto w-full max-w-md px-4'>
      <div className='h-[130vh] pt-24 text-center text-sm text-secondary-token'>
        Scroll down to the dial.
      </div>
      <DialDemo />
      <div className='h-[80vh]' />
    </main>
  );
}

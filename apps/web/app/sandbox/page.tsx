import { Button, Input } from '@jovie/ui';

export default function SandboxPage() {
  return (
    <main className='mx-auto max-w-2xl space-y-8 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-bold'>UI Sandbox</h1>
        <p className='text-gray-600 dark:text-gray-300'>
          Preview core interface elements without signing in.
        </p>
      </header>

      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Buttons</h2>
        <div className='flex flex-wrap gap-4'>
          <Button>Primary</Button>
          <Button variant='secondary'>Secondary</Button>
          <Button variant='ghost'>Ghost</Button>
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Inputs</h2>
        <div className='space-y-2'>
          <Input placeholder='Placeholder' />
          <Input type='password' placeholder='Password' />
        </div>
      </section>
    </main>
  );
}

import { Button } from '@jovie/ui';

export function DesktopAuthHeading({ copy }: { readonly copy: string }) {
  return (
    <header className='flex min-h-16 flex-col items-center justify-start gap-2'>
      <h1 className='text-lg font-medium tracking-tight text-primary-token'>
        Finish Signing In
      </h1>
      <p className='max-w-80 text-sm leading-5 text-secondary-token'>{copy}</p>
    </header>
  );
}

export function DesktopAuthCancelButton({
  onCancel,
}: {
  readonly onCancel: () => void;
}) {
  return (
    <Button
      type='button'
      variant='link'
      size='sm'
      className='mt-3'
      data-auth-action='cancel'
      onClick={onCancel}
    >
      Cancel Sign-in
    </Button>
  );
}

export function DesktopAuthStatus({
  id,
  text,
}: {
  readonly id: string;
  readonly text: string | null;
}) {
  return (
    <p
      id={id}
      aria-live='polite'
      role='status'
      className='mt-4 min-h-10 text-xs leading-5 text-tertiary-token'
    >
      {text}
    </p>
  );
}

import { Button } from '@jovie/ui';

export function DesktopAuthLargeActionStackRedFixture() {
  return (
    <div
      data-deliberate-red='desktop-auth-large-action-stack'
      data-testid='desktop-auth-hierarchy-red'
    >
      <div data-desktop-auth-state='opened'>
        <Button data-auth-action='primary' variant='primary'>
          Open Browser Again
        </Button>
        <Button data-auth-action='copy' variant='secondary'>
          Copy Sign-in Link
        </Button>
        <Button data-auth-action='cancel' variant='secondary'>
          Cancel Sign-in
        </Button>
        <Button data-auth-action='code' variant='link'>
          Enter A Code
        </Button>
        <Button data-auth-action='qr' variant='link'>
          Scan With Phone
        </Button>
      </div>
    </div>
  );
}

export function DesktopAuthFocusedHierarchyGreenFixture() {
  return (
    <div
      data-neighboring-green='desktop-auth-focused-hierarchy'
      data-testid='desktop-auth-hierarchy-green'
    >
      <h1>Finish Signing In</h1>
      <p>Continue in your browser, then return to Jovie.</p>
      <div data-desktop-auth-state='opened'>
        <Button data-auth-action='primary' variant='primary' className='w-full'>
          Open Browser Again
        </Button>
        <Button data-auth-action='options' variant='link' aria-expanded='false'>
          Other Sign-in Options
        </Button>
        <Button data-auth-action='cancel' variant='link'>
          Cancel Sign-in
        </Button>
      </div>
    </div>
  );
}

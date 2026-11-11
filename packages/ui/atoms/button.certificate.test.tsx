import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { Button } from './button';

describe('Button accessibility', () => {
  it('has no axe violations across idle, loading, error, denied and RTL states', async () => {
    const { container } = render(
      <div>
        <Button>Save release</Button>
        <Button loading>Saving</Button>
        <Button
          pendingPresentation='morph'
          actionState='error'
          stateLabels={{ error: 'Could not save.', retry: 'Retry save' }}
        >
          Save release
        </Button>
        <Button disabled aria-describedby='denied-note'>
          Publish release
        </Button>
        <p id='denied-note'>Only label admins can publish releases.</p>
        <div dir='rtl'>
          <Button variant='secondary'>رجوع إلى جميع الإصدارات</Button>
        </div>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});

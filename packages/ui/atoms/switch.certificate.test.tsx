import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { Switch } from './switch';

describe('Switch certificate evidence', () => {
  it('has no axe violations across off, on, invalid, and disabled states', async () => {
    const { container } = render(
      <div>
        <Switch id='sw-a11y-off' />
        <label htmlFor='sw-a11y-off'>Notifications</label>
        <Switch id='sw-a11y-on' defaultChecked />
        <label htmlFor='sw-a11y-on'>Weekly digest</label>
        <Switch
          id='sw-a11y-invalid'
          aria-invalid='true'
          aria-describedby='sw-a11y-error'
        />
        <label htmlFor='sw-a11y-invalid'>Accept the distribution terms</label>
        <p id='sw-a11y-error'>Turn this on to publish the release.</p>
        <Switch id='sw-a11y-disabled' disabled />
        <label htmlFor='sw-a11y-disabled'>Unavailable</label>
      </div>
    );
    await expectNoA11yViolations(container);

    fireEvent.click(screen.getByRole('switch', { name: 'Notifications' }));
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeChecked();
    await expectNoA11yViolations(container);
  });
});

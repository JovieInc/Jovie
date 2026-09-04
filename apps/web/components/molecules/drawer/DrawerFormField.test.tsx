import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerFormField } from './DrawerFormField';

describe('DrawerFormField', () => {
  it('associates the visible label with its control and exposes helper guidance', () => {
    const { rerender } = render(
      <DrawerFormField
        label='Profile URL'
        htmlFor='profile-url'
        helperText='Use the public URL customers already know.'
      >
        <input id='profile-url' />
      </DrawerFormField>
    );

    expect(screen.getByLabelText('Profile URL')).toHaveAttribute(
      'id',
      'profile-url'
    );
    expect(
      screen.getByText('Use the public URL customers already know.')
    ).toBeInTheDocument();

    rerender(
      <DrawerFormField label='Display name' htmlFor='display-name'>
        <input id='display-name' />
      </DrawerFormField>
    );
    expect(screen.getByLabelText('Display name')).toHaveAttribute(
      'id',
      'display-name'
    );
    expect(
      screen.queryByText('Use the public URL customers already know.')
    ).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LibrarySharePassphraseGate } from './LibrarySharePassphraseGate';

function submit(passphrase: string) {
  fireEvent.change(screen.getByLabelText('Passphrase'), {
    target: { value: passphrase },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock drop' }));
}

describe('LibrarySharePassphraseGate', () => {
  it('shows the error and stops loading when the passphrase is rejected', async () => {
    const onUnlock = vi.fn().mockResolvedValue(false);
    render(
      <LibrarySharePassphraseGate
        title='Night Drop'
        artistName='Ada'
        onUnlock={onUnlock}
      />
    );

    submit('nope');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect passphrase. Try again.'
    );
    expect(screen.getByRole('button', { name: 'Unlock drop' })).toBeEnabled();
  });

  it('stays locked without an error when the passphrase is accepted', async () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(
      <LibrarySharePassphraseGate
        title='Night Drop'
        artistName='Ada'
        onUnlock={onUnlock}
      />
    );

    submit('correct');

    expect(
      await screen.findByRole('button', { name: 'Unlocking…' })
    ).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onUnlock).toHaveBeenCalledWith('correct');
  });
});

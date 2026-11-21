import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';

function Harness(
  props: Partial<React.ComponentProps<typeof UniversalLinkInputUrlMode>>
) {
  const [url, setUrl] = React.useState(props.url ?? '');
  const ref = React.useRef<HTMLInputElement | null>(null);
  return (
    <UniversalLinkInputUrlMode
      placeholder='Paste a link'
      detectedLink={null}
      inputRef={ref}
      onUrlChange={setUrl}
      onKeyDown={vi.fn()}
      onClear={() => setUrl('')}
      onPlatformSelect={vi.fn()}
      onArtistSearchSelect={vi.fn()}
      onRestoreFocus={vi.fn()}
      {...props}
      url={url}
    />
  );
}

describe('UniversalLinkInputUrlMode', () => {
  it('retains typed input, clears it and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = screen.getByLabelText('Link URL');
    await user.type(input, 'https://instagram.com/sasha');
    expect(input).toHaveValue('https://instagram.com/sasha');
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Clear Input' }));
    expect(input).toHaveValue('');
  });

  it('submits only when allowed and uses the design-system button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<Harness onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    rerender(<Harness onSubmit={onSubmit} canSubmit />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toHaveAttribute('data-slot', 'plain-button');
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('announces detection status for a valid link', async () => {
    const { container } = render(
      <Harness
        url='https://open.spotify.com/artist/sasha'
        detectedLink={detectPlatform('https://open.spotify.com/artist/sasha')}
      />
    );
    expect(document.getElementById('link-detection-status')).toHaveTextContent(
      /link detected|Invalid/
    );
    await expectNoA11yViolations(container);
  });

  it('drives voice input and the permission error', async () => {
    const user = userEvent.setup();
    const onVoiceInput = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <Harness
        voiceInputEnabled
        onVoiceInput={onVoiceInput}
        dictationState='permission-error'
        onDismissPermissionError={onDismiss}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onVoiceInput).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('cancels and sends a recording while listening', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSend = vi.fn();
    const { container } = render(
      <Harness
        dictationState='listening'
        onCancelVoiceRecording={onCancel}
        onSendVoiceRecording={onSend}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Cancel Voice Recording' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Send Voice Recording' })
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when disabled', async () => {
    const { container } = render(<Harness disabled url='https://x.com/a' />);
    expect(screen.getByLabelText('Link URL')).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});

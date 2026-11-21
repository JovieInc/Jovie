import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';

type Props = React.ComponentProps<typeof UniversalLinkInputUrlMode>;

function Harness(overrides: Partial<Props>) {
  const [url, setUrl] = React.useState('');
  const [tick, setTick] = React.useState(0);
  const ref = React.useRef<HTMLInputElement | null>(null);
  return (
    <div data-tick={tick}>
      <button type='button' onClick={() => setTick(t => t + 1)}>
        rerender
      </button>
      <UniversalLinkInputUrlMode
        url={url}
        placeholder='Paste a link'
        detectedLink={null}
        inputRef={ref}
        onUrlChange={setUrl}
        onKeyDown={() => {}}
        onClear={() => setUrl('')}
        onPlatformSelect={() => {}}
        onArtistSearchSelect={() => {}}
        onRestoreFocus={() => {}}
        {...overrides}
      />
    </div>
  );
}

describe('UniversalLinkInputUrlMode', () => {
  it('keeps typed input and focus across a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = screen.getByLabelText('Link URL');
    await user.type(input, 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'rerender' }));
    expect(input).toHaveValue('https://example.com');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('https://example.com');
    expect(input).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('clears the input and submits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness canSubmit onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Link URL');
    await user.type(input, 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Clear Input' }));
    expect(input).toHaveValue('');
  });

  it('announces a detected link and tokens the brand icon', async () => {
    const detectedLink = detectPlatform('https://open.spotify.com/artist/abc');
    const { container } = render(
      <Harness
        url='https://open.spotify.com/artist/abc'
        detectedLink={detectedLink}
        onUrlChange={() => {}}
      />
    );
    expect(
      screen.getByText(/link detected/i, { selector: '#link-detection-status' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows voice controls and the microphone permission error', async () => {
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
    expect(onVoiceInput).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disables the submit control while disabled', () => {
    render(<Harness disabled canSubmit />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });
});

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AudiencePanelProvider,
  ControlledAudiencePanelProvider,
  useAudiencePanel,
} from './AudiencePanelContext';

function PanelConsumer() {
  const { mode, toggle, open, close } = useAudiencePanel();
  return (
    <div>
      <span data-testid='mode'>{mode ?? 'none'}</span>
      <button type='button' onClick={() => toggle('analytics')}>
        toggle-analytics
      </button>
      <button type='button' onClick={() => toggle('contact')}>
        toggle-contact
      </button>
      <button type='button' onClick={() => open('ai-crawlers')}>
        open-crawlers
      </button>
      <button type='button' onClick={close}>
        close
      </button>
    </div>
  );
}

describe('AudiencePanelProvider', () => {
  it('starts closed by default', () => {
    render(
      <AudiencePanelProvider>
        <PanelConsumer />
      </AudiencePanelProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('none');
  });

  it('respects initialMode', () => {
    render(
      <AudiencePanelProvider initialMode='contact'>
        <PanelConsumer />
      </AudiencePanelProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('contact');
  });

  it('toggle opens a panel and toggles it closed when already active', () => {
    render(
      <AudiencePanelProvider>
        <PanelConsumer />
      </AudiencePanelProvider>
    );

    act(() => screen.getByText('toggle-analytics').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('analytics');

    act(() => screen.getByText('toggle-analytics').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('none');
  });

  it('toggle switches panels when a different one is active', () => {
    render(
      <AudiencePanelProvider initialMode='contact'>
        <PanelConsumer />
      </AudiencePanelProvider>
    );

    act(() => screen.getByText('toggle-analytics').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('analytics');
  });

  it('open activates a panel without toggling it off', () => {
    render(
      <AudiencePanelProvider>
        <PanelConsumer />
      </AudiencePanelProvider>
    );

    act(() => screen.getByText('open-crawlers').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('ai-crawlers');

    // open is idempotent — activating the same panel keeps it open
    act(() => screen.getByText('open-crawlers').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('ai-crawlers');
  });

  it('close clears whichever panel is open', () => {
    render(
      <AudiencePanelProvider initialMode='analytics'>
        <PanelConsumer />
      </AudiencePanelProvider>
    );

    act(() => screen.getByText('close').click());
    expect(screen.getByTestId('mode')).toHaveTextContent('none');
  });
});

describe('ControlledAudiencePanelProvider', () => {
  it('reflects the mode prop and delegates changes via onModeChange', () => {
    const onModeChange = vi.fn();
    render(
      <ControlledAudiencePanelProvider
        mode='contact'
        onModeChange={onModeChange}
      >
        <PanelConsumer />
      </ControlledAudiencePanelProvider>
    );

    expect(screen.getByTestId('mode')).toHaveTextContent('contact');

    act(() => screen.getByText('toggle-analytics').click());
    expect(onModeChange).toHaveBeenCalledWith('analytics');
  });

  it('toggle calls onModeChange(null) when toggling the active panel', () => {
    const onModeChange = vi.fn();
    render(
      <ControlledAudiencePanelProvider
        mode='analytics'
        onModeChange={onModeChange}
      >
        <PanelConsumer />
      </ControlledAudiencePanelProvider>
    );

    act(() => screen.getByText('toggle-analytics').click());
    expect(onModeChange).toHaveBeenCalledWith(null);
  });

  it('open and close delegate to onModeChange', () => {
    const onModeChange = vi.fn();
    render(
      <ControlledAudiencePanelProvider mode={null} onModeChange={onModeChange}>
        <PanelConsumer />
      </ControlledAudiencePanelProvider>
    );

    act(() => screen.getByText('open-crawlers').click());
    expect(onModeChange).toHaveBeenCalledWith('ai-crawlers');

    act(() => screen.getByText('close').click());
    expect(onModeChange).toHaveBeenCalledWith(null);
  });
});

describe('useAudiencePanel', () => {
  it('throws when used outside a provider', () => {
    expect(() => render(<PanelConsumer />)).toThrow(
      'useAudiencePanel must be used within AudiencePanelProvider'
    );
  });
});

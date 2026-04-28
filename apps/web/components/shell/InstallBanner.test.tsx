import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './InstallBanner';

describe('InstallBanner', () => {
  it('renders default copy when no overrides are passed', () => {
    render(<InstallBanner open onDismiss={() => undefined} />);
    expect(screen.getByText('Get Jovie for desktop')).toBeInTheDocument();
    expect(
      screen.getByText('Push-to-talk in any app, native shortcuts.')
    ).toBeInTheDocument();
    expect(screen.getByText('Install')).toBeInTheDocument();
  });

  it('renders the title / description / cta props', () => {
    render(
      <InstallBanner
        open
        onDismiss={() => undefined}
        title='Try voice mode'
        description='Hold ⌘J to talk to Jovie.'
        ctaLabel='Enable'
      />
    );
    expect(screen.getByText('Try voice mode')).toBeInTheDocument();
    expect(screen.getByText('Hold ⌘J to talk to Jovie.')).toBeInTheDocument();
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('hides via aria-hidden when open is false', () => {
    const { container } = render(
      <InstallBanner open={false} onDismiss={() => undefined} />
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('fires onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<InstallBanner open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss prompt'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('fires onCta when the primary button is clicked', () => {
    const onCta = vi.fn();
    render(<InstallBanner open onDismiss={() => undefined} onCta={onCta} />);
    fireEvent.click(screen.getByText('Install'));
    expect(onCta).toHaveBeenCalledOnce();
  });
});

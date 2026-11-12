import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InstallBanner } from './InstallBanner';

describe('InstallBanner', () => {
  it('renders default copy when no overrides are passed', async () => {
    const { container } = render(
      <InstallBanner open onDismiss={() => undefined} />
    );
    expect(screen.getByText('Get Jovie for desktop')).toBeInTheDocument();
    expect(
      screen.getByText('Push-to-talk in any app, native shortcuts.')
    ).toBeInTheDocument();
    expect(screen.getByText('Install')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the title / description / cta props', async () => {
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });

  it('hides via aria-hidden when open is false', async () => {
    const { container } = render(
      <InstallBanner open={false} onDismiss={() => undefined} />
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('fires onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<InstallBanner open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss Prompt'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('fires onCta when the primary button is clicked', () => {
    const onCta = vi.fn();
    render(<InstallBanner open onDismiss={() => undefined} onCta={onCta} />);
    fireEvent.click(screen.getByText('Install'));
    expect(onCta).toHaveBeenCalledOnce();
  });

  it('supports disabling the primary action', async () => {
    const onCta = vi.fn();
    const { container } = render(
      <InstallBanner
        open
        onDismiss={() => undefined}
        onCta={onCta}
        ctaDisabled
      />
    );
    fireEvent.click(screen.getByText('Install'));
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    expect(onCta).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders a partial prompt without the CTA icon', async () => {
    const onCta = vi.fn();
    const { container } = render(
      <InstallBanner
        open
        onDismiss={() => undefined}
        onCta={onCta}
        title='Claim your handle'
        ctaLabel='Claim'
        ctaIcon={null}
      />
    );
    const cta = screen.getByRole('button', { name: 'Claim' });
    expect(cta.querySelector('svg')).toBeNull();
    fireEvent.click(cta);
    expect(onCta).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy readable', async () => {
    const title =
      'Get Jovie for desktop on macOS, Windows and Linux workstations';
    const description =
      'Push-to-talk in any app, native keyboard shortcuts, offline drafts and a menu bar player that keeps your release previews one click away.';
    const { container } = render(
      <InstallBanner
        open
        onDismiss={() => undefined}
        title={title}
        description={description}
        ctaLabel='Install the desktop app'
      />
    );
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Install the desktop app' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('dismisses in a right-to-left layout', async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InstallBanner
          open
          onDismiss={onDismiss}
          title='احصل على Jovie لسطح المكتب'
          description='التحدث بالضغط في أي تطبيق، واختصارات أصلية.'
          ctaLabel='تثبيت'
        />
      </div>
    );
    expect(screen.getByText('احصل على Jovie لسطح المكتب')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Dismiss Prompt'));
    expect(onDismiss).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(
      resolve(__dirname, './InstallBanner.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/--linear-app-/);
  });
});

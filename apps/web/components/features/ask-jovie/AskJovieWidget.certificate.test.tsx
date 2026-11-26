import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AskJovieWidget } from './AskJovieWidget';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

window.HTMLElement.prototype.scrollTo = vi.fn();

function renderWidget(artistName = 'Test Artist') {
  return render(<AskJovieWidget username='test' artistName={artistName} />);
}

async function openWidget(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Ask Jovie about/ }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AskJovieWidget certificate', () => {
  it('keeps the typed question and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender, container } = renderWidget();
    await openWidget(user);
    const composer = screen.getByPlaceholderText('Ask about Test Artist…');
    await user.type(composer, 'When is the next show');
    rerender(<AskJovieWidget username='test' artistName='Test Artist' />);
    expect(screen.getByPlaceholderText('Ask about Test Artist…')).toHaveValue(
      'When is the next show'
    );
    expect(screen.getByPlaceholderText('Ask about Test Artist…')).toHaveFocus();
    await user.tab();
    expect(screen.getByPlaceholderText('Ask about Test Artist…')).toHaveValue(
      'When is the next show'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps typed escalation fields across a rerender', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ answered: false }))
    );
    const { rerender, container } = renderWidget();
    await openWidget(user);
    await user.type(
      screen.getByPlaceholderText('Ask about Test Artist…'),
      'What is on the rider?{Enter}'
    );
    await user.click(
      await screen.findByRole('button', { name: 'Send to Test Artist' })
    );
    const name = screen.getByPlaceholderText('Name (optional)');
    const email = screen.getByPlaceholderText('Email (optional, for a reply)');
    await user.type(name, 'Pat');
    await user.type(email, 'pat@example.com');
    rerender(<AskJovieWidget username='test' artistName='Test Artist' />);
    expect(screen.getByPlaceholderText('Name (optional)')).toHaveValue('Pat');
    expect(
      screen.getByPlaceholderText('Email (optional, for a reply)')
    ).toHaveValue('pat@example.com');
    await user.tab();
    expect(screen.getByPlaceholderText('Name (optional)')).toHaveValue('Pat');
    await expectNoA11yViolations(container);
  });

  it('answers with an apology and stays axe-clean when the request fails offline', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const { container } = renderWidget();
    await openWidget(user);
    await user.type(
      screen.getByPlaceholderText('Ask about Test Artist…'),
      'Hello{Enter}'
    );
    expect(
      await screen.findByText(/Something went wrong on my end/)
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('disables sending while an answer is loading', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const { container } = renderWidget();
    await openWidget(user);
    await user.type(
      screen.getByPlaceholderText('Ask about Test Artist…'),
      'Hello{Enter}'
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left copy and an opened empty conversation axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderWidget('فرقة منتصف الليل');
    await openWidget(user);
    expect(
      screen.getByPlaceholderText('Ask about فرقة منتصف الليل…')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

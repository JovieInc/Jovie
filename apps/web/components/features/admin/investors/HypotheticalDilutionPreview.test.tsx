import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HypotheticalDilutionPreview } from './HypotheticalDilutionPreview';

function openPreview() {
  const rendered = render(<HypotheticalDilutionPreview />);
  fireEvent.click(
    screen.getByText(/Hypothetical Dilution/, { selector: 'h2' })
  );
  return rendered;
}

function loadExample() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Load Synthetic Example' })
  );
}

function change(name: string, value: string) {
  const control = screen.getByLabelText(name);
  if (control.getAttribute('role') === 'combobox') {
    fireEvent.keyDown(control, { key: 'Enter' });
    const options: Record<string, string> = {
      safe: 'SAFE / Convertible Note (Unsupported)',
      mixed: 'Mixed / Other Terms (Unsupported)',
      'pre-money': 'Pre-money',
      'post-money': 'Post-money (Full Scenario)',
    };
    fireEvent.click(screen.getByRole('option', { name: options[value] }));
  } else {
    fireEvent.change(control, { target: { value } });
  }
}

describe('HypotheticalDilutionPreview', () => {
  it('starts collapsed with no financing defaults or persistence', () => {
    const { container } = render(<HypotheticalDilutionPreview />);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    for (const input of container.querySelectorAll('input[type="text"]')) {
      expect(input).toHaveValue('');
    }
    expect(container.querySelector('form')).toBeNull();
    expect(container.firstElementChild).toHaveClass(
      'sentry-block',
      'ph-no-capture'
    );
  });

  it('renders labeled synthetic before/after economic ownership', () => {
    openPreview();
    loadExample();
    expect(screen.getByRole('status')).toHaveTextContent('Synthetic example');
    expect(screen.getByText('72%')).toBeVisible();
    expect(screen.getByText('65.45%')).toBeVisible();
    expect(screen.getByText('57.6%')).toBeVisible();
    expect(screen.getByText('$800,000.00 new cash')).toBeVisible();
    expect(screen.getByText('$2,000,000.00 new cash')).toBeVisible();
    expect(screen.getByText(/does not determine voting control/)).toBeVisible();
  });

  it('requires explicit supported assumptions for entered scenarios', () => {
    openPreview();
    change('Ownership Before (%)', '72');
    change('Valuation (USD)', '8000000');
    change('Committed, Unissued Cash (USD)', '800000');
    change('Proposed Cash (USD)', '1200000');
    expect(screen.queryByText('57.6%')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Confirm the assumptions'
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('57.6%')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByText('57.6%')).toBeNull();
  });

  it('holds the share price fixed for a full-scenario post-money input', () => {
    openPreview();
    loadExample();
    change('Valuation Basis', 'post-money');
    change('Valuation (USD)', '10000000');
    expect(screen.getByText('65.45%')).toBeVisible();
    expect(screen.getByText('57.6%')).toBeVisible();
    change('Proposed Cash (USD)', '0');
    // Same full post-money input with less new cash implies a different pre-money.
    expect(screen.getAllByText('66.24%')).toHaveLength(2);
  });

  it.each(['safe', 'mixed'])(
    'shows unsupported %s terms without a priced-round result',
    instrument => {
      openPreview();
      loadExample();
      change('Instrument', instrument);
      expect(screen.getByRole('status')).toHaveTextContent('Unsupported terms');
      expect(screen.queryByText('57.6%')).toBeNull();
      expect(screen.getByLabelText('Valuation (USD)')).toHaveValue('8000000');
    }
  );

  it.each([
    '',
    '-1',
    '1e3',
    '0x10',
    '12.345',
    '1,000',
    'Infinity',
    '9007199254740992',
  ])(
    'rejects invalid monetary text %s without showing a stale result',
    value => {
      openPreview();
      loadExample();
      change('Valuation (USD)', value);
      const valuation = screen.getByLabelText('Valuation (USD)');
      expect(valuation).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Check the highlighted inputs'
      );
      expect(screen.queryByText('57.6%')).toBeNull();
    }
  );

  it('preserves cents and rejects a post-money valuation at or below new cash', () => {
    openPreview();
    loadExample();
    change('Valuation (USD)', '1000.01');
    change('Committed, Unissued Cash (USD)', '0.01');
    change('Proposed Cash (USD)', '0.02');
    expect(screen.getByText('$0.03 new cash')).toBeVisible();
    change('Valuation Basis', 'post-money');
    change('Valuation (USD)', '0.03');
    expect(screen.getByLabelText('Valuation (USD)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Must exceed all new cash'
    );
    change('Valuation (USD)', '0.04');
    expect(screen.getByText('18%')).toBeVisible();
  });

  it('validates ownership and overflow instead of inventing a baseline', () => {
    openPreview();
    loadExample();
    change('Ownership Before (%)', '101');
    expect(screen.getByLabelText('Ownership Before (%)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    change('Ownership Before (%)', '0');
    expect(screen.getAllByText('0%')).toHaveLength(3);
    change('Valuation (USD)', '90071992547409.91');
    expect(screen.getByLabelText('Valuation (USD)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Maximum is $1 trillion.'
    );
  });

  it.each([
    'Valuation (USD)',
    'Committed, Unissued Cash (USD)',
    'Proposed Cash (USD)',
  ])('explains oversized monetary text in %s', field => {
    openPreview();
    loadExample();
    for (const value of ['9007199254740992', '9'.repeat(400)]) {
      change(field, value);
      expect(screen.getByLabelText(field)).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Maximum is $1 trillion.'
      );
      expect(screen.queryByText('57.6%')).toBeNull();
    }
  });

  it('clears inputs and assumptions while retaining the open disclosure', () => {
    const { container, unmount } = openPreview();
    loadExample();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Scenario' }));
    expect(screen.getByLabelText('Ownership Before (%)')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByText('57.6%')).toBeNull();
    expect(container.querySelector('details')).toHaveAttribute('open');
    unmount();
    openPreview();
    expect(screen.getByLabelText('Valuation (USD)')).toHaveValue('');
  });

  it('keeps scenario values out of native form payloads, storage, and requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { container } = render(
      <form>
        <HypotheticalDilutionPreview />
      </form>
    );
    fireEvent.click(
      screen.getByText(/Hypothetical Dilution/, { selector: 'h2' })
    );
    loadExample();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (!form) throw new Error('Missing synthetic form fixture');
    expect([...new FormData(form).entries()]).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    storageSpy.mockRestore();
  });

  it('rejects cent-unsafe display magnitudes and preserves cents at the preview limit', () => {
    openPreview();
    loadExample();
    change('Valuation (USD)', '1');
    change('Committed, Unissued Cash (USD)', '80000000000000.01');
    change('Proposed Cash (USD)', '0');
    expect(
      screen.getByLabelText('Committed, Unissued Cash (USD)')
    ).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Maximum is $1 trillion.'
    );
    expect(screen.queryByText('$80,000,000,000,000.02 new cash')).toBeNull();
    change('Committed, Unissued Cash (USD)', '999999999999.99');
    change('Proposed Cash (USD)', '999999999999.99');
    expect(screen.getByText('$1,999,999,999,999.98 new cash')).toBeVisible();
    change('Committed, Unissued Cash (USD)', '1000000000000.01');
    expect(
      screen.getByLabelText('Committed, Unissued Cash (USD)')
    ).toHaveAttribute('aria-invalid', 'true');
  });
});

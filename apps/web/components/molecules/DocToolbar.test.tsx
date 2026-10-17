import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME } from '@/constants/app';
import { DocToolbar } from './DocToolbar';

describe('DocToolbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the document without changing its title', () => {
    document.title = 'Reading a policy';
    const print = vi.spyOn(globalThis, 'print').mockImplementation(() => {});
    render(<DocToolbar pdfTitle='Privacy policy' />);

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe('Reading a policy');
  });

  it('uses the PDF title while printing and restores the reading title afterward', () => {
    document.title = 'Reading a policy';
    const print = vi.spyOn(globalThis, 'print').mockImplementation(() => {
      expect(document.title).toBe(`Privacy policy | ${APP_NAME}`);
    });
    render(<DocToolbar pdfTitle='Privacy policy' />);

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(print).toHaveBeenCalledOnce();
    globalThis.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Reading a policy');

    document.title = 'Another document';
    globalThis.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Another document');
  });
});

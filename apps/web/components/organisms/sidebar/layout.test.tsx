import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarContent, SidebarHeader, SidebarInput } from './layout';

function Layout({ label }: { readonly label: string }) {
  return (
    <>
      <SidebarHeader>
        <SidebarInput aria-label='Search sidebar' />
      </SidebarHeader>
      <SidebarContent>{label}</SidebarContent>
    </>
  );
}

describe('sidebar layout', () => {
  it('retains typed input and focus through a parent update', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Layout label='Before' />);
    const input = screen.getByRole('textbox', { name: 'Search sidebar' });
    await user.type(input, 'artist');
    rerender(<Layout label='After' />);
    expect(input).toHaveValue('artist');
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('artist');
    expect(input).toHaveFocus();
    expect(screen.getByText('After')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
  it('retains input in a right-to-left layout', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <Layout label='المحتوى' />
      </div>
    );
    const input = screen.getByRole('textbox', { name: 'Search sidebar' });
    await user.type(input, 'artist');
    expect(input).toHaveValue('artist');
    expect(screen.getByText('المحتوى')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
